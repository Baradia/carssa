import * as THREE from 'three';
import { Car } from './car.js';
import { Track } from './track.js';
import { Input } from './input.js';
import { Timer } from './timer.js';

export class Game {
    constructor(scene, camera, ui) {
        this.scene = scene;
        this.camera = camera;
        this.ui = ui;
        this.input = new Input();
        this.timer = new Timer();
        
        this.state = 'menu'; // menu, countdown, racing, paused, finished
        
        this.track = new Track(scene);
        this.car = new Car(scene, this.track);
        
        this.checkpoints = this.track.checkpoints;
        this.currentCheckpoint = 0;
        this.respawnPoint = { pos: this.track.startPos.clone(), rot: this.track.startRot.clone() };
        
        this.stuckTimer = 0;
        this.audioCtx = null; // Do not initialize audio until user clicks start
        
        this.ui.bindGame(this);
        this.resetGame();
    }

    initAudio() {
        if (!this.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.audioCtx = new AudioCtx();
            }
        }
    }

    playTone(freq, type, duration) {
        this.initAudio();
        if (!this.audioCtx) return; // Fail gracefully if browser blocks audio
        
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    startRaceSequence() {
        this.initAudio(); // Safe to init here because of the button click
        
        this.resetGame();
        this.ui.showHUD();
        this.state = 'countdown';
        let count = 3;
        this.ui.updateCountdown(count);
        this.playTone(400, 'square', 0.2);

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.ui.updateCountdown(count);
                this.playTone(400, 'square', 0.2);
            } else if (count === 0) {
                this.ui.updateCountdown('GO!');
                this.playTone(800, 'square', 0.4);
                this.state = 'racing';
                this.timer.start();
            } else {
                this.ui.hideCountdown();
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    resetGame() {
        this.car.reset(this.track.startPos, this.track.startRot);
        this.currentCheckpoint = 0;
        this.respawnPoint = { pos: this.track.startPos.clone(), rot: this.track.startRot.clone() };
        this.timer.reset();
        this.track.resetGates();
        this.ui.updateCheckpoints(0, this.checkpoints.length);
        this.ui.updateTime('00:00.000');
    }

    respawn() {
        this.ui.flashScreen();
        this.car.reset(this.respawnPoint.pos, this.respawnPoint.rot);
        this.stuckTimer = 0;
    }

    togglePause() {
        if (this.state === 'racing') {
            this.state = 'paused';
            this.timer.stop();
            this.ui.showPauseMenu();
        } else if (this.state === 'paused') {
            this.state = 'racing';
            this.timer.resume();
            this.ui.hidePauseMenu();
        }
    }

    finishRace() {
        this.state = 'finished';
        this.timer.stop();
        const finalTime = this.timer.elapsed;
        const formatted = this.timer.getFormattedTime();
        const bestTime = this.timer.getBestTime();
        
        let isRecord = false;
        if (!bestTime || finalTime < bestTime) {
            this.timer.saveBestTime(finalTime);
            isRecord = true;
        }

        this.playTone(600, 'sine', 0.1);
        setTimeout(() => this.playTone(800, 'sine', 0.4), 100);
        this.ui.showFinishScreen(formatted, this.timer.formatTime(this.timer.getBestTime()), isRecord);
    }

    update(dt) {
        if (this.input.isJustPressed('esc') && (this.state === 'racing' || this.state === 'paused')) {
            this.togglePause();
        }

        if (this.input.isJustPressed('r') && (this.state === 'racing' || this.state === 'finished')) {
            if(this.state === 'finished') this.startRaceSequence();
            else this.respawn();
        }

        if (this.state !== 'racing' && this.state !== 'countdown' && this.state !== 'finished') return;

        // Physics run during countdown to allow dropping to floor, but input blocked
        const canDrive = this.state === 'racing';
        this.car.update(dt, canDrive ? this.input : null, this.track.mesh);

        if (this.state === 'racing') {
            this.ui.updateTime(this.timer.getFormattedTime());
            this.ui.updateSpeed(this.car.speed);
            
            // Checkpoint Logic
            if (this.currentCheckpoint < this.checkpoints.length) {
                const cp = this.checkpoints[this.currentCheckpoint];
                if (this.car.mesh.position.distanceTo(cp.position) < 25) {
                    this.respawnPoint = { pos: cp.position.clone(), rot: cp.rotation.clone() };
                    this.currentCheckpoint++;
                    this.track.highlightGate(this.currentCheckpoint - 1);
                    this.ui.updateCheckpoints(this.currentCheckpoint, this.checkpoints.length);
                    this.playTone(600, 'sine', 0.1);
                }
            } else {
                // Finish Line
                if (this.car.mesh.position.distanceTo(this.track.finishPos) < 25) {
                    this.finishRace();
                }
            }

            // Anti-Stuck & Fall out of bounds
            if (this.car.mesh.position.y < -50) {
                this.respawn();
            } else if (Math.abs(this.car.speed) < 1 && this.car.grounded) {
                this.stuckTimer += dt;
                if (this.stuckTimer > 3) this.respawn();
            } else {
                this.stuckTimer = 0;
            }
        } else if (this.state === 'finished') {
            // Slow down automatically
            this.car.speed *= 0.98;
        }

        this.updateCamera(dt);
        this.car.updateParticles(dt);
    }

    updateCamera(dt) {
        // Third person follow
        const offset = new THREE.Vector3(0, 4, -12);
        offset.applyQuaternion(this.car.mesh.quaternion);
        
        const targetPos = this.car.mesh.position.clone().add(offset);
        this.camera.position.lerp(targetPos, 10 * dt);
        
        const lookAtPos = this.car.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        this.camera.lookAt(lookAtPos);

        // Dynamic FOV
        const speedRatio = Math.min(Math.abs(this.car.speed) / 300, 1);
        const targetFov = 70 + (12 * speedRatio);
        this.camera.fov += (targetFov - this.camera.fov) * 5 * dt;
        this.camera.updateProjectionMatrix();
    }
}