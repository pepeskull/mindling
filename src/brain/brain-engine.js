import { EVENTS } from "../app/events.js";
import { createNeuralSeedState } from "./neural-seed-state.js";

export class BrainEngine {
  #events;
  #state = createNeuralSeedState();

  constructor(events) {
    this.#events = events;
  }

  initialize() {
    const state = this.getState();
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }

  hydrate(mindling) {
    this.#state = { ...createNeuralSeedState(), ...structuredClone(mindling) };
    return this.initialize();
  }

  create(mindling) {
    this.#state = { ...createNeuralSeedState(), ...structuredClone(mindling) };
    const state = this.getState();
    this.#events.emit(EVENTS.MINDLING_CREATED, state);
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }

  receiveInput(text) {
    const value = text.trim();
    if (!value) return null;
    const hash = [...value].reduce((total, character) => (total * 31 + character.codePointAt(0)) >>> 0, 7);
    const synapse = this.#state.synapses[hash % this.#state.synapses.length];
    const signal = { source: synapse.from, synapse: synapse.id, destination: synapse.to };
    this.#events.emit(EVENTS.NEURAL_INPUT, signal);
    return signal;
  }

  getState() {
    return structuredClone(this.#state);
  }
}
