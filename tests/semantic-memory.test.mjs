import test from "node:test";
import assert from "node:assert/strict";
import { SemanticEngine, SEMANTIC_RULES, cosineSimilarity } from "../src/semantic/semantic-engine.js";
import { BrainEngine } from "../src/brain/brain-engine.js";
import { EventBus } from "../src/app/events.js";

if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };

const vectors = new Map([
  ["You should learn to trade", [1, 0, 0]], ["You ought to learn trading", [.98, .02, 0]],
  ["You need to learn to trade", [.96, .04, 0]], ["I hate trading", [.91, .09, 0]], ["Learn to play games", [0, 1, 0]]
]);
const entailments = new Map([
  ["You ought to learn trading|You should learn to trade", .94], ["You should learn to trade|You ought to learn trading", .92],
  ["You need to learn to trade|You should learn to trade", .61], ["You should learn to trade|You need to learn to trade", .55]
]);
const loader = async () => ({
  encode: async text => new Float32Array(vectors.get(text) || [0, 0, 1]),
  classify: async (left, right) => ({ entailment: entailments.get(`${left}|${right}`) || .04, neutral: .18, contradiction: left === "I hate trading" || right === "I hate trading" ? .78 : .08 })
});

test("embedding retrieval is bounded and pair inference decides canonical meaning", async () => {
  const engine = new SemanticEngine(loader); await engine.initialize();
  const original = { id: "one", content: "You should learn to trade", embedding: new Float32Array([1, 0, 0]) };
  const same = await engine.evaluate("You ought to learn trading", [original]);
  assert.equal(same.relation, "SAME_MEANING"); assert.equal(same.match, original);
  const related = await engine.evaluate("You need to learn to trade", [original]);
  assert.equal(related.relation, "RELATED"); assert.equal(related.match, null);
  const distinct = await engine.evaluate("Learn to play games", [original]);
  assert.equal(distinct.relation, "DISTINCT");
  const conflict = await engine.evaluate("I hate trading", [original]);
  assert.equal(conflict.relation, "CONFLICTING");
  assert.ok(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0])) === 1);
  assert.equal(engine.retrieveCandidates(new Float32Array([1, 0, 0]), Array.from({ length: 8 }, (_, id) => ({ id, embedding: new Float32Array([1, 0, 0]) }))).length, SEMANTIC_RULES.candidateLimit);
});

test("same meaning reinforces while related meaning creates symmetric records", () => {
  const brain = new BrainEngine(new EventBus());
  brain.create({ id: "primary", name: "Test", stage: "NEURAL_SEED", traits: {}, pathways: [] });
  const firstSemantic = { embedding: new Float32Array([1, 0]), match: null, relation: "DISTINCT", related: [] };
  const first = brain.evaluateInput("You should learn to trade", "TEACH", firstSemantic); brain.commitLearning(first);
  const stored = brain.getState().memories[0];
  const same = brain.evaluateInput("You ought to learn trading", "TEACH", { embedding: new Float32Array([.98, .02]), match: stored, relation: "SAME_MEANING", related: [] });
  assert.equal(same.outcome, "REINFORCEMENT"); brain.commitLearning(same);
  assert.equal(brain.getState().memories.length, 1); assert.equal(brain.getState().memories[0].content, "You should learn to trade");
  const relatedEvidence = { embedding: new Float32Array([.96, .04]), match: null, relation: "RELATED", related: [{ memory: brain.getState().memories[0], relation: "RELATED", similarity: .96 }] };
  const related = brain.evaluateInput("You need to learn to trade", "TEACH", relatedEvidence); brain.commitLearning(related);
  const state = brain.getState(); assert.equal(state.memories.length, 2);
  assert.ok(state.memories[0].relatedMemoryIds.includes(state.memories[1].id)); assert.ok(state.memories[1].relatedMemoryIds.includes(state.memories[0].id));
  assert.equal(state.nodes.length, 5); assert.equal(state.synapses.length, 4);
});

test("missing semantic evidence degrades to stimulation without mutating memory", () => {
  const brain = new BrainEngine(new EventBus()); const before = brain.initialize();
  assert.equal(brain.evaluateInput("A meaningful teaching", "TEACH").outcome, "STIMULATION");
  assert.deepEqual(brain.getState(), before);
});
