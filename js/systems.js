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
      qi: { picks: [] }, // 功法：每排(每5級)三選一，picks[tier]='fire'|'lightning'|'ice'
      equipped: { weapon: null, armor: null, helmet: null, ring: null },
      bag: [], area: "town",
      killedBoss: {},
    };
  };
  G.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { G.save = JSON.parse(raw); if (!G.save.qi || !Array.isArray(G.save.qi.picks)) G.save.qi = { picks: [] }; return true; }
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
  // lvl=該區等級（或玩家等級）。越深關卡高品質才逐步出現；早期幾乎全白、零星藍
  function rollRarity(lvl) {
    lvl = lvl || 0;
    const entries = [
      ["common", 100],
      ["magic",  Math.min(60, lvl * 4)],
      ["rare",   Math.max(0, (lvl - 6) * 2.5)],
      ["legend", Math.max(0, (lvl - 14) * 1.0)],
    ];
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
    let s = G.RARITY_ORDER.indexOf(item.rarity) * 100 + (item.plus || 0) * 30;
    for (const af of item.affixes) s += af.value;
    return s;
  };

  // ===== 城鎮商店：強化 / 賭裝 =====
  G.MAX_PLUS = 12;
  G.enhanceCost = function (item) {
    const rar = G.RARITY_ORDER.indexOf(item.rarity);
    return Math.round(30 * Math.pow(1.55, item.plus || 0) * (1 + rar * 0.6));
  };
  G.enhanceItem = function (item) {
    if ((item.plus || 0) >= G.MAX_PLUS) { G.toast("已達強化上限 +" + G.MAX_PLUS); return false; }
    const c = G.enhanceCost(item);
    if (G.save.gold < c) { G.toast("金幣不足（需 " + c + "）"); return false; }
    G.save.gold -= c; item.plus = (item.plus || 0) + 1;
    G.computeStats(); G.persist(); if (G.refreshHud) G.refreshHud();
    G.toast("強化成功！" + item.baseName + " +" + item.plus);
    return true;
  };
  G.sellAll = function () {
    let n = 0, gold = 0;
    for (const it of G.save.bag) { gold += G.RARITY[it.rarity].sell; n++; }
    if (!n) { G.toast("背包是空的"); return; }
    G.save.bag = []; G.save.gold += gold;
    G.toast("賣出全部 " + n + " 件，+🪙" + gold);
    G.persist(); if (G.refreshHud) G.refreshHud(); if (G.renderBag) G.renderBag();
  };
  // 強化成功率：+5 以上開始可能失敗，越高越低
  G.enhanceRate = function (plus) {
    const table = [1, 1, 1, 1, 1, 0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12];
    return plus < table.length ? table[plus] : 0.08;
  };
  // 失敗後果：+8 以上爆炸（消失），其餘降一級
  G.enhanceFail = function (plus) { return plus >= 8 ? "explode" : "down"; };
  // 嘗試強化已選裝備，回傳 {result, cost}
  G.tryEnhance = function (item) {
    const cur = item.plus || 0;
    if (cur >= G.MAX_PLUS) { G.toast("已達上限"); return { result: "max" }; }
    const cost = G.enhanceCost(item);
    if (G.save.gold < cost) { G.toast("金幣不足（需 " + cost + "）"); return { result: "poor" }; }
    G.save.gold -= cost;
    const ok = Math.random() < G.enhanceRate(cur);
    let result;
    if (ok) { item.plus = cur + 1; result = "success"; if (G.sfx) G.sfx("level"); }
    else if (G.enhanceFail(cur) === "explode") {
      // 從背包或裝備欄移除
      const bi = G.save.bag.indexOf(item); if (bi >= 0) G.save.bag.splice(bi, 1);
      for (const sl of G.SLOTS) if (G.save.equipped[sl] === item) G.save.equipped[sl] = null;
      result = "explode"; if (G.sfx) G.sfx("boom");
    } else { item.plus = Math.max(0, cur - 1); result = "down"; if (G.sfx) G.sfx("hurt"); }
    G.computeStats(); G.persist(); if (G.refreshHud) G.refreshHud();
    return { result, cost };
  };
  G.gambleCost = function () { return 60 + G.save.level * 15; };
  G.gamble = function (slot) {
    const c = G.gambleCost();
    if (G.save.gold < c) { G.toast("金幣不足（需 " + c + "）"); return null; }
    G.save.gold -= c;
    const it = G.rollItem(G.save.level + 2, slot, null, 12 + G.save.level);
    G.addToBag(it); // 內含 persist / 提示
    if (G.refreshHud) G.refreshHud();
    return it;
  };

  // ================= 數值聚合 =================
  // 把 等級 + 已裝備詞條 + 天賦 全部算進 G.player 的有效數值
  G.computeStats = function () {
    const s = G.save, p = G.player;
    const lv = s.level;
    // 等級基礎成長
    let maxHp = 100 + (lv - 1) * 14;
    let dmg = 10 + (lv - 1) * 2.4;
    let atkSpdPct = 0, dmgPct = 0, critPct = 5, critDmgPct = 50, movePct = 0;
    let projectiles = 1, pierce = 0, armorFlat = 0, hpFlat = 0, minionPct = 0, rangePct = 0, pickRange = 0;
    const procs = { chain: 0, critboom: 0, lifesteal: 0, frost: 0, burn: 0, thorns: 0, regen: 0, storm: 0, killHeal: 0, paraOnHit: 0, freezeChance: 0, whirl: 0, explosive: 0 };

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
        case "minionPct": minionPct += v; break;
        case "rangePct": rangePct += v; break;
        case "pickRange": pickRange += v; break;
      }
    }

    // 裝備詞條（強化等級 plus 提升所有詞條數值）
    for (const slot of G.SLOTS) {
      const it = s.equipped[slot];
      if (!it) continue;
      const mul = 1 + (it.plus || 0) * 0.08;
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
        const val = (def.stat === "projectiles" || def.stat === "pierce") ? af.value : Math.round(af.value * mul);
        if (def.kind === "stat") addStat(def.stat, val);
        else procs[af.id] = (procs[af.id] || 0) + val;
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
    // 功法：每排三選一，套用該排所選元素的節點
    const picks = (s.qi && s.qi.picks) || [];
    for (let t = 0; t < picks.length; t++) {
      const col = picks[t]; if (!col || !G.QIGONG[col]) continue;
      const n = G.QIGONG[col].nodes[t]; if (!n) continue;
      if (n.stat) addStat(n.stat, n.per);
      else if (n.proc) procs[n.proc] = (procs[n.proc] || 0) + n.per;
    }
    // Boss 首殺戰利品：永久加成（長期目標）
    const trophies = Object.values(s.killedBoss || {}).filter(Boolean).length;
    if (trophies) { dmgPct += trophies * 3; hpFlat += trophies * 20; }

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
    p.minionPct = minionPct;
    p.rangePct = rangePct;
    p.pickRange = 28 + pickRange;
    p.procs = procs;
    p.bulletSpeed = 560;
    if (p.hp === undefined || p.hp > p.maxHp) p.hp = p.maxHp;
    // 切換成非召喚武器時清除既有召喚物
    if (G.world && G.world.minions && WT.cls !== "summon") G.world.minions.length = 0;
  };

  // ================= 玩家 =================
  G.player = { x: 0, y: 0, r: 16, hp: 100, invuln: 0, cooldown: 0, stormCd: 0, regenAcc: 0, facing: 0, moving: false,
    burnT: 0, burnDps: 0, burnAcc: 0, chillT: 0, chillPct: 0, paraT: 0, paraTick: 0, stunT: 0, dashT: 0, dashVx: 0, dashVy: 0, whirlT: 0, whirlCd: 0 };

  G.healPlayer = function (amt) {
    const p = G.player;
    p.hp = Math.min(p.maxHp, p.hp + amt);
  };

  // ================= 等級 / 經驗 =================
  G.xpForLevel = (lv) => Math.floor(12 * Math.pow(lv, 1.4)) + 15;

  // 經驗球數量：依玩家與怪物等級差，模擬越級/打爛怪
  G.xpOrbCount = function (enemyLvl, playerLvl) {
    const diff = (enemyLvl || 1) - playerLvl;
    if (diff <= -5) return 1;   // 打爛怪（怪太低）
    if (diff >= 5) return 10;   // 越級打怪（怪太高）
    return 3 + Math.floor(Math.random() * 3); // 正常範圍 3~5
  };
  // 擊殺後把金幣拆成數枚硬幣噴在地上，需拾取才入帳
  G.spawnCoins = function (e) {
    const w = G.world;
    const n = clamp(1 + Math.floor(e.gold / 6), 1, 6);
    const each = Math.max(1, Math.round(e.gold / n));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(60, 150);
      w.coins.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gold: each, age: 0 });
    }
  };
  // 擊殺後把經驗值拆成數顆經驗球噴在地上，需拾取才入帳
  G.spawnXpOrbs = function (e) {
    const w = G.world;
    const n = G.xpOrbCount(e.lvl, G.save.level);
    const each = Math.max(1, Math.round(e.xp / n));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(70, 170);
      w.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, xp: each, age: 0, ic: Math.random() < 0.5 ? "🧋" : "🥟" });
    }
  };
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
      if (G.sfx) G.sfx("level");
      G.toast("⬆️ 升級！等級 " + s.level + "（+1 天賦點）");
      G.persist();
      if (G.refreshHud) G.refreshHud();
    }
  };

  // ================= 世界 / 區域 =================
  G.world = { areaId: null, area: null, enemies: [], bullets: [], foeShots: [], particles: [], grounds: [], floats: [], swings: [], minions: [], casts: [], waves: [], spawns: [], orbs: [], coins: [], flashes: [], obstacles: [], extraPortals: [], altar: null, chest: null, killCount: 0, magnetT: 0, cam: { x: 0, y: 0 }, spawnTimer: 0, summonTimer: 0, bossSpawned: false, boss: null, time: 0 };

  G.enterArea = function (areaId, entryPortalFrom) {
    const w = G.world;
    if (!G.AREAS[areaId]) areaId = "town"; // 舊存檔可能指向已移除的區域
    const area = G.AREAS[areaId];
    w.areaId = areaId; w.area = area;
    w.enemies = []; w.bullets = []; w.foeShots = []; w.particles = []; w.grounds = []; w.floats = [];
    w.swings = []; w.minions = []; w.casts = []; w.waves = []; w.spawns = []; w.orbs = []; w.coins = []; w.flashes = []; w.extraPortals = []; w.obstacles = []; w.summonTimer = 1;
    w.spawnTimer = 1; w.bossSpawned = false; w.boss = null; w.time = 0; w.chest = null; w.killCount = 0; w.magnetT = 0;
    // 進入城鎮：記住來源並建立「回歸傳送門」可傳回原本的地方
    if (areaId === "town") {
      if (entryPortalFrom && G.AREAS[entryPortalFrom] && !G.AREAS[entryPortalFrom].safe) G.save.recallReturn = entryPortalFrom;
      const ret = G.save.recallReturn;
      if (ret && G.AREAS[ret] && !G.AREAS[ret].safe) {
        w.extraPortals.push({ to: ret, x: 660, y: 760, name: "回歸 " + G.AREAS[ret].name });
      }
    } else {
      G.save.recallReturn = areaId; // 記錄目前所在戰鬥區，回城後可一鍵傳回
    }
    G.save.area = areaId; G.persist();
    // 玩家出生點：優先放在「返回來源」的傳送門附近，否則地圖底部中央
    let sx = area.w / 2, sy = area.h - 160;
    if (entryPortalFrom) {
      const ret = area.portals.find(pt => pt.to === entryPortalFrom);
      if (ret) { sx = ret.x; sy = ret.y + 70; }
    }
    G.player.x = clamp(sx, 40, area.w - 40);
    G.player.y = clamp(sy, 40, area.h - 40);
    // 召喚祭壇（六芒星）：戰鬥區且 Boss 未擊敗時，隨機放置且不蓋到傳送門/出生點
    w.altar = null;
    if (!area.safe && area.boss && !G.save.killedBoss[area.boss]) {
      const m = 230; let ax = area.w / 2, ay = area.h / 2;
      for (let t = 0; t < 50; t++) {
        ax = rand(m, area.w - m); ay = rand(m, area.h - m);
        let ok = dist(ax, ay, G.player.x, G.player.y) > 260;
        if (ok) for (const pt of area.portals) if (dist(ax, ay, pt.x, pt.y) < 340) { ok = false; break; }
        if (ok) break;
      }
      w.altar = { x: ax, y: ay, r: 85, progress: 0, summoning: false, delay: 0 };
    }
    // 障礙物（戰鬥區隨機石塊，阻擋移動；避開出生點/傳送門/祭壇）
    if (!area.safe) {
      const n = 6 + Math.floor(area.level / 8);
      for (let i = 0; i < n; i++) {
        let ox, oy, r, ok = false;
        for (let t = 0; t < 30 && !ok; t++) {
          r = rand(30, 55); ox = rand(80, area.w - 80); oy = rand(80, area.h - 80);
          ok = dist(ox, oy, G.player.x, G.player.y) > 160;
          if (ok && w.altar) ok = dist(ox, oy, w.altar.x, w.altar.y) > 140;
          if (ok) for (const pt of area.portals) if (dist(ox, oy, pt.x, pt.y) < 150) { ok = false; break; }
        }
        if (ok) w.obstacles.push({ x: ox, y: oy, r });
      }
      const cnt = Math.min(Math.ceil(area.maxAlive * 0.6), area.maxAlive);
      for (let i = 0; i < cnt; i++) spawnEnemy(true);
    }
    if (G.refreshHud) G.refreshHud();
  };

  // 一般刷怪：先在地上放紅色預警標記，閃爍約 1 秒後才真正出現
  function spawnEnemy(initial) {
    const w = G.world, area = w.area;
    if (area.safe) return;
    let x, y, tries = 0;
    do {
      x = rand(60, area.w - 60); y = rand(60, area.h - 60); tries++;
    } while (dist(x, y, G.player.x, G.player.y) < 280 && tries < 20);
    const typeId = pick(area.enemies);
    w.spawns.push({ x, y, typeId, t: 0, dur: 1.0, r: G.ENEMIES[typeId].r });
  }
  G.spawnEnemy = spawnEnemy;

  // 指定座標/類型放置預警（供 Boss 召喚波使用）
  G.spawnPendingAt = function (typeId, x, y, dur) {
    const area = G.world.area; if (!area || area.safe) return;
    x = clamp(x, 40, area.w - 40); y = clamp(y, 40, area.h - 40);
    G.world.spawns.push({ x, y, typeId, t: 0, dur: dur || 0.8, r: (G.ENEMIES[typeId] || { r: 15 }).r });
  };

  // 預警結束 -> 生成實際敵人
  G.materializeEnemy = function (typeId, x, y) {
    const w = G.world, area = w.area;
    const t = G.ENEMIES[typeId]; if (!t) return;
    const lvScale = 1 + area.level * 0.18;          // 經驗用
    const hpScale = 1 + area.level * 0.15;          // 血量（避免後期太肉）
    w.enemies.push({
      typeId, name: t.name, ic: t.ic, x, y, r: t.r, color: t.color, lvl: area.level,
      elem: typeId === "bomber" ? "fire" : (area.elem || null),
      hp: Math.round(t.hp * hpScale), maxHp: Math.round(t.hp * hpScale),
      dmg: Math.round(t.dmg * (1 + area.level * 0.16)), speed: t.speed,
      baseSpeed: t.speed, xp: Math.round(t.xp * lvScale), gold: Math.round(t.gold * (1 + area.level * 0.22)),
      behavior: t.behavior, fireCd: rand(1.2, 2.6), touchCd: 0, hitFlash: 0,
      slowT: 0, slowPct: 0, burnT: 0, burnDps: 0, stunT: 0, boss: false,
      cast: null, castCd: rand(0.6, 1.6), dashT: 0, dvx: 0, dvy: 0,
    });
  };

  function spawnBoss(px, py) {
    const w = G.world, area = w.area;
    if (!area.boss || w.bossSpawned) return;
    if (G.save.killedBoss[area.boss]) return;
    const t = G.BOSSES[area.boss];
    const lvScale = 1 + area.level * 0.1;
    const bx = (px != null) ? px : area.bossAt.x, by = (py != null) ? py : area.bossAt.y;
    const b = {
      typeId: area.boss, name: t.name, ic: t.ic, x: bx, y: by, r: t.r, color: t.color, lvl: area.level, elem: area.elem || null,
      hp: Math.round(t.hp * lvScale), maxHp: Math.round(t.hp * lvScale),
      dmg: Math.round(t.dmg * (1 + area.level * 0.05)), speed: t.speed, baseSpeed: t.speed, xp: t.xp, gold: t.gold,
      behavior: "boss", fireCd: 2, touchCd: 0, hitFlash: 0, slowT: 0, slowPct: 0, burnT: 0, burnDps: 0, stunT: 0, boss: true,
      cast: null, castCd: 0, dashT: 0, dvx: 0, dvy: 0,
      attacks: t.attacks || ["aimVolley"], ults: t.ults || ["novaRing"],
      emitters: [], ultState: "move", ultT: 0, ultDur: 0, ultActiveT: 0, ultMin: 1.2,
      atkCd: rand(1.5, 2.6), ultCd: rand(7, 10),
      tier: Math.max(0, Math.round(area.level / 7)), airborne: false,
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

  // 玩家箭命中敵人 -> 計算暴擊 + 套用所有特效（mult 可調整傷害，供召喚物等共用）
  G.onPlayerHit = function (e, mult) {
    const p = G.player, w = G.world, procs = p.procs;
    mult = mult || 1;
    let dmg = p.dmg * mult;
    const isCrit = Math.random() * 100 < p.crit;
    if (isCrit) dmg *= (1 + p.critDmg / 100);
    const dealt = G.dealDamage(e, dmg, isCrit);
    if (G.sfx) G.sfx(isCrit ? "crit" : "hit");
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
    // 麻痺（雷）/ 定身（冰）：使敵人停頓
    if (e.hp > 0 && procs.paraOnHit > 0 && Math.random() * 100 < procs.paraOnHit) e.stunT = Math.max(e.stunT || 0, 0.8);
    if (e.hp > 0 && procs.freezeChance > 0 && Math.random() * 100 < procs.freezeChance) e.stunT = Math.max(e.stunT || 0, 1.3);
    // 暴擊爆炸
    if (isCrit && procs.critboom > 0) {
      G.burst(e.x, e.y, "#ffb14d", 12);
      const R = 90;
      for (const o of w.enemies) { if (o === e || o.hp <= 0) continue; if (dist(o.x, o.y, e.x, e.y) < R) G.dealDamage(o, p.dmg * procs.critboom / 100, false); }
      G.shake(6, .2);
    }
    // 爆裂彈（命中範圍爆炸，遠程 build）
    if (procs.explosive > 0) {
      G.burst(e.x, e.y, "#ffd166", 10);
      const R = 80;
      for (const o of w.enemies) { if (o === e || o.hp <= 0) continue; if (dist(o.x, o.y, e.x, e.y) < R) G.dealDamage(o, p.dmg * procs.explosive / 100, false); }
    }
  };

  // ===== 功法：每 5 級開放下一排，每排三選一（其餘鎖死）=====
  G.QI_TIERS = 10;
  G.qiTotal = function () { return Math.min(G.QI_TIERS, Math.floor(G.save.level / 5)); };
  G.qiPickRow = function () { return ((G.save.qi && G.save.qi.picks) || []).length; }; // 下一個可選的排
  G.qiAvail = function () { return G.qiTotal() - G.qiPickRow(); };
  G.qiPick = function (col) {
    if (!G.QIGONG[col]) return false;
    if (G.qiPickRow() >= G.QI_TIERS) { G.toast("功法已圓滿"); return false; }
    if (G.qiAvail() <= 0) { G.toast("尚無可選功法（每 5 等開放一排）"); return false; }
    G.save.qi.picks.push(col);
    G.computeStats(); G.persist(); if (G.refreshHud) G.refreshHud();
    return true;
  };

  // 套用元素狀態到玩家（火=燃燒、冰=減速、雷=麻痺）
  G.applyPlayerStatus = function (elem) {
    const p = G.player;
    if (elem === "fire") { p.burnT = 3; p.burnDps = Math.max(2, p.maxHp * 0.015); }
    else if (elem === "frost") { p.chillT = 2.2; p.chillPct = 45; }
    else if (elem === "lightning") { p.paraT = 1.6; }
  };

  // 玩家受傷（含護甲減傷、荊棘反傷、元素狀態）
  G.damagePlayer = function (raw, source, elem, bossHit) {
    const p = G.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    const reduction = p.armor / (p.armor + 30);
    let dmg = Math.max(1, Math.round(raw * (1 - reduction)));
    if (bossHit) dmg += Math.round(p.maxHp * 0.10); // Boss 攻擊附帶 10% 最大生命真實傷害（無視護甲）
    p.hp -= dmg; p.invuln = 0.5;
    G.shake(7, .25);
    if (G.sfx) G.sfx("hurt");
    if (elem) G.applyPlayerStatus(elem);
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
    if (G.sfx) G.sfx(e.boss ? "boom" : "death");
    G.spawnCoins(e); // 金幣改為地上硬幣，需拾取
    G.spawnXpOrbs(e); // 經驗改為經驗球，需拾取
    if (!e.boss) w.killCount = (w.killCount || 0) + 1; // 開啟祭壇所需擊殺數
    if (G.onKill) G.onKill(); // 連殺計數
    // 擊殺回血（傳奇）
    if (G.player.procs.killHeal > 0) G.healPlayer(G.player.maxHp * G.player.procs.killHeal / 100);
    // 掉落
    G.rollLoot(e);
    if (e.boss) {
      const first = !G.save.killedBoss[e.typeId];
      G.save.killedBoss[e.typeId] = true; w.boss = null;
      if (first) {
        // 首殺獎勵：額外金幣 + 額外傳奇，並獲得永久戰利品加成
        const bonus = e.gold * 2;
        G.save.gold += bonus;
        const lg = G.rollItem((G.world.area.level || 1) + 3, null, "legend", 40);
        if (G.addToBag) G.addToBag(lg);
        G.computeStats();
        G.toast("🏆 首殺 " + e.name + "！+🪙" + bonus + "、傳奇戰利品、永久強化");
      } else {
        G.toast("擊敗 " + e.name + "！");
      }
      G.persist();
      if (G.refreshHud) G.refreshHud();
    }
  };

  // 移除敵人但不給獎勵（用於自爆等非玩家擊殺）
  G.vanishEnemy = function (e) {
    const w = G.world; const i = w.enemies.indexOf(e);
    if (i >= 0) w.enemies.splice(i, 1);
    if (G.sfx) G.sfx("boom");
  };

  // 死亡懲罰：損失部分金幣
  G.applyDeathPenalty = function () {
    const lost = Math.floor(G.save.gold * 0.2);
    G.save.gold -= lost; G.persist(); if (G.refreshHud) G.refreshHud();
    return lost;
  };

  // 掉落
  G.rollLoot = function (e) {
    const w = G.world, area = w.area;
    const ilvl = (area.level || 1) + randInt(0, 2);
    // 機率掉落磁鐵（全圖吸取）
    if (chance(e.boss ? 0.5 : 0.025)) dropSpecial(e.x + rand(-20, 20), e.y + rand(-20, 20), "magnet");
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
    G.world.grounds.push({ x: x + rand(-26, 26), y: y + rand(-26, 26), item, bob: 0, age: 0 });
  }
  // 寶箱掉落：比一般更高機率出好東西
  G.chestLoot = function (x, y, area) {
    const lvl = (area.level || 1) + 18; // 大幅提升稀有度權重
    const n = randInt(2, 4);
    for (let k = 0; k < n; k++) dropGround(x + rand(-40, 40), y + rand(-40, 40), G.rollItem((area.level || 1) + 2, null, null, lvl));
    G.spawnCoins({ x, y, gold: 20 + (area.level || 1) * 6 });
  };
  function dropSpecial(x, y, special) {
    G.world.grounds.push({ x, y, special, bob: 0, age: 0 });
  }
  G.dropGround = dropGround;
  G.dropSpecial = dropSpecial;

  // ================= 震動 =================
  G.shake = function (mag, t) { G.world.shakeMag = Math.max(G.world.shakeMag || 0, mag); G.world.shakeT = Math.max(G.world.shakeT || 0, t); };

})();
