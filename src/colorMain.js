/**
 * color.html — brush / fill / eraser for wukong parts (zh-Hant, touch-friendly).
 * Mirrors bianlian-ar paint tools; IndexedDB on Save; stage overlay unchanged.
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
  strokePaint,
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

const BRUSH_SIZES = [6, 14, 30];

const canvas = document.getElementById('colorCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const partPicker = document.getElementById('partPicker');
const paletteEl = document.getElementById('palette');
const statusEl = document.getElementById('colorStatus');
const progressLabel = document.getElementById('progressLabel');
const taskMain = document.getElementById('taskMain');
const colorHint = document.getElementById('colorHint');
const btnUndo = document.getElementById('btnUndo');
const btnReset = document.getElementById('btnReset');
const btnSave = document.getElementById('btnSave');
const btnNext = document.getElementById('btnNext');
const btnBrush = document.getElementById('btnBrush');
const btnFill = document.getElementById('btnFill');
const btnEraser = document.getElementById('btnEraser');
const sizeRow = document.getElementById('sizeRow');

/** @type {{ rig: object, images: Map<string, HTMLImageElement>, originalImages: Map<string, HTMLImageElement> } | null} */
let state = null;
let characterId = 'wukong';
/** @type {string[]} */
let partIds = [];
let partIndex = 0;
let activeColor = PALETTE[0].hex;
/** @type {'brush'|'fill'|'eraser'} */
let tool = 'brush';
let brushSize = 14;
let drawing = false;
/** @type {{x:number,y:number}|null} */
let lastPt = null;
let strokeTouched = 0;

/**
 * Per-part working state (keeps unsaved edits across switches).
 * @type {Map<string, {
 *   imageData: ImageData,
 *   originalData: ImageData,
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
  const originalData = cloneImageData(imageData);
  const lock = buildBoundaryMask(imageData.data, w, h);
  const sess = {
    imageData,
    originalData,
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

function toolHint() {
  if (tool === 'fill') {
    return '點擊不透明區域填色；透明區與黑色輪廓不會被填滿。支援觸控。';
  }
  if (tool === 'eraser') {
    return '橡皮在身段內擦回原色；透明區與黑色輪廓不會改動。支援觸控。';
  }
  return '畫筆只在不透明身段內著色；透明區與黑色輪廓為邊界。支援觸控。';
}

function syncTools() {
  btnBrush.className = tool === 'brush' ? 'btn tool-btn' : 'btn secondary tool-btn';
  btnFill.className = tool === 'fill' ? 'btn tool-btn' : 'btn secondary tool-btn';
  btnEraser.className = tool === 'eraser' ? 'btn tool-btn' : 'btn secondary tool-btn';
  btnBrush.setAttribute('aria-pressed', tool === 'brush' ? 'true' : 'false');
  btnFill.setAttribute('aria-pressed', tool === 'fill' ? 'true' : 'false');
  btnEraser.setAttribute('aria-pressed', tool === 'eraser' ? 'true' : 'false');

  for (const b of sizeRow.querySelectorAll('.size-btn')) {
    const active = Number(b.dataset.size) === brushSize;
    b.className = active ? 'btn size-btn' : 'btn secondary size-btn';
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  for (const el of paletteEl.querySelectorAll('.swatch')) {
    const hex = el.dataset.hex;
    el.classList.toggle('active', tool !== 'eraser' && hex === activeColor);
  }

  if (colorHint) colorHint.textContent = toolHint();
  canvas.style.cursor = tool === 'fill' ? 'cell' : 'crosshair';
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
    const action =
      tool === 'fill' ? '選色後點擊區域填色' : tool === 'eraser' ? '在身段上擦回原色' : '選色後以畫筆著色';
    taskMain.textContent = `正在畫：「${part.labelZh || part.id}」— ${action}。`;
  }
}

function selectPart(index) {
  if (!state) return;
  drawing = false;
  lastPt = null;
  partIndex = Math.max(0, Math.min(partIds.length - 1, index));
  const part = currentPart();
  const baseImg = state.originalImages.get(part.id) || state.images.get(part.id);
  const sess = ensureSession(part, baseImg);
  paintSession(sess);
  updatePickerUI();
  setStatus(`已選「${part.labelZh || part.id}」`);
}

/**
 * Map pointer event → original PNG pixel (float for stroke continuity).
 */
function canvasPosFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
  const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
  if (clientX == null || !rect.width || !rect.height) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
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

function paintStrokeTo(pt) {
  const part = currentPart();
  if (!part) return;
  const sess = sessions.get(part.id);
  if (!sess) return;

  const rgb = parseHexColor(activeColor);
  const mode = tool === 'eraser' ? 'eraser' : 'brush';
  const n = strokePaint(
    sess.imageData.data,
    sess.w,
    sess.h,
    lastPt,
    pt,
    brushSize,
    rgb,
    sess.lock,
    sess.originalData.data,
    mode,
  );
  strokeTouched += n;
  lastPt = pt;
  sess.dirty = true;
  paintSession(sess);
  updatePickerUI();
}

function onPointerDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  ev.preventDefault();
  const pt = canvasPosFromEvent(ev);
  if (!pt) return;

  if (ev.pointerId != null && canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (_) {}
  }

  if (tool === 'fill') {
    applyFillAt(Math.floor(pt.x), Math.floor(pt.y));
    return;
  }

  const part = currentPart();
  const sess = part && sessions.get(part.id);
  if (!sess) return;

  sess.undoData = cloneImageData(sess.imageData);
  drawing = true;
  lastPt = null;
  strokeTouched = 0;
  paintStrokeTo(pt);
}

function onPointerMove(ev) {
  if (!drawing) return;
  ev.preventDefault();
  const pt = canvasPosFromEvent(ev);
  if (!pt) return;
  paintStrokeTo(pt);
}

function onPointerUp() {
  if (!drawing) return;
  drawing = false;
  lastPt = null;
  const part = currentPart();
  if (part) {
    const label = tool === 'eraser' ? '已擦除' : '已繪畫';
    setStatus(
      strokeTouched > 0
        ? `${label} ·「${part.labelZh || part.id}」`
        : '筆跡在身段外無效（請畫在不透明區域）',
      strokeTouched <= 0,
    );
  }
  strokeTouched = 0;
  updatePickerUI();
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
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = sess.w;
    exportCanvas.height = sess.h;
    const ex = exportCanvas.getContext('2d');
    ex.putImageData(sess.imageData, 0, 0);
    const blob = await canvasToPngBlob(exportCanvas);
    await saveColoredPart(characterId, part.id, blob);
    sess.dirty = false;
    sess.saved = true;
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
    btn.dataset.hex = c.hex;
    btn.title = c.label;
    btn.setAttribute('aria-label', c.label);
    btn.addEventListener('click', () => {
      activeColor = c.hex;
      if (tool === 'eraser') tool = 'brush';
      syncTools();
      updatePickerUI();
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
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointerup', onPointerUp);

  btnBrush.addEventListener('click', () => {
    tool = 'brush';
    syncTools();
    updatePickerUI();
    setStatus('工具：畫筆');
  });
  btnFill.addEventListener('click', () => {
    tool = 'fill';
    syncTools();
    updatePickerUI();
    setStatus('工具：填色');
  });
  btnEraser.addEventListener('click', () => {
    tool = 'eraser';
    syncTools();
    updatePickerUI();
    setStatus('工具：橡皮');
  });

  for (const b of sizeRow.querySelectorAll('.size-btn')) {
    b.addEventListener('click', () => {
      brushSize = Number(b.dataset.size) || 14;
      syncTools();
      const label = brushSize <= 6 ? '細' : brushSize >= 30 ? '大' : '中';
      setStatus(`筆粗：${label}`);
    });
  }

  btnUndo.addEventListener('click', () => undo());
  btnReset.addEventListener('click', () => resetPart());
  btnSave.addEventListener('click', () => saveCurrent(true));
  btnNext.addEventListener('click', () => goNext());
}

async function hydrateFromDb() {
  for (const part of state.rig.parts) {
    try {
      const blob = await loadColoredPart(characterId, part.id);
      if (!blob) continue;
      const colored = await blobToImage(blob);
      const orig = state.originalImages.get(part.id);
      const sess = ensureSession(part, orig);
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
    syncTools();

    await hydrateFromDb();
    selectPart(0);
    setStatus('可立即繪畫：預設畫筆，亦可改填色／橡皮');
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

init();
