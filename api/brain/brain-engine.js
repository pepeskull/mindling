import { EVENTS } from "../app/events.js";

const INITIAL_STATE = Object.freeze({
  stage: "NEURAL_SEED",
  neurons: 5,
  synapses: 4,
  memories: 0,
  needs: Object.freeze({}),
  pathways: Object.freeze([]),
  activities: Object.freeze([])
});

export class BrainEngine {
  #events;
  #state = INITIAL_STATE;
  constructor(events) { this.#events = events; }
  initialize() {
    const state = this.getState();
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }
  getState() { return structuredClone(this.#state); }
}
