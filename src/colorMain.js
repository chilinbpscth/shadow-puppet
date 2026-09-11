/**
 * color.html — P2 region fill for wukong parts (zh-Hant, touch-friendly).
 * Spec: COLOR-B-SPEC.md — flood-fill only; IndexedDB on Save.
 */

import { loadRig } from './loadRig.js';
import {
  saveColoredPart,
  loadColoredPart,
  blobToImage,
} from './colorStorage.js';
import {
  buildBoundaryMask,
  parseHexColor,
  floodFill,
  canvasToPngBlob,
} from './colorFill.js';

const PALETTE = [
  { hex: '#e74c3c', label: '紅' },
  { hex: '#e67e22', label: '橙' },
  { hex: '#f1c40f', label: '黃' },
  { hex: '#2ecc71', label: '綠' },
  { hex: '#1abc9c', label: '青' },
  { hex: '#3498db', label: '藍' },
  { hex: '#9b59b6', label: '紫' },
  { hex: '#e91e63', label: '粉' },
  { hex: '#8d6e63', label: '褐' },
  { hex: '#ecf0f1', label: '白' },
  { hex: '#f5d76e', label: '金' },
  { hex: '#7f8c8d', label: '灰' },
];

const canvas = document.getElementById('colorCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const partPicker = document.getElementById('partPicker');
const paletteEl = document.getElementById('palette');
const statusEl = document.getElementById('colorStatus');
const progressLabel = document.getElementById('progressLabel');
const taskMain = document.getElementById('taskMain');
const btnUndo = document.getElementById('btnUndo');
const btnReset = document.getElementById('btnReset');
const btnSave = document.getElementById('btnSave');
const btnNext = document.getElementById('btnNext');

/** @type {{ rig: object, images: Map<string, HTMLImageElement> } | null} */
let state = null;
let characterId = 'wukong';
/** @type {string[]} */
let partIds = [];
let partIndex = 0;
let activeColor = PALETTE[0].hex;

/**
 * Per-part working state (keeps unsaved edits across switches).
 * @type {Map<string, {
 *   imageData: ImageData,
 *   undoData: ImageData | null,
 *   lock: Uint8Array,
 *   dirty: boolean,
 *   saved: boolean,
 *   w: number,
 *   h: number,
 * }>}
 */
const sessions = new Map();

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', !!isError);
  if (!isError) statusEl.style.color = '';
  else statusEl.style.color = '#ff8a7a';
}

function currentPart() {
  return state?.rig.parts[partIndex] || null;
}

function cloneImageData(src) {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

/**
 * @param {object} part
 * @param {HTMLImageElement} img
 */
function ensureSession(part, img) {
  if (sessions.has(part.id)) return sessions.get(part.id);
  const w = img.naturalWidth || part.width;
  const h = img.naturalHeight || part.height;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.clearRect(0, 0, w, h);
  octx.drawImage(img, 0, 0);
  const imageData = octx.getImageData(0, 0, w, h);
  const lock = buildBoundaryMask(imageData.data, w, h);
  const sess = {
    imageData,
    undoData: null,
    lock,
    dirty: false,
    saved: false,
    w,
    h,
  };
  sessions.set(part.id, sess);
  return sess;
}

function paintSession(sess) {
  canvas.width = sess.w;
  canvas.height = sess.h;
  ctx.putImageData(sess.imageData, 0, 0);
  btnUndo.disabled = !sess.undoData;
}

function updatePickerUI() {
  for (const btn of partPicker.querySelectorAll('.part-pick')) {
    const id = btn.dataset.partId;
    const sess = sessions.get(id);
    btn.classList.toggle('active', id === currentPart()?.id);
    btn.classList.toggle('dirty', !!(sess && sess.dirty));
    btn.classList.toggle('saved', !!(sess && sess.saved && !sess.dirty));
  }
  const part = currentPart();
  progressLabel.textContent = `身段 ${partIndex + 1}／${partIds.length}`;
  if (part) {
    taskMain.textContent = `正在填：「${part.labelZh || part.id}」— 選色後點擊區域。`;
  }
}

function selectPart(index) {
  if (!state) return;
  partIndex = Math.max(0, Math.min(partIds.length - 1, index));
  const part = currentPart();
  const baseImg = state.images.get(part.id);
  const sess = ensureSession(part, baseImg);
  paintSession(sess);
  updatePickerUI();
  setStatus(`已選「${part.labelZh || part.id}」`);
}

/**
 * Map pointer event → original PNG pixel.
 */
function canvasPixelFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
  const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
  if (clientX == null || !rect.width || !rect.height) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
  return { x, y };
}

function applyFillAt(x, y) {
  const part = currentPart();
  if (!part) return;
  const sess = sessions.get(part.id);
  if (!sess) return;

  const rgb = parseHexColor(activeColor);
  const before = cloneImageData(sess.imageData);
  const filled = floodFill(
    sess.imageData.data,
    sess.w,
    sess.h,
    x,
    y,
    rgb,
    sess.lock,
  );
  if (filled <= 0) {
    setStatus('請點在身段不透明區域內（輪廓／透明無效）', true);
    return;
  }
  sess.undoData = before;
  sess.dirty = true;
  paintSession(sess);
  updatePickerUI();
  setStatus(`已填 ${filled} 像素 ·「${part.labelZh || part.id}」`);
}

function onPointerDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  ev.preventDefault();
  const pt = canvasPixelFromEvent(ev);
  if (!pt) return;
  applyFillAt(pt.x, pt.y);
}

function undo() {
  const part = currentPart();
  if (!part) return;
  const sess = sessions.get(part.id);
  if (!sess?.undoData) return;
  sess.imageData = sess.undoData;
  sess.undoData = null;
  sess.dirty = true;
  paintSession(sess);
  updatePickerUI();
  setStatus('已復原一步');
}

async function resetPart() {
  const part = currentPart();
  if (!part || !state) return;
  const baseImg = state.originalImages.get(part.id) || state.images.get(part.id);
  sessions.delete(part.id);
  const sess = ensureSession(part, baseImg);
  // If we had a saved colored version, reset means original PNG (spec)
  paintSession(sess);
  sess.dirty = true;
  sess.saved = false;
  updatePickerUI();
  setStatus(`已重設「${part.labelZh || part.id}」為原圖（尚未儲存）`);
}

async function saveCurrent(showOk = true) {
  const part = currentPart();
  if (!part) return false;
  const sess = sessions.get(part.id);
  if (!sess) return false;

  btnSave.disabled = true;
  setStatus('儲存中…');
  try {
    // Draw session to export canvas (same pixels)
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = sess.w;
    exportCanvas.height = sess.h;
    const ex = exportCanvas.getContext('2d');
    ex.putImageData(sess.imageData, 0, 0);
    const blob = await canvasToPngBlob(exportCanvas);
    await saveColoredPart(characterId, part.id, blob);
    sess.dirty = false;
    sess.saved = true;
    // Keep stage loadRig in sync if user navigates without full reload
    const img = await blobToImage(blob);
    state.images.set(part.id, img);
    updatePickerUI();
    if (showOk) setStatus(`已儲存「${part.labelZh || part.id}」`);
    return true;
  } catch (err) {
    console.error(err);
    setStatus(
      '儲存失敗：' + (err?.message || String(err)) + ' — 畫布保留，可重試',
      true,
    );
    return false;
  } finally {
    btnSave.disabled = false;
  }
}

async function goNext() {
  if (partIndex < partIds.length - 1) {
    selectPart(partIndex + 1);
  } else {
    setStatus('已是最後一節 — 可按「儲存」後「進入演出」');
  }
}

function buildPalette() {
  paletteEl.innerHTML = '';
  for (const c of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch' + (c.hex === activeColor ? ' active' : '');
    btn.style.background = c.hex;
    btn.title = c.label;
    btn.setAttribute('aria-label', c.label);
    btn.addEventListener('click', () => {
      activeColor = c.hex;
      for (const el of paletteEl.querySelectorAll('.swatch')) {
        el.classList.toggle('active', el === btn);
      }
      setStatus(`顏色：${c.label}`);
    });
    paletteEl.appendChild(btn);
  }
}

function buildPartPicker() {
  partPicker.innerHTML = '';
  for (let i = 0; i < state.rig.parts.length; i++) {
    const part = state.rig.parts[i];
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'part-pick';
    btn.dataset.partId = part.id;
    btn.dataset.index = String(i);
    btn.setAttribute('role', 'option');
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = part.labelZh || part.id;
    btn.append(dot, label);
    btn.addEventListener('click', () => selectPart(i));
    li.appendChild(btn);
    partPicker.appendChild(li);
  }
}

function bindUi() {
  canvas.addEventListener('pointerdown', onPointerDown);
  btnUndo.addEventListener('click', () => undo());
  btnReset.addEventListener('click', () => resetPart());
  btnSave.addEventListener('click', () => saveCurrent(true));
  btnNext.addEventListener('click', () => goNext());
}

async function hydrateFromDb() {
  // Prefer saved colored blobs as starting canvas; boundary still from original.
  for (const part of state.rig.parts) {
    try {
      const blob = await loadColoredPart(characterId, part.id);
      if (!blob) continue;
      const colored = await blobToImage(blob);
      const orig = state.originalImages.get(part.id);
      const sess = ensureSession(part, orig);
      // Replace pixels with saved colored image, keep original lock
      const off = document.createElement('canvas');
      off.width = sess.w;
      off.height = sess.h;
      const octx = off.getContext('2d', { willReadFrequently: true });
      octx.clearRect(0, 0, sess.w, sess.h);
      octx.drawImage(colored, 0, 0, sess.w, sess.h);
      sess.imageData = octx.getImageData(0, 0, sess.w, sess.h);
      sess.saved = true;
      sess.dirty = false;
      state.images.set(part.id, colored);
    } catch (err) {
      console.warn('載入已存填色略過', part.id, err);
    }
  }
}

async function init() {
  try {
    setStatus('載入悟空身段…');
    // Load originals only (no colored overlay) for boundary masks
    const loaded = await loadRig(undefined, { applyColored: false });
    state = {
      rig: loaded.rig,
      images: new Map(loaded.images),
      originalImages: new Map(loaded.images),
    };
    characterId = loaded.rig.id || 'wukong';
    partIds = loaded.rig.parts.map((p) => p.id);

    buildPalette();
    buildPartPicker();
    bindUi();

    await hydrateFromDb();
    selectPart(0);
    setStatus('可立即填色：選色後點擊身段');
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

init();
