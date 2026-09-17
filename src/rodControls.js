import {resolveManualJoints, applyDrag, distalTip, clonePose} from './dragPose.js';
import {moveBodyRod} from './rodMotion.js';

const ARM_SWING_LIMIT = Math.PI * 0.42;
const LINKED_LEG_SWING_LIMIT = Math.PI * 0.18;

function circleIntersections(a, ra, b, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > ra + rb || d < Math.abs(ra - rb)) return [];
  const along = (ra * ra - rb * rb + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, ra * ra - along * along));
  const x = a.x + dx * along / d, y = a.y + dy * along / d;
  const ox = -dy * height / d, oy = dx * height / d;
  return [{x: x + ox, y: y + oy}, {x: x - ox, y: y - oy}];
}

export function applyElbowKneeLinkage(rig, pose, side, upperRotation) {
  const armId = 'upperArm' + side, thighId = 'thigh' + side, shinId = 'shin' + side;
  if (![armId, thighId, shinId].every(id => rig.parts.some(p => p.id === id))) return null;
  const oldUpperRotation = pose.localRot.get(armId) || 0;
  const before = resolveManualJoints(rig, pose);
  const oldElbow = before.get('lowerArm' + side), oldKnee = before.get(shinId), hip = before.get(thighId);
  if (!oldElbow || !oldKnee || !hip) return false;
  const linkLength = Math.hypot(oldKnee.x - oldElbow.x, oldKnee.y - oldElbow.y);
  const thighRadius = Math.hypot(oldKnee.x - hip.x, oldKnee.y - hip.y);
  pose.localRot.set(armId, upperRotation);
  const elbow = resolveManualJoints(rig, pose).get('lowerArm' + side);
  const candidates = circleIntersections(hip, thighRadius, elbow, linkLength);
  if (!candidates.length) {
    pose.localRot.set(armId, oldUpperRotation);
    return false;
  }
  const knee = candidates.reduce((best, p) =>
    Math.hypot(p.x - oldKnee.x, p.y - oldKnee.y) < Math.hypot(best.x - oldKnee.x, best.y - oldKnee.y) ? p : best);
  const thigh = rig.parts.find(p => p.id === thighId);
  const child = rig.parts.find(p => p.id === shinId).defaultPose || {};
  const bindHeading = Math.atan2(child.y || 0, child.x || 0);
  let desiredHeading = Math.atan2(knee.y - hip.y, knee.x - hip.x);
  if (pose.facing === -1) desiredHeading = Math.PI - desiredHeading;
  const rest = thigh.defaultPose?.rotation || 0;
  const nextThigh = rest + wrappedAngle(desiredHeading - bindHeading - rest);
  // Near a four-bar dead point, a tiny hand movement can otherwise flip the
  // knee to the opposite circle intersection.  A physical card joint reaches
  // its stop instead; rejecting that pose preserves both pin distances.
  if (Math.abs(nextThigh - rest) > LINKED_LEG_SWING_LIMIT) {
    pose.localRot.set(armId, oldUpperRotation);
    return false;
  }
  const outward = side === 'L' ? -1 : 1;
  if ((knee.x - pose.rootX) * outward * pose.facing < 0) {
    pose.localRot.set(armId, oldUpperRotation);
    return false;
  }
  pose.localRot.set(thighId, nextThigh);
  return true;
}

function wrappedAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function armRotationFromRod(startRotation, restRotation, startRodAngle, nextRodAngle, facing = 1) {
  const visualDelta = wrappedAngle(nextRodAngle - startRodAngle);
  const next = startRotation + visualDelta * (facing === -1 ? -1 : 1);
  return Math.max(restRotation - ARM_SWING_LIMIT, Math.min(restRotation + ARM_SWING_LIMIT, next));
}

function rodsForRig(rig) {
  const preset = rig?.rodPreset || (rig?.kind === 'horse' ? 'horse' : 'humanoid');
  if (preset === 'horse') {
    // P1a: body rod; head/neck if part exists (P1b)
    const rods = [{id: 'body', label: '身棍', kind: 'torso', slot: 0.5}];
    if (rig.parts?.some((p) => p.id === 'head')) {
      rods.push({id: 'head', label: '頭頸棍', kind: 'neck', tip: 'head', slot: 0.78});
    }
    return rods;
  }
  // humanoid
  if (rig?.wholeFigure) {
    // P1a whole silhouette: body rod only (arm rods need articulated parts)
    return [{id: 'body', label: '身棍', kind: 'torso', slot: 0.5}];
  }
  return [
    {id: 'left', label: '左連動棍', kind: 'arm', chain: ['upperArmL', 'lowerArmL'], drive: 'upperArmL', tip: 'lowerArmL', slot: 0.28},
    {id: 'right', label: '右連動棍', kind: 'arm', chain: ['upperArmR', 'lowerArmR'], drive: 'upperArmR', tip: 'lowerArmR', slot: 0.72},
  ];
}

function targetForRod(rig, pose, rod) {
  const joints = resolveManualJoints(rig, pose);
  if (rod.kind === 'torso') {
    const p = joints.get('head') || joints.get('torso');
    return {x: p.x, y: p.y};
  }
  if (rod.kind === 'neck') {
    const p = joints.get(rod.tip || 'head') || joints.get('torso');
    return {x: p.x, y: p.y - 30 * pose.scale};
  }
  if (rod.kind === 'arm') {
    const p = joints.get(rod.tip || rod.chain?.[0]) || joints.get('torso');
    return {x: p.x, y: p.y};
  }
  return distalTip(joints.get(rod.tip), pose.scale);
}

export function rodSegmentsForPose(rig, pose, width, height, overrides = {}) {
  return rodsForRig(rig)
    .filter((rod) => rod.kind === 'arm')
    .map((rod) => {
      const joints = resolveManualJoints(rig, pose);
      const joint = targetForRod(rig, pose, rod);
      const side = rod.drive?.endsWith('L') ? 'L' : 'R';
      const knee = joints.get('shin' + side);
      const slot = pose.facing === -1 ? 1 - rod.slot : rod.slot;
      const requested = overrides[rod.id] || pose.rodEnds?.[rod.id] || {x: width * slot, y: height * 1.18};
      let end = requested;
      if (knee && Math.abs(knee.y - joint.y) > 1e-6) {
        // A real two-hole control rod is one rigid line through the elbow and
        // knee pins.  The player's lower grip therefore slides to the point
        // where that line reaches the control rail; it cannot bend toward an
        // independently chosen x coordinate.
        const reachY = Math.max(requested.y, knee.y + 80 * pose.scale);
        const t = (reachY - joint.y) / (knee.y - joint.y);
        end = {x: joint.x + (knee.x - joint.x) * t, y: reachY};
      }
      return {id: rod.id, x1: joint.x, y1: joint.y, x2: end.x, y2: end.y, active: !!overrides[rod.id]};
    });
}

export function createRodControls({railEl, getPose, getRig, onPoseChange, canvas}) {
  let mode = 'rods',
    visible = true;
  const active = new Map(),
    grips = new Map(),
    lines = new Map();
  const column = canvas.closest('.stage-column');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('rod-lines');
  svg.setAttribute('aria-hidden', 'true');
  column.append(svg);

  let rods = rodsForRig(getRig());

  function rebuildRods() {
    rods = rodsForRig(getRig());
    railEl.replaceChildren();
    grips.clear();
    for (const line of lines.values()) line.remove();
    lines.clear();
    for (const rod of rods) {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'rod-grip rod-grip--' + rod.kind;
      grip.setAttribute('aria-label', rod.label + '：拖動推提');
      grip.innerHTML =
        '<span class="rod-grip-knob" aria-hidden="true"></span><span class="rod-grip-label">' +
        rod.label +
        '</span>';
      railEl.append(grip);
      grips.set(rod.id, grip);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('stroke', rod.kind === 'torso' ? '#ad8045' : '#7aa8b3');
      line.setAttribute('stroke-width', rod.kind === 'arm' ? '9' : '3');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', rod.kind === 'arm' ? '.42' : '.8');
      svg.append(line);
      lines.set(rod.id, line);
      grip.addEventListener('pointerdown', (ev) => down(ev, rod, grip));
      grip.addEventListener('pointermove', (ev) => move(ev, rod));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        grip.addEventListener(type, (ev) => up(ev, rod));
      grip.addEventListener('contextmenu', (ev) => ev.preventDefault());
      grip.addEventListener('keydown', (ev) => {
        const delta = {ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12]}[ev.key];
        if (!delta || mode !== 'rods' || !visible) return;
        ev.preventDefault();
        const pose = getPose(),
          rig = getRig();
        if (!pose || !rig) return;
        if (rod.kind === 'torso') applyBody(pose, moveBodyRod(rig, pose, ...delta));
        else if (rod.kind === 'neck') nudgeNeck(rig, pose, rod, delta[0], delta[1]);
        else if (rod.kind === 'arm') {
          const start = canvasEndForRod(pose, rod);
          pose.rodEnds = {...(pose.rodEnds || {}), [rod.id]: {x: start.x + delta[0], y: start.y + delta[1]}};
          const end = canvasEndForRod(pose, rod);
          nudgeArm(rig, pose, rod, start, end);
          pose.rodEnds[rod.id] = end;
          onPoseChange();
          syncGripPositions();
          return;
        } else {
          const p = targetForRod(rig, pose, rod);
          applyDrag(rig, pose, {kind: 'wrist', chain: rod.chain}, p.x + delta[0], p.y + delta[1]);
        }
        const end = canvasEndForRod(pose, rod);
        pose.rodEnds = {...(pose.rodEnds || {}), [rod.id]: {x: end.x + delta[0], y: end.y + delta[1]}};
        onPoseChange();
        syncGripPositions();
      });
    }
  }

  rebuildRods();

  function defaultCanvasEnd(pose, rod) {
    const c = canvas.getBoundingClientRect();
    const r = railEl.getBoundingClientRect();
    const slot = pose.facing === -1 && (rod.kind === 'wrist' || rod.kind === 'arm') ? 1 - rod.slot : rod.slot;
    return {
      x: ((r.left + r.width * slot - c.left) / c.width) * canvas.width,
      y: ((r.top + 20 - c.top) / c.height) * canvas.height,
    };
  }
  function canvasEndForRod(pose, rod) {
    const raw = pose.rodEnds?.[rod.id] || defaultCanvasEnd(pose, rod);
    if (rod.kind !== 'arm') return raw;
    const client = clientForCanvasEnd(raw);
    const c = canvas.getBoundingClientRect();
    const r = railEl.getBoundingClientRect();
    const halfGrip = 46;
    return canvasForClientEnd(
      Math.max(r.left + halfGrip, Math.min(r.right - halfGrip, client.x)),
      Math.max(c.bottom + 18, Math.min(r.bottom - 18, client.y)),
    );
  }
  function clientForCanvasEnd(point) {
    const c = canvas.getBoundingClientRect();
    return {
      x: c.left + (point.x / canvas.width) * c.width,
      y: c.top + (point.y / canvas.height) * c.height,
    };
  }
  function canvasForClientEnd(x, y) {
    const c = canvas.getBoundingClientRect();
    return {
      x: ((x - c.left) / c.width) * canvas.width,
      y: ((y - c.top) / c.height) * canvas.height,
    };
  }
  function nudgeNeck(rig, pose, rod, dx, dy) {
    const partId = rod.tip || 'head';
    if (!pose.localRot.has(partId) && !rig.parts.some((p) => p.id === partId)) return;
    const cur = pose.localRot.get(partId) || 0;
    pose.localRot.set(partId, cur + dx * 0.01 + dy * 0.012);
  }
  function nudgeArm(rig, pose, rod, start, end) {
    const partId = rod.drive || rod.chain?.[0];
    if (!partId || !rig.parts.some((p) => p.id === partId)) return;
    const part = rig.parts.find((p) => p.id === partId);
    const rest = part?.defaultPose?.rotation || 0;
    const cur = pose.localRot.get(partId) || 0;
    const joint = targetForRod(rig, pose, rod);
    const startAngle = Math.atan2(start.y - joint.y, start.x - joint.x);
    const endAngle = Math.atan2(end.y - joint.y, end.x - joint.x);
    const next = armRotationFromRod(cur, rest, startAngle, endAngle, pose.facing);
    const side = partId.endsWith('L') ? 'L' : 'R';
    if (applyElbowKneeLinkage(rig, pose, side, next) === null) pose.localRot.set(partId, next);
  }
  function down(ev, rod, grip) {
    if (mode !== 'rods' || !visible || active.has(rod.id) || (ev.pointerType === 'mouse' && ev.button !== 0))
      return;
    const pose = getPose(),
      rig = getRig();
    if (!pose || !rig) return;
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect(),
      r = grip.getBoundingClientRect();
    const start = targetForRod(rig, pose, rod);
    const jointClientX = rect.left + (start.x / canvas.width) * rect.width;
    const jointClientY = rect.top + (start.y / canvas.height) * rect.height;
    const gripClientX = r.left + r.width / 2;
    const gripClientY = r.top + 20;
    active.set(rod.id, {
      pointer: ev.pointerId,
      base: clonePose(pose),
      start,
      x: ev.clientX,
      y: ev.clientY,
      cx: gripClientX,
      cy: gripClientY,
      dx: 0,
      dy: 0,
      sx: canvas.width / rect.width,
      sy: canvas.height / rect.height,
      startRot: pose.localRot.get(rod.drive || rod.tip || 'head') || 0,
      startRodAngle: Math.atan2(gripClientY - jointClientY, gripClientX - jointClientX),
    });
    grip.setPointerCapture(ev.pointerId);
    grip.classList.add('dragging');
    syncGripPositions();
  }
  function applyBody(pose, next) {
    pose.rootX = next.rootX;
    pose.rootY = next.rootY;
    for (const id of ['thighL', 'thighR', 'shinL', 'shinR', 'tail', 'forelegF', 'forelegB', 'hindlegF', 'hindlegB']) {
      if (next.localRot.has(id)) pose.localRot.set(id, next.localRot.get(id));
    }
  }
  function move(ev, rod) {
    const drag = active.get(rod.id);
    if (!drag || drag.pointer !== ev.pointerId) return;
    ev.preventDefault();
    const pose = getPose(),
      rig = getRig();
    const rawDx = ev.clientX - drag.x;
    const rawDy = ev.clientY - drag.y;
    if (rod.kind === 'arm') {
      const canvasRect = canvas.getBoundingClientRect();
      const railRect = railEl.getBoundingClientRect();
      const halfGrip = 46;
      const gripX = Math.max(railRect.left + halfGrip, Math.min(railRect.right - halfGrip, drag.cx + rawDx));
      const gripY = Math.max(canvasRect.bottom + 18, Math.min(railRect.bottom - 18, drag.cy + rawDy));
      drag.dx = gripX - drag.cx;
      drag.dy = gripY - drag.cy;
    } else {
      drag.dx = rawDx;
      drag.dy = rawDy;
    }
    const dx = drag.dx * drag.sx,
      dy = drag.dy * drag.sy;
    if (rod.kind === 'torso') {
      applyBody(pose, moveBodyRod(rig, drag.base, dx, dy));
      for (const hand of rods.filter((r) => r.kind === 'wrist')) {
        const held = active.get(hand.id);
        if (held)
          applyDrag(
            rig,
            pose,
            {kind: 'wrist', chain: hand.chain},
            held.start.x + held.dx * held.sx,
            held.start.y + held.dy * held.sy,
          );
      }
    } else if (rod.kind === 'neck') {
      const partId = rod.tip || 'head';
      pose.localRot.set(partId, drag.startRot + dx * 0.01 + dy * 0.012);
    } else if (rod.kind === 'arm') {
      const partId = rod.drive || rod.chain?.[0];
      if (partId) {
        const part = rig.parts.find((p) => p.id === partId);
        const rest = part?.defaultPose?.rotation || 0;
        const rect = canvas.getBoundingClientRect();
        const joint = targetForRod(rig, drag.base, rod);
        const jointClientX = rect.left + (joint.x / canvas.width) * rect.width;
        const jointClientY = rect.top + (joint.y / canvas.height) * rect.height;
        const rodAngle = Math.atan2(drag.cy + drag.dy - jointClientY, drag.cx + drag.dx - jointClientX);
        const next = armRotationFromRod(drag.startRot, rest, drag.startRodAngle, rodAngle, drag.base.facing);
        if (applyElbowKneeLinkage(rig, pose, partId.endsWith('L') ? 'L' : 'R', next) === null)
          pose.localRot.set(partId, next);
      }
    } else applyDrag(rig, pose, {kind: 'wrist', chain: rod.chain}, drag.start.x + dx, drag.start.y + dy);
    onPoseChange();
    syncGripPositions();
  }
  function up(ev, rod) {
    const drag = active.get(rod.id);
    if (!drag || drag.pointer !== ev.pointerId) return;
    const pose = getPose();
    if (pose) {
      pose.rodEnds = {
        ...(pose.rodEnds || {}),
        [rod.id]: canvasForClientEnd(drag.cx + drag.dx, drag.cy + drag.dy),
      };
    }
    active.delete(rod.id);
    const grip = grips.get(rod.id);
    grip.classList.remove('dragging');
    if (grip.hasPointerCapture(ev.pointerId)) grip.releasePointerCapture(ev.pointerId);
    syncGripPositions();
  }
  function cancelDrags() {
    for (const [id, drag] of [...active]) up({pointerId: drag.pointer}, rods.find((r) => r.id === id));
  }
  const turn = document.getElementById('rodTurn');
  turn.addEventListener('input', () => {
    if (mode !== 'rods' || !visible) return;
    cancelDrags();
    const pose = getPose();
    if (!pose) return;
    const facing = Number(turn.value) < 0 ? -1 : 1;
    if (pose.facing !== facing) {
      pose.rodEnds = Object.fromEntries(
        Object.entries(pose.rodEnds || {}).map(([id, point]) => [id, {x: canvas.width - point.x, y: point.y}]),
      );
      pose.facing = facing;
      onPoseChange();
    }
  });
  turn.addEventListener('change', () => {
    turn.value = getPose()?.facing === -1 ? -100 : 100;
  });
  function syncGripPositions() {
    const hidden = mode !== 'rods' || !visible;
    svg.style.display = hidden ? 'none' : '';
    if (hidden) return;
    const rig = getRig(),
      pose = getPose();
    if (!rig || !pose) return;
    // Rebuild if preset/parts changed (e.g. first load)
    const want = rodsForRig(rig)
      .map((r) => r.id)
      .join(',');
    const have = rods.map((r) => r.id).join(',');
    if (want !== have) rebuildRods();
    const c = canvas.getBoundingClientRect(),
      r = railEl.getBoundingClientRect(),
      box = column.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    for (const rod of rods) {
      const grip = grips.get(rod.id),
        drag = active.get(rod.id),
        resting = clientForCanvasEnd(canvasEndForRod(pose, rod));
      const gx = drag ? drag.cx + drag.dx : resting.x,
        gy = drag ? drag.cy + drag.dy : resting.y;
      grip.style.left = gx - r.left + 'px';
      grip.style.top = gy - r.top - 20 + 'px';
      const joint = targetForRod(rig, pose, rod),
        line = lines.get(rod.id);
      const jointX = c.left + (joint.x / canvas.width) * c.width;
      const jointY = c.top + (joint.y / canvas.height) * c.height;
      const t = Math.max(0, Math.min(1, (c.bottom - jointY) / Math.max(1, gy - jointY)));
      line.setAttribute('x1', jointX + (gx - jointX) * t - box.left);
      line.setAttribute('y1', jointY + (gy - jointY) * t - box.top);
      line.setAttribute('x2', gx - box.left);
      line.setAttribute('y2', gy - box.top);
      // The physical reference has two clear rods permanently visible from
      // below the puppet to the left/right arm-root pivots. Keep those rods
      // visible at rest; strengthen the active one while it is being moved.
      const isArmRod = rod.kind === 'arm';
      line.setAttribute('opacity', drag ? '.82' : isArmRod ? '.42' : '0');
      line.setAttribute('stroke-width', drag ? (isArmRod ? '11' : '5') : (isArmRod ? '9' : '3'));
    }
    if (document.activeElement !== turn) turn.value = pose.facing === -1 ? -100 : 100;
    turn.setAttribute('aria-valuetext', pose.facing === -1 ? '面向左邊' : '面向右邊');
  }
  function setMode(next) {
    cancelDrags();
    mode = next === 'joints' ? 'joints' : 'rods';
    railEl.hidden = mode !== 'rods';
    turn.closest('label').hidden = mode !== 'rods';
    syncGripPositions();
  }
  function setVisible(next) {
    if (!next) cancelDrags();
    visible = next;
    svg.style.display = !next || mode !== 'rods' ? 'none' : '';
  }
  function resetGripPositions() {
    cancelDrags();
    const pose = getPose();
    if (pose) pose.rodEnds = {};
    syncGripPositions();
  }
  window.addEventListener('blur', cancelDrags);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelDrags();
  });
  new ResizeObserver(() => {
    cancelDrags();
    syncGripPositions();
  }).observe(column);
  return {
    setMode,
    getMode: () => mode,
    setVisible,
    syncGripPositions,
    cancelDrags,
    isDragging: () => active.size > 0,
    rebuildRods,
    resetGripPositions,
    getCanvasRods() {
      const pose = getPose(), rig = getRig();
      if (!pose || !rig || mode !== 'rods' || !visible) return [];
      const overrides = {};
      for (const rod of rods) {
        const drag = active.get(rod.id);
        overrides[rod.id] = drag
          ? canvasForClientEnd(drag.cx + drag.dx, drag.cy + drag.dy)
          : canvasEndForRod(pose, rod);
      }
      return rodSegmentsForPose(rig, pose, canvas.width, canvas.height, overrides)
        .map((segment) => ({...segment, active: active.has(segment.id)}));
    },
  };
}
