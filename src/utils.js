import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
// Shortest signed angle from `from` to `to`.
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Deterministic PRNG (mulberry32) so scenery is identical every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_UP = new THREE.Vector3(0, 1, 0);
export const hasDOM = typeof document !== 'undefined';

export function makeTextTexture(text, opts = {}) {
  if (!hasDOM) return null;
  const width = opts.width || 512;
  const height = opts.height || 128;
  const color = opts.color || '#ffffff';
  const bg = opts.bg || 'rgba(0,0,0,0)';
  const glow = opts.glow || null;
  const font = opts.font || `700 ${Math.floor(height * 0.62)}px Rajdhani, "Arial Narrow", Arial, sans-serif`;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = height * 0.06; ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth); }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = height * 0.2; }
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2 + height * 0.04);
  if (glow) ctx.fillText(text, width / 2, height / 2 + height * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function makeCheckerTexture(cols = 8, rows = 2, cell = 32) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = cols * cell; c.height = rows * cell;
  const ctx = c.getContext('2d');
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#111118' : '#f4f4f8';
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.NearestFilter;
  return tex;
}
