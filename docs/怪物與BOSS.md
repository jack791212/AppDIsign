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

每隻 Boss 有**專屬不重複**的 3+ 普攻與 3+ 大招（越後面關卡大招越長越複雜）。

| id | 外觀 | 名稱 | HP | 專屬普攻 | 專屬大招 |
|----|------|------|----|---------|---------|
| slimeKing | 🟢 | 史萊姆王 | 700 | slimeSpit, slimeRing, slimeSplit(分裂) | slimeNova, slimeRain, slimeFlood |
| wolfKing | 🐺 | 狼王 | 1800 | wolfBite, wolfHowl(召喚), wolfVolley | wolfPounce(撲擊), wolfTear(連續撕咬), wolfPack(狼群) |
| monkeyKing | 🐒 | 火猴王 | 3600 | apeThrow(火球追蹤), apeCone, apeSpin | apeMeteor, apeFlame, apeCross |
| dragonKing | 🐉 | 龍王 | 6500 | dragBreath(龍息光波), dragTide(旋轉彈), dragVolley | dragTsunami(海嘯光波), dragRings, dragSpiral |
| iceQueen | ❄️ | 冰雪女王 | 10000 | iceShard, iceLance, iceHoming | iceBlizzard(暴風雪掃描), iceNova(冰晶方框), iceStorm |
| birdDemon | 🦅 | 巨大鳥妖 | 16000 | birdFeather, birdGust(疾風光波), birdHoming | birdDive(俯衝+爆), birdTornado(龍捲掃描), birdStorm(複合) |
| abyssBeast | 👹 | 深淵巨獸 | 28000 | abyssSpiral, abyssBurst, abyssWall, abyssBite | abyssCross(六向光束×3波), abyssChaos(五臂螺旋), abyssRain, abyssRush(召喚) |

> 全部 Boss 招式互不重複；HP/傷害逐關提升，大招持續時間由史萊姆王 ~1.2s 漸增到深淵巨獸 ~3.8s。

### 可重用招式工具（js/game.js）
`bossShot`(彈幕，可帶 homing/turn/accel) · `addFreeCast`(圓/扇/矩形讀條，可 `mode:'wave'` 光波、`followT/chaseSpeed` 追蹤、`centered` 正方形) · `addEmitter`(持續發射) · `summonAround`(召喚波)。
新增 Boss 招式：在 ATTACKS / ULTS 加一個唯一 id 的函式，再於該 Boss 的 `attacks`/`ults` 引用。
