"use strict";
// 主程式：迴圈、輸入、相機、敵人 AI、傳送門、初始化
(function () {
  const G = window.G;
  const U = G.util;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize); resize();

  let started = false, dead = false;
  function isPaused() {
    return !started || dead ||
      document.querySelector(".panel.show") || document.getElementById("itemPop").classList.contains("show") ||
      document.querySelector(".overlay.show");
  }

  // ---------- 虛擬搖桿 ----------
  const joy = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0, id: null };
  function moveZoneTop() { return H * 0.8; } // 只有畫面下方 20% 是移動控制區
  function pStart(x, y, id) {
    if (isPaused()) return;
    if (y < moveZoneTop()) return; // 點擊中間/上方不啟動移動，避免擋住角色
    joy.active = true; joy.id = id; joy.ox = x; joy.oy = y; joy.dx = 0; joy.dy = 0; joy.mag = 0;
  }
  function pMove(x, y) {
    if (!joy.active) return;
    let dx = x - joy.ox, dy = y - joy.oy; const max = 70; const m = Math.hypot(dx, dy);
    if (m > max) { dx = dx / m * max; dy = dy / m * max; joy.ox = x - dx; joy.oy = y - dy; }
    joy.dx = dx; joy.dy = dy; joy.mag = Math.min(m, max) / max;
  }
  function pEnd() { joy.active = false; joy.mag = 0; joy.dx = 0; joy.dy = 0; }

  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); const t = e.changedTouches[0]; pStart(t.clientX, t.clientY, t.identifier); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joy.id) pMove(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener("touchend", (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joy.id) pEnd(); }, { passive: false });
  canvas.addEventListener("touchcancel", (e) => { e.preventDefault(); pEnd(); }, { passive: false });
  let mouseDown = false;
  canvas.addEventListener("mousedown", (e) => { mouseDown = true; pStart(e.clientX, e.clientY, "m"); });
  window.addEventListener("mousemove", (e) => { if (mouseDown) pMove(e.clientX, e.clientY); });
  window.addEventListener("mouseup", () => { mouseDown = false; pEnd(); });

  // ---------- 攻擊（依武器類型分流）----------
  function nearestEnemy(x, y) {
    let t = null, b = Infinity;
    for (const e of G.world.enemies) { if (e.hp <= 0) continue; const d = U.dist(x, y, e.x, e.y); if (d < b) { b = d; t = e; } }
    return t;
  }
  function playerAttack() {
    const cls = G.player.weaponClass;
    if (cls === "melee") meleeSwing();
    else if (cls === "summon") { /* 召喚由 summon timer 處理，不直接攻擊 */ }
    else fireProjectiles(G.player.weaponType === "staff");
  }
  // 弓 / 法杖：發射投射物（法杖為追蹤）
  function fireProjectiles(homing) {
    const w = G.world, p = G.player;
    const tgt = nearestEnemy(p.x, p.y); if (!tgt) return;
    const baseAng = Math.atan2(tgt.y - p.y, tgt.x - p.x); p.facing = baseAng;
    const n = p.projectiles, spread = 0.15;
    const sp = homing ? p.bulletSpeed * 0.65 : p.bulletSpeed;
    for (let i = 0; i < n; i++) {
      const a = baseAng + (i - (n - 1) / 2) * spread;
      w.bullets.push({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: homing ? 2.4 : 1.4, pierce: p.pierce, hits: [], homing: !!homing });
    }
  }
  // 雙手劍 / 匕首：近戰扇形揮砍
  function meleeSwing() {
    const w = G.world, p = G.player, WT = p.weapon;
    const tgt = nearestEnemy(p.x, p.y);
    const baseAng = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
    p.facing = baseAng;
    const reach = WT.reach || 100, arcHalf = WT.arcHalf || 1;
    for (const e of w.enemies.slice()) {
      if (e.hp <= 0) continue;
      if (U.dist(p.x, p.y, e.x, e.y) > reach + e.r) continue;
      let diff = Math.atan2(e.y - p.y, e.x - p.x) - baseAng;
      while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= arcHalf) G.onPlayerHit(e);
    }
    w.swings.push({ x: p.x, y: p.y, ang: baseAng, reach, arcHalf, life: 0.16 });
    G.shake(3, 0.08);
  }
  // 法書：召喚史萊姆
  function spawnMinion() {
    const p = G.player;
    const hp = 30 + G.save.level * 6;
    G.world.minions.push({ x: p.x + U.rand(-30, 30), y: p.y + U.rand(-30, 30), r: 11, hp, maxHp: hp, atkCd: 0 });
  }
  function enemyShoot(e, ang) {
    const sp = 220;
    G.world.foeShots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: e.dmg, life: 1.6, r: 7 });
  }

  // ---------- 更新 ----------
  function update(dt) {
    const w = G.world, p = G.player, area = w.area;
    w.time += dt;

    // 玩家移動
    p.moving = joy.active && joy.mag > 0.08;
    if (p.moving) {
      const a = Math.atan2(joy.dy, joy.dx);
      p.x += Math.cos(a) * p.moveSpeed * joy.mag * dt;
      p.y += Math.sin(a) * p.moveSpeed * joy.mag * dt;
      p.x = U.clamp(p.x, p.r, area.w - p.r);
      p.y = U.clamp(p.y, p.r, area.h - p.r);
    }
    if (p.invuln > 0) p.invuln -= dt;
    // 再生
    if (p.procs.regen > 0) G.healPlayer(p.procs.regen * dt);

    // 自動攻擊（持續，移動中也會攻擊，朝最近敵人）
    p.cooldown -= dt;
    if (w.enemies.length && p.cooldown <= 0) { playerAttack(); p.cooldown = p.fireInterval; }

    // 法書：召喚史萊姆（上限內持續補充）
    if (p.weaponClass === "summon") {
      const cap = (p.weapon && p.weapon.summonCap) || 3;
      w.summonTimer -= dt;
      if (w.summonTimer <= 0 && w.minions.length < cap) { spawnMinion(); w.summonTimer = 2.2; }
    }

    // 風暴之芯（傳奇）：每 1.5s 落雷
    if (p.procs.storm > 0) {
      p.stormCd -= dt;
      if (w.enemies.length && p.stormCd <= 0) {
        p.stormCd = 1.5;
        for (const e of w.enemies.slice()) {
          if (U.dist(e.x, e.y, p.x, p.y) < 260) {
            w.particles.push({ line: true, x1: e.x, y1: e.y - 60, x2: e.x, y2: e.y, life: .18, color: "#bfe6ff" });
            G.dealDamage(e, p.dmg * 1.2, false);
          }
        }
        G.shake(5, .15);
      }
    }

    // 揮砍特效計時
    for (let i = w.swings.length - 1; i >= 0; i--) { w.swings[i].life -= dt; if (w.swings[i].life <= 0) w.swings.splice(i, 1); }

    // 玩家子彈
    for (let i = w.bullets.length - 1; i >= 0; i--) {
      const b = w.bullets[i];
      // 法球追蹤轉向
      if (b.homing) {
        let tg = null, bd = Infinity;
        for (const e of w.enemies) { if (e.hp <= 0 || b.hits.includes(e)) continue; const d = U.dist(b.x, b.y, e.x, e.y); if (d < bd) { bd = d; tg = e; } }
        if (tg) {
          const cur = Math.atan2(b.vy, b.vx); let diff = Math.atan2(tg.y - b.y, tg.x - b.x) - cur;
          while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const na = cur + U.clamp(diff, -7 * dt, 7 * dt), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead2 = b.life <= 0 || b.x < -20 || b.x > area.w + 20 || b.y < -20 || b.y > area.h + 20;
      if (!dead2) {
        for (const e of w.enemies) {
          if (e.hp <= 0 || b.hits.includes(e)) continue;
          if (U.dist(b.x, b.y, e.x, e.y) < e.r + 5) {
            b.hits.push(e); G.burst(b.x, b.y, "#ffd166", 4);
            G.onPlayerHit(e);
            if (b.hits.length > b.pierce) { dead2 = true; break; }
          }
        }
      }
      if (dead2) w.bullets.splice(i, 1);
    }

    // 敵人
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const e = w.enemies[i];
      if (e.hp <= 0) continue; // 等待 killEnemy 移除
      if (e.hitFlash > 0) e.hitFlash -= dt;
      // 減速
      let spd = e.baseSpeed;
      if (e.slowT > 0) { e.slowT -= dt; spd *= (1 - e.slowPct / 100); if (e.slowT <= 0) e.slowPct = 0; }
      // 燃燒 DoT
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnAcc = (e.burnAcc || 0) + e.burnDps * dt;
        if (e.burnAcc >= 1) { const d = Math.floor(e.burnAcc); e.burnAcc -= d; G.dealDamage(e, d, false); }
        if (e.hp <= 0) continue;
      }
      const d = U.dist(e.x, e.y, p.x, p.y);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.behavior === "ranged") {
        // 拉近距離才射擊，避免從畫面外攻擊
        const want = 150;
        if (d > want + 45) { e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt; }
        else if (d < want - 45) { e.x -= Math.cos(a) * spd * dt; e.y -= Math.sin(a) * spd * dt; }
        e.fireCd -= dt; if (e.fireCd <= 0 && d < 230) { enemyShoot(e, a); e.fireCd = U.rand(1.6, 2.8); }
      } else if (e.behavior === "boss") {
        e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt;
        e.fireCd -= dt;
        if (e.fireCd <= 0) { for (let k = -1; k <= 1; k++) enemyShoot(e, a + k * 0.25); e.fireCd = 1.8; }
      } else {
        e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt;
      }
      // 分離
      for (const o of w.enemies) {
        if (o === e || o.hp <= 0) continue;
        const dd = U.dist(e.x, e.y, o.x, o.y);
        if (dd > 0 && dd < e.r + o.r) { const pa = Math.atan2(e.y - o.y, e.x - o.x); const push = (e.r + o.r - dd) * .5; e.x += Math.cos(pa) * push; e.y += Math.sin(pa) * push; }
      }
      e.x = U.clamp(e.x, e.r, area.w - e.r); e.y = U.clamp(e.y, e.r, area.h - e.r);
      // 接觸傷害
      e.touchCd -= dt;
      if (d < e.r + p.r && e.touchCd <= 0) { G.damagePlayer(e.dmg, e); e.touchCd = 0.6; }
    }

    // 召喚物（史萊姆）：追蹤並攻擊最近敵人
    for (let i = w.minions.length - 1; i >= 0; i--) {
      const m = w.minions[i];
      const tgt = nearestEnemy(m.x, m.y);
      if (tgt) {
        const a = Math.atan2(tgt.y - m.y, tgt.x - m.x), d = U.dist(m.x, m.y, tgt.x, tgt.y);
        if (d > m.r + tgt.r + 2) { m.x += Math.cos(a) * 160 * dt; m.y += Math.sin(a) * 160 * dt; }
        m.atkCd -= dt;
        if (d < m.r + tgt.r + 5 && m.atkCd <= 0) { G.dealDamage(tgt, p.dmg * 0.6, false); m.atkCd = 0.7; m.hp -= tgt.dmg * 0.5; }
      } else {
        const a = Math.atan2(p.y - m.y, p.x - m.x), d = U.dist(m.x, m.y, p.x, p.y);
        if (d > 60) { m.x += Math.cos(a) * 160 * dt; m.y += Math.sin(a) * 160 * dt; }
      }
      m.x = U.clamp(m.x, m.r, area.w - m.r); m.y = U.clamp(m.y, m.r, area.h - m.r);
      if (m.hp <= 0) { G.burst(m.x, m.y, "#5fc46b", 8); w.minions.splice(i, 1); }
    }

    // 敵人子彈
    for (let i = w.foeShots.length - 1; i >= 0; i--) {
      const s = w.foeShots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.x < -20 || s.x > area.w + 20 || s.y < -20 || s.y > area.h + 20) { w.foeShots.splice(i, 1); continue; }
      if (U.dist(s.x, s.y, p.x, p.y) < p.r + s.r) { G.damagePlayer(s.dmg, null); w.foeShots.splice(i, 1); }
    }

    // 粒子
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const pt = w.particles[i]; pt.life -= dt;
      if (!pt.line) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= .92; pt.vy *= .92; }
      if (pt.life <= 0) w.particles.splice(i, 1);
    }
    // 浮動數字
    for (let i = w.floats.length - 1; i >= 0; i--) {
      const f = w.floats[i]; f.y += f.vy * dt; f.vy += 60 * dt; f.life -= dt;
      if (f.life <= 0) w.floats.splice(i, 1);
    }

    // 刷怪
    if (!area.safe) {
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0 && w.enemies.length < area.maxAlive) { G.spawnEnemy(); w.spawnTimer = U.rand(1.2, 2.6); }
      // 接近 Boss 區域則召喚
      if (area.boss && !w.bossSpawned && !G.save.killedBoss[area.boss]) {
        if (U.dist(p.x, p.y, area.bossAt.x, area.bossAt.y) < 360) G.spawnBoss();
      }
    }

    // 拾取地面道具
    for (let i = w.grounds.length - 1; i >= 0; i--) {
      const g = w.grounds[i]; g.age += dt; g.bob = Math.sin(g.age * 4) * 3;
      if (U.dist(g.x, g.y, p.x, p.y) < p.r + 22) { G.addToBag(g.item); w.grounds.splice(i, 1); }
      else if (g.age > 60) w.grounds.splice(i, 1);
    }

    // 傳送門偵測
    updatePortalPrompt();

    // 震動衰減
    if (w.shakeT > 0) { w.shakeT -= dt; if (w.shakeT <= 0) w.shakeMag = 0; }

    // HUD（HP 變動頻繁，每幀更新血條）
    document.getElementById("hpbar").style.width = (p.hp / p.maxHp * 100) + "%";
  }

  // ---------- 傳送門 ----------
  let nearPortal = null, portalKey = "";
  function updatePortalPrompt() {
    const w = G.world, p = G.player; nearPortal = null;
    let best = 60 * 60;
    for (const pt of w.area.portals) {
      const dd = (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2;
      if (dd < best) { best = dd; nearPortal = pt; }
    }
    const el = document.getElementById("portalPrompt");
    const locked = nearPortal && nearPortal.reqLevel && G.save.level < nearPortal.reqLevel;
    const key = nearPortal ? (nearPortal.to + (locked ? "L" : "")) : "";
    if (key === portalKey) return; // 狀態未變則不重建 DOM
    portalKey = key;
    if (nearPortal) {
      el.style.display = "block";
      el.innerHTML = locked
        ? `<span class="pbtn" style="background:#555;color:#bbb;box-shadow:0 4px 0 #333">🔒 ${nearPortal.name}（需 Lv ${nearPortal.reqLevel}）</span>`
        : `<span class="pbtn" id="goPortal">➤ 前往 ${nearPortal.name}</span>`;
      if (!locked) document.getElementById("goPortal").onclick = () => travel(nearPortal);
    } else el.style.display = "none";
  }
  function travel(pt) {
    const from = G.world.areaId;
    G.enterArea(pt.to, from);
    G.toast("已抵達 " + G.AREAS[pt.to].name);
  }

  // ---------- 渲染 ----------
  function render() {
    const w = G.world, p = G.player, area = w.area;
    if (!area) return;
    // 相機
    w.cam.x = U.clamp(p.x - W / 2, 0, Math.max(0, area.w - W));
    w.cam.y = U.clamp(p.y - H / 2, 0, Math.max(0, area.h - H));
    const cx = w.cam.x, cy = w.cam.y;

    ctx.save();
    if (w.shakeMag > 0) ctx.translate(U.rand(-w.shakeMag, w.shakeMag), U.rand(-w.shakeMag, w.shakeMag));

    // 背景
    ctx.fillStyle = area.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1; const gs = 48;
    const sx0 = -((cx) % gs), sy0 = -((cy) % gs);
    for (let x = sx0; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = sy0; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // 地圖邊界
    ctx.strokeStyle = "rgba(120,100,180,.5)"; ctx.lineWidth = 4;
    ctx.strokeRect(-cx, -cy, area.w, area.h);

    // 傳送門
    for (const pt of area.portals) {
      const x = pt.x - cx, y = pt.y - cy;
      const locked = pt.reqLevel && G.save.level < pt.reqLevel;
      ctx.save(); ctx.translate(x, y);
      ctx.globalAlpha = .85;
      ctx.fillStyle = locked ? "#555" : "#3ad0ff";
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .35; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.font = "700 12px system-ui"; ctx.textAlign = "center";
      ctx.fillText((locked ? "🔒 " : "") + pt.name, 0, -46);
      ctx.restore();
    }

    // 地面道具
    for (const g of w.grounds) {
      const x = g.x - cx, y = g.y - cy + g.bob;
      const r = G.RARITY[g.item.rarity];
      ctx.fillStyle = r.color; ctx.globalAlpha = .25;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = "20px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(g.item.ic, x, y);
      ctx.textBaseline = "alphabetic";
    }

    // 粒子（線：閃電）
    for (const pt of w.particles) {
      if (pt.line) {
        ctx.globalAlpha = U.clamp(pt.life * 6, 0, 1); ctx.strokeStyle = pt.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pt.x1 - cx, pt.y1 - cy); ctx.lineTo(pt.x2 - cx, pt.y2 - cy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 敵人子彈
    for (const s of w.foeShots) {
      ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // 敵人
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      const x = e.x - cx, y = e.y - cy;
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : e.color;
      ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.stroke();
      if (e.slowT > 0) { ctx.strokeStyle = "#7fdfff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (e.burnT > 0) { ctx.fillStyle = "rgba(255,120,40,.5)"; ctx.beginPath(); ctx.arc(x, y - e.r, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x - e.r * .3, y - e.r * .2, e.r * .16, 0, Math.PI * 2); ctx.arc(x + e.r * .3, y - e.r * .2, e.r * .16, 0, Math.PI * 2); ctx.fill();
      if (e.hp < e.maxHp && !e.boss) {
        const bw = e.r * 2; ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x - bw / 2, y - e.r - 8, bw, 4);
        ctx.fillStyle = "#7af5d0"; ctx.fillRect(x - bw / 2, y - e.r - 8, bw * (e.hp / e.maxHp), 4);
      }
    }

    // 召喚物（史萊姆）
    for (const m of w.minions) {
      const x = m.x - cx, y = m.y - cy;
      ctx.fillStyle = "#5fc46b"; ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.8, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.8, 0, Math.PI * 2); ctx.fill();
      if (m.hp < m.maxHp) { const bw = m.r * 2; ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x - bw / 2, y - m.r - 6, bw, 3); ctx.fillStyle = "#7af5d0"; ctx.fillRect(x - bw / 2, y - m.r - 6, bw * (m.hp / m.maxHp), 3); }
    }

    // 近戰揮砍特效
    for (const s of w.swings) {
      const a = U.clamp(s.life / 0.16, 0, 1);
      ctx.save(); ctx.translate(s.x - cx, s.y - cy); ctx.rotate(s.ang);
      ctx.globalAlpha = a * 0.45; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s.reach, -s.arcHalf, s.arcHalf); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.restore();
    }

    // 玩家子彈 / 法球
    for (const b of w.bullets) {
      const x = b.x - cx, y = b.y - cy;
      if (b.homing) {
        ctx.save(); ctx.fillStyle = "#c77dff"; ctx.shadowColor = "#c77dff"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = "#ffe08a"; ctx.fillRect(-9, -2, 18, 4);
        ctx.fillStyle = "#fff6c8"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.fill();
        ctx.restore();
      }
    }

    // 玩家
    const px = p.x - cx, py = p.y - cy;
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, p.r * .75, p.r * .9, p.r * .4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = (p.invuln > 0 && Math.floor(p.invuln * 20) % 2) ? "#fff" : "#39d98a";
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1d7a52"; ctx.lineWidth = 3; ctx.stroke();
    ctx.rotate(p.facing); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.r + 2, 0, 8, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke();
    ctx.restore();

    // 圓形粒子
    for (const pt of w.particles) {
      if (pt.line) continue;
      ctx.globalAlpha = U.clamp(pt.life * 2, 0, 1); ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x - cx, pt.y - cy, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 浮動傷害數字
    ctx.textAlign = "center";
    for (const f of w.floats) {
      ctx.globalAlpha = U.clamp(f.life * 1.6, 0, 1);
      ctx.fillStyle = f.crit ? "#ffd166" : "#fff";
      ctx.font = (f.crit ? "800 " : "700 ") + (f.crit ? 22 : 16) + "px system-ui";
      ctx.fillText(f.val, f.x - cx, f.y - cy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    ctx.restore(); // shake

    // 稀有以上掉落：螢幕邊緣指向箭頭
    drawLootArrows(cx, cy);

    // 小地圖
    drawMinimap(area);

    // 移動控制區 + 搖桿（螢幕座標，無背景）
    const zTop = moveZoneTop();
    const bandH = H - zTop;
    if (joy.active) {
      ctx.globalAlpha = .3; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 48, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .75; ctx.beginPath(); ctx.arc(joy.ox + joy.dx, joy.oy + joy.dy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // 休息中的移動球指示（水平置中）
      const hx = W / 2, hy = zTop + bandH / 2;
      const rr = U.clamp(bandH / 2 - 8, 28, 46);
      ctx.globalAlpha = .2; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .3; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(hx, hy, rr * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Boss 血條（螢幕頂部，避開右上小地圖）
    if (w.boss && w.boss.hp > 0) {
      const bw = W - 24 - 104, bx = 12, by = 74;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx, by, bw, 14);
      ctx.fillStyle = "#e0457a"; ctx.fillRect(bx, by, bw * (w.boss.hp / w.boss.maxHp), 14);
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 14);
      ctx.fillStyle = "#fff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText("👑 " + w.boss.name, bx + bw / 2, by - 4); ctx.textAlign = "left";
    }
  }

  // ---------- 小地圖 ----------
  function drawMinimap(area) {
    const w = G.world, p = G.player;
    const mmW = 92, mmH = U.clamp(92 * area.h / area.w, 60, 150);
    const mmX = W - mmW - 10, mmY = 68;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1; ctx.strokeRect(mmX, mmY, mmW, mmH);
    ctx.beginPath(); ctx.rect(mmX, mmY, mmW, mmH); ctx.clip();
    const sx = (v) => mmX + (v / area.w) * mmW, sy = (v) => mmY + (v / area.h) * mmH;
    for (const pt of area.portals) {
      const locked = pt.reqLevel && G.save.level < pt.reqLevel;
      ctx.fillStyle = locked ? "#888" : "#3ad0ff";
      ctx.fillRect(sx(pt.x) - 3, sy(pt.y) - 3, 6, 6);
    }
    for (const g of w.grounds) {
      if (g.item.rarity !== "rare" && g.item.rarity !== "legend") continue;
      ctx.fillStyle = G.RARITY[g.item.rarity].color;
      ctx.fillRect(sx(g.x) - 2, sy(g.y) - 2, 4, 4);
    }
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      ctx.fillStyle = e.boss ? "#ffd166" : (e.behavior === "ranged" ? "#5b7dff" : "#ff5470");
      ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), e.boss ? 4 : 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#39d98a"; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- 稀有以上掉落的邊緣箭頭 ----------
  function drawLootArrows(cx, cy) {
    const w = G.world;
    const ccx = W / 2, ccy = H / 2, mh = W / 2 - 26, mv = H / 2 - 26;
    for (const g of w.grounds) {
      if (g.item.rarity !== "rare" && g.item.rarity !== "legend") continue;
      const sx = g.x - cx, sy = g.y - cy;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue; // 螢幕內不畫箭頭
      const ang = Math.atan2(sy - ccy, sx - ccx);
      const tX = Math.abs(Math.cos(ang)) < 1e-3 ? Infinity : mh / Math.abs(Math.cos(ang));
      const tY = Math.abs(Math.sin(ang)) < 1e-3 ? Infinity : mv / Math.abs(Math.sin(ang));
      const t = Math.min(tX, tY);
      const tx = ccx + Math.cos(ang) * t, ty = ccy + Math.sin(ang) * t;
      const color = G.RARITY[g.item.rarity].color;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -9); ctx.lineTo(-7, 9); ctx.fill();
      ctx.restore();
      ctx.font = "15px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(g.item.ic, tx - Math.cos(ang) * 18, ty - Math.sin(ang) * 18);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    }
  }

  // ---------- 死亡 ----------
  G.onPlayerDeath = function () {
    dead = true;
    document.getElementById("deathScreen").classList.add("show");
  };
  function respawn() {
    dead = false;
    document.getElementById("deathScreen").classList.remove("show");
    G.player.hp = G.player.maxHp; G.player.invuln = 1;
    G.enterArea("town");
  }

  // ---------- 迴圈 ----------
  let last = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!isPaused()) update(dt);
    if (started) render();
    requestAnimationFrame(loop);
  }

  // ---------- 初始化 ----------
  function beginGame() {
    G.computeStats();
    if (G.player.hp === undefined) G.player.hp = G.player.maxHp;
    started = true; dead = false;
    document.getElementById("startScreen").classList.remove("show");
    G.enterArea(G.save.area || "town");
    G.refreshHud();
    last = performance.now();
  }

  function wire() {
    document.getElementById("bagBtn").onclick = G.openBag;
    document.getElementById("talBtn").onclick = G.openTalents;
    document.getElementById("bagClose").onclick = G.closeBag;
    document.getElementById("talClose").onclick = G.closeTalents;
    document.getElementById("startBtn").onclick = beginGame;
    document.getElementById("respawnBtn").onclick = respawn;
    document.getElementById("resetSave").onclick = () => {
      if (confirm("確定要清除所有進度，重新開始嗎？")) { G.wipeSave(); location.reload(); }
    };
  }

  // 啟動
  G.loadSave();
  G.computeStats();
  wire();
  // 開始畫面文字依存檔狀態
  const hasProgress = G.save.level > 1 || G.save.bag.length > 0 || (G.save.equipped.weapon);
  document.getElementById("startBtn").textContent = hasProgress ? "繼續冒險" : "開始冒險";
  document.getElementById("startSub").textContent = hasProgress
    ? ("上次進度：Lv " + G.save.level + " · " + (G.AREAS[G.save.area] ? G.AREAS[G.save.area].name : "城鎮"))
    : "拖曳移動、自動射箭。專注走位閃避，打怪掉裝，靠詞條特效打造你的 Build！";
  requestAnimationFrame(loop);

})();
