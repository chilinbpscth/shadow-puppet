/**
 * MediaPipe Pose Landmarker (lite) — image landmarks, VIDEO mode.
 * Assets pinned under public/mediapipe/ for GitHub Pages (see VERSION.txt).
 * Dynamic-import tasks-vision so static preview does not pull the big bundle.
 */

/** Absolute URLs relative to the document (Pages base), NOT import.meta.url. */
function mediapipeUrl(rel) {
  return new URL(rel, document.baseURI).href;
}

export const MEDIAPIPE_VERSION =
  "tasks-vision@1.0.1 + pose_landmarker_lite float16/1";

const GPU_INIT_TIMEOUT_MS = 8000;

/**
 * @returns {Promise<import("@mediapipe/tasks-vision").PoseLandmarker>}
 */
export async function createPoseLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );

  const wasmPath = mediapipeUrl("mediapipe/wasm");
  const modelPath = mediapipeUrl("mediapipe/pose_landmarker_lite.task");

  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  const common = {
    runningMode: "VIDEO",
    numPoses: 1,
  };

  const create = (delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: {
        modelAssetPath: modelPath,
        delegate,
      },
    });

  try {
    return await Promise.race([
      create("GPU"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("GPU Pose init timeout")),
          GPU_INIT_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.warn("Pose GPU init failed/timeout, falling back to CPU", err);
    return create("CPU");
  }
}
