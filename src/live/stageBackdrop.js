/**
 * Theatrical shadow-puppet rear-lit screen for live/pad canvases.
 * Not a checkerboard (editor only) — warm parchment screen in a dark wood frame.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function drawShadowStage(ctx, w, h) {
  const insetX = Math.max(18, w * 0.028);
  const insetTop = Math.max(28, h * 0.055);
  const insetBottom = Math.max(36, h * 0.08);
  const sx = insetX;
  const sy = insetTop;
  const sw = w - insetX * 2;
  const sh = h - insetTop - insetBottom;

  // Outer theater void (dark wood / house)
  const voidGrad = ctx.createLinearGradient(0, 0, 0, h);
  voidGrad.addColorStop(0, '#1a100c');
  voidGrad.addColorStop(0.55, '#241610');
  voidGrad.addColorStop(1, '#120c09');
  ctx.fillStyle = voidGrad;
  ctx.fillRect(0, 0, w, h);

  // Decorative top rail
  const railH = Math.max(10, insetTop * 0.55);
  const railGrad = ctx.createLinearGradient(0, sy - railH - 4, 0, sy);
  railGrad.addColorStop(0, '#4a2a1c');
  railGrad.addColorStop(0.4, '#6b3d28');
  railGrad.addColorStop(1, '#3a2016');
  ctx.fillStyle = railGrad;
  roundRect(ctx, sx - 6, sy - railH - 2, sw + 12, railH + 4, 3);
  ctx.fill();
  // Gold trim line under rail
  ctx.strokeStyle = 'rgba(180, 140, 70, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 2);
  ctx.lineTo(sx + sw, sy - 2);
  ctx.stroke();

  // Side posts
  const postW = Math.max(10, insetX * 0.55);
  drawPost(ctx, sx - postW * 0.35, sy - 4, postW, sh + 10);
  drawPost(ctx, sx + sw - postW * 0.65, sy - 4, postW, sh + 10);

  // Lit parchment / silk screen (vertical amber → cream)
  const screenGrad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  screenGrad.addColorStop(0, '#e8c878');
  screenGrad.addColorStop(0.18, '#f3e0a8');
  screenGrad.addColorStop(0.45, '#f8ecd0');
  screenGrad.addColorStop(0.75, '#fbf6e8');
  screenGrad.addColorStop(1, '#f0e6d0');
  ctx.fillStyle = screenGrad;
  ctx.fillRect(sx, sy, sw, sh);

  // Soft vignette (rear-lit falloff)
  const vig = ctx.createRadialGradient(
    sx + sw * 0.5,
    sy + sh * 0.42,
    Math.min(sw, sh) * 0.2,
    sx + sw * 0.5,
    sy + sh * 0.48,
    Math.max(sw, sh) * 0.72,
  );
  vig.addColorStop(0, 'rgba(255, 248, 220, 0)');
  vig.addColorStop(0.55, 'rgba(180, 120, 40, 0.04)');
  vig.addColorStop(1, 'rgba(60, 35, 15, 0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(sx, sy, sw, sh);

  // Soft ground shadow band at bottom of screen
  const ground = ctx.createLinearGradient(sx, sy + sh * 0.72, sx, sy + sh);
  ground.addColorStop(0, 'rgba(90, 55, 25, 0)');
  ground.addColorStop(0.45, 'rgba(90, 55, 25, 0.08)');
  ground.addColorStop(1, 'rgba(55, 35, 18, 0.28)');
  ctx.fillStyle = ground;
  ctx.fillRect(sx, sy + sh * 0.7, sw, sh * 0.3);

  // Inner screen edge (subtle lit rim)
  ctx.strokeStyle = 'rgba(255, 236, 180, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);

  // Bottom sill
  const sillY = sy + sh;
  const sillGrad = ctx.createLinearGradient(0, sillY, 0, h);
  sillGrad.addColorStop(0, '#5c3824');
  sillGrad.addColorStop(0.35, '#3d2418');
  sillGrad.addColorStop(1, '#1a100c');
  ctx.fillStyle = sillGrad;
  ctx.fillRect(sx - 8, sillY, sw + 16, h - sillY);
  ctx.fillStyle = 'rgba(180, 140, 70, 0.3)';
  ctx.fillRect(sx - 8, sillY, sw + 16, 2);
}

function drawPost(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#2a1810');
  g.addColorStop(0.35, '#5a3824');
  g.addColorStop(0.7, '#3d2618');
  g.addColorStop(1, '#1e120c');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 140, 70, 0.25)';
  ctx.fillRect(x + w * 0.15, y + 4, 1.5, h - 8);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
