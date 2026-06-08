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
  multishot:{id:'multishot',name:'多重射擊',kind:'stat', stat:'projectiles',slots:['weapon'],                 roll:[1,1],   fmt:v=>`+${v} 同時射出的投射物（弓／法杖通用）` },
  pierce:  { id:'pierce',  name:'穿透',     kind:'stat', stat:'pierce',     slots:['weapon'],                 roll:[1,2],   fmt:v=>`投射物可貫穿 +${v} 名敵人（弓／法杖通用）` },
  armor:   { id:'armor',   name:'護甲',     kind:'stat', stat:'armorFlat',  slots:['armor','helmet'],         roll:[3,10],  fmt:v=>`+${v} 護甲（減傷）` },
  summon:  { id:'summon',  name:'召喚強化', kind:'stat', stat:'minionPct',  slots:['weapon','ring','helmet'], roll:[10,28], fmt:v=>`+${v}% 召喚物傷害` },
  range:   { id:'range',   name:'攻擊範圍', kind:'stat', stat:'rangePct',   slots:['weapon','armor'],         roll:[8,20],  fmt:v=>`+${v}% 攻擊範圍（近戰受益大）` },
  pickup:  { id:'pickup',  name:'拾取範圍', kind:'stat', stat:'pickRange',  slots:['helmet','ring','armor'],  roll:[25,70], fmt:v=>`+${v} 拾取範圍（自動吸取掉落/經驗球）` },

  // --- 改變攻擊型態的 build 詞條 ---
  whirl:    { id:'whirl',    name:'旋風斬',   kind:'proc', slots:['weapon'],        roll:[1,1],   fmt:_=>`近戰：每 8 秒下次攻擊化為旋風斬，全方位旋轉 3 秒` },
  explosive:{ id:'explosive',name:'爆裂彈',   kind:'proc', slots:['weapon','ring'], roll:[25,55], fmt:v=>`遠程/命中：造成 ${v}% 範圍爆炸傷害` },

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
// 近戰較危險，故傷害倍率高於遠程
G.WEAPON_TYPES = {
  bow:    { name:'弓',     ic:'🏹', cls:'ranged', dmgMul:1.0,  spdMul:1.0,  critAdd:0,  desc:'平衡的直線射擊' },
  sword:  { name:'雙手劍', ic:'⚔️', cls:'melee',  dmgMul:2.6,  spdMul:0.5,  critAdd:0,  reach:115, arcHalf:1.05, desc:'大範圍揮砍，傷害極高、攻速慢' },
  dagger: { name:'匕首',   ic:'🗡️', cls:'melee',  dmgMul:1.3,  spdMul:1.7,  critAdd:18, reach:145, arcHalf:0.30, desc:'快速深刺、範圍窄、暴擊高' },
  staff:  { name:'法杖',   ic:'🪄', cls:'ranged', dmgMul:1.2,  spdMul:0.85, critAdd:0,  homing:true, desc:'發射追蹤法球' },
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
// 各區主題怪物（ic=外觀圖示）
G.ENEMIES = {
  slime:   { name:'史萊姆', ic:'🟢', r:15, color:'#5fc46b', hp:16,  dmg:16, speed:50,  xp:4,  gold:2,  behavior:'chase' },
  slimelet:{ name:'小史萊姆',ic:'🫧', r:11, color:'#7fe08a', hp:10,  dmg:12, speed:70,  xp:3,  gold:1,  behavior:'chase' },
  wolf:    { name:'野狼',   ic:'🐺', r:16, color:'#9aa0b0', hp:30,  dmg:24, speed:96,  xp:8,  gold:4,  behavior:'charger' },
  monkey:  { name:'火猴',   ic:'🐒', r:16, color:'#e0683a', hp:42,  dmg:30, speed:82,  xp:11, gold:5,  behavior:'striker' },
  shrimp:  { name:'蝦兵',   ic:'🦐', r:14, color:'#ff8a6a', hp:38,  dmg:26, speed:72,  xp:10, gold:5,  behavior:'chase' },
  crab:    { name:'蟹將',   ic:'🦀', r:19, color:'#ff6a4a', hp:70,  dmg:36, speed:48,  xp:15, gold:8,  behavior:'striker' },
  icecry:  { name:'冰晶',   ic:'🔷', r:15, color:'#8fd0ff', hp:54,  dmg:34, speed:55,  xp:14, gold:7,  behavior:'ranged' },
  bird:    { name:'妖鳥',   ic:'🐦', r:14, color:'#b0a0ff', hp:50,  dmg:34, speed:122, xp:14, gold:7,  behavior:'charger' },
  rock:    { name:'石頭怪', ic:'🪨', r:22, color:'#9a8a7a', hp:120, dmg:44, speed:42,  xp:21, gold:12, behavior:'chase' },
  bomber:  { name:'爆裂蟲', ic:'💣', r:15, color:'#ff8a3a', hp:22,  dmg:40, speed:92,  xp:9,  gold:4,  behavior:'bomber' },
};

// Boss：ic=外觀；每隻有專屬不重複的 ≥3 普攻 + ≥3 大招；越後面大招越長越複雜
G.BOSSES = {
  slimeKing: { name:'史萊姆王', ic:'🟢', r:46, color:'#4fb05f', hp:700,   dmg:20, speed:52, xp:300,  gold:160,  behavior:'boss', attacks:['slimeSpit','slimeRing','slimeSplit'],         ults:['slimeNova','slimeRain','slimeFlood'] },
  wolfKing:  { name:'狼王',     ic:'🐺', r:48, color:'#8a90a0', hp:1800,  dmg:30, speed:70, xp:700,  gold:450,  behavior:'boss', attacks:['wolfBite','wolfHowl','wolfVolley'],          ults:['wolfPounce','wolfTear','wolfPack'] },
  monkeyKing:{ name:'火猴王',   ic:'🐒', r:48, color:'#d8602e', hp:3600,  dmg:40, speed:72, xp:1500, gold:1000, behavior:'boss', attacks:['apeThrow','apeCone','apeSpin'],              ults:['apeMeteor','apeFlame','apeCross'] },
  dragonKing:{ name:'龍王',     ic:'🐉', r:52, color:'#3aa0b0', hp:6500,  dmg:52, speed:70, xp:3200, gold:2200, behavior:'boss', attacks:['dragBreath','dragTide','dragVolley'],        ults:['dragTsunami','dragRings','dragSpiral'] },
  iceQueen:  { name:'冰雪女王', ic:'❄️', r:50, color:'#7fd0ff', hp:10000, dmg:64, speed:66, xp:5500, gold:3600, behavior:'boss', attacks:['iceShard','iceLance','iceHoming'],          ults:['iceBlizzard','iceNova','iceStorm'] },
  birdDemon: { name:'巨大鳥妖', ic:'🦅', r:50, color:'#a890ff', hp:16000, dmg:78, speed:88, xp:9000, gold:6000, behavior:'boss', attacks:['birdFeather','birdGust','birdHoming'],      ults:['birdDive','birdTornado','birdStorm'] },
  abyssBeast:{ name:'深淵巨獸', ic:'👹', r:58, color:'#8a3cff', hp:28000, dmg:95, speed:72, xp:18000,gold:12000, behavior:'boss', attacks:['abyssSpiral','abyssBurst','abyssWall','abyssBite'], ults:['abyssCross','abyssChaos','abyssRain','abyssRush'] },
};
// ============ 地圖區域 AREAS ============
// 正方形地圖；safe=城鎮不刷怪；reqLevel=傳送門解鎖等級；elem=該區敵人攻擊元素
G.AREAS = {
  town: {
    name:'城鎮', w:1000, h:1000, bg:'#1d2433', safe:true, level:0,
    npcs:[
      { x:360, y:760, name:'鐵匠', ic:'🔨', label:'💬 交談', action:'blacksmith' },
      { x:640, y:760, name:'女神', ic:'🧚', label:'🙏 祈禱', action:'goddess' },
    ],
    portals:[ {to:'plains', x:500, y:230, name:'翠綠原野'} ],
  },
  plains: {
    name:'翠綠原野', w:2000, h:2000, bg:'#16301c', level:1,
    enemies:['slime','slimelet'], maxAlive:12, boss:'slimeKing', bossAt:{x:1000,y:300},
    portals:[ {to:'town', x:1000, y:1850, name:'返回城鎮'}, {to:'forest', x:1000, y:170, name:'幽暗森林', reqLevel:5} ],
  },
  forest: {
    name:'幽暗森林', w:2100, h:2100, bg:'#0f1f14', level:5,
    enemies:['wolf','slime','bomber'], maxAlive:13, boss:'wolfKing', bossAt:{x:1050,y:300},
    portals:[ {to:'plains', x:1050, y:1950, name:'返回原野'}, {to:'desert', x:1050, y:170, name:'炎熱荒漠', reqLevel:10} ],
  },
  desert: {
    name:'炎熱荒漠', w:2300, h:2300, bg:'#2a2010', level:10, elem:'fire',
    enemies:['monkey','wolf','bomber'], maxAlive:14, boss:'monkeyKing', bossAt:{x:1150,y:320},
    portals:[ {to:'forest', x:1150, y:2150, name:'返回森林'}, {to:'dragon', x:1150, y:180, name:'龍宮', reqLevel:16} ],
  },
  dragon: {
    name:'龍宮', w:2400, h:2400, bg:'#10222a', level:16,
    enemies:['shrimp','crab','icecry'], maxAlive:15, boss:'dragonKing', bossAt:{x:1200,y:340},
    portals:[ {to:'desert', x:1200, y:2250, name:'返回荒漠'}, {to:'ice', x:1200, y:190, name:'冰晶宮殿', reqLevel:23} ],
  },
  ice: {
    name:'冰晶宮殿', w:2500, h:2500, bg:'#0e1a24', level:23, elem:'frost',
    enemies:['icecry','crab','wolf'], maxAlive:16, boss:'iceQueen', bossAt:{x:1250,y:340},
    portals:[ {to:'dragon', x:1250, y:2350, name:'返回龍宮'}, {to:'storm', x:1250, y:190, name:'風暴高原', reqLevel:31} ],
  },
  storm: {
    name:'風暴高原', w:2600, h:2600, bg:'#1a1830', level:31, elem:'lightning',
    enemies:['bird','icecry','bomber'], maxAlive:17, boss:'birdDemon', bossAt:{x:1300,y:360},
    portals:[ {to:'ice', x:1300, y:2450, name:'返回冰宮'}, {to:'abyss', x:1300, y:200, name:'黑暗深淵', reqLevel:40} ],
  },
  abyss: {
    name:'黑暗深淵', w:2800, h:2800, bg:'#140a1c', level:40, elem:'lightning',
    enemies:['rock','bird','bomber','monkey'], maxAlive:18, boss:'abyssBeast', bossAt:{x:1400,y:380},
    portals:[ {to:'storm', x:1400, y:2650, name:'返回高原'} ],
  },
};

// ============ 天賦樹 TALENTS ============
// 三向分支；每個節點消耗 1 點，max=最大等級，per=每級加成
// 天賦僅保留「通用」加成；武器專屬能力（穿透、多重箭）改由裝備詞條提供
// 天賦＝通用養成（元素相關移到功法系統）
G.TALENTS = {
  atk: { name:'攻擊', color:'#ff6b6b', nodes:[
    { id:'a1', name:'鋒利',   desc:'攻擊力',     max:8, stat:'dmgPct',     per:4 },
    { id:'a2', name:'迅捷',   desc:'攻擊速度',   max:6, stat:'atkSpdPct',  per:3 },
    { id:'a3', name:'致命',   desc:'暴擊率',     max:6, stat:'critPct',    per:2 },
    { id:'a4', name:'重擊',   desc:'暴擊傷害',   max:8, stat:'critDmgPct', per:10 },
    { id:'a5', name:'爆裂',   desc:'暴擊爆炸（特效）', max:4, proc:'critboom', per:12 },
  ]},
  sur: { name:'生存', color:'#5fd98a', nodes:[
    { id:'s1', name:'強壯',   desc:'最大生命',   max:8, stat:'hp',        per:25 },
    { id:'s2', name:'護甲',   desc:'護甲',       max:6, stat:'armorFlat', per:4 },
    { id:'s3', name:'吸取',   desc:'吸血（特效）', max:4, proc:'lifesteal', per:2 },
    { id:'s4', name:'恢復',   desc:'每秒回血（特效）', max:4, proc:'regen', per:1 },
    { id:'s5', name:'疾行',   desc:'移動速度',   max:5, stat:'movePct',   per:4 },
    { id:'s6', name:'貪婪',   desc:'拾取範圍',   max:3, stat:'pickRange', per:25 },
    { id:'s7', name:'荊棘',   desc:'受擊反傷（特效）', max:4, proc:'thorns', per:15 },
  ]},
  spt: { name:'輔助', color:'#c9a0ff', nodes:[
    { id:'p1', name:'貫穿',   desc:'穿透 +1（投射物）', max:3, stat:'pierce',      per:1 },
    { id:'p2', name:'多重',   desc:'+1 投射物（弓/法杖）', max:2, stat:'projectiles', per:1 },
    { id:'p3', name:'御靈',   desc:'召喚物傷害', max:5, stat:'minionPct',   per:8 },
    { id:'p4', name:'廣域',   desc:'攻擊範圍',   max:5, stat:'rangePct',    per:5 },
  ]},
};

// ============ 功法（氣功）系統 QIGONG ============
// 三條平行：火(傷害/燃燒)、雷(連鎖/麻痺/跑速)、冰(緩速/控場)
// 每 5 等獲得 1 點，最多 10 點（10 階）；每點讓某一條往下推進一階（不可重複同節點）
G.QIGONG = {
  fire: { name:'火', color:'#ff6a3a', ic:'🔥', nodes:[
    { name:'引火',   proc:'burn',     per:8,  desc:'命中燃燒 +8%' },
    { name:'熱浪',   stat:'dmgPct',   per:4,  desc:'攻擊力 +4%' },
    { name:'烈焰',   proc:'burn',     per:10, desc:'命中燃燒 +10%' },
    { name:'焚燒',   stat:'dmgPct',   per:5,  desc:'攻擊力 +5%' },
    { name:'爆燃',   proc:'critboom', per:20, desc:'暴擊爆炸 +20%' },
    { name:'灼心',   proc:'burn',     per:12, desc:'命中燃燒 +12%' },
    { name:'狂炎',   stat:'dmgPct',   per:7,  desc:'攻擊力 +7%' },
    { name:'業火',   proc:'burn',     per:15, desc:'命中燃燒 +15%' },
    { name:'熔core', stat:'critDmgPct',per:25,desc:'暴擊傷害 +25%' },
    { name:'不滅炎', stat:'dmgPct',   per:12, desc:'攻擊力 +12%' },
  ]},
  lightning: { name:'雷', color:'#cfa0ff', ic:'⚡', nodes:[
    { name:'導電',   proc:'chain',    per:10, desc:'連鎖閃電 +10%' },
    { name:'疾風',   stat:'movePct',  per:5,  desc:'移動速度 +5%' },
    { name:'感電',   proc:'chain',    per:12, desc:'連鎖閃電 +12%' },
    { name:'迅捷',   stat:'atkSpdPct',per:5,  desc:'攻擊速度 +5%' },
    { name:'麻痺',   proc:'paraOnHit',per:12, desc:'命中 12% 機率麻痺敵人' },
    { name:'放電',   proc:'chain',    per:14, desc:'連鎖閃電 +14%' },
    { name:'風行',   stat:'movePct',  per:6,  desc:'移動速度 +6%' },
    { name:'雷霆',   proc:'chain',    per:16, desc:'連鎖閃電 +16%' },
    { name:'神速',   stat:'atkSpdPct',per:8,  desc:'攻擊速度 +8%' },
    { name:'天雷',   proc:'paraOnHit',per:18, desc:'命中 18% 機率麻痺敵人' },
  ]},
  ice: { name:'冰', color:'#7fd0ff', ic:'❄️', nodes:[
    { name:'霜寒',   proc:'frost',    per:8,  desc:'命中減速 +8%' },
    { name:'堅冰',   stat:'armorFlat',per:4,  desc:'護甲 +4' },
    { name:'凍結',   proc:'frost',    per:10, desc:'命中減速 +10%' },
    { name:'冰甲',   stat:'hp',       per:30, desc:'最大生命 +30' },
    { name:'冰封',   proc:'freezeChance',per:8,desc:'命中 8% 機率定身敵人' },
    { name:'酷寒',   proc:'frost',    per:12, desc:'命中減速 +12%' },
    { name:'護盾',   stat:'armorFlat',per:6,  desc:'護甲 +6' },
    { name:'絕對零度',proc:'frost',   per:15, desc:'命中減速 +15%' },
    { name:'冰心',   stat:'hp',       per:50, desc:'最大生命 +50' },
    { name:'永凍',   proc:'freezeChance',per:14,desc:'命中 14% 機率定身敵人' },
  ]},
};
