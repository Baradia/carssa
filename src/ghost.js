import * as THREE from 'three';
import { GHOST_DATA } from './ghost-data.js';

const _ghQa = new THREE.Quaternion(), _ghQb = new THREE.Quaternion();

// Translucent replay of the reference lap. Frames are [x, y, z, qx, qy, qz, qw] at GHOST_DATA.fps.
export class Ghost {
  constructor(scene) {
    this.data = GHOST_DATA;
    this.time = this.data.time;                  // ms
    this.checkpointTimes = this.data.checkpoints; // ms, in order
    this.group = new THREE.Group();
    this.group.name = 'ghost';
    this.group.visible = false;
    if (scene) { this.buildMesh(); scene.add(this.group); }
    this.setTime(0);
  }

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

  setVisible(v) { this.group.visible = v; }

  // elapsedMs: race time since GO.
  setTime(elapsedMs) {
    const f = this.data.frames;
    const t = Math.max(0, elapsedMs / 1000) * this.data.fps;
    const i = Math.min(f.length - 1, Math.floor(t));
    const j = Math.min(f.length - 1, i + 1);
    const k = i === j ? 0 : t - i;
    const a = f[i], b = f[j];
    this.group.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    _ghQa.set(a[3], a[4], a[5], a[6]);
    _ghQb.set(b[3], b[4], b[5], b[6]);
    this.group.quaternion.copy(_ghQa).slerp(_ghQb, k);
  }

  // Ghost's time at checkpoint n (1-based); finish when n > checkpoints.
  timeAt(n) {
    if (n > this.checkpointTimes.length) return this.time;
    return this.checkpointTimes[n - 1];
  }
}
