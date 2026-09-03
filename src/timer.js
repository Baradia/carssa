// Monotonic race timer. Never counts frames; only real elapsed time, minus paused time.
export class RaceTimer {
  constructor() { this.reset(); }

  reset() {
    this.startTime = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.running = false;
    this.paused = false;
    this.finished = false;
    this.finalTime = 0;
  }

  start() {
    this.startTime = performance.now();
    this.pausedTotal = 0;
    this.running = true;
    this.paused = false;
    this.finished = false;
    this.finalTime = 0;
  }

  pause() {
    if (this.running && !this.paused) {
      this.paused = true;
      this.pausedAt = performance.now();
    }
  }

  resume() {
    if (this.running && this.paused) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.paused = false;
    }
  }

  stop() {
    this.finalTime = this.elapsed;
    this.running = false;
    this.paused = false;
    this.finished = true;
    return this.finalTime;
  }

  get elapsed() {
    if (!this.running) return this.finished ? this.finalTime : 0;
    const now = this.paused ? this.pausedAt : performance.now();
    return Math.max(0, now - this.startTime - this.pausedTotal);
  }
}

// MM:SS.mmm
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const t = Math.floor(ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const mil = t % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

// Signed difference for the finish screen, e.g. "+00:01.204" / "-00:00.318"
export function formatDiff(ms) {
  const sign = ms < 0 ? '-' : '+';
  return sign + formatTime(Math.abs(ms));
}
