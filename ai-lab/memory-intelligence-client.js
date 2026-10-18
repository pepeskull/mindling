export class MemoryIntelligenceClient {
  #worker = null; #sequence = 0; #pending = new Map();
  constructor({ workerFactory = () => new Worker('./memory-intelligence-worker.js', { type: 'module' }), onEvent = () => {} } = {}) { this.workerFactory = workerFactory; this.onEvent = onEvent; }
  #ensureWorker() {
    if (this.#worker) return;
    this.#worker = this.workerFactory();
    this.#worker.addEventListener('message', ({ data }) => {
      if (data?.event) { this.onEvent(data); return; }
      const pending = this.#pending.get(data?.id); if (!pending) return;
      this.#pending.delete(data.id); clearTimeout(pending.timer);
      if (data.error) { const error = Error(data.error); error.code = data.error; error.diagnostic = data.diagnostic; pending.reject(error); } else pending.resolve(data.result);
    });
    this.#worker.addEventListener('error', event => {
      for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(Error(event.message || 'MEMORY_WORKER_FAILED')); }
      this.#pending.clear(); this.#worker?.terminate(); this.#worker = null;
    });
  }
  request(action, payload = {}, timeoutMs = 600_000) {
    this.#ensureWorker(); const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(Error('MEMORY_PIPELINE_TIMEOUT')); this.#worker?.terminate(); this.#worker = null; }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer }); this.#worker.postMessage({ id, action, payload });
    });
  }
  initialize() { return this.request('init'); }
  analyze(payload) { return this.request('analyze', payload, 240_000); }
  async dispose() { if (!this.#worker) return; try { await this.request('dispose', {}, 15_000); } catch {} this.#worker?.terminate(); this.#worker = null; }
}
