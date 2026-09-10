/**
 * Virtual shadow-puppet rods: torso + left/right wrist.
 * Shares manual pose with joint drag; no physics sim.
 * Rod grips live in a rail below the stage; drag deltas move IK targets.
 */

import { resolveManualJoints, applyDrag, distalTip } from './dragPose.js';

/**
 * @typedef {'rods' | 'joints'} ControlMode
 */

/**
 * @param {{
 *   railEl: HTMLElement,
 *   getPose: () => object | null,
 *   getRig: () => object | null,
 *   onPoseChange: () => void,
 *   canvas: HTMLCanvasElement,
 * }} opts
 */
export function createRodControls(opts) {
  const { railEl, getPose, getRig, onPoseChange, canvas } = opts;

  /** @type {ControlMode} */
  let mode = 'rods';
  /** @type {string | null} */
  let activeId = null;
  /** @type {{
   *   startRootX: number,
   *   startRootY: number,
   *   startPtrX: number,
   *   startPtrY: number,
   *   startTargetX: number,
   *   startTargetY: number,
   *   kind: 'torso' | 'wrist',
   *   chain?: string[],
   * } | null} */
  let dragMeta = null;

  const rodDefs = [
    { id: 'rod-torso', kind: 'torso', label: '軀幹' },
    {
      id: 'rod-wristL',
      kind: 'wrist',
      label: '左手',
      chain: ['upperArmL', 'lowerArmL'],
      tipPart: 'lowerArmL',
    },
    {
      id: 'rod-wristR',
      kind: 'wrist',
      label: '右手',
      chain: ['upperArmR', 'lowerArmR'],
      tipPart: 'lowerArmR',
    },
  ];

  railEl.innerHTML = '';
  railEl.classList.add('rod-rail');
  railEl.dataset.mode = mode;
  railEl.setAttribute('aria-label', '虛擬棍控');

  const grips = new Map();

  for (const rod of rodDefs) {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'rod-grip rod-grip--' + rod.kind;
    grip.dataset.rod = rod.id;
    grip.setAttribute('aria-label', rod.label + '棍');
    grip.innerHTML =
      '<span class="rod-grip-knob" aria-hidden="true"></span>' +
      '<span class="rod-grip-label">' +
      rod.label +
      '</span>';
    railEl.appendChild(grip);
    grips.set(rod.id, grip);

    grip.addEventListener('pointerdown', (ev) => onDown(ev, rod, grip));
    grip.addEventListener('pointermove', (ev) => onMove(ev, rod));
    grip.addEventListener('pointerup', (ev) => onUp(ev, grip));
    grip.addEventListener('pointercancel', (ev) => onUp(ev, grip));
  }

  function clientToCanvasDeltaScale() {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: canvas.width / Math.max(1, rect.width),
      sy: canvas.height / Math.max(1, rect.height),
    };
  }

  function currentTarget(rig, pose, rod) {
    const joints = resolveManualJoints(rig, pose);
    const scale = pose.scale;
    if (rod.kind === 'torso') {
      const torso = joints.get('torso');
      if (!torso) return null;
      return { x: torso.x, y: torso.y - 40 * scale };
    }
    const lower = joints.get(rod.tipPart);
    if (!lower) return null;
    return distalTip(lower, scale);
  }

  function onDown(ev, rod, grip) {
    if (mode !== 'rods') return;
    const pose = getPose();
    const rig = getRig();
    if (!pose || !rig) return;
    ev.preventDefault();
    const target = currentTarget(rig, pose, rod);
    if (!target) return;

    activeId = rod.id;
    const { sx, sy } = clientToCanvasDeltaScale();
    // Store pointer in canvas units for delta math
    dragMeta = {
      startRootX: pose.rootX,
      startRootY: pose.rootY,
      startPtrX: ev.clientX * sx,
      startPtrY: ev.clientY * sy,
      startTargetX: target.x,
      startTargetY: target.y,
      kind: rod.kind,
      chain: rod.chain,
      sx,
      sy,
      clientStartX: ev.clientX,
      clientStartY: ev.clientY,
    };
    grip.classList.add('dragging');
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch (_) {}
  }

  function onMove(ev, rod) {
    if (activeId !== rod.id || !dragMeta || mode !== 'rods') return;
    const pose = getPose();
    const rig = getRig();
    if (!pose || !rig) return;
    ev.preventDefault();

    const dx = (ev.clientX - dragMeta.clientStartX) * dragMeta.sx;
    const dy = (ev.clientY - dragMeta.clientStartY) * dragMeta.sy;
    const tx = dragMeta.startTargetX + dx;
    const ty = dragMeta.startTargetY + dy;

    if (rod.kind === 'torso') {
      // Translate root by same delta (torso handle follows root)
      pose.rootX = dragMeta.startRootX + dx;
      pose.rootY = dragMeta.startRootY + dy;
    } else {
      const handle = {
        id: rod.id,
        kind: 'wrist',
        x: tx,
        y: ty,
        chain: rod.chain,
      };
      applyDrag(rig, pose, handle, tx, ty, {});
    }
    onPoseChange();
    syncGripPositions();
  }

  function onUp(ev, grip) {
    if (!activeId) return;
    activeId = null;
    dragMeta = null;
    grip.classList.remove('dragging');
    try {
      grip.releasePointerCapture(ev.pointerId);
    } catch (_) {}
    onPoseChange();
  }

  function resolveRodTargets(rig, pose) {
    const joints = resolveManualJoints(rig, pose);
    const scale = pose.scale;
    const out = [];
    const torso = joints.get('torso');
    if (torso) {
      out.push({
        id: 'rod-torso',
        kind: 'torso',
        jointX: torso.x,
        jointY: torso.y - 40 * scale,
      });
    }
    for (const rod of rodDefs) {
      if (rod.kind !== 'wrist') continue;
      const lower = joints.get(rod.tipPart);
      if (!lower) continue;
      const tip = distalTip(lower, scale);
      out.push({
        id: rod.id,
        kind: 'wrist',
        jointX: tip.x,
        jointY: tip.y,
      });
    }
    return out;
  }

  function syncGripPositions() {
    const pose = getPose();
    const rig = getRig();
    if (!pose || !rig) return;
    const targets = resolveRodTargets(rig, pose);
    const canvasRect = canvas.getBoundingClientRect();
    const railRect = railEl.getBoundingClientRect();
    for (const t of targets) {
      const grip = grips.get(t.id);
      if (!grip) continue;
      const screenX =
        canvasRect.left + (t.jointX / canvas.width) * canvasRect.width;
      const localX = screenX - railRect.left;
      const minX = 28;
      const maxX = Math.max(minX, railRect.width - 28);
      const clamped = Math.min(maxX, Math.max(minX, localX));
      grip.style.left = clamped + 'px';
    }
  }

  /**
   * Draw rod shafts on the stage canvas (joint → bottom).
   * @param {CanvasRenderingContext2D} ctx
   */
  function drawRods(ctx) {
    if (mode !== 'rods') return;
    const pose = getPose();
    const rig = getRig();
    if (!pose || !rig) return;
    const targets = resolveRodTargets(rig, pose);
    const bottomY = canvas.height - 6;

    ctx.save();
    for (const t of targets) {
      const isActive = activeId === t.id;
      ctx.strokeStyle = isActive
        ? 'rgba(255, 210, 120, 0.95)'
        : t.kind === 'torso'
          ? 'rgba(230, 180, 90, 0.8)'
          : 'rgba(120, 200, 230, 0.75)';
      ctx.lineWidth = isActive ? 4.5 : 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.jointX, t.jointY);
      // Slight curve toward bottom for “rod” feel
      const midY = (t.jointY + bottomY) * 0.5;
      ctx.quadraticCurveTo(t.jointX + (isActive ? 6 : 0), midY, t.jointX, bottomY);
      ctx.stroke();

      ctx.fillStyle = isActive
        ? 'rgba(255, 210, 100, 0.95)'
        : 'rgba(235, 195, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(t.jointX, t.jointY, isActive ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 248, 230, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function setMode(next) {
    mode = next === 'joints' ? 'joints' : 'rods';
    railEl.dataset.mode = mode;
    railEl.hidden = mode !== 'rods';
    if (mode === 'rods') syncGripPositions();
  }

  function getMode() {
    return mode;
  }

  function isDragging() {
    return !!activeId;
  }

  // Even initial spacing until first sync from pose
  const ids = [...grips.keys()];
  ids.forEach((id, i) => {
    const grip = grips.get(id);
    grip.style.left = ((i + 1) / (ids.length + 1)) * 100 + '%';
  });

  return {
    setMode,
    getMode,
    drawRods,
    syncGripPositions,
    isDragging,
  };
}
