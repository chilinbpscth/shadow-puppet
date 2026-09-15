/**
 * Student remote pad: join room, claim seat, rod control → RTDB pose @ ~15Hz.
 */
import { drawPuppet } from '../drawPuppet.js';
import {
  createManualPose,
  resolveManualJoints,
  constrainPose,
} from '../dragPose.js';
import { loadProfileRig } from '../profileRig.js';
import { createRodControls } from '../rodControls.js';
import { getCharacter } from '../characters.js';
import {
  joinRoom,
  claimSeat,
  createPosePublisher,
  subscribeSeats,
  subscribeMeta,
  seatIdsForP2a,
} from './room.js';

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
  if (!dirty || !rigPack || !manualPose) return;
  dirty = false;
  const joints = resolveManualJoints(rigPack.rig, manualPose);
  drawPuppet(ctx, rigPack.rig, rigPack.images, {
    clear: true,
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
  setStatus('認領座位…');
  try {
    await claimSeat(roomCode, id);
    characterId = id;
    const ch = getCharacter(id);
    els.charLabel.textContent = ch?.labelZh || id;

    rigPack = await loadProfileRig(true, id);
    manualPose = createManualPose(rigPack.rig, layoutCenter());
    // Offset slightly by seat index so two pads don't stack at center on host defaults
    const ids = seatIdsForP2a();
    const idx = ids.indexOf(id);
    if (idx === 0) manualPose.rootX = STAGE_W * 0.32;
    else if (idx === 1) manualPose.rootX = STAGE_W * 0.68;

    publisher?.dispose();
    publisher = createPosePublisher(roomCode, characterId);

    if (rodControls) {
      // recreate: rodControls has no destroy; rebuild rail
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
    setStatus(`你控 ${ch?.labelZh || id}・拖棍推提`);
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

show(els.joinPanel);
raf = requestAnimationFrame(renderLoop);
setStatus('輸入老師螢幕上嘅房間碼');
