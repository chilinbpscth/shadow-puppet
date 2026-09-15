/**
 * Host / projector: create room, show code, draw up to 4 puppets from RTDB.
 */
import { drawPuppet } from '../drawPuppet.js';
import { resolveManualJoints, createManualPose, applyPose } from '../dragPose.js';
import {
  loadProfileRig,
  buildProfileRig,
  buildWholeFigureRig,
  loadTemplate,
} from '../profileRig.js';
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
import { drawShadowStage } from '../stageBackdrop.js';

const STAGE_W = 900;
const STAGE_H = 720;

const els = {
  status: document.getElementById('liveStatus'),
  roomCode: document.getElementById('roomCode'),
  btnCopyCode: document.getElementById('btnCopyCode'),
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

/** @type {Map<string, { rig: object, images: Map<string, HTMLImageElement|HTMLCanvasElement>, pose: object, artUpdatedAt?: number }>} */
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
  const n = Math.max(1, seatIds.length);
  const idx = Math.max(0, seatIds.indexOf(characterId));
  const cx =
    n === 1
      ? STAGE_W * 0.5
      : STAGE_W * (0.14 + (idx + 0.5) * (0.72 / n));
  const baseScale = n >= 3 ? 0.5 : 0.58;
  return {
    cx,
    cy: STAGE_H * (profile ? 0.43 : 0.52),
    scale: ch?.kind === 'horse' ? Math.min(0.55, baseScale) : baseScale,
  };
}

async function ensurePuppetAssets(characterId) {
  if (puppets.has(characterId)) return puppets.get(characterId);
  const loaded = await loadProfileRig(false, characterId);
  const layout = layoutFor(characterId);
  const pose = createManualPose(loaded.rig, layout);
  const entry = { rig: loaded.rig, images: loaded.images, pose, artUpdatedAt: 0 };
  puppets.set(characterId, entry);
  return entry;
}

/**
 * Decode RTDB art.dataUrl and rebuild / swap puppet images.
 * whole-mode: replace torso; articulated (wukong): rebuild via buildProfileRig.
 */
async function applyRemoteArt(characterId, art) {
  if (!art?.dataUrl || typeof art.dataUrl !== 'string') return;
  const updatedAt = art.updatedAt || 0;
  const entry = await ensurePuppetAssets(characterId);
  if (entry.artUpdatedAt && entry.artUpdatedAt === updatedAt) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = art.dataUrl;
  await img.decode();

  const ch = getCharacter(characterId) || { id: characterId, rigMode: 'whole' };
  const tw = ch.width || 640;
  const th = ch.height || 960;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const c = canvas.getContext('2d');
  // Prefer drawing onto cleared transparent — stage is theatrical screen, not cream flat
  c.clearRect(0, 0, tw, th);
  c.drawImage(img, 0, 0, tw, th);

  // JPEG art has cream underpaint (no checkerboard). Mask to template silhouette alpha.
  let built;
  try {
    const template = await loadTemplate(ch.id);
    const tctx = template.getContext('2d');
    const base = tctx.getImageData(0, 0, tw, th);
    tctx.drawImage(canvas, 0, 0);
    const painted = tctx.getImageData(0, 0, tw, th);
    for (let i = 0; i < base.data.length; i += 4) {
      if (base.data[i + 3] < 8) painted.data[i + 3] = 0;
    }
    tctx.putImageData(painted, 0, 0);
    const isArticulated = ch.rigMode === 'articulated' || ch.id === 'wukong-v2';
    built = isArticulated ? buildProfileRig(template, ch) : buildWholeFigureRig(template, ch);
  } catch (e) {
    console.warn('art merge failed, raw bitmap', e);
    built = buildWholeFigureRig(canvas, ch);
  }

  const prev = entry.pose;
  entry.rig = built.rig;
  entry.images = built.images;
  // Keep live pose root/scale/facing/localRot when possible
  if (prev) {
    entry.pose.rootX = prev.rootX;
    entry.pose.rootY = prev.rootY;
    entry.pose.scale = prev.scale;
    entry.pose.facing = prev.facing;
    if (prev.localRot instanceof Map) {
      entry.pose.localRot = new Map(prev.localRot);
    }
  }
  entry.artUpdatedAt = updatedAt;
  dirty = true;
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
  drawShadowStage(ctx, STAGE_W, STAGE_H);

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
    ctx.fillStyle = 'rgba(90, 60, 30, 0.55)';
    ctx.font = '28px "PingFang TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('等學生入座操偶…', STAGE_W / 2, STAGE_H * 0.48);
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
  if (els.btnCopyCode) {
    els.btnCopyCode.disabled = false;
    els.btnCopyCode.textContent = '複製房間碼';
  }
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
      for (const id of ids) {
        const payload = data[id];
        if (payload?.art) {
          try {
            await applyRemoteArt(id, payload.art);
          } catch (e) {
            console.warn('art apply failed', id, e);
          }
        }
        applyRemotePose(id, payload);
      }
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


async function onCopyCode() {
  if (!roomCode) return;
  const label = els.btnCopyCode;
  try {
    await navigator.clipboard.writeText(roomCode);
    if (label) {
      label.textContent = '已複製';
      setTimeout(() => {
        if (label) label.textContent = '複製房間碼';
      }, 1600);
    }
    setStatus(`已複製房間碼 ${roomCode}`);
  } catch (e) {
    // Fallback: select the large code for manual copy
    try {
      const range = document.createRange();
      range.selectNodeContents(els.roomCode);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {
      /* ignore */
    }
    setStatus('請長按／全選上方房間碼再複製', true);
  }
}

els.btnCreate.addEventListener('click', onCreate);
els.btnPlay.addEventListener('click', onPlay);
els.btnLobby.addEventListener('click', onLobby);
els.btnCopyCode?.addEventListener('click', onCopyCode);
els.roomCode?.addEventListener('click', () => {
  try {
    const range = document.createRange();
    range.selectNodeContents(els.roomCode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {
    /* ignore */
  }
});
els.btnPlay.disabled = true;
els.btnLobby.disabled = true;

renderSeats({});
raf = requestAnimationFrame(render);
setStatus('撳「開房」產生房間碼（投影用）');
