import { EVENTS } from "../app/events.js";
import { createNeuralSeedState } from "./neural-seed-state.js";
import { evaluateMemory, MEMORY_RULES, reinforcedStrength } from "./memory-evaluator.js";
const SEMANTIC_RULES = Object.freeze({maximumVariants:5,maximumRelations:5});
import { deriveKnowledgeDevelopment } from "./knowledge-development.js";

function semanticRoute(state, content, embedding, fallback) {
  if (!embedding?.length || !state.memories.length) return fallback;
  const probeId = "__route-probe__";
  const development = deriveKnowledgeDevelopment([...state.memories, { id: probeId, content, normalizedContent: content, embedding, strength: 0, activations: 0, createdAt: "9999" }]);
  const area = development.areas.find(item => item.memoryIds.includes(probeId));
  const participating = area ? state.memories.filter(memory => area.memoryIds.includes(memory.id)) : [];
  const counts = new Map();
  for (const memory of participating) for (const synapseId of memory.synapseIds || []) counts.set(synapseId, (counts.get(synapseId) || 0) + 1);
  const selected = state.synapses.reduce((best, synapse) => (counts.get(synapse.id) || 0) > (counts.get(best?.id) || 0) ? synapse : best, null);
  return selected && counts.get(selected.id) ? { source: selected.from, synapse: selected.id, destination: selected.to } : fallback;
}

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

  evaluateInput(text, mode = "TALK", semantic) {
    const value = text.trim();
    if (!value) return null;
    const hash = [...value].reduce((total, character) => (total * 31 + character.codePointAt(0)) >>> 0, 7);
    const synapse = this.#state.synapses[hash % this.#state.synapses.length];
    let route = { source: synapse.from, synapse: synapse.id, destination: synapse.to };
    if (!semantic) return { outcome: "STIMULATION", route };
    const evaluation = evaluateMemory({ content: value, mode, memories: this.#state.memories, pathways: this.#state.pathwayRecords?.length ? this.#state.pathwayRecords : this.#state.pathways, semantic });
    if (evaluation.outcome === "STIMULATION") return { outcome: evaluation.outcome, route };
    if (evaluation.outcome === "MEMORY_FORMATION") route = semanticRoute(this.#state, value, semantic.embedding, route);
    const now = new Date().toISOString();
    let memory;
    if (evaluation.outcome === "REINFORCEMENT") {
      const variants = [...(evaluation.existing.matchedVariants || [])];
      if (evaluation.normalizedContent !== evaluation.existing.normalizedContent && !variants.includes(value)) variants.push(value);
      memory = { ...evaluation.existing, embedding: evaluation.existing.embedding || evaluation.semantic.embedding, matchedVariants: variants.slice(-SEMANTIC_RULES.maximumVariants), lastActivatedAt: now, activations: evaluation.existing.activations + 1, strength: reinforcedStrength(evaluation.existing.strength) };
    } else {
      const related = evaluation.semantic.related.slice(0, SEMANTIC_RULES.maximumRelations).map(item => item.memory.id);
      memory = {
        id: `memory-${Date.now()}-${hash.toString(16)}`, type: "learned", content: value,
        normalizedContent: evaluation.normalizedContent, embedding: evaluation.semantic.embedding, matchedVariants: [], relatedMemoryIds: related, createdAt: now, lastActivatedAt: now,
        strength: MEMORY_RULES.initialStrength, activations: 1, pathwayIds: evaluation.pathwayIds,
        neuronIds: [route.source, route.destination], synapseIds: [route.synapse], source: mode
      };
    }
    const associatedSynapse = this.#state.synapses.find(item => item.id === memory.synapseIds[0]);
    const updatedSynapse = { ...associatedSynapse, strength: reinforcedStrength(associatedSynapse.strength), activations: associatedSynapse.activations + 1 };
    const relatedMemories = evaluation.outcome === "MEMORY_FORMATION" ? (evaluation.semantic.related || []).slice(0, SEMANTIC_RULES.maximumRelations).map(item => ({ ...item.memory, relatedMemoryIds: [...new Set([...(item.memory.relatedMemoryIds || []), memory.id])].slice(-SEMANTIC_RULES.maximumRelations) })) : [];
    return { outcome: evaluation.outcome, route: { source: updatedSynapse.from, synapse: updatedSynapse.id, destination: updatedSynapse.to }, memory, relatedMemories, synapse: updatedSynapse };
  }

  commitLearning(result) {
    if (result.memory) {
      const index = this.#state.memories.findIndex(item => item.id === result.memory.id);
      if (index < 0) this.#state.memories.push(structuredClone(result.memory));
      else this.#state.memories[index] = structuredClone(result.memory);
      for (const related of result.relatedMemories || []) {
        const relatedIndex = this.#state.memories.findIndex(item => item.id === related.id);
        if (relatedIndex >= 0) this.#state.memories[relatedIndex] = structuredClone(related);
      }
      const synapseIndex = this.#state.synapses.findIndex(item => item.id === result.synapse.id);
      this.#state.synapses[synapseIndex] = structuredClone(result.synapse);
    }
    const state = this.getState();
    this.#events.emit(EVENTS.STATE_READY, state);
    return state;
  }

  attachEmbedding(id, embedding) {
    const memory = this.#state.memories.find(item => item.id === id);
    if (memory) memory.embedding = new Float32Array(embedding);
  }

  getState() {
    return structuredClone(this.#state);
  }
}
