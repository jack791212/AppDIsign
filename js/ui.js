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
    return `<div class="cmpCol${isEquipped ? " equipped" : ""}"><div class="ctitle">${title}</div>` +
      `<div class="ename t-${r.cls}">${item.ic} ${item.baseName}${item.plus ? " +" + item.plus : ""}${isEquipped ? '<span class="eqtag">裝備中</span>' : ""}</div>` +
      `<div class="ctitle" style="margin:2px 0 6px">${r.name}${wt ? " · " + wt.name : ""} · iLv ${item.ilvl}</div>` +
      affixHtml(item) + "</div>";
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

  // 女神對話入口（恢復生命 + 鼓勵）
  G.openGoddess = function () {
    const lines = [
      "勇敢的冒險者，願星光照亮你的路。",
      "每一次倒下，都是為了更強地站起。",
      "來吧，讓我撫平你的傷口。",
    ];
    G.startDialogue({
      name: "女神", ic: "🧚",
      lines,
      options: [
        { label: "🙏 接受祝福（回復生命）", action: () => { G.player.hp = G.player.maxHp; if (G.sfx) G.sfx("level"); G.toast("女神的祝福：生命已完全回復！"); } },
        { label: "離開", action: () => {} },
      ],
    });
  };

  // ---------- 城鎮商店：強化 ----------
  function enhRow(it, slotLabel) {
    const r = G.RARITY[it.rarity];
    const row = document.createElement("div");
    row.className = "talnode"; row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center"; row.style.cursor = "pointer";
    const maxed = (it.plus || 0) >= G.MAX_PLUS;
    row.innerHTML = `<div><span class="t-${r.cls}" style="font-weight:700">${it.ic} ${it.baseName}${it.plus ? " +" + it.plus : ""}</span><div style="font-size:11px;color:#9b8fc0">${slotLabel}</div></div>`
      + `<span style="font-size:12px;color:${maxed ? "#888" : "#7af5d0"}">${maxed ? "已滿級" : "成功率 " + Math.round(G.enhanceRate(it.plus || 0) * 100) + "%"}</span>`;
    if (!maxed) row.onclick = () => G.openEnhanceConfirm(it);
    return row;
  }
  G.openEnhance = function () {
    $("shopTitle").textContent = "⚒️ 強化裝備";
    $("shopGold").textContent = "🪙 " + G.save.gold;
    const body = $("shopBody"); body.innerHTML = "";
    const tip = document.createElement("div"); tip.style.cssText = "font-size:12px;color:#9b8fc0;margin-bottom:8px"; tip.textContent = "選擇裝備查看強化後數值與成功率（+5 以上可能失敗、+8 以上失敗會爆炸）"; body.appendChild(tip);
    let any = false;
    for (const slot of G.SLOTS) { const it = G.save.equipped[slot]; if (it) { any = true; body.appendChild(enhRow(it, "裝備中 · " + G.SLOT_INFO[slot].name)); } }
    const bagItems = G.save.bag.slice().sort((a, b) => G.itemScore(b) - G.itemScore(a));
    for (const it of bagItems) { any = true; body.appendChild(enhRow(it, "背包 · " + G.SLOT_INFO[it.slot].name)); }
    if (!any) body.innerHTML = `<div style="color:#6b6480;text-align:center;padding:16px 0;font-size:13px">沒有可強化的裝備</div>`;
    $("shopPanel").classList.add("show");
  };
  G.openEnhanceConfirm = function (item) {
    const cur = item.plus || 0, rate = Math.round(G.enhanceRate(cur) * 100), cost = G.enhanceCost(item);
    const mulNow = 1 + cur * 0.08, mulNext = 1 + (cur + 1) * 0.08;
    let lines = "";
    for (const af of item.affixes) {
      const def = af.legend ? G.LEGEND_AFFIXES[af.id] : G.AFFIXES[af.id];
      if (def.kind === "stat" && def.stat !== "projectiles" && def.stat !== "pierce") {
        const now = Math.round(af.value * mulNow), nxt = Math.round(af.value * mulNext);
        lines += `<div class="aff">• ${def.name}：${now} → <b style="color:#7af5d0">${nxt}</b></div>`;
      } else { const info = G.affixText(af); lines += `<div class="aff ${info.proc ? "proc" : ""}">${info.proc ? "✦ " : "• "}${info.text}</div>`; }
    }
    const failTxt = cur >= 8 ? '失敗：裝備<b style="color:#ff6b6b">爆炸消失</b>' : (cur >= 5 ? "失敗：強化等級 −1" : "必定成功");
    $("enhCard").innerHTML =
      `<div class="iname t-${G.RARITY[item.rarity].cls}">${item.ic} ${item.baseName}　+${cur} → +${cur + 1}</div>` +
      `<div class="ibase">成功率 <b style="color:${rate >= 60 ? "#7af5d0" : rate >= 35 ? "#ffd166" : "#ff8a8a"}">${rate}%</b>　花費 🪙${cost}</div>` +
      lines + `<div style="font-size:12px;margin-top:8px;color:#cbb9e0">${failTxt}</div>` +
      `<div class="acts"><button class="bEquip" id="enhDo">強化</button><button class="bClose" id="enhCancel">取消</button></div>`;
    $("enhPop").classList.add("show");
    $("enhDo").onclick = () => {
      const res = G.tryEnhance(item); $("enhPop").classList.remove("show");
      if (res.result === "success") G.toast("✨ 強化成功 → +" + item.plus);
      else if (res.result === "down") G.toast("💢 失敗，強化等級 −1");
      else if (res.result === "explode") G.toast("💥 失敗，裝備爆炸了！");
      G.openEnhance();
    };
    $("enhCancel").onclick = () => $("enhPop").classList.remove("show");
  };

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
