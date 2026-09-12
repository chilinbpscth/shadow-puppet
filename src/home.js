import {
  readProject,
  updateProject,
  archiveAndStart,
  getArchives,
  restoreArchive,
} from "./projectStorage.js";
import { loadRig } from "./loadRig.js";
import { createManualPose } from "./dragPose.js";
import { renderArtwork, downloadCanvas } from "./exportArtwork.js";
const status = document.getElementById("homeStatus"),
  dialog = document.getElementById("newDialog");
const run = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    status.textContent = "未能完成：" + e.message;
  }
};
let existing = false;
document.getElementById("start").disabled = true;
document.getElementById("start").onclick = run(async () => {
  if (existing) dialog.showModal();
  else {
    await updateProject({});
    location.href = "./color.html";
  }
});
document.getElementById("cancelNew").onclick = () => dialog.close();
document.getElementById("archiveStart").onclick = run(async () => {
  await archiveAndStart();
  location.href = "./color.html";
});
document.getElementById("oldDownload").onclick = run(async () => {
  const { rig, images } = await loadRig();
  await downloadCanvas(
    renderArtwork(
      rig,
      images,
      createManualPose(rig, { cx: 450, cy: 375, scale: 0.8 }),
    ),
    "舊影偶.png",
  );
});
async function init() {
  try {
    const project = await readProject();
    const loaded = await loadRig();
    existing = !!project || loaded.hasColored;
    document.getElementById("start").disabled = false;
    document.getElementById("continue").hidden = !existing;
    const archives = await getArchives();
    if (archives.length) {
      const b = document.getElementById("restore");
      b.hidden = false;
      b.onclick = run(async () => {
        await restoreArchive(archives[0]);
        location.href = "./color.html";
      });
    }
  } catch (e) {
    status.textContent = "未能讀取作品：" + e.message;
  }
}
init();
