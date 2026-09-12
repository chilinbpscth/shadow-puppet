# 皮影戲・西遊記：完整悟空三格故事

2026-09-12 更新。沿用原 repo 與 GitHub Pages；按用家指示發布本輪試玩版。

## 學生玩法

1. [首頁](https://chilinbpscth.github.io/shadow-puppet/) 選「開始創作」或「繼續作品」。
2. [畫悟空](https://chilinbpscth.github.io/shadow-puppet/color.html)：直接喺完整側身悟空上填色、畫花紋，旁邊有彩色參考；不用逐件揀部位或組裝。不用填滿才演。
3. 用填色處理大面積，再用畫筆加幾筆花紋。橡皮恢復原白底、保留輪廓；本次開頁期間最多 20 步復原，身段外空劃不佔步數。5–10 分鐘只是入門設計目標，未經學生計時。
4. 每筆完成自動保存。「讓悟空上幕」會等待保存完成；失敗保留畫面，按「重試儲存」。
5. [舞台](https://chilinbpscth.github.io/shadow-puppet/stage.html)：同一隻帶色悟空上幕，拖下方三支棍擺姿勢。關節微調可拖手腕、腳踝；金箍棒跟右手。
6. 編排「出發 → 遇險 → 迎戰」。可套用姿勢再修改；「保存這一格」保存當前格，「下一步」先保存再轉格。已存格可返回修改。
7. 三格完成後按「三格展示」，每格約兩秒；「下載三格圖」輸出橫排 PNG，包含作品名稱和各格標題，不含控制棍、工具或教師資訊。

## 作品保存

不用登入、沒有新增伺服器。作品只存在該瀏覽器；清網站資料會刪除作品。PNG 是展示圖，不能匯入繼續編輯。

保留 IndexedDB `shadow-puppet/coloredParts`，升級 DB 至 v2，新增 `projects`。作品 schemaVersion 1；新版 characterId `wukong-v2`、assetVersion `wukong-profile-v2`，整張填畫存在 `whole`；三格姿勢使用相對舞台座標。圖片及 metadata 在同一 transaction 寫入。

舊作品仍使用 `wukong-legacy-v1` 及原有素材，經 `legacy-color.html` 繼續編輯。開始新版前提供旧影偶 PNG 下載，再封存舊作品及顏色；首頁可還原最新封存，還原前也先封存當前作品。舊筆跡不會套入新輪廓。

## 本輪驗證與限制

已實玩完整填畫、空劃不吃復原、橡皮、保存後上幕、右手與棒連動、三格保存重載、下載 PNG。瀏覽器 768×1024、1024×768 尺寸已檢查；這不是實體 iPad Safari 通過。仍需老師及 2–3 位學生課堂試玩，確認操作、三格表意、入門填畫時間與重開作品。

新版側身造型暫時只用棍控／關節微調，身體驅動按鈕停用並標示原因；舊造型相機功能保留。相機／實體 iPad 未驗收。沒有連續錄影、多角色、登入或藝言堂直接上載。

## 維護及部署

```sh
npm ci
npm test
npm run dev
npm run build
```

`dist/` 部署至原 `gh-pages`；原始碼 [repo](https://github.com/chilinbpscth/shadow-puppet)。首頁 `index.html`，繪畫 `color.html`，舞台 `stage.html`，舊作品 `legacy-color.html`。本機預覽與正式站資料不互通。

舊 main 基準 `1223ac198211abc8b6c8d10531256ca378768db1`，舊 gh-pages 基準 `62c618d2a1269a1bfd8fc828c94b9a701f401985`；另保留 `before-whole-figure-source`、`before-whole-figure-pages` 標籤。回退舊程式時，先將原 `src/colorStorage.js` 的 DB_VERSION 改成 2 再 build，不能直接開已升級資料庫或刪 DB；亦可用現版 `legacy-color.html` 處理舊作品。
