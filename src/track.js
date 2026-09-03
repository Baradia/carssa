import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeTextTexture, makeCheckerTexture, WORLD_UP } from './utils.js';

export const TRACK_WIDTH = 16;
export const HALF_WIDTH = TRACK_WIDTH / 2;
export const WALL_LIMIT = HALF_WIDTH - 1.0;
export const NUM_SAMPLES = 1800;

// Centerline of the course from START to FINISH.
//  bank : roll of the road surface in radians (negative = left edge raised = banked right-hander)
//  gap  : no road between this point and the next one (the jump)
//  cp   : a checkpoint gate stands here
const CONTROL_POINTS = [
  { x: 0, y: 0, z: 40 },                              // 0  behind the grid
  { x: 0, y: 0, z: 0, start: true },                  // 1  START
  { x: 0, y: 0, z: -90 },                             //    high-speed straight
  { x: 0, y: 0, z: -180, cp: true },                  // 3  CP1
  { x: 0, y: 0, z: -250 },
  { x: 20, y: 0, z: -320 },                           //    wide sweeping right
  { x: 70, y: 0, z: -375 },
  { x: 140, y: 0, z: -395, cp: true },                // 7  CP2
  { x: 220, y: 6, z: -395 },                          //    uphill
  { x: 295, y: 18, z: -410 },
  { x: 350, y: 32, z: -445, cp: true },               // 10 CP3
  { x: 375, y: 42, z: -500 },
  { x: 370, y: 48, z: -555 },                         //    hairpin
  { x: 335, y: 52, z: -585 },
  { x: 295, y: 52, z: -565, cp: true },               // 14 CP4  hairpin exit
  { x: 275, y: 52, z: -525 },
  { x: 240, y: 54, z: -500 },
  { x: 195, y: 56, z: -515 },
  { x: 150, y: 58, z: -555, cp: true },               // 18 CP5  before the ramp
  { x: 120, y: 66, z: -586 },                         //    ramp
  { x: 106, y: 70, z: -601 },
  { x: 96, y: 72.5, z: -611, gap: true },             // 21 lip -> airborne
  { x: 86, y: 74, z: -621, gap: true },               //    phantom point keeps the lip straight
  { x: 51, y: 60.5, z: -659, landing: true },         // 23 landing
  { x: 14, y: 53, z: -700, cp: true },                // 24 CP6
  { x: 8, y: 46, z: -765, bank: -0.15 },
  { x: 22, y: 38, z: -835, bank: -0.36 },             //    banked turn
  { x: 75, y: 31, z: -890, bank: -0.36 },
  { x: 150, y: 26, z: -915, bank: -0.14, cp: true },  // 28 CP7
  { x: 235, y: 14, z: -930 },                         //    fast downhill
  { x: 320, y: 2, z: -945 },
  { x: 365, y: 0, z: -975 },                          //    technical turns
  { x: 375, y: 0, z: -1020 },
  { x: 345, y: -1, z: -1055 },
  { x: 320, y: -1, z: -1095, cp: true },              // 34 CP8
  { x: 350, y: -2, z: -1135 },
  { x: 395, y: -2, z: -1155 },
  { x: 430, y: -2, z: -1200 },                        //    final straight
  { x: 445, y: -2, z: -1280 },
  { x: 445, y: -2, z: -1380, finish: true },          // 39 FINISH
  { x: 445, y: -2, z: -1440 },                        //    run-off
];

// ---------------------------------------------------------------------------
// Pure data: samples along the centerline, ground query, checkpoints, terrain.
// ---------------------------------------------------------------------------
export function createTrackData() {
  const n = CONTROL_POINTS.length;
  const pts = CONTROL_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const samples = [];
  let dist = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const u = i / (NUM_SAMPLES - 1);
    const pos = curve.getPoint(u);
    const tan = curve.getTangent(u);
    if (tan.lengthSq() < 1e-8) tan.set(0, 0, -1);
    tan.normalize();
    const p = Math.min(u * (n - 1), n - 1 - 1e-6);
    const seg = Math.floor(p);
    const frac = p - seg;
    const A = CONTROL_POINTS[seg], B = CONTROL_POINTS[seg + 1];
    const bank = lerp(A.bank || 0, B.bank || 0, frac);
    const fwd = new THREE.Vector3(tan.x, 0, tan.z);
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (i > 0) dist += pos.distanceTo(samples[i - 1].pos);
    samples.push({ index: i, u, pos, tan, fwd, right, bank, hasRoad: !A.gap, dist, seg, curv: 0 });
  }
  // Signed heading change over a short window (positive = left turn).
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const a = samples[Math.max(0, i - 4)].fwd, b = samples[Math.min(NUM_SAMPLES - 1, i + 4)].fwd;
    const cross = a.z * b.x - a.x * b.z;
    const dot = clamp(a.x * b.x + a.z * b.z, -1, 1);
    samples[i].curv = Math.atan2(cross, dot);
  }

  const idxOf = (k) => Math.round((k / (n - 1)) * (NUM_SAMPLES - 1));
  const yawOf = (s) => Math.atan2(-s.fwd.x, -s.fwd.z);
  const checkpoints = [];
  let startIndex = 0, finishIndex = NUM_SAMPLES - 1, landingIndex = 0;
  CONTROL_POINTS.forEach((cp, k) => {
    const idx = idxOf(k);
    if (cp.cp) {
      const rs = samples[Math.min(NUM_SAMPLES - 1, idx + 4)];
      checkpoints.push({ number: checkpoints.length + 1, index: idx, sample: samples[idx], respawn: { pos: rs.pos.clone(), yaw: yawOf(rs) } });
    }
    if (cp.start) startIndex = idx;
    if (cp.finish) finishIndex = idx;
    if (cp.landing) landingIndex = idx;
  });
  const start = { pos: samples[startIndex].pos.clone(), yaw: yawOf(samples[startIndex]) };

  // Bounds
  const bounds = new THREE.Box3();
  for (const s of samples) bounds.expandByPoint(s.pos);

  // Terrain: smooth ground that follows the track height, with rolling hills further out.
  const coarse = samples.filter((s, i) => i % 8 === 0);
  function terrainHeight(x, z) {
    let sw = 0, sy = 0, dmin = Infinity;
    for (let i = 0; i < coarse.length; i++) {
      const p = coarse[i].pos;
      const dx = p.x - x, dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < dmin) dmin = d2;
      const w = 1 / ((d2 + 600) * (d2 + 600));
      sw += w; sy += w * p.y;
    }
    const base = sy / sw - 10;
    const f = smoothstep(28, 130, Math.sqrt(dmin));
    const noise = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 7 + Math.sin(x * 0.007 + z * 0.011) * 12;
    return base + noise * f;
  }

  // ---- nearest-point query (windowed search around the last hit) ----
  const res = {
    index: 0, lateral: 0, groundY: null, centerX: 0, centerY: 0, centerZ: 0, hasRoad: false, dist: 0, bank: 0,
    fwd: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(),
  };
  let lastIndex = 0;
  function nearest(x, y, z) {
    let best = 0, bestD = Infinity;
    const scan = (from, to) => {
      for (let i = from; i <= to; i++) {
        const p = samples[i].pos;
        const dx = p.x - x, dz = p.z - z, dy = (p.y - y) * 0.6;
        const d = dx * dx + dz * dz + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    scan(Math.max(0, lastIndex - 90), Math.min(NUM_SAMPLES - 1, lastIndex + 90));
    if (bestD > 40 * 40) { bestD = Infinity; scan(0, NUM_SAMPLES - 1); }
    lastIndex = best;
    return best;
  }
  function projT(sa, sb, x, z) {
    const sx = sb.pos.x - sa.pos.x, sz = sb.pos.z - sa.pos.z;
    return ((x - sa.pos.x) * sx + (z - sa.pos.z) * sz) / (sx * sx + sz * sz || 1);
  }
  function query(x, y, z) {
    const i = nearest(x, y, z);
    let a = i < NUM_SAMPLES - 1 ? i : i - 1;
    let sa = samples[a], sb = samples[a + 1];
    let t = projT(sa, sb, x, z);
    if (t < 0 && a > 0) { a -= 1; sa = samples[a]; sb = samples[a + 1]; t = projT(sa, sb, x, z); }
    t = clamp(t, 0, 1);
    const cx = lerp(sa.pos.x, sb.pos.x, t), cy = lerp(sa.pos.y, sb.pos.y, t), cz = lerp(sa.pos.z, sb.pos.z, t);
    res.fwd.copy(sa.fwd).lerp(sb.fwd, t).normalize();
    res.tan.copy(sa.tan).lerp(sb.tan, t).normalize();
    res.right.set(-res.fwd.z, 0, res.fwd.x);
    const bank = lerp(sa.bank, sb.bank, t);
    const lateral = (x - cx) * res.right.x + (z - cz) * res.right.z;
    const hasRoad = sa.hasRoad && sb.hasRoad;
    res.index = a + t; res.lateral = lateral; res.centerX = cx; res.centerY = cy; res.centerZ = cz;
    res.bank = bank; res.hasRoad = hasRoad;
    res.dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
    res.groundY = hasRoad && Math.abs(lateral) <= HALF_WIDTH + 1.5 ? cy + lateral * Math.tan(bank) : null;
    return res;
  }
  function setQueryHint(index) { lastIndex = clamp(Math.round(index), 0, NUM_SAMPLES - 1); }

  return { samples, curve, checkpoints, startIndex, finishIndex, landingIndex, start, bounds, terrainHeight, query, setQueryHint, yawOf };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
export function edgePoint(s, lat, yOff, out) {
  return out.set(s.pos.x + s.right.x * lat, s.pos.y + lat * Math.tan(s.bank) + yOff, s.pos.z + s.right.z * lat);
}

const _trkA = new THREE.Vector3(), _trkB = new THREE.Vector3();
const WHITE3 = [1, 1, 1];
function buildStrip(samples, fnA, fnB, filter, colorFn) {
  const pos = [], col = [], idx = [];
  let prevOk = false, vi = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!filter(s, i)) { prevOk = false; continue; }
    fnA(s, i, _trkA); fnB(s, i, _trkB);
    pos.push(_trkA.x, _trkA.y, _trkA.z, _trkB.x, _trkB.y, _trkB.z);
    const c = colorFn ? colorFn(s, i) : WHITE3;
    col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    if (prevOk) { const k = vi - 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    vi += 2; prevOk = true;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A Group positioned on the road surface with X = right, Y = surface up, Z = backwards (so -Z = forward).
const _trkR = new THREE.Vector3(), _trkU = new THREE.Vector3(), _trkBk = new THREE.Vector3(), _trkM = new THREE.Matrix4();
export function alignedGroup(s, lat = 0, yOff = 0) {
  const g = new THREE.Group();
  edgePoint(s, lat, yOff, g.position);
  _trkR.set(s.right.x, Math.tan(s.bank), s.right.z).normalize();
  _trkU.crossVectors(_trkR, s.tan).normalize();
  _trkBk.crossVectors(_trkR, _trkU).normalize();
  _trkM.makeBasis(_trkR, _trkU, _trkBk);
  g.quaternion.setFromRotationMatrix(_trkM);
  return g;
}

function chevronShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w, -0.15 * h); s.lineTo(0, 0.85 * h); s.lineTo(w, -0.15 * h);
  s.lineTo(0.55 * w, -0.15 * h); s.lineTo(0, 0.35 * h); s.lineTo(-0.55 * w, -0.15 * h);
  s.closePath();
  return s;
}

function textPlane(text, w, h, opts) {
  const tex = makeTextTexture(text, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return m;
}

// ---------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------
export function buildTrackMeshes(scene, data) {
  const { samples, checkpoints, startIndex, finishIndex, landingIndex, terrainHeight } = data;
  const root = new THREE.Group();
  root.name = 'track';
  scene.add(root);

  const isRoad = (s) => s.hasRoad;
  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.78, metalness: 0.22, side: THREE.DoubleSide }),
    slab: new THREE.MeshStandardMaterial({ color: 0x14141d, roughness: 1, side: THREE.DoubleSide }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
    magenta: new THREE.MeshBasicMaterial({ color: 0xff2bd6 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    vcolBasic: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    barrier: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1b26, roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.4, metalness: 0.7 }),
  };

  // Road surface + slab underneath
  const road = new THREE.Mesh(buildStrip(samples,
    (s, i, o) => edgePoint(s, -HALF_WIDTH, 0, o), (s, i, o) => edgePoint(s, HALF_WIDTH, 0, o), isRoad), mats.road);
  road.receiveShadow = true;
  root.add(road);
  root.add(new THREE.Mesh(buildStrip(samples,
    (s, i, o) => edgePoint(s, -HALF_WIDTH - 0.7, -0.9, o), (s, i, o) => edgePoint(s, HALF_WIDTH + 0.7, -0.9, o), isRoad), mats.slab));

  // Neon edge lines
  for (const side of [-1, 1]) {
    root.add(new THREE.Mesh(buildStrip(samples,
      (s, i, o) => edgePoint(s, side * (HALF_WIDTH - 0.55), 0.03, o), (s, i, o) => edgePoint(s, side * (HALF_WIDTH - 0.25), 0.03, o), isRoad), mats.cyan));
  }
  // Center dashes
  root.add(new THREE.Mesh(buildStrip(samples,
    (s, i, o) => edgePoint(s, -0.15, 0.03, o), (s, i, o) => edgePoint(s, 0.15, 0.03, o), (s, i) => s.hasRoad && (i % 18) < 9), mats.white));
  // Red/white curbs on curves
  const curbCol = (s, i) => (Math.floor(i / 5) % 2 ? [0.95, 0.1, 0.1] : [0.96, 0.96, 0.96]);
  for (const side of [-1, 1]) {
    root.add(new THREE.Mesh(buildStrip(samples,
      (s, i, o) => edgePoint(s, side * (HALF_WIDTH - 1.6), 0.02, o), (s, i, o) => edgePoint(s, side * (HALF_WIDTH - 0.6), 0.02, o),
      (s) => s.hasRoad && Math.abs(s.curv) > 0.03, curbCol), mats.vcolBasic));
  }
  // Barriers + neon rails
  const barCol = (s, i) => (Math.floor(i / 10) % 2 ? [0.9, 0.08, 0.08] : [0.95, 0.95, 0.95]);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(buildStrip(samples,
      (s, i, o) => edgePoint(s, side * (HALF_WIDTH + 0.5), -0.5, o), (s, i, o) => edgePoint(s, side * (HALF_WIDTH + 0.5), 1.1, o), isRoad, barCol), mats.barrier);
    wall.receiveShadow = true;
    root.add(wall);
    root.add(new THREE.Mesh(buildStrip(samples,
      (s, i, o) => edgePoint(s, side * (HALF_WIDTH + 0.3), 1.15, o), (s, i, o) => edgePoint(s, side * (HALF_WIDTH + 0.7), 1.15, o), isRoad), mats.magenta));
  }

  // Support pillars down to the terrain
  {
    const list = [];
    for (let i = 10; i < samples.length; i += 22) {
      const s = samples[i];
      if (!s.hasRoad) continue;
      const h = s.pos.y - terrainHeight(s.pos.x, s.pos.z) + 0.4;
      if (h > 1.5) list.push({ s, h });
    }
    const geo = new THREE.CylinderGeometry(1.1, 1.7, 1, 8);
    const inst = new THREE.InstancedMesh(geo, mats.dark, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach((it, k) => {
      p.set(it.s.pos.x, it.s.pos.y - it.h / 2 - 0.6, it.s.pos.z);
      sc.set(1, it.h, 1);
      m.compose(p, q, sc);
      inst.setMatrixAt(k, m);
    });
    root.add(inst);
  }

  // Terrain
  {
    const b = data.bounds;
    const pad = 480;
    const w = (b.max.x - b.min.x) + pad * 2, d = (b.max.z - b.min.z) + pad * 2;
    const geo = new THREE.PlaneGeometry(w, d, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + cx, z = pa.getZ(i) + cz;
      pa.setXYZ(i, x, terrainHeight(x, z), z);
    }
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x143a22, roughness: 1, flatShading: true }));
    terrain.receiveShadow = true;
    root.add(terrain);
  }

  // ---- Start area ----
  const countdownLights = [];
  {
    const s = samples[startIndex];
    const g = alignedGroup(s);
    // Grid slot outlines
    for (const lat of [-5, 0, 5]) {
      const sw = 2.8, sl = 5.4, t = 0.16;
      const mk = (w, l, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, l), mats.white); m.position.set(x, 0.03, z); g.add(m); };
      mk(sw, t, lat, -sl / 2); mk(sw, t, lat, sl / 2); mk(t, sl, lat - sw / 2, 0); mk(t, sl, lat + sw / 2, 0);
    }
    root.add(g);
    // Start line
    const ls = alignedGroup(samples[startIndex + 8]);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2.4), new THREE.MeshBasicMaterial({ map: makeCheckerTexture(16, 2), side: THREE.DoubleSide }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.04;
    ls.add(line); root.add(ls);
    // Countdown gantry
    const gg = alignedGroup(samples[startIndex + 22]);
    for (const x of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.5, 0.8), mats.steel);
      post.position.set(x * (HALF_WIDTH + 1.6), 4.75, 0); post.castShadow = true; gg.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.8, 0.8), mats.steel);
    beam.position.y = 9.4; gg.add(beam);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.4, 1.2), mats.dark);
    housing.position.set(0, 7.6, 0.2); gg.add(housing);
    for (const x of [-2.4, 0, 2.4]) {
      const lm = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x000000, roughness: 0.3 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), lm);
      ball.position.set(x, 7.6, 0.9); gg.add(ball);
      countdownLights.push(lm);
    }
    const sign = textPlane('NEON RUSH', 16, 4, { width: 1024, height: 256, color: '#ffffff', glow: '#00e5ff', bg: 'rgba(10,6,24,0.85)', border: '#00e5ff' });
    sign.position.set(0, 12.5, 0); gg.add(sign);
    root.add(gg);
    // Grandstands + light towers
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        const h = 1.6 + row * 1.7;
        const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 84), new THREE.MeshStandardMaterial({ color: row % 2 ? 0x2a2a3c : 0x24243a, roughness: 0.9 }));
        box.position.set(side * (HALF_WIDTH + 5 + row * 3.2), h / 2 - 0.5, 0); g.add(box);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 84), row % 2 ? mats.magenta : mats.cyan);
        strip.position.set(side * (HALF_WIDTH + 5 + row * 3.2), h - 0.44, 0); g.add(strip);
      }
      for (const z of [-38, 38]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 20, 0.7), mats.steel);
        tower.position.set(side * (HALF_WIDTH + 15), 9.5, z); g.add(tower);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1), mats.white);
        lamp.position.set(side * (HALF_WIDTH + 15), 19.5, z); g.add(lamp);
      }
    }
  }
  function setCountdown(step) {
    countdownLights.forEach((m, i) => {
      if (step >= 4) { m.emissive.setHex(0x22ff66); m.emissiveIntensity = 1.6; m.color.setHex(0x115522); }
      else if (i < step) { m.emissive.setHex(0xff2020); m.emissiveIntensity = 1.6; m.color.setHex(0x551111); }
      else { m.emissive.setHex(0x000000); m.emissiveIntensity = 1; m.color.setHex(0x1a1a1a); }
    });
  }

  // ---- Checkpoint gates ----
  const gates = checkpoints.map((cp) => {
    const g = alignedGroup(cp.sample);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2a33, emissive: 0x00e5ff, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.5 });
    for (const x of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), mat);
      post.position.set(x * (HALF_WIDTH + 0.9), 3.75, 0); post.castShadow = true; g.add(post);
      const num = textPlane(String(cp.number), 1.8, 1.8, { width: 128, height: 128, color: '#ffffff', bg: 'rgba(0,0,0,0.7)', border: '#ffffff' });
      num.position.set(x * (HALF_WIDTH + 0.9), 5.2, 0.4); g.add(num);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 2.5, 0.7, 0.7), mat);
    beam.position.y = 7.5; g.add(beam);
    const label = `CHECKPOINT ${cp.number}`;
    const texNormal = makeTextTexture(label, { width: 1024, height: 256, color: '#ffffff', glow: '#00e5ff', bg: 'rgba(8,6,22,0.8)', border: '#00e5ff' });
    const texPassed = makeTextTexture(`✓ ${label}`, { width: 1024, height: 256, color: '#22ff66', glow: '#22ff66', bg: 'rgba(8,6,22,0.8)', border: '#22ff66' });
    const signMat = new THREE.MeshBasicMaterial({ map: texNormal, transparent: true, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat);
    sign.position.set(0, 9.1, 0); g.add(sign);
    root.add(g);
    let state = 'upcoming';
    return {
      group: g,
      setState(st) {
        state = st;
        if (st === 'passed') { mat.emissive.setHex(0x22ff66); mat.emissiveIntensity = 0.9; signMat.map = texPassed; }
        else if (st === 'next') { mat.emissive.setHex(0x00e5ff); mat.emissiveIntensity = 1.4; signMat.map = texNormal; }
        else { mat.emissive.setHex(0x00e5ff); mat.emissiveIntensity = 0.3; signMat.map = texNormal; }
        signMat.needsUpdate = true;
      },
      update(time) { if (state === 'next') mat.emissiveIntensity = 1.1 + Math.sin(time * 6) * 0.5; },
    };
  });

  // ---- Finish gate ----
  const finishTop = new THREE.Vector3();
  {
    const s = samples[finishIndex];
    const g = alignedGroup(s);
    const checker = makeCheckerTexture(4, 20, 32);
    const chk = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.5 });
    for (const x of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12, 2.6), chk);
      pillar.position.set(x * (HALF_WIDTH + 2.2), 6, 0); pillar.castShadow = true; g.add(pillar);
      const pl = new THREE.PointLight(x < 0 ? 0x00e5ff : 0xff2bd6, 1.6, 80, 1.5);
      pl.position.set(x * (HALF_WIDTH + 2.2), 12.6, 1); g.add(pl);
    }
    const beamChk = makeCheckerTexture(24, 3, 32);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 7, 2.6, 2.6), new THREE.MeshStandardMaterial({ map: beamChk, roughness: 0.5 }));
    beam.position.y = 12; g.add(beam);
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), i % 2 ? mats.magenta : mats.cyan);
      b.position.set(-9 + i * 3, 13.6, 0); g.add(b);
    }
    const banner = textPlane('FINISH', 18, 5, { width: 1024, height: 284, color: '#ffffff', glow: '#ff2bd6', bg: 'rgba(120,10,90,0.9)', border: '#ffffff' });
    banner.position.set(0, 17, 0); g.add(banner);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 3.2), new THREE.MeshBasicMaterial({ map: makeCheckerTexture(16, 3), side: THREE.DoubleSide }));
    strip.rotation.x = -Math.PI / 2; strip.position.y = 0.04; g.add(strip);
    root.add(g);
    finishTop.copy(s.pos).y += 10;
  }
  // End wall at the run-off
  {
    const s = samples[samples.length - 3];
    const g = alignedGroup(s);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 3, 3, 1.2), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0x550000 }));
    wall.position.y = 1.2; g.add(wall);
    root.add(g);
  }

  // ---- Direction signs ----
  const chevBig = new THREE.ExtrudeGeometry(chevronShape(0.95, 1.0), { depth: 0.12, bevelEnabled: false });
  const chevFlat = new THREE.ShapeGeometry(chevronShape(1.7, 2.4));
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x3d7bff, side: THREE.DoubleSide });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0d2a4a, roughness: 0.6 });
  const redBoardMat = new THREE.MeshStandardMaterial({ color: 0xd41818, emissive: 0x3a0000, roughness: 0.6 });
  const protectedIdx = [startIndex, finishIndex, ...checkpoints.map((c) => c.index)];
  const nearProtected = (i, r) => protectedIdx.some((p) => Math.abs(p - i) < r);

  // Detect turns and place warning boards ahead of them, on the outside.
  const turns = [];
  {
    let inTurn = false, start = 0, sum = 0, maxc = 0, dir = 0, quiet = 0;
    for (let i = 0; i < samples.length; i++) {
      const c = samples[i].curv;
      if (!inTurn) {
        if (Math.abs(c) > 0.025 && samples[i].hasRoad) { inTurn = true; start = i; sum = 0; maxc = 0; dir = Math.sign(c); quiet = 0; }
      } else if (Math.abs(c) > 0.025 && Math.sign(c) === dir) {
        sum += c; maxc = Math.max(maxc, Math.abs(c)); quiet = 0;
      } else if (++quiet > 12 || i === samples.length - 1) {
        turns.push({ start, end: i, dir, angle: Math.abs(sum) / 8, maxc });
        inTurn = false;
      }
    }
  }
  for (const t of turns) {
    if (t.angle < 0.35) continue;
    const idx = Math.max(6, t.start - 30);
    const s = samples[idx];
    if (!s.hasRoad || nearProtected(idx, 14)) continue;
    const sharp = t.maxc > 0.1 || t.angle > 1.5;
    const g = alignedGroup(s, t.dir * (HALF_WIDTH + 2.6), 0);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.22), mats.steel);
    pole.position.y = 0.75; g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.5, 0.16), sharp ? redBoardMat : boardMat);
    board.position.y = 2.7; board.castShadow = true; g.add(board);
    const chev = new THREE.Mesh(chevBig, sharp ? mats.white : mats.cyan);
    chev.position.set(0, 2.7, 0.1); chev.rotation.z = t.dir * Math.PI / 2; g.add(chev);
    if (sharp) {
      const bang = textPlane('!', 1.0, 1.0, { width: 128, height: 128, color: '#ffffff', bg: 'rgba(0,0,0,0)' });
      bang.position.set(0, 4.4, 0.1); g.add(bang);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.14), redBoardMat);
      cap.position.set(0, 4.4, 0); g.add(cap);
    }
    root.add(g);
  }
  // Flat blue/white arrows painted on the road
  let arrowToggle = 0;
  for (let i = 45; i < samples.length - 40; i += 55) {
    const s = samples[i];
    if (!s.hasRoad || !samples[i + 4].hasRoad || nearProtected(i, 16)) continue;
    const g = alignedGroup(s, 0, 0.05);
    const a = new THREE.Mesh(chevFlat, (arrowToggle++ % 2) ? mats.white : blueMat);
    a.rotation.x = -Math.PI / 2; g.add(a);
    root.add(g);
  }
  // Large arrows after the jump
  {
    const bigFlat = new THREE.ShapeGeometry(chevronShape(3.2, 4.2));
    for (let k = 0; k < 3; k++) {
      const s = samples[landingIndex + 20 + k * 8];
      const g = alignedGroup(s, 0, 0.06);
      const a = new THREE.Mesh(bigFlat, mats.cyan);
      a.rotation.x = -Math.PI / 2; g.add(a);
      root.add(g);
    }
    const s = samples[landingIndex + 48];
    const g = alignedGroup(s);
    for (const x of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), mats.steel);
      post.position.set(x * (HALF_WIDTH + 1.2), 4, 0); g.add(post);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 3, 3.2, 0.2), boardMat);
    board.position.y = 8.2; g.add(board);
    for (const x of [-4, 0, 4]) {
      const c = new THREE.Mesh(chevBig, mats.cyan);
      c.position.set(x, 8.2, 0.14); c.scale.set(1.4, 1.4, 1); g.add(c);
    }
    root.add(g);
  }
  // Decorative neon arches
  {
    const arch = new THREE.TorusGeometry(HALF_WIDTH + 3, 0.6, 8, 36, Math.PI);
    const archMat = new THREE.MeshStandardMaterial({ color: 0x331033, emissive: 0xff2bd6, emissiveIntensity: 0.9 });
    for (const i of [300, 640, 1050, 1350, 1620]) {
      const s = samples[i];
      if (!s.hasRoad || nearProtected(i, 25)) continue;
      const g = alignedGroup(s);
      g.add(new THREE.Mesh(arch, archMat));
      root.add(g);
    }
  }

  return { root, setCountdown, gates, finishTop };
}
