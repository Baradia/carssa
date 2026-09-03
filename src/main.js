import { Game } from './game.js';

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function showError(text) {
  const el = document.getElementById('error');
  const t = document.getElementById('error-text');
  if (t) t.textContent = text;
  if (el) el.classList.remove('hidden');
  const menu = document.getElementById('menu');
  if (menu) menu.classList.add('hidden');
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  if (!supportsWebGL()) {
    showError('Your browser does not support WebGL, which Neon Rush needs for 3D rendering. Try a current version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  // Give the web font a moment to load so canvas-rendered signs use it (never block for long).
  try {
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]);
  } catch (e) { /* ignore */ }
  try {
    window.neonRush = new Game(canvas);
  } catch (err) {
    console.error(err);
    showError('Something went wrong while starting the game: ' + (err && err.message ? err.message : err));
  }
}

boot();
