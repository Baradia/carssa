import * as THREE from 'three';
import { createTrackData, buildTrackMeshes, HALF_WIDTH } from './track.js';
import { buildScenery } from './scenery.js';
import { Car, MAX_SPEED } from './car.js';
import { ChaseCamera } from './camera.js';
import { Ghost } from './ghost.js';
import { Input } from './input.js';
import { RaceTimer } from './timer.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { ParticleSystem, SkidMarks } from './particles.js';
import { clamp, smoothstep } from './utils.js';

const BEST_KEY = 'neonRushBestTime';
const STATE = { MENU: 'menu', COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished' };
const COUNTDOWN_STEPS = [0.7, 1.6, 2.5, 3.4];
const PHYSICS_STEP = 1 / 120;

const _gW = new THREE.Vector3(), _gW2 = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090616);
    this.scene.fog = new THREE.Fog(0x090616, 140, 1200);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2600);

    this.scene.add(new THREE.HemisphereLight(0x5a4a9a, 0x0d2a18, 0.55));
    this.scene.add(new THREE.AmbientLight(0x30284a, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;

    this.track = createTrackData();
    this.trackMeshes = buildTrackMeshes(this.scene, this.track);
    buildScenery(this.scene, this.track);

    this.car = new Car(this.scene);
    this.ghost = new Ghost(this.scene);
    this.chase = new ChaseCamera(this.camera);
    this.particles = new ParticleSystem(this.scene);
    this.skids = new SkidMarks(this.scene);
    this.input = new Input();
    this.timer = new RaceTimer();
    this.ui = new UI();
    this.audio = new AudioManager();

    this.bestTime = this.loadBest();
    this.state = STATE.MENU;
    this.paused = false;
    this.time = 0;
    this.menuAngle = 0;
    this.nextCp = 0;
    this.countdownTime = 0; this.countdownStep = 0;
    this.stuckTime = 0;
    this.respawning = false; this.respawnTimer = 0; this.respawnDone = false;
    this.finishTimer = 0; this.finishShown = false; this.finishResult = null;

    this.ui.onStart = () => { this.audio.init(); this.startRace(); };
    this.ui.onRestart = () => this.startRace();
    this.ui.onResume = () => this.togglePause();
    this.ui.onMenu = () => this.showMenu();
    this.ui.onMute = () => this.ui.setMute(this.audio.toggleMute());
    this.ui.setMute(this.audio.muted);
    this.input.onRestart = () => { if (this.state !== STATE.MENU) this.startRace(); };
    this.input.onPause = () => { if (this.state === STATE.COUNTDOWN || this.state === STATE.RACING) this.togglePause(); };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && (this.state === STATE.RACING || this.state === STATE.COUNTDOWN)) this.togglePause();
    });

    this.showMenu();
    this.lastNow = performance.now();
    this._loop = (now) => this.loop(now);
    requestAnimationFrame(this._loop);
  }

  // ---------------------------------------------------------------- storage
  loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw == null) return null;
      const v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v <= 0 || v > 3600000) return null;
      return v;
    } catch (e) { return null; }
  }
  saveBest(ms) {
    try { localStorage.setItem(BEST_KEY, String(Math.round(ms))); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- states
  showMenu() {
    this.state = STATE.MENU;
    this.paused = false;
    this.timer.reset();
    this.ui.hidePause(); this.ui.hideFinish(); this.ui.hideCountdown(); this.ui.hideHUD();
    this.ui.setSpeedLines(0);
    this.ui.showMenu(this.bestTime, this.ghost.time);
    this.ghost.setVisible(false);
    this.resetCar();
    this.resetCheckpoints();
    this.trackMeshes.setCountdown(0);
    this.particles.clear(); this.skids.clear();
    this.chase.snap(this.car);
  }

  startRace() {
    this.audio.resume();
    this.state = STATE.COUNTDOWN;
    this.paused = false;
    this.ui.hideMenu(); this.ui.hidePause(); this.ui.hideFinish();
    this.ui.showHUD();
    this.ui.setBest(this.bestTime);
    this.ui.setTimer(0);
    this.resetCar();
    this.resetCheckpoints();
    this.timer.reset();
    this.countdownTime = 0; this.countdownStep = 0;
    this.trackMeshes.setCountdown(0);
    this.ui.showCountdown();
    this.particles.clear(); this.skids.clear();
    this.stuckTime = 0; this.respawning = false; this.finishShown = false; this.finishTimer = 0;
    this.ui.fadeOut();
    this.ghost.recording = null;
    this.ghost.setTime(0);
    this.ghost.setVisible(true);
    this.chase.snap(this.car);
  }

  resetCar() {
    this.car.controlsEnabled = false;
    this.car.reset(this.track.start.pos, this.track.start.yaw, this.track);
  }

  resetCheckpoints() {
    this.nextCp = 0;
    this.trackMeshes.gates.forEach((g, i) => g.setState(i === 0 ? 'next' : 'upcoming'));
    this.ui.setCheckpoint(0, this.track.checkpoints.length);
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.timer.pause();
      this.input.clear();
      this.ui.showPause();
      this.audio.updateEngine(0, 0, false);
    } else {
      this.timer.resume();
      this.ui.hidePause();
      this.audio.resume();
      this.lastNow = performance.now();
    }
  }

  finishRace() {
    const final = this.timer.stop();
    this.state = STATE.FINISHED;
    this.car.controlsEnabled = false;
    this.car.finishing = true;
    const prevBest = this.bestTime;
    const isRecord = !prevBest || final < prevBest;
    if (isRecord) { this.bestTime = Math.round(final); this.saveBest(this.bestTime); }
    const ghostTime = this.ghost.time;
    this.finishResult = { time: final, best: this.bestTime, isRecord, prevBest, ghostTime };
    this.ghost.finishRecording(final, this.car, isRecord);
    this.finishTimer = 0; this.finishShown = false;
    this.ui.setTimer(final);
    this.ui.setBest(this.bestTime);
    this.ui.flashMessage('Finish', ghostTime == null ? null : final - ghostTime);
    this.audio.finish();
    if (isRecord) this.audio.record();
    const ft = this.trackMeshes.finishTop;
    this.particles.confetti(ft.x, ft.y, ft.z, 260);
    this.chase.addShake(0.25);
  }

  triggerRespawn() {
    if (this.respawning) return;
    this.respawning = true; this.respawnTimer = 0; this.respawnDone = false;
    this.ui.fadeIn();
    this.audio.respawn();
  }
  doRespawnReset() {
    const rp = this.nextCp > 0 ? this.track.checkpoints[this.nextCp - 1].respawn : this.track.start;
    const wasEnabled = this.car.controlsEnabled;
    this.track.setQueryHint(this.nextCp > 0 ? this.track.checkpoints[this.nextCp - 1].index : this.track.startIndex);
    this.car.reset(rp.pos, rp.yaw, this.track);
    this.car.controlsEnabled = wasEnabled;
    this.chase.snap(this.car);
    this.skids.lift(0); this.skids.lift(1);
    this.stuckTime = 0;
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame(this._loop);
    let dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    this.input.update(dt);
    const car = this.car, track = this.track;

    if (this.state === STATE.MENU) {
      this.menuAngle += dt * 0.18;
      car.updateVisual(dt);
      this.chase.orbit(car.pos, this.menuAngle, dt);
      this.followLight();
      this.particles.update(dt);
      this.audio.updateEngine(0, 0, false);
      return;
    }

    if (this.state === STATE.COUNTDOWN) {
      this.countdownTime += dt;
      while (this.countdownStep < 4 && this.countdownTime >= COUNTDOWN_STEPS[this.countdownStep]) {
        this.countdownStep++;
        const n = this.countdownStep;
        this.trackMeshes.setCountdown(n);
        this.ui.setCountdown(n);
        if (n < 4) this.audio.countdown();
        else {
          this.audio.go();
          this.state = STATE.RACING;
          this.timer.start();
          this.ghost.startRecording();
          car.controlsEnabled = true;
        }
      }
    }

    if (this.respawning) {
      this.respawnTimer += dt;
      if (!this.respawnDone && this.respawnTimer >= 0.16) { this.doRespawnReset(); this.respawnDone = true; this.ui.fadeOut(); }
      if (this.respawnTimer >= 0.45) this.respawning = false;
    } else {
      const idxBefore = car.trackIndex;
      const steps = clamp(Math.ceil(dt / PHYSICS_STEP), 1, 8);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) car.update(h, this.input, track);
      this.handleCarEvents();
      if (this.state === STATE.RACING) {
        this.checkProgress(idxBefore, car.trackIndex);
        this.checkHazards(dt);
      }
      if (this.state === STATE.FINISHED) {
        this.finishTimer += dt;
        if (!this.finishShown && this.finishTimer >= 1.3) { this.finishShown = true; this.ui.showFinish(this.finishResult); }
      }
    }

    car.updateVisual(dt);
    car.group.updateMatrixWorld(true);
    this.updateEffects(dt);
    this.particles.update(dt);

    const sr = clamp(Math.abs(car.speed) / MAX_SPEED, 0, 1);
    this.chase.update(car, dt, sr, car.lastSteer);
    this.followLight();
    this.trackMeshes.gates.forEach((g) => g.update(this.time));

    if (this.state === STATE.RACING) { this.ghost.record(this.timer.elapsed, car); this.ghost.setTime(this.timer.elapsed); }
    else if (this.state === STATE.FINISHED) this.ghost.setTime(this.timer.elapsed);

    // HUD
    if (this.state === STATE.RACING) this.ui.setTimer(this.timer.elapsed);
    this.ui.setSpeed(Math.round(Math.abs(car.speed) * 3.6), sr);
    this.ui.setSpeedLines(smoothstep(0.55, 1, sr) * 0.9);
    this.audio.updateEngine(sr, car.controlsEnabled ? this.input.throttle : 0, true);
  }

  followLight() {
    const p = this.car.pos;
    this.sun.position.set(p.x + 60, p.y + 110, p.z + 40);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }

  handleCarEvents() {
    const ev = this.car.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'wall') {
        this.particles.sparks(e.x, e.y, e.z, e.nx, e.nz, Math.round(6 + e.strength * 14));
        if (e.strength > 0.12) { this.audio.collision(e.strength); this.chase.addShake(0.15 + e.strength * 0.5); }
      } else if (e.type === 'land') {
        const p = this.car.pos;
        this.particles.dust(p.x, p.y, p.z, Math.round(10 + e.strength * 20));
        this.audio.landing(e.strength);
        this.chase.addShake(0.2 + e.strength * 0.5);
      }
    }
    ev.length = 0;
  }

  checkProgress(idxBefore, idxNow) {
    const cps = this.track.checkpoints;
    const q = this.car.query;
    if (this.nextCp < cps.length) {
      const cp = cps[this.nextCp];
      if (idxBefore < cp.index && idxNow >= cp.index && Math.abs(q.lateral) < HALF_WIDTH + 1.2) {
        this.trackMeshes.gates[this.nextCp].setState('passed');
        this.nextCp++;
        if (this.nextCp < cps.length) this.trackMeshes.gates[this.nextCp].setState('next');
        this.ui.setCheckpoint(this.nextCp, cps.length);
        const now = this.timer.elapsed;
        this.ghost.recordCheckpoint(now);
        const gt = this.ghost.timeAt(this.nextCp);
        this.ui.flashMessage(`Checkpoint ${this.nextCp}`, gt == null ? null : now - gt);
        this.audio.checkpoint();
      }
    } else if (idxBefore < this.track.finishIndex && idxNow >= this.track.finishIndex && Math.abs(q.lateral) < HALF_WIDTH + 1.2) {
      this.finishRace();
    }
  }

  checkHazards(dt) {
    const car = this.car, q = car.query;
    if (!q) return;
    const fell = car.pos.y < q.centerY - 12 || car.pos.y < this.track.terrainHeight(car.pos.x, car.pos.z) - 3;
    const outOfArea = q.dist > 45;
    if (fell || outOfArea) { this.triggerRespawn(); return; }
    // Anti-stuck: trying to drive but not moving for > 3 s.
    const trying = this.input.throttle > 0 || this.input.brake > 0;
    if (car.grounded && Math.abs(car.speed) < 0.8 && trying) this.stuckTime += dt;
    else this.stuckTime = 0;
    if (this.stuckTime > 3) this.triggerRespawn();
  }

  updateEffects(dt) {
    const car = this.car;
    const spd = Math.abs(car.speed);
    const slipping = car.grounded && spd > 8 && (car.driftAmount > 0.35 || Math.abs(car.lateralSpeed) > 6);
    if (slipping && this.state !== STATE.MENU) {
      const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
      const intensity = clamp(car.driftAmount + Math.abs(car.lateralSpeed) / 12, 0.3, 1.2);
      for (let i = 0; i < 2; i++) {
        car.rearWheelWorld(i, _gW);
        this.particles.smoke(_gW.x, _gW.y - 0.3, _gW.z, car.vel.x, car.vel.z, Math.random() < intensity * dt * 60 ? 2 : 1);
        this.skids.add(i, _gW.x, _gW.y - 0.4, _gW.z, rx, rz);
      }
    } else {
      this.skids.lift(0); this.skids.lift(1);
    }
    // Landing dust trail / rear wheel dust at high speed off the racing line is skipped to keep particles cheap.
    if (this.state === STATE.FINISHED && this.finishTimer < 2.5 && Math.random() < 0.5) {
      const ft = this.trackMeshes.finishTop;
      this.particles.confetti(ft.x, ft.y, ft.z, 3);
    }
    void _gW2;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
