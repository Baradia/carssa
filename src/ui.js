import { formatTime, formatDiff } from './timer.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('hud-timer'), best: $('hud-best'), cp: $('hud-cp'), speed: $('hud-speed'),
      speedFill: $('hud-speedbar-fill'), msg: $('hud-message'), speedlines: $('speedlines'),
      countdown: $('countdown'), cdLights: Array.from(document.querySelectorAll('#countdown .cd-light')), cdText: $('cd-text'),
      menu: $('menu'), menuBest: $('menu-best'), menuGhost: $('menu-ghost'), startBtn: $('start-btn'),
      pause: $('pause'), pauseResume: $('pause-resume'),
      finish: $('finish'), finishPanel: document.querySelector('#finish .panel'), finishTime: $('finish-time'),
      finishBest: $('finish-best'), finishDiff: $('finish-diff'), finishGhost: $('finish-ghost'), finishRecord: $('finish-record'), finishRestart: $('finish-restart'),
      fade: $('fade'), mute: $('mute-btn'), muteLabel: document.querySelector('#mute-btn .mute-label'),
      error: $('error'), errorText: $('error-text'),
    };
    this.onStart = null; this.onRestart = null; this.onResume = null; this.onMenu = null; this.onMute = null;
    $('start-btn').addEventListener('click', () => this.onStart && this.onStart());
    $('pause-resume').addEventListener('click', () => this.onResume && this.onResume());
    $('pause-restart').addEventListener('click', () => this.onRestart && this.onRestart());
    $('finish-restart').addEventListener('click', () => this.onRestart && this.onRestart());
    $('pause-menu').addEventListener('click', () => this.onMenu && this.onMenu());
    $('finish-menu').addEventListener('click', () => this.onMenu && this.onMenu());
    this.el.mute.addEventListener('click', () => { if (this.onMute) this.onMute(); this.el.mute.blur(); });
    this._lastTimer = ''; this._lastSpeed = -1; this._lastFill = -1; this._sl = -1; this._cdTimer = 0;
  }

  _show(el) { el.classList.remove('hidden'); }
  _hide(el) { el.classList.add('hidden'); if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); }

  showError(text) { this.el.errorText.textContent = text; this._show(this.el.error); }

  showMenu(best, ghostTime) {
    this.el.menuBest.textContent = best ? formatTime(best) : '--:--.---';
    this.el.menuGhost.textContent = ghostTime ? formatTime(ghostTime) : 'Finish a lap to create one';
    this._show(this.el.menu);
    this.el.startBtn.focus();
  }
  hideMenu() { this._hide(this.el.menu); }

  showHUD() { this._show(this.el.hud); }
  hideHUD() { this._hide(this.el.hud); }

  setTimer(ms) {
    const t = formatTime(ms);
    if (t !== this._lastTimer) { this.el.timer.textContent = t; this._lastTimer = t; }
  }
  setBest(best) { this.el.best.textContent = best ? formatTime(best) : '--:--.---'; }
  setCheckpoint(n, total) { this.el.cp.textContent = `${n} / ${total}`; }
  setSpeed(kmh, ratio) {
    if (kmh !== this._lastSpeed) { this.el.speed.textContent = String(kmh); this._lastSpeed = kmh; }
    const f = Math.round(ratio * 200) / 2;
    if (f !== this._lastFill) { this.el.speedFill.style.width = f + '%'; this._lastFill = f; }
  }
  // delta (ms) is the split against the ghost: negative = ahead.
  flashMessage(text, delta) {
    const m = this.el.msg;
    if (delta == null) m.textContent = text;
    else {
      m.textContent = '';
      const line = document.createElement('div'); line.textContent = text;
      const d = document.createElement('div');
      d.className = 'hud-delta ' + (delta <= 0 ? 'ahead' : 'behind');
      d.textContent = (delta <= 0 ? '▲ ' : '▼ ') + formatDiff(delta) + ' vs ghost';
      m.appendChild(line); m.appendChild(d);
    }
    m.classList.remove('show');
    void m.offsetWidth; // restart the animation
    m.classList.add('show');
  }
  setSpeedLines(v) {
    if (Math.abs(v - this._sl) > 0.01) { this.el.speedlines.style.opacity = v.toFixed(2); this._sl = v; }
  }

  showCountdown() {
    clearTimeout(this._cdTimer);
    this._show(this.el.countdown);
    this.setCountdown(0);
  }
  hideCountdown() { this._hide(this.el.countdown); }
  // step 0: all dark, 1-3: red lights, 4: green + GO
  setCountdown(step) {
    this.el.cdLights.forEach((l, i) => {
      l.classList.toggle('lit', step >= 1 && step <= 3 && i < step);
      l.classList.toggle('go', step >= 4);
    });
    const t = this.el.cdText;
    t.classList.toggle('go', step >= 4);
    t.textContent = step === 0 ? 'Ready' : step < 4 ? String(4 - step) : 'GO!';
    if (step >= 4) {
      clearTimeout(this._cdTimer);
      this._cdTimer = setTimeout(() => this.hideCountdown(), 1000);
    }
  }

  showPause() { this._show(this.el.pause); this.el.pauseResume.focus(); }
  hidePause() { this._hide(this.el.pause); }

  showFinish({ time, best, isRecord, prevBest, ghostTime }) {
    const e = this.el;
    e.finishTime.textContent = formatTime(time);
    e.finishBest.textContent = formatTime(best);
    e.finishRecord.classList.toggle('hidden', !isRecord);
    e.finishDiff.className = 'diff';
    if (prevBest) {
      const d = time - prevBest;
      e.finishDiff.textContent = (d < 0 ? 'Faster than your best by ' : 'Slower than your best by ') + formatDiff(d).slice(1);
      e.finishDiff.classList.add(d < 0 ? 'faster' : 'slower');
    } else {
      e.finishDiff.textContent = 'First completed run';
    }
    e.finishGhost.textContent = ''; e.finishGhost.className = 'diff';
    if (ghostTime) {
      const gd = time - ghostTime;
      e.finishGhost.textContent = (gd <= 0 ? 'Ahead of your ghost by ' : 'Behind your ghost by ') + formatDiff(gd).slice(1);
      e.finishGhost.className = 'diff ' + (gd <= 0 ? 'faster' : 'slower');
    }
    e.finishPanel.classList.remove('flash');
    void e.finishPanel.offsetWidth;
    if (isRecord) e.finishPanel.classList.add('flash');
    this._show(e.finish);
    e.finishRestart.focus();
  }
  hideFinish() { this._hide(this.el.finish); }

  fadeIn() { this.el.fade.classList.add('on'); }
  fadeOut() { this.el.fade.classList.remove('on'); }

  setMute(muted) {
    this.el.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    this.el.muteLabel.textContent = muted ? 'Sound off' : 'Sound on';
  }
}
