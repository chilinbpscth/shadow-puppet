import { loadRig } from './loadRig.js';
import { drawPuppet } from './drawPuppet.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const debugToggle = document.getElementById('debugToggle');
const btnReset = document.getElementById('btnReset');
const btnRedraw = document.getElementById('btnRedraw');
const partList = document.getElementById('partList');
const statusEl = document.getElementById('status');

/** @type {{ rig: object, images: Map<string, HTMLImageElement> } | null} */
let state = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#ff8a7a' : '#9dce8a';
}

function render() {
  if (!state) return;
  drawPuppet(ctx, state.rig, state.images, {
    showDebug: debugToggle.checked,
    cx: canvas.width / 2,
    cy: canvas.height * 0.36,
    scale: 1,
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

async function init() {
  try {
    setStatus('載入 rig 與身段圖片…');
    state = await loadRig();
    fillPartList(state.rig);
    render();
    setStatus(
      `已載入 ${state.rig.parts.length} 件身段 · ${state.rig.labelZh}`,
    );
  } catch (err) {
    console.error(err);
    setStatus(err?.message || String(err), true);
  }
}

debugToggle.addEventListener('change', render);
btnRedraw.addEventListener('click', render);
btnReset.addEventListener('click', () => {
  debugToggle.checked = false;
  render();
  setStatus('已重設為預設站立／T 字姿勢');
});

init();
