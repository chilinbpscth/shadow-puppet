import {readProject,updateProject,encodePose,decodePose} from './projectStorage.js';
import {renderArtwork,downloadCanvas} from './exportArtwork.js';
import { loadRig } from './loadRig.js';
import { drawPuppet, drawHandles } from './drawPuppet.js';
import { bindPoseFromLandmarks } from './bindPose.js';
import {
  createManualPose,
  constrainPose,
  clonePose,
  applyPose,
  resolveManualJoints,
  getHandles,
  hitTestHandle,
  applyDrag,
} from './dragPose.js';
import { applyPreset, getPreset } from './posePresets.js';
import { createRodControls } from './rodControls.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('camera');
const debugToggle = document.getElementById('debugToggle');
const btnReset = document.getElementById('btnReset');
const btnRedraw = document.getElementById('btnRedraw');
const btnStartCam = document.getElementById('btnStartCam');
const btnStopCam = document.getElementById('btnStopCam');
const btnBackManual = document.getElementById('btnBackManual');
const btnSave = document.getElementById('btnSave');
const btnNext = document.getElementById('btnNext');
const btnPlayback = document.getElementById('btnPlayback');
const partList = document.getElementById('partList');
const statusEl = document.getElementById('status');
const modeManual = document.getElementById('modeManual');
const modeBody = document.getElementById('modeBody');
const bodyControls = document.getElementById('bodyControls');
const dragHintEl = document.getElementById('dragHint');
const taskMain = document.getElementById('taskMain');
const missionCardsEl = document.getElementById('missionCards');
const modeRods = document.getElementById('modeRods');
const modeJoints = document.getElementById('modeJoints');
const rodRail = document.getElementById('rodRail');
const rodToolbar = document.getElementById('rodToolbar');

/** @type {{ rig: object, images: Map<string, HTMLImageElement> } | null} */
let state = null;

/** @type {'manual' | 'body'} */
let mode = 'manual';

const MIRROR = true;
const LANDMARKER_TIMEOUT_MS = 25000;
const DETECT_MIN_MS = 50;

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
let mediapipeVersion = 'tasks-vision';

/** Manual pose state */
let manualPose = null;
let handles = [];
let activeHandle = null;
let dragMeta = null;
let hasDragged = false;
let hintPulse = 0;
let animRaf = 0;

/** @type {ReturnType<typeof createRodControls> | null} */
let rodControls = null;

const MISSIONS = [
  {
    title: '\u51fa\u767c',
    task: '\u62d6\u52d5\u624b\u8173\u7684\u5713\u9ede\uff0c\u5e6b\u5b6b\u609f\u7a7a\u64fa\u51fa\u300c\u6e96\u5099\u51fa\u767c\u300d\u7684\u59ff\u52e2\u3002',
    story: '\u609f\u7a7a\u6536\u62fe\u884c\u88dd\uff0c\u6e96\u5099\u897f\u884c\u3002',
    tip: '\u8996\u85dd\u63d0\u793a\uff1a\u624b\u8173\u600e\u6a23\u6446\uff0c\u624d\u50cf\u300c\u6e96\u5099\u51fa\u767c\u300d\uff1f',
  },
  {
    title: '\u9047\u96aa',
    task: '\u64fa\u51fa\u300c\u9047\u96aa\u300d\u59ff\u52e2\u2014\u2014\u8eab\u5f62\u4e00\u7dca\uff0c\u6e96\u5099\u61c9\u8b8a\u3002',
    story: '\u5c71\u8def\u9047\u5996\uff0c\u8eab\u5f62\u4e00\u7dca\u3002',
    tip: '\u8996\u85dd\u63d0\u793a\uff1a\u53ea\u6539\u624b\u8098\u548c\u819d\u982d\uff0c\u600e\u6a23\u4ee4\u89d2\u8272\u770b\u8d77\u4f86\u66f4\u7dca\u5f35\uff1f',
  },
  {
    title: '\u8fce\u6230',
    task: '\u64fa\u51fa\u300c\u8fce\u6230\u300d\u59ff\u52e2\u2014\u2014\u8209\u68d2\u3001\u8e0f\u7a69\uff0c\u6e96\u5099\u51fa\u624b\u3002',
    story: '\u8209\u8d77\u91d1\u7b8d\u68d2\uff0c\u8fce\u6230\u524d\u65b9\uff01',
    tip: '\u8996\u85dd\u63d0\u793a\uff1a\u54ea\u4e9b\u95dc\u7bc0\u8b8a\u5316\uff0c\u6700\u80fd\u8868\u9054\u300c\u529b\u91cf\u300d\uff1f',
  },
];

let missionIndex = 0;
/** @type {(ReturnType<typeof clonePose> | null)[]} */
const savedPoses = [null, null, null];
let playbackTimer = 0;
let projectQueue = Promise.resolve();
let projectSaveFailed = false;
let pendingProjectSaves = 0;
let dirtyPose = false;
let playbackStep = -1;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#ff8a7a' : '#9dce8a';
}

function layoutCenter() {
  return { cx: canvas.width / 2, cy: canvas.height * (state?.rig.profile ? .43 : .52), scale: state?.rig.profile ? .62 : .8 };
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
    right.textContent = p.id + (p.optional ? '\uff08\u53ef\u9078\uff09' : '');
    li.append(left, right);
    partList.appendChild(li);
  }
}

function updateMissionUI() {
  document.getElementById('btnDownload').disabled = savedPoses.some(p => !p);
  const m = MISSIONS[missionIndex];
  taskMain.textContent = ['慢慢拖身棍，帶悟空出發；提一提，試吓腳步變化。','撥動轉棍換方向，再用手棍演出遇險。','提起持棒手棍，向前推或畫弧，試吓揮棒。'][missionIndex];
  const tipEl = document.getElementById('artTip');
  if (tipEl) tipEl.textContent = m.tip;
  for (const card of missionCardsEl.querySelectorAll('.mission-card')) {
    const i = Number(card.dataset.mission);
    card.classList.toggle('active', i === missionIndex);
    const selectBtn = card.querySelector('.mission-select');
    if (selectBtn) {
      selectBtn.setAttribute('aria-pressed', i === missionIndex ? 'true' : 'false');
    }
    const saveEl = card.querySelector('.mission-save');
    if (saveEl) {
      const ok = !!savedPoses[i];
      saveEl.dataset.saved = ok ? '1' : '0';
      saveEl.textContent = i === missionIndex && dirtyPose ? '已修改' : ok ? '已保存' : '未保存';
    }
  }
}

function jointsForDraw() {
  if (!state || !manualPose) return null;
  return resolveManualJoints(state.rig, manualPose);
}

function showJointHandles() {
  return (
    mode === 'manual' &&
    (!rodControls || rodControls.getMode() === 'joints')
  );
}

function renderManual() {
  if (!state || !manualPose) return;
  constrainPose(state.rig, manualPose, canvas.width, canvas.height);
  const joints = jointsForDraw();
  handles = getHandles(state.rig, manualPose, joints);
  drawPuppet(ctx, state.rig, state.images, {
    showDebug: debugToggle.checked,
    cx: manualPose.rootX,
    cy: manualPose.rootY,
    scale: manualPose.scale,
    joints,
    clear: true,
  });

  rodControls?.setVisible(mode === 'manual' && playbackStep < 0);
  rodControls?.syncGripPositions();

  if (playbackStep < 0 && showJointHandles()) {
    const hintId =
      !hasDragged && handles.length
        ? handles.find((h) => h.kind === 'wrist')?.id || handles[0].id
        : null;
    drawHandles(ctx, handles, {
      activeId: activeHandle?.id || null,
      hintId,
      pulse: hintPulse,
    });
  }
}

function ensureManualAnim() {
  if (animRaf || mode !== 'manual') return;
  const tick = (ts) => {
    animRaf = 0;
    if (mode !== 'manual') return;
    hintPulse = ts / 200;
    if (!hasDragged) {
      renderManual();
      animRaf = requestAnimationFrame(tick);
    }
  };
  animRaf = requestAnimationFrame(tick);
}

function stopManualAnim() {
  if (animRaf) {
    cancelAnimationFrame(animRaf);
    animRaf = 0;
  }
}

function setControlMode(next) {
  const m = next === 'joints' ? 'joints' : 'rods';
  if (modeRods) modeRods.checked = m === 'rods';
  if (modeJoints) modeJoints.checked = m === 'joints';
  if (rodControls) rodControls.setMode(m);
  if (dragHintEl) {
    dragHintEl.textContent =
      m === 'rods'
        ? '\u63d0\u793a\uff1a\u62d6\u52d5\u4e0b\u65b9\u865b\u64ec\u68cd\u64fa\u59ff\u52e2'
        : '\u63d0\u793a\uff1a\u62d6\u52d5\u624b\u8173\u5713\u9ede\u64fa\u59ff\u52e2';
  }
  if (mode === 'manual') {
    renderManual();
    setStatus(
      m === 'rods'
        ? '\u68cd\u63a7\uff1a\u62d6\u4e0b\u65b9\u4e09\u652f\u68cd\uff08\u8ec0\u5e79\uff0f\u5de6\u624b\uff0f\u53f3\u624b\uff09'
        : '\u95dc\u7bc0\u5fae\u8abf\uff1a\u62d6\u5713\u9ede\u7d30\u8abf',
    );
  }
}

function setMode(next) {
  rodControls?.cancelDrags();
  rodControls?.setVisible(next === 'manual');
  mode = next;
  const isBody = mode === 'body';
  modeManual.checked = !isBody;
  modeBody.checked = isBody;
  bodyControls.hidden = !isBody;
  if (rodToolbar) rodToolbar.hidden = isBody;
  if (!isBody) {
    stopCamera();
    stopManualAnim();
    renderManual();
    ensureManualAnim();
    const cm = rodControls?.getMode() || 'rods';
    setStatus(
      cm === 'rods'
        ? '\u624b\u52d5\u64cd\u7e31\uff1a\u68cd\u63a7\u64fa\u59ff\u52e2'
        : '\u624b\u52d5\u64cd\u7e31\uff1a\u62d6\u5713\u9ede\u64fa\u59ff\u52e2',
    );
  } else {
    stopManualAnim();
    setStatus(
      '\u8eab\u9ad4\u9a45\u52d5\uff1a\u8acb\u6309\u300c\u8a66\u7528\u8eab\u9ad4\u9a45\u52d5\u300d\uff08\u9700 HTTPS\uff0f\u672c\u6a5f\uff09',
    );
  }
}

function returnToManual(msg, isError = false) {
  setMode('manual');
  if (msg) setStatus(msg, isError);
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
  ctx.fillStyle = 'rgba(26, 18, 12, 0.45)';
  ctx.fillRect(0, 0, cw, ch);
}

function poseLoop(ts) {
  rafId = requestAnimationFrame(poseLoop);
  if (mode !== 'body' || !state) return;

  if (lastFrameTs) {
    const inst = 1000 / Math.max(1, ts - lastFrameTs);
    fpsEma = fpsEma * 0.9 + inst * 0.1;
  }
  lastFrameTs = ts;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (video.readyState >= 2) drawCameraBackground();

  let tracked = false;
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
        tracked = !!(bound.ok && bound.joints?.size);
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
  const trackMsg = tracked
    ? '\u5df2\u8ddf\u5230\u4f60'
    : mediaStream
      ? '\u627e\u4e0d\u5230\u4eba\uff0f\u5019\u6a5f\u8fa8\u8b58'
      : '\u5019\u6a5f\u6b0a\u9650';
  ctx.fillText(
    trackMsg + ' \u00b7 ~' + Math.round(fpsEma) + ' fps',
    12,
    20,
  );
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(label + ' \u903e\u6642\uff08' + ms / 1000 + 's\uff09')),
        ms,
      ),
    ),
  ]);
}

async function ensureLandmarker() {
  if (landmarker) return landmarker;
  if (landmarkerLoading) return landmarkerLoading;
  landmarkerLoading = (async () => {
    setStatus('\u8f09\u5165 Pose \u6a21\u7d44\u2026');
    const mod = await import('./poseLandmarker.js');
    mediapipeVersion = mod.MEDIAPIPE_VERSION;
    setStatus('\u8f09\u5165 Pose \u6a21\u578b\uff08' + mediapipeVersion + '\uff09\u2026');
    landmarker = await withTimeout(
      mod.createPoseLandmarker(),
      LANDMARKER_TIMEOUT_MS,
      'Pose \u6a21\u578b',
    );
    setStatus('Pose \u6a21\u578b\u5df2\u5c31\u7dd2');
    return landmarker;
  })();
  try {
    return await landmarkerLoading;
  } catch (err) {
    landmarkerLoading = null;
    throw err;
  } finally {
    if (landmarker) landmarkerLoading = null;
  }
}

async function openUserCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('\u6b64\u700f\u89bd\u5668\u4e0d\u652f\u63f4 getUserMedia');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    if (
      err?.name === 'OverconstrainedError' ||
      err?.name === 'ConstraintNotSatisfiedError'
    ) {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

function waitForVideoSize(vid, timeoutMs = 8000) {
  if (vid.videoWidth > 0 && vid.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error('\u93e1\u982d\u756b\u9762\u5c3a\u5bf8\u672a\u5c31\u7dd2'));
    }, timeoutMs);
    const onMeta = () => {
      if (vid.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(t);
      vid.removeEventListener('loadedmetadata', onMeta);
      vid.removeEventListener('resize', onMeta);
    };
    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('resize', onMeta);
  });
}

async function startCamera() {
  if (mode !== 'body') setMode('body');
  if (mediaStream) return;

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    setStatus(
      '\u76f8\u6a5f\u9700\u8981 HTTPS\uff08\u6216 localhost\uff09\u3002\u53ef\u8fd4\u56de\u624b\u52d5\u64cd\u7e31\u3002',
      true,
    );
    return;
  }

  try {
    btnStartCam.disabled = true;
    setStatus('\u5019\u6a5f\u6b0a\u9650\u2026\u8acb\u5141\u8a31\u76f8\u6a5f');
    const stream = await openUserCamera();
    mediaStream = stream;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    await video.play();
    await waitForVideoSize(video);

    if (!rafId) rafId = requestAnimationFrame(poseLoop);
    btnStopCam.disabled = false;
    setStatus('\u93e1\u982d\u5df2\u958b \u00b7 \u8f09\u5165 Pose \u6a21\u578b\u4e2d\u2026');

    try {
      await ensureLandmarker();
    } catch (modelErr) {
      console.error(modelErr);
      stopCamera();
      returnToManual(
        'Pose \u6a21\u578b\u5931\u6557\uff1a' +
          (modelErr?.message || String(modelErr)) +
          '\uff08\u5df2\u8fd4\u624b\u52d5\uff0c\u5df2\u5b58\u59ff\u52e2\u4fdd\u7559\uff09',
        true,
      );
      return;
    }

    smoothLm = null;
    prevJoints = null;
    prevAngles = new Map();
    prevScale = 1;
    lastDetectTs = 0;
    lastFrameTs = 0;
    setStatus('\u5df2\u8ddf\u5230\u4f60\uff1f\u8acb\u7ad9\u5165\u756b\u9762');
  } catch (err) {
    console.error(err);
    const name = err?.name || '';
    let tip = err?.message || String(err);
    if (name === 'NotAllowedError') tip = '\u672a\u5141\u8a31\u76f8\u6a5f\u6b0a\u9650';
    else if (name === 'NotFoundError') tip = '\u627e\u4e0d\u5230\u93e1\u982d';
    stopCamera();
    returnToManual(
      '\u7121\u6cd5\u958b\u555f\u93e1\u982d\uff1a' +
        tip +
        '\uff08\u5df2\u8fd4\u624b\u52d5\uff0c\u5df2\u5b58\u59ff\u52e2\u4fdd\u7559\uff09',
      true,
    );
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

function canvasPointFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
  const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
  if (clientX == null) return null;
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function onPointerDown(ev) {
  if (mode !== 'manual' || !state || !manualPose || !ev.isPrimary || activeHandle) return;
  stopPlayback();
  // In rod mode, joint dots are hidden — ignore canvas joint hits
  if (rodControls && rodControls.getMode() === 'rods') return;
  const pt = canvasPointFromEvent(ev);
  if (!pt) return;
  const hit = hitTestHandle(handles, pt.x, pt.y);
  if (!hit) return;
  ev.preventDefault();
  activeHandle = hit;
  dragMeta = {
    startRootX: manualPose.rootX,
    startRootY: manualPose.rootY,
    startPtrX: pt.x,
    startPtrY: pt.y,
  };
  canvas.classList.add('dragging');
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch (_) {}
  if (!hasDragged) {
    hasDragged = true;
    dragHintEl?.classList.add('hidden');
    stopManualAnim();
  }
  renderManual();
}

function onPointerMove(ev) {
  if (!activeHandle || mode !== 'manual' || !manualPose || !state) return;
  const pt = canvasPointFromEvent(ev);
  if (!pt) return;
  ev.preventDefault();
  dirtyPose = true;
  updateMissionUI();
  applyDrag(state.rig, manualPose, activeHandle, pt.x, pt.y, dragMeta);
  const joints = resolveManualJoints(state.rig, manualPose);
  handles = getHandles(state.rig, manualPose, joints);
  const refreshed = handles.find((h) => h.id === activeHandle.id);
  if (refreshed) activeHandle = refreshed;
  renderManual();
}

function onPointerUp(ev) {
  if (!activeHandle) return;
  activeHandle = null;
  dragMeta = null;
  canvas.classList.remove('dragging');
  try {
    canvas.releasePointerCapture(ev.pointerId);
  } catch (_) {}
  renderManual();
}

function markInteracted() {
  stopPlayback();
  dirtyPose = true;
  updateMissionUI();
  if (!hasDragged) {
    hasDragged = true;
    dragHintEl?.classList.add('hidden');
    stopManualAnim();
  }
}

function resetStanding() {
  rodControls?.cancelDrags();
  if (!state) return;
  dirtyPose = true;
  updateMissionUI();
  manualPose = createManualPose(state.rig, layoutCenter());
  activeHandle = null;
  hasDragged = false;
  dragHintEl?.classList.remove('hidden');
  if (mode === 'manual') {
    renderManual();
    ensureManualAnim();
    setStatus('\u5df2\u91cd\u8a2d\u70ba\u7ad9\u7acb\u59ff\u52e2');
  } else {
    smoothLm = null;
    prevJoints = null;
    prevAngles = new Map();
    prevScale = 1;
    setStatus('\u5df2\u6e05\u9664\u8ddf\u59ff\u5e73\u6ed1\u72c0\u614b');
  }
}

function applyMissionPreset(i) {
  rodControls?.cancelDrags();
  if (!state || !manualPose) return;
  if (mode !== 'manual') setMode('manual');
  const ok = applyPreset(manualPose, state.rig, layoutCenter(), i);
  if (!ok) {
    setStatus('\u627e\u4e0d\u5230\u9810\u8a2d\u59ff\u52e2', true);
    return;
  }
  markInteracted();
  missionIndex = i;
  updateMissionUI();
  renderManual();
  const preset = getPreset(i);
  setStatus(
    '\u5df2\u5957\u7528\u300c' +
      (preset?.title || MISSIONS[i].title) +
      '\u300d\u59ff\u52e2\uff08\u53ef\u7e7c\u7e8c\u62d6\u52d5\u8abf\u6574\uff09',
  );
}

async function saveCurrentPose() {
  rodControls?.cancelDrags();
  if (!manualPose || btnSave.disabled) return false;
  if (mode === 'body') {
    setStatus(
      '\u8acb\u5148\u8fd4\u56de\u624b\u52d5\u64cd\u7e31\u518d\u4fdd\u5b58\uff08\u4fdd\u7559\u5df2\u5b58\u69fd\uff09',
      true,
    );
    return false;
  }
  btnSave.disabled = true;
  btnNext.disabled = true;
  savedPoses[missionIndex] = clonePose(manualPose);
  dirtyPose = false;
  updateMissionUI();
  const saved = await persistStory();
  btnSave.disabled = false;
  btnNext.disabled = false;
  if (!saved) return false;
  setStatus(
    '\u5df2\u4fdd\u5b58\u300c' + MISSIONS[missionIndex].title + '\u300d\u59ff\u52e2',
  );
  return true;
}

async function goNextMission() {
  if (!(await saveCurrentPose())) return;
  if (missionIndex < 2) selectMission(missionIndex + 1);
  else setStatus('三格已完成，可以展示或下載三格圖。');
}
function selectMission(i) {
  rodControls?.cancelDrags();
  if (dirtyPose) {
    savedPoses[missionIndex] = clonePose(manualPose);
    persistStory();
  }
  dirtyPose = false;
  missionIndex = i;
  if (savedPoses[i]) applyPose(manualPose, savedPoses[i]);
  else manualPose = createManualPose(state.rig, layoutCenter());
  updateMissionUI();
  if (mode === 'manual') renderManual();
  setStatus(MISSIONS[i].story);
}
function persistStory() {
  const patch = {
    title: document.getElementById('workTitle').value.trim() || '我的西遊記',
    poses: savedPoses.map((p) =>
      p ? encodePose(p, canvas.width, canvas.height) : null,
    ),
  };
  pendingProjectSaves++;
  projectQueue = projectQueue.then(async () => {
    try {
      await updateProject(patch);
      projectSaveFailed = false;
      document.getElementById('btnRetry').hidden = true;
      return true;
    } catch (e) {
      projectSaveFailed = true;
      document.getElementById('btnRetry').hidden = false;
      setStatus('儲存失敗，姿勢保留在畫面。請重試儲存。', true);
      return false;
    } finally {
      pendingProjectSaves--;
    }
  });
  return projectQueue;
}
async function exportStory() {
  try {
    if (dirtyPose) await saveCurrentPose();
    if (savedPoses.some((p) => !p)) return;
    if (!(await persistStory())) return;
    const out = document.createElement('canvas');
    out.width = 2700;
    out.height = 860;
    const c = out.getContext('2d');
    c.fillStyle = '#FBF8F2';
    c.fillRect(0, 0, out.width, out.height);
    c.fillStyle = '#33302A';
    c.textAlign = 'center';
    c.font = 'bold 40px sans-serif';
    c.fillText(
      document.getElementById('workTitle').value.trim() || '我的西遊記',
      1350,
      55,
      2550,
    );
    savedPoses.forEach((pose, i) => {
      c.drawImage(renderArtwork(state.rig, state.images, pose), i * 900, 85);
      c.fillStyle = '#33302A';
      c.font = 'bold 28px sans-serif';
      c.fillText(i + 1 + '・' + MISSIONS[i].title, i * 900 + 450, 835);
    });
    await downloadCanvas(out, '西遊記-三格故事.png');
    setStatus('三格圖已準備下載');
  } catch (e) {
    setStatus(e.message, true);
  }
}

function stopPlayback() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = 0;
  }
  playbackStep = -1;
}

async function runPlayback() {
  rodControls?.cancelDrags();
  if(dirtyPose)await saveCurrentPose();
  if(projectSaveFailed)return;
  const ready = savedPoses.filter(Boolean);
  if (ready.length < 3) {
    setStatus('請先保存三格姿勢', true);
    return;
  }
  if (mode !== 'manual') setMode('manual');
  stopPlayback();
  const sequence = [];
  for (let i = 0; i < 3; i++) {
    if (savedPoses[i]) sequence.push(i);
  }
  playbackStep = 0;
  const show = () => {
    if (playbackStep < 0 || playbackStep >= sequence.length) {
      stopPlayback();
      renderManual();
      setStatus('\u9010\u683c\u5c55\u793a\u5b8c\u6210');
      return;
    }
    const i = sequence[playbackStep];
    missionIndex = i;
    applyPose(manualPose, savedPoses[i]);
    updateMissionUI();
    renderManual();
    setStatus(
      '\u9010\u683c ' +
        (playbackStep + 1) +
        '/' +
        sequence.length +
        ' \u300c' +
        MISSIONS[i].title +
        '\u300d\u2014' +
        MISSIONS[i].story,
    );
    playbackStep += 1;
    playbackTimer = setTimeout(show, 2000);
  };
  show();
}

function bindUi() {
  document.getElementById('btnDownload').onclick=exportStory;
  document.getElementById('btnRetry').onclick=async()=>{if(await persistStory())setStatus('已儲存三格故事');};
  document.getElementById('workTitle').addEventListener('change',()=>persistStory());
  window.addEventListener('beforeunload', ev=>{if(dirtyPose||projectSaveFailed||pendingProjectSaves){ev.preventDefault();ev.returnValue='';}});
  document.addEventListener('click',async ev=>{
    if(!ev.target.closest('a[href="./color.html"]'))return;
    ev.preventDefault();if(dirtyPose)await saveCurrentPose();else await persistStory();
    if(!projectSaveFailed)location.href='./color.html';
  });
  modeManual.addEventListener('change', () => {
    if (modeManual.checked) setMode('manual');
  });
  modeBody.addEventListener('change', () => {
    if (modeBody.checked) setMode('body');
  });
  modeRods?.addEventListener('change', () => {
    if (modeRods.checked) setControlMode('rods');
  });
  modeJoints?.addEventListener('change', () => {
    if (modeJoints.checked) setControlMode('joints');
  });
  debugToggle.addEventListener('change', () => {
    if (mode === 'manual') renderManual();
  });
  btnRedraw.addEventListener('click', () => {
    if (mode === 'manual') renderManual();
  });
  btnReset.addEventListener('click', () => {
    stopPlayback();
    resetStanding();
  });
  btnSave.addEventListener('click', () => {
    stopPlayback();
    saveCurrentPose();
  });
  btnNext.addEventListener('click', () => {
    stopPlayback();
    goNextMission();
  });
  btnPlayback.addEventListener('click', () => runPlayback());
  btnStartCam.addEventListener('click', () => startCamera());
  btnStopCam.addEventListener('click', () => {
    stopCamera();
    setStatus('\u5df2\u95dc\u9589\u93e1\u982d\u2014\u53ef\u8fd4\u624b\u52d5\u64cd\u7e31');
  });
  btnBackManual.addEventListener('click', () => {
    stopCamera();
    returnToManual('\u5df2\u8fd4\u56de\u624b\u52d5\u64cd\u7e31\uff08\u5df2\u5b58\u59ff\u52e2\u4fdd\u7559\uff09', false);
  });

  missionCardsEl.addEventListener('click', (ev) => {
    const applyBtn = ev.target.closest('.btn-apply-pose');
    if (applyBtn) {
      stopPlayback();
      applyMissionPreset(Number(applyBtn.dataset.apply));
      return;
    }
    const selectBtn = ev.target.closest('.mission-select');
    if (selectBtn) {
      stopPlayback();
      selectMission(Number(selectBtn.dataset.mission));
      return;
    }
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('resize', () => {
    if (rodControls && mode === 'manual') rodControls.syncGripPositions();
  });
}


function updateColorNotice(hasColored) {
  const notice = document.getElementById('demoNotice');
  const textEl = document.getElementById('demoNoticeText');
  const actions = document.getElementById('demoNoticeActions');
  if (!notice || !textEl || !actions) return;
  actions.innerHTML = '';
  if (hasColored) {
    notice.classList.add('has-colored');
    textEl.textContent = '\u5df2\u8f09\u5165\u4f60\u7684\u586b\u8272';
    const edit = document.createElement('a');
    edit.href = './color.html';
    edit.className = 'btn-inline secondary';
    edit.textContent = '\u518d\u6539\u586b\u8272';
    actions.appendChild(edit);
  } else {
    notice.classList.remove('has-colored');
    textEl.textContent =
      '\u9084\u6c92\u6709\u586b\u8272\u4f5c\u54c1 \u2014 \u5148\u70ba\u5b6b\u609f\u7a7a\u7684\u8eab\u6bb5\u586b\u8272\uff0c\u518d\u56de\u4f86\u64fa\u59ff\u52e2\u3002';
    const go = document.createElement('a');
    go.href = './color.html';
    go.className = 'btn-inline';
    go.textContent = '\u5148\u53bb\u586b\u8272';
    actions.appendChild(go);
  }
}

async function init() {
  try {
    setStatus('\u8f09\u5165 rig \u8207\u8eab\u6bb5\u5716\u7247\u2026');
    state = await loadRig();
    const project=await readProject();
    if(project){document.getElementById('workTitle').value=project.title;
      project.poses.forEach((p,i)=>{savedPoses[i]=p?decodePose(p,canvas.width,canvas.height):null;});}
    if (state.rig.profile) {
      document.querySelector('.preview-note').textContent = '完整側身悟空・你的色彩會跟住影偶一起動';
      modeBody.disabled = true;
      document.getElementById('labBody').textContent = '身體驅動（此造型暫未開放，先用棍控）';
    }
    fillPartList(state.rig);
    manualPose = savedPoses[0] ? clonePose(savedPoses[0]) : createManualPose(state.rig, layoutCenter());

    if (rodRail) {
      rodControls = createRodControls({
        railEl: rodRail,
        canvas,
        getPose: () => manualPose,
        getRig: () => state?.rig || null,
        onPoseChange: () => {
          markInteracted();
          if (mode === 'manual') renderManual();
        },
      });
    }

    bindUi();
    updateMissionUI();
    updateColorNotice(!!state.hasColored);
    setMode('manual');
    setControlMode('rods');
    setStatus(state.hasColored ? '你的悟空已上幕，可以開始編故事。' : '悟空已準備好，可先填色或直接操偶。');
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

init();
