import { EVENTS, EventBus } from '../app/events.js';
import { trainingContext, assertTrainingContext } from '../training/retrieval.js';
import { validateContext } from '../training/contract.js';
import { requestReasoning } from './reasoning-client.js';
import { cognitiveMetrics, evaluationMetrics } from './metrics.js';

// Reusable, explicitly commanded orchestration. No polling, automatic gameplay
// trigger, retry or recursive model loop. UI owns presentation; stores own writes.
export class CognitiveEngine {
  #authorized = new WeakMap();
  #active = null;
  #identity = null;
  #disposed = false;
  #notifying = false;
  #dispatching = false;
  #unsubscribe;
  constructor({ store, events = new EventBus() } = {}) {
    this.store = store; this.events = events;
    this.#unsubscribe = events.on(EVENTS.COGNITIVE_PROBLEM_RECEIVED, event => {
      const command = event && typeof event === 'object' ? this.#authorized.get(event) : null;
      if (!command) return; // Raw gameplay/event-bus messages cannot incur costs.
      this.#authorized.delete(event); command.received = true;
      this.#run(event).then(command.resolve, command.reject);
    });
  }
  setActiveMindling(mindlingId) { if (mindlingId !== this.#identity) { this.cancel(); this.#identity = mindlingId; } }
  cancel() { this.#active?.controller.abort(); this.#active = null; }
  async history() {
    if (!this.store || !this.#identity || this.#disposed) throw Error('Cognitive history is unavailable.');
    const identity = this.#identity, history = await this.store.load(identity);
    if (this.#disposed || this.#identity !== identity) throw new DOMException('Identity changed', 'AbortError');
    return { history, metrics: cognitiveMetrics(history) };
  }
  // The M4.2 UI calls this only in response to Run Evaluation. Future automatic
  // triggers require a separate policy; emitting an event does not authorize one.
  requestUserProblem({ mindlingId, problem } = {}) {
    if (this.#disposed || !this.store || typeof mindlingId !== 'string' || !mindlingId || mindlingId.length > 160 || mindlingId !== this.#identity) return Promise.reject(Error('The active Mindling is unavailable for cognitive training.'));
    if (this.#active || this.#notifying || this.#dispatching) return Promise.reject(Error('A cognitive problem is already being processed.'));
    if (typeof problem !== 'string' || !problem.trim() || problem.length > 2000) return Promise.reject(Error('Enter a problem between 1 and 2,000 characters.'));
    const event = Object.freeze({ type: EVENTS.COGNITIVE_PROBLEM_RECEIVED, mindlingId, requestId: crypto.randomUUID(), problem: problem.trim(), trigger: 'explicit-user', at: Date.now() });
    return new Promise((resolve, reject) => {
      // Object identity is a one-use capability, never serialized or accepted
      // from arbitrary bus payloads. Only this explicit request mints it.
      const command = { resolve, reject, received: false };
      this.#authorized.set(event, command);
      this.#dispatching = true;
      try { this.events.emit(EVENTS.COGNITIVE_PROBLEM_RECEIVED, event); }
      finally { this.#dispatching = false; }
      if (!command.received) { this.#authorized.delete(event); reject(Error('The cognitive command was cancelled before processing.')); }
    });
  }
  async #fingerprint(context, identity) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ identity, context })));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  async #run(event) {
    const run = { controller: new AbortController() }; this.#active = run;
    const scope = { mindlingId: event.mindlingId, requestId: event.requestId, trigger: event.trigger };
    const live = () => { if (this.#disposed || run.controller.signal.aborted || this.#active !== run || this.#identity !== event.mindlingId) throw new DOMException('Evaluation cancelled', 'AbortError'); };
    const emit = (type, data = {}) => {
      this.#notifying = true;
      try { this.events.emit(type, Object.freeze({ ...scope, at: Date.now(), ...structuredClone(data) })); }
      finally { this.#notifying = false; }
    };
    try {
      emit(EVENTS.COGNITIVE_REASONING_STARTED);
      live();
      const source = await this.store.source(event.mindlingId); live();
      const context = trainingContext(event.problem, source);
      if (!context.candidates.length) throw Error('No usable current memories are stored. Teach relevant rules and exceptions before evaluating a problem.');
      validateContext(context);
      const id = await this.#fingerprint(context, event.mindlingId); live();
      const execute = async () => {
        const previous = await this.store.load(event.mindlingId); live();
        const existing = previous.records.find(record => record.id === id);
        if (existing) return { record: existing, history: previous, source, cached: true };
        const result = await requestReasoning({ id, context, signal: run.controller.signal }); live();
        const latest = await this.store.source(event.mindlingId); live(); assertTrainingContext(context, latest);
        const record = { id, mindlingId: event.mindlingId, at: Date.now(), problem: event.problem, context, result };
        const history = await this.store.save(record); live();
        // A racing tab may already have saved this ID. Return the actual saved
        // record, so timestamps and derived metrics match persistent history.
        const saved = history.records.find(item => item.id === id);
        if (!saved) throw Error('The saved evaluation is no longer available. Reopen the history.');
        return { record: saved, history, source: latest, cached: false };
      };
      let completion;
      if (globalThis.navigator?.locks?.request) completion = await navigator.locks.request(`mindling-training:${event.mindlingId}:${id}`, { ifAvailable: true }, async lock => { live(); if (!lock) throw Error('This evaluation is running in another tab. Wait, then try again.'); return execute(); });
      else completion = await execute();
      live();
      const result = { ...completion, metrics: cognitiveMetrics(completion.history), evaluationMetrics: evaluationMetrics(completion.record) };
      // Keep active until after emission: immediate recursive requests fail busy.
      emit(EVENTS.COGNITIVE_REASONING_COMPLETED, { evaluationId: completion.record.id, cached: completion.cached, metrics: result.evaluationMetrics, result: completion.record.result, referencedMemoryIds: completion.record.result.reasoning.memoryIds });
      return result;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Evaluation cancelled or timed out. No new successful result is shown.' : error.message === 'Invalid reasoning service data' ? 'The service returned an invalid evaluation. No result was saved.' : error.message || 'Evaluation failed. No result was saved.';
      emit(EVENTS.COGNITIVE_REASONING_FAILED, { message, cancelled: error.name === 'AbortError' });
      throw Error(message);
    } finally { if (this.#active === run) this.#active = null; }
  }
  destroy() { if (this.#disposed) return; this.#disposed = true; this.cancel(); this.#unsubscribe?.(); this.#authorized = new WeakMap(); }
}
