"use strict";
// 主程式：迴圈、輸入、相機、敵人 AI、傳送門、初始化
(function () {
  const G = window.G;
  const U = G.util;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;
  const STAGE_MAXW = 460; // 桌機鎖定直版欄位寬度，讓手機/電腦比例接近
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.min(window.innerWidth, STAGE_MAXW);
    H = window.innerHeight;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    document.documentElement.style.setProperty("--stage-w", W + "px");
  }
  window.addEventListener("resize", resize); resize();

  let started = false, dead = false;
  function isPaused() {
    return !started || dead ||
      document.querySelector(".panel.show") || document.getElementById("itemPop").classList.contains("show") ||
      document.querySelector(".overlay.show");
  }

  // ---------- 虛擬搖桿 ----------
  // ---------- 控制模式：touch（手機觸控）/ keyboard（電腦 WASD）----------
  function detectTouch() {
    try { return (navigator.maxTouchPoints > 0 || "ontouchstart" in window) && window.matchMedia("(pointer: coarse)").matches; }
    catch (e) { return ("ontouchstart" in window); }
  }
  const CTRL_KEY = "archlike_control";
  let controlMode = localStorage.getItem(CTRL_KEY) || (detectTouch() ? "touch" : "keyboard");
  function setControlMode(m) { controlMode = m; try { localStorage.setItem(CTRL_KEY, m); } catch (e) {} updateCtrlBtn(); }
  function updateCtrlBtn() {
    const b = document.getElementById("ctrlToggle");
    if (b) b.textContent = "操作方式：" + (controlMode === "touch" ? "📱 手機觸控" : "⌨️ 電腦 WASD") + "（點擊切換）";
  }

  // 鍵盤狀態
  const keys = Object.create(null);
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (G.audioResume) G.audioResume();
    // 快捷鍵：B 背包、C 天賦、T 回城、空白鍵衝刺、Q 大招
    if (k === "b") { e.preventDefault(); togglePanel("bagPanel", G.openBag, G.closeBag); }
    if (k === "c") { e.preventDefault(); togglePanel("talPanel", G.openTalents, G.closeTalents); }
    if (k === "t") { e.preventDefault(); startRecall(); }
    if (k === " ") { e.preventDefault(); triggerDash(); }
    if (k === "q") { e.preventDefault(); triggerUlt(); }
  });
  function togglePanel(id, openFn, closeFn) {
    if (!started || dead) return;
    const el = document.getElementById(id);
    if (el.classList.contains("show")) closeFn();
    else { G.closeBag(); G.closeTalents(); G.closeItem(); openFn(); }
  }
  // ---------- 主動技能（暫時關閉）----------
  const SKILLS_ENABLED = false;
  let dashCd = 0, ultCd = 0;
  const DASH_CD = 3, ULT_CD = 14;
  function triggerDash() {
    if (!SKILLS_ENABLED || !started || dead || isPaused() || dashCd > 0) return;
    let dx = 0, dy = 0;
    if (controlMode === "keyboard") { const kv = keyboardVector(); dx = kv.dx; dy = kv.dy; }
    else if (joy.active) { dx = joy.dx; dy = joy.dy; }
    if (!dx && !dy) { dx = Math.cos(G.player.facing); dy = Math.sin(G.player.facing); }
    const a = Math.atan2(dy, dx), p = G.player;
    p.dashT = 0.16; p.dashVx = Math.cos(a) * 900; p.dashVy = Math.sin(a) * 900; p.invuln = Math.max(p.invuln, 0.35);
    dashCd = DASH_CD; G.burst(p.x, p.y, "#4dd0ff", 12); if (G.sfx) G.sfx("dash");
  }
  function triggerUlt() {
    if (!SKILLS_ENABLED || !started || dead || isPaused() || ultCd > 0) return;
    const p = G.player, w = G.world; ultCd = ULT_CD;
    if (G.sfx) G.sfx("ult"); G.shake(12, .4);
    for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; w.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, life: .5, color: "#ffd166", r: 4 }); }
    const R = 240;
    for (const e of w.enemies.slice()) {
      if (e.hp <= 0 || e.airborne) continue;
      if (U.dist(e.x, e.y, p.x, p.y) < R + e.r) { G.onPlayerHit(e, 3.5); const a = Math.atan2(e.y - p.y, e.x - p.x); e.x += Math.cos(a) * 60; e.y += Math.sin(a) * 60; }
    }
  }
  function updateSkillUI() {
    const sb = document.getElementById("skillBtns"); if (sb) sb.style.display = SKILLS_ENABLED ? "flex" : "none";
    if (!SKILLS_ENABLED) return;
    const db = document.getElementById("dashBtn"), ub = document.getElementById("ultBtn");
    if (!db) return;
    if (dashCd > 0) { db.classList.add("cooling"); document.getElementById("dashCd").textContent = Math.ceil(dashCd); } else db.classList.remove("cooling");
    if (ultCd > 0) { ub.classList.add("cooling"); document.getElementById("ultCd").textContent = Math.ceil(ultCd); } else ub.classList.remove("cooling");
  }

  // 連續擊殺
  let combo = 0, comboTimer = 0, comboPulse = 0;
  const COMBO_TIME = 3, CHEST_KILLS = 20, KILLS_FOR_BOSS = 20;
  G.onKill = function () {
    combo++; comboTimer = COMBO_TIME; comboPulse = 1;
    if (combo >= CHEST_KILLS) { spawnChest(); combo = 0; }
  };
  function spawnChest() {
    const w = G.world, area = w.area; if (!area || area.safe) return;
    let x, y, ok = false;
    for (let t = 0; t < 30 && !ok; t++) {
      x = U.rand(120, area.w - 120); y = U.rand(120, area.h - 120);
      ok = U.dist(x, y, G.player.x, G.player.y) > 120;
      if (ok) for (const o of w.obstacles) if (U.dist(x, y, o.x, o.y) < o.r + 40) { ok = false; break; }
    }
    w.chest = { x, y, age: 0 };
    G.toast("🎁 寶箱出現了！");
  }

  // 開場劇情
  const cine = { active: false, chief: null, talked: false };
  function startIntro() {
    cine.active = true; cine.talked = false; document.body.classList.add("cine");
    cine.chief = { x: G.player.x, y: Math.max(50, G.player.y - 340) };
  }
  function endIntro() {
    cine.active = false; cine.chief = null; document.body.classList.remove("cine");
    const bow = { uid: Date.now(), slot: "weapon", baseName: "破舊短弓", ic: "🏹", wtype: "bow", rarity: "common", ilvl: 1, affixes: [], plus: 0 };
    G.addToBag(bow); // 武器欄為空會自動裝備
    G.save.introDone = true; G.persist(); if (G.refreshHud) G.refreshHud();
  }

  // 一鍵回城（受傷會中斷）
  let recalling = false, recallT = 0, recallPrevHp = 0;
  function startRecall() {
    if (!started || dead) return;
    if (G.world.area && G.world.area.safe) { G.toast("已在城鎮"); return; }
    if (recalling) { recalling = false; G.toast("已取消回城"); return; }
    recalling = true; recallT = 1.8; G.toast("回城中…（受傷會中斷）");
  }
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  function keyboardVector() {
    let dx = 0, dy = 0;
    if (keys["w"] || keys["arrowup"]) dy -= 1;
    if (keys["s"] || keys["arrowdown"]) dy += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;
    return { dx, dy, mag: (dx || dy) ? 1 : 0 };
  }

  const joy = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0, id: null };
  let npcBtns = []; // [{x,y,w,h,action}] NPC 頭上按鈕（畫布座標）
  function tryNpcTap(lx, ly) {
    for (const b of npcBtns) if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
      if (b.action === "blacksmith") G.openBlacksmith(); else if (b.action === "goddess") G.openGoddess();
      return true;
    }
    return false;
  }
  function moveZoneTop() { return H * 0.85; } // 下方 15% 為固定控制區
  function joyBaseY() { const z = moveZoneTop(); return z + (H - z) / 2; }
  function joyMax() { const z = moveZoneTop(); return Math.min(52, (H - z) / 2 - 6); }
  function toLocalX(x) { return x - (window.innerWidth - W) / 2; } // 桌機畫面置中時換算為畫布座標
  function pStart(x, y, id) {
    if (G.audioResume) G.audioResume();
    if (isPaused() || controlMode !== "touch") return;
    if (y < moveZoneTop()) return; // 只有下方控制區能啟動移動
    joy.active = true; joy.id = id; joy.ox = W / 2; joy.oy = joyBaseY(); // 固定底座
    pMove(x, y);
  }
  function pMove(x, y) {
    if (!joy.active) return;
    x = toLocalX(x);
    let dx = x - joy.ox, dy = y - joy.oy; const max = joyMax(), m = Math.hypot(dx, dy);
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    joy.dx = dx; joy.dy = dy; joy.mag = Math.min(m, max) / max;
  }
  function pEnd() { joy.active = false; joy.mag = 0; joy.dx = 0; joy.dy = 0; }

  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); const t = e.changedTouches[0]; if (!isPaused() && tryNpcTap(toLocalX(t.clientX), t.clientY)) return; pStart(t.clientX, t.clientY, t.identifier); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joy.id) pMove(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener("touchend", (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joy.id) pEnd(); }, { passive: false });
  canvas.addEventListener("touchcancel", (e) => { e.preventDefault(); pEnd(); }, { passive: false });
  let mouseDown = false;
  canvas.addEventListener("mousedown", (e) => { if (!isPaused() && tryNpcTap(toLocalX(e.clientX), e.clientY)) return; mouseDown = true; pStart(e.clientX, e.clientY, "m"); });
  window.addEventListener("mousemove", (e) => { if (mouseDown) pMove(e.clientX, e.clientY); });
  window.addEventListener("mouseup", () => { mouseDown = false; pEnd(); });

  // ---------- 攻擊（依武器類型分流）----------
  function nearestEnemy(x, y) {
    let t = null, b = Infinity;
    for (const e of G.world.enemies) { if (e.hp <= 0 || e.airborne) continue; const d = U.dist(x, y, e.x, e.y); if (d < b) { b = d; t = e; } }
    return t;
  }
  function playerAttack() {
    const cls = G.player.weaponClass;
    if (cls === "melee") { meleeSwing(); if (G.sfx) G.sfx("melee"); }
    else if (cls === "summon") { /* 召喚由 summon timer 處理，不直接攻擊 */ }
    else { fireProjectiles(G.player.weaponType === "staff"); if (G.sfx) G.sfx("shoot"); }
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
  // 雙手劍 / 匕首：建立一個持續動畫的近戰攻擊（跟隨角色、碰到才受傷）
  function meleeSwing() {
    const w = G.world, p = G.player, WT = p.weapon;
    const tgt = nearestEnemy(p.x, p.y);
    const baseAng = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
    p.facing = baseAng;
    const reach = (WT.reach || 100) * (1 + (p.rangePct || 0) / 100);
    if (p.whirlT > 0) {
      // 旋風斬：全方位大範圍旋轉
      w.swings.push({ type: "sword", ang: baseAng, arcHalf: Math.PI * 0.95, reach: reach * 1.3, width: 26, life: 0.32, maxLife: 0.32, hits: [], dir: Math.random() < 0.5 ? 1 : -1 });
    } else if (p.weaponType === "dagger") {
      w.swings.push({ type: "dagger", ang: baseAng, reach, width: 12, life: 0.18, maxLife: 0.18, hits: [] });
    } else {
      const arcHalf = (WT.arcHalf || 1.05);
      w.swings.push({ type: "sword", ang: baseAng, arcHalf, reach, width: 24, life: 0.26, maxLife: 0.26, hits: [], dir: Math.random() < 0.5 ? 1 : -1 });
    }
    G.shake(3, 0.08);
  }
  // 點到線段最短距離（近戰命中判定）
  function segDist(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = U.clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  // 法書：召喚史萊姆
  function spawnMinion() {
    const p = G.player;
    const hp = 60 + G.save.level * 14;
    G.world.minions.push({ x: p.x + U.rand(-30, 30), y: p.y + U.rand(-30, 30), r: 12, hp, maxHp: hp, atkCd: 0 });
  }
  function enemyShoot(e, ang) {
    const sp = 220;
    G.world.foeShots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: e.dmg, life: 1.6, r: 7 });
  }

  // ---------- 攻擊範圍讀條（telegraph，可重用於任何敵人）----------
  // cfg: { shape:'circle'|'sector'|'rect', radius, arcHalf, length, width, dur, dmg, track, lockBefore, ang, cd, onFire }
  function startCast(e, cfg) {
    e.cast = Object.assign({ ox: e.x, oy: e.y, ang: 0, t: 0, fired: false, track: false, lockBefore: 0 }, cfg);
  }
  function updateCast(e, dt) {
    const p = G.player, c = e.cast;
    c.t += dt;
    c.ox = e.x; c.oy = e.y; // 原點跟隨敵人
    const tracking = c.track && c.t < c.dur - (c.lockBefore || 0);
    if (tracking && c.shape !== "circle") c.ang = Math.atan2(p.y - c.oy, p.x - c.ox);
    if (!c.fired && c.t >= c.dur) {
      c.fired = true;
      e.lastCastAng = c.ang;
      if (c.dmg > 0 && castContains(c, p.x, p.y, p.r)) G.damagePlayer(c.dmg, e, e.elem, e.boss);
      addFlash(c, elemColor(e.elem)); // 全範圍命中特效
      const cb = c.onFire; e.cast = null; e.castCd = c.cd || 1.6;
      if (cb) cb(e);
    }
  }
  function elemColor(elem) { return elem === "fire" ? "#ff7a3a" : elem === "frost" ? "#7fd0ff" : elem === "lightning" ? "#cfa0ff" : "#ff5a5a"; }
  function addFlash(c, color) {
    G.world.flashes.push({ shape: c.shape, ox: c.ox, oy: c.oy, ang: c.ang || 0, radius: c.radius, arcHalf: c.arcHalf, length: c.length, width: c.width, centered: c.centered, t: 0, life: 0.22, color: color || "#ff5a5a" });
  }
  function drawFlash(f, cx, cy) {
    ctx.save(); ctx.translate(f.ox - cx, f.oy - cy); if (f.shape !== "circle") ctx.rotate(f.ang);
    ctx.globalAlpha = U.clamp(1 - f.t / f.life, 0, 1) * 0.55; ctx.fillStyle = f.color;
    if (f.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, f.radius, 0, Math.PI * 2); ctx.fill(); }
    else if (f.shape === "sector") { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, f.radius, -f.arcHalf, f.arcHalf); ctx.closePath(); ctx.fill(); }
    else { if (f.centered) ctx.fillRect(-f.length / 2, -f.width / 2, f.length, f.width); else ctx.fillRect(0, -f.width / 2, f.length, f.width); }
    ctx.globalAlpha = 1; ctx.restore();
  }
  function castContains(c, px, py, pr) {
    if (c.shape === "circle") return U.dist(px, py, c.ox, c.oy) <= c.radius + pr;
    if (c.shape === "sector") {
      if (U.dist(px, py, c.ox, c.oy) > c.radius + pr) return false;
      let d = Math.atan2(py - c.oy, px - c.ox) - c.ang;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) <= c.arcHalf;
    }
    // rect：沿 ang 向前 length、側向 width（centered=以原點為中心，可作正方形）
    const dx = px - c.ox, dy = py - c.oy;
    const lx = dx * Math.cos(c.ang) + dy * Math.sin(c.ang);
    const ly = -dx * Math.sin(c.ang) + dy * Math.cos(c.ang);
    if (c.centered) return Math.abs(lx) <= c.length / 2 + pr && Math.abs(ly) <= c.width / 2 + pr;
    return lx >= -pr && lx <= c.length + pr && Math.abs(ly) <= c.width / 2 + pr;
  }
  function drawTelegraph(c, cx, cy) {
    const prog = U.clamp(c.t / c.dur, 0, 1);
    ctx.save(); ctx.translate(c.ox - cx, c.oy - cy);
    if (c.shape !== "circle") ctx.rotate(c.ang);
    ctx.strokeStyle = "rgba(255,90,90,.7)"; ctx.lineWidth = 2; ctx.fillStyle = "rgba(255,40,40,.34)";
    if (c.shape === "circle") {
      ctx.beginPath(); ctx.arc(0, 0, c.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, c.radius * prog, 0, Math.PI * 2); ctx.fill();
    } else if (c.shape === "sector") {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, c.radius, -c.arcHalf, c.arcHalf); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, c.radius * prog, -c.arcHalf, c.arcHalf); ctx.closePath(); ctx.fill();
    } else if (c.centered) {
      ctx.strokeRect(-c.length / 2, -c.width / 2, c.length, c.width);
      ctx.fillRect(-c.length * prog / 2, -c.width / 2, c.length * prog, c.width);
    } else {
      ctx.strokeRect(0, -c.width / 2, c.length, c.width);
      ctx.fillRect(0, -c.width / 2, c.length * prog, c.width);
    }
    ctx.restore();
  }

  // ========== Boss 戰鬥：可重用招式建構工具 ==========
  function angTo(e) { return Math.atan2(G.player.y - e.y, G.player.x - e.x); }
  function bossShot(x, y, ang, speed, dmg, opts) {
    const s = { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, life: 4.5, r: 7, color: "#ff5470", turn: 0, accel: 0, boss: true };
    if (opts) Object.assign(s, opts);
    G.world.foeShots.push(s);
  }
  function addEmitter(e, em) { e.emitters.push(Object.assign({ t: 0, acc: 0, n: 0 }, em)); }
  function addFreeCast(cfg) { G.world.casts.push(Object.assign({ t: 0, fired: false, dmg: 0, arcHalf: 0, radius: 0, length: 0, width: 0, ang: 0, mode: "aoe", boss: true }, cfg)); }
  // 在玩家周圍預警生成一批敵人（召喚波）
  function summonAround(typeId, n, radius) {
    const p = G.player;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = radius * (0.55 + Math.random() * 0.55); G.spawnPendingAt(typeId, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.8); }
  }

  // ---- 普攻模式池（較輕量，依 atkCd 觸發）----
  const ATTACKS = {
    aimVolley(e) { const a = angTo(e); for (let i = -2; i <= 2; i++) bossShot(e.x, e.y, a + i * 0.16, 260, e.dmg, { r: 7 }); },
    ring(e) { const n = 16, off = Math.random() * Math.PI; for (let i = 0; i < n; i++) bossShot(e.x, e.y, off + i / n * Math.PI * 2, 200, e.dmg, { r: 7, color: "#ff7aa0" }); },
    spiral(e) { addEmitter(e, { dur: 1.3, ang: Math.random() * 6, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.08) { em.acc -= 0.08; em.ang += 0.5; bossShot(en.x, en.y, em.ang, 230, en.dmg, { r: 6, color: "#ffd166" }); bossShot(en.x, en.y, em.ang + Math.PI, 230, en.dmg, { r: 6, color: "#ffd166" }); } } }); },
    aimBurst(e) { addEmitter(e, { dur: 0.7, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.14 && em.n < 4) { em.acc -= 0.14; em.n++; bossShot(en.x, en.y, angTo(en), 330, en.dmg, { r: 8 }); } } }); },
    wallRect(e) { addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: angTo(e), length: 380, width: 66, dur: 1.0, dmg: e.dmg * 1.3 }); },
    sectorSlash(e) { addFreeCast({ shape: "sector", ox: e.x, oy: e.y, ang: angTo(e), radius: 160, arcHalf: Math.PI / 6, dur: 0.7, dmg: e.dmg * 1.2 }); },
    bigBite(e) { addFreeCast({ shape: "sector", ox: e.x, oy: e.y, ang: angTo(e), radius: 250, arcHalf: Math.PI * 0.42, dur: 0.85, dmg: e.dmg * 1.5, big: true }); }, // 超大範圍扇形撕咬
    coneBurst(e) { const a = angTo(e); for (let i = -4; i <= 4; i++) bossShot(e.x, e.y, a + i * 0.1, 250, e.dmg, { r: 7, color: "#ff8aa0" }); },
    homingOrbs(e) { for (let i = 0; i < 3; i++) bossShot(e.x, e.y, angTo(e) + (i - 1) * 0.4, 175, e.dmg, { r: 8, color: "#ff9f40", homingT: 1.8, homTurn: 2.2, life: 2.4 }); },
    twinSpiral(e) { addEmitter(e, { dur: 1.4, ang: Math.random() * 6, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.07) { em.acc -= 0.07; em.ang += 0.45; for (let k = 0; k < 2; k++) bossShot(en.x, en.y, em.ang + k * Math.PI, 235, en.dmg, { r: 6, color: "#ffd166" }); } } }); },
  };

  // ---- 大招（蓄力後三選一；e.tier 隨難度提升使持續時間/數量疊加）----
  const ULTS = {
    novaRing(e) { for (let wv = 0; wv < 2 + (e.tier > 2 ? 1 : 0); wv++) { const n = 24; for (let i = 0; i < n; i++) bossShot(e.x, e.y, wv * 0.13 + i / n * Math.PI * 2, 160 + wv * 55, e.dmg, { r: 8 }); } addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 150, dur: 0.9, dmg: e.dmg * 1.6, big: true }); e.ultMin = 1.3; },
    meteorRain(e) { const dur = 2.4 + e.tier * 0.4; e.ultMin = dur + 0.3; addEmitter(e, { dur, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.2) { em.acc -= 0.2; const p = G.player; addFreeCast({ shape: "circle", ox: p.x + U.rand(-180, 180), oy: p.y + U.rand(-180, 180), radius: 66, dur: 0.85, dmg: en.dmg * 1.3 }); } } }); },
    sectorSweep(e) { const reps = 3 + e.tier; e.ultMin = reps * 0.55 + 0.4; addEmitter(e, { dur: reps * 0.55, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.55 && em.n < reps) { em.acc -= 0.55; em.n++; addFreeCast({ shape: "sector", ox: en.x, oy: en.y, ang: angTo(en) + U.rand(-.3, .3), radius: 250, arcHalf: Math.PI / 3, dur: 0.8, dmg: en.dmg * 1.4 }); } } }); },
    crossBeams(e) { const waves = 2 + (e.tier > 1 ? 1 : 0); const fire = (rot) => { for (let k = 0; k < 4; k++) addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: rot + k * Math.PI / 2, length: 800, width: 72, dur: 1.1, dmg: e.dmg * 1.5 }); }; fire(Math.random() * Math.PI); e.ultMin = waves * 0.7 + 0.6; addEmitter(e, { dur: waves * 0.7, gap: 0.65, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < waves - 1) { em.acc -= em.gap; em.n++; fire(Math.random() * Math.PI); } } }); },
    bulletRings(e) { const reps = 3 + e.tier; e.ultMin = reps * 0.5 + 0.4; addEmitter(e, { dur: reps * 0.5, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.5 && em.n < reps) { em.acc -= 0.5; em.n++; const cnt = 18 + em.n * 2, off = em.n * 0.2; for (let i = 0; i < cnt; i++) bossShot(en.x, en.y, off + i / cnt * Math.PI * 2, 185, en.dmg, { r: 7, color: "#a0e0ff" }); } } }); },
    spiralStorm(e) { const dur = 2.6 + e.tier * 0.4; e.ultMin = dur + 0.2; addEmitter(e, { dur, ang: Math.random() * 6, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.06) { em.acc -= 0.06; em.ang += 0.42; for (let arm = 0; arm < 3; arm++) bossShot(en.x, en.y, em.ang + arm * Math.PI * 2 / 3, 210, en.dmg, { r: 6, color: "#c77dff" }); } } }); },
    // ---- 新增複合招式 ----
    jumpSlam(e) { // 跳起消失，紅圈從落點起追玩家 2 秒、再 0.4 秒後砸下
      e.airborne = true; e.ultMin = 2.9;
      addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 135, dur: 2.4, followT: 2.0, chaseSpeed: 165, dmg: e.dmg * 2.0, big: true, onFire: (c) => { e.airborne = false; e.x = c.ox; e.y = c.oy; } });
    },
    jumpCross(e) { // 跳躍砸地 + 落地追加十字光束與彈環
      e.airborne = true; e.ultMin = 3.3;
      addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 145, dur: 2.4, followT: 2.0, chaseSpeed: 165, dmg: e.dmg * 2.0, big: true, onFire: (c) => {
        e.airborne = false; e.x = c.ox; e.y = c.oy;
        for (let k = 0; k < 4; k++) addFreeCast({ shape: "rect", ox: c.ox, oy: c.oy, ang: k * Math.PI / 2 + Math.random() * 0.3, length: 760, width: 74, dur: 0.9, dmg: e.dmg * 1.4 });
        const cnt = 20; for (let i = 0; i < cnt; i++) bossShot(c.ox, c.oy, i / cnt * Math.PI * 2, 180, e.dmg, { r: 7 });
      } });
    },
    homingBloom(e) { // 追蹤彈，數秒後原地化為圓形範圍爆炸
      e.ultMin = 2.8; const n = 4 + e.tier;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; bossShot(e.x, e.y, a, 150, e.dmg, { r: 9, color: "#ff9f40", homingT: 2.0, homTurn: 2.2, life: 2.0, bloom: true, bloomR: 85, bloomDmg: e.dmg * 1.4 }); }
    },
    fieldSweepH(e) { // 全場橫向矩形逐排掃描，需走位到已觸發排（間隔加大方便閃避）
      const rows = 5 + e.tier, area = G.world.area, gap = 0.95, top = U.clamp(G.player.y - 320, 120, area.h - 120 - rows * 150);
      e.ultMin = rows * gap + 0.7;
      addEmitter(e, { dur: rows * gap + 0.3, gap, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < rows) { em.acc -= em.gap; const oy = top + em.n * 150; em.n++; addFreeCast({ shape: "rect", centered: true, ox: area.w / 2, oy, ang: 0, length: area.w, width: 120, dur: 0.65, dmg: en.dmg * 1.2 }); } } });
    },
    fieldSweepV(e) { // 全場縱向矩形逐列掃描
      const cols = 5 + e.tier, area = G.world.area, gap = 0.95, left = U.clamp(G.player.x - 320, 120, area.w - 120 - cols * 150);
      e.ultMin = cols * gap + 0.7;
      addEmitter(e, { dur: cols * gap + 0.3, gap, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < cols) { em.acc -= em.gap; const ox = left + em.n * 150; em.n++; addFreeCast({ shape: "rect", centered: true, ox, oy: area.h / 2, ang: Math.PI / 2, length: area.h, width: 120, dur: 0.65, dmg: en.dmg * 1.2 }); } } });
    },
    megaCharge(e) { // 大範圍光波橫掃，更寬更長
      const reps = 2 + e.tier; e.ultMin = reps * 0.7 + 0.5;
      addEmitter(e, { dur: reps * 0.7, gap: 0.7, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < reps) { em.acc -= em.gap; em.n++; addFreeCast({ shape: "rect", ox: en.x, oy: en.y, ang: angTo(en), length: 900, width: 170, dur: 0.8, mode: "wave", dmg: en.dmg * 1.5, big: true }); } } });
    },
    bomberSwarm(e) { e.ultMin = 1.4; summonAround("bomber", 5 + e.tier, 250); },
    chargerRush(e) { e.ultMin = 1.4; summonAround("charger", 3 + e.tier, 300); },
    boxTrap(e) { // 玩家周圍正方形 AOE（需離開方框）+ 彈環
      e.ultMin = 1.6; const p = G.player, s = 210;
      addFreeCast({ shape: "rect", centered: true, ox: p.x, oy: p.y, ang: 0, length: s, width: s, dur: 1.0, dmg: e.dmg * 1.6 });
      const cnt = 16; for (let i = 0; i < cnt; i++) bossShot(e.x, e.y, i / cnt * Math.PI * 2, 175, e.dmg, { r: 7, color: "#a0e0ff" });
    },
    spiralPlusRing(e) { // 螺旋風暴 + 週期彈環（複合）
      ULTS.spiralStorm(e); e.ultMin = 3.0;
      addEmitter(e, { dur: 3.0, gap: 0.8, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap) { em.acc -= em.gap; const cnt = 16; for (let i = 0; i < cnt; i++) bossShot(en.x, en.y, i / cnt * Math.PI * 2 + 0.2, 170, en.dmg, { r: 7, color: "#a0e0ff" }); } } });
    },
  };

  // ===== 各 Boss 專屬招式（不重複；越後面越長越複雜）=====
  const TAU = Math.PI * 2, area0 = () => G.world.area;
  Object.assign(ATTACKS, {
    // 史萊姆王（分裂/黏液）
    slimeSpit(e) { const a = angTo(e); for (let i = -1; i <= 1; i++) bossShot(e.x, e.y, a + i * 0.22, 180, e.dmg, { r: 9, color: "#6fd06f" }); },
    slimeRing(e) { const n = 12, o = Math.random() * TAU; for (let i = 0; i < n; i++) bossShot(e.x, e.y, o + i / n * TAU, 150, e.dmg, { r: 8, color: "#8fe08f" }); },
    slimeSplit(e) { summonAround("slimelet", 2, 180); },
    // 狼王（衝鋒/撕咬/嚎叫）
    wolfBite(e) { const a = angTo(e); for (let i = -3; i <= 3; i++) bossShot(e.x, e.y, a + i * 0.12, 300, e.dmg, { r: 6, color: "#cfd6e0" }); },
    wolfHowl(e) { summonAround("wolf", 2, 260); },
    wolfVolley(e) { addEmitter(e, { dur: 0.6, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.12 && em.n < 4) { em.acc -= 0.12; em.n++; bossShot(en.x, en.y, angTo(en), 360, en.dmg, { r: 7, color: "#dfe6f0" }); } } }); },
    // 火猴王（火/投擲/旋轉）
    apeThrow(e) { for (let i = 0; i < 2; i++) bossShot(e.x, e.y, angTo(e) + (i ? 0.3 : -0.3), 170, e.dmg, { r: 9, color: "#ff8a3a", homingT: 1.6, homTurn: 2, life: 2.2 }); },
    apeCone(e) { const a = angTo(e); for (let i = -4; i <= 4; i++) bossShot(e.x, e.y, a + i * 0.1, 250, e.dmg, { r: 7, color: "#ff9a4a" }); },
    apeSpin(e) { const o = Math.random() * TAU; for (let k = 0; k < 4; k++) { const a = o + k * (TAU / 4); for (let j = -1; j <= 1; j++) bossShot(e.x, e.y, a + j * 0.12, 230, e.dmg, { r: 7, color: "#ffb14a" }); } },
    // 龍王（水/龍息/潮汐）
    dragBreath(e) { addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: angTo(e), length: 440, width: 72, dur: 0.8, mode: "wave", dmg: e.dmg * 1.3, big: true }); },
    dragTide(e) { const n = 16, o = Math.random() * TAU; for (let i = 0; i < n; i++) bossShot(e.x, e.y, o + i / n * TAU, 200, e.dmg, { r: 8, color: "#5fd0e0", turn: 0.5 }); },
    dragVolley(e) { const a = angTo(e); for (let i = -2; i <= 2; i++) bossShot(e.x, e.y, a + i * 0.16, 300, e.dmg, { r: 8, color: "#7fe0ff" }); },
    // 冰雪女王（冰/控場）
    iceShard(e) { const n = 14, o = Math.random() * TAU; for (let i = 0; i < n; i++) bossShot(e.x, e.y, o + i / n * TAU, 210, e.dmg, { r: 7, color: "#aee6ff" }); },
    iceLance(e) { addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: angTo(e), length: 440, width: 60, dur: 0.9, dmg: e.dmg * 1.3 }); },
    iceHoming(e) { for (let i = 0; i < 3; i++) bossShot(e.x, e.y, Math.random() * TAU, 150, e.dmg, { r: 8, color: "#bfe6ff", homingT: 2, homTurn: 2, life: 2.4 }); },
    // 巨大鳥妖（風/羽毛/俯衝）
    birdFeather(e) { const a = angTo(e); for (let i = -5; i <= 5; i++) bossShot(e.x, e.y, a + i * 0.09, 280, e.dmg, { r: 6, color: "#c9b0ff" }); },
    birdGust(e) { addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: angTo(e), length: 520, width: 130, dur: 0.7, mode: "wave", dmg: e.dmg * 1.2, big: true }); },
    birdHoming(e) { for (let i = 0; i < 4; i++) bossShot(e.x, e.y, angTo(e) + (i - 1.5) * 0.3, 180, e.dmg, { r: 7, color: "#d0bcff", homingT: 1.8, homTurn: 2.4, life: 2.2 }); },
    // 深淵巨獸（混沌/最複雜）
    abyssSpiral(e) { addEmitter(e, { dur: 1.5, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.06) { em.acc -= 0.06; em.ang += 0.5; for (let k = 0; k < 3; k++) bossShot(en.x, en.y, em.ang + k * (TAU / 3), 230, en.dmg, { r: 6, color: "#b46bff" }); } } }); },
    abyssBurst(e) { const a = angTo(e); for (let i = -3; i <= 3; i++) bossShot(e.x, e.y, a + i * 0.14, 320, e.dmg, { r: 8, color: "#c98bff" }); },
    abyssWall(e) { addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: angTo(e), length: 540, width: 84, dur: 0.9, dmg: e.dmg * 1.4, big: true }); },
    abyssBite(e) { addFreeCast({ shape: "sector", ox: e.x, oy: e.y, ang: angTo(e), radius: 290, arcHalf: Math.PI * 0.5, dur: 0.85, dmg: e.dmg * 1.5, big: true }); },
  });
  Object.assign(ULTS, {
    // —— 史萊姆王（短）——
    slimeNova(e) { for (let i = 0; i < 18; i++) bossShot(e.x, e.y, i / 18 * TAU, 160, e.dmg, { r: 8, color: "#6fd06f" }); addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 130, dur: 0.8, dmg: e.dmg * 1.5, big: true }); e.ultMin = 1.2; },
    slimeRain(e) { e.ultMin = 2.2; addEmitter(e, { dur: 2.0, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.3) { em.acc -= 0.3; const p = G.player; addFreeCast({ shape: "circle", ox: p.x + U.rand(-150, 150), oy: p.y + U.rand(-150, 150), radius: 60, dur: 0.8, dmg: en.dmg * 1.2 }); } } }); },
    slimeFlood(e) { e.ultMin = 2.0; const ar = area0(); addEmitter(e, { dur: 1.8, gap: 0.55, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < 3) { em.acc -= em.gap; const oy = U.clamp(G.player.y - 150 + em.n * 150, 120, ar.h - 120); em.n++; addFreeCast({ shape: "rect", centered: true, ox: ar.w / 2, oy, ang: 0, length: ar.w, width: 110, dur: 0.65, dmg: en.dmg * 1.2 }); } } }); },
    // —— 狼王 ——
    wolfPounce(e) { e.airborne = true; e.ultMin = 2.6; addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 140, dur: 2.0, followT: 1.6, chaseSpeed: 180, dmg: e.dmg * 1.9, big: true, onFire: (c) => { e.airborne = false; e.x = c.ox; e.y = c.oy; } }); },
    wolfTear(e) { e.ultMin = 2.0; addEmitter(e, { dur: 1.8, gap: 0.5, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < 3) { em.acc -= em.gap; em.n++; addFreeCast({ shape: "sector", ox: en.x, oy: en.y, ang: angTo(en) + U.rand(-0.4, 0.4), radius: 240, arcHalf: Math.PI * 0.4, dur: 0.7, dmg: en.dmg * 1.4 }); } } }); },
    wolfPack(e) { e.ultMin = 1.6; summonAround("wolf", 4, 300); },
    // —— 火猴王 ——
    apeMeteor(e) { e.ultMin = 2.6; addEmitter(e, { dur: 2.4, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.22) { em.acc -= 0.22; const p = G.player; addFreeCast({ shape: "circle", ox: p.x + U.rand(-170, 170), oy: p.y + U.rand(-170, 170), radius: 64, dur: 0.8, dmg: en.dmg * 1.3 }); } } }); },
    apeFlame(e) { e.ultMin = 2.8; addEmitter(e, { dur: 2.6, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.06) { em.acc -= 0.06; em.ang += 0.42; for (let k = 0; k < 2; k++) bossShot(en.x, en.y, em.ang + k * Math.PI, 220, en.dmg, { r: 6, color: "#ff8a3a" }); } } }); },
    apeCross(e) { e.ultMin = 2.0; const fire = (rot) => { for (let k = 0; k < 4; k++) addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: rot + k * (TAU / 4), length: 700, width: 70, dur: 1.0, dmg: e.dmg * 1.4 }); }; fire(Math.random() * Math.PI); addEmitter(e, { dur: 1.6, fn(en, dt, em) { if (!em.n && em.t >= 1.3) { em.n = 1; fire(Math.PI / 4); } } }); },
    // —— 龍王 ——
    dragTsunami(e) { e.ultMin = 2.6; addEmitter(e, { dur: 2.4, gap: 0.6, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < 3) { em.acc -= em.gap; em.n++; addFreeCast({ shape: "rect", ox: en.x, oy: en.y, ang: angTo(en), length: 820, width: 150, dur: 0.8, mode: "wave", dmg: en.dmg * 1.4, big: true }); } } }); },
    dragRings(e) { e.ultMin = 2.4; addEmitter(e, { dur: 2.2, gap: 0.45, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < 4) { em.acc -= em.gap; em.n++; const cnt = 18 + em.n * 2, o = em.n * 0.2; for (let i = 0; i < cnt; i++) bossShot(en.x, en.y, o + i / cnt * TAU, 190, en.dmg, { r: 7, color: "#5fd0e0" }); } } }); },
    dragSpiral(e) { e.ultMin = 3.0; addEmitter(e, { dur: 2.8, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.05) { em.acc -= 0.05; em.ang += 0.4; for (let k = 0; k < 3; k++) bossShot(en.x, en.y, em.ang + k * (TAU / 3), 210, en.dmg, { r: 6, color: "#7fe0ff" }); } } }); },
    // —— 冰雪女王 ——
    iceBlizzard(e) { e.ultMin = 3.4; const cols = 7, ar = area0(), left = U.clamp(G.player.x - 360, 120, ar.w - 120 - cols * 150); addEmitter(e, { dur: cols * 0.85 + 0.4, gap: 0.85, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < cols) { em.acc -= em.gap; const ox = left + em.n * 150; em.n++; addFreeCast({ shape: "rect", centered: true, ox, oy: ar.h / 2, ang: Math.PI / 2, length: ar.h, width: 120, dur: 0.65, dmg: en.dmg * 1.3 }); } } }); },
    iceNova(e) { e.ultMin = 1.9; const p = G.player, s = 220; addFreeCast({ shape: "rect", centered: true, ox: p.x, oy: p.y, ang: 0, length: s, width: s, dur: 1.0, dmg: e.dmg * 1.6 }); for (let i = 0; i < 20; i++) bossShot(e.x, e.y, i / 20 * TAU, 180, e.dmg, { r: 7, color: "#aee6ff" }); },
    iceStorm(e) { e.ultMin = 3.2; addEmitter(e, { dur: 3.0, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.05) { em.acc -= 0.05; em.ang += 0.38; for (let k = 0; k < 4; k++) bossShot(en.x, en.y, em.ang + k * (TAU / 4), 200, en.dmg, { r: 6, color: "#bfe6ff" }); } } }); },
    // —— 巨大鳥妖（更長）——
    birdDive(e) { e.airborne = true; e.ultMin = 3.0; addFreeCast({ shape: "circle", ox: e.x, oy: e.y, radius: 150, dur: 2.0, followT: 1.6, chaseSpeed: 190, dmg: e.dmg * 1.9, big: true, onFire: (c) => { e.airborne = false; e.x = c.ox; e.y = c.oy; for (let i = 0; i < 24; i++) bossShot(c.ox, c.oy, i / 24 * TAU, 200, e.dmg, { r: 7, color: "#c9b0ff" }); } }); },
    birdTornado(e) { e.ultMin = 3.4; const rows = 7, ar = area0(), top = U.clamp(G.player.y - 360, 120, ar.h - 120 - rows * 150); addEmitter(e, { dur: rows * 0.8 + 0.4, gap: 0.8, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < rows) { em.acc -= em.gap; const oy = top + em.n * 150; em.n++; addFreeCast({ shape: "rect", centered: true, ox: ar.w / 2, oy, ang: 0, length: ar.w, width: 120, dur: 0.6, dmg: en.dmg * 1.3 }); } } }); },
    birdStorm(e) { e.ultMin = 3.4; addEmitter(e, { dur: 3.2, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.045) { em.acc -= 0.045; em.ang += 0.4; for (let k = 0; k < 3; k++) bossShot(en.x, en.y, em.ang + k * (TAU / 3), 230, en.dmg, { r: 6, color: "#d0bcff" }); } } }); addEmitter(e, { dur: 3.2, gap: 0.7, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap) { em.acc -= em.gap; for (let i = 0; i < 16; i++) bossShot(en.x, en.y, i / 16 * TAU, 180, en.dmg, { r: 6, color: "#c9b0ff" }); } } }); },
    // —— 深淵巨獸（最長最複雜）——
    abyssCross(e) { e.ultMin = 3.6; const fire = (rot) => { for (let k = 0; k < 6; k++) addFreeCast({ shape: "rect", ox: e.x, oy: e.y, ang: rot + k * (Math.PI / 3), length: 900, width: 70, dur: 1.0, dmg: e.dmg * 1.5 }); }; fire(Math.random() * Math.PI); addEmitter(e, { dur: 3.2, gap: 0.9, fn(en, dt, em) { em.acc += dt; if (em.acc >= em.gap && em.n < 3) { em.acc -= em.gap; em.n++; fire(Math.random() * Math.PI); } } }); },
    abyssChaos(e) { e.ultMin = 3.8; addEmitter(e, { dur: 3.6, ang: Math.random() * TAU, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.04) { em.acc -= 0.04; em.ang += 0.37; for (let k = 0; k < 5; k++) bossShot(en.x, en.y, em.ang + k * (TAU / 5), 220, en.dmg, { r: 6, color: "#b46bff" }); } } }); },
    abyssRain(e) { e.ultMin = 3.6; addEmitter(e, { dur: 3.4, fn(en, dt, em) { em.acc += dt; if (em.acc >= 0.18) { em.acc -= 0.18; const p = G.player; addFreeCast({ shape: "circle", ox: p.x + U.rand(-200, 200), oy: p.y + U.rand(-200, 200), radius: 70, dur: 0.8, dmg: en.dmg * 1.4 }); } } }); },
    abyssRush(e) { e.ultMin = 2.0; summonAround("rock", 3, 300); summonAround("bird", 3, 320); },
  });

  function updateBoss(e, dt) {
    const p = G.player;
    const a = angTo(e), d = U.dist(e.x, e.y, p.x, p.y);
    for (let i = e.emitters.length - 1; i >= 0; i--) { const em = e.emitters[i]; em.t += dt; em.fn(e, dt, em); if (em.t >= em.dur) e.emitters.splice(i, 1); }

    if (e.ultState === "windup") {
      e.ultT += dt;
      if (e.ultT >= e.ultDur) { const id = U.pick(e.ults); (ULTS[id] || ULTS.novaRing)(e); e.ultState = "active"; e.ultActiveT = 0; }
      return;
    }
    if (e.ultState === "active") {
      e.ultActiveT += dt;
      if (e.emitters.length === 0 && !e.airborne && e.ultActiveT >= (e.ultMin || 1.2)) { e.ultState = "move"; e.ultCd = U.rand(6, 9); }
      return;
    }
    if (d > 200) { e.x += Math.cos(a) * e.baseSpeed * dt; e.y += Math.sin(a) * e.baseSpeed * dt; }
    e.atkCd -= dt;
    if (e.atkCd <= 0) { const id = U.pick(e.attacks); (ATTACKS[id] || ATTACKS.aimVolley)(e); e.atkCd = U.rand(1.5, 2.6); }
    e.ultCd -= dt;
    if (e.ultCd <= 0) { e.ultState = "windup"; e.ultT = 0; e.ultDur = 1.9; if (G.sfx) G.sfx("bossWarn"); }
  }

  // ---------- 更新 ----------
  function update(dt) {
    const w = G.world, p = G.player, area = w.area;
    const areaElem = area.elem || null;
    w.time += dt;

    // 開場劇情：村長走向玩家，抵達後對話
    if (cine.active && cine.chief) {
      const tx = p.x, ty = p.y - 58, a = Math.atan2(ty - cine.chief.y, tx - cine.chief.x), d = U.dist(cine.chief.x, cine.chief.y, tx, ty);
      if (d > 5) { cine.chief.x += Math.cos(a) * 200 * dt; cine.chief.y += Math.sin(a) * 200 * dt; }
      else if (!cine.talked) {
        cine.talked = true;
        G.startDialogue({ name: "村長", ic: "👴", lines: ["英雄！你終於來拯救我的村子了！", "這把弓雖然破舊…先拿去防身吧。", "願你凱旋歸來！"], options: [{ label: "（接過破舊短弓）", action: endIntro }] });
      }
    }

    // 技能冷卻
    if (dashCd > 0) dashCd -= dt;
    if (ultCd > 0) ultCd -= dt;
    updateSkillUI();

    // 連殺倒數
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
    if (comboPulse > 0) comboPulse -= dt * 3;

    // 玩家狀態：燃燒(火)、減速(冰)、麻痺(雷=移動會頓一下)
    if (p.burnT > 0) { p.burnT -= dt; p.burnAcc += p.burnDps * dt; if (p.burnAcc >= 1) { const d = Math.floor(p.burnAcc); p.burnAcc -= d; p.hp -= d; if (p.hp <= 0) { p.hp = 0; G.onPlayerDeath(); } } }
    if (p.chillT > 0) p.chillT -= dt; else p.chillPct = 0;
    if (p.paraT > 0) { p.paraT -= dt; p.paraTick -= dt; if (p.paraTick <= 0) { p.paraTick = U.rand(0.18, 0.4); p.stunT = 0.12; } }
    if (p.stunT > 0) p.stunT -= dt;
    const chillMul = p.chillT > 0 ? (1 - p.chillPct / 100) : 1;
    const stunned = p.stunT > 0;

    // 玩家移動（衝刺優先；麻痺頓挫時不能動；冰霜減速）
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x = U.clamp(p.x + p.dashVx * dt, p.r, area.w - p.r);
      p.y = U.clamp(p.y + p.dashVy * dt, p.r, area.h - p.r);
      p.moving = true;
    } else {
      let mvx = 0, mvy = 0, mag = 0;
      if (controlMode === "keyboard") {
        const kv = keyboardVector(); mvx = kv.dx; mvy = kv.dy; mag = kv.mag;
      } else if (joy.active) {
        mvx = joy.dx; mvy = joy.dy; mag = joy.mag;
      }
      p.moving = mag > 0.08 && !stunned && !cine.active;
      if (p.moving) {
        const a = Math.atan2(mvy, mvx), sp = p.moveSpeed * chillMul;
        p.x += Math.cos(a) * sp * mag * dt;
        p.y += Math.sin(a) * sp * mag * dt;
        p.x = U.clamp(p.x, p.r, area.w - p.r);
        p.y = U.clamp(p.y, p.r, area.h - p.r);
      }
    }
    // 障礙物阻擋
    for (const o of w.obstacles) { const dd = U.dist(p.x, p.y, o.x, o.y), min = o.r + p.r; if (dd > 0 && dd < min) { const a = Math.atan2(p.y - o.y, p.x - o.x); p.x = o.x + Math.cos(a) * min; p.y = o.y + Math.sin(a) * min; } }
    if (p.invuln > 0) p.invuln -= dt;
    // 再生
    if (p.procs.regen > 0) G.healPlayer(p.procs.regen * dt);

    // 面向最近敵人（指向工具持續跟隨）
    { const tg = nearestEnemy(p.x, p.y); if (tg) p.facing = Math.atan2(tg.y - p.y, tg.x - p.x); }

    // 旋風斬詞條：近戰每 8 秒進入旋風狀態 3 秒
    if (p.whirlT > 0) p.whirlT -= dt;
    if (p.procs.whirl > 0 && p.weaponClass === "melee") {
      p.whirlCd = (p.whirlCd || 0) - dt;
      if (p.whirlCd <= 0 && w.enemies.length) { p.whirlT = 3; p.whirlCd = 8; G.shake(4, .12); }
    }

    // 自動攻擊（持續，移動中也會攻擊，朝最近敵人；旋風時更快）
    p.cooldown -= dt;
    if (w.enemies.length && p.cooldown <= 0) { playerAttack(); p.cooldown = p.whirlT > 0 ? Math.min(p.fireInterval, 0.18) : p.fireInterval; }

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

    // 近戰攻擊：刀刃跟隨角色、依動畫掃過/刺出，碰到敵人才造成傷害
    for (let i = w.swings.length - 1; i >= 0; i--) {
      const m = w.swings[i]; m.life -= dt;
      const prog = U.clamp(1 - m.life / m.maxLife, 0, 1);
      if (m.type === "dagger") {
        const e = prog < 0.5 ? prog / 0.5 : 1 - (prog - 0.5) / 0.5; // 刺出再收回
        m.curAng = m.ang; m.curLen = m.reach * (0.4 + 0.6 * e);
      } else {
        m.curAng = m.ang + m.dir * (-m.arcHalf + 2 * m.arcHalf * prog); // 由身側掃到另一側
        m.curLen = m.reach;
      }
      const ex = p.x + Math.cos(m.curAng) * m.curLen, ey = p.y + Math.sin(m.curAng) * m.curLen;
      for (const en of w.enemies) {
        if (en.hp <= 0 || en.airborne || m.hits.includes(en)) continue;
        if (segDist(p.x, p.y, ex, ey, en.x, en.y) < en.r + m.width) { m.hits.push(en); G.onPlayerHit(en); }
      }
      if (m.life <= 0) w.swings.splice(i, 1);
    }

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
      if (!dead2) for (const o of w.obstacles) if (U.dist(b.x, b.y, o.x, o.y) < o.r) { dead2 = true; break; } // 被障礙物擋下
      if (!dead2) {
        for (const e of w.enemies) {
          if (e.hp <= 0 || e.airborne || b.hits.includes(e)) continue;
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
      // 麻痺/定身：停頓，不行動也不造成接觸傷害
      if (e.stunT > 0) { e.stunT -= dt; continue; }
      // 讀條 / 衝刺 覆寫一般行動
      if (e.cast) {
        updateCast(e, dt);
      } else if (e.dashT > 0) {
        e.dashT -= dt; e.x += e.dvx * dt; e.y += e.dvy * dt;
      } else {
        if (e.castCd > 0) e.castCd -= dt;
        switch (e.behavior) {
          case "ranged": {
            const want = 150;
            if (d > want + 45) { e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt; }
            else if (d < want - 45) { e.x -= Math.cos(a) * spd * dt; e.y -= Math.sin(a) * spd * dt; }
            e.fireCd -= dt; if (e.fireCd <= 0 && d < 230) { enemyShoot(e, a); e.fireCd = U.rand(1.6, 2.8); }
            break;
          }
          case "boss": {
            updateBoss(e, dt);
            break;
          }
          case "bomber": {
            // 衝向玩家，靠近後觸發圓形讀條並自爆（自爆死亡無獎勵）
            e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt;
            if (d < 70) startCast(e, { shape: "circle", radius: 95, dur: 0.85, dmg: e.dmg,
              onFire: (en) => { G.burst(en.x, en.y, "#ff8a3a", 26); G.shake(8, .25); G.vanishEnemy(en); } });
            break;
          }
          case "charger": {
            // 進入距離內停下，矩形讀條追蹤方向，最後 0.2s 鎖定後衝鋒
            if (d > 300) { e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt; }
            else if (e.castCd <= 0) startCast(e, { shape: "rect", length: 340, width: 60, dur: 1.1, lockBefore: 0.2, track: true, ang: a, dmg: 0, cd: U.rand(1.8, 2.6),
              onFire: (en) => { const ca = en.lastCastAng, len = 340, sp = 760; en.dashT = len / sp; en.dvx = Math.cos(ca) * sp; en.dvy = Math.sin(ca) * sp; G.shake(5, .15); } });
            break;
          }
          case "striker": {
            // 進入距離內觸發 90 度扇形
            if (d > 80) { e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt; }
            else if (e.castCd <= 0) startCast(e, { shape: "sector", radius: 100, arcHalf: Math.PI / 4, dur: 0.65, track: true, lockBefore: 0.1, ang: a, dmg: e.dmg, cd: U.rand(1.0, 1.8) });
            break;
          }
          default: { // chase
            e.x += Math.cos(a) * spd * dt; e.y += Math.sin(a) * spd * dt;
          }
        }
      }
      // 分離
      for (const o of w.enemies) {
        if (o === e || o.hp <= 0) continue;
        const dd = U.dist(e.x, e.y, o.x, o.y);
        if (dd > 0 && dd < e.r + o.r) { const pa = Math.atan2(e.y - o.y, e.x - o.x); const push = (e.r + o.r - dd) * .5; e.x += Math.cos(pa) * push; e.y += Math.sin(pa) * push; }
      }
      e.x = U.clamp(e.x, e.r, area.w - e.r); e.y = U.clamp(e.y, e.r, area.h - e.r);
      for (const o of w.obstacles) { const dd = U.dist(e.x, e.y, o.x, o.y), mn = o.r + e.r; if (dd > 0 && dd < mn) { const oa = Math.atan2(e.y - o.y, e.x - o.x); e.x = o.x + Math.cos(oa) * mn; e.y = o.y + Math.sin(oa) * mn; } }
      // 接觸傷害（空中的 Boss 不造成接觸傷害）
      e.touchCd -= dt;
      if (!e.airborne && d < e.r + p.r && e.touchCd <= 0) { G.damagePlayer(e.dmg, e, e.elem, e.boss); e.touchCd = 0.6; }
    }

    // 召喚物（史萊姆）：追蹤並攻擊最近敵人
    for (let i = w.minions.length - 1; i >= 0; i--) {
      const m = w.minions[i];
      const tgt = nearestEnemy(m.x, m.y);
      if (tgt) {
        const a = Math.atan2(tgt.y - m.y, tgt.x - m.x), d = U.dist(m.x, m.y, tgt.x, tgt.y);
        if (d > m.r + tgt.r + 2) { m.x += Math.cos(a) * 185 * dt; m.y += Math.sin(a) * 185 * dt; }
        m.atkCd -= dt;
        // 召喚物造成傷害並套用玩家天賦/特效（含召喚強化詞條）
        if (d < m.r + tgt.r + 5 && m.atkCd <= 0) { G.onPlayerHit(tgt, 0.85 * (1 + (p.minionPct || 0) / 100)); m.atkCd = 0.45; m.hp -= tgt.dmg * 0.3; }
      } else {
        const a = Math.atan2(p.y - m.y, p.x - m.x), d = U.dist(m.x, m.y, p.x, p.y);
        if (d > 60) { m.x += Math.cos(a) * 160 * dt; m.y += Math.sin(a) * 160 * dt; }
      }
      m.x = U.clamp(m.x, m.r, area.w - m.r); m.y = U.clamp(m.y, m.r, area.h - m.r);
      if (m.hp <= 0) { G.burst(m.x, m.y, "#5fc46b", 8); w.minions.splice(i, 1); }
    }

    // 敵人子彈（支援追蹤 homing / 轉向 / 加速 / 到期化為範圍爆炸 bloom）
    for (let i = w.foeShots.length - 1; i >= 0; i--) {
      const s = w.foeShots[i];
      if (s.homingT && s.homingT > 0) { s.homingT -= dt; const cur = Math.atan2(s.vy, s.vx); let diff = Math.atan2(p.y - s.y, p.x - s.x) - cur; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; const na = cur + U.clamp(diff, -(s.homTurn || 2) * dt, (s.homTurn || 2) * dt), sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; }
      if (s.turn) { const ang = Math.atan2(s.vy, s.vx) + s.turn * dt, sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(ang) * sp; s.vy = Math.sin(ang) * sp; }
      if (s.accel) { const ang = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy) + s.accel * dt; s.vx = Math.cos(ang) * sp; s.vy = Math.sin(ang) * sp; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const out = s.x < -30 || s.x > area.w + 30 || s.y < -30 || s.y > area.h + 30;
      let blocked = false; for (const o of w.obstacles) if (U.dist(s.x, s.y, o.x, o.y) < o.r) { blocked = true; break; }
      if (s.life <= 0 || out || blocked) { if (s.bloom && !out && !blocked) addFreeCast({ shape: "circle", ox: s.x, oy: s.y, radius: s.bloomR || 80, dur: 0.7, dmg: s.bloomDmg || s.dmg }); w.foeShots.splice(i, 1); continue; }
      if (U.dist(s.x, s.y, p.x, p.y) < p.r + s.r) { G.damagePlayer(s.dmg, null, areaElem, s.boss); if (s.bloom) addFreeCast({ shape: "circle", ox: s.x, oy: s.y, radius: s.bloomR || 80, dur: 0.7, dmg: s.bloomDmg || s.dmg }); w.foeShots.splice(i, 1); }
    }

    // 移動光波（實體碰撞傷害：碰到才受傷）
    for (let i = w.waves.length - 1; i >= 0; i--) {
      const v = w.waves[i]; v.traveled += v.speed * dt;
      if (!v.hit) {
        const dx = p.x - v.ox, dy = p.y - v.oy;
        const lx = dx * Math.cos(v.ang) + dy * Math.sin(v.ang), ly = -dx * Math.sin(v.ang) + dy * Math.cos(v.ang);
        if (Math.abs(lx - v.traveled) < v.thickness / 2 + p.r && Math.abs(ly) < v.width / 2 + p.r) { G.damagePlayer(v.dmg, null, areaElem, v.boss); v.hit = true; }
      }
      if (v.traveled > v.maxLen) w.waves.splice(i, 1);
    }

    // 自由攻擊讀條（Boss 大招/陷阱用）：aoe=讀條完仍在範圍內受傷；wave=放出光波
    for (let i = w.casts.length - 1; i >= 0; i--) {
      const c = w.casts[i]; c.t += dt;
      if (c.followT && c.t < c.followT) {
        if (c.chaseSpeed) { // 從原點以有限速度追向玩家（可閃避）
          const ca = Math.atan2(p.y - c.oy, p.x - c.ox), dd = U.dist(c.ox, c.oy, p.x, p.y), step = Math.min(dd, c.chaseSpeed * dt);
          c.ox += Math.cos(ca) * step; c.oy += Math.sin(ca) * step;
        } else { c.ox = p.x; c.oy = p.y; }
        if (c.shape !== "circle") c.ang = Math.atan2(p.y - c.oy, p.x - c.ox);
      }
      if (!c.fired && c.t >= c.dur) {
        c.fired = true;
        if (c.mode === "wave") { w.waves.push({ ox: c.ox, oy: c.oy, ang: c.ang || 0, width: c.width || 60, thickness: 36, speed: 560, traveled: 0, maxLen: c.length || 400, dmg: c.dmg, color: "#ffcf66", hit: false, boss: c.boss }); }
        else if (castContains(c, p.x, p.y, p.r)) G.damagePlayer(c.dmg, null, areaElem, c.boss);
        // AOE 命中特效：整個範圍亮起 + 圓形附加擴散環
        const col = areaElem === "fire" ? "#ff7a3a" : areaElem === "frost" ? "#7fd0ff" : areaElem === "lightning" ? "#cfa0ff" : "#ff6644";
        addFlash(c, col);
        if (c.shape === "circle") w.particles.push({ ring: true, x: c.ox, y: c.oy, r1: c.radius, life: 0.35, maxLife: 0.35, color: col, lw: 5 });
        G.burst(c.ox, c.oy, col, 12);
        G.shake(c.big ? 7 : 3, c.big ? .25 : .1);
        if (c.onFire) c.onFire(c);
      }
      if (c.t >= c.dur + 0.12) w.casts.splice(i, 1);
    }

    // AOE 全範圍命中閃光
    for (let i = w.flashes.length - 1; i >= 0; i--) { w.flashes[i].t += dt; if (w.flashes[i].t >= w.flashes[i].life) w.flashes.splice(i, 1); }

    // 待生成敵人（紅色預警 → 1 秒後出現）
    for (let i = w.spawns.length - 1; i >= 0; i--) {
      const sp = w.spawns[i]; sp.t += dt;
      if (sp.t >= sp.dur) { G.materializeEnemy(sp.typeId, sp.x, sp.y); w.spawns.splice(i, 1); }
    }

    // 粒子
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const pt = w.particles[i]; pt.life -= dt;
      if (!pt.line && !pt.ring) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= .92; pt.vy *= .92; }
      if (pt.life <= 0) w.particles.splice(i, 1);
    }
    // 浮動數字
    for (let i = w.floats.length - 1; i >= 0; i--) {
      const f = w.floats[i]; f.y += f.vy * dt; f.vy += 60 * dt; f.life -= dt;
      if (f.life <= 0) w.floats.splice(i, 1);
    }

    // 刷怪（密度提升：落後較多時一次補兩隻）
    if (!area.safe) {
      w.spawnTimer -= dt;
      const alive = w.enemies.length + w.spawns.length;
      if (w.spawnTimer <= 0 && alive < area.maxAlive) {
        G.spawnEnemy();
        if (alive < area.maxAlive - 2) G.spawnEnemy();
        w.spawnTimer = U.rand(0.5, 1.1);
      }
      // 六芒星祭壇：站入填滿進度 → 延遲 2 秒後在祭壇召喚 Boss
      const al = w.altar;
      if (al && !w.bossSpawned) {
        if (al.summoning) {
          al.delay -= dt;
          if (al.delay <= 0) { G.spawnBoss(al.x, al.y); w.altar = null; }
        } else if ((w.killCount || 0) >= KILLS_FOR_BOSS) { // 需先擊殺 50 隻
          const inside = U.dist(p.x, p.y, al.x, al.y) < al.r;
          al.progress = U.clamp(al.progress + (inside ? dt / 3.5 : -dt * 0.5), 0, 1);
          if (al.progress >= 1) { al.summoning = true; al.delay = 2.0; G.toast("⚠ 祭壇啟動！Boss 即將降臨…"); }
        }
      }
      // 寶箱拾取
      if (w.chest) {
        w.chest.age += dt;
        if (U.dist(p.x, p.y, w.chest.x, w.chest.y) < p.r + 22) { G.chestLoot(w.chest.x, w.chest.y, area); G.toast("🎁 開啟寶箱！"); if (G.sfx) G.sfx("level"); w.chest = null; }
      }
    }

    // 拾取地面道具（拾取範圍內自動吸取）
    const pr = p.pickRange || 60;
    if (w.magnetT > 0) w.magnetT -= dt;
    const mag = w.magnetT > 0; // 磁鐵啟動：全圖吸取（依正常速度飛向玩家）
    for (let i = w.grounds.length - 1; i >= 0; i--) {
      const g = w.grounds[i]; g.age += dt; g.bob = Math.sin(g.age * 4) * 3;
      const gd = U.dist(g.x, g.y, p.x, p.y);
      if (gd < p.r + 16) {
        if (g.special === "magnet") { if (G.sfx) G.sfx("pickup"); w.magnetT = 10; G.toast("🧲 磁鐵！全圖物品飛向你"); }
        else G.addToBag(g.item);
        w.grounds.splice(i, 1); continue;
      }
      if (gd < pr || mag) { const a = Math.atan2(p.y - g.y, p.x - g.x), sp = U.clamp(130 + (pr - gd) * 3, 150, 480); g.x += Math.cos(a) * sp * dt; g.y += Math.sin(a) * sp * dt; }
      else if (g.age > 60) w.grounds.splice(i, 1);
    }

    // 經驗球（噴出後可被拾取範圍吸取，碰到才入帳）
    for (let i = w.orbs.length - 1; i >= 0; i--) {
      const o = w.orbs[i]; o.age += dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.9; o.vy *= 0.9;
      const od = U.dist(o.x, o.y, p.x, p.y);
      if (od < p.r + 14) { G.gainXp(o.xp); if (G.sfx) G.sfx("pickup"); w.orbs.splice(i, 1); continue; }
      if (od < pr || mag) { const a = Math.atan2(p.y - o.y, p.x - o.x), sp = U.clamp(170 + (pr - od) * 4, 190, 600); o.x += Math.cos(a) * sp * dt; o.y += Math.sin(a) * sp * dt; }
      else if (o.age > 45) w.orbs.splice(i, 1);
    }

    // 金幣（地上硬幣，拾取入帳）
    for (let i = w.coins.length - 1; i >= 0; i--) {
      const o = w.coins[i]; o.age += dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.9; o.vy *= 0.9;
      const od = U.dist(o.x, o.y, p.x, p.y);
      if (od < p.r + 14) { G.save.gold += o.gold; document.getElementById("coins").textContent = "🪙 " + G.save.gold; if (G.sfx) G.sfx("pickup"); w.coins.splice(i, 1); continue; }
      if (od < pr || mag) { const a = Math.atan2(p.y - o.y, p.x - o.x), sp = U.clamp(170 + (pr - od) * 4, 190, 600); o.x += Math.cos(a) * sp * dt; o.y += Math.sin(a) * sp * dt; }
      else if (o.age > 45) w.coins.splice(i, 1);
    }

    // 傳送門偵測
    updatePortalPrompt();

    // 回城倒數（受傷中斷）
    if (recalling) {
      if (p.hp < recallPrevHp - 0.5) { recalling = false; G.toast("回城被打斷！"); }
      else { recallT -= dt; if (recallT <= 0) { recalling = false; G.enterArea("town"); G.toast("已回到城鎮"); } }
    }
    recallPrevHp = p.hp;

    // 震動衰減
    if (w.shakeT > 0) { w.shakeT -= dt; if (w.shakeT <= 0) w.shakeMag = 0; }

    // HUD（HP 變動頻繁，每幀更新血條）
    document.getElementById("hpbar").style.width = (p.hp / p.maxHp * 100) + "%";
  }

  // ---------- 傳送門 ----------
  function getPortals() { return G.world.area.portals.concat(G.world.extraPortals || []); }
  let nearPortal = null, portalKey = "";
  function updatePortalPrompt() {
    const w = G.world, p = G.player; nearPortal = null;
    let best = 60 * 60;
    for (const pt of getPortals()) {
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
    const w = G.world, from = w.areaId;
    // 磁鐵啟動中經過傳送門 → 瞬間把剩餘物品全部收進來
    if (w.magnetT > 0) {
      for (const o of w.orbs) G.gainXp(o.xp); w.orbs.length = 0;
      let gg = 0; for (const c of w.coins) gg += c.gold; if (gg) G.save.gold += gg; w.coins.length = 0;
      for (let i = w.grounds.length - 1; i >= 0; i--) { const g = w.grounds[i]; if (!g.special) { G.addToBag(g.item); w.grounds.splice(i, 1); } }
    }
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

    // 障礙物（石塊）
    for (const o of w.obstacles) {
      const x = o.x - cx, y = o.y - cy;
      ctx.fillStyle = "#5a5048"; ctx.beginPath(); ctx.arc(x, y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b5f54"; ctx.beginPath(); ctx.arc(x - o.r * .25, y - o.r * .25, o.r * .6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, o.r, 0, Math.PI * 2); ctx.stroke();
    }

    // 傳送門
    for (const pt of getPortals()) {
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

    // 城鎮 NPC：站在自家房屋門口，靠近頭上出現按鈕
    npcBtns = [];
    if (area.npcs) for (const npc of area.npcs) {
      const x = npc.x - cx, y = npc.y - cy;
      const roof = npc.action === "goddess" ? "#7a5a9e" : "#8a5a3a", wall = npc.action === "goddess" ? "#caa9e8" : "#caa07a";
      ctx.fillStyle = wall; ctx.fillRect(x - 38, y - 86, 76, 64);
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - 48, y - 86); ctx.lineTo(x, y - 116); ctx.lineTo(x + 48, y - 86); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#3a2e26"; ctx.fillRect(x - 12, y - 46, 24, 26); // 門
      ctx.fillStyle = "#ffe9a8"; ctx.fillRect(x + 16, y - 72, 12, 12); // 窗
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = "32px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(npc.ic || "🧙", x, y);
      ctx.font = "700 12px system-ui"; ctx.fillStyle = "#ffd166"; ctx.fillText(npc.name, x, y - 26);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      if (U.dist(p.x, p.y, npc.x, npc.y) < 95) {
        const bw = 104, bh = 32, bx = x - bw / 2, by = y - 64;
        ctx.fillStyle = "#7c4dff"; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = "#b89cff"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = "#fff"; ctx.font = "700 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(npc.label || "💬 交談", x, by + bh / 2);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        npcBtns.push({ x: bx, y: by, w: bw, h: bh, action: npc.action });
      }
    }

    // 召喚祭壇（六芒星）
    if (w.altar) {
      const al = w.altar, x = al.x - cx, y = al.y - cy;
      const flash = al.summoning && Math.sin(performance.now() / 70) > 0;
      ctx.save(); ctx.translate(x, y);
      // 地面光暈
      ctx.globalAlpha = al.summoning ? .3 : (.1 + al.progress * .2);
      ctx.fillStyle = flash ? "#ff3030" : "#b48cff";
      ctx.beginPath(); ctx.arc(0, 0, al.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      // 外圈
      ctx.strokeStyle = flash ? "#ff4040" : "rgba(190,150,255,.7)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, al.r, 0, Math.PI * 2); ctx.stroke();
      // 六芒星（兩個三角形）
      ctx.strokeStyle = flash ? "#ff6060" : "rgba(210,180,255,.6)"; ctx.lineWidth = 2;
      for (let s = 0; s < 2; s++) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + s * Math.PI / 3 + i * Math.PI * 2 / 3; const px = Math.cos(a) * al.r * 0.78, py = Math.sin(a) * al.r * 0.78; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.closePath(); ctx.stroke();
      }
      // 進度環
      if (!al.summoning) {
        ctx.strokeStyle = "#7af5d0"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, al.r + 7, -Math.PI / 2, -Math.PI / 2 + al.progress * Math.PI * 2); ctx.stroke();
      }
      // 提示文字
      ctx.fillStyle = "#fff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(al.summoning ? "Boss 降臨中…" : (al.progress > 0 ? Math.floor(al.progress * 100) + "%" : "站入召喚 Boss"), 0, -al.r - 14);
      ctx.textAlign = "left"; ctx.restore();
    }

    // 經驗球🧋🥟／金幣🪙（先畫，裝備會蓋在上面）
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "18px system-ui";
    for (const o of w.orbs) ctx.fillText(o.ic || "🧋", o.x - cx, o.y - cy + Math.sin(o.age * 6) * 2);
    ctx.font = "16px system-ui";
    for (const o of w.coins) ctx.fillText("🪙", o.x - cx, o.y - cy + Math.sin(o.age * 7) * 2);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

    // 寶箱
    if (w.chest) {
      const x = w.chest.x - cx, y = w.chest.y - cy + Math.sin(w.chest.age * 4) * 3;
      ctx.globalAlpha = .35; ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = "26px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🎁", x, y); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    }

    // 地面裝備（畫在最上層，並有品質光束）
    for (const g of w.grounds) {
      const x = g.x - cx, y = g.y - cy + g.bob;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (g.special === "magnet") { ctx.font = "22px system-ui"; ctx.fillText("🧲", x, g.y - cy + Math.sin(g.age * 5) * 3); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; continue; }
      const r = G.RARITY[g.item.rarity], order = G.RARITY_ORDER.indexOf(g.item.rarity);
      const bh = 42 + order * 16, grd = ctx.createLinearGradient(0, y - bh, 0, y);
      grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, r.color);
      ctx.globalAlpha = .35 + order * .15; ctx.fillStyle = grd; ctx.fillRect(x - 5, y - bh, 10, bh); ctx.globalAlpha = 1;
      ctx.fillStyle = r.color; ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = "20px system-ui"; ctx.fillText(g.item.ic, x, y);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    }

    // 粒子（線：閃電）
    for (const pt of w.particles) {
      if (pt.line) {
        ctx.globalAlpha = U.clamp(pt.life * 6, 0, 1); ctx.strokeStyle = pt.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pt.x1 - cx, pt.y1 - cy); ctx.lineTo(pt.x2 - cx, pt.y2 - cy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 敵人子彈（依各自顏色/大小）
    for (const s of w.foeShots) {
      ctx.fillStyle = s.color || "#ff5470"; ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // 移動光波
    for (const v of w.waves) {
      const fx = v.ox + Math.cos(v.ang) * v.traveled - cx, fy = v.oy + Math.sin(v.ang) * v.traveled - cy;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(v.ang);
      ctx.fillStyle = v.color || "#ffcf66"; ctx.globalAlpha = .85;
      ctx.fillRect(-v.thickness / 2, -v.width / 2, v.thickness, v.width);
      ctx.globalAlpha = 1; ctx.restore();
    }

    // 一般敵人生成預警（紅色閃爍圈）
    for (const sp of w.spawns) {
      const x = sp.x - cx, y = sp.y - cy, blink = Math.sin(sp.t * 22) > 0;
      ctx.globalAlpha = blink ? .5 : .18; ctx.fillStyle = "#ff3b3b";
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .85; ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }

    // 攻擊範圍讀條（敵人讀條 + Boss 大招自由讀條）
    for (const e of w.enemies) { if (e.cast) drawTelegraph(e.cast, cx, cy); }
    for (const c of w.casts) drawTelegraph(c, cx, cy);
    for (const f of w.flashes) drawFlash(f, cx, cy);

    // 敵人
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      const x = e.x - cx, y = e.y - cy;
      // 空中的 Boss（跳躍中）：只畫地面陰影，本體不可見/不可被擊中
      if (e.airborne) { ctx.globalAlpha = .3; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, y, e.r * .8, e.r * .4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; continue; }
      // Boss 蓄力大招：閃紅且越閃越快
      let bodyCol = e.hitFlash > 0 ? "#fff" : e.color;
      if (e.boss && e.ultState === "windup") {
        const prog = U.clamp(e.ultT / e.ultDur, 0, 1);
        if (Math.sin(e.ultT * (6 + prog * 40)) > 0) bodyCol = "#ff2020";
      }
      // 身體底色光暈（受擊/蓄力時更明顯）
      ctx.globalAlpha = e.hitFlash > 0 ? .6 : .3; ctx.fillStyle = bodyCol;
      ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (e.boss && e.ultState === "windup") {
        const prog = U.clamp(e.ultT / e.ultDur, 0, 1);
        ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(e.ultT * (6 + prog * 40)));
        ctx.strokeStyle = "#ff3030"; ctx.lineWidth = 3 + prog * 4;
        ctx.beginPath(); ctx.arc(x, y, e.r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      // 狀態外框
      if (e.stunT > 0) { ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      else if (e.slowT > 0) { ctx.strokeStyle = "#7fdfff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (e.burnT > 0) { ctx.fillStyle = "rgba(255,120,40,.6)"; ctx.beginPath(); ctx.arc(x + e.r * .5, y - e.r * .6, 3, 0, Math.PI * 2); ctx.fill(); }
      // 外觀圖示
      ctx.font = Math.round(e.r * 1.9) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(e.ic || "🟣", x, y);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
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

    // 近戰武器（跟隨角色，依動畫繪製真實刀劍）
    for (const m of w.swings) {
      const px = p.x - cx, py = p.y - cy, fade = U.clamp(m.life / m.maxLife, 0, 1);
      if (m.type === "dagger") {
        ctx.save(); ctx.translate(px, py); ctx.rotate(m.curAng);
        ctx.fillStyle = "#9a7b45"; ctx.fillRect(4, -4, 6, 8); // 握把/護手
        ctx.fillStyle = "#e8eef6"; // 刀刃
        ctx.beginPath(); ctx.moveTo(10, -2.5); ctx.lineTo(m.curLen, -2); ctx.lineTo(m.curLen + 7, 0); ctx.lineTo(m.curLen, 2); ctx.lineTo(10, 2.5); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(m.curLen + 7, 0); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        const startAng = m.ang - m.dir * m.arcHalf;
        ctx.save(); ctx.translate(px, py);
        // 揮砍殘影扇形
        ctx.globalAlpha = 0.28 * fade; ctx.fillStyle = "#dfeaff";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, m.reach, startAng, m.curAng, m.dir < 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        // 劍身
        ctx.rotate(m.curAng);
        ctx.fillStyle = "#9a7b45"; ctx.fillRect(2, -7, 8, 14); // 護手
        ctx.fillStyle = "#eef2f7";
        ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(m.reach, -7); ctx.lineTo(m.reach + 12, 0); ctx.lineTo(m.reach, 7); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(m.reach + 10, 0); ctx.stroke();
        ctx.restore();
      }
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
        // 箭桿
        ctx.strokeStyle = "#caa15a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
        // 箭頭
        ctx.fillStyle = "#e8eef5"; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(7, -4); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill();
        // 尾羽
        ctx.fillStyle = "#ff7a7a"; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-7, -4); ctx.lineTo(-5, 0); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // 拾取範圍示意（白圈）
    { ctx.globalAlpha = .18; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x - cx, p.y - cy, p.pickRange || 28, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }

    // 玩家
    const px = p.x - cx, py = p.y - cy;
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, p.r * .75, p.r * .9, p.r * .4, 0, 0, Math.PI * 2); ctx.fill();
    // 身體（依狀態染色）
    let body = "#39d98a";
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2) body = "#fff";
    else if (p.stunT > 0) body = "#ffe14d";
    else if (p.chillT > 0) body = "#7fd0ff";
    else if (p.burnT > 0) body = "#ff8a5a";
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1d7a52"; ctx.lineWidth = 3; ctx.stroke();
    // 狀態外框
    if (p.chillT > 0) { ctx.strokeStyle = "#bfeaff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, p.r + 3, 0, Math.PI * 2); ctx.stroke(); }
    if (p.burnT > 0) { ctx.fillStyle = "rgba(255,120,40,.8)"; for (let k = 0; k < 3; k++) { const a = U.rand(0, 6.28); ctx.beginPath(); ctx.arc(Math.cos(a) * p.r * .6, -p.r * .6 + Math.sin(a) * 2, 2, 0, Math.PI * 2); ctx.fill(); } }
    if (p.paraT > 0) { ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-p.r, -p.r - 4); ctx.lineTo(-2, -p.r + 2); ctx.lineTo(2, -p.r - 6); ctx.lineTo(p.r, -p.r); ctx.stroke(); }
    // 裝備的武器（顯示在身側，朝向取代攻擊面向）
    ctx.rotate(p.facing);
    const wt = p.weaponType;
    if (wt === "sword") { ctx.fillStyle = "#9a7b45"; ctx.fillRect(p.r - 3, -3.5, 6, 7); ctx.fillStyle = "#cfd8e3"; ctx.beginPath(); ctx.moveTo(p.r + 3, -3); ctx.lineTo(p.r + 24, -2); ctx.lineTo(p.r + 28, 0); ctx.lineTo(p.r + 24, 2); ctx.lineTo(p.r + 3, 3); ctx.closePath(); ctx.fill(); }
    else if (wt === "dagger") { ctx.fillStyle = "#9a7b45"; ctx.fillRect(p.r - 2, -2.5, 4, 5); ctx.fillStyle = "#dfe7ef"; ctx.beginPath(); ctx.moveTo(p.r + 2, -1.8); ctx.lineTo(p.r + 12, -1.4); ctx.lineTo(p.r + 15, 0); ctx.lineTo(p.r + 12, 1.4); ctx.lineTo(p.r + 2, 1.8); ctx.closePath(); ctx.fill(); }
    else if (wt === "staff") { ctx.strokeStyle = "#9a7b45"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.r - 2, 0); ctx.lineTo(p.r + 16, 0); ctx.stroke(); ctx.fillStyle = "#7fd0ff"; ctx.beginPath(); ctx.arc(p.r + 18, 0, 4.5, 0, Math.PI * 2); ctx.fill(); }
    else if (wt === "book") { ctx.fillStyle = "#b06bff"; ctx.fillRect(p.r + 1, -6, 10, 12); ctx.fillStyle = "#fff"; ctx.fillRect(p.r + 5.5, -6, 1.6, 12); }
    else { ctx.strokeStyle = "#caa15a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.r + 5, 0, 10, -1.4, 1.4); ctx.stroke(); ctx.strokeStyle = "#eee"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.r + 5 + Math.cos(-1.4) * 10, Math.sin(-1.4) * 10); ctx.lineTo(p.r + 5 + Math.cos(1.4) * 10, Math.sin(1.4) * 10); ctx.stroke(); }
    ctx.restore();

    // 玩家血條（角色下方）
    { const bw = p.r * 2.6, bx = px - bw / 2, by = py + p.r + 7;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = "#ff4d6d"; ctx.fillRect(bx, by, bw * U.clamp(p.hp / p.maxHp, 0, 1), 5); }
    // 異常狀態文字（頭上）
    { const st = []; if (p.burnT > 0) st.push("🔥燃燒"); if (p.chillT > 0) st.push("❄️緩速"); if (p.paraT > 0) st.push("⚡麻痺");
      if (st.length) { ctx.font = "700 11px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe14d"; ctx.fillText(st.join(" "), px, py - p.r - 12); ctx.textAlign = "left"; } }

    // 圓形粒子 / 擴散環（AOE 特效）
    for (const pt of w.particles) {
      if (pt.line) continue;
      if (pt.ring) {
        const k = 1 - pt.life / pt.maxLife;
        ctx.globalAlpha = U.clamp(pt.life / pt.maxLife, 0, 1); ctx.strokeStyle = pt.color; ctx.lineWidth = pt.lw || 4;
        ctx.beginPath(); ctx.arc(pt.x - cx, pt.y - cy, pt.r1 * k, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
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

    // 開場劇情：村長
    if (cine.active && cine.chief) {
      const x = cine.chief.x - cx, y = cine.chief.y - cy;
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = "30px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("👴", x, y);
      ctx.font = "700 12px system-ui"; ctx.fillStyle = "#ffd166"; ctx.fillText("村長", x, y - 24);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    }

    ctx.restore(); // shake

    // 劇情模式：只畫電影黑邊，隱藏所有 HUD
    if (cine.active) {
      const bar = H * 0.12;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      return;
    }

    // 稀有以上掉落：螢幕邊緣指向箭頭
    drawLootArrows(cx, cy);

    // 小地圖
    drawMinimap(area);

    // 經驗條（操作區與顯示區之間的橫條）
    {
      const xb = controlMode === "touch" ? moveZoneTop() : H;
      const yb = xb - 6;
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, yb, W, 6);
      ctx.fillStyle = "#3ad0ff"; ctx.fillRect(0, yb, W * U.clamp(G.save.xp / G.xpForLevel(G.save.level), 0, 1), 6);
    }

    // 連續擊殺（右側、輕微震動、含寶箱刷新進度）
    if (combo >= 1) {
      const amp = comboPulse > 0 ? comboPulse * 1.6 : 0; // 弱震
      const rx = W - 16, ry = 230; // 移到小地圖下方
      ctx.save(); ctx.textAlign = "right";
      ctx.font = "800 16px system-ui";
      ctx.fillStyle = combo >= 15 ? "#ff5470" : combo >= 8 ? "#ffae5e" : "#ffd166";
      ctx.fillText("🔥 x" + combo, rx + U.rand(-amp, amp), ry + U.rand(-amp, amp));
      // 寶箱刷新進度（連殺 / 20）
      const bw = 90, bx = rx - bw, by = ry + 8;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = "#9be86a"; ctx.fillRect(bx, by, bw * U.clamp(combo / CHEST_KILLS, 0, 1), 5);
      ctx.font = "700 10px system-ui"; ctx.fillStyle = "#cbb9e0"; ctx.fillText("🎁 " + combo + "/" + CHEST_KILLS, rx, by + 16);
      ctx.restore(); ctx.textAlign = "left";
    }

    // 關卡進度 / 引導（頂部置中）
    drawStageStatus(area, cx, cy);
    if (w.chest) drawEdgeArrow(w.chest.x - cx, w.chest.y - cy, "#ffd166", "🎁");

    // 移動控制區（觸控）：下方 15% 實心、固定搖桿
    if (controlMode === "touch") {
      const zTop = moveZoneTop(), bandH = H - zTop, bx = W / 2, by = joyBaseY(), rr = joyMax();
      ctx.fillStyle = "#0a0812"; ctx.fillRect(0, zTop, W, bandH); // 實心，不顯示任何東西
      ctx.globalAlpha = .2; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.stroke();
      const kx = bx + (joy.active ? joy.dx : 0), ky = by + (joy.active ? joy.dy : 0);
      ctx.globalAlpha = joy.active ? .8 : .4; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(kx, ky, rr * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Boss 血條（螢幕頂部，避開右上小地圖）
    if (w.boss && w.boss.hp > 0) {
      const bw = W - 24 - 104, bx = 12, by = 74;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx, by, bw, 14);
      ctx.fillStyle = "#e0457a"; ctx.fillRect(bx, by, bw * (w.boss.hp / w.boss.maxHp), 14);
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 14);
      const warn = w.boss.ultState === "windup";
      ctx.fillStyle = warn ? "#ff4040" : "#fff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText("👑 " + w.boss.name + (warn ? "　⚠ 大招蓄力！" : ""), bx + bw / 2, by - 4); ctx.textAlign = "left";
    }

    // 回城進度
    if (recalling) {
      const prog = U.clamp(1 - recallT / 1.8, 0, 1), bw = 200, bx = (W - bw) / 2, by = H * 0.5;
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(bx, by, bw, 16);
      ctx.fillStyle = "#3ad0ff"; ctx.fillRect(bx, by, bw * prog, 16);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 16);
      ctx.fillStyle = "#fff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText("回城中…", W / 2, by - 6); ctx.textAlign = "left";
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
    for (const pt of getPortals()) {
      const locked = pt.reqLevel && G.save.level < pt.reqLevel;
      ctx.fillStyle = locked ? "#888" : "#3ad0ff";
      ctx.fillRect(sx(pt.x) - 3, sy(pt.y) - 3, 6, 6);
    }
    if (w.altar) { ctx.fillStyle = w.altar.summoning ? "#ff3030" : "#c79bff"; ctx.font = "9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✦", sx(w.altar.x), sy(w.altar.y)); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }
    if (w.chest) { ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🎁", sx(w.chest.x), sy(w.chest.y)); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }
    for (const g of w.grounds) {
      if (g.special) { ctx.fillStyle = "#fff"; ctx.fillRect(sx(g.x) - 2, sy(g.y) - 2, 4, 4); continue; }
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
  function drawStageStatus(area, cx, cy) {
    const w = G.world; if (area.safe) return;
    const cleared = area.boss && G.save.killedBoss[area.boss];
    let txt, col = "#ffd166";
    if (cleared) { txt = "✅ 已通關！前往下一關"; col = "#7af5d0"; }
    else if ((w.boss && w.boss.hp > 0) || w.bossSpawned) { txt = "⚔ 擊敗 " + (w.boss ? w.boss.name : "Boss"); col = "#ff8a8a"; }
    else if ((w.killCount || 0) >= KILLS_FOR_BOSS) { txt = "前往祭壇 ✦ 召喚 Boss"; col = "#c9a0ff"; }
    else { txt = "擊殺進度 " + (w.killCount || 0) + " / " + KILLS_FOR_BOSS + " 開啟祭壇"; }
    ctx.save(); ctx.textAlign = "center"; ctx.font = "700 14px system-ui";
    const tw = ctx.measureText(txt).width + 22;
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(W / 2 - tw / 2, 94, tw, 23);
    ctx.fillStyle = col; ctx.textBaseline = "middle"; ctx.fillText(txt, W / 2, 106);
    ctx.restore(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if (cleared) { const nxt = area.portals.find(pt => pt.reqLevel); if (nxt) drawGuideArrow(nxt.x - cx, nxt.y - cy); }
  }
  function drawGuideArrow(sx, sy) { drawEdgeArrow(sx, sy, "#7af5d0", "下一關"); }
  function drawEdgeArrow(sx, sy, color, label) {
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return;
    const ccx = W / 2, ccy = H / 2, mh = W / 2 - 30, mv = H / 2 - 30, ang = Math.atan2(sy - ccy, sx - ccx);
    const tX = Math.abs(Math.cos(ang)) < 1e-3 ? 1e9 : mh / Math.abs(Math.cos(ang));
    const tY = Math.abs(Math.sin(ang)) < 1e-3 ? 1e9 : mv / Math.abs(Math.sin(ang));
    const t = Math.min(tX, tY), tx = ccx + Math.cos(ang) * t, ty = ccy + Math.sin(ang) * t;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.fill(); ctx.restore();
    ctx.fillStyle = color; ctx.font = "700 11px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, tx - Math.cos(ang) * 22, ty - Math.sin(ang) * 22); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  function drawLootArrows(cx, cy) {
    const w = G.world;
    const ccx = W / 2, ccy = H / 2, mh = W / 2 - 26, mv = H / 2 - 26;
    for (const g of w.grounds) {
      if (g.special || !g.item || (g.item.rarity !== "rare" && g.item.rarity !== "legend")) continue;
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
    dead = true; recalling = false;
    const lost = G.applyDeathPenalty ? G.applyDeathPenalty() : 0;
    const msg = document.getElementById("deathMsg");
    if (msg) msg.innerHTML = "等級、裝備與戰利品都會保留。<br>損失 🪙<b>" + lost + "</b>（20% 金幣），回到城鎮重整旗鼓吧！";
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
    if (G.audioResume) G.audioResume();
    G.computeStats();
    if (G.player.hp === undefined) G.player.hp = G.player.maxHp;
    started = true; dead = false;
    document.getElementById("startScreen").classList.remove("show");
    const fresh = !G.save.introDone && G.save.level === 1 && !G.save.equipped.weapon && G.save.bag.length === 0;
    G.enterArea(fresh ? "town" : (G.save.area || "town"));
    G.refreshHud();
    if (fresh) startIntro();
    last = performance.now();
  }

  function wire() {
    // 用 touchstart 綁定，讓移動中也能用第二指同時按（多點觸控）
    function bindTap(id, fn) {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); el._t = performance.now(); fn(); }, { passive: false });
      el.addEventListener("click", () => { if (el._t && performance.now() - el._t < 600) return; fn(); });
    }
    bindTap("bagBtn", G.openBag);
    bindTap("talBtn", G.openTalents);
    bindTap("qiBtn", G.openQi);
    document.getElementById("qiClose").onclick = G.closeQi;
    bindTap("shopBtn", G.openShop);
    bindTap("recallBtn", startRecall);
    bindTap("dashBtn", triggerDash);
    bindTap("ultBtn", triggerUlt);
    bindTap("muteBtn", () => { const m = G.toggleMute ? G.toggleMute() : false; document.getElementById("muteBtn").textContent = m ? "🔇" : "🔊"; });
    document.getElementById("bagClose").onclick = G.closeBag;
    document.getElementById("talClose").onclick = G.closeTalents;
    document.getElementById("shopClose").onclick = G.closeShop;
    document.getElementById("startBtn").onclick = beginGame;
    document.getElementById("respawnBtn").onclick = respawn;
    const ct = document.getElementById("ctrlToggle");
    if (ct) ct.onclick = () => setControlMode(controlMode === "touch" ? "keyboard" : "touch");
    updateCtrlBtn();
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
