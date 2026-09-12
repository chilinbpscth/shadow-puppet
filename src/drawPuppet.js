/**
 * Canvas2D compose of shadow-puppet parts using pivots + drawOrder.
 * Static mode: resolvePose from defaultPose tree.
 * Pose mode: pass opts.joints from bindPose (absolute canvas coords).
 */

/**
 * Resolve absolute joint transforms for default standing / T-ish pose.
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} rig
 * @param {Map<string, HTMLImageElement>} images
 * @param {{
 *   showDebug?: boolean,
 *   cx?: number,
 *   cy?: number,
 *   scale?: number,
 *   joints?: Map<string, { x: number, y: number, rotation: number }> | null,
 *   clear?: boolean,
 * }} [opts]
 */
export function drawPuppet(ctx, rig, images, opts = {}) {
  const canvas = ctx.canvas;
  const layout = {
    cx: opts.cx ?? canvas.width / 2,
    cy: opts.cy ?? canvas.height * 0.38,
    scale: opts.scale ?? 1,
  };
  const showDebug = !!opts.showDebug;
  const clear = opts.clear !== false;

  let pose;
  if (opts.joints && opts.joints.size) {
    pose = new Map();
    for (const part of rig.parts) {
      const j = opts.joints.get(part.id);
      if (!j) continue;
      pose.set(part.id, { x: j.x, y: j.y, rotation: j.rotation, flipX: j.flipX || 1, part });
    }
  } else {
    pose = resolvePose(rig, layout);
  }

  if (clear) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FBF8F2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

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
  ctx.scale(node.flipX || 1, 1);
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


/**
 * Draw visible joint handles (classroom finger targets).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{ id: string, kind: string, x: number, y: number }>} handles
 * @param {{ activeId?: string | null, hintId?: string | null, pulse?: number }} [opts]
 */
export function drawHandles(ctx, handles, opts = {}) {
  const activeId = opts.activeId || null;
  const hintId = opts.hintId || null;
  const pulse = opts.pulse ?? 0;
  ctx.save();
  for (const h of handles) {
    const isActive = h.id === activeId;
    const isHint = h.id === hintId;
    const r = isActive ? 16 : isHint ? 14 + Math.sin(pulse) * 3 : 12;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    if (h.kind === 'torso') {
      ctx.fillStyle = isActive ? 'rgba(255, 200, 80, 0.95)' : 'rgba(255, 180, 60, 0.88)';
    } else if (h.kind === 'wrist') {
      ctx.fillStyle = isActive ? 'rgba(120, 220, 255, 0.95)' : 'rgba(80, 200, 255, 0.88)';
    } else {
      ctx.fillStyle = isActive ? 'rgba(180, 255, 140, 0.95)' : 'rgba(140, 220, 100, 0.88)';
    }
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 248, 230, 0.95)';
    ctx.stroke();

    if (isHint) {
      ctx.fillStyle = 'rgba(255, 240, 200, 0.98)';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('← 拖我', h.x + 18, h.y + 5);
    }
  }
  ctx.restore();
}
