/**
 * Shared IndexedDB for student-colored part PNGs.
 * DB: shadow-puppet · store: coloredParts
 * Key: [characterId, partId] · value: { characterId, partId, pngBlob, updatedAt }
 */

const DB_NAME = 'shadow-puppet';
const DB_VERSION = 2;
const STORE = 'coloredParts';

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('此瀏覽器不支援 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IndexedDB 開啟失敗'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', {keyPath:'id'});
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: ['characterId', 'partId'] });
      }
    };
  });
}

/**
 * @param {string} characterId
 * @param {string} partId
 * @param {Blob} pngBlob
 * @returns {Promise<void>}
 */
export async function saveColoredPart(characterId, partId, pngBlob) {
  const db = await openDb();
  const record = {
    characterId,
    partId,
    pngBlob,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, 'projects'], 'readwrite');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error || new Error('儲存填色失敗'));
    tx.onabort = () => reject(tx.error || new Error('儲存填色已中止'));
    tx.objectStore(STORE).put(record);
    const projects = tx.objectStore('projects');
    const req = projects.get('current');
    req.onsuccess = () => {
      const project = req.result || {id:'current',schemaVersion:1,assetVersion:characterId==='wukong-v2'?'wukong-profile-v2':'wukong-legacy-v1',characterId,title:'我的西遊記',poses:[null,null,null],coloredPartIds:[]};
      project.coloredPartIds = [...new Set([...project.coloredPartIds, partId])];
      project.updatedAt = Date.now();
      projects.put(project);
    };
  });
}

/**
 * @param {string} characterId
 * @param {string} partId
 * @returns {Promise<Blob | null>}
 */
export async function loadColoredPart(characterId, partId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.oncomplete = () => db.close();
    const req = tx.objectStore(STORE).get([characterId, partId]);
    req.onsuccess = () => {
      const row = req.result;
      resolve(row?.pngBlob || null);
    };
    req.onerror = () => reject(req.error || new Error('讀取填色失敗'));
  });
}

/**
 * @param {string} characterId
 * @param {string[]} partIds
 * @returns {Promise<Map<string, Blob>>} partId → pngBlob
 */
export async function loadAllColoredParts(characterId, partIds) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map();
    const tx = db.transaction(STORE, 'readonly');
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => reject(tx.error || new Error('讀取填色失敗'));
    const store = tx.objectStore(STORE);
    for (const partId of partIds) {
      const req = store.get([characterId, partId]);
      req.onsuccess = () => {
        const row = req.result;
        if (row?.pngBlob) out.set(partId, row.pngBlob);
      };
    }
  });
}

/**
 * @param {string} characterId
 * @param {string[]} partIds
 * @returns {Promise<{ count: number, total: number, hasAny: boolean, partIds: string[] }>}
 */
export async function getColorProgress(characterId, partIds) {
  const map = await loadAllColoredParts(characterId, partIds);
  const ids = [...map.keys()];
  return {
    count: ids.length,
    total: partIds.length,
    hasAny: ids.length > 0,
    partIds: ids,
  };
}

/**
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement>}
 */
export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('填色圖載入失敗'));
    };
    img.src = url;
  });
}
