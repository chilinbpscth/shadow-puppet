import { loadRig } from './loadRig.js';
import { drawPuppet } from './drawPuppet.js';
import { createPoseLandmarker, MEDIAPIPE_VERSION } from './poseLandmarker.js';
import { bindPoseFromLandmarks } from './bindPose.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('camera');
const debugToggle = document.getElementById('debugToggle');
const btnReset = document.getElementById('btnReset');
const btnRedraw = document.getElementById('btnRedraw');
const btnStartCam = document.getElementById('btnStartCam');
const btnStopCam = document.getElementById('btnStopCam');
const partList = document.getElementById('partList');
const statusEl = document.getElementById('status');
const modeStatic = document.getElementById('modeStatic');
const modePose = document.getElementById('modePose');
const poseControls = document.getElementById('poseControls');
const mirrorLabel = document.getElementById('mirrorLabel');

/** @type {{ rig: object, images: Map<string, HTMLImageElement> } | null} */
let state = null;

/** @type {'static' | 'pose'} */
let mode = 'static';

/** Selfie mirroring: preview + landmarks share the same flip. */
const MIRROR = true;

let landmarker = null;
let landmarkerLoading = null;
let mediaStream = null;
let rafId = 0;
let lastDetectTs = 0;
let smoothLm = null;
let prevJoints = null;
let prevAngles = new Map();
let prevScale = 1;
let fpsEma = 15;
let lastFrameTs = 0;

const DETECT_MIN_MS = 50; // ~20 fps cap for detect; draw still on rAF

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#ff8a7a' : '#9dce8a';
}

function renderStatic() {
  if (!state) return;
  drawPuppet(ctx, state.rig, state.images, {
    showDebug: debugToggle.checked,
    cx: canvas.width / 2,
    cy: canvas.height * 0.36,
    scale: 1,
    clear: true,
  });
}

function fillPartList(rig) {
  partList.innerHTML = '';
  const sorted = [...rig.parts].sort(
    (a, b) => (a.drawOrder ?? 0) - (b.drawOrder ?? 0),
  );
  for (const p of sorted) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = p.labelZh || p.id;
    const right = document.createElement('span');
    right.className = 'id';
    right.textContent = p.id + (p.optional ? '（可選）' : '');
    li.append(left, right);
    partList.appendChild(li);
  }
}

function setMode(next) {
  mode = next;
  const isPose = mode === 'pose';
  modeStatic.checked = !isPose;
  modePose.checked = isPose;
  poseControls.hidden = !isPose;
  if (mirrorLabel) {
    mirrorLabel.hidden = !isPose;
  }
  if (!isPose) {
    stopCamera();
    renderStatic();
    setStatus('靜態預覽模式');
  } else {
    setStatus('鏡頭跟姿：請先按「開啟鏡頭」（需 HTTPS／本機）');
  }
}


function getVideoCoverLayout() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!vw || !vh) return null;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  return { dx, dy, dw, dh, scale };
}

function drawCameraBackground() {
  const layout = getVideoCoverLayout();
  if (!layout) return;
  const { dx, dy, dw, dh } = layout;
  const cw = canvas.width;
  const ch = canvas.height;

  ctx.save();
  if (MIRROR) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, cw - dx - dw, dy, dw, dh);
  } else {
    ctx.drawImage(video, dx, dy, dw, dh);
  }
  ctx.restore();

  // dim so puppet stays readable
  ctx.fillStyle = 'rgba(26, 18, 12, 0.45)';
  ctx.fillRect(0, 0, cw, ch);
}

function poseLoop(ts) {
  rafId = requestAnimationFrame(poseLoop);
  if (mode !== 'pose' || !state) return;

  if (lastFrameTs) {
    const inst = 1000 / Math.max(1, ts - lastFrameTs);
    fpsEma = fpsEma * 0.9 + inst * 0.1;
  }
  lastFrameTs = ts;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (video.readyState >= 2) {
    drawCameraBackground();
  }

  if (landmarker && video.readyState >= 2 && mediaStream) {
    if (ts - lastDetectTs >= DETECT_MIN_MS) {
      lastDetectTs = ts;
      try {
        const result = landmarker.detectForVideo(video, ts);
        const lms = result?.landmarks?.[0];
        const layout = getVideoCoverLayout();
        const bound = bindPoseFromLandmarks(state.rig, lms, layout, {
            mirror: MIRROR,
            prevSmooth: smoothLm,
            prevJoints,
            prevAngles,
            prevScale,
          });
        smoothLm = bound.smooth;
        if (bound.joints) prevJoints = bound.joints;
        prevAngles = bound.angles || prevAngles;
        prevScale = bound.globalScale ?? prevScale;
      } catch (err) {
        console.warn(err);
      }
    }
  }

  if (prevJoints && prevJoints.size) {
    drawPuppet(ctx, state.rig, state.images, {
      showDebug: debugToggle.checked,
      scale: prevScale,
      joints: prevJoints,
      clear: false,
      cx: canvas.width / 2,
      cy: canvas.height * 0.36,
    });
  }

  ctx.fillStyle = 'rgba(243, 230, 208, 0.75)';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    '鏡像：開（自拍預覽＝綁點） · ~' + Math.round(fpsEma) + ' fps',
    12,
    20,
  );
}

async function ensureLandmarker() {
  if (landmarker) return landmarker;
  if (landmarkerLoading) return landmarkerLoading;
  landmarkerLoading = (async () => {
    setStatus('載入 Pose 模型（' + MEDIAPIPE_VERSION + '）…');
    landmarker = await createPoseLandmarker();
    setStatus('Pose 模型已就緒');
    return landmarker;
  })();
  try {
    return await landmarkerLoading;
  } finally {
    landmarkerLoading = null;
  }
}

async function startCamera() {
  if (mode !== 'pose') setMode('pose');
  if (mediaStream) return;

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    setStatus('相機需要 HTTPS（或 localhost）。請用 GitHub Pages 網址。', true);
    return;
  }

  try {
    btnStartCam.disabled = true;
    setStatus('請求鏡頭權限…');
    await ensureLandmarker();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    mediaStream = stream;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    await video.play();

    smoothLm = null;
    prevJoints = null;
    prevAngles = new Map();
    prevScale = 1;
    lastDetectTs = 0;
    lastFrameTs = 0;

    if (!rafId) rafId = requestAnimationFrame(poseLoop);
    btnStopCam.disabled = false;
    setStatus('鏡頭跟姿中 · 請站入畫面');
  } catch (err) {
    console.error(err);
    setStatus('無法開啟鏡頭：' + (err?.message || String(err)), true);
    stopCamera();
  } finally {
    btnStartCam.disabled = false;
  }
}

function stopCamera() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (mediaStream) {
    for (const t of mediaStream.getTracks()) t.stop();
    mediaStream = null;
  }
  video.srcObject = null;
  if (btnStopCam) btnStopCam.disabled = true;
}

async function init() {
  try {
    setStatus('載入 rig 與身段圖片…');
    state = await loadRig();
    fillPartList(state.rig);
    setMode('static');
    renderStatic();
    setStatus(
      '已載入 ' + state.rig.parts.length + ' 件身段 · ' + state.rig.labelZh,
    );
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

modeStatic.addEventListener('change', () => {
  if (modeStatic.checked) setMode('static');
});
modePose.addEventListener('change', () => {
  if (modePose.checked) setMode('pose');
});
debugToggle.addEventListener('change', () => {
  if (mode === 'static') renderStatic();
});
btnRedraw.addEventListener('click', () => {
  if (mode === 'static') renderStatic();
});
btnReset.addEventListener('click', () => {
  debugToggle.checked = false;
  if (mode === 'static') {
    renderStatic();
    setStatus('已重設為預設站立／T 字姿勢');
  } else {
    smoothLm = null;
    prevJoints = null;
    prevAngles = new Map();
    prevScale = 1;
    setStatus('已清除跟姿平滑狀態');
  }
});
btnStartCam.addEventListener('click', () => {
  startCamera();
});
btnStopCam.addEventListener('click', () => {
  stopCamera();
  setStatus('已關閉鏡頭');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(90, 55, 30, 0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f3e6d0';
  ctx.font = '16px sans-serif';
  ctx.fillText('鏡頭已關閉 — 再按「開啟鏡頭」繼續', 40, 80);
});

init();
