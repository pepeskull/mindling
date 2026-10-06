import test from "node:test";
import assert from "node:assert/strict";
import { compareConcepts, CONCEPT_MATCHING } from "../src/brain/concept-extractor.js";
import { evaluateMemory, reinforcedStrength } from "../src/brain/memory-evaluator.js";
import { BrainEngine } from "../src/brain/brain-engine.js";
import { EventBus } from "../src/app/events.js";

if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };

const matches = [
  ["You will learn to play games", "You will learn to play games", "EXACT_MATCH"],
  ["You will learn to play games", "Learn play games", "CONTENT_MATCH"],
  ["You will learn to play games", "You will learn playing games", "CONTENT_MATCH"],
  ["I enjoy playing games", "I enjoy games", "CONTENT_MATCH"],
  ["You will leanr to play games", "You will learn to play games", "CONTENT_MATCH"]
];
const distinct = [
  ["You will learn to play games", "You will learn to trade"],
  ["I like games", "I hate games"],
  ["Learn JavaScript", "Learn cooking"],
  ["Play games", "Trade stocks"],
  ["stock", "stick"]
];

test("exact, paraphrased, inflected, and typo inputs match conservatively", () => {
  for (const [left, right, type] of matches) assert.equal(compareConcepts(left, right).type, type);
});

test("different anchors and conflicting relations do not merge", () => {
  for (const [left, right] of distinct) assert.equal(compareConcepts(left, right).type, "NO_MATCH");
});

test("legacy memories derive missing concept metadata at evaluation time", () => {
  const legacy = { id: "legacy", content: "You will learn to play games", normalizedContent: "you will learn to play games", strength: .32, activations: 1, synapseIds: ["origin-upper"] };
  const result = evaluateMemory({ content: "Learn play games", mode: "TALK", memories: [legacy], pathways: [] });
  assert.equal(result.outcome, "REINFORCEMENT"); assert.equal(result.existing, legacy);
});

test("reinforcement preserves original text, increments activation, and bounds variants", () => {
  const brain = new BrainEngine(new EventBus());
  brain.create({ id: "primary", name: "Test", stage: "NEURAL_SEED", traits: {}, pathways: [] });
  const first = brain.evaluateInput("You will learn to play games", "TEACH"); brain.commitLearning(first);
  for (let index = 0; index < 8; index += 1) {
    const wording = index % 2 ? "Learn play games" : "You will learn playing games";
    const result = brain.evaluateInput(wording, "TALK"); assert.equal(result.outcome, "REINFORCEMENT"); brain.commitLearning(result);
  }
  const state = brain.getState(); const memory = state.memories[0];
  assert.equal(state.nodes.length, 5); assert.equal(state.synapses.length, 4); assert.equal(state.memories.length, 1);
  assert.equal(memory.content, "You will learn to play games"); assert.equal(memory.activations, 9);
  assert.ok(memory.matchedVariants.length <= CONCEPT_MATCHING.maximumMatchedVariants); assert.ok(memory.strength <= 1);
  assert.ok(reinforcedStrength(memory.strength) <= 1);
});

test("ambient presentation has no Brain Engine mutation path", () => {
  const brain = new BrainEngine(new EventBus()); const before = brain.initialize();
  assert.equal(typeof brain.ambientActivity, "undefined"); assert.deepEqual(brain.getState(), before);
});
