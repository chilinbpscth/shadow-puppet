# 皮影戲・西遊記

**教學試作／校本自維** — Vite + vanilla JS + Canvas2D。

角色 v1：孫悟空（wukong）。

## 現況（P0＋P1＋P4）

| 階段 | 狀態 | 內容 |
|------|------|------|
| **P0** | 完成 | rig.json ＋各節 PNG |
| **P1** | 完成 | 靜態合成／debug pivots |
| **P2** | 待做 | color.html 填色 |
| **P3** | 待做 | 骨架 overlay 打磨 |
| **P4** | 完成 | MediaPipe Pose lite 鏡頭跟姿 |
| **P5** | 待做 | iPad 硬化 |

## 本機執行

    npm i
    npm run dev

相機需 localhost 或 HTTPS。建置：npm run build

## 鏡頭跟姿（P4）

1. 選「鏡頭跟姿」→ 按「開啟鏡頭」（tap 才請求相機）。
2. facingMode user、640x480；video: autoplay muted playsinline。
3. 鏡像：開（預覽與綁點同一水平翻轉）。
4. 綁定：shoulderMid/hipMid、不拉長、vis hold、EMA、scale 0.7-1.4。
   tail 不跟 pose；staff 跟腕 16。

### MediaPipe 釘版

- package: @mediapipe/tasks-vision@1.0.1
- WASM: public/mediapipe/wasm/
- Model: public/mediapipe/pose_landmarker_lite.task (float16/1)
- 見 public/mediapipe/VERSION.txt

Pages 離線載入 WASM 與 .task，不依賴執行期 CDN。

## iPad Safari

- HTTPS 或本機；按鈕 tap 先開相機。
- 目標約 12-20 fps；lite 模型。
- 授權被拒時請到設定重新允許。

## 部署

GitHub Pages：gh-pages 分支內容為 dist/。
站點：chilinbpscth.github.io/shadow-puppet/

## 非目標

Hands/Face、自由畫、多角色、PWA、React/TS/Three、8th Wall。
