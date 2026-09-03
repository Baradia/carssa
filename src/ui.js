export class UI {
    constructor() {
        this.els = {
            menu: document.getElementById('main-menu'),
            hud: document.getElementById('hud'),
            pause: document.getElementById('pause-menu'),
            finish: document.getElementById('finish-screen'),
            timer: document.getElementById('timer'),
            speed: document.getElementById('speed'),
            checkpoints: document.getElementById('checkpoints'),
            countdown: document.getElementById('countdown'),
            menuBest: document.getElementById('menu-best-time'),
            finishTime: document.getElementById('finish-time'),
            finishBest: document.getElementById('finish-best-time'),
            recordMsg: document.getElementById('record-notification')
        };

        // Bind DOM buttons
        document.getElementById('btn-start').addEventListener('click', () => this.game.startRaceSequence());
        document.getElementById('btn-resume').addEventListener('click', () => this.game.togglePause());
        document.getElementById('btn-restart-pause').addEventListener('click', () => { this.hidePauseMenu(); this.game.respawn(); });
        document.getElementById('btn-restart-finish').addEventListener('click', () => { this.els.finish.classList.add('hidden'); this.game.startRaceSequence(); });
    }

    bindGame(game) {
        this.game = game;
        this.updateMenuBestTime();
    }

    updateMenuBestTime() {
        const best = this.game.timer.getBestTime();
        this.els.menuBest.textContent = this.game.timer.formatTime(best);
    }

    showHUD() {
        this.els.menu.classList.add('hidden');
        this.els.hud.classList.remove('hidden');
    }

    updateTime(timeStr) { this.els.timer.textContent = timeStr; }
    
    updateSpeed(speed) { 
        this.els.speed.textContent = `${Math.floor(Math.abs(speed))} KM/H`; 
    }
    
    updateCheckpoints(current, total) { 
        this.els.checkpoints.textContent = `CHK: ${current} / ${total}`; 
    }

    updateCountdown(val) {
        this.els.countdown.textContent = val;
        this.els.countdown.classList.remove('hidden');
    }

    hideCountdown() {
        this.els.countdown.classList.add('hidden');
    }

    showPauseMenu() {
        this.els.pause.classList.remove('hidden');
    }

    hidePauseMenu() {
        this.els.pause.classList.add('hidden');
    }

    showFinishScreen(time, bestTime, isRecord) {
        this.els.hud.classList.add('hidden');
        this.els.finish.classList.remove('hidden');
        this.els.finishTime.textContent = time;
        this.els.finishBest.textContent = `BEST: ${bestTime}`;
        if (isRecord) {
            this.els.recordMsg.classList.remove('hidden');
        } else {
            this.els.recordMsg.classList.add('hidden');
        }
        this.updateMenuBestTime();
    }

    flashScreen() {
        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.inset = '0';
        flash.style.backgroundColor = 'white';
        flash.style.zIndex = '999';
        flash.style.opacity = '0.8';
        flash.style.transition = 'opacity 0.2s';
        document.body.appendChild(flash);
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => flash.remove(), 200);
        }, 50);
    }
}