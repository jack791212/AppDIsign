"use strict";
// 系統層：存檔、裝備生成、數值聚合、世界、戰鬥特效、掉落
(function () {
  const G = window.G;

  // ---------- 工具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  G.util = { rand, randInt, dist, clamp, pick, chance };

  let UID = 1;

  // ================= 存檔 =================
  const SAVE_KEY = "archlike_save_v1";
  G.newSave = function () {
    return {
      v: 1, level: 1, xp: 0, gold: 0, talentPts: 0,
      talents: {}, // nodeId -> rank
      equipped: { weapon: null, armor: null, helmet: null, ring: null },
      bag: [], area: "town",
      killedBoss: {},
    };
  };
  G.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { G.save = JSON.parse(raw); return true; }
    } catch (e) {}
    G.save = G.newSave();
    return false;
  };
  G.persist = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) {}
  };
  G.wipeSave = function () {
    G.save = G.newSave(); G.persist();
  };

  // ================= 裝備生成 =================
  function affixPoolForSlot(slot) {
    const pool = [];
    for (const k in G.AFFIXES) if (G.AFFIXES[k].slots.includes(slot)) pool.push(G.AFFIXES[k]);
    return pool;
  }
  function rollRarity(luckBonus) {
    let entries = G.RARITY_ORDER.map(id => [id, G.RARITY[id].weight]);
    // luckBonus 提升高階權重
    if (luckBonus) {
      entries = entries.map(([id, w]) => [id, id === "common" ? Math.max(5, w - luckBonus) : w + luckBonus * 0.4]);
    }
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = Math.random() * total;
    for (const [id, w] of entries) { if ((r -= w) <= 0) return id; }
    return "common";
  }
  // ilvl 影響數值上限；forceRarity 指定稀有度
  G.rollItem = function (ilvl, slot, forceRarity, luckBonus) {
    slot = slot || pick(G.SLOTS);
    const rarity = forceRarity || rollRarity(luckBonus || 0);
    const base = pick(G.ITEM_BASES[slot]);
    const [amin, amax] = G.RARITY[rarity].affixes;
    const nAff = randInt(amin, amax);
    let pool = affixPoolForSlot(slot).slice();
    // 非遠程武器不會出現投射物專屬詞條（多重箭、穿透）
    if (slot === "weapon" && base.wtype) {
      const wt = G.WEAPON_TYPES[base.wtype];
      if (wt.cls !== "ranged") pool = pool.filter(a => a.id !== "multishot" && a.id !== "pierce");
    }
    const affixes = [];
    for (let i = 0; i < nAff && pool.length; i++) {
      const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      let v = randInt(a.roll[0], a.roll[1]);
      // 數值詞條隨 ilvl 微幅成長
      if (a.kind === "stat" && a.stat !== "projectiles" && a.stat !== "pierce") {
        v += Math.floor(ilvl * 0.6);
      }
      affixes.push({ id: a.id, value: v, proc: a.kind === "proc" });
    }
    // 傳奇：附加一個專屬特效
    if (rarity === "legend") {
      const keys = Object.keys(G.LEGEND_AFFIXES);
      const la = G.LEGEND_AFFIXES[pick(keys)];
      affixes.push({ id: la.id, value: la.roll[0], proc: true, legend: true });
    }
    return { uid: UID++, slot, baseName: base.n, ic: base.ic, wtype: base.wtype, rarity, ilvl, affixes };
  };
  G.affixText = function (af) {
    const def = af.legend ? G.LEGEND_AFFIXES[af.id] : G.AFFIXES[af.id];
    return { text: def.fmt(af.value), proc: def.kind === "proc", legend: !!af.legend };
  };
  G.itemName = function (item) {
    const r = G.RARITY[item.rarity];
    return item.baseName;
  };
  // 簡易品質評分（用於背包排序/比較提示）
  G.itemScore = function (item) {
    if (!item) return 0;
    let s = G.RARITY_ORDER.indexOf(item.rarity) * 100;
    for (const af of item.affixes) s += af.value;
    return s;
  };

  // ================= 數值聚合 =================
  // 把 等級 + 已裝備詞條 + 天賦 全部算進 G.player 的有效數值
  G.computeStats = function () {
    const s = G.save, p = G.player;
    const lv = s.level;
    // 等級基礎成長
    let maxHp = 100 + (lv - 1) * 12;
    let dmg = 10 + (lv - 1) * 2.2;
    let atkSpdPct = 0, dmgPct = 0, critPct = 5, critDmgPct = 50, movePct = 0;
    let projectiles = 1, pierce = 0, armorFlat = 0, hpFlat = 0;
    const procs = { chain: 0, critboom: 0, lifesteal: 0, frost: 0, burn: 0, thorns: 0, regen: 0, storm: 0, killHeal: 0 };

    function addStat(stat, v) {
      switch (stat) {
        case "dmgPct": dmgPct += v; break;
        case "atkSpdPct": atkSpdPct += v; break;
        case "hp": hpFlat += v; break;
        case "critPct": critPct += v; break;
        case "critDmgPct": critDmgPct += v; break;
        case "movePct": movePct += v; break;
        case "projectiles": projectiles += v; break;
        case "pierce": pierce += v; break;
        case "armorFlat": armorFlat += v; break;
      }
    }

    // 裝備詞條
    for (const slot of G.SLOTS) {
      const it = s.equipped[slot];
      if (!it) continue;
      for (const af of it.affixes) {
        if (af.legend) {
          // 傳奇專屬特效
          if (af.id === "storm") procs.storm = 1;
          else if (af.id === "vampire") { procs.lifesteal += 12; procs.killHeal = 5; }
          else if (af.id === "glass") { dmgPct += 60; maxHp *= 0.75; }
          else if (af.id === "twin") { projectiles += 2; atkSpdPct -= 15; }
          continue;
        }
        const def = G.AFFIXES[af.id];
        if (def.kind === "stat") addStat(def.stat, af.value);
        else procs[af.id] = (procs[af.id] || 0) + af.value;
      }
    }
    // 天賦
    for (const branch in G.TALENTS) {
      for (const node of G.TALENTS[branch].nodes) {
        const rank = s.talents[node.id] || 0;
        if (!rank) continue;
        const total = node.per * rank;
        if (node.stat) addStat(node.stat, total);
        else if (node.proc) procs[node.proc] = (procs[node.proc] || 0) + total;
      }
    }

    // 武器類型：決定攻擊方式與倍率
    const wpn = s.equipped.weapon;
    const wt = (wpn && wpn.wtype && G.WEAPON_TYPES[wpn.wtype]) ? wpn.wtype : "bow";
    const WT = G.WEAPON_TYPES[wt];
    p.weaponType = wt;
    p.weaponClass = WT.cls;
    p.weapon = WT;

    // 結算有效數值
    maxHp = Math.round(maxHp + hpFlat);
    p.maxHp = maxHp;
    p.dmg = dmg * WT.dmgMul * (1 + dmgPct / 100);
    p.fireInterval = Math.max(0.1, 0.6 / WT.spdMul / (1 + atkSpdPct / 100));
    p.moveSpeed = 200 * (1 + movePct / 100);
    p.crit = critPct + (WT.critAdd || 0);
    p.critDmg = critDmgPct;
    p.projectiles = Math.round(projectiles);
    p.pierce = Math.round(pierce);
    p.armor = armorFlat;
    p.procs = procs;
    p.bulletSpeed = 560;
    if (p.hp === undefined || p.hp > p.maxHp) p.hp = p.maxHp;
    // 切換成非召喚武器時清除既有召喚物
    if (G.world && G.world.minions && WT.cls !== "summon") G.world.minions.length = 0;
  };

  // ================= 玩家 =================
  G.player = { x: 0, y: 0, r: 16, hp: 100, invuln: 0, cooldown: 0, stormCd: 0, regenAcc: 0, facing: 0, moving: false };

  G.healPlayer = function (amt) {
    const p = G.player;
    p.hp = Math.min(p.maxHp, p.hp + amt);
  };

  // ================= 等級 / 經驗 =================
  G.xpForLevel = (lv) => Math.floor(18 * Math.pow(lv, 1.55)) + 12;
  G.gainXp = function (n) {
    const s = G.save;
    s.xp += n;
    let leveled = false;
    while (s.xp >= G.xpForLevel(s.level)) {
      s.xp -= G.xpForLevel(s.level);
      s.level++; s.talentPts++; leveled = true;
    }
    if (leveled) {
      const prevMax = G.player.maxHp;
      G.computeStats();
      G.player.hp += (G.player.maxHp - prevMax); // 升級補上限差額
      G.player.hp = Math.min(G.player.hp, G.player.maxHp);
      G.toast("⬆️ 升級！等級 " + s.level + "（+1 天賦點）");
      G.persist();
      if (G.refreshHud) G.refreshHud();
    }
  };

  // ================= 世界 / 區域 =================
  G.world = { areaId: null, area: null, enemies: [], bullets: [], foeShots: [], particles: [], grounds: [], floats: [], swings: [], minions: [], cam: { x: 0, y: 0 }, spawnTimer: 0, summonTimer: 0, bossSpawned: false, boss: null, time: 0 };

  G.enterArea = function (areaId, entryPortalFrom) {
    const w = G.world;
    const area = G.AREAS[areaId];
    w.areaId = areaId; w.area = area;
    w.enemies = []; w.bullets = []; w.foeShots = []; w.particles = []; w.grounds = []; w.floats = [];
    w.swings = []; w.minions = []; w.summonTimer = 1;
    w.spawnTimer = 1; w.bossSpawned = false; w.boss = null; w.time = 0;
    G.save.area = areaId; G.persist();
    // 玩家出生點：優先放在「返回來源」的傳送門附近，否則地圖底部中央
    let sx = area.w / 2, sy = area.h - 160;
    if (entryPortalFrom) {
      const ret = area.portals.find(pt => pt.to === entryPortalFrom);
      if (ret) { sx = ret.x; sy = ret.y + 70; }
    }
    G.player.x = clamp(sx, 40, area.w - 40);
    G.player.y = clamp(sy, 40, area.h - 40);
    if (!area.safe) {
      // 預先生成幾隻
      for (let i = 0; i < Math.min(4, area.maxAlive); i++) spawnEnemy(true);
    }
    if (G.refreshHud) G.refreshHud();
  };

  function spawnEnemy(initial) {
    const w = G.world, area = w.area;
    if (area.safe) return;
    let x, y, tries = 0;
    do {
      x = rand(60, area.w - 60); y = rand(60, area.h - 60); tries++;
    } while (dist(x, y, G.player.x, G.player.y) < 280 && tries < 20);
    const typeId = pick(area.enemies);
    const t = G.ENEMIES[typeId];
    const lvScale = 1 + area.level * 0.18;
    w.enemies.push({
      typeId, name: t.name, x, y, r: t.r, color: t.color,
      hp: Math.round(t.hp * lvScale), maxHp: Math.round(t.hp * lvScale),
      dmg: Math.round(t.dmg * (1 + area.level * 0.12)), speed: t.speed,
      baseSpeed: t.speed, xp: Math.round(t.xp * lvScale), gold: t.gold,
      behavior: t.behavior, fireCd: rand(1.2, 2.6), touchCd: 0, hitFlash: 0,
      slowT: 0, slowPct: 0, burnT: 0, burnDps: 0, boss: false,
      cast: null, castCd: rand(0.6, 1.6), dashT: 0, dvx: 0, dvy: 0,
    });
  }
  G.spawnEnemy = spawnEnemy;

  function spawnBoss() {
    const w = G.world, area = w.area;
    if (!area.boss || w.bossSpawned) return;
    if (G.save.killedBoss[area.boss]) return;
    const t = G.BOSSES[area.boss];
    const lvScale = 1 + area.level * 0.1;
    const b = {
      typeId: area.boss, name: t.name, x: area.bossAt.x, y: area.bossAt.y, r: t.r, color: t.color,
      hp: Math.round(t.hp * lvScale), maxHp: Math.round(t.hp * lvScale),
      dmg: t.dmg, speed: t.speed, baseSpeed: t.speed, xp: t.xp, gold: t.gold,
      behavior: "boss", fireCd: 2, touchCd: 0, hitFlash: 0, slowT: 0, slowPct: 0, burnT: 0, burnDps: 0, boss: true,
    };
    w.enemies.push(b); w.boss = b; w.bossSpawned = true;
    G.toast("👑 " + t.name + " 出現了！");
  }
  G.spawnBoss = spawnBoss;

  // ================= 浮動數字 / 粒子 =================
  G.addFloat = function (x, y, val, crit) {
    G.world.floats.push({ x: x + rand(-6, 6), y, vy: -42, life: .8, val: Math.round(val), crit });
  };
  G.burst = function (x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 200);
      G.world.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.25, .6), color, r: rand(2, 4) });
    }
  };

  // ================= 戰鬥：傷害與特效 =================
  // 直接對敵人造成傷害（不再觸發特效，避免遞迴）
  G.dealDamage = function (e, dmg, isCrit) {
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.hitFlash = 0.1;
    G.addFloat(e.x, e.y, dmg, isCrit);
    if (e.hp <= 0) G.killEnemy(e);
    return dmg;
  };

  // 玩家箭命中敵人 -> 計算暴擊 + 套用所有特效
  G.onPlayerHit = function (e) {
    const p = G.player, w = G.world, procs = p.procs;
    let dmg = p.dmg;
    const isCrit = Math.random() * 100 < p.crit;
    if (isCrit) dmg *= (1 + p.critDmg / 100);
    const dealt = G.dealDamage(e, dmg, isCrit);
    // 吸血
    if (procs.lifesteal > 0) G.healPlayer(dealt * procs.lifesteal / 100);
    // 冰霜減速
    if (procs.frost > 0 && e.hp > 0) { e.slowPct = Math.max(e.slowPct, procs.frost); e.slowT = 2; }
    // 燃燒
    if (procs.burn > 0 && e.hp > 0) { e.burnDps = p.dmg * procs.burn / 100; e.burnT = 3; }
    // 連鎖閃電
    if (procs.chain > 0 && Math.random() * 100 < procs.chain) {
      let best = null, bd = 240 * 240;
      for (const o of w.enemies) {
        if (o === e || o.hp <= 0) continue;
        const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        w.particles.push({ line: true, x1: e.x, y1: e.y, x2: best.x, y2: best.y, life: .15, color: "#9fe8ff" });
        G.dealDamage(best, p.dmg * 0.6, false);
      }
    }
    // 暴擊爆炸
    if (isCrit && procs.critboom > 0) {
      G.burst(e.x, e.y, "#ffb14d", 12);
      const R = 90;
      for (const o of w.enemies) {
        if (o === e || o.hp <= 0) continue;
        if (dist(o.x, o.y, e.x, e.y) < R) G.dealDamage(o, p.dmg * procs.critboom / 100, false);
      }
      G.shake(6, .2);
    }
  };

  // 玩家受傷（含護甲減傷與荊棘反傷）
  G.damagePlayer = function (raw, source) {
    const p = G.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    const reduction = p.armor / (p.armor + 30);
    const dmg = Math.max(1, Math.round(raw * (1 - reduction)));
    p.hp -= dmg; p.invuln = 0.5;
    G.shake(7, .25);
    // 荊棘反傷
    if (p.procs.thorns > 0 && source && source.hp > 0) {
      G.dealDamage(source, raw * p.procs.thorns / 100, false);
    }
    if (p.hp <= 0) { p.hp = 0; G.onPlayerDeath(); }
  };

  // 擊殺敵人
  G.killEnemy = function (e) {
    const w = G.world;
    const i = w.enemies.indexOf(e);
    if (i < 0) return; // 已被移除
    w.enemies.splice(i, 1);
    G.burst(e.x, e.y, e.color, e.boss ? 40 : 14);
    G.shake(e.boss ? 12 : 4, e.boss ? .4 : .12);
    G.save.gold += e.gold;
    G.gainXp(e.xp);
    // 擊殺回血（傳奇）
    if (G.player.procs.killHeal > 0) G.healPlayer(G.player.maxHp * G.player.procs.killHeal / 100);
    // 掉落
    G.rollLoot(e);
    if (e.boss) {
      G.save.killedBoss[e.typeId] = true; w.boss = null;
      G.persist();
      G.toast("🏆 擊敗 " + e.name + "！新區域已解鎖");
      if (G.refreshHud) G.refreshHud();
    }
  };

  // 移除敵人但不給獎勵（用於自爆等非玩家擊殺）
  G.vanishEnemy = function (e) {
    const w = G.world; const i = w.enemies.indexOf(e);
    if (i >= 0) w.enemies.splice(i, 1);
  };

  // 掉落
  G.rollLoot = function (e) {
    const w = G.world, area = w.area;
    const ilvl = (area.level || 1) + randInt(0, 2);
    if (e.boss) {
      const n = randInt(2, 3);
      for (let k = 0; k < n; k++) {
        const it = G.rollItem(ilvl + 2, null, k === 0 ? "legend" : (Math.random() < .5 ? "rare" : "magic"), 30);
        dropGround(e.x + rand(-30, 30), e.y + rand(-20, 20), it);
      }
      return;
    }
    if (chance(0.22)) {
      const it = G.rollItem(ilvl, null, null, area.level);
      dropGround(e.x, e.y, it);
    }
  };
  function dropGround(x, y, item) {
    G.world.grounds.push({ x, y, item, bob: 0, age: 0 });
  }
  G.dropGround = dropGround;

  // ================= 震動 =================
  G.shake = function (mag, t) { G.world.shakeMag = Math.max(G.world.shakeMag || 0, mag); G.world.shakeT = Math.max(G.world.shakeT || 0, t); };

})();
