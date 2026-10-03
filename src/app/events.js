export const EVENTS = Object.freeze({
  STATE_READY: "STATE_READY",
  MINDLING_CREATED: "MINDLING_CREATED",
  NEURAL_INPUT: "NEURAL_INPUT",
  SCENE_SELECTION: "SCENE_SELECTION",
  NEURON_CREATED: "NEURON_CREATED",
  SYNAPSE_CREATED: "SYNAPSE_CREATED",
  MEMORY_CREATED: "MEMORY_CREATED",
  ACTIVITY_COMPLETED: "ACTIVITY_COMPLETED",
  NEED_CHANGED: "NEED_CHANGED",
  EVOLUTION_STARTED: "EVOLUTION_STARTED",
  EVOLUTION_COMPLETED: "EVOLUTION_COMPLETED"
});

export class EventBus {
  #target = new EventTarget();
  emit(type, detail) { this.#target.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, listener) {
    const handler = ({ detail }) => listener(detail);
    this.#target.addEventListener(type, handler);
    return () => this.#target.removeEventListener(type, handler);
  }
}
