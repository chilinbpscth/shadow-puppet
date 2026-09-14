/**
 * P0/P1 photo-into-puppet: align photo under active character silhouette, mask, export PNG.
 * Canvas size matches the loaded template (typically 640×960).
 */
import {TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from './profileRig.js';
import {canvasToPngBlob, opaqueBounds} from './colorFill.js';

const ALPHA_MIN = 8;
const OUTLINE_LUMA_MAX = 40;
const MAX_PHOTO_EDGE = 1600;

export function downscalePhoto(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const edge = Math.max(iw, ih);
  const scale = edge > MAX_PHOTO_EDGE ? MAX_PHOTO_EDGE / edge : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * scale));
  c.height = Math.max(1, Math.round(ih * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function coverFitTransform(photoW, photoH, bbox) {
  const scale = Math.max(bbox.w / photoW, bbox.h / photoH);
  return {
    scale,
    rotation: 0,
    tx: bbox.x + bbox.w / 2,
    ty: bbox.y + bbox.h / 2,
  };
}

export function drawPhotoTransformed(ctx, photo, t) {
  ctx.save();
  ctx.translate(t.tx, t.ty);
  ctx.rotate(t.rotation);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(photo, -photo.width / 2, -photo.height / 2);
  ctx.restore();
}

export function maskToTemplateAlpha(photoRGBA, templateRGBA, w, h, keepOutline = true) {
  let kept = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const ta = templateRGBA[p + 3];
    if (ta < ALPHA_MIN) {
      photoRGBA[p] = photoRGBA[p + 1] = photoRGBA[p + 2] = photoRGBA[p + 3] = 0;
      continue;
    }
    const luma = 0.299 * templateRGBA[p] + 0.587 * templateRGBA[p + 1] + 0.114 * templateRGBA[p + 2];
    if (keepOutline && luma <= OUTLINE_LUMA_MAX) {
      photoRGBA[p] = photoRGBA[p + 1] = photoRGBA[p + 2] = 0;
      photoRGBA[p + 3] = 255;
      kept += 1;
      continue;
    }
    photoRGBA[p + 3] = 255;
    kept += 1;
  }
  return kept;
}

export function compositeMasked(template, photo, transform, opts = {}) {
  const w = template.width || TEMPLATE_WIDTH;
  const h = template.height || TEMPLATE_HEIGHT;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', {willReadFrequently: true});
  ctx.clearRect(0, 0, w, h);
  drawPhotoTransformed(ctx, photo, transform);
  const pixels = ctx.getImageData(0, 0, w, h);
  maskToTemplateAlpha(pixels.data, template.data, w, h, opts.outline !== false);
  return pixels;
}

export async function imageDataToPngBlob(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  return canvasToPngBlob(c);
}

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('相片載入失敗'));
    };
    img.src = url;
  });
}

/**
 * @param {object} opts
 * @param {ImageData} opts.template
 * @param {HTMLCanvasElement} opts.photoCanvas
 * @param {HTMLElement} opts.host
 * @param {string} [opts.characterLabel]
 */
export function openAlignOverlay({template, photoCanvas, host, characterLabel = '影偶'}) {
  const tw = template.width || TEMPLATE_WIDTH;
  const th = template.height || TEMPLATE_HEIGHT;
  const bbox = opaqueBounds(template.data, tw, th);
  if (!bbox) return Promise.resolve(null);

  let transform = coverFitTransform(photoCanvas.width, photoCanvas.height, bbox);
  const overlay = document.createElement('div');
  overlay.className = 'photo-align-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '對齊影相入偶');
  overlay.innerHTML = `
    <div class="photo-align-sheet">
      <header class="photo-align-head">
        <strong>對齊紙稿</strong>
        <span>拖移・放大縮小・旋轉，對準${characterLabel}輪廓</span>
      </header>
      <div class="photo-align-stage" id="photoAlignStage">
        <canvas id="photoAlignCanvas" width="${tw}" height="${th}"></canvas>
      </div>
      <div class="photo-align-tools">
        <button type="button" data-act="zoomOut" aria-label="縮小">－</button>
        <button type="button" data-act="zoomIn" aria-label="放大">＋</button>
        <button type="button" data-act="rotL" aria-label="左轉">↺</button>
        <button type="button" data-act="rotR" aria-label="右轉">↻</button>
        <button type="button" data-act="reset">重設</button>
        <button type="button" data-act="cancel">取消</button>
        <button type="button" class="photo-align-confirm" data-act="confirm">確認入偶</button>
      </div>
      <p class="photo-align-hint">影完紙稿會套入${characterLabel}輪廓；確認後可再畫筆修改</p>
    </div>
  `;
  host.append(overlay);

  const canvas = overlay.querySelector('#photoAlignCanvas');
  const ctx = canvas.getContext('2d');
  const stage = overlay.querySelector('#photoAlignStage');

  const silhouette = document.createElement('canvas');
  silhouette.width = tw;
  silhouette.height = th;
  const sctx = silhouette.getContext('2d');
  const sData = sctx.createImageData(tw, th);
  for (let i = 0, p = 0; i < tw * th; i++, p += 4) {
    const a = template.data[p + 3];
    if (a < ALPHA_MIN) continue;
    const luma = 0.299 * template.data[p] + 0.587 * template.data[p + 1] + 0.114 * template.data[p + 2];
    if (luma <= OUTLINE_LUMA_MAX) {
      sData.data[p] = sData.data[p + 1] = sData.data[p + 2] = 0;
      sData.data[p + 3] = 220;
    } else {
      sData.data[p] = 188;
      sData.data[p + 1] = 53;
      sData.data[p + 2] = 50;
      sData.data[p + 3] = 55;
    }
  }
  sctx.putImageData(sData, 0, 0);

  function fitCanvas() {
    const r = stage.getBoundingClientRect();
    const scale = Math.min((r.width - 8) / tw, (r.height - 8) / th);
    canvas.style.width = Math.max(1, tw * scale) + 'px';
    canvas.style.height = Math.max(1, th * scale) + 'px';
  }

  function paint() {
    ctx.clearRect(0, 0, tw, th);
    ctx.fillStyle = '#efeae1';
    ctx.fillRect(0, 0, tw, th);
    drawPhotoTransformed(ctx, photoCanvas, transform);
    ctx.drawImage(silhouette, 0, 0);
  }

  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) * tw) / r.width,
      y: ((ev.clientY - r.top) * th) / r.height,
    };
  }

  let dragging = false;
  let last = null;
  let pinch0 = null;

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary && ev.pointerType !== 'touch') return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    dragging = true;
    last = canvasPoint(ev);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging || !last) return;
    ev.preventDefault();
    const p = canvasPoint(ev);
    transform = {
      ...transform,
      tx: transform.tx + (p.x - last.x),
      ty: transform.ty + (p.y - last.y),
    };
    last = p;
    paint();
  });
  const endDrag = () => {
    dragging = false;
    last = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        const [a, b] = ev.touches;
        pinch0 = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          scale: transform.scale,
        };
        dragging = false;
      }
    },
    {passive: false},
  );
  stage.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length === 2 && pinch0) {
        ev.preventDefault();
        const [a, b] = ev.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const next = pinch0.scale * (dist / pinch0.dist);
        transform = {...transform, scale: Math.min(8, Math.max(0.05, next))};
        paint();
      }
    },
    {passive: false},
  );
  stage.addEventListener('touchend', () => {
    pinch0 = null;
  });

  new ResizeObserver(fitCanvas).observe(stage);
  fitCanvas();
  paint();

  return new Promise((resolve) => {
    const base = coverFitTransform(photoCanvas.width, photoCanvas.height, bbox);
    overlay.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'zoomIn') transform = {...transform, scale: Math.min(8, transform.scale * 1.12)};
      if (act === 'zoomOut') transform = {...transform, scale: Math.max(0.05, transform.scale / 1.12)};
      if (act === 'rotL') transform = {...transform, rotation: transform.rotation - Math.PI / 12};
      if (act === 'rotR') transform = {...transform, rotation: transform.rotation + Math.PI / 12};
      if (act === 'reset') transform = {...base};
      if (act === 'cancel') {
        overlay.remove();
        resolve(null);
        return;
      }
      if (act === 'confirm') {
        const result = compositeMasked(template, photoCanvas, transform, {outline: true});
        overlay.remove();
        resolve(result);
        return;
      }
      paint();
    });
  });
}
