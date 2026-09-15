# 皮影戲・西遊記：完整悟空三格故事

2026-09-12 更新。沿用原 repo 與 GitHub Pages；按用家指示發布本輪試玩版。

## 學生玩法

1. [首頁](https://chilinbpscth.github.io/shadow-puppet/) 選「開始創作」或「繼續作品」。
2. [畫悟空](https://chilinbpscth.github.io/shadow-puppet/color.html)：直接喺完整側身悟空上填色、畫花紋，旁邊有彩色參考；不用逐件揀部位或組裝。不用填滿才演。
3. 用填色處理大面積，再用畫筆加幾筆花紋。橡皮恢復原白底、保留輪廓；本次開頁期間最多 20 步復原，身段外空劃不佔步數。5–10 分鐘只是入門設計目標，未經學生計時。
4. 每筆完成自動保存。「讓悟空上幕」會等待保存完成；失敗保留畫面，按「重試儲存」。
5. [舞台](https://chilinbpscth.github.io/shadow-puppet/stage.html)：同一隻帶色悟空上幕，拖下方粗棍柄：身棍推提帶動全身，腳步按拖動距離輔助變化；空手棍及持棒手棍推提／畫弧控制手臂及金箍棒。放手便停止改姿勢。撥「轉身棍」向左／右換方向，轉身後兩支手棍位置隨之交換。關節微調可拖手腕、腳踝。
6. 編排「出發 → 遇險 → 迎戰」。可套用姿勢再修改；「保存這一格」保存當前格，「下一步」先保存再轉格。已存格可返回修改。
7. 三格完成後按「三格展示」，每格約兩秒；「下載三格圖」輸出橫排 PNG，包含作品名稱和各格標題，不含控制棍、工具或教師資訊。

## 作品保存

不用登入、沒有新增伺服器。作品只存在該瀏覽器；清網站資料會刪除作品。PNG 是展示圖，不能匯入繼續編輯。

保留 IndexedDB `shadow-puppet/coloredParts`，升級 DB 至 v2，新增 `projects`。作品 schemaVersion 1；新版 characterId `wukong-v2`、assetVersion `wukong-profile-v2`，整張填畫存在 `whole`；三格姿勢使用相對舞台座標，另存 facing（-1 向左、1 向右）；舊姿勢缺少 facing 時按原向右載入。圖片及 metadata 在同一 transaction 寫入。

舊作品仍使用 `wukong-legacy-v1` 及原有素材，經 `legacy-color.html` 繼續編輯。開始新版前提供旧影偶 PNG 下載，再封存舊作品及顏色；首頁可還原最新封存，還原前也先封存當前作品。舊筆跡不會套入新輪廓。

## 操偶設計界線

本 app 是觸控簡化操偶；腳步隨身棍拖動、左右撥桿轉身是數碼輔助，不代表已重現傳統完整操杆技法。沒有按住按鈕自動行路或自動揮棒的主玩法。三支操作棍連接頸部附近及雙手，持棒手的金箍棒跟手腕位置、角度，轉身後繪畫、關節、操棍與匯出保持同一面向。

傳統參考：[藝人操杆示範](https://www.chineseshadowpuppetry.com/videos)、[Princeton 影偶結構與演出介紹](https://static-prod.lib.princeton.edu/shadowfigures/about.html)。實際各地偶型、杆數及表演技法有差異。

## 本輪驗證與限制

已實玩完整填畫、空劃不吃復原、橡皮、保存後上幕、右手與棒連動、三格保存重載、下載 PNG。操棍更新另驗證身棍拖移腳步、左右轉身、轉身後手棍與金箍棒連動、重新載入 facing、三格展示隱藏操作棍、下載 PNG 保留面向；14 項 Node 測試通過。瀏覽器 768×1024、1024×768 尺寸已檢查；這不是實體 iPad Safari 通過。仍需老師及 2–3 位學生課堂試玩，確認操作、三格表意、入門填畫時間與重開作品。

新版側身造型暫時只用棍控／關節微調，身體驅動按鈕停用並標示原因；舊造型相機功能保留。相機／實體 iPad／雙指同時操棍未驗收。沒有連續錄影、多角色、登入或藝言堂直接上載。

## Landing 一條龍

首頁 `index.html` 把三步放同一頁：

1. **填色／影相** → `color.html`（本機 IndexedDB）
2. **單機舞台** → `stage.html`（自動載入①作品）
3. **多人 live** → `live.html`（主持）＋ `pad.html`（遙控；認領後「推上舞台」）

正式入口：https://chilinbpscth.github.io/shadow-puppet/

## 多人舞台 P2a（Firebase）

試玩：1 個主持舞台 + 最多 2 部學生遙控（孫悟空、唐僧）。要上網；單機 `stage.html` 不變。舞台用皮影戲燈幕（羊皮／絲布暖光）＋木框，唔用編輯器棋盤格透明底。

### 課堂流程

1. **先填色／影相**：喺 `color.html`（或列印線稿後影相入偶）畫好自己嘅角色作品（存本機 IndexedDB）。
2. **Pad 入場認領**：開 `pad.html` 輸入房間碼 → 認領孫悟空或唐僧座位。
3. **載入作品**：認領時自動讀 IndexedDB；亦可撳「重新載入我嘅作品」。
4. **推上舞台**：撳「推上舞台」一次上傳壓縮 JPEG 到 RTDB `puppets/{id}/art`；主持舞台替換該偶圖像。
5. **操棍**：拖虛擬棍／撥轉身，姿勢約 15Hz 同步。

### 本機測試

```sh
npm install
npm run dev
```

1. 瀏覽器開 [live.html](http://localhost:5173/live.html)（主持／投影）→ 撳「開房」→ 記低大字房間碼。
2. 學生先喺 [color.html](http://localhost:5173/color.html) 填色／影相（首頁揀角色），再開 [pad.html](http://localhost:5173/pad.html)（或 `pad.html?room=XXXXXX`）→ 輸入房間碼 → 認領空位 → 「重新載入」→ 「推上舞台」。
3. 第二部 pad 認領另一個角色；拖棍／撥轉身，主持畫布應見到最多兩隻偶郁動。
4. 主持可撳「開始演出」改 `meta.status`（等候室／演出中）。

正式 build：`npm run build` 後 `dist/live.html`、`dist/pad.html`。Firebase 專案 `chilin-shadow-puppet`；設定喺 `src/live/firebaseConfig.js`。課堂要用 Anonymous Auth + Realtime Database（已開）。

限制（P2a）：姿勢數字持續同步（x/y/scale/facing／棍 localRot）；作品圖只喺「推上舞台」時上傳一次（JPEG ≈480px 寬、quality 0.6，約數十 KB；RTDB 單次寫入上限約 10MB）。座位最多 2。線稿關節圓應只喺肩／肘／髖／膝／踝，唔應喺軀幹中線排成糖人釘；角色 PNG 由素材清理，舞台唔畫棋盤格。

## 維護及部署

```sh
npm ci
npm test
npm run dev
npm run build
```

`dist/` 部署至原 `gh-pages`；原始碼 [repo](https://github.com/chilinbpscth/shadow-puppet)。首頁 `index.html`，繪畫 `color.html`，舞台 `stage.html`，舊作品 `legacy-color.html`。本機預覽與正式站資料不互通。

舊 main 基準 `1223ac198211abc8b6c8d10531256ca378768db1`，舊 gh-pages 基準 `62c618d2a1269a1bfd8fc828c94b9a701f401985`；另保留 `before-whole-figure-source`、`before-whole-figure-pages` 標籤。回退舊程式時，先將原 `src/colorStorage.js` 的 DB_VERSION 改成 2 再 build，不能直接開已升級資料庫或刪 DB；亦可用現版 `legacy-color.html` 處理舊作品。
