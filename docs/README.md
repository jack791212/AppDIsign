# 設定文件索引

本資料夾整理遊戲各系統的設定，方便日後維護。實際數值定義在 `js/data.js`，
邏輯在 `js/systems.js`（數值/存檔/戰鬥）與 `js/game.js`（迴圈/輸入/渲染）。

| 文件 | 內容 |
|------|------|
| [關卡.md](關卡.md) | 區域清單、解鎖等級、刷怪、Boss、元素 |
| [怪物與BOSS.md](怪物與BOSS.md) | 怪物與 Boss 的數值、外觀、行為、招式 |
| [功法.md](功法.md) | 火/雷/冰 三線功法節點 |
| [天賦.md](天賦.md) | 攻擊/生存/輔助 天賦節點 |
| [裝備.md](裝備.md) | 武器類型、稀有度、詞條、強化、賭裝 |
| [系統.md](系統.md) | 經驗/金幣/連殺/掉落/狀態/操作 |

## 改數值的常見位置（js/data.js）
- 怪物：`G.ENEMIES`　Boss：`G.BOSSES`　關卡：`G.AREAS`
- 詞條：`G.AFFIXES` / `G.LEGEND_AFFIXES`　稀有度：`G.RARITY`
- 武器類型：`G.WEAPON_TYPES`　天賦：`G.TALENTS`　功法：`G.QIGONG`
- 經驗曲線：`G.xpForLevel`（js/systems.js）
