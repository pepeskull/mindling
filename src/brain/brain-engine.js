import { EVENTS } from "../app/events.js";
import { createNeuralSeedState } from "./neural-seed-state.js";
import { evaluateMemory, MEMORY_RULES, reinforcedStrength } from "./memory-evaluator.js";
import { CONCEPT_MATCHING } from "./concept-extractor.js";

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
    const seed = createNeuralSeedState();
    this.#state = { ...seed, ...structuredClone(mindling), memories: mindling.memories || [], synapses: (mindling.synapses || seed.synapses).map(item => ({ strength: 0.2, activations: 0, ...item })) };
    return this.initialize();
  }

  create(mindling) {
    this.#state = { ...createNeuralSeedState(), ...structuredClone(mindling) };
    const state = this.getState();
    this.#events.emit(EVENTS.MINDLING_CREATED, state);
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }

  evaluateInput(text, mode = "TALK") {
    const value = text.trim();
    if (!value) return null;
    const hash = [...value].reduce((total, character) => (total * 31 + character.codePointAt(0)) >>> 0, 7);
    const synapse = this.#state.synapses[hash % this.#state.synapses.length];
    const route = { source: synapse.from, synapse: synapse.id, destination: synapse.to };
    const evaluation = evaluateMemory({ content: value, mode, memories: this.#state.memories, pathways: this.#state.pathwayRecords?.length ? this.#state.pathwayRecords : this.#state.pathways });
    if (evaluation.outcome === "STIMULATION") return { outcome: evaluation.outcome, route };
    const now = new Date().toISOString();
    let memory;
    if (evaluation.outcome === "REINFORCEMENT") {
      const variants = [...(evaluation.existing.matchedVariants || [])];
      if (evaluation.matchType === "CONTENT_MATCH" && evaluation.normalizedContent !== evaluation.existing.normalizedContent && !variants.includes(value)) variants.push(value);
      memory = { ...evaluation.existing, conceptSignature: evaluation.existing.conceptSignature || evaluation.conceptSignature, matchedVariants: variants.slice(-CONCEPT_MATCHING.maximumMatchedVariants), lastActivatedAt: now, activations: evaluation.existing.activations + 1, strength: reinforcedStrength(evaluation.existing.strength) };
    } else {
      memory = {
        id: `memory-${Date.now()}-${hash.toString(16)}`, type: "learned", content: value,
        normalizedContent: evaluation.normalizedContent, conceptSignature: evaluation.conceptSignature, matchedVariants: [], createdAt: now, lastActivatedAt: now,
        strength: MEMORY_RULES.initialStrength, activations: 1, pathwayIds: evaluation.pathwayIds,
        neuronIds: [route.source, route.destination], synapseIds: [route.synapse], source: mode
      };
    }
    const associatedSynapse = this.#state.synapses.find(item => item.id === memory.synapseIds[0]);
    const updatedSynapse = { ...associatedSynapse, strength: reinforcedStrength(associatedSynapse.strength), activations: associatedSynapse.activations + 1 };
    return { outcome: evaluation.outcome, route: { source: updatedSynapse.from, synapse: updatedSynapse.id, destination: updatedSynapse.to }, memory, synapse: updatedSynapse };
  }

  commitLearning(result) {
    if (result.memory) {
      const index = this.#state.memories.findIndex(item => item.id === result.memory.id);
      if (index < 0) this.#state.memories.push(structuredClone(result.memory));
      else this.#state.memories[index] = structuredClone(result.memory);
      const synapseIndex = this.#state.synapses.findIndex(item => item.id === result.synapse.id);
      this.#state.synapses[synapseIndex] = structuredClone(result.synapse);
    }
    const state = this.getState();
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }

  getState() {
    return structuredClone(this.#state);
  }
}
