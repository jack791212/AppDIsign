"use strict";
// UI 層：HUD、背包、裝備、天賦、道具彈窗、提示
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const BAG_CAP = 40;

  // ---------- Toast ----------
  G.toast = function (msg) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 1600);
    while (box.children.length > 4) box.firstChild.remove();
  };

  // ---------- HUD ----------
  G.refreshHud = function () {
    const s = G.save, p = G.player, w = G.world;
    $("areaName").textContent = (w.area ? w.area.name : "");
    $("lvPill").textContent = "Lv " + s.level;
    $("coins").textContent = "🪙 " + s.gold;
    $("hpbar").style.width = (p.maxHp ? (p.hp / p.maxHp * 100) : 0) + "%";
    $("xpbar").style.width = (s.xp / G.xpForLevel(s.level) * 100) + "%";
    const tp = $("talBadge");
    if (s.talentPts > 0) { tp.style.display = "flex"; tp.textContent = s.talentPts; } else tp.style.display = "none";
    const qb = $("qiBadge"); const qa = G.qiAvail ? G.qiAvail() : 0;
    if (qb) { if (qa > 0) { qb.style.display = "flex"; qb.textContent = qa; } else qb.style.display = "none"; }
    const sb = $("shopBtn"); if (sb) sb.style.display = "none"; // 商店改由城鎮 NPC 開啟
  };

  // ---------- 背包操作 ----------
  G.addToBag = function (item) {
    // 對應裝備欄位為空時，自動穿上
    if (!G.save.equipped[item.slot]) {
      G.save.equipped[item.slot] = item;
      G.computeStats(); G.persist(); G.refreshHud();
      G.toast("自動裝備：" + item.baseName + "（" + G.RARITY[item.rarity].name + "）");
      return;
    }
    if (G.save.bag.length >= BAG_CAP) {
      G.save.gold += G.RARITY[item.rarity].sell;
      G.toast("背包已滿，自動賣出 +🪙" + G.RARITY[item.rarity].sell);
      G.persist(); G.refreshHud(); return;
    }
    G.save.bag.push(item);
    const r = G.RARITY[item.rarity];
    if (G.sfx) G.sfx("pickup");
    G.toast("拾取：" + item.baseName + "（" + r.name + "）");
    G.persist();
    const badge = $("bagBadge"); badge.style.display = "flex"; badge.textContent = G.save.bag.length;
  };

  G.equipItem = function (item) {
    const s = G.save;
    const idx = s.bag.indexOf(item);
    if (idx >= 0) s.bag.splice(idx, 1);
    const old = s.equipped[item.slot];
    s.equipped[item.slot] = item;
    if (old) s.bag.push(old);
    G.computeStats(); G.persist(); G.refreshHud();
    renderBag();
  };
  G.unequip = function (slot) {
    const s = G.save;
    const it = s.equipped[slot];
    if (!it) return;
    if (s.bag.length >= BAG_CAP) { G.toast("背包已滿"); return; }
    s.bag.push(it); s.equipped[slot] = null;
    G.computeStats(); G.persist(); G.refreshHud();
    renderBag();
  };
  G.sellItem = function (item) {
    const s = G.save;
    const idx = s.bag.indexOf(item);
    if (idx >= 0) s.bag.splice(idx, 1);
    s.gold += G.RARITY[item.rarity].sell;
    G.toast("賣出 +🪙" + G.RARITY[item.rarity].sell);
    G.persist(); G.refreshHud(); renderBag();
  };
  // 一鍵賣出：稀有度 <= maxIdx 的所有背包道具
  G.sellByRarity = function (maxIdx) {
    const keep = []; let n = 0, gold = 0;
    for (const it of G.save.bag) {
      if (G.RARITY_ORDER.indexOf(it.rarity) <= maxIdx) { gold += G.RARITY[it.rarity].sell; n++; }
      else keep.push(it);
    }
    if (n === 0) { G.toast("沒有符合條件的裝備"); return; }
    G.save.bag = keep; G.save.gold += gold;
    G.toast("賣出 " + n + " 件，+🪙" + gold);
    G.persist(); G.refreshHud(); renderBag();
  };

  // ---------- 背包面板 ----------
  function slotCellHtml(item) {
    if (!item) return "";
    const r = G.RARITY[item.rarity];
    return `<div class="ic">${item.ic}</div><div class="nm t-${r.cls}">${item.baseName}</div>`;
  }
  function renderBag() {
    // 裝備欄
    const row = $("equipRow"); row.innerHTML = "";
    for (const slot of G.SLOTS) {
      const it = G.save.equipped[slot];
      const info = G.SLOT_INFO[slot];
      const div = document.createElement("div");
      div.className = "eqslot" + (it ? " r-" + G.RARITY[it.rarity].cls : "");
      if (it) div.innerHTML = `<div class="ic">${it.ic}</div><div class="nm t-${G.RARITY[it.rarity].cls}">${it.baseName}</div>`;
      else div.innerHTML = `<div class="ic" style="opacity:.4">${info.ic}</div><div class="lbl">${info.name}</div>`;
      if (it) div.onclick = () => G.openItem(it, true);
      row.appendChild(div);
    }
    // 背包格
    const grid = $("bagGrid"); grid.innerHTML = "";
    const bag = G.save.bag.slice().sort((a, b) => G.itemScore(b) - G.itemScore(a));
    if (bag.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#6b6480;padding:30px 0;font-size:14px">背包是空的<br>去打怪掉裝吧！</div>`;
    }
    for (const it of bag) {
      const r = G.RARITY[it.rarity];
      const cur = G.save.equipped[it.slot];
      const better = G.itemScore(it) > G.itemScore(cur);
      const div = document.createElement("div");
      div.className = "itemcell r-" + r.cls;
      div.innerHTML = `<div class="ic">${it.ic}</div><div class="nm t-${r.cls}">${it.baseName}</div>`
        + (better ? `<div class="up">▲</div>` : "");
      div.onclick = () => G.openItem(it, false);
      grid.appendChild(div);
    }
    const goldEl = $("bagGold"); if (goldEl) goldEl.textContent = "🪙 " + G.save.gold;
    const badge = $("bagBadge");
    if (G.save.bag.length > 0) { badge.style.display = "flex"; badge.textContent = G.save.bag.length; }
    else badge.style.display = "none";
  }
  G.renderBag = renderBag;

  G.openBag = function () {
    renderBag();
    document.querySelectorAll("#bagSellRow .sellbtn").forEach((b) => {
      b.onclick = () => {
        const r = b.dataset.r;
        if (r === "all") { if (confirm("確定賣出背包『全部』裝備？")) G.sellAll(); }
        else { if (confirm("確定賣出符合條件的裝備？")) G.sellByRarity(+r); }
      };
    });
    $("bagPanel").classList.add("show");
  };
  G.closeBag = function () { $("bagPanel").classList.remove("show"); };

  // ---------- 道具彈窗（雙欄比較：左=選擇，右=裝備中）----------
  function affixHtml(item) {
    let s = "";
    for (const af of item.affixes) { const info = G.affixText(af); s += `<div class="aff ${info.proc ? "proc" : ""}">${info.proc ? "✦ " : "• "}${info.text}</div>`; }
    if (!item.affixes.length) s = `<div class="aff" style="color:#8a839e">（無特殊詞條）</div>`;
    return s;
  }
  function colHtml(item, title, isEquipped) {
    if (!item) return `<div class="cmpCol"><div class="ctitle">${title}</div><div class="ename" style="color:#6b6480">（無）</div></div>`;
    const r = G.RARITY[item.rarity];
    const wt = (item.slot === "weapon" && item.wtype && G.WEAPON_TYPES[item.wtype]) ? G.WEAPON_TYPES[item.wtype] : null;
    let setHtml = "";
    if (item.setId && G.SETS[item.setId]) {
      const set = G.SETS[item.setId], cnt = G.SLOTS.reduce((n, sl) => n + (G.save.equipped[sl] && G.save.equipped[sl].setId === item.setId ? 1 : 0), 0);
      setHtml = `<div style="margin-top:6px;border-top:1px solid #3a3358;padding-top:5px"><div style="font-size:12px;font-weight:700;color:${set.color}">${set.name}（已裝 ${cnt}）</div>`
        + `<div class="aff" style="font-size:11px;color:${cnt >= 2 ? "#7af5d0" : "#6b6480"}">(2) ${set.b2.desc}</div>`
        + `<div class="aff" style="font-size:11px;color:${cnt >= 4 ? "#7af5d0" : "#6b6480"}">(4) ${set.b4.desc}</div></div>`;
    }
    return `<div class="cmpCol${isEquipped ? " equipped" : ""}"><div class="ctitle">${title}</div>` +
      `<div class="ename t-${r.cls}">${item.ic} ${item.baseName}${item.plus ? " +" + item.plus : ""}${isEquipped ? '<span class="eqtag">裝備中</span>' : ""}</div>` +
      `<div class="ctitle" style="margin:2px 0 6px">${r.name}${wt ? " · " + wt.name : ""} · iLv ${item.ilvl}</div>` +
      affixHtml(item) + setHtml + "</div>";
  }
  G.openItem = function (item, equipped) {
    const r = G.RARITY[item.rarity], card = $("itemCard");
    let html;
    if (equipped) {
      html = colHtml(item, "裝備中", true);
    } else {
      const cur = G.save.equipped[item.slot];
      const diff = G.itemScore(item) - G.itemScore(cur);
      html = `<div class="cmpRow">${colHtml(item, "選擇的裝備", false)}${colHtml(cur, "目前裝備", true)}</div>` +
        `<div style="text-align:center;font-size:13px;font-weight:700;margin-top:8px;color:${diff >= 0 ? "#7af5d0" : "#ff9bb0"}">${diff >= 0 ? "▲ 比目前更好" : "▼ 比目前差"}（評分 ${diff >= 0 ? "+" : ""}${diff}）</div>`;
    }
    html += `<div class="acts">` +
      (equipped
        ? `<button class="bSell" id="popUnequip">卸下</button>`
        : `<button class="bEquip" id="popEquip">裝備</button><button class="bSell" id="popSell">賣 🪙${r.sell}</button>`) +
      `<button class="bClose" id="popClose">關閉</button></div>`;
    card.innerHTML = html;
    $("itemPop").classList.add("show");
    if (equipped) $("popUnequip").onclick = () => { G.unequip(item.slot); G.closeItem(); };
    else { $("popEquip").onclick = () => { G.equipItem(item); G.closeItem(); }; $("popSell").onclick = () => { G.sellItem(item); G.closeItem(); }; }
    $("popClose").onclick = G.closeItem;
  };
  G.closeItem = function () { $("itemPop").classList.remove("show"); };

  // ---------- 天賦面板 ----------
  function renderTalents() {
    $("talPts").textContent = "可用天賦點：" + G.save.talentPts;
    const cols = $("talCols"); cols.innerHTML = "";
    for (const bid in G.TALENTS) {
      const branch = G.TALENTS[bid];
      const col = document.createElement("div");
      col.className = "talcol";
      col.innerHTML = `<h3 style="background:${branch.color}33;color:${branch.color}">${branch.name}</h3>`;
      for (const node of branch.nodes) {
        const rank = G.save.talents[node.id] || 0;
        const maxed = rank >= node.max;
        const el = document.createElement("div");
        el.className = "talnode" + (maxed ? " maxed" : "");
        el.innerHTML = `<div class="tn">${node.name}</div><div class="td">${node.desc} +${node.per}/級</div><div class="rank">${rank}/${node.max}</div>`;
        el.onclick = () => {
          if (maxed) { G.toast("已達上限"); return; }
          if (G.save.talentPts <= 0) { G.toast("沒有可用天賦點"); return; }
          G.save.talents[node.id] = rank + 1; G.save.talentPts--;
          G.computeStats(); G.persist(); G.refreshHud(); renderTalents();
        };
        col.appendChild(el);
      }
      cols.appendChild(col);
    }
  }
  G.renderTalents = renderTalents;
  G.openTalents = function () { renderTalents(); $("talPanel").classList.add("show"); };
  G.closeTalents = function () { $("talPanel").classList.remove("show"); };

  // ---------- 功法面板 ----------
  function renderQi() {
    const pickRow = G.qiPickRow(), avail = G.qiAvail();
    $("qiPts").textContent = avail > 0
      ? "請選擇第 " + (pickRow + 1) + " 排功法（火／雷／冰 擇一，其餘鎖死）"
      : "已選 " + pickRow + " 排（每 5 等開放下一排，目前最多 " + G.qiTotal() + " 排）";
    const cols = $("qiCols"); cols.innerHTML = "";
    const picks = (G.save.qi && G.save.qi.picks) || [];
    for (const cid in G.QIGONG) {
      const col = G.QIGONG[cid];
      const c = document.createElement("div"); c.className = "qicol";
      c.innerHTML = `<div class="qihead" style="background:${col.color}33;color:${col.color}">${col.ic} ${col.name}</div>`;
      col.nodes.forEach((n, t) => {
        let state;
        if (t < pickRow) state = (picks[t] === cid) ? "owned" : "forfeit";
        else if (t === pickRow && avail > 0) state = "next";
        else state = "lock";
        const el = document.createElement("div"); el.className = "qinode " + state;
        el.innerHTML = `<div class="qn">第${t + 1}排 ${n.name}</div><div class="qd">${n.desc}</div>`;
        if (state === "next") el.onclick = () => { if (G.qiPick(cid)) renderQi(); };
        c.appendChild(el);
      });
      cols.appendChild(c);
    }
  }
  G.renderQi = renderQi;
  G.openQi = function () { renderQi(); $("qiPanel").classList.add("show"); };
  G.closeQi = function () { $("qiPanel").classList.remove("show"); };

  // ---------- 對話 / 劇情系統 ----------
  let dlg = null;
  function renderDlg() {
    const c = dlg.cfg;
    $("dlgIc").textContent = c.ic || "🧑"; $("dlgName").textContent = c.name || "";
    $("dlgText").textContent = c.lines[dlg.i] || "";
    const last = dlg.i >= c.lines.length - 1, opt = $("dlgOptions"); opt.innerHTML = "";
    if (last && c.options && c.options.length) {
      for (const o of c.options) { const b = document.createElement("button"); b.className = "dlgOpt"; b.textContent = o.label; b.onclick = (e) => { e.stopPropagation(); G.closeDialogue(); if (o.action) o.action(); }; opt.appendChild(b); }
      opt.style.display = "flex"; $("dlgHint").style.display = "none";
    } else { opt.style.display = "none"; $("dlgHint").style.display = last ? "none" : "block"; }
  }
  G.startDialogue = function (cfg) { dlg = { cfg, i: 0 }; renderDlg(); $("dlgPanel").classList.add("show"); };
  G.dlgAdvance = function () { if (dlg && dlg.i < dlg.cfg.lines.length - 1) { dlg.i++; renderDlg(); } };
  G.closeDialogue = function () { dlg = null; $("dlgPanel").classList.remove("show"); };
  $("dlgPanel").addEventListener("click", (e) => { if (!e.target.closest("#dlgOptions")) G.dlgAdvance(); });

  // ---------- 祝福三選一（深淵 Run）----------
  // opts.chaos = 混沌門：祝福更強（雙倍）但背負 2 房詛咒
  G.openBoonPicker = function (next, opts) {
    opts = opts || {};
    const chaos = !!opts.chaos;
    const owned = new Set(G.run.blessings);
    const ownedGods = new Set(G.run.blessings.map((id) => G.ALL_BOONS[id] && G.ALL_BOONS[id].god).filter(Boolean));
    const cards = [];
    // 二重祝福：湊齊兩位神時有機會出現
    const eligibleDuos = (G.DUOS || []).filter((d) => !owned.has(d.id) && d.gods.every((gd) => ownedGods.has(gd)));
    if (eligibleDuos.length) cards.push(eligibleDuos[Math.floor(Math.random() * eligibleDuos.length)]);
    // 隨機一位神，補滿剩餘卡片
    const gods = Object.keys(G.BLESSINGS);
    const g = G.BLESSINGS[gods[Math.floor(Math.random() * gods.length)]];
    let pool = g.boons.filter((b) => !owned.has(b.id));
    if (pool.length < 3) pool = g.boons.slice();
    for (const b of pool) { if (cards.length >= 3) break; if (!cards.includes(b)) cards.push(b); }
    $("boonTitle").innerHTML = chaos
      ? `<span style="color:#c77dff">🌀 混沌祝福</span>（更強・背負詛咒）`
      : `<span style="color:${g.color}">${g.ic} ${g.name}</span> 的祝福（三選一）`;
    const floor = (G.world && G.world.floor) || 1;
    const box = $("boonCards"); box.innerHTML = "";
    for (const b of cards) {
      const col = b.godColor || g.color, ic = b.godIc || g.ic;
      // 每張卡擲稀有度（混沌門保底稀有↑）
      let tier = G.rollBoonRarity(floor, chaos ? 25 : 0);
      if (chaos && tier < 1) tier = 1;
      const rr = G.BOON_RARITY[tier];
      const d = document.createElement("div"); d.className = "card";
      const dtag = b.duo ? `<span style="color:#ffd479;font-size:11px"> ✦二重</span>` : "";
      const rtag = tier > 0 ? `<span style="color:${rr.color};font-size:11px;font-weight:700"> ${rr.name}×${rr.mult}</span>` : "";
      d.style.borderColor = tier > 0 ? rr.color : "";
      d.innerHTML = `<div class="ico" style="color:${col}">${ic}</div><div class="txt"><div class="name">${b.name}${dtag}${rtag}</div><div class="desc">${b.desc}</div></div>`;
      d.onclick = () => {
        $("boonPanel").classList.remove("show");
        G.addBoon(b.id, chaos, tier);
        if (chaos) { G.run.boonLv[b.id] = (G.run.boonLv[b.id] || 1) + 1; G.computeStats(); } // 混沌：雙倍效果
        if (next) next();
      };
      box.appendChild(d);
    }
    $("boonPanel").classList.add("show");
  };

  // ---------- 祝福升級（pom）：強化一個已有祝福 ----------
  G.openPomPicker = function (next) {
    const ids = G.run.blessings.slice();
    if (!ids.length) { if (next) next(); return; }
    // 從已有祝福中隨機挑最多 3 個供選擇
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const pick = ids.slice(0, 3);
    $("boonTitle").innerHTML = `<span style="color:#7af5d0">⬆️ 祝福升級</span>（三選一・效果提升）`;
    const box = $("boonCards"); box.innerHTML = "";
    for (const id of pick) {
      const b = G.ALL_BOONS[id]; if (!b) continue;
      const lv = (G.run.boonLv[id] || 1);
      const rt = (G.run.boonRarity[id] || 0), rr = G.BOON_RARITY[rt];
      const rtag = rt > 0 ? `<span style="color:${rr.color};font-size:11px"> ${rr.name}</span>` : "";
      const d = document.createElement("div"); d.className = "card";
      d.innerHTML = `<div class="ico" style="color:${b.godColor}">${b.godIc}</div><div class="txt"><div class="name">${b.name}${rtag} <span style="color:#7af5d0;font-size:11px">Lv${lv}→${lv + 1}</span></div><div class="desc">${b.desc}</div></div>`;
      d.onclick = () => { $("boonPanel").classList.remove("show"); G.upgradeBoon(id); if (next) next(); };
      box.appendChild(d);
    }
    $("boonPanel").classList.add("show");
  };

  // ---------- 商店房（花金幣買祝福 / 回血 / 精英裝備）----------
  G.openShopRoom = function (next) {
    const w = G.world, floor = w.floor || 1;
    const done = () => { $("shopPanel").classList.remove("show"); if (next) next(); };
    const owned = new Set(G.run.blessings);
    const gods = Object.keys(G.BLESSINGS);
    // 隨機挑一個未擁有祝福
    let boonOffer = null;
    const gg = G.BLESSINGS[gods[Math.floor(Math.random() * gods.length)]];
    const avail = gg.boons.filter((b) => !owned.has(b.id));
    if (avail.length) boonOffer = avail[Math.floor(Math.random() * avail.length)];
    const offers = [];
    if (boonOffer) {
      const bt = G.rollBoonRarity(floor, 10), br = G.BOON_RARITY[bt];
      const rlabel = bt > 0 ? "（" + br.name + "×" + br.mult + "）" : "";
      offers.push({ ic: boonOffer.godIc, name: "祝福：" + boonOffer.name + rlabel, desc: boonOffer.desc, cost: 120 + floor * 15 + bt * 40, buy: () => G.addBoon(boonOffer.id, false, bt) });
    }
    offers.push({ ic: "❤️", name: "全滿回復", desc: "生命完全回復", cost: 80 + floor * 8, buy: () => { G.player.hp = G.player.maxHp; if (G.sfx) G.sfx("level"); } });
    offers.push({ ic: "⚔️", name: "精英裝備", desc: "獲得一件高階裝備", cost: 150 + floor * 18, buy: () => { const lvl = (w.area.level || 12) + floor * 3; G.addToBag(G.rollItem(lvl, null, null, lvl + 10)); } });
    const render = () => {
      $("shopTitle").textContent = "🏪 深淵商店";
      $("shopGold").textContent = "🪙 " + G.save.gold;
      const body = $("shopBody"); body.innerHTML = "";
      const tip = document.createElement("div"); tip.style.cssText = "font-size:12px;color:#9b8fc0;margin-bottom:8px"; tip.textContent = "花金幣購買一次性強化，購買後離開商店。"; body.appendChild(tip);
      for (const o of offers) {
        const afford = G.save.gold >= o.cost && !o.bought;
        const row = document.createElement("div"); row.className = "talnode"; row.style.cssText = "display:flex;justify-content:space-between;align-items:center;cursor:" + (afford ? "pointer" : "default");
        row.innerHTML = `<div><span style="font-weight:700">${o.ic} ${o.name}</span><div style="font-size:11px;color:#9b8fc0">${o.desc}</div></div>`
          + `<span style="font-size:12px;color:${o.bought ? "#888" : (afford ? "#ffd479" : "#c66")}">${o.bought ? "已購買" : "🪙" + o.cost}</span>`;
        if (afford) row.onclick = () => { G.save.gold -= o.cost; o.bought = true; o.buy(); document.getElementById("coins").textContent = "🪙 " + G.save.gold; G.persist(); render(); };
        body.appendChild(row);
      }
      const leave = document.createElement("div"); leave.className = "talnode"; leave.style.cssText = "text-align:center;cursor:pointer;color:#7af5d0;font-weight:700;margin-top:6px"; leave.textContent = "離開商店，前進 →";
      leave.onclick = done;
      body.appendChild(leave);
    };
    render();
    $("shopPanel").classList.add("show");
  };

  // 鐵匠對話入口
  G.openBlacksmith = function () {
    G.startDialogue({
      name: "鐵匠", ic: "🔨",
      lines: ["歡迎光臨，冒險者。", "你的裝備…我可以幫你打磨，或讓你賭一把運氣。"],
      options: [
        { label: "⚒️ 強化裝備", action: G.openEnhance },
        { label: "🎲 賭裝（隨機部位）", action: G.openGamble },
        { label: "離開", action: () => {} },
      ],
    });
  };

  // 女神對話入口（恢復生命 + 鏡子 + 目標）
  G.openGoddess = function () {
    G.startDialogue({
      name: "女神", ic: "🧚",
      lines: ["勇敢的冒險者，願星光照亮你的路。", "深淵的結晶能換取永恆之力。你需要什麼？"],
      options: [
        { label: "❤️ 接受祝福（回復生命）", action: () => { G.player.hp = G.player.maxHp; if (G.sfx) G.sfx("level"); G.toast("女神的祝福：生命已完全回復！"); } },
        { label: "🔮 深淵之鏡（永久強化）", action: G.openMirror },
        { label: "🎯 目標與成就", action: G.openGoals },
        { label: "離開", action: () => {} },
      ],
    });
  };
  // ---------- 深淵之鏡 ----------
  G.openMirror = function () {
    $("mirrorCry").textContent = "💎 " + (G.save.crystals || 0) + " 深淵結晶";
    const body = $("mirrorBody"); body.innerHTML = "";
    const tip = document.createElement("div"); tip.style.cssText = "font-size:12px;color:#9b8fc0;margin-bottom:8px"; tip.textContent = "深淵 Run 結束依到達房數獲得結晶，可購買永久被動。"; body.appendChild(tip);
    for (const node of G.MIRROR) {
      const rk = G.save.mirror[node.id] || 0, maxed = rk >= node.max, cost = G.mirrorCost(node);
      const row = document.createElement("div"); row.className = "talnode"; row.style.cssText = "display:flex;justify-content:space-between;align-items:center;cursor:pointer";
      row.innerHTML = `<div><span style="font-weight:700;color:#c9a0ff">${node.name}</span><div style="font-size:11px;color:#9b8fc0">${node.desc} +${node.per}/級　${rk}/${node.max}</div></div>`
        + `<span style="font-size:12px;color:${maxed ? "#888" : "#7af5d0"}">${maxed ? "滿級" : "💎" + cost}</span>`;
      if (!maxed) row.onclick = () => { if (G.mirrorBuy(node.id)) G.openMirror(); };
      body.appendChild(row);
    }
    $("mirrorPanel").classList.add("show");
  };
  G.closeMirror = function () { $("mirrorPanel").classList.remove("show"); };
  // ---------- 目標：每日 + 成就 ----------
  G.openGoals = function () {
    if (G.ensureDaily) G.ensureDaily();
    $("goalCry").textContent = "💎 " + (G.save.crystals || 0);
    const body = $("goalBody"); body.innerHTML = "";
    const h1 = document.createElement("div"); h1.style.cssText = "font-size:14px;font-weight:700;color:#7af5d0;margin:4px 0"; h1.textContent = "📅 每日任務"; body.appendChild(h1);
    for (const q of (G.save.daily.list || [])) {
      const t = G.DAILY_POOL.find(x => x.id === q.id) || {};
      const row = document.createElement("div"); row.className = "talnode";
      row.innerHTML = `<div style="display:flex;justify-content:space-between"><span style="font-weight:700;${q.done ? "color:#7af5d0" : ""}">${q.done ? "✅ " : ""}${t.name || q.id}</span><span style="font-size:12px;color:#ffd166">💎${t.crystals || 0}</span></div>`
        + `<div style="font-size:11px;color:#9b8fc0">進度 ${Math.min(q.prog || 0, q.goal)}/${q.goal}</div>`;
      body.appendChild(row);
    }
    const h2 = document.createElement("div"); h2.style.cssText = "font-size:14px;font-weight:700;color:#ffd166;margin:12px 0 4px"; h2.textContent = "🏆 成就"; body.appendChild(h2);
    for (const a of G.ACHIEVEMENTS) {
      const done = G.save.achievements[a.id];
      const row = document.createElement("div"); row.className = "talnode"; if (done) row.style.borderColor = "#7af5d0";
      row.innerHTML = `<div style="display:flex;justify-content:space-between"><span style="font-weight:700;${done ? "color:#7af5d0" : ""}">${done ? "✅ " : "🔒 "}${a.name}</span><span style="font-size:12px;color:#ffd166">💎${a.crystals || 0}</span></div>`
        + `<div style="font-size:11px;color:#9b8fc0">${a.desc}</div>`;
      body.appendChild(row);
    }
    $("goalPanel").classList.add("show");
  };
  G.closeGoals = function () { $("goalPanel").classList.remove("show"); };

  // ---------- 城鎮商店：強化（裝備中／背包中 區塊式）----------
  G.openEnhance = function () {
    $("shopTitle").textContent = "⚒️ 強化裝備";
    $("shopGold").textContent = "🪙 " + G.save.gold;
    const body = $("shopBody"); body.innerHTML = "";
    const tip = document.createElement("div"); tip.style.cssText = "font-size:12px;color:#9b8fc0;margin-bottom:8px"; tip.textContent = "點選裝備查看強化預覽（+5 以上可能失敗、+8 以上失敗會爆炸）"; body.appendChild(tip);
    // 裝備中
    const h1 = document.createElement("div"); h1.style.cssText = "font-size:13px;color:#ffd166;font-weight:700;margin:4px 0"; h1.textContent = "裝備中"; body.appendChild(h1);
    const eq = document.createElement("div"); eq.style.cssText = "display:flex;gap:8px;margin-bottom:12px";
    for (const slot of G.SLOTS) {
      const it = G.save.equipped[slot], info = G.SLOT_INFO[slot];
      const d = document.createElement("div"); d.className = "eqslot" + (it ? " r-" + G.RARITY[it.rarity].cls : "");
      if (it) { d.innerHTML = `<div class="ic">${it.ic}</div><div class="nm t-${G.RARITY[it.rarity].cls}">${it.baseName}${it.plus ? " +" + it.plus : ""}</div>`; d.onclick = () => G.openEnhanceConfirm(it); }
      else d.innerHTML = `<div class="ic" style="opacity:.4">${info.ic}</div><div class="lbl">${info.name}</div>`;
      eq.appendChild(d);
    }
    body.appendChild(eq);
    // 背包中
    const h2 = document.createElement("div"); h2.style.cssText = "font-size:13px;color:#7af5d0;font-weight:700;margin:4px 0"; h2.textContent = "背包中"; body.appendChild(h2);
    const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px";
    const bag = G.save.bag.slice().sort((a, b) => G.itemScore(b) - G.itemScore(a));
    if (!bag.length) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#6b6480;padding:16px 0;font-size:13px">背包沒有裝備</div>`;
    for (const it of bag) { const r = G.RARITY[it.rarity]; const d = document.createElement("div"); d.className = "itemcell r-" + r.cls; d.innerHTML = `<div class="ic">${it.ic}</div><div class="nm t-${r.cls}">${it.baseName}${it.plus ? " +" + it.plus : ""}</div>`; d.onclick = () => G.openEnhanceConfirm(it); grid.appendChild(d); }
    body.appendChild(grid);
    $("shopPanel").classList.add("show");
  };
  G.openEnhanceConfirm = function (item) { renderEnhConfirm(item); $("enhPop").classList.add("show"); };
  function renderEnhConfirm(item) {
    const cur = item.plus || 0, rate = Math.round(G.enhanceRate(cur) * 100), cost = G.enhanceCost(item), maxed = cur >= G.MAX_PLUS;
    const mulNow = 1 + cur * 0.08, mulNext = 1 + (cur + 1) * 0.08;
    let lines = "";
    for (const af of item.affixes) {
      const def = af.legend ? G.LEGEND_AFFIXES[af.id] : G.AFFIXES[af.id];
      if (def.kind === "stat" && def.stat !== "projectiles" && def.stat !== "pierce") lines += `<div class="aff">• ${def.name}：${Math.round(af.value * mulNow)} → <b style="color:#7af5d0">${Math.round(af.value * mulNext)}</b></div>`;
      else { const info = G.affixText(af); lines += `<div class="aff ${info.proc ? "proc" : ""}">${info.proc ? "✦ " : "• "}${info.text}</div>`; }
    }
    const failTxt = cur >= 8 ? '失敗：裝備<b style="color:#ff6b6b">爆炸消失</b>' : (cur >= 5 ? "失敗：強化等級 −1" : "必定成功");
    $("enhCard").innerHTML =
      `<div class="iname t-${G.RARITY[item.rarity].cls}">${item.ic} ${item.baseName}　+${cur}${maxed ? "（滿級）" : " → +" + (cur + 1)}</div>` +
      `<div class="ibase">成功率 <b style="color:${rate >= 60 ? "#7af5d0" : rate >= 35 ? "#ffd166" : "#ff8a8a"}">${rate}%</b>　花費 🪙${cost}</div>` +
      lines + `<div style="font-size:12px;margin-top:8px;color:#cbb9e0">${failTxt}</div>` +
      `<div class="acts">` + (maxed ? "" : `<button class="bEquip" id="enhDo">強化</button>`) + `<button class="bClose" id="enhClose">關閉</button></div>`;
    $("enhClose").onclick = () => $("enhPop").classList.remove("show");
    if (!maxed) $("enhDo").onclick = () => playHammerThenResolve(item);
  }
  function playHammerThenResolve(item) {
    $("enhCard").innerHTML = `<div style="text-align:center;padding:26px 6px"><div class="hammer" id="hmr">🔨</div><div style="margin-top:12px;color:#cbb9e0">強化中…</div></div>`;
    const h = $("hmr");
    const beat = (cls, t) => setTimeout(() => { if (!h) return; h.classList.remove("s1", "s3"); void h.offsetWidth; h.classList.add(cls); if (G.sfx) G.sfx("hit"); }, t);
    beat("s1", 60); beat("s1", 360); beat("s3", 760); // 第三下較慢
    setTimeout(() => { if (h) h.classList.add("glow"); if (G.sfx) G.sfx("level"); }, 1300);
    setTimeout(() => { const res = G.tryEnhance(item); G.openEnhance(); showEnhResult(item, res); }, 1650);
  }
  function showEnhResult(item, res) {
    let msg, color, gone = res.result === "explode";
    if (res.result === "success") { msg = "✨ 強化成功！ → +" + item.plus; color = "#7af5d0"; }
    else if (res.result === "down") { msg = "💢 強化失敗，等級 −1"; color = "#ffae5e"; }
    else if (res.result === "explode") { msg = "💥 強化失敗，裝備爆炸了！"; color = "#ff6b6b"; }
    else { $("enhPop").classList.remove("show"); return; }
    $("enhCard").innerHTML = `<div style="text-align:center;padding:18px 6px"><div style="font-size:20px;font-weight:800;color:${color}">${msg}</div></div>` +
      `<div class="acts">` + (gone ? "" : `<button class="bEquip" id="enhAgain">再次強化</button>`) + `<button class="bClose" id="enhClose2">完成</button></div>`;
    if (!gone) $("enhAgain").onclick = () => renderEnhConfirm(item);
    $("enhClose2").onclick = () => $("enhPop").classList.remove("show");
  }

  // ---------- 城鎮商店：賭裝 ----------
  G.openGamble = function () {
    $("shopTitle").textContent = "🎲 賭裝";
    $("shopGold").textContent = "🪙 " + G.save.gold;
    const body = $("shopBody"); body.innerHTML = "";
    const tip = document.createElement("div"); tip.style.cssText = "font-size:12px;color:#9b8fc0;margin-bottom:10px"; tip.textContent = "每次花費 🪙" + G.gambleCost() + "，隨機抽出該部位裝備（越高等越好）"; body.appendChild(tip);
    const gr = document.createElement("div"); gr.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px";
    for (const slot of G.SLOTS) {
      const info = G.SLOT_INFO[slot];
      const d = document.createElement("div"); d.className = "eqslot"; d.style.cursor = "pointer";
      d.innerHTML = `<div class="ic">${info.ic}</div><div class="lbl">${info.name}</div>`;
      d.onclick = () => { const it = G.gamble(slot); if (it) G.openGamble(); };
      gr.appendChild(d);
    }
    body.appendChild(gr);
    $("shopPanel").classList.add("show");
  };

  // 兼容：openShop 視為開啟鐵匠對話
  G.openShop = function () { G.openBlacksmith(); };
  G.closeShop = function () { $("shopPanel").classList.remove("show"); };

})();
