import { loadRig } from './loadRig.js';
import { drawPuppet, drawHandles } from './drawPuppet.js';
import { bindPoseFromLandmarks } from './bindPose.js';
import {
  createManualPose,
  clonePose,
  applyPose,
  resolveManualJoints,
  getHandles,
  hitTestHandle,
  applyDrag,
} from './dragPose.js';

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
let playbackStep = -1;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#ff8a7a' : '#9dce8a';
}

function layoutCenter() {
  return { cx: canvas.width / 2, cy: canvas.height * 0.36, scale: 1 };
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
  const m = MISSIONS[missionIndex];
  taskMain.textContent = m.task;
  const tipEl = document.getElementById('artTip');
  if (tipEl) tipEl.textContent = m.tip;
  for (const btn of missionCardsEl.querySelectorAll('.mission-card')) {
    const i = Number(btn.dataset.mission);
    btn.classList.toggle('active', i === missionIndex);
    const saveEl = btn.querySelector('.mission-save');
    if (saveEl) {
      const ok = !!savedPoses[i];
      saveEl.dataset.saved = ok ? '1' : '0';
      saveEl.textContent = ok ? '\u5df2\u4fdd\u5b58' : '\u672a\u4fdd\u5b58';
    }
  }
}

function jointsForDraw() {
  if (!state || !manualPose) return null;
  return resolveManualJoints(state.rig, manualPose);
}

function renderManual() {
  if (!state || !manualPose) return;
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

function setMode(next) {
  mode = next;
  const isBody = mode === 'body';
  modeManual.checked = !isBody;
  modeBody.checked = isBody;
  bodyControls.hidden = !isBody;
  if (!isBody) {
    stopCamera();
    stopManualAnim();
    renderManual();
    ensureManualAnim();
    setStatus('\u624b\u52d5\u64cd\u7e31\uff1a\u62d6\u5713\u9ede\u64fa\u59ff\u52e2');
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
  if (mode !== 'manual' || !state || !manualPose) return;
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
  applyDrag(state.rig, manualPose, activeHandle, pt.x, pt.y, dragMeta);
  // refresh handle positions for continuous hit of same handle kind
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

function resetStanding() {
  if (!state) return;
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

function saveCurrentPose() {
  if (!manualPose) return;
  if (mode === 'body' && prevJoints?.size) {
    setStatus(
      '\u8acb\u5148\u8fd4\u56de\u624b\u52d5\u64cd\u7e31\u518d\u4fdd\u5b58\uff08\u4fdd\u7559\u5df2\u5b58\u69fd\uff09',
      true,
    );
    return;
  }
  savedPoses[missionIndex] = clonePose(manualPose);
  updateMissionUI();
  setStatus(
    '\u5df2\u4fdd\u5b58\u300c' + MISSIONS[missionIndex].title + '\u300d\u59ff\u52e2',
  );
}

function goNextMission() {
  if (missionIndex < MISSIONS.length - 1) {
    missionIndex += 1;
    updateMissionUI();
    setStatus('\u4efb\u52d9\uff1a' + MISSIONS[missionIndex].title + ' \u2014 ' + MISSIONS[missionIndex].story);
  } else {
    setStatus(
      '\u4e09\u500b\u59ff\u52e2\u5df2\u5c31\u7dd2\uff1f\u53ef\u6309\u300c\u9010\u683c\u5c55\u793a\u300d\u6f14\u4e00\u6bb5\u6232',
    );
  }
}

function selectMission(i) {
  missionIndex = i;
  updateMissionUI();
  if (savedPoses[i] && manualPose) {
    applyPose(manualPose, savedPoses[i]);
    if (mode === 'manual') renderManual();
  }
  setStatus(MISSIONS[i].story);
}

function stopPlayback() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = 0;
  }
  playbackStep = -1;
}

function runPlayback() {
  const ready = savedPoses.filter(Boolean);
  if (ready.length < 1) {
    setStatus('\u8acb\u5148\u4fdd\u5b58\u81f3\u5c11\u4e00\u500b\u59ff\u52e2', true);
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
    playbackTimer = setTimeout(show, 1400);
  };
  show();
}

function bindUi() {
  modeManual.addEventListener('change', () => {
    if (modeManual.checked) setMode('manual');
  });
  modeBody.addEventListener('change', () => {
    if (modeBody.checked) setMode('body');
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
    const btn = ev.target.closest('.mission-card');
    if (!btn) return;
    stopPlayback();
    selectMission(Number(btn.dataset.mission));
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
}

async function init() {
  try {
    setStatus('\u8f09\u5165 rig \u8207\u8eab\u6bb5\u5716\u7247\u2026');
    state = await loadRig();
    fillPartList(state.rig);
    manualPose = createManualPose(state.rig, layoutCenter());
    bindUi();
    updateMissionUI();
    setMode('manual');
    setStatus(
      '\u5df2\u8f09\u5165 ' +
        state.rig.parts.length +
        ' \u4ef6\u8eab\u6bb5 \u00b7 ' +
        state.rig.labelZh +
        ' \u2014 \u62d6\u5713\u9ede\u958b\u59cb',
    );
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

init();
