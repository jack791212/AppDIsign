"use strict";
// 全域命名空間：所有靜態資料定義在這裡
const G = window.G || (window.G = {});

// ============ 詞條 AFFIXES ============
// kind:'stat' -> 累加到角色數值；kind:'proc' -> 戰鬥中觸發特效（核心差異）
// slots: 可出現的裝備欄位；roll: 數值範圍 [min,max]
G.AFFIXES = {
  // --- 數值詞條 ---
  dmg:     { id:'dmg',     name:'攻擊',     kind:'stat', stat:'dmgPct',     slots:['weapon','ring'],          roll:[8,20],  fmt:v=>`+${v}% 攻擊力` },
  atkspd:  { id:'atkspd',  name:'攻速',     kind:'stat', stat:'atkSpdPct',  slots:['weapon','ring'],          roll:[6,15],  fmt:v=>`+${v}% 攻擊速度` },
  hp:      { id:'hp',      name:'生命',     kind:'stat', stat:'hp',         slots:['armor','ring','helmet'],  roll:[20,60], fmt:v=>`+${v} 生命` },
  crit:    { id:'crit',    name:'暴擊率',   kind:'stat', stat:'critPct',    slots:['weapon','ring','helmet'], roll:[3,9],   fmt:v=>`+${v}% 暴擊率` },
  critdmg: { id:'critdmg', name:'暴擊傷害', kind:'stat', stat:'critDmgPct', slots:['weapon','ring'],          roll:[15,45], fmt:v=>`+${v}% 暴擊傷害` },
  move:    { id:'move',    name:'移速',     kind:'stat', stat:'movePct',    slots:['armor','helmet'],         roll:[4,11],  fmt:v=>`+${v}% 移動速度` },
  multishot:{id:'multishot',name:'多重箭',  kind:'stat', stat:'projectiles',slots:['weapon'],                 roll:[1,1],   fmt:v=>`+${v} 同時射出箭數` },
  pierce:  { id:'pierce',  name:'穿透',     kind:'stat', stat:'pierce',     slots:['weapon'],                 roll:[1,2],   fmt:v=>`箭可貫穿 +${v} 名敵人` },
  armor:   { id:'armor',   name:'護甲',     kind:'stat', stat:'armorFlat',  slots:['armor','helmet'],         roll:[3,10],  fmt:v=>`+${v} 護甲（減傷）` },

  // --- 特效詞條 PROC（玩法核心，可疊加） ---
  chain:    { id:'chain',    name:'連鎖閃電', kind:'proc', slots:['weapon','ring'],  roll:[20,45], fmt:v=>`命中有 ${v}% 機率閃電跳至附近敵人` },
  critboom: { id:'critboom', name:'暴擊爆炸', kind:'proc', slots:['weapon','ring'],  roll:[30,70], fmt:v=>`暴擊時引發 ${v}% 攻擊的範圍爆炸` },
  lifesteal:{ id:'lifesteal',name:'吸血',     kind:'proc', slots:['weapon','ring','armor'], roll:[3,8], fmt:v=>`造成傷害的 ${v}% 轉化為生命` },
  frost:    { id:'frost',    name:'冰霜',     kind:'proc', slots:['weapon','helmet'],roll:[20,40], fmt:v=>`命中使敵人減速 ${v}%（2秒）` },
  burn:     { id:'burn',     name:'燃燒',     kind:'proc', slots:['weapon','ring'],  roll:[15,35], fmt:v=>`命中施加燃燒：每秒 ${v}% 攻擊傷害（3秒）` },
  thorns:   { id:'thorns',   name:'荊棘',     kind:'proc', slots:['armor','helmet'], roll:[30,80], fmt:v=>`受到攻擊時反彈 ${v}% 傷害` },
  regen:    { id:'regen',    name:'再生',     kind:'proc', slots:['armor','helmet','ring'], roll:[1,4], fmt:v=>`每秒回復 ${v} 點生命` },
};

// 傳奇專屬特效（只在 legend 裝備出現，威力更強）
G.LEGEND_AFFIXES = {
  storm:   { id:'storm',   name:'⚡風暴之芯', kind:'proc', roll:[100,100], fmt:_=>`每 1.5 秒對周圍敵人降下落雷` },
  vampire: { id:'vampire', name:'🩸嗜血',     kind:'proc', roll:[12,12],   fmt:_=>`吸血 12%，且擊殺時回復 5% 最大生命` },
  glass:   { id:'glass',   name:'💎玻璃大炮', kind:'proc', roll:[60,60],   fmt:_=>`攻擊 +60%，但最大生命 -25%` },
  twin:    { id:'twin',    name:'🏹雙生箭',   kind:'proc', roll:[1,1],     fmt:_=>`額外 +2 投射物，但攻速 -15%` },
};

// ============ 武器類型 WEAPON TYPES ============
// 裝備的武器決定攻擊方式。dmgMul=傷害倍率 spdMul=攻速倍率(越高越快) critAdd=額外暴擊率
G.WEAPON_TYPES = {
  bow:    { name:'弓',     ic:'🏹', cls:'ranged', dmgMul:1.0,  spdMul:1.0,  critAdd:0,  desc:'平衡的直線射擊' },
  sword:  { name:'雙手劍', ic:'⚔️', cls:'melee',  dmgMul:2.0,  spdMul:0.5,  critAdd:0,  reach:108, arcHalf:1.05, desc:'大範圍揮砍，傷害高、攻速慢' },
  dagger: { name:'匕首',   ic:'🗡️', cls:'melee',  dmgMul:0.95, spdMul:1.7,  critAdd:18, reach:140, arcHalf:0.30, desc:'快速深刺、範圍窄、暴擊高' },
  staff:  { name:'法杖',   ic:'🪄', cls:'ranged', dmgMul:1.35, spdMul:0.85, critAdd:0,  homing:true, desc:'發射追蹤法球' },
  book:   { name:'法書',   ic:'📖', cls:'summon', dmgMul:1.0,  spdMul:1.0,  critAdd:0,  summonCap:3, desc:'召喚史萊姆助戰（上限 3）' },
};

// ============ 裝備基底 ITEM BASES ============
G.SLOTS = ['weapon','armor','helmet','ring'];
G.SLOT_INFO = {
  weapon: { name:'武器', ic:'🏹' },
  armor:  { name:'護甲', ic:'🛡️' },
  helmet: { name:'頭盔', ic:'⛑️' },
  ring:   { name:'飾品', ic:'💍' },
};
G.ITEM_BASES = {
  weapon: [
    {n:'短弓',ic:'🏹',wtype:'bow'},   {n:'長弓',ic:'🏹',wtype:'bow'},
    {n:'巨劍',ic:'⚔️',wtype:'sword'}, {n:'闊劍',ic:'⚔️',wtype:'sword'},
    {n:'匕首',ic:'🗡️',wtype:'dagger'},{n:'尖刺',ic:'🗡️',wtype:'dagger'},
    {n:'法杖',ic:'🪄',wtype:'staff'}, {n:'魔杖',ic:'🪄',wtype:'staff'},
    {n:'法書',ic:'📖',wtype:'book'},  {n:'禁書',ic:'📖',wtype:'book'},
  ],
  armor:  [{n:'皮甲',ic:'🛡️'},{n:'鎖甲',ic:'🛡️'},{n:'板甲',ic:'🛡️'}],
  helmet: [{n:'皮帽',ic:'⛑️'},{n:'頭盔',ic:'⛑️'},{n:'戰盔',ic:'⛑️'}],
  ring:   [{n:'戒指',ic:'💍'},{n:'護符',ic:'💍'},{n:'寶石',ic:'💍'}],
};

// 稀有度設定：詞條數、掉落權重、售價倍率
G.RARITY = {
  common: { name:'普通', cls:'common', affixes:[0,0], weight:50, sell:5,   color:'#cfcfcf' },
  magic:  { name:'魔法', cls:'magic',  affixes:[1,2], weight:32, sell:18,  color:'#7aa2ff' },
  rare:   { name:'稀有', cls:'rare',   affixes:[3,4], weight:14, sell:55,  color:'#ffd84a' },
  legend: { name:'傳奇', cls:'legend', affixes:[4,4], weight:4,  sell:200, color:'#ffae5e' },
};
G.RARITY_ORDER = ['common','magic','rare','legend'];

// ============ 敵人 ENEMY TYPES ============
G.ENEMIES = {
  slime: { name:'史萊姆', r:15, color:'#5fc46b', hp:24, dmg:8,  speed:55,  xp:4,  gold:2, behavior:'chase' },
  bat:   { name:'蝙蝠',   r:13, color:'#9b6bff', hp:16, dmg:6,  speed:95,  xp:5,  gold:2, behavior:'chase' },
  archer:{ name:'骷髏弓手',r:14, color:'#d9d2c0', hp:22, dmg:9,  speed:45,  xp:7,  gold:4, behavior:'ranged' },
  brute: { name:'石魔',   r:22, color:'#a06a3a', hp:70, dmg:16, speed:48,  xp:14, gold:8, behavior:'chase' },
  // 使用「攻擊範圍讀條」的新型敵人
  bomber:  { name:'自爆蟲', r:15, color:'#ff8a3a', hp:26, dmg:18, speed:92, xp:9,  gold:4, behavior:'bomber' },
  charger: { name:'衝鋒獸', r:19, color:'#d94f9c', hp:55, dmg:20, speed:68, xp:13, gold:7, behavior:'charger' },
  striker: { name:'利爪兵', r:16, color:'#c0683a', hp:42, dmg:14, speed:78, xp:11, gold:5, behavior:'striker' },
};
// Boss：attacks=普攻模式池、ults=三種專屬大招（蓄力後隨機施放）
G.BOSSES = {
  forestKing: { name:'森林之王', r:40, color:'#2e8b57', hp:900,   dmg:18, speed:60, xp:220,  gold:120,  behavior:'boss', attacks:['aimVolley','ring'],                    ults:['novaRing','meteorRain','sectorSweep'] },
  ruinLord:   { name:'廢墟領主', r:46, color:'#8a2be2', hp:2200,  dmg:26, speed:62, xp:600,  gold:400,  behavior:'boss', attacks:['aimVolley','spiral','sectorSlash'],      ults:['crossBeams','bulletRings','novaRing'] },
  magmaLord:  { name:'熔岩魔王', r:48, color:'#ff5a2a', hp:4800,  dmg:34, speed:64, xp:1400, gold:900,  behavior:'boss', attacks:['ring','aimBurst','spiral'],             ults:['meteorRain','spiralStorm','crossBeams'] },
  frostQueen: { name:'冰霜女王', r:50, color:'#5fd0ff', hp:9000,  dmg:44, speed:66, xp:3200, gold:2000, behavior:'boss', attacks:['aimVolley','wallRect','ring'],          ults:['bulletRings','sectorSweep','novaRing'] },
  abyssKing:  { name:'深淵君主', r:54, color:'#b23cff', hp:17000, dmg:56, speed:70, xp:8000, gold:5000, behavior:'boss', attacks:['spiral','aimBurst','wallRect','ring'],   ults:['crossBeams','spiralStorm','meteorRain'] },
};

// ============ 地圖區域 AREAS ============
// 地圖為正方形（w===h），小地圖也呈正方形；難度逐區遞增
// safe=城鎮不刷怪；reqLevel=傳送門解鎖等級需求
G.AREAS = {
  town: {
    name:'城鎮', w:1000, h:1000, bg:'#1d2433', safe:true, level:0,
    portals:[ {to:'forest', x:500, y:230, name:'幽暗森林'} ],
  },
  forest: {
    name:'幽暗森林', w:2000, h:2000, bg:'#0f1f14', level:1,
    enemies:['slime','bat','archer','striker','bomber'], maxAlive:12, boss:'forestKing', bossAt:{x:1000,y:300},
    portals:[ {to:'town', x:1000, y:1850, name:'返回城鎮'}, {to:'ruins', x:1000, y:170, name:'遠古廢墟', reqLevel:6} ],
  },
  ruins: {
    name:'遠古廢墟', w:2200, h:2200, bg:'#1a141f', level:7,
    enemies:['bat','archer','brute','charger','striker','bomber'], maxAlive:13, boss:'ruinLord', bossAt:{x:1100,y:320},
    portals:[ {to:'forest', x:1100, y:2050, name:'返回森林'}, {to:'cavern', x:1100, y:180, name:'熔岩洞窟', reqLevel:12} ],
  },
  cavern: {
    name:'熔岩洞窟', w:2400, h:2400, bg:'#241010', level:14,
    enemies:['archer','brute','charger','striker','bomber'], maxAlive:15, boss:'magmaLord', bossAt:{x:1200,y:340},
    portals:[ {to:'ruins', x:1200, y:2250, name:'返回廢墟'}, {to:'glacier', x:1200, y:190, name:'冰封峽谷', reqLevel:19} ],
  },
  glacier: {
    name:'冰封峽谷', w:2600, h:2600, bg:'#0e1a24', level:22,
    enemies:['bat','archer','brute','charger','striker'], maxAlive:16, boss:'frostQueen', bossAt:{x:1300,y:360},
    portals:[ {to:'cavern', x:1300, y:2450, name:'返回洞窟'}, {to:'abyss', x:1300, y:200, name:'暗影深淵', reqLevel:28} ],
  },
  abyss: {
    name:'暗影深淵', w:2800, h:2800, bg:'#140a1c', level:32,
    enemies:['archer','brute','charger','striker','bomber'], maxAlive:18, boss:'abyssKing', bossAt:{x:1400,y:380},
    portals:[ {to:'glacier', x:1400, y:2650, name:'返回峽谷'} ],
  },
};

// ============ 天賦樹 TALENTS ============
// 三向分支；每個節點消耗 1 點，max=最大等級，per=每級加成
// 天賦僅保留「通用」加成；武器專屬能力（穿透、多重箭）改由裝備詞條提供
G.TALENTS = {
  atk: { name:'攻擊', color:'#ff6b6b', nodes:[
    { id:'a1', name:'鋒利',   desc:'攻擊力',     max:5, stat:'dmgPct',     per:4 },
    { id:'a2', name:'迅捷',   desc:'攻擊速度',   max:5, stat:'atkSpdPct',  per:3 },
    { id:'a3', name:'致命',   desc:'暴擊率',     max:5, stat:'critPct',    per:2 },
    { id:'a4', name:'重擊',   desc:'暴擊傷害',   max:5, stat:'critDmgPct', per:10 },
  ]},
  ele: { name:'元素', color:'#4dabff', nodes:[
    { id:'e1', name:'寒冰',   desc:'命中減速（特效）', max:3, proc:'frost',    per:8 },
    { id:'e2', name:'引燃',   desc:'命中燃燒（特效）', max:3, proc:'burn',     per:6 },
    { id:'e3', name:'雷電',   desc:'連鎖閃電（特效）', max:3, proc:'chain',    per:10 },
    { id:'e4', name:'爆裂',   desc:'暴擊爆炸（特效）', max:3, proc:'critboom', per:12 },
  ]},
  sur: { name:'生存', color:'#5fd98a', nodes:[
    { id:'s1', name:'強壯',   desc:'最大生命',   max:5, stat:'hp',        per:25 },
    { id:'s2', name:'護甲',   desc:'護甲',       max:5, stat:'armorFlat', per:4 },
    { id:'s3', name:'吸取',   desc:'吸血（特效）', max:3, proc:'lifesteal', per:2 },
    { id:'s4', name:'恢復',   desc:'每秒回血（特效）', max:3, proc:'regen', per:1 },
    { id:'s5', name:'疾行',   desc:'移動速度',   max:4, stat:'movePct',   per:4 },
  ]},
};
