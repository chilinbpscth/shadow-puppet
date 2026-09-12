import {clonePose} from './dragPose.js';

// Touch teaching aid: the rod displacement drives the step; no timer/autoplay.
export function moveBodyRod(rig, base, dx, dy) {
  const pose = clonePose(base);
  pose.rootX += dx;
  pose.rootY += dy;
  if (!rig.profile) return pose;
  const phase = dx * (base.facing || 1) / (95 * base.scale) * Math.PI;
  const stride = Math.sin(phase) * .3;
  const lift = Math.min(.2, Math.max(0, -dy) / 170);
  for (const [id, delta] of Object.entries({
    thighL: stride, thighR: -stride,
    shinL: Math.max(0,-stride) + lift,
    shinR: Math.max(0,stride) + lift,
    tail: -Math.sin(phase) * .06,
  })) pose.localRot.set(id, (base.localRot.get(id) || 0) + delta);
  return pose;
}
