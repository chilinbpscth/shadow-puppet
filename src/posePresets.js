/**
 * Readable mission pose presets: 出發 / 遇險 / 迎戰.
 * localRot values are absolute local rotations (radians), same as createManualPose.
 * Limb images point distal along +Y; rotation 0 = down.
 */

import { createManualPose, applyPose } from './dragPose.js';

/** @typedef {{ id: string, title: string, missionIndex: number, localRot: Record<string, number>, rootOffset?: { x: number, y: number }, silhouette: string }} PosePreset */

/** @type {PosePreset[]} */
export const POSE_PRESETS = [
  {
    id: 'depart',
    title: '出發',
    missionIndex: 0,
    // Stride + opposing arm swing; limbs spread so silhouette reads as setting off
    localRot: {
      torso: 0.04,
      head: -0.06,
      upperArmL: 1.95, // back swing
      lowerArmL: 0.35,
      upperArmR: -0.45, // forward swing
      lowerArmR: -0.85,
      thighL: 0.55, // rear leg
      shinL: 0.22,
      thighR: -0.65, // lead leg
      shinR: 0.1,
      tail: 0.7,
      staff: 0.4,
    },
    rootOffset: { x: -12, y: 8 },
    silhouette: 'depart',
  },
  {
    id: 'danger',
    title: '遇險',
    missionIndex: 1,
    // Reactive / startled: arms raised, knees bent, slight recoil
    localRot: {
      torso: -0.05,
      head: 0.12,
      upperArmL: 2.1,
      lowerArmL: 0.55,
      upperArmR: -2.1,
      lowerArmR: -0.5,
      thighL: 0.38,
      shinL: 0.65,
      thighR: -0.36,
      shinR: -0.6,
      tail: 0.35,
      staff: -0.35,
    },
    rootOffset: { x: 6, y: 28 },
    silhouette: 'danger',
  },
  {
    id: 'battle',
    title: '迎戰',
    missionIndex: 2,
    // Ready stance, staff-forward (right arm raised)
    localRot: {
      torso: 0.05,
      head: -0.04,
      upperArmL: 0.95, // guard
      lowerArmL: 0.55,
      upperArmR: -2.15, // staff arm up/forward
      lowerArmR: -0.25,
      thighL: 0.45,
      shinL: 0.18,
      thighR: -0.48,
      shinR: 0.06,
      tail: 0.6,
      staff: -1.0,
    },
    rootOffset: { x: 4, y: 4 },
    silhouette: 'battle',
  },
];

/**
 * @param {string | number} key mission index or preset id
 * @returns {PosePreset | null}
 */
export function getPreset(key) {
  if (typeof key === 'number') {
    return POSE_PRESETS.find((p) => p.missionIndex === key) || null;
  }
  return POSE_PRESETS.find((p) => p.id === key) || null;
}

/**
 * Build a full pose object from a preset (does not mutate shared state).
 * @param {object} rig
 * @param {{ cx: number, cy: number, scale?: number }} layout
 * @param {PosePreset} preset
 */
export function buildPresetPose(rig, layout, preset) {
  const pose = createManualPose(rig, layout);
  pose.rootX = layout.cx + (preset.rootOffset?.x || 0);
  pose.rootY = layout.cy + (preset.rootOffset?.y || 0);
  if (rig.profile) {
    const offsets = [
      {torso:.03,upperArmL:-.12,lowerArmL:-.15,upperArmR:-.15,lowerArmR:.1,thighL:.18,thighR:-.16,shinL:.1},
      {torso:-.13,head:-.08,upperArmL:1.35,lowerArmL:.55,upperArmR:-.85,lowerArmR:-.35,thighL:.18,shinL:.35,thighR:-.14,shinR:-.25},
      {torso:.05,upperArmL:.35,lowerArmL:.5,upperArmR:-1.1,lowerArmR:.45,thighL:.2,thighR:-.18,shinL:.08,shinR:-.08},
    ][preset.missionIndex];
    for (const [id, delta] of Object.entries(offsets)) pose.localRot.set(id,(pose.localRot.get(id)||0)+delta);
  } else {
    for (const [id, rot] of Object.entries(preset.localRot)) pose.localRot.set(id, rot);
  }
  return pose;
}

/**
 * Apply preset into existing manual pose (shared state).
 * @param {ReturnType<typeof createManualPose>} target
 * @param {object} rig
 * @param {{ cx: number, cy: number, scale?: number }} layout
 * @param {string | number} key
 */
export function applyPreset(target, rig, layout, key) {
  const preset = getPreset(key);
  if (!preset) return false;
  const built = buildPresetPose(rig, layout, preset);
  applyPose(target, built);
  return true;
}
