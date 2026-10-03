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

  getState() {
    return structuredClone(this.#state);
  }
}
