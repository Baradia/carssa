export class Timer {
    constructor() {
        this.startTime = 0;
        this.elapsed = 0;
        this.isRunning = false;
        this.pausedTime = 0;
        this.storageKey = 'neonRushBestTime';
    }

    start() {
        this.startTime = performance.now();
        this.isRunning = true;
    }

    stop() {
        if (this.isRunning) {
            this.elapsed += performance.now() - this.startTime;
            this.isRunning = false;
        }
    }

    resume() {
        if (!this.isRunning) {
            this.startTime = performance.now();
            this.isRunning = true;
        }
    }

    reset() {
        this.elapsed = 0;
        this.isRunning = false;
    }

    getCurrentTime() {
        if (this.isRunning) {
            return this.elapsed + (performance.now() - this.startTime);
        }
        return this.elapsed;
    }

    formatTime(ms) {
        if (!ms) return '--:--.---';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        const milliseconds = String(Math.floor(ms % 1000)).padStart(3, '0');
        return `${minutes}:${seconds}.${milliseconds}`;
    }

    getFormattedTime() {
        return this.formatTime(this.getCurrentTime());
    }

    getBestTime() {
        try {
            const best = localStorage.getItem(this.storageKey);
            return best ? parseFloat(best) : null;
        } catch (e) {
            // Fail gracefully if browser blocks localStorage
            console.warn("localStorage blocked - best time will not be saved.");
            return null;
        }
    }

    saveBestTime(ms) {
        try {
            localStorage.setItem(this.storageKey, ms.toString());
        } catch (e) {
            // Fail gracefully
        }
    }
}