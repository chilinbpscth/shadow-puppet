/**
 * P2a room helpers: 1 host + max 4 pad seats (wukong-v2, tangseng-v1, bajie-v1, sha-v1).
 * RTDB: shadowLive/rooms/{ROOM}/meta|seats|puppets
 */
import { ref, set, get, update, onValue, runTransaction } from 'firebase/database';
import { getLiveDatabase, ensureAnonAuth } from './firebaseApp.js';
import { getCharacter, listCharacters } from '../characters.js';

export const P2A_SEAT_IDS = ['wukong-v2', 'tangseng-v1', 'bajie-v1', 'sha-v1'];
export const MAX_SEATS_P2A = 4;
export const POSE_HZ = 15;
/** JPEG art for RTDB: keep under ~100KB typical (RTDB soft limit ~10MB/write). */
export const ART_MAX_WIDTH = 480;
export const ART_JPEG_QUALITY = 0.6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function roomPath(code) {
  return `shadowLive/rooms/${String(code).toUpperCase()}`;
}

export function generateRoomCode(len = 6) {
  let out = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += CODE_CHARS[arr[i] % CODE_CHARS.length];
  return out;
}

export function seatOptionsP2a() {
  return P2A_SEAT_IDS.map((id) => getCharacter(id)).filter(Boolean);
}

/** Prefer wukong + tangseng; else first N from registry. */
export function seatIdsForP2a() {
  const preferred = P2A_SEAT_IDS.filter((id) => getCharacter(id));
  if (preferred.length >= MAX_SEATS_P2A) return preferred.slice(0, MAX_SEATS_P2A);
  const rest = listCharacters()
    .map((c) => c.id)
    .filter((id) => !preferred.includes(id));
  return [...preferred, ...rest].slice(0, MAX_SEATS_P2A);
}

export async function createRoom({ status = 'lobby' } = {}) {
  const user = await ensureAnonAuth();
  const db = getLiveDatabase();
  const seatIds = seatIdsForP2a();
  let code = generateRoomCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const snap = await get(ref(db, roomPath(code)));
    if (!snap.exists()) break;
    code = generateRoomCode();
  }
  const now = Date.now();
  // Rules: write meta only at create; seats appear when claimed (no null stubs).
  await set(ref(db, `${roomPath(code)}/meta`), {
    createdAt: now,
    hostId: user.uid,
    status,
    expiresAt: now + 4 * 60 * 60 * 1000,
    maxSeats: MAX_SEATS_P2A,
    seatIds,
  });
  return { roomCode: code, uid: user.uid, seatIds };
}

export async function joinRoom(roomCode) {
  const user = await ensureAnonAuth();
  const code = String(roomCode || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    const err = new Error('房間碼唔啱格式（4–8 位英數）');
    err.code = 'LIVE_BAD_CODE';
    throw err;
  }
  const db = getLiveDatabase();
  const snap = await get(ref(db, roomPath(code)));
  if (!snap.exists()) {
    const err = new Error('搵唔到呢個房間');
    err.code = 'LIVE_NO_ROOM';
    throw err;
  }
  const data = snap.val() || {};
  const meta = data.meta || {};
  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    const err = new Error('房間已過期');
    err.code = 'LIVE_EXPIRED';
    throw err;
  }
  const seatIds =
    Array.isArray(meta.seatIds) && meta.seatIds.length
      ? meta.seatIds.slice(0, MAX_SEATS_P2A)
      : seatIdsForP2a();
  return {
    roomCode: code,
    uid: user.uid,
    meta,
    seats: data.seats || {},
    puppets: data.puppets || {},
    seatIds,
  };
}

/**
 * Claim a seat via per-seat transaction (rules disallow parent seats txn / null stubs).
 * P2a: only seatIdsForP2a() (max 4). Same uid may re-claim; one seat per uid.
 */
export async function claimSeat(roomCode, characterId) {
  const user = await ensureAnonAuth();
  const code = String(roomCode).toUpperCase();
  const db = getLiveDatabase();
  const allowed = seatIdsForP2a();
  if (!allowed.includes(characterId)) {
    const err = new Error('呢個角色未開放認領');
    err.code = 'LIVE_SEAT_LOCKED';
    throw err;
  }

  // Soft full-room check (allowed ids → natural max)
  const seatsSnap = await get(ref(db, `${roomPath(code)}/seats`));
  const seatsNow = seatsSnap.val() || {};
  const others = allowed.filter((id) => seatsNow[id]?.uid && seatsNow[id].uid !== user.uid);
  if (!seatsNow[characterId]?.uid && others.length >= MAX_SEATS_P2A) {
    const err = new Error('房間已滿（最多四人）');
    err.code = 'LIVE_ROOM_FULL';
    throw err;
  }
  if (seatsNow[characterId]?.uid && seatsNow[characterId].uid !== user.uid) {
    const err = new Error('座位已被人認領');
    err.code = 'LIVE_SEAT_TAKEN';
    throw err;
  }

  const ch = getCharacter(characterId);
  const seatRef = ref(db, `${roomPath(code)}/seats/${characterId}`);
  const result = await runTransaction(seatRef, (current) => {
    if (current && current.uid && current.uid !== user.uid) return; // abort
    return {
      uid: user.uid,
      label: ch?.labelZh || characterId,
      claimedAt: Date.now(),
    };
  });

  if (!result.committed) {
    const err = new Error('座位已被人認領，或者房間已滿');
    err.code = 'LIVE_SEAT_TAKEN';
    throw err;
  }

  // Release other seats held by this uid (update-null under seats is allowed)
  const release = {};
  for (const id of Object.keys(seatsNow)) {
    if (id !== characterId && seatsNow[id]?.uid === user.uid) release[id] = null;
  }
  if (Object.keys(release).length) {
    await update(ref(db, `${roomPath(code)}/seats`), release);
  }

  const finalSeats = (await get(ref(db, `${roomPath(code)}/seats`))).val() || {};
  return { uid: user.uid, characterId, seats: finalSeats };
}

export async function setRoomStatus(roomCode, status) {
  const user = await ensureAnonAuth();
  const code = String(roomCode).toUpperCase();
  const db = getLiveDatabase();
  const metaSnap = await get(ref(db, `${roomPath(code)}/meta`));
  if (!metaSnap.exists()) throw new Error('搵唔到房間');
  const meta = metaSnap.val();
  if (meta.hostId && meta.hostId !== user.uid) {
    const err = new Error('只有主持可以改狀態');
    err.code = 'LIVE_NOT_HOST';
    throw err;
  }
  await update(ref(db, `${roomPath(code)}/meta`), { status });
}

/**
 * Compress an Image/Canvas/Bitmap to a JPEG data URL for RTDB art sync.
 * @param {CanvasImageSource} source
 * @param {{ maxWidth?: number, quality?: number }} [opts]
 * @returns {Promise<{ dataUrl: string, mime: string, width: number, height: number }>}
 */
export async function compressArtToDataUrl(source, opts = {}) {
  const maxWidth = opts.maxWidth ?? ART_MAX_WIDTH;
  const quality = opts.quality ?? ART_JPEG_QUALITY;
  const sw = /** @type {{ width: number }} */ (source).width || /** @type {{ naturalWidth: number }} */ (source).naturalWidth;
  const sh = /** @type {{ height: number }} */ (source).height || /** @type {{ naturalHeight: number }} */ (source).naturalHeight;
  if (!sw || !sh) throw new Error('作品圖無效');
  const scale = Math.min(1, maxWidth / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Cream fill under transparent PNG so JPEG has no checkerboard / black holes
  ctx.fillStyle = '#F5ECD4';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, mime: 'image/jpeg', width: w, height: h };
}

/**
 * Upload compressed artwork once to puppets/{characterId}/art.
 * @param {string} roomCode
 * @param {string} characterId
 * @param {string} dataUrl JPEG (or PNG) data URL
 */
export async function publishArt(roomCode, characterId, dataUrl) {
  const user = await ensureAnonAuth();
  const code = String(roomCode).toUpperCase();
  const db = getLiveDatabase();
  const ch = getCharacter(characterId);
  const mime = String(dataUrl).startsWith('data:image/png')
    ? 'image/png'
    : 'image/jpeg';
  const payload = {
    kind: 'dataUrl',
    mime,
    dataUrl,
    updatedAt: Date.now(),
    assetVersion: ch?.assetVersion || '',
    uid: user.uid,
  };
  await set(ref(db, `${roomPath(code)}/puppets/${characterId}/art`), payload);
  return payload;
}

export function poseToPayload(pose, extra = {}) {
  const rods = {};
  if (pose?.localRot instanceof Map) {
    for (const [k, v] of pose.localRot) {
      if (typeof v === 'number' && Number.isFinite(v)) rods[k] = Math.round(v * 1000) / 1000;
    }
  } else if (pose?.localRot && typeof pose.localRot === 'object') {
    Object.assign(rods, pose.localRot);
  }
  return {
    x: Math.round(pose.rootX ?? pose.x ?? 0),
    y: Math.round(pose.rootY ?? pose.y ?? 0),
    scale: Math.round((pose.scale ?? 1) * 1000) / 1000,
    facing: pose.facing === -1 ? -1 : 1,
    rods,
    updatedAt: Date.now(),
    ...extra,
  };
}

export function payloadToPoseFields(payload) {
  if (!payload) return null;
  const localRot = new Map();
  if (payload.rods && typeof payload.rods === 'object') {
    for (const [k, v] of Object.entries(payload.rods)) {
      if (typeof v === 'number') localRot.set(k, v);
    }
  }
  return {
    rootX: Number(payload.x) || 0,
    rootY: Number(payload.y) || 0,
    scale: Number(payload.scale) || 1,
    facing: payload.facing === -1 ? -1 : 1,
    localRot,
    updatedAt: payload.updatedAt || 0,
  };
}

/** Throttled pose publisher (~15 Hz). */
export function createPosePublisher(roomCode, characterId, hz = POSE_HZ) {
  const minInterval = 1000 / hz;
  let lastSent = 0;
  let pending = null;
  let timer = 0;
  let writing = false;

  async function flush() {
    timer = 0;
    if (!pending || writing) return;
    const payload = pending;
    pending = null;
    writing = true;
    lastSent = Date.now();
    try {
      const user = await ensureAnonAuth();
      const db = getLiveDatabase();
      const code = String(roomCode).toUpperCase();
      await set(ref(db, `${roomPath(code)}/puppets/${characterId}/pose`), {
        ...payload,
        uid: user.uid,
      });
    } finally {
      writing = false;
      if (pending) scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (timer) return;
    const wait = Math.max(0, minInterval - (Date.now() - lastSent));
    timer = setTimeout(flush, wait);
  }

  return {
    schedule(pose) {
      pending = poseToPayload(pose);
      if (Date.now() - lastSent >= minInterval && !writing) flush();
      else scheduleFlush();
    },
    async flushNow(pose) {
      if (pose) pending = poseToPayload(pose);
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      await flush();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = 0;
      pending = null;
    },
  };
}

export function subscribePuppets(roomCode, onChange) {
  const db = getLiveDatabase();
  const code = String(roomCode).toUpperCase();
  return onValue(ref(db, `${roomPath(code)}/puppets`), (snap) => {
    onChange(snap.val() || {});
  });
}

export function subscribeSeats(roomCode, onChange) {
  const db = getLiveDatabase();
  const code = String(roomCode).toUpperCase();
  return onValue(ref(db, `${roomPath(code)}/seats`), (snap) => {
    onChange(snap.val() || {});
  });
}

export function subscribeMeta(roomCode, onChange) {
  const db = getLiveDatabase();
  const code = String(roomCode).toUpperCase();
  return onValue(ref(db, `${roomPath(code)}/meta`), (snap) => {
    onChange(snap.val() || {});
  });
}

export { roomPath };
