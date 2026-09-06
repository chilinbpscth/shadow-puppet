# 皮影戲・西遊記

**教學試作／校本自維** — 小學視藝皮影 Web App（Vite + vanilla JS + Canvas2D）。

角色 v1：孫悟空（wukong）。

## 現況（P0＋P1）

| 階段 | 狀態 | 內容 |
|------|------|------|
| **P0** | 完成 | public/characters/wukong/rig.json ＋各節 PNG 剪影 |
| **P1** | 完成 | 靜態合成頁：pivot／drawOrder 驗證，debug 支點與骨骼線 |
| **P2** | 待做 | color.html 填色 + IndexedDB |
| **P3** | 待做 | 骨架 debug overlay 打磨 |
| **P4** | 待做 | Pose 綁姿態 |
| **P5** | 待做 | iPad Safari 硬化 |

設計約束見：/workspace/ceate-arts/皮影戲/DESIGN.md。

## 本機執行

在專案目錄：

    cd /workspace/shadow-puppet
    npm i
    npm run dev

瀏覽器開啟終端顯示的本機網址（預設 http://localhost:5173/）。

建置：

    npm run build
    npm run preview

## 身段（凍死清單）

head, torso, upperArmL/R, lowerArmL/R, thighL/R, shinL/R, tail（唔跟 pose）, staff（可選，跟 landmark 16）。

近端預留約 12–20% 榫／圓盤重疊。PNG 為深棕／黑剪影 placeholder。

## 部署備註

目標 GitHub Pages：chilinbpscth/shadow-puppet — 尚未設定（開 repo／Pages 前需問用家）。

## 非目標（本階段）

相機／姿態追蹤、Hands／Face、自由畫 UI、多角色、PWA、雲端儲存、第三方 AR SDK。
