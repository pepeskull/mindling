export const EVENTS = Object.freeze({
  STATE_READY: "STATE_READY",
  MINDLING_CREATED: "MINDLING_CREATED",
  COGNITIVE_PROBLEM_RECEIVED: "COGNITIVE_PROBLEM_RECEIVED",
  COGNITIVE_REASONING_STARTED: "COGNITIVE_REASONING_STARTED",
  COGNITIVE_REASONING_COMPLETED: "COGNITIVE_REASONING_COMPLETED",
  COGNITIVE_REASONING_FAILED: "COGNITIVE_REASONING_FAILED",
  NEURAL_INPUT: "NEURAL_INPUT",
  SCENE_SELECTION: "SCENE_SELECTION",
  NEURON_CREATED: "NEURON_CREATED",
  SYNAPSE_CREATED: "SYNAPSE_CREATED",
  MEMORY_CREATED: "MEMORY_CREATED",
  MEMORY_REINFORCED: "MEMORY_REINFORCED",
  MEMORY_SELECTED: "MEMORY_SELECTED",
  LEARNING_FAILED: "LEARNING_FAILED",
  SEMANTIC_STATUS: "SEMANTIC_STATUS",
  ACTIVITY_COMPLETED: "ACTIVITY_COMPLETED",
  NEED_CHANGED: "NEED_CHANGED",
  LIFE_UPDATED: "LIFE_UPDATED",
  EVENT_HANDLER_FAILED: "EVENT_HANDLER_FAILED",
  EVOLUTION_STARTED: "EVOLUTION_STARTED",
  EVOLUTION_COMPLETED: "EVOLUTION_COMPLETED"
});

export class EventBus {
  #listeners = new Map();
  emit(type, detail) {
    const failures = [];
    for (const listener of [...(this.#listeners.get(type) || [])]) {
      try { listener(detail); } catch (error) { failures.push(error); }
    }
    if (failures.length && type !== EVENTS.EVENT_HANDLER_FAILED) {
      const failure = Object.freeze({ eventType: type, count: failures.length, message: "A user-interface event handler failed." });
      for (const listener of [...(this.#listeners.get(EVENTS.EVENT_HANDLER_FAILED) || [])]) {
        try { listener(failure); } catch (error) { globalThis.reportError?.(error); }
      }
      failures.forEach(error => globalThis.reportError?.(error));
    }
    return failures.length === 0;
  }
  on(type, listener) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(listener);
    return () => this.#listeners.get(type)?.delete(listener);
  }
}
