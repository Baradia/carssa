import * as THREE from 'three';
import { mulberry32, makeTextTexture } from './utils.js';
import { HALF_WIDTH, edgePoint, alignedGroup } from './track.js';

export function buildScenery(scene, data) {
  const rng = mulberry32(90210);
  const { samples, terrainHeight } = data;
  const root = new THREE.Group();
  root.name = 'scenery';
  scene.add(root);

  const coarse = samples.filter((s, i) => i % 4 === 0);
  const clearOfTrack = (x, z, margin) => {
    const m2 = margin * margin;
    for (let i = 0; i < coarse.length; i++) {
      const p = coarse[i].pos;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < m2) return false;
    }
    return true;
  };

  const trees = [], rocks = [], buildings = [];
  for (let i = 16; i < samples.length - 16; i += 5) {
    const s = samples[i];
    const r = rng();
    const side = rng() < 0.5 ? -1 : 1;
    if (r < 0.6) {
      const lat = side * (HALF_WIDTH + 6 + rng() * 42);
      const x = s.pos.x + s.right.x * lat, z = s.pos.z + s.right.z * lat;
      if (!clearOfTrack(x, z, HALF_WIDTH + 5)) continue;
      trees.push({ x, y: terrainHeight(x, z), z, scale: 0.85 + rng() * 1.2, rot: rng() * Math.PI * 2, tint: rng() });
    } else if (r < 0.76) {
      const lat = side * (HALF_WIDTH + 4 + rng() * 26);
      const x = s.pos.x + s.right.x * lat, z = s.pos.z + s.right.z * lat;
      if (!clearOfTrack(x, z, HALF_WIDTH + 3)) continue;
      rocks.push({ x, y: terrainHeight(x, z), z, scale: 0.6 + rng() * 2.4, rot: rng() * Math.PI * 2, tint: rng() });
    } else if (r < 0.88) {
      const lat = side * (HALF_WIDTH + 48 + rng() * 120);
      const x = s.pos.x + s.right.x * lat, z = s.pos.z + s.right.z * lat;
      if (!clearOfTrack(x, z, HALF_WIDTH + 38)) continue;
      buildings.push({ x, y: terrainHeight(x, z) - 4, z, w: 10 + rng() * 18, d: 10 + rng() * 18, h: 14 + rng() * 56, rot: rng() * Math.PI * 2, tint: rng() });
    }
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const yq = (a) => q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

  // Trees: cone canopy + trunk (instanced)
  {
    const canopy = new THREE.ConeGeometry(2.4, 7.5, 6); canopy.translate(0, 3.75 + 1.5, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.55, 1.8, 6); trunk.translate(0, 0.9, 0);
    const canopyMesh = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), trees.length);
    const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 1 }), trees.length);
    trees.forEach((t, k) => {
      p.set(t.x, t.y, t.z); sc.set(t.scale, t.scale, t.scale);
      m.compose(p, yq(t.rot), sc);
      canopyMesh.setMatrixAt(k, m); trunkMesh.setMatrixAt(k, m);
      canopyMesh.setColorAt(k, col.setHSL(0.36 + t.tint * 0.1, 0.6, 0.2 + t.tint * 0.14));
    });
    canopyMesh.castShadow = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    root.add(canopyMesh, trunkMesh);
  }
  // Rocks
  {
    const geo = new THREE.DodecahedronGeometry(1.3, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), rocks.length);
    rocks.forEach((r, k) => {
      p.set(r.x, r.y + r.scale * 0.5, r.z); sc.set(r.scale, r.scale * 0.8, r.scale);
      m.compose(p, yq(r.rot), sc);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, col.setHSL(0.68, 0.12, 0.28 + r.tint * 0.14));
    });
    mesh.castShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    root.add(mesh);
  }
  // Buildings with neon roof rings
  {
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const bodyMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.2 }), buildings.length);
    const ringMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), buildings.length);
    buildings.forEach((b, k) => {
      p.set(b.x, b.y, b.z); sc.set(b.w, b.h, b.d);
      m.compose(p, yq(b.rot), sc); bodyMesh.setMatrixAt(k, m);
      bodyMesh.setColorAt(k, col.setHSL(0.66 + b.tint * 0.08, 0.35, 0.14 + b.tint * 0.1));
      p.set(b.x, b.y + b.h, b.z); sc.set(b.w + 0.4, 0.35, b.d + 0.4);
      m.compose(p, yq(b.rot), sc); ringMesh.setMatrixAt(k, m);
      ringMesh.setColorAt(k, col.setHex(k % 2 ? 0x00e5ff : 0xff2bd6));
    });
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    root.add(bodyMesh, ringMesh);
  }
  // Light poles attached to the road edge
  {
    const list = [];
    for (let i = 30; i < samples.length - 30; i += 45) {
      const s = samples[i];
      if (!s.hasRoad) continue;
      list.push({ s, side: (Math.floor(i / 45) % 2) ? 1 : -1 });
    }
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7, 6); poleGeo.translate(0, 3.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.6, metalness: 0.5 }), list.length);
    const lampGeo = new THREE.SphereGeometry(0.42, 10, 8);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
    const base = new THREE.Vector3();
    list.forEach((it, k) => {
      edgePoint(it.s, it.side * (HALF_WIDTH + 1.4), 1.0, base);
      sc.set(1, 1, 1);
      m.compose(base, q.identity(), sc); poles.setMatrixAt(k, m);
      p.set(base.x, base.y + 7.2, base.z);
      m.compose(p, q, sc); lamps.setMatrixAt(k, m);
      lamps.setColorAt(k, col.setHex(k % 2 ? 0x00e5ff : 0xff2bd6));
    });
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    root.add(poles, lamps);
  }
  // Neon billboards
  {
    const words = ['NEON RUSH', 'FULL SEND', 'APEX', 'VELOCITY', 'SECTOR 7', 'HOLD THE LINE', 'DRIFT', 'FINISH AHEAD'];
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.6, metalness: 0.5 });
    for (let k = 0; k < words.length; k++) {
      const i = 120 + k * 210;
      if (i >= samples.length - 60) break;
      const s = samples[i];
      if (!s.hasRoad) continue;
      const side = k % 2 ? 1 : -1;
      const g = alignedGroup(s, side * (HALF_WIDTH + 10), 0);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12, 0.4), steel);
      pole.position.y = 2; g.add(pole);
      const tex = makeTextTexture(words[k], { width: 1024, height: 256, color: '#ffffff', glow: k % 2 ? '#ff2bd6' : '#00e5ff', bg: 'rgba(8,6,22,0.9)', border: k % 2 ? '#ff2bd6' : '#00e5ff' });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      sign.position.y = 9.5;
      sign.rotation.y = side * 0.35;
      g.add(sign);
      root.add(g);
    }
  }
  // Distant mountains
  {
    const c = data.bounds.getCenter(new THREE.Vector3());
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1030, roughness: 1, flatShading: true });
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + rng() * 0.2;
      const rad = 980 + rng() * 300;
      const h = 110 + rng() * 190, w = 150 + rng() * 140;
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5 + Math.floor(rng() * 3)), mat);
      const x = c.x + Math.cos(a) * rad, z = c.z + Math.sin(a) * rad;
      mesh.position.set(x, terrainHeight(x, z) + h / 2 - 20, z);
      mesh.rotation.y = rng() * Math.PI;
      root.add(mesh);
    }
  }
  // Stars
  {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, e = Math.acos(1 - rng()) * 0.5;
      const r = 1800;
      pos[k * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[k * 3 + 1] = Math.sin(e) * r + 100;
      pos[k * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe9ff, size: 2.2, sizeAttenuation: false, fog: false }));
    const c = data.bounds.getCenter(new THREE.Vector3());
    stars.position.set(c.x, 0, c.z);
    root.add(stars);
  }

  return root;
}
