/**
 * Load character rig.json and part PNG images.
 */

const RIG_URL = '/characters/wukong/rig.json';

/**
 * @param {string} [rigUrl]
 * @returns {Promise<{ rig: object, images: Map<string, HTMLImageElement> }>}
 */
export async function loadRig(rigUrl = RIG_URL) {
  const res = await fetch(rigUrl);
  if (!res.ok) {
    throw new Error(`無法載入 rig：${res.status} ${rigUrl}`);
  }
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

  return { rig, images };
}

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}
