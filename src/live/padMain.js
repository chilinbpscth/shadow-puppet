/**
 * Student remote pad: join room, claim seat, load IndexedDB art, publish to stage, rod control.
 */
import { drawPuppet } from '../drawPuppet.js';
import {
  createManualPose,
  resolveManualJoints,
  constrainPose,
} from '../dragPose.js';
import { loadProfileRig, loadTemplate } from '../profileRig.js';
import { createRodControls } from '../rodControls.js';
import { getCharacter } from '../characters.js';
import { loadColoredPart, blobToImage } from '../colorStorage.js';
import { updateProject } from '../projectStorage.js';
import {
  joinRoom,
  claimSeat,
  createPosePublisher,
  subscribeSeats,
  subscribeMeta,
  seatIdsForP2a,
  publishArt,
  compressArtToDataUrl,
  ensureSeatOwnership,
} from './room.js';
import { drawShadowStage } from '../stageBackdrop.js';

const STAGE_W = 900;
const STAGE_H = 720;

const els = {
  status: document.getElementById('padStatus'),
  joinPanel: document.getElementById('joinPanel'),
  seatPanel: document.getElementById('seatPanel'),
  playPanel: document.getElementById('playPanel'),
  roomInput: document.getElementById('roomInput'),
  btnJoin: document.getElementById('btnJoin'),
  seatButtons: document.getElementById('seatButtons'),
  charLabel: document.getElementById('charLabel'),
  phase: document.getElementById('padPhase'),
  canvas: document.getElementById('padStage'),
  rodRail: document.getElementById('rodRail'),
  btnColor: document.getElementById('btnColor'),
  btnPrint: document.getElementById('btnPrint'),
  btnReloadArt: document.getElementById('btnReloadArt'),
  btnPublishArt: document.getElementById('btnPublishArt'),
  artHint: document.getElementById('artHint'),
};

const ctx = els.canvas.getContext('2d');
els.canvas.width = STAGE_W;
els.canvas.height = STAGE_H;

let roomCode = '';
let uid = '';
let characterId = '';
let rigPack = null;
let manualPose = null;
let rodControls = null;
let publisher = null;
let unsubs = [];
let dirty = true;
let raf = 0;
let hasLocalArt = false;

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('is-error', !!isError);
}

function show(panel) {
  for (const p of [els.joinPanel, els.seatPanel, els.playPanel]) {
    p.hidden = p !== panel;
  }
}

function layoutCenter() {
  return { cx: STAGE_W / 2, cy: STAGE_H * 0.43, scale: 0.62 };
}

function cleanup() {
  for (const u of unsubs) {
    try {
      u();
    } catch (_) {
      /* ignore */
    }
  }
  unsubs = [];
  publisher?.dispose();
  publisher = null;
}

function renderLoop() {
  raf = requestAnimationFrame(renderLoop);
  if (!dirty) return;
  dirty = false;
  drawShadowStage(ctx, STAGE_W, STAGE_H);
  if (!rigPack || !manualPose) return;
  const joints = resolveManualJoints(rigPack.rig, manualPose);
  drawPuppet(ctx, rigPack.rig, rigPack.images, {
    clear: false,
    joints,
    scale: manualPose.scale,
    cx: manualPose.rootX,
    cy: manualPose.rootY,
  });
  rodControls?.syncGripPositions();
}

function publish() {
  if (!publisher || !manualPose) return;
  constrainPose(rigPack.rig, manualPose, STAGE_W, STAGE_H);
  publisher.schedule(manualPose);
  dirty = true;
}

function renderSeatButtons(seats) {
  const ids = seatIdsForP2a();
  els.seatButtons.replaceChildren();
  for (const id of ids) {
    const ch = getCharacter(id);
    const seat = seats?.[id];
    const takenByOther = seat?.uid && seat.uid !== uid;
    const mine = seat?.uid === uid;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seat-pick' + (mine ? ' mine' : '');
    btn.disabled = !!takenByOther;
    btn.textContent = takenByOther
      ? `${ch?.labelZh || id}（已佔）`
      : mine
        ? `${ch?.labelZh || id}（你）`
        : `認領 ${ch?.labelZh || id}`;
    btn.addEventListener('click', () => onClaim(id));
    els.seatButtons.append(btn);
  }
}

function syncArtChrome() {
  if (els.artHint) {
    els.artHint.textContent = hasLocalArt
      ? '已載入本機作品・可推上舞台'
      : '未見本機填色／影相・請先填色或影相，再重新載入';
  }
  if (els.btnPublishArt) els.btnPublishArt.disabled = !characterId;
  if (els.btnColor) {
    els.btnColor.href = './color.html';
  }
  if (els.btnPrint && characterId) {
    els.btnPrint.href = `./print.html?char=${encodeURIComponent(characterId)}`;
  }
}

async function applyRigPack(pack, id) {
  rigPack = pack;
  hasLocalArt = !!pack.hasColored;
  const layout = layoutCenter();
  const prevFacing = manualPose?.facing;
  const prevRootX = manualPose?.rootX;
  const prevRootY = manualPose?.rootY;
  const prevScale = manualPose?.scale;
  const prevLocal = manualPose?.localRot;
  manualPose = createManualPose(rigPack.rig, layout);
  const ids = seatIdsForP2a();
  const idx = ids.indexOf(id);
  if (typeof prevRootX === 'number') {
    manualPose.rootX = prevRootX;
    manualPose.rootY = prevRootY ?? manualPose.rootY;
    manualPose.scale = prevScale ?? manualPose.scale;
    if (prevFacing === -1 || prevFacing === 1) manualPose.facing = prevFacing;
    if (prevLocal instanceof Map) manualPose.localRot = new Map(prevLocal);
  } else {
    const n = Math.max(1, ids.length);
    const i = idx >= 0 ? idx : 0;
    manualPose.rootX =
      n === 1
        ? STAGE_W * 0.5
        : STAGE_W * (0.14 + (i + 0.5) * (0.72 / n));
    if (n >= 3) manualPose.scale = 0.5;
  }
  syncArtChrome();
  dirty = true;
}

async function reloadLocalArt() {
  if (!characterId) return;
  setStatus('重新載入本機作品…');
  try {
    const pack = await loadProfileRig(true, characterId);
    await applyRigPack(pack, characterId);
    publish();
    setStatus(
      hasLocalArt
        ? '已載入填色／影相作品'
        : '未搵到本機作品・請先去填色／影相',
    );
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
  }
}

async function onPublishArt() {
  if (!roomCode || !characterId) return;
  els.btnPublishArt.disabled = true;
  setStatus('確認座位權限…');
  try {
    const { reclaimed } = await ensureSeatOwnership(roomCode, characterId);
    if (reclaimed) {
      setStatus('座位已重新認領・壓縮並推上舞台…');
    } else {
      setStatus('壓縮並推上舞台…');
    }
    let source = null;
    const blob = await loadColoredPart(characterId, 'whole');
    if (blob) {
      source = await blobToImage(blob);
    } else {
      // Fallback: template (still better than empty) — cream under JPEG avoids checker look
      source = await loadTemplate(characterId);
    }
    const { dataUrl } = await compressArtToDataUrl(source);
    await publishArt(roomCode, characterId, dataUrl);
    setStatus('已推上舞台・主持可見你嘅作品');
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
  } finally {
    els.btnPublishArt.disabled = false;
  }
}

async function onOpenColor(ev) {
  if (!characterId) return;
  ev.preventDefault();
  try {
    const ch = getCharacter(characterId);
    if (ch) {
      await updateProject({
        characterId: ch.id,
        assetVersion: ch.assetVersion,
      });
    }
    location.href = './color.html';
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
  }
}

async function onJoin() {
  const code = els.roomInput.value.trim().toUpperCase();
  els.btnJoin.disabled = true;
  setStatus('入場中…');
  try {
    cleanup();
    const joined = await joinRoom(code);
    roomCode = joined.roomCode;
    uid = joined.uid;
    show(els.seatPanel);
    renderSeatButtons(joined.seats);
    unsubs.push(subscribeSeats(roomCode, renderSeatButtons));
    unsubs.push(
      subscribeMeta(roomCode, (meta) => {
        const st = meta.status || 'lobby';
        els.phase.textContent =
          st === 'playing' ? '演出中・可以操棍' : st === 'paused' ? '暫停' : '等候室・可以預演';
      }),
    );
    setStatus(`已入房 ${roomCode}・揀角色`);
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
  } finally {
    els.btnJoin.disabled = false;
  }
}

async function onClaim(id) {
  setStatus(characterId && characterId !== id ? '換位・重新認領座位…' : '認領座位…');
  try {
    await claimSeat(roomCode, id);
    characterId = id;
    const ch = getCharacter(id);
    els.charLabel.textContent = ch?.labelZh || id;

    // Prefer student's IndexedDB whole color
    const pack = await loadProfileRig(true, id);
    await applyRigPack(pack, id);

    publisher?.dispose();
    publisher = createPosePublisher(roomCode, characterId);

    if (rodControls) {
      els.rodRail.replaceChildren();
      document.querySelectorAll('.rod-lines').forEach((n) => n.remove());
    }
    rodControls = createRodControls({
      railEl: els.rodRail,
      canvas: els.canvas,
      getPose: () => manualPose,
      getRig: () => rigPack?.rig || null,
      onPoseChange: () => {
        publish();
      },
    });

    show(els.playPanel);
    dirty = true;
    publish();
    setStatus(
      hasLocalArt
        ? `你控 ${ch?.labelZh || id}・可推上舞台再操棍`
        : `你控 ${ch?.labelZh || id}・建議先填色／影相再推上舞台`,
    );
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
  }
}

// URL ?room=CODE
const params = new URLSearchParams(location.search);
if (params.get('room')) {
  els.roomInput.value = params.get('room').toUpperCase();
}

els.btnJoin.addEventListener('click', onJoin);
els.roomInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') onJoin();
});
els.btnColor?.addEventListener('click', onOpenColor);
els.btnReloadArt?.addEventListener('click', () => reloadLocalArt());
els.btnPublishArt?.addEventListener('click', () => onPublishArt());

show(els.joinPanel);
raf = requestAnimationFrame(renderLoop);
setStatus('輸入老師螢幕上嘅房間碼');
