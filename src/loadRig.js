import {readProject} from './projectStorage.js';
import {loadProfileRig} from './profileRig.js';
import {isProfileAssetVersion, getCharacter} from './characters.js';
import {loadAllColoredParts, blobToImage} from './colorStorage.js';

const RIG_URL = './characters/wukong/rig.json';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}

/**
 * @param {string} [rigUrl]
 * @param {{ applyColored?: boolean, characterId?: string }} [opts]
 */
export async function loadRig(rigUrl, opts = {}) {
  const applyColored = opts.applyColored !== false;
  if (!rigUrl) {
    const project = await readProject();
    if (project && isProfileAssetVersion(project.assetVersion)) {
      return loadProfileRig(applyColored, project.characterId || getCharacterByHint(project));
    }
    if (project?.characterId && getCharacter(project.characterId)) {
      return loadProfileRig(applyColored, project.characterId);
    }
    if (!project) {
      const legacy = await loadRig(RIG_URL, opts);
      return legacy.hasColored ? legacy : loadProfileRig(applyColored, 'wukong-v2');
    }
    rigUrl = RIG_URL;
  }
  const res = await fetch(rigUrl);
  if (!res.ok) throw new Error(`無法載入 rig：${res.status} ${rigUrl}`);
  const rig = await res.json();
  const base = rigUrl.replace(/[^/]+$/, '');
  const images = new Map();

  await Promise.all(
    (rig.parts || []).map(async (part) => {
      const src = part.src.startsWith('/') ? part.src : `${base}${part.src}`;
      const img = await loadImage(src);
      images.set(part.id, img);
      if (!part.width) part.width = img.naturalWidth;
      if (!part.height) part.height = img.naturalHeight;
    }),
  );

  let coloredPartIds = [];
  if (applyColored) {
    try {
      const partIds = (rig.parts || []).map((p) => p.id);
      const blobs = await loadAllColoredParts(rig.id || 'wukong', partIds);
      await Promise.all(
        [...blobs.entries()].map(async ([partId, blob]) => {
          const img = await blobToImage(blob);
          images.set(partId, img);
          coloredPartIds.push(partId);
        }),
      );
    } catch (err) {
      console.warn('載入填色失敗，改用示範剪影', err);
    }
  }

  return {rig, images, coloredPartIds, hasColored: coloredPartIds.length > 0};
}

function getCharacterByHint(project) {
  return project?.characterId || 'wukong-v2';
}
