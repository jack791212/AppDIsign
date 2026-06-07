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
      b.onclick = () => { if (confirm("確定賣出符合條件的裝備？")) G.sellByRarity(+b.dataset.r); };
    });
    $("bagPanel").classList.add("show");
  };
  G.closeBag = function () { $("bagPanel").classList.remove("show"); };

  // ---------- 道具彈窗 ----------
  G.openItem = function (item, equipped) {
    const r = G.RARITY[item.rarity];
    const card = $("itemCard");
    let aff = "";
    for (const af of item.affixes) {
      const info = G.affixText(af);
      aff += `<div class="aff ${info.proc ? "proc" : ""}">${info.proc ? "✦ " : "• "}${info.text}</div>`;
    }
    if (item.affixes.length === 0) aff = `<div class="aff" style="color:#8a839e">（無特殊詞條）</div>`;
    // 與目前裝備比較（自動顯示當前裝備詞條）
    let cmp = "";
    if (!equipped) {
      const cur = G.save.equipped[item.slot];
      const diff = G.itemScore(item) - G.itemScore(cur);
      let curAff = "";
      if (cur) {
        for (const af of cur.affixes) {
          const info = G.affixText(af);
          curAff += `<div class="aff ${info.proc ? "proc" : ""}" style="opacity:.6">${info.proc ? "✦ " : "• "}${info.text}</div>`;
        }
        if (cur.affixes.length === 0) curAff = `<div class="aff" style="opacity:.45">（無特殊詞條）</div>`;
      } else curAff = `<div class="aff" style="opacity:.45">（此欄位尚未裝備）</div>`;
      cmp = `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #3a3358">` +
        `<div style="font-size:13px;font-weight:700;margin-bottom:5px;color:${diff >= 0 ? "#7af5d0" : "#ff9bb0"}">${diff >= 0 ? "▲ 比目前裝備更好" : "▼ 比目前裝備差"}（評分 ${diff >= 0 ? "+" : ""}${diff}）</div>` +
        `<div style="font-size:11px;color:#9b8fc0;margin-bottom:4px">目前 ${G.SLOT_INFO[item.slot].name}：${cur ? cur.baseName : "無"}</div>` +
        curAff + `</div>`;
    }
    const wt = (item.slot === "weapon" && item.wtype && G.WEAPON_TYPES[item.wtype]) ? G.WEAPON_TYPES[item.wtype] : null;
    const wline = wt ? `<div class="ibase" style="color:#ffd166">${wt.ic} ${wt.name}：${wt.desc}</div>` : "";
    card.innerHTML =
      `<div class="iname t-${r.cls}">${item.ic} ${item.baseName}</div>` +
      `<div class="ibase">${r.name} · ${G.SLOT_INFO[item.slot].name} · iLv ${item.ilvl}</div>` +
      wline + aff + cmp +
      `<div class="acts">` +
      (equipped
        ? `<button class="bSell" id="popUnequip">卸下</button>`
        : `<button class="bEquip" id="popEquip">裝備</button><button class="bSell" id="popSell">賣 🪙${r.sell}</button>`) +
      `<button class="bClose" id="popClose">關閉</button>` +
      `</div>`;
    $("itemPop").classList.add("show");
    if (equipped) {
      $("popUnequip").onclick = () => { G.unequip(item.slot); G.closeItem(); };
    } else {
      $("popEquip").onclick = () => { G.equipItem(item); G.closeItem(); };
      $("popSell").onclick = () => { G.sellItem(item); G.closeItem(); };
    }
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

  // ---------- 城鎮商店 ----------
  function renderShop() {
    $("shopGold").textContent = "🪙 " + G.save.gold;
    $("gambleHint").textContent = "每次花費 🪙" + G.gambleCost() + "，隨機詞條，越高等越好";
    const gr = $("gambleRow"); gr.innerHTML = "";
    for (const slot of G.SLOTS) {
      const info = G.SLOT_INFO[slot];
      const d = document.createElement("div");
      d.className = "eqslot"; d.style.cursor = "pointer";
      d.innerHTML = `<div class="ic">${info.ic}</div><div class="lbl">${info.name}</div>`;
      d.onclick = () => { const it = G.gamble(slot); if (it) renderShop(); };
      gr.appendChild(d);
    }
    const el = $("enhanceList"); el.innerHTML = "";
    let any = false;
    for (const slot of G.SLOTS) {
      const it = G.save.equipped[slot]; if (!it) continue; any = true;
      const r = G.RARITY[it.rarity];
      const maxed = (it.plus || 0) >= G.MAX_PLUS;
      const cost = G.enhanceCost(it);
      const row = document.createElement("div");
      row.className = "talnode"; row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center";
      row.innerHTML = `<div><span class="t-${r.cls}" style="font-weight:700">${it.ic} ${it.baseName}${it.plus ? " +" + it.plus : ""}</span><div style="font-size:11px;color:#9b8fc0">${G.SLOT_INFO[slot].name}</div></div>`
        + `<button class="bEquip" style="border:none;border-radius:8px;padding:8px 12px;font-weight:700;color:#fff">${maxed ? "已滿級" : "強化 🪙" + cost}</button>`;
      const btn = row.querySelector("button");
      if (maxed) { btn.style.background = "#444"; btn.disabled = true; }
      else btn.onclick = () => { if (G.enhanceItem(it)) renderShop(); };
      el.appendChild(row);
    }
    if (!any) el.innerHTML = `<div style="color:#6b6480;text-align:center;padding:16px 0;font-size:13px">尚未裝備任何裝備</div>`;
  }
  G.renderShop = renderShop;
  G.openShop = function () { renderShop(); $("shopPanel").classList.add("show"); };
  G.closeShop = function () { $("shopPanel").classList.remove("show"); };

})();
