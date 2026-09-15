import { drawPuppet } from "./drawPuppet.js";
import { resolveManualJoints } from "./dragPose.js";
export function renderArtwork(rig, images, pose, width = 900, height = 720) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  // Keep cream backdrop for printable 三格 PNG (classroom worksheets);
  // solo/live stage canvas uses theatrical framed screen instead.
  drawPuppet(c.getContext("2d"), rig, images, {
    joints: resolveManualJoints(rig, pose),
    scale: pose.scale,
    backdrop: "cream",
  });
  return c;
}
export async function downloadCanvas(canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("未能匯出圖片，請重試");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
