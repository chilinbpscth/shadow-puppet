/**
 * Canvas2D static compose of shadow-puppet parts using pivots + drawOrder.
 */

/**
 * Resolve absolute joint transforms for default standing / T-ish pose.
 * defaultPose.x/y are offsets relative to parent joint (or canvas origin for roots),
 * in part-local pixel units before global scale.
 *
 * @param {object} rig
 * @param {{ cx: number, cy: number, scale: number }} layout
 * @returns {Map<string, { x: number, y: number, rotation: number, part: object }>}
 */
export function resolvePose(rig, layout) {
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const solved = new Map();
  const { cx, cy, scale } = layout;

  function solve(id, visiting = new Set()) {
    if (solved.has(id)) return solved.get(id);
    if (visiting.has(id)) {
      throw new Error(`circular parent: ${id}`);
    }
    visiting.add(id);
    const part = byId.get(id);
    if (!part) throw new Error(`missing part: ${id}`);
    const dp = part.defaultPose || { x: 0, y: 0, rotation: 0, parent: null };

    let parentX = cx;
    let parentY = cy;
    let parentRot = 0;
    if (dp.parent) {
      const parent = solve(dp.parent, visiting);
      parentX = parent.x;
      parentY = parent.y;
      parentRot = parent.rotation;
    }

    const ox = (dp.x || 0) * scale;
    const oy = (dp.y || 0) * scale;
    const cos = Math.cos(parentRot);
    const sin = Math.sin(parentRot);
    const x = parentX + ox * cos - oy * sin;
    const y = parentY + ox * sin + oy * cos;
    const rotation = parentRot + (dp.rotation || 0);

    const node = { x, y, rotation, part };
    solved.set(id, node);
    visiting.delete(id);
    return node;
  }

  for (const part of rig.parts) {
    solve(part.id);
  }
  return solved;
}

/**
 * Draw all parts (sorted by drawOrder) and optional debug overlays.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} rig
 * @param {Map<string, HTMLImageElement>} images
 * @param {{ showDebug?: boolean, cx?: number, cy?: number, scale?: number }} [opts]
 */
export function drawPuppet(ctx, rig, images, opts = {}) {
  const canvas = ctx.canvas;
  const layout = {
    cx: opts.cx ?? canvas.width / 2,
    cy: opts.cy ?? canvas.height * 0.38,
    scale: opts.scale ?? 1,
  };
  const showDebug = !!opts.showDebug;
  const pose = resolvePose(rig, layout);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createRadialGradient(
    layout.cx,
    layout.cy,
    40,
    layout.cx,
    layout.cy + 80,
    Math.max(canvas.width, canvas.height) * 0.55,
  );
  g.addColorStop(0, 'rgba(90, 55, 30, 0.35)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ordered = [...rig.parts].sort(
    (a, b) => (a.drawOrder ?? 0) - (b.drawOrder ?? 0),
  );

  for (const part of ordered) {
    const node = pose.get(part.id);
    const img = images.get(part.id);
    if (!node || !img) continue;
    drawPart(ctx, node, img, layout.scale);
  }

  if (showDebug) {
    drawDebug(ctx, rig, pose, layout.scale);
  }
}

function drawPart(ctx, node, img, scale) {
  const { part, x, y, rotation } = node;
  const w = (part.width || img.naturalWidth) * scale;
  const h = (part.height || img.naturalHeight) * scale;
  const px = (part.pivot?.x ?? 0.5) * w;
  const py = (part.pivot?.y ?? 0.5) * h;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -px, -py, w, h);
  ctx.restore();
}

function drawDebug(ctx, rig, pose, scale) {
  ctx.save();
  ctx.lineWidth = 2;

  for (const part of rig.parts) {
    const dp = part.defaultPose || {};
    if (!dp.parent) continue;
    const a = pose.get(dp.parent);
    const b = pose.get(part.id);
    if (!a || !b) continue;
    ctx.strokeStyle = 'rgba(80, 200, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const part of rig.parts) {
    const node = pose.get(part.id);
    if (!node) continue;
    ctx.fillStyle = 'rgba(255, 70, 70, 0.95)';
    ctx.beginPath();
    ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 230, 180, 0.95)';
    ctx.font = '12px sans-serif';
    ctx.fillText(part.id, node.x + 8, node.y - 8);

    const w = (part.width || 0) * scale;
    const h = (part.height || 0) * scale;
    const px = (part.pivot?.x ?? 0.5) * w;
    const py = (part.pivot?.y ?? 0.5) * h;
    const localDx = w * 0.5 - px;
    const localDy = h - py;
    const cos = Math.cos(node.rotation);
    const sin = Math.sin(node.rotation);
    const dx = node.x + localDx * cos - localDy * sin;
    const dy = node.y + localDx * sin + localDy * cos;
    ctx.fillStyle = 'rgba(255, 200, 60, 0.7)';
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
