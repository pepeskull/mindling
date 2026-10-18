export class Benchmark {
  constructor() { this.started = performance.now(); this.marks = new Map(); this.downloaded = 0; this.downloadStarted = null; }
  start(name) { this.marks.set(name, performance.now()); }
  end(name) { const start = this.marks.get(name); return Number.isFinite(start) ? performance.now() - start : null; }
  progress(event) {
    if (event?.status === 'progress') {
      if (this.downloadStarted === null) this.downloadStarted = performance.now();
      if (Number.isFinite(event.loaded)) this.downloaded = Math.max(this.downloaded, event.loaded);
    }
  }
  snapshot(extra = {}) {
    return {
      totalMs: performance.now() - this.started,
      downloadBytes: this.downloaded || null,
      downloadMs: this.downloadStarted === null ? null : performance.now() - this.downloadStarted,
      memory: Number.isFinite(performance?.memory?.usedJSHeapSize) ? { usedJSHeapBytes: performance.memory.usedJSHeapSize, source: 'performance.memory' } : null,
      ...extra,
    };
  }
}

export const displayMetric = (value, suffix = '') => Number.isFinite(value) ? `${value.toFixed(value < 10 ? 2 : 0)}${suffix}` : 'Unavailable';
