/**
 * Host / projector: create room, show code, draw up to 2 puppets from RTDB.
 */
import { drawPuppet } from '../drawPuppet.js';
import { resolveManualJoints, createManualPose, applyPose } from '../dragPose.js';
import { loadProfileRig } from '../profileRig.js';
import { getCharacter } from '../characters.js';
import {
  createRoom,
  setRoomStatus,
  subscribePuppets,
  subscribeSeats,
  subscribeMeta,
  payloadToPoseFields,
  seatIdsForP2a,
} from './room.js';

const STAGE_W = 900;
const STAGE_H = 720;

const els = {
  status: document.getElementById('liveStatus'),
  roomCode: document.getElementById('roomCode'),
  btnCreate: document.getElementById('btnCreate'),
  btnPlay: document.getElementById('btnPlay'),
  btnLobby: document.getElementById('btnLobby'),
  seatList: document.getElementById('seatList'),
  canvas: document.getElementById('liveStage'),
  phase: document.getElementById('phaseLabel'),
  padHint: document.getElementById('padHint'),
};

const ctx = els.canvas.getContext('2d');
els.canvas.width = STAGE_W;
els.canvas.height = STAGE_H;

/** @type {Map<string, { rig: object, images: Map<string, HTMLImageElement|HTMLCanvasElement>, pose: object }>} */
const puppets = new Map();
let roomCode = '';
let unsubs = [];
let dirty = true;
let raf = 0;

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('is-error', !!isError);
}

function layoutFor(characterId) {
  const ch = getCharacter(characterId);
  const profile = true;
  const seatIds = seatIdsForP2a();
  const idx = Math.max(0, seatIds.indexOf(characterId));
  const cx = STAGE_W * (seatIds.length === 1 ? 0.5 : idx === 0 ? 0.32 : 0.68);
  return {
    cx,
    cy: STAGE_H * (profile ? 0.43 : 0.52),
    scale: ch?.kind === 'horse' ? 0.55 : 0.58,
  };
}

async function ensurePuppetAssets(characterId) {
  if (puppets.has(characterId)) return puppets.get(characterId);
  const loaded = await loadProfileRig(false, characterId);
  const layout = layoutFor(characterId);
  const pose = createManualPose(loaded.rig, layout);
  const entry = { rig: loaded.rig, images: loaded.images, pose };
  puppets.set(characterId, entry);
  return entry;
}

function applyRemotePose(characterId, payload) {
  const entry = puppets.get(characterId);
  if (!entry || !payload?.pose) return;
  const fields = payloadToPoseFields(payload.pose);
  if (!fields) return;
  const layout = layoutFor(characterId);
  // Keep default scale if remote sends 0
  if (!fields.scale) fields.scale = layout.scale;
  applyPose(entry.pose, fields);
  // Merge localRot from payload (applyPose replaces map)
  if (fields.localRot?.size) {
    for (const [k, v] of fields.localRot) entry.pose.localRot.set(k, v);
  }
  dirty = true;
}

function render() {
  raf = requestAnimationFrame(render);
  if (!dirty) return;
  dirty = false;
  ctx.fillStyle = '#FBF8F2';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  // soft stage ground
  ctx.fillStyle = '#e8e0d2';
  ctx.fillRect(0, STAGE_H * 0.78, STAGE_W, STAGE_H * 0.22);

  const order = seatIdsForP2a().filter((id) => puppets.has(id));
  for (const id of order) {
    const { rig, images, pose } = puppets.get(id);
    const joints = resolveManualJoints(rig, pose);
    drawPuppet(ctx, rig, images, {
      clear: false,
      joints,
      scale: pose.scale,
      cx: pose.rootX,
      cy: pose.rootY,
    });
  }

  if (!order.length) {
    ctx.fillStyle = '#877f71';
    ctx.font = '28px "PingFang TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('等學生入座操偶…', STAGE_W / 2, STAGE_H / 2);
  }
}

function renderSeats(seats) {
  const ids = seatIdsForP2a();
  els.seatList.replaceChildren();
  for (const id of ids) {
    const ch = getCharacter(id);
    const seat = seats?.[id];
    const li = document.createElement('li');
    li.className = seat?.uid ? 'seat taken' : 'seat free';
    li.textContent = seat?.uid
      ? `${ch?.labelZh || id} · 已入座`
      : `${ch?.labelZh || id} · 空位`;
    els.seatList.append(li);
  }
}

function cleanupSubs() {
  for (const u of unsubs) {
    try {
      u();
    } catch (_) {
      /* ignore */
    }
  }
  unsubs = [];
}

function attachRoom(code) {
  cleanupSubs();
  roomCode = code;
  els.roomCode.textContent = code;
  els.padHint.textContent = `學生開 pad.html，輸入 ${code}`;
  unsubs.push(
    subscribeMeta(code, (meta) => {
      const st = meta.status || 'lobby';
      els.phase.textContent = st === 'playing' ? '演出中' : st === 'paused' ? '暫停' : '等候室';
      els.btnPlay.disabled = st === 'playing';
      els.btnLobby.disabled = st === 'lobby';
      dirty = true;
    }),
  );
  unsubs.push(subscribeSeats(code, renderSeats));
  unsubs.push(
    subscribePuppets(code, async (data) => {
      const ids = Object.keys(data || {});
      await Promise.all(ids.map((id) => ensurePuppetAssets(id)));
      for (const id of ids) applyRemotePose(id, data[id]);
      // Drop puppets no longer present? keep assets cached.
      dirty = true;
    }),
  );
}

async function onCreate() {
  els.btnCreate.disabled = true;
  setStatus('開房中…');
  try {
    // Warm templates for default seats
    await Promise.all(seatIdsForP2a().map((id) => ensurePuppetAssets(id)));
    const { roomCode: code } = await createRoom({ status: 'lobby' });
    attachRoom(code);
    setStatus('房間已開・等學生入座');
    els.btnPlay.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e), true);
    els.btnCreate.disabled = false;
  }
}

async function onPlay() {
  if (!roomCode) return;
  try {
    await setRoomStatus(roomCode, 'playing');
    setStatus('開始演出');
  } catch (e) {
    setStatus(e?.message || String(e), true);
  }
}

async function onLobby() {
  if (!roomCode) return;
  try {
    await setRoomStatus(roomCode, 'lobby');
    setStatus('返回等候室');
  } catch (e) {
    setStatus(e?.message || String(e), true);
  }
}

els.btnCreate.addEventListener('click', onCreate);
els.btnPlay.addEventListener('click', onPlay);
els.btnLobby.addEventListener('click', onLobby);
els.btnPlay.disabled = true;
els.btnLobby.disabled = true;

renderSeats({});
raf = requestAnimationFrame(render);
setStatus('撳「開房」產生房間碼（投影用）');
