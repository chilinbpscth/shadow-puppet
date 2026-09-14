import {openDb} from './colorStorage.js';
import {defaultCharacter, getCharacter} from './characters.js';

export const ASSET_VERSION = defaultCharacter().assetVersion;

export function emptyProject(characterId) {
  const ch = getCharacter(characterId) || defaultCharacter();
  return {
    id: 'current',
    schemaVersion: 1,
    assetVersion: ch.assetVersion,
    characterId: ch.id,
    title: '我的西遊記',
    poses: [null, null, null],
    coloredPartIds: [],
    updatedAt: Date.now(),
  };
}

export async function readProject() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects');
    const r = tx.objectStore('projects').get('current');
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}

export async function updateProject(patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const st = tx.objectStore('projects');
    let value;
    const r = st.get('current');
    r.onsuccess = () => {
      const base = r.result || emptyProject(patch?.characterId);
      value = {
        ...base,
        ...patch,
        updatedAt: Date.now(),
      };
      // Keep assetVersion in sync when characterId changes without explicit assetVersion
      if (patch?.characterId && !patch.assetVersion) {
        const ch = getCharacter(patch.characterId);
        if (ch) value.assetVersion = ch.assetVersion;
      }
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

export async function archiveAndStart(nextCharacterId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'coloredParts'], 'readwrite');
    const projects = tx.objectStore('projects');
    const parts = tx.objectStore('coloredParts');
    const a = projects.get('current');
    const b = parts.getAll();
    let project;
    let colors;
    const finish = () => {
      if (project === undefined || colors === undefined) return;
      const currentId = project?.characterId || 'wukong-v2';
      // Archive only the active character's colors (legacy wukong paired with wukong-v2).
      // Do NOT delete other characters' coloredParts rows.
      const toArchive = colors.filter((x) => x.characterId === currentId || (currentId.startsWith('wukong') && ['wukong', 'wukong-v2'].includes(x.characterId)));
      projects.put({
        id: 'archive-' + Date.now(),
        project: project || emptyProject(),
        colors: toArchive,
        updatedAt: Date.now(),
      });
      for (const row of toArchive) parts.delete([row.characterId, row.partId]);
      projects.put(emptyProject(nextCharacterId));
    };
    a.onsuccess = () => {
      project = a.result || null;
      finish();
    };
    b.onsuccess = () => {
      colors = b.result;
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
    const tx = db.transaction('projects');
    const r = tx.objectStore('projects').getAll();
    r.onsuccess = () =>
      resolve(
        r.result
          .filter((x) => x.id.startsWith('archive-'))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}

export async function restoreArchive(archive) {
  await archiveAndStart(archive?.project?.characterId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'coloredParts'], 'readwrite');
    tx.objectStore('projects').put({...archive.project, id: 'current'});
    for (const row of archive.colors) tx.objectStore('coloredParts').put(row);
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
