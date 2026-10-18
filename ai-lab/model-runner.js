export const LIFECYCLE = Object.freeze(['IDLE', 'PREPARING', 'DOWNLOADING', 'INITIALIZING', 'RUNNING', 'VALIDATING', 'RESULT', 'DISPOSING']);

export class ModelSequenceController {
  #worker = null;
  #active = false;
  #stopped = false;
  #sequence = 0;
  #cancelPending = null;
  constructor({ workerFactory = () => new Worker('./lab-worker.js', { type: 'module' }), timeoutMs = 600_000, onEvent = () => {} } = {}) {
    this.workerFactory = workerFactory;
    this.timeoutMs = timeoutMs;
    this.onEvent = onEvent;
  }
  get active() { return this.#active; }
  emit(state, detail = {}) { this.onEvent({ state, ...detail }); }
  async run(models, payloadFactory) {
    if (this.#active) throw new Error('RUN_ALREADY_ACTIVE');
    if (!Array.isArray(models) || !models.length) throw new Error('NO_MODELS_SELECTED');
    this.#active = true; this.#stopped = false;
    const results = [];
    try {
      for (let index = 0; index < models.length && !this.#stopped; index += 1) {
        const model = models[index];
        this.emit('PREPARING', { model, index, total: models.length });
        this.#worker = this.workerFactory(model);
        try {
          const result = await this.request('run', { model, ...payloadFactory(model) }, model);
          if (!this.#stopped) { results.push(result); this.emit('RESULT', { model, result, index, total: models.length }); }
        } catch (error) {
          const result = { ok: false, error: error.code || error.message || 'MODEL_FAILED', diagnostic: error.diagnostic || null };
          if (!this.#stopped) { results.push(result); this.emit('RESULT', { model, result, index, total: models.length }); }
        } finally {
          this.emit('DISPOSING', { model, index, total: models.length });
          if (!this.#stopped) {
            try { await this.request('dispose', {}, model, 15_000); } catch {}
          }
          this.#worker?.terminate(); this.#worker = null;
        }
      }
      return results;
    } finally {
      this.#active = false;
      this.emit('IDLE', { stopped: this.#stopped, results });
    }
  }
  request(action, payload, model, timeoutMs = this.timeoutMs) {
    const worker = this.#worker;
    if (!worker) return Promise.reject(new Error('WORKER_UNAVAILABLE'));
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup(); const error = new Error('MODEL_TIMEOUT'); error.code = 'MODEL_TIMEOUT'; reject(error); worker.terminate();
        if (this.#worker === worker) this.#worker = null;
      }, timeoutMs);
      const onMessage = ({ data }) => {
        if (data?.id !== id) {
          if (data?.event) this.emit(data.event, { model, ...data.detail });
          return;
        }
        cleanup();
        if (data.error) { const error = new Error(data.error); error.code = data.error; error.diagnostic = data.diagnostic; reject(error); }
        else resolve(data.result);
      };
      const onError = event => { cleanup(); const error = new Error('WORKER_RUNTIME'); error.diagnostic = event?.message || null; reject(error); };
      const cleanup = () => {
        clearTimeout(timer); worker.removeEventListener?.('message', onMessage); worker.removeEventListener?.('error', onError);
        if (this.#cancelPending === cancel) this.#cancelPending = null;
      };
      const cancel = () => { cleanup(); const error = new Error('MODEL_CANCELLED'); error.code = 'MODEL_CANCELLED'; reject(error); };
      this.#cancelPending = cancel;
      worker.addEventListener('message', onMessage); worker.addEventListener('error', onError); worker.postMessage({ id, action, payload });
    });
  }
  stop() {
    if (!this.#active) return false;
    this.#stopped = true; this.#cancelPending?.(); this.#worker?.terminate(); this.#worker = null;
    this.emit('DISPOSING', { cancelled: true });
    return true;
  }
}
