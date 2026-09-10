/**
 * Manual drag pose: fixed bone lengths, parent carries children.
 * Handles: torso (translate), wrists / ankles (2-bone IK).
 */

const HANDLE_HIT_PX = 44;

/**
 * @typedef {{ x: number, y: number, rotation: number }} Joint
 * @typedef {{ id: string, kind: 'torso' | 'wrist' | 'ankle', x: number, y: number, chain?: string[] }} Handle
 */

/**
 * @param {object} rig
 * @param {{ cx: number, cy: number, scale?: number }} layout
 */
export function createManualPose(rig, layout) {
  const scale = layout.scale ?? 1;
  const localRot = new Map();
  for (const part of rig.parts) {
    const dp = part.defaultPose || {};
    localRot.set(part.id, dp.rotation || 0);
  }
  return {
    rootX: layout.cx,
    rootY: layout.cy,
    scale,
    localRot,
  };
}

/**
 * Clone pose state (for save slots).
 */
export function clonePose(pose) {
  return {
    rootX: pose.rootX,
    rootY: pose.rootY,
    scale: pose.scale,
    localRot: new Map(pose.localRot),
  };
}

/**
 * Restore into an existing pose object.
 */
export function applyPose(target, saved) {
  target.rootX = saved.rootX;
  target.rootY = saved.rootY;
  target.scale = saved.scale;
  target.localRot = new Map(saved.localRot);
}

/**
 * Resolve absolute joints from manual pose (same shape as resolvePose / bindPose).
 * @returns {Map<string, Joint & { part: object }>}
 */
export function resolveManualJoints(rig, pose) {
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const solved = new Map();
  const { rootX, rootY, scale, localRot } = pose;

  function solve(id, visiting = new Set()) {
    if (solved.has(id)) return solved.get(id);
    if (visiting.has(id)) throw new Error(`circular parent: ${id}`);
    visiting.add(id);
    const part = byId.get(id);
    if (!part) throw new Error(`missing part: ${id}`);
    const dp = part.defaultPose || { x: 0, y: 0, rotation: 0, parent: null };

    let parentX = rootX;
    let parentY = rootY;
    let parentRot = 0;
    if (dp.parent) {
      const parent = solve(dp.parent, visiting);
      parentX = parent.x;
      parentY = parent.y;
      parentRot = parent.rotation;
    }

    const ox = (dp.x || 0) * scale;
    const oy = (dp.y || 0) * scale;
    const cos = Math.cos(parentRot);
    const sin = Math.sin(parentRot);
    const x = parentX + ox * cos - oy * sin;
    const y = parentY + ox * sin + oy * cos;
    const local = localRot.has(id) ? localRot.get(id) : dp.rotation || 0;
    const rotation = parentRot + local;

    const node = { x, y, rotation, part };
    solved.set(id, node);
    visiting.delete(id);
    return node;
  }

  for (const part of rig.parts) solve(part.id);
  return solved;
}

/**
 * Distal tip of a limb segment in canvas space (wrist / ankle).
 */
export function distalTip(node, scale) {
  const part = node.part;
  const w = (part.width || 0) * scale;
  const h = (part.height || 0) * scale;
  const px = (part.pivot?.x ?? 0.5) * w;
  const py = (part.pivot?.y ?? 0.5) * h;
  const localDx = w * 0.5 - px;
  const localDy = h - py;
  const cos = Math.cos(node.rotation);
  const sin = Math.sin(node.rotation);
  return {
    x: node.x + localDx * cos - localDy * sin,
    y: node.y + localDx * sin + localDy * cos,
  };
}

function childOffsetLength(rig, childId, scale) {
  const part = rig.parts.find((p) => p.id === childId);
  if (!part) return 100 * scale;
  const dp = part.defaultPose || {};
  return Math.hypot((dp.x || 0) * scale, (dp.y || 0) * scale) || 100 * scale;
}

function selfBoneLength(part, scale) {
  const h = (part.height || 140) * scale;
  const py = (part.pivot?.y ?? 0.12) * h;
  return Math.max(20, h - py);
}

/**
 * Visible drag handles for classroom use.
 * @returns {Handle[]}
 */
export function getHandles(rig, pose, joints) {
  const scale = pose.scale;
  const handles = [];

  const torso = joints.get('torso');
  if (torso) {
    handles.push({ id: 'torso', kind: 'torso', x: torso.x, y: torso.y - 40 * scale });
  }

  const chains = [
    { kind: 'wrist', upper: 'upperArmL', lower: 'lowerArmL' },
    { kind: 'wrist', upper: 'upperArmR', lower: 'lowerArmR' },
    { kind: 'ankle', upper: 'thighL', lower: 'shinL' },
    { kind: 'ankle', upper: 'thighR', lower: 'shinR' },
  ];

  for (const c of chains) {
    const lower = joints.get(c.lower);
    if (!lower) continue;
    const tip = distalTip(lower, scale);
    handles.push({
      id: c.lower + '-tip',
      kind: c.kind,
      x: tip.x,
      y: tip.y,
      chain: [c.upper, c.lower],
    });
  }

  return handles;
}

/**
 * Hit-test handles; prefer nearest within HANDLE_HIT_PX.
 * @returns {Handle | null}
 */
export function hitTestHandle(handles, x, y, hitPx = HANDLE_HIT_PX) {
  let best = null;
  let bestD = hitPx;
  for (const h of handles) {
    const d = Math.hypot(h.x - x, h.y - y);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/**
 * Apply a drag target to the manual pose.
 */
export function applyDrag(rig, pose, handle, x, y, dragMeta = {}) {
  if (handle.kind === 'torso') {
    const sx = dragMeta.startRootX ?? pose.rootX;
    const sy = dragMeta.startRootY ?? pose.rootY;
    const px = dragMeta.startPtrX ?? x;
    const py = dragMeta.startPtrY ?? y;
    pose.rootX = sx + (x - px);
    pose.rootY = sy + (y - py);
    return;
  }

  if ((handle.kind === 'wrist' || handle.kind === 'ankle') && handle.chain) {
    twoBoneIk(rig, pose, handle.chain[0], handle.chain[1], x, y);
  }
}

/**
 * 2-bone IK with fixed lengths. Limb images: distal along +Y local
 * → absolute heading = rotation + PI/2 → rotation = heading - PI/2.
 */
function twoBoneIk(rig, pose, upperId, lowerId, tx, ty) {
  const joints = resolveManualJoints(rig, pose);
  const upper = joints.get(upperId);
  const lowerPart = rig.parts.find((p) => p.id === lowerId);
  const upperPart = rig.parts.find((p) => p.id === upperId);
  if (!upper || !lowerPart || !upperPart) return;

  const scale = pose.scale;
  const L1 = childOffsetLength(rig, lowerId, scale);
  const L2 = selfBoneLength(lowerPart, scale);
  const ox = upper.x;
  const oy = upper.y;

  let dx = tx - ox;
  let dy = ty - oy;
  let dist = Math.hypot(dx, dy);
  const minD = Math.abs(L1 - L2) + 2;
  const maxD = L1 + L2 - 2;
  if (dist < 1e-3) {
    dx = 0;
    dy = 1;
    dist = 1;
  }
  const reach = clamp(dist, minD, maxD);
  const scaleReach = reach / dist;
  const tx2 = ox + dx * scaleReach;
  const ty2 = oy + dy * scaleReach;
  dx = tx2 - ox;
  dy = ty2 - oy;
  dist = reach;

  let cosShoulder = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  cosShoulder = clamp(cosShoulder, -1, 1);
  const shoulderOffset = Math.acos(cosShoulder);

  const targetAngle = Math.atan2(dy, dx);
  const prevLower = pose.localRot.get(lowerId) ?? 0;
  const bendSign = prevLower >= 0 ? 1 : -1;

  const headingUpper = targetAngle - bendSign * shoulderOffset;
  const parentRot = upperParentRotation(rig, pose, upperId);
  const absUpperRot = headingUpper - Math.PI / 2;
  pose.localRot.set(upperId, absUpperRot - parentRot);

  const newJoints = resolveManualJoints(rig, pose);
  const newUpper = newJoints.get(upperId);
  if (!newUpper) return;

  const dp = lowerPart.defaultPose || {};
  const cox = (dp.x || 0) * scale;
  const coy = (dp.y || 0) * scale;
  const ucos = Math.cos(newUpper.rotation);
  const usin = Math.sin(newUpper.rotation);
  const elbowX = newUpper.x + cox * ucos - coy * usin;
  const elbowY = newUpper.y + cox * usin + coy * ucos;

  const hx = tx2 - elbowX;
  const hy = ty2 - elbowY;
  const headingLower = Math.atan2(hy, hx);
  const absLowerRot = headingLower - Math.PI / 2;
  pose.localRot.set(lowerId, absLowerRot - newUpper.rotation);
}

function upperParentRotation(rig, pose, upperId) {
  const part = rig.parts.find((p) => p.id === upperId);
  const parentId = part?.defaultPose?.parent;
  if (!parentId) return 0;
  const joints = resolveManualJoints(rig, pose);
  return joints.get(parentId)?.rotation ?? 0;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export { HANDLE_HIT_PX };
