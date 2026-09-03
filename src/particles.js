import * as THREE from 'three';

const PARTICLE_VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

// Fixed-capacity pool. No per-frame allocation; expired particles are simply skipped.
export class ParticleSystem {
  constructor(scene, capacity = 900) {
    this.capacity = capacity;
    const n = capacity;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n); this.grow = new Float32Array(n); this.gravity = new Float32Array(n);
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.cursor = 0;

    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, gravity = 0, grow = 0) {
    let i = this.cursor;
    for (let k = 0; k < this.capacity; k++) {
      if (!this.alive[i]) break;
      i = (i + 1) % this.capacity;
    }
    this.cursor = (i + 1) % this.capacity;
    this.alive[i] = 1;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.grow[i] = grow; this.gravity[i] = gravity;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
  }

  clear() { this.alive.fill(0); this.geo.setDrawRange(0, 0); }

  update(dt) {
    let n = 0;
    const P = this.positions, C = this.colors, S = this.sizes;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; continue; }
      this.vy[i] += this.gravity[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      this.size[i] += this.grow[i] * dt;
      const a = this.life[i] / this.maxLife[i];
      P[n * 3] = this.x[i]; P[n * 3 + 1] = this.y[i]; P[n * 3 + 2] = this.z[i];
      C[n * 3] = this.r[i] * a; C[n * 3 + 1] = this.g[i] * a; C[n * 3 + 2] = this.b[i] * a;
      S[n] = this.size[i];
      n++;
    }
    this.geo.setDrawRange(0, n);
    if (n > 0) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
    }
  }

  // ---- convenience emitters ----
  smoke(x, y, z, vx, vz, count) {
    for (let i = 0; i < count; i++) {
      this.emit(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5,
        vx * 0.15 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, vz * 0.15 + (Math.random() - 0.5) * 2,
        0.55 + Math.random() * 0.35, 1.0 + Math.random() * 0.6, 0.32, 0.32, 0.38, 0.5, 2.6);
    }
  }
  dust(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
      this.emit(x, y + 0.2, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s,
        0.5 + Math.random() * 0.4, 0.9 + Math.random() * 0.8, 0.45, 0.38, 0.28, -4, 2.2);
    }
  }
  sparks(x, y, z, nx, nz, count) {
    for (let i = 0; i < count; i++) {
      const s = 5 + Math.random() * 10;
      this.emit(x, y + Math.random() * 0.6, z,
        nx * s + (Math.random() - 0.5) * 6, 2 + Math.random() * 5, nz * s + (Math.random() - 0.5) * 6,
        0.25 + Math.random() * 0.35, 0.28 + Math.random() * 0.25, 1.0, 0.85, 0.35, -18, 0);
    }
  }
  confetti(x, y, z, count) {
    const palette = [[0, 0.9, 1], [1, 0.17, 0.84], [1, 1, 1], [0.13, 1, 0.4]];
    for (let i = 0; i < count; i++) {
      const c = palette[i % palette.length];
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 12;
      this.emit(x + (Math.random() - 0.5) * 14, y + Math.random() * 2, z + (Math.random() - 0.5) * 4,
        Math.cos(a) * s, 6 + Math.random() * 12, Math.sin(a) * s,
        1.8 + Math.random() * 1.6, 0.4 + Math.random() * 0.4, c[0], c[1], c[2], -9, 0);
    }
  }
}

// Ring buffer of dark quads laid on the road behind the rear wheels while sliding.
export class SkidMarks {
  constructor(scene, maxQuads = 1600) {
    this.max = maxQuads;
    this.positions = new Float32Array(maxQuads * 6 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x07070b, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.geo = geo;
    scene.add(this.mesh);
    this.cursor = 0; this.count = 0;
    this.last = [null, null];
  }

  add(wheel, cx, cy, cz, rx, rz) {
    const hw = 0.19, y = cy + 0.05;
    const lx = cx - rx * hw, lz = cz - rz * hw, rxp = cx + rx * hw, rzp = cz + rz * hw;
    const last = this.last[wheel];
    if (last) {
      const dx = cx - last.cx, dz = cz - last.cz;
      if (dx * dx + dz * dz < 0.09) return;
      const o = this.cursor * 18, P = this.positions;
      P[o] = last.lx; P[o + 1] = last.y; P[o + 2] = last.lz;
      P[o + 3] = last.rx; P[o + 4] = last.y; P[o + 5] = last.rz;
      P[o + 6] = rxp; P[o + 7] = y; P[o + 8] = rzp;
      P[o + 9] = last.lx; P[o + 10] = last.y; P[o + 11] = last.lz;
      P[o + 12] = rxp; P[o + 13] = y; P[o + 14] = rzp;
      P[o + 15] = lx; P[o + 16] = y; P[o + 17] = lz;
      this.cursor = (this.cursor + 1) % this.max;
      this.count = Math.min(this.count + 1, this.max);
      this.geo.setDrawRange(0, this.count * 6);
      this.geo.attributes.position.needsUpdate = true;
      last.lx = lx; last.lz = lz; last.rx = rxp; last.rz = rzp; last.y = y; last.cx = cx; last.cz = cz;
    } else {
      this.last[wheel] = { lx, lz, rx: rxp, rz: rzp, y, cx, cz };
    }
  }

  lift(wheel) { this.last[wheel] = null; }
  clear() { this.cursor = 0; this.count = 0; this.geo.setDrawRange(0, 0); this.last = [null, null]; }
}
