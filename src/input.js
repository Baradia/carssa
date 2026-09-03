import { damp } from './utils.js';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyR', 'Escape',
]);

export class Input {
  constructor() {
    this.keys = Object.create(null);
    this.throttle = 0;   // 0..1
    this.brake = 0;      // 0..1
    this.steer = 0;      // -1 (left) .. 1 (right), smoothed
    this.rawSteer = 0;
    this.drift = false;
    this.onRestart = null;
    this.onPause = null;

    this._down = (e) => this.handle(e, true);
    this._up = (e) => this.handle(e, false);
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', () => this.clear());
  }

  handle(e, down) {
    const code = e.code;
    if (!GAME_KEYS.has(code)) return;
    // Let Space/Enter activate a focused menu button normally.
    const onButton = e.target && (e.target.tagName === 'BUTTON');
    if (code === 'Space' && onButton) return;
    e.preventDefault();
    if (down && e.repeat) return;
    this.keys[code] = down;
    if (down) {
      if (code === 'KeyR' && this.onRestart) this.onRestart();
      if (code === 'Escape' && this.onPause) this.onPause();
    }
  }

  update(dt) {
    const k = this.keys;
    this.throttle = (k.KeyW || k.ArrowUp) ? 1 : 0;
    this.brake = (k.KeyS || k.ArrowDown) ? 1 : 0;
    this.rawSteer = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
    // Smooth digital steering so the car doesn't twitch on tap.
    this.steer = damp(this.steer, this.rawSteer, this.rawSteer === 0 ? 16 : 9, dt);
    if (Math.abs(this.steer) < 0.002) this.steer = 0;
    this.drift = !!k.Space;
  }

  clear() {
    this.keys = Object.create(null);
    this.throttle = 0; this.brake = 0; this.rawSteer = 0; this.steer = 0; this.drift = false;
  }
}
