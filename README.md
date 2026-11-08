# Pokémon GO 對戰模擬器

照 **2026-06-23 新版對戰系統**計算出招時機的逐回合模擬器。
全靜態、純前端、無後端、月費 0 元。

```bash
npm install
npm run data                # 抓最新資料、驗證（22 項檢查）、跟上一版比對變動
npm run changelog:backfill  # 一次性：回填真實的歷史變動日誌（約 36 MB、跑幾分鐘）
npm run verify              # 驗證模擬器（11 項）
npm run dev                 # http://localhost:4321
npm run build               # 產出 out/，直接丟任何靜態主機
```

---

## 資料從哪裡來

| 用途 | 來源 | 授權 | 更新 |
|---|---|---|---|
| 寶可夢／招式 | `pvpoke/pvpoke` `src/data/gamemaster.min.json` | MIT | 每 2–3 天 |
| 聯盟排名與實際招式使用數 | 同上 `src/data/rankings/all/overall/rankings-{cp}.json` | MIT | 同上 |
| CP Multiplier 表 | 同上 `src/js/pokemon/Pokemon.js` → `data/cpm.json` | MIT | 幾乎不變 |
| 中文名（主） | `PokeMiners/pogo_assets` `Texts/Latest APK/{English,ChineseTraditional}.txt` | 公開 datamine | 慢（上次 2025-08） |
| 中文名（補） | `PokeAPI/pokeapi` `data/v2/csv/{pokemon_species,move}_names.csv`（`language_id=4`） | 本傳官方譯名 | 跟著本傳 |
| 型態後綴中文 | `data/zh-forms.json`（手工表，用詞取自上面兩份） | — | 新型態上線時補 |
| 寶可夢圖示 | `PokeMiners/pogo_assets` `Images/Pokemon/Addressable Assets/pm{編號}[.f{型態}].icon.png` | 公開 datamine | 跟著改版 |
| 屬性圖示 | 同上 `Images/Types/POKEMON_TYPE_*.png` | 同上 | 幾乎不變 |
| 補缺的圖 | `PokeAPI/sprites` 的 Pokémon HOME 圖 | — | 跟著本傳 |

**刻意不用 `PokeMiners/game_masters`** 當對戰數值的主源：2026-11-08 實測最近更新停在 2026-08-29，
上一次是 4 月。但它的**文字檔**是另一回事——那是遊戲裡真正會看到的中文字，
名字又幾乎不會改，所以中文名以它為主、PokeAPI 補新內容。

`npm run data` 會把 938 KB 原始檔瘦身成約 540 KB，同時寫一份到 `public/data/`，
前端用 `fetch` 載入——app shell 先畫出來，而且換資料不必重 build。

### 資料驗證（`npm run data` 會跑，任一項失敗就不產出檔案）

22 項檢查（20 項硬檢查 + 2 項提醒），包含結構、招式池參照完整性、屬性合法性、資料新鮮度，以及最關鍵的一項：

> **CP 引擎對帳** — 用 pvpoke 自己算好的 `defaultIVs` 回推 CP，
> 1619 隻在超級聯盟的 CP 必須全部 ≤1500。
> 這一項同時驗證了我們的 CPM 表、等級索引推論與 CP 公式。

中文化也是硬檢查，不是盡力而為：**84 種型態後綴**、**1619 隻寶可夢**、
**355 個招式**全部要查得到中文名，而且寶可夢與招式的中文名都不准互相撞名；
少一個就中止產出。新型態或新招式上線時會直接在這裡報錯，
不會默默在畫面上留一個英文名。

招式撞名那一項抓到過真的問題：超級專用招在遊戲裡叫 `Brave Bird+`，
數值卻跟原招差很多（威力 130/能量 55 vs 70/40），但中文都翻成「勇鳥猛攻」。
現在依序套三條規則區分——遊戲自己的 `＋`、屬性（氣場輪有惡與電兩種）、
`data/zh-forms.json` 的手工表（堅盾劍怪盾牌形態的快招）——還撞名就中止。

---

## 圖示

**圖片不放進這個 repo。** 那些是 Niantic 的美術資產，PokeMiners 只是從 APK 挖出來；
這裡只存識別碼（`go:pm487.fORIGIN`、`home:778`），執行時由 CDN 取，
所以這個專案不重新散布任何美術檔。來源與網址組法在
[`src/lib/icons.ts`](src/lib/icons.ts) 與 [`scripts/lib/icons.mjs`](scripts/lib/icons.mjs)，兩邊是同一組常數。

對照怎麼來的：GO 的檔名是 `pm{圖鑑編號}[.f{型態代碼}].icon.png`，
型態代碼是 Niantic 自己的英文列舉，大多數把 pvpoke 的後綴轉大寫就對得上
（`Therian` → `THERIAN`），對不上的收在 `data/icon-forms.json`
（`Alolan` → `ALOLA`、`Paldean` → `PALDEA`、Burmy 那種還要再掛一次 species 名）。
實際結果：

- **1584 隻**用 GO 自己的美術
- **35 隻** PokeMiners 沒有（含超級聯盟第 4 的謎擬Ｑ、第 5 的古月鳥），用 PokeAPI 的 Pokémon HOME 圖補
- **19 隻**退回本體圖——pvpoke 收了一些遊戲裡還沒實裝的超級型態，Niantic 根本還沒畫

**招式沒有自己的圖。** 遊戲裡招式就是用屬性圖示表示的（`Images/Combat` 裡確認過沒有招式美術），
所以招式一律顯示它的屬性圖示。

**不要用 jsDelivr。** jsDelivr 對整個 repo 有 50 MB 上限，`pogo_assets` 遠遠超過，
會零星回 403「Package size exceeded」——而且已經被它快取的照樣 200，
所以隨便抽幾張測是測不出來的（這就是抽驗要抽 60 張的原因）。
現在走 `statically.io`，載入失敗時前端會自己退回 `raw.githubusercontent.com`。

---

## 每日變動日誌

招式平衡調整是輸球的隱形原因：一招威力 +10、能量 −5，整個聯盟的對位就換一輪，
官方不會發公告。`npm run data` 每次都會跟上一版比對，把差異記進 `data/changelog.json`：

```
2026-09-01  Merge from master
  招式調整 8 項
    ◆ 空氣利刃  威力 45 → 60、能量需求 35 → 40、觸發機率 0.3 → 0.125
        影響主流：鋼鎧鴉（高級 #2）、鋼鎧鴉（暗影）（高級 #4）
    ◆ 泰山壓頂  威力 55 → 65、能量需求 35 → 40
        影響主流：卡比獸（暗影）（高級 #3）、卡比獸（高級 #13）、過動猿（超級 #26）
```

比對的項目：招式的威力／能量／回合數／能力變化、寶可夢的三圍與屬性、
**招式池增減**、新上線與下架、以及排名進出榜。
每一條招式調整都會標出「現在的主流裡誰會這招、排第幾」，
所以看得出來這次改動實際會打到誰。

幾個刻意的設計：

- **不另外存快照。** 上一版就是上一次寫出去的 `data/gamemaster.json` 自己。
- **招式全部出貨，不只「有寶可夢學得會」的那些。** pvpoke 常在寶可夢上線前
  就先把新招加進來，那正是最值得提早知道的變動（多出的 33 個招式約 4 KB）。
- **排名變動算次要訊號。** 資料源每次重算排名都會出一版，
  只有排名動的版本標成「沒有影響對戰的變動」，介面預設收起來。
- **`npm run changelog:backfill` 會回填真實歷史**：
  逐個抓 pvpoke 歷史上每一版 `gamemaster.min.json` 來比對，
  所以第一天就有紀錄可看，不是空的。

`.github/workflows/daily-data.yml` 是每天跑一次的排程。推上 GitHub 之後要做兩件事：

1. Settings → Actions → General → Workflow permissions 改成 **Read and write**
2. 把 repo 接到 Cloudflare Pages（或任何跟著 push 自動部署的靜態主機）

硬檢查失敗時那個 job 會紅燈而且**不會 commit**——寧可停在舊資料，也不要推半套上線。

---

## 對戰規則（為什麼要重寫）

Niantic 在 2026-06-23 重寫了 PvP 對戰系統，舊系統在 2026-08-30 世界賽後永久退役。
網路上大量攻略是改版前的，**出招時機的結論已經不成立**。

`src/lib/battle.ts` 照[官方公告](https://pokemongo.com/news/pvp-updates2026)實作五條規則：

1. 傷害與能量在**回合結束**結算 → 同回合的 1 回合快招會平手，雙方都生效。
2. 交換永遠先於傷害結算。
3. 快速交換 1 回合、強制交換 0 回合、大招結束時的交換 0 回合。
4. **大招在按下的下一回合才發動**（舊系統立刻發動，這條差最多）。
5. 大招的傷害與能力變化一定在 leak 進來的快招之前結算；
   sneak 快招只能發生在大招被按下的那一回合。

---

## 模擬器驗證（`npm run verify`）

**A. 規則單元測試 — 10 項，必須全過。**
逐條驗證上面五條規則、CMP 先手、第一發大招的回合公式，
以及傷害公式與一份獨立重寫的實作逐筆對帳（200 組，0 組不符）。

**B. 對 pvpoke 官方對位結果的外部對帳。**
拿 pvpoke 排名裡的 `matchups` / `counters` 當標準答案，
完全照它的 `rankingScenarios`（leads／closers／switches／chargers／attackers）跑五種情境平均，
比對勝負方向：**800 組中 637 組一致（79.6%）**。

### 已知落差

傷害、能量、回合時序是**精確計算**；落差來自**出招決策**。
pvpoke 的 `ActionLogic` 是 1294 行的 DP 搜尋，本專案只移植了三段關鍵啟發式
（生存檢查、誘餌捷徑、簡化版 DP）與完整的 `wouldShield`。
另外 Mimikyu 之類有特殊型態機制的寶可夢也還沒處理。

所以：**時間軸上的回合數、能量、傷害可以信；整體勝負預測當參考。**

---

## 介面

- 畫面全中文（寶可夢、招式、型態、屬性都是 GO 遊戲內的用字）；
  搜尋框中英文都吃得下，查國外攻略時打英文比較快
- 寶可夢圖示出現在選單、面板與對位；招式與屬性用屬性圖示，
  時間軸上一眼就看得出這一回合丟的是什麼屬性
- 頂端一條「資料變動」，收起來時用一句話交代最近一次有影響的改動，
  展開是完整日誌，預設只列有影響對戰的版本
- 三個聯盟切換，預設招式直接用 pvpoke 推薦的那一組
- 兩側各自選寶可夢／快招／兩個大招／護盾
- 「最佳出招」vs「能量一滿就丟」可以切換對照，看得出誘餌的價值
- 逐回合時間軸：每回合雙方做了什麼、累積能量、剩餘 HP，
  大招發動回合highlight，並標出「最快第幾回合按得下第一發大招」

## 還沒做

- 我的寶可夢收藏、反制查詢、對戰紀錄
- 變動日誌目前講「影響到哪些主流寶可夢」，等收藏做好才講得出「影響到你的哪幾隻」
