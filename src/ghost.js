import * as THREE from 'three';

const GHOST_KEY = 'neonRushBestGhost';
const SAMPLE_MS = 1000 / 30;
const _ghQa = new THREE.Quaternion(), _ghQb = new THREE.Quaternion();
const rnd = (v) => Math.round(v * 100) / 100;
const rnd4 = (v) => Math.round(v * 10000) / 10000;

// Records the player's lap and replays the saved best lap as a translucent car.
// Frames: [t(ms), x, y, z, qx, qy, qz, qw].
export class Ghost {
  constructor(scene) {
    this.data = null;          // { time, checkpoints, frames }
    this.recording = null;
    this.lastSampleAt = -Infinity;
    this.group = new THREE.Group();
    this.group.name = 'ghost';
    this.group.visible = false;
    if (scene) { this.buildMesh(); scene.add(this.group); }
    this.load();
  }

  get hasLap() { return !!(this.data && this.data.frames.length > 1); }
  get time() { return this.data ? this.data.time : null; }

  buildMesh() {
    const g = this.group;
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.32, depthWrite: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0xbafbff, transparent: true, opacity: 0.7, depthWrite: false });
    const box = (w, h, d, x, y, z, m = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z); g.add(mesh); return mesh;
    };
    box(2.0, 0.5, 4.4, 0, 0.62, 0);
    box(1.9, 0.26, 1.7, 0, 0.98, -1.15);
    box(1.6, 0.5, 1.9, 0, 1.1, 0.3);
    box(2.3, 0.08, 0.55, 0, 1.4, 2.05);
    box(0.42, 0.03, 4.3, 0, 1.13, 0, edge);
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12); wheel.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-1.0, -1.45], [1.0, -1.45], [-1.0, 1.45], [1.0, 1.45]]) {
      const w = new THREE.Mesh(wheel, mat); w.position.set(x, 0.42, z); g.add(w);
    }
    g.renderOrder = 5;
  }

  // ---- storage ----
  load() {
    try {
      const raw = localStorage.getItem(GHOST_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const ok = d && Number.isFinite(d.time) && d.time > 0 && Array.isArray(d.frames) && d.frames.length > 1 &&
        Array.isArray(d.checkpoints) && d.frames.every((f) => Array.isArray(f) && f.length === 8 && f.every(Number.isFinite));
      if (ok) this.data = d;
    } catch (e) { this.data = null; }
  }
  save() {
    if (!this.data) return;
    try { localStorage.setItem(GHOST_KEY, JSON.stringify(this.data)); } catch (e) { /* quota or unavailable */ }
  }

  // ---- recording ----
  startRecording() {
    this.recording = { frames: [], checkpoints: [] };
    this.lastSampleAt = -Infinity;
  }
  record(elapsedMs, car) {
    const r = this.recording;
    if (!r || elapsedMs - this.lastSampleAt < SAMPLE_MS) return;
    this.lastSampleAt = elapsedMs;
    const p = car.pos, q = car.group.quaternion;
    r.frames.push([Math.round(elapsedMs), rnd(p.x), rnd(p.y), rnd(p.z), rnd4(q.x), rnd4(q.y), rnd4(q.z), rnd4(q.w)]);
  }
  recordCheckpoint(elapsedMs) { if (this.recording) this.recording.checkpoints.push(Math.round(elapsedMs)); }
  // Called at the finish. Keeps the lap as the new ghost if it's a record.
  finishRecording(finalMs, car, isRecord) {
    const r = this.recording;
    this.recording = null;
    if (!r || !isRecord) return;
    const p = car.pos, q = car.group.quaternion;
    r.frames.push([Math.round(finalMs), rnd(p.x), rnd(p.y), rnd(p.z), rnd4(q.x), rnd4(q.y), rnd4(q.z), rnd4(q.w)]);
    this.data = { time: Math.round(finalMs), checkpoints: r.checkpoints, frames: r.frames };
    this.save();
  }

  // ---- playback ----
  setVisible(v) { this.group.visible = v && this.hasLap; }

  setTime(elapsedMs) {
    if (!this.hasLap) return;
    const f = this.data.frames;
    let lo = 0, hi = f.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f[mid][0] <= elapsedMs) lo = mid; else hi = mid - 1; }
    const a = f[lo], b = f[Math.min(f.length - 1, lo + 1)];
    const span = b[0] - a[0];
    const k = span > 0 ? Math.min(1, Math.max(0, (elapsedMs - a[0]) / span)) : 0;
    this.group.position.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
    _ghQa.set(a[4], a[5], a[6], a[7]);
    _ghQb.set(b[4], b[5], b[6], b[7]);
    this.group.quaternion.copy(_ghQa).slerp(_ghQb, k);
  }

  // Ghost's time at checkpoint n (1-based); null if unknown.
  timeAt(n) {
    if (!this.data) return null;
    if (n > this.data.checkpoints.length) return this.data.time;
    const t = this.data.checkpoints[n - 1];
    return Number.isFinite(t) ? t : null;
  }
}
