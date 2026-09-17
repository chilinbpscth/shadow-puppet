/**
 * Region flood-fill for silhouette part PNGs.
 * Boundaries: original transparent pixels + dark outline strokes.
 * Preserves original alpha and locked outline pixels.
 */

const ALPHA_MIN = 8;
/** Luma at/below this (and opaque) is treated as fixed black outline. */
const OUTLINE_LUMA_MAX = 18;

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Build locked mask from the ORIGINAL part image (Uint8Array length = w*h).
 * 1 = locked (transparent or outline), 0 = fillable.
 * @param {Uint8ClampedArray} src RGBA
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
export function buildBoundaryMask(src, w, h) {
  const lock = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < lock.length; i++, p += 4) {
    const a = src[p + 3];
    if (a < ALPHA_MIN) {
      lock[i] = 1;
      continue;
    }
    if (luma(src[p], src[p + 1], src[p + 2]) <= OUTLINE_LUMA_MAX) {
      lock[i] = 1;
      continue;
    }
    lock[i] = 0;
  }
  return lock;
}

/**
 * @param {string} hex #rrggbb
 * @returns {[number, number, number]}
 */
export function parseHexColor(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Flood-fill connected fillable region at (x,y).
 * Mutates `data` (ImageData.data). Returns number of pixels filled.
 *
 * @param {Uint8ClampedArray} data current canvas RGBA
 * @param {number} w
 * @param {number} h
 * @param {number} x
 * @param {number} y
 * @param {[number, number, number]} rgb fill color
 * @param {Uint8Array} lock boundary mask from original
 * @returns {number}
 */
export function floodFill(data, w, h, x, y, rgb, lock) {
  x = x | 0;
  y = y | 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const start = y * w + x;
  if (lock[start]) return 0;

  const [nr, ng, nb] = rgb;
  const sp = start * 4;
  const sr = data[sp];
  const sg = data[sp + 1];
  const sb = data[sp + 2];

  // Already same color — no-op
  if (sr === nr && sg === ng && sb === nb) return 0;

  const match = (i) => {
    if (lock[i]) return false;
    const p = i * 4;
    if (data[p + 3] < ALPHA_MIN) return false;
    return (
      Math.abs(data[p] - sr) <= 24 &&
      Math.abs(data[p + 1] - sg) <= 24 &&
      Math.abs(data[p + 2] - sb) <= 24
    );
  };

  const stack = [start];
  const seen = new Uint8Array(w * h);
  seen[start] = 1;
  let filled = 0;

  while (stack.length) {
    const i = stack.pop();
    if (!match(i)) continue;
    const p = i * 4;
    data[p] = nr;
    data[p + 1] = ng;
    data[p + 2] = nb;
    // keep data[p+3] alpha
    filled += 1;

    const cx = i % w;
    const cy = (i / w) | 0;
    const neigh = [];
    if (cx > 0) neigh.push(i - 1);
    if (cx + 1 < w) neigh.push(i + 1);
    if (cy > 0) neigh.push(i - w);
    if (cy + 1 < h) neigh.push(i + w);
    for (const n of neigh) {
      if (!seen[n] && !lock[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }

  return filled;
}

/**
 * Export canvas content as PNG Blob.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 匯出失敗'));
      },
      'image/png',
    );
  });
}


/**
 * Paint or erase a round brush stroke onto ImageData, clipped to unlocked
 * opaque silhouette pixels (same lock as floodFill).
 *
 * brush: set RGB to `rgb`, keep existing alpha.
 * eraser: restore RGBA from `originalData`.
 *
 * @param {Uint8ClampedArray} data current canvas RGBA (mutated)
 * @param {number} w
 * @param {number} h
 * @param {{x:number,y:number}|null} from previous point (null = stamp only)
 * @param {{x:number,y:number}} to current point
 * @param {number} brushSize diameter in px
 * @param {[number, number, number]} rgb brush color
 * @param {Uint8Array} lock boundary mask from original
 * @param {Uint8ClampedArray} originalData original part RGBA
 * @param {'brush'|'eraser'} mode
 * @returns {number} pixels touched
 */
export function strokePaint(
  data,
  w,
  h,
  from,
  to,
  brushSize,
  rgb,
  lock,
  originalData,
  mode,
) {
  const radius = Math.max(1, brushSize / 2);
  const r2 = radius * radius;
  const x0 = from ? from.x : to.x;
  const y0 = from ? from.y : to.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;

  const pad = Math.ceil(radius) + 1;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + pad));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + pad));

  const [nr, ng, nb] = rgb;
  const erase = mode === 'eraser';
  let touched = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Distance from pixel center to segment (or point)
      const px = x + 0.5;
      const py = y + 0.5;
      let dist2;
      if (len2 < 1e-6) {
        const ex = px - x1;
        const ey = py - y1;
        dist2 = ex * ex + ey * ey;
      } else {
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = x0 + t * dx - px;
        const qy = y0 + t * dy - py;
        dist2 = qx * qx + qy * qy;
      }
      if (dist2 > r2) continue;

      const i = y * w + x;
      if (lock[i]) continue;
      const p = i * 4;
      if (data[p + 3] < ALPHA_MIN) continue;
      if (erase) {
        data[p] = originalData[p];
        data[p + 1] = originalData[p + 1];
        data[p + 2] = originalData[p + 2];
        data[p + 3] = originalData[p + 3];
      } else {
        data[p] = nr;
        data[p + 1] = ng;
        data[p + 2] = nb;
        // keep alpha
      }
      touched += 1;
    }
  }
  return touched;
}

/**
 * Axis-aligned bounds of opaque template pixels (alpha >= ALPHA_MIN).
 * @param {Uint8ClampedArray} src RGBA
 * @param {number} w
 * @param {number} h
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function opaqueBounds(src, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[(y * w + x) * 4 + 3] < ALPHA_MIN) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Cover-fit photo into silhouette bbox; paint only unlocked interior pixels.
 * Outside silhouette / outline (lock=1) stay unchanged. Keeps destination alpha.
 *
 * @param {Uint8ClampedArray} data current canvas RGBA (mutated)
 * @param {number} w
 * @param {number} h
 * @param {Uint8ClampedArray} photo RGBA
 * @param {number} photoW
 * @param {number} photoH
 * @param {Uint8Array} lock boundary mask from original
 * @param {{x:number,y:number,w:number,h:number}} bbox opaque silhouette bounds
 * @returns {number} pixels painted
 */
export function applyPhotoCover(data, w, h, photo, photoW, photoH, lock, bbox) {
  if (!bbox || bbox.w < 1 || bbox.h < 1 || photoW < 1 || photoH < 1) return 0;
  const scale = Math.max(bbox.w / photoW, bbox.h / photoH);
  const drawW = photoW * scale;
  const drawH = photoH * scale;
  const ox = bbox.x + (bbox.w - drawW) / 2;
  const oy = bbox.y + (bbox.h - drawH) / 2;
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(w - 1, Math.ceil(bbox.x + bbox.w - 1));
  const y1 = Math.min(h - 1, Math.ceil(bbox.y + bbox.h - 1));
  let painted = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (lock[i]) continue;
      const p = i * 4;
      if (data[p + 3] < ALPHA_MIN) continue;
      const u = (x + 0.5 - ox) / scale;
      const v = (y + 0.5 - oy) / scale;
      const sx = Math.min(photoW - 1, Math.max(0, Math.floor(u)));
      const sy = Math.min(photoH - 1, Math.max(0, Math.floor(v)));
      const sp = (sy * photoW + sx) * 4;
      data[p] = photo[sp];
      data[p + 1] = photo[sp + 1];
      data[p + 2] = photo[sp + 2];
      painted += 1;
    }
  }
  return painted;
}
