/**
 * MediaPipe Pose Landmarker (lite) — image landmarks, VIDEO mode.
 * Assets pinned under public/mediapipe/ for GitHub Pages (see VERSION.txt).
 */

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

/** Relative to site root (vite base: "./"). */
export const MEDIAPIPE_WASM_PATH = "./mediapipe/wasm";
export const MEDIAPIPE_MODEL_PATH = "./mediapipe/pose_landmarker_lite.task";
export const MEDIAPIPE_VERSION = "tasks-vision@1.0.1 + pose_landmarker_lite float16/1";

/**
 * @returns {Promise<import("@mediapipe/tasks-vision").PoseLandmarker>}
 */
export async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  const common = {
    runningMode: "VIDEO",
    numPoses: 1,
  };
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_PATH,
        delegate: "GPU",
      },
    });
  } catch (err) {
    console.warn("Pose GPU init failed, falling back to CPU", err);
    return PoseLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_PATH,
        delegate: "CPU",
      },
    });
  }
}
