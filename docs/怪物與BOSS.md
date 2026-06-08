# 怪物與 BOSS

## 一般怪物 `G.ENEMIES`
欄位：`name, ic(外觀emoji), r, color, hp, dmg, speed, xp, gold, behavior`

| id | 外觀 | 名稱 | 行為 | HP | 傷害 |
|----|------|------|------|----|------|
| slime | 🟢 | 史萊姆 | chase | 24 | 12 |
| slimelet | 🫧 | 小史萊姆 | chase | 14 | 9 |
| wolf | 🐺 | 野狼 | charger（衝鋒） | 42 | 18 |
| monkey | 🐒 | 火猴 | striker（扇形爪擊） | 60 | 22 |
| shrimp | 🦐 | 蝦兵 | chase | 55 | 20 |
| crab | 🦀 | 蟹將 | striker | 100 | 28 |
| icecry | 🔷 | 冰晶 | ranged（射擊） | 78 | 26 |
| bird | 🐦 | 妖鳥 | charger | 70 | 26 |
| rock | 🪨 | 石頭怪 | chase（肉盾） | 170 | 34 |
| bomber | 💣 | 爆裂蟲 | bomber（圓形讀條自爆） | 30 | 30 |

### 行為（behavior）
- `chase`：直線追玩家。
- `ranged`：保持距離射擊。
- `striker`：近身觸發 90° 扇形讀條。
- `charger`：進入距離停下→矩形讀條追蹤→鎖定後身體衝鋒（只有撞到才受傷）。
- `bomber`：衝近觸發圓形讀條自爆（自爆死亡不給獎勵）。

## BOSS `G.BOSSES`
欄位：`name, ic, r, color, hp, dmg, speed, xp, gold, attacks[], ults[]`
- `attacks`：普攻池（依冷卻隨機施放）。
- `ults`：大招池；Boss 會停下**閃紅蓄力**後三選一施放。

| id | 外觀 | 名稱 | HP | 普攻 | 大招 |
|----|------|------|----|------|------|
| slimeKing | 🟢 | 史萊姆王 | 1200 | ring, aimVolley | novaRing, bulletRings, meteorRain |
| wolfKing | 🐺 | 狼王 | 3200 | bigBite, aimVolley, coneBurst | jumpSlam, sectorSweep, crossBeams |
| monkeyKing | 🐒 | 火猴王 | 6000 | coneBurst, aimBurst, bigBite | meteorRain, spiralStorm, jumpCross |
| dragonKing | 🐉 | 龍王 | 11000 | ring, spiral, aimBurst, bigBite | bulletRings, crossBeams, spiralPlusRing |
| iceQueen | ❄️ | 冰雪女王 | 18000 | aimVolley, wallRect, ring, twinSpiral | fieldSweepH, boxTrap, bulletRings, sectorSweep |
| birdDemon | 🦅 | 巨大鳥妖 | 30000 | coneBurst, aimBurst, homingOrbs | jumpCross, fieldSweepV, spiralPlusRing, meteorRain |
| abyssBeast | 👹 | 深淵巨獸 | 55000 | spiral, aimBurst, wallRect, bigBite, homingOrbs | crossBeams, spiralPlusRing, jumpCross, fieldSweepV, chargerRush, meteorRain |

### 招式工具（定義於 js/game.js 的 ATTACKS / ULTS）
- 普攻：`aimVolley`(瞄準齊射) `ring`(環形) `spiral`(螺旋) `aimBurst`(連射) `wallRect`(矩形) `sectorSlash`(扇形) `bigBite`(超大扇形撕咬) `coneBurst`(錐形) `homingOrbs`(追蹤彈) `twinSpiral`(雙臂螺旋)
- 大招：`novaRing` `meteorRain`(隕石) `sectorSweep`(連續扇形) `crossBeams`(十字光束) `bulletRings`(多重環) `spiralStorm`(螺旋風暴) `jumpSlam`(跳躍砸地) `jumpCross`(跳躍+十字) `homingBloom`(追蹤爆) `fieldSweepH/V`(全場掃描) `megaCharge`(大光波) `bomberSwarm`/`chargerRush`(召喚波) `boxTrap`(方框) `spiralPlusRing`(複合)

可重用工具：`bossShot`(彈幕)、`addFreeCast`(圓/扇/矩形讀條，可 `mode:'wave'` 放光波、`followT/chaseSpeed` 追蹤、`centered` 正方形)、`addEmitter`(持續發射)。
