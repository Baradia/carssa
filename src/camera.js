import * as THREE from 'three';
import { damp, WORLD_UP } from './utils.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.rel = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fov = 70;
    this.roll = 0;
    this._desiredRel = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._lookT = new THREE.Vector3();
  }

  _desired(car, speedRatio, out) {
    const f = this._fwd.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
    const dist = 7.8 + speedRatio * 2.8;
    out.set(-f.x * dist, 3.1 + speedRatio * 0.7, -f.z * dist);
  }

  snap(car) {
    this._desired(car, 0, this.rel);
    this.pos.copy(car.pos).add(this.rel);
    this.look.set(car.pos.x, car.pos.y + 1.1, car.pos.z);
    this.roll = 0; this.shake = 0; this.fov = 70;
    this.apply();
  }

  update(car, dt, speedRatio, steer) {
    this._desired(car, speedRatio, this._desiredRel);
    // Horizontal offset is smoothed relative to the car (no lag at speed); height is smoothed absolutely.
    const k = 1 - Math.exp(-6 * dt);
    this.rel.x += (this._desiredRel.x - this.rel.x) * k;
    this.rel.z += (this._desiredRel.z - this.rel.z) * k;
    this.pos.x = car.pos.x + this.rel.x;
    this.pos.z = car.pos.z + this.rel.z;
    this.pos.y = damp(this.pos.y, car.pos.y + this._desiredRel.y, 9, dt);
    const f = this._fwd;
    this._lookT.set(car.pos.x + f.x * (5 + speedRatio * 5), car.pos.y + 1.1, car.pos.z + f.z * (5 + speedRatio * 5));
    this.look.lerp(this._lookT, 1 - Math.exp(-12 * dt));
    this.roll = damp(this.roll, -steer * 0.05 * (0.4 + speedRatio), 5, dt);
    this.fov = damp(this.fov, 70 + 12 * Math.pow(speedRatio, 1.4), 4, dt);
    this.shake = damp(this.shake, 0, 7, dt);
    this.apply();
  }

  orbit(center, angle, dt) {
    const tx = center.x + Math.cos(angle) * 18, ty = center.y + 5.5, tz = center.z + Math.sin(angle) * 18;
    this.pos.x = damp(this.pos.x, tx, 4, dt); this.pos.y = damp(this.pos.y, ty, 4, dt); this.pos.z = damp(this.pos.z, tz, 4, dt);
    this._lookT.set(center.x, center.y + 1, center.z);
    this.look.lerp(this._lookT, 1 - Math.exp(-6 * dt));
    this.roll = damp(this.roll, 0, 4, dt);
    this.fov = damp(this.fov, 62, 4, dt);
    this.shake = 0;
    this.apply();
  }

  addShake(a) { this.shake = Math.min(1.3, this.shake + a); }

  apply() {
    const cam = this.camera;
    const dir = this._dir.subVectors(this.look, this.pos).normalize();
    const right = this._right.crossVectors(dir, WORLD_UP).normalize();
    this._up.copy(WORLD_UP).multiplyScalar(Math.cos(this.roll)).addScaledVector(right, Math.sin(this.roll));
    cam.up.copy(this._up);
    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      cam.position.z += (Math.random() - 0.5) * this.shake;
    }
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
