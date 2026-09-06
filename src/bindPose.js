/**
 * Bind MediaPipe image landmarks to puppet part transforms (DESIGN.md P4).
 *
 * Mirroring policy: selfie mirror — landmark.x becomes (1 - x) so preview
 * and puppet share the same horizontal flip (see main.js drawCameraBg).
 */

const VIS_HOLD = 0.5;
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.4;
/** Reference shoulder–hip distance in canvas px at scale=1 (approx torso). */
const REF_SHOULDER_HIP = 200;
const EMA_LM = 0.45;
const EMA_ANGLE = 0.4;

/**
 * @typedef {{ x: number, y: number, visibility?: number }} Lm
 * @typedef {{ x: number, y: number, rotation: number }} Joint
 */

/**
 * @param {Lm[] | undefined} landmarks
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {{ mirror?: boolean, prevSmooth?: Lm[] | null, prevJoints?: Map<string, Joint> | null, prevAngles?: Map<string, number> | null }} [opts]
 */
export function bindPoseFromLandmarks(rig, landmarks, layout, opts = {}) {
  const mirror = opts.mirror !== false;
  const prevSmooth = opts.prevSmooth || null;
  const prevJoints = opts.prevJoints || null;
  const prevAngles = opts.prevAngles || new Map();

  if (!landmarks || landmarks.length < 29 || !layout) {
    return {
      joints: prevJoints ? new Map(prevJoints) : null,
      smooth: prevSmooth,
      angles: prevAngles,
      globalScale: opts.prevScale ?? 1,
      ok: false,
    };
  }

  const smooth = smoothLandmarks(landmarks, prevSmooth, EMA_LM);
  const pts = projectLandmarks(smooth, layout, mirror);

  const shoulderMid = mid(pts[11], pts[12]);
  const hipMid = mid(pts[23], pts[24]);

  let globalScale = 1;
  if (shoulderMid && hipMid) {
    const dist = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
    if (dist > 1) {
      globalScale = clamp(dist / REF_SHOULDER_HIP, SCALE_MIN, SCALE_MAX);
    }
  }
  if (opts.prevScale != null && !Number.isNaN(opts.prevScale)) {
    globalScale = globalScale * 0.35 + opts.prevScale * 0.65;
    globalScale = clamp(globalScale, SCALE_MIN, SCALE_MAX);
  }

  const derived = { shoulderMid, hipMid };
  const joints = new Map();
  const angles = new Map();

  for (const part of rig.parts) {
    if (part.poseFollow === false) {
      // tail: hang from hipMid
      if (part.id === 'tail' && hipMid) {
        const dp = part.defaultPose || {};
        const ox = (dp.x || 40) * globalScale * 0.35;
        const oy = (dp.y || -10) * globalScale * 0.35;
        const torsoAng = angles.get('torso') ?? 0;
        const cos = Math.cos(torsoAng);
        const sin = Math.sin(torsoAng);
        const rot = torsoAng + (dp.rotation ?? 0.55);
        const sm = emaAngle(prevAngles.get(part.id), rot, EMA_ANGLE);
        angles.set(part.id, sm);
        joints.set(part.id, {
          x: hipMid.x + ox * cos - oy * sin,
          y: hipMid.y + ox * sin + oy * cos,
          rotation: sm,
        });
      } else if (prevJoints?.has(part.id)) {
        joints.set(part.id, { ...prevJoints.get(part.id) });
      }
      continue;
    }

    const binding = part.binding || {};
    const fromLm = resolveLandmark(binding.fromLandmark, pts, derived);
    const toLm = resolveLandmark(binding.toLandmark, pts, derived);

    // staff: only wrist; angle along forearm 14→16
    if (part.id === 'staff') {
      const wrist = fromLm;
      if (!wrist || !visibleEnough(smooth, 16, mirror)) {
        if (prevJoints?.has(part.id)) joints.set(part.id, { ...prevJoints.get(part.id) });
        continue;
      }
      const elbow = pts[14];
      let rot = prevAngles.get(part.id) ?? 0.2;
      if (elbow && visibleEnough(smooth, 14, mirror)) {
        rot = boneAngle(elbow, wrist, part);
      }
      rot = emaAngle(prevAngles.get(part.id), rot, EMA_ANGLE);
      angles.set(part.id, rot);
      joints.set(part.id, { x: wrist.x, y: wrist.y, rotation: rot });
      continue;
    }

    if (!fromLm || !toLm) {
      if (prevJoints?.has(part.id)) joints.set(part.id, { ...prevJoints.get(part.id) });
      continue;
    }

    // visibility hold on endpoint indices when numeric
    if (!pairVisible(binding, smooth, mirror)) {
      if (prevJoints?.has(part.id)) joints.set(part.id, { ...prevJoints.get(part.id) });
      continue;
    }

    let rot = boneAngle(fromLm, toLm, part);
    rot = emaAngle(prevAngles.get(part.id), rot, EMA_ANGLE);
    angles.set(part.id, rot);
    joints.set(part.id, { x: fromLm.x, y: fromLm.y, rotation: rot });
  }

  // second pass: tail after torso angle known
  const tail = rig.parts.find((p) => p.id === 'tail');
  if (tail && hipMid && !joints.has('tail')) {
    const dp = tail.defaultPose || {};
    const ox = (dp.x || 40) * globalScale * 0.35;
    const oy = (dp.y || -10) * globalScale * 0.35;
    const torsoAng = angles.get('torso') ?? 0;
    const cos = Math.cos(torsoAng);
    const sin = Math.sin(torsoAng);
    const rot = emaAngle(prevAngles.get('tail'), torsoAng + (dp.rotation ?? 0.55), EMA_ANGLE);
    angles.set('tail', rot);
    joints.set('tail', {
      x: hipMid.x + ox * cos - oy * sin,
      y: hipMid.y + ox * sin + oy * cos,
      rotation: rot,
    });
  }

  return { joints, smooth, angles, globalScale, ok: joints.size > 0 };
}

/**
 * Part images: proximal at pivot. Arms/legs pivot near top → distal along +Y
 * (angle = atan2 - PI/2). Torso/head pivot near bottom → distal along -Y
 * (angle = atan2 + PI/2).
 */
function boneAngle(from, to, part) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const heading = Math.atan2(dy, dx);
  const py = part.pivot?.y ?? 0.5;
  if (py > 0.5) {
    return heading + Math.PI / 2;
  }
  return heading - Math.PI / 2;
}

function resolveLandmark(key, pts, derived) {
  if (key == null) return null;
  if (key === 'shoulderMid') return derived.shoulderMid;
  if (key === 'hipMid') return derived.hipMid;
  if (typeof key === 'number') return pts[key] || null;
  const n = Number(key);
  if (!Number.isNaN(n)) return pts[n] || null;
  return null;
}

function pairVisible(binding, smooth, mirror) {
  const keys = [binding.fromLandmark, binding.toLandmark];
  for (const k of keys) {
    if (k == null || k === 'shoulderMid' || k === 'hipMid') continue;
    const idx = typeof k === 'number' ? k : Number(k);
    if (!Number.isNaN(idx) && !visibleEnough(smooth, idx, mirror)) return false;
  }
  // derived mids: check both shoulders / hips
  if (binding.fromLandmark === 'shoulderMid' || binding.toLandmark === 'shoulderMid') {
    if (!visibleEnough(smooth, 11, mirror) && !visibleEnough(smooth, 12, mirror)) return false;
  }
  if (binding.fromLandmark === 'hipMid' || binding.toLandmark === 'hipMid') {
    if (!visibleEnough(smooth, 23, mirror) && !visibleEnough(smooth, 24, mirror)) return false;
  }
  return true;
}

function visibleEnough(smooth, idx, _mirror) {
  const p = smooth[idx];
  if (!p) return false;
  const v = p.visibility ?? p.presence ?? 1;
  return v >= VIS_HOLD;
}

function smoothLandmarks(landmarks, prev, alpha) {
  const out = [];
  for (let i = 0; i < landmarks.length; i++) {
    const cur = landmarks[i];
    const p = prev?.[i];
    const vis = cur.visibility ?? cur.presence ?? 1;
    if (vis < VIS_HOLD && p) {
      out.push({ x: p.x, y: p.y, visibility: vis });
      continue;
    }
    if (!p) {
      out.push({ x: cur.x, y: cur.y, visibility: vis });
      continue;
    }
    out.push({
      x: alpha * cur.x + (1 - alpha) * p.x,
      y: alpha * cur.y + (1 - alpha) * p.y,
      visibility: vis,
    });
  }
  return out;
}

/**
 * Map normalized landmarks into canvas pixels using the same cover rect as the video.
 * @param {{ dx: number, dy: number, dw: number, dh: number }} layout
 */
function projectLandmarks(smooth, layout, mirror) {
  const { dx, dy, dw, dh } = layout;
  return smooth.map((p) => {
    if (!p) return null;
    const xN = mirror ? 1 - p.x : p.x;
    return { x: dx + xN * dw, y: dy + p.y * dh, visibility: p.visibility };
  });
}

function mid(a, b) {
  if (!a || !b) return a || b || null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function emaAngle(prev, next, alpha) {
  if (prev == null || Number.isNaN(prev)) return next;
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return prev + alpha * d;
}
