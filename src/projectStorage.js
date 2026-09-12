import { openDb } from "./colorStorage.js";
export const ASSET_VERSION = "wukong-profile-v2";
export function emptyProject() {
  return {
    id: "current",
    schemaVersion: 1,
    assetVersion: ASSET_VERSION,
    characterId: "wukong-v2",
    title: "我的西遊記",
    poses: [null, null, null],
    coloredPartIds: [],
    updatedAt: Date.now(),
  };
}
export async function readProject() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects");
    const r = tx.objectStore("projects").get("current");
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function updateProject(patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    const st = tx.objectStore("projects");
    let value;
    const r = st.get("current");
    r.onsuccess = () => {
      value = {
        ...(r.result || emptyProject()),
        ...patch,
        updatedAt: Date.now(),
      };
      st.put(value);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function archiveAndStart() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "coloredParts"], "readwrite");
    const projects = tx.objectStore("projects"),
      parts = tx.objectStore("coloredParts");
    const a = projects.get("current"),
      b = parts.getAll();
    let project, colors;
    const finish = () => {
      if (project === undefined || colors === undefined) return;
      projects.put({
        id: "archive-" + Date.now(),
        project: project || emptyProject(),
        colors,
        updatedAt: Date.now(),
      });
      for (const row of colors) parts.delete([row.characterId, row.partId]);
      projects.put(emptyProject());
    };
    a.onsuccess = () => {
      project = a.result || null;
      finish();
    };
    b.onsuccess = () => {
      colors = b.result.filter((x) => ["wukong", "wukong-v2"].includes(x.characterId));
      finish();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function getArchives() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects");
    const r = tx.objectStore("projects").getAll();
    r.onsuccess = () =>
      resolve(
        r.result
          .filter((x) => x.id.startsWith("archive-"))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function restoreArchive(archive) {
  await archiveAndStart();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "coloredParts"], "readwrite");
    tx.objectStore("projects").put({ ...archive.project, id: "current" });
    for (const row of archive.colors) tx.objectStore("coloredParts").put(row);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
// Normalized coordinates preserve framing independently of display size.
export function encodePose(p, w, h) {
  return {
    facing: p.facing === -1 ? -1 : 1,
    x: p.rootX / w,
    y: p.rootY / h,
    scale: p.scale / Math.min(w, h),
    rotations: Object.fromEntries(p.localRot),
  };
}
export function decodePose(p, w, h) {
  return {
    facing: p.facing === -1 ? -1 : 1,
    rootX: p.x * w,
    rootY: p.y * h,
    scale: p.scale * Math.min(w, h),
    localRot: new Map(Object.entries(p.rotations)),
  };
}
