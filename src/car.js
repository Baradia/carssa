import * as THREE from 'three';
import { clamp, lerp, damp, angleDiff } from './utils.js';
import { WALL_LIMIT, NUM_SAMPLES } from './track.js';

export const MAX_SPEED = 86;      // m/s  (~310 km/h)
export const MAX_REVERSE = 14;    // m/s
export const GRAVITY = 12;        // m/s² (arcade)

const _carM = new THREE.Matrix4();
const _carE = new THREE.Euler();
const _carUp = new THREE.Vector3(), _carRightB = new THREE.Vector3(), _carF = new THREE.Vector3(), _carR = new THREE.Vector3(), _carBk = new THREE.Vector3();

export class Car {
  constructor(scene) {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.speed = 0;            // signed forward speed (m/s)
    this.lateralSpeed = 0;
    this.driftAmount = 0;
    this.airTime = 0;
    this.controlsEnabled = false;
    this.finishing = false;
    this.trackIndex = 0;
    this.query = null;
    this.events = [];
    this.lastSteer = 0;
    this.lastThrottle = 0;
    this.accelEst = 0;
    this.wheelSpin = 0;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();

    this.group = new THREE.Group();
    this.group.name = 'car';
    if (scene) { this.buildMesh(); scene.add(this.group); }
  }

  // ---------------------------------------------------------------------
  buildMesh() {
    const g = this.group;
    const body = new THREE.Group();
    this.body = body; g.add(body);

    const paint = new THREE.MeshStandardMaterial({ color: 0xff6a1a, metalness: 0.45, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.6, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.85 });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const magenta = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffee });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const mk = (geo, mat, x, y, z, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };

    mk(box(2.0, 0.5, 4.4), paint, 0, 0.62, 0);            // chassis
    mk(box(1.9, 0.26, 1.7), paint, 0, 0.98, -1.15);        // hood
    mk(box(1.6, 0.5, 1.9), dark, 0, 1.1, 0.3);             // cabin
    const ws = mk(box(1.5, 0.55, 0.08), glass, 0, 1.08, -0.72);  // windshield
    ws.rotation.x = 0.55;
    const rw = mk(box(1.4, 0.45, 0.08), glass, 0, 1.08, 1.3);    // rear window
    rw.rotation.x = -0.5;
    mk(box(2.3, 0.08, 0.55), dark, 0, 1.4, 2.05);          // spoiler
    mk(box(0.1, 0.4, 0.3), dark, -0.85, 1.12, 2.05);
    mk(box(0.1, 0.4, 0.3), dark, 0.85, 1.12, 2.05);
    mk(box(0.42, 0.02, 1.7), cyan, 0, 1.12, -1.15);        // hood stripe
    mk(box(0.42, 0.02, 1.4), cyan, 0, 0.88, 1.5);          // deck stripe
    mk(box(0.45, 0.16, 0.12), white, -0.62, 0.75, -2.2);   // headlights
    mk(box(0.45, 0.16, 0.12), white, 0.62, 0.75, -2.2);
    mk(box(0.5, 0.14, 0.1), red, -0.62, 0.72, 2.2);        // tail lights
    mk(box(0.5, 0.14, 0.1), red, 0.62, 0.72, 2.2);
    mk(box(0.06, 0.06, 3.6), magenta, -1.03, 0.42, 0);     // side neon
    mk(box(0.06, 0.06, 3.6), magenta, 1.03, 0.42, 0);

    const spot = new THREE.SpotLight(0xdff6ff, 1.3, 75, 0.55, 0.5, 1);
    spot.position.set(0, 1.0, -1.8);
    spot.target.position.set(0, -0.6, -30);
    g.add(spot); g.add(spot.target);
    const under = new THREE.PointLight(0x00e5ff, 0.9, 7, 2);
    under.position.set(0, 0.25, 0);
    body.add(under);

    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 16); wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8); hubGeo.rotateZ(Math.PI / 2);
    const tyre = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.9 });
    const hub = new THREE.MeshStandardMaterial({ color: 0xc8ccd8, roughness: 0.3, metalness: 0.8 });
    this.frontPivots = []; this.spins = []; this.wheels = [];
    for (const [x, z] of [[-1.0, -1.45], [1.0, -1.45], [-1.0, 1.45], [1.0, 1.45]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
      const spin = new THREE.Group();
      const w = new THREE.Mesh(wheelGeo, tyre); w.castShadow = true;
      spin.add(w); spin.add(new THREE.Mesh(hubGeo, hub));
      pivot.add(spin); g.add(pivot);
      if (z < 0) this.frontPivots.push(pivot);
      this.spins.push(spin); this.wheels.push(pivot);
    }
  }

  // ---------------------------------------------------------------------
  reset(pos, yaw, track) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.vy = 0; this.grounded = true; this.speed = 0; this.lateralSpeed = 0;
    this.driftAmount = 0; this.airTime = 0; this.events.length = 0; this.finishing = false;
    this.lastSteer = 0; this.lastThrottle = 0; this.accelEst = 0;
    if (track) {
      const q = track.query(pos.x, pos.y, pos.z);
      if (q.groundY !== null) this.pos.y = q.groundY;
      this.trackIndex = q.index;
      this.query = q;
    }
    this.computeTargetQuat();
    this.group.quaternion.copy(this._targetQuat);
    this.group.position.copy(this.pos);
    if (this.body) { this.body.rotation.set(0, 0, 0); }
  }

  // One physics step.
  update(dt, input, track) {
    const ctrl = this.controlsEnabled;
    const throttle = ctrl ? input.throttle : 0;
    const brake = ctrl ? input.brake : 0;
    const steer = ctrl ? input.steer : 0;
    const driftKey = ctrl && input.drift;
    this.lastSteer = steer; this.lastThrottle = throttle;

    const fwd = this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let vf = this.vel.x * fwd.x + this.vel.z * fwd.z;
    let vl = this.vel.x * right.x + this.vel.z * right.z;
    const prevVf = vf;

    if (this.grounded) {
      if (throttle) {
        const ratio = clamp(vf / MAX_SPEED, 0, 1);
        vf += 30 * (1 - Math.pow(ratio, 1.35)) * dt;
      }
      if (brake) {
        if (vf > 0.5) vf -= 48 * dt;
        else if (!throttle) vf -= 12 * dt;
      }
      if (!throttle && !brake) vf -= vf * 0.10 * dt;
      vf -= vf * Math.abs(vf) * 0.0004 * dt;
      if (this.finishing) vf -= vf * 1.6 * dt;
      vf = clamp(vf, -MAX_REVERSE, MAX_SPEED);

      const autoDrift = (Math.abs(steer) > 0.9 && vf > 45) ? 0.45 : 0;
      const driftTarget = (driftKey && Math.abs(vf) > 10) ? 1 : autoDrift;
      this.driftAmount = damp(this.driftAmount, driftTarget, driftTarget > this.driftAmount ? 8 : 3, dt);

      const sr = clamp(Math.abs(vf) / MAX_SPEED, 0, 1);
      const steerRate = lerp(2.6, 0.85, Math.pow(sr, 0.6)) * clamp(Math.abs(vf) / 6, 0, 1);
      const dir = vf >= 0 ? 1 : -1;
      this.yaw -= steer * (steerRate + 1.2 * this.driftAmount) * dir * dt;

      const grip = lerp(7.5, 1.8, this.driftAmount);
      vl -= vl * clamp(grip * dt, 0, 1);
      if (this.driftAmount > 0.3) vf -= vf * 0.22 * this.driftAmount * dt;
    } else {
      this.yaw -= steer * 0.9 * dt;
      vf -= vf * 0.02 * dt;
      this.airTime += dt;
      this.driftAmount = damp(this.driftAmount, 0, 4, dt);
    }
    fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.speed = vf; this.lateralSpeed = vl;
    this.accelEst = damp(this.accelEst, (vf - prevVf) / Math.max(dt, 1e-4), 6, dt);
    this.vel.set(fwd.x * vf + right.x * vl, 0, fwd.z * vf + right.z * vl);

    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const q = track.query(nx, this.pos.y, nz);

    // Walls
    if (q.hasRoad && Math.abs(q.lateral) > WALL_LIMIT) {
      const side = Math.sign(q.lateral);
      const nrmX = -side * q.right.x, nrmZ = -side * q.right.z;
      const vin = -(this.vel.x * nrmX + this.vel.z * nrmZ);
      nx = q.centerX + q.right.x * side * WALL_LIMIT;
      nz = q.centerZ + q.right.z * side * WALL_LIMIT;
      if (vin > 0) {
        this.vel.x += nrmX * vin * 1.4; this.vel.z += nrmZ * vin * 1.4;
        const loss = clamp(vin * 0.035, 0.02, 0.6);
        this.vel.multiplyScalar(1 - loss);
        const trackYaw = Math.atan2(-q.fwd.x, -q.fwd.z);
        this.yaw += angleDiff(this.yaw, trackYaw) * clamp(0.25 + vin * 0.03, 0, 0.6);
        this.events.push({ type: 'wall', strength: clamp(vin / 25, 0.1, 1), x: nx + q.right.x * side * 1.0, y: this.pos.y + 0.5, z: nz + q.right.z * side * 1.0, nx: nrmX, nz: nrmZ });
      }
      fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.speed = this.vel.x * fwd.x + this.vel.z * fwd.z;
    }
    // Soft end wall at the run-off
    if ((q.index > NUM_SAMPLES - 10 && this.speed > 0) || (q.index < 2 && this.speed < 0)) {
      this.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
      this.speed = this.vel.x * fwd.x + this.vel.z * fwd.z;
    }

    // Vertical
    if (this.grounded) {
      if (q.groundY !== null) {
        const predicted = this.pos.y + this.vy * dt - 0.5 * GRAVITY * dt * dt;
        if (predicted > q.groundY + 0.012) {
          this.grounded = false; this.airTime = 0; this.pos.y = predicted;
        } else {
          this.vy = (q.groundY - this.pos.y) / dt;
          this.pos.y = q.groundY;
        }
      } else {
        this.grounded = false; this.airTime = 0;
        this.pos.y += this.vy * dt;
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (q.groundY !== null && this.pos.y <= q.groundY && this.pos.y > q.groundY - 4.0) {
        const impact = -this.vy;
        this.pos.y = q.groundY;
        this.grounded = true; this.vy = 0;
        if (impact > 6) this.vel.multiplyScalar(1 - clamp((impact - 6) * 0.01, 0, 0.3));
        if (this.airTime > 0.15) this.events.push({ type: 'land', strength: clamp(impact / 25, 0.15, 1) });
        this.airTime = 0;
      }
    }

    this.pos.x = nx; this.pos.z = nz;
    this.trackIndex = q.index;
    this.query = q;
  }

  // ---------------------------------------------------------------------
  computeTargetQuat() {
    const q = this.query;
    if (this.grounded && q && q.groundY !== null) {
      _carRightB.set(q.right.x, Math.tan(q.bank), q.right.z).normalize();
      _carUp.crossVectors(_carRightB, q.tan).normalize();
      _carF.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _carF.addScaledVector(_carUp, -_carF.dot(_carUp)).normalize();
      _carR.crossVectors(_carF, _carUp).normalize();
      _carBk.copy(_carF).negate();
      _carM.makeBasis(_carR, _carUp, _carBk);
      this._targetQuat.setFromRotationMatrix(_carM);
    } else {
      const pitch = clamp(this.vy * 0.03, -0.4, 0.4);
      this._targetQuat.setFromEuler(_carE.set(pitch, this.yaw, 0, 'YXZ'));
    }
  }

  updateVisual(dt) {
    this.computeTargetQuat();
    this.group.quaternion.slerp(this._targetQuat, 1 - Math.exp(-(this.grounded ? 14 : 5) * dt));
    this.group.position.copy(this.pos);
    if (!this.body) return;
    const sr = clamp(Math.abs(this.speed) / MAX_SPEED, 0, 1);
    this.body.rotation.z = damp(this.body.rotation.z, this.lastSteer * 0.06 * (0.3 + sr), 8, dt);
    this.body.rotation.x = damp(this.body.rotation.x, clamp(this.accelEst * -0.004, -0.06, 0.06), 6, dt);
    this.wheelSpin -= this.speed * dt / 0.42;
    for (const s of this.spins) s.rotation.x = this.wheelSpin;
    const vs = -this.lastSteer * 0.5;
    for (const p of this.frontPivots) p.rotation.y = damp(p.rotation.y, vs, 12, dt);
  }

  rearWheelWorld(i, out) {
    return this.wheels[2 + i].getWorldPosition(out);
  }
}
