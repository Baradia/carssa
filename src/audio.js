import { clamp } from './utils.js';

const MUTE_KEY = 'neonRushMuted';

// All sounds are synthesized with the Web Audio API; no audio files are required.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }
  }

  // Must be called from a user gesture (Start button).
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Engine: two detuned oscillators through a low-pass filter.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.Q.value = 1.2;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 55;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 110;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(g2); g2.connect(this.engineFilter);
    this.osc1.start(); this.osc2.start();

    // White noise buffer for impacts / landings.
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.ready = true;
    this.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  updateEngine(speedRatio, throttle, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const f = 42 + speedRatio * 250 + throttle * 14;
    this.osc1.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(240 + speedRatio * 1900 + throttle * 300, t, 0.1);
    const vol = active ? 0.045 + speedRatio * 0.09 + throttle * 0.035 : 0.015;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
  }

  tone(freq, dur, opts = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const type = opts.type || 'sine';
    const vol = opts.vol == null ? 0.25 : opts.vol;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + opts.slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  countdown() { this.tone(440, 0.18, { type: 'square', vol: 0.18 }); }
  go() {
    this.tone(880, 0.5, { type: 'square', vol: 0.22 });
    this.tone(1320, 0.5, { type: 'square', vol: 0.1, delay: 0.02 });
  }
  checkpoint() {
    this.tone(1046, 0.08, { vol: 0.18 });
    this.tone(1568, 0.16, { vol: 0.18, delay: 0.08 });
  }
  collision(strength) {
    const s = clamp(strength, 0.1, 1);
    this.noise(0.14, 0.12 + s * 0.3, 900);
    this.tone(85, 0.12, { type: 'triangle', vol: 0.12 + s * 0.2 });
  }
  landing(strength) {
    const s = clamp(strength, 0.1, 1);
    this.noise(0.12, 0.08 + s * 0.18, 350);
    this.tone(65, 0.16, { type: 'sine', vol: 0.15 + s * 0.15 });
  }
  respawn() { this.tone(420, 0.35, { type: 'sine', vol: 0.14, slide: -300 }); }
  finish() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.32, { type: 'square', vol: 0.13, delay: i * 0.09 }));
    this.tone(1568, 0.9, { type: 'sawtooth', vol: 0.08, delay: 0.45 });
  }
  record() {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.5, { type: 'square', vol: 0.12, delay: 0.9 + i * 0.12 }));
  }
}
