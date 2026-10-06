import test from "node:test";
import assert from "node:assert/strict";
import { SemanticEngine, SEMANTIC_RULES, cosineSimilarity } from "../src/semantic/semantic-engine.js";
import { BrainEngine } from "../src/brain/brain-engine.js";
import { EventBus } from "../src/app/events.js";
import { SEMANTIC_CALIBRATION_PAIRS, SEMANTIC_GENERALIZATION_PAIRS } from "../src/semantic/semantic-diagnostics.js";
import { createInferenceQueue, resolveNliLabels } from "../src/semantic/semantic-model.js";

if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };

test("development calibration covers the complete acceptance matrix", () => {
  assert.equal(SEMANTIC_CALIBRATION_PAIRS.length, 19);
  assert.equal(SEMANTIC_GENERALIZATION_PAIRS.length, 12);
});

test("equivalence candidate initializes once and remains diagnostic-only", async () => {
  let initializations = 0;
  const equivalenceLoader = async () => { initializations += 1; return async text => new Float32Array(text.length > 4 ? [1, 0] : [0, 1]); };
  const engine = new SemanticEngine(loader, equivalenceLoader); await engine.initialize();
  const first = await engine.inspectEquivalence("long sentence", "tiny");
  const second = await engine.inspectEquivalence("another sentence", "small");
  const combined = await engine.diagnoseWithEquivalence("You ought to learn trading", "You should learn to trade");
  assert.equal(initializations, 1); assert.equal(first.canonicalAuthority, false); assert.equal(second.canonicalAuthority, false);
  assert.equal(combined.equivalence.canonicalAuthority, false); assert.ok(combined.nli.forward);
});

test("model inference is serialized and copied before a reusable buffer changes", async () => {
  const enqueue = createInferenceQueue();
  const shared = new Float32Array(3);
  const infer = values => enqueue(async () => { shared.set(values); await new Promise(resolve => setTimeout(resolve, 1)); return new Float32Array(shared); });
  const [left, right] = await Promise.all([infer([1, 2, 3]), infer([4, 5, 6])]);
  assert.deepEqual([...left], [1, 2, 3]); assert.deepEqual([...right], [4, 5, 6]);
  assert.notEqual(left.buffer, right.buffer);
});

test("NLI labels are resolved from model metadata rather than assumed", () => {
  assert.deepEqual(resolveNliLabels({ 0: "contradiction", 1: "entailment", 2: "neutral" }), { contradiction: 0, entailment: 1, neutral: 2 });
  assert.throws(() => resolveNliLabels({ 0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2" }), /mapping is incomplete/);
});

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
  classify: async (left, right) => {
    const entailment = entailments.get(`${left}|${right}`) || .04;
    return { entailment, neutral: entailment >= .9 ? .03 : .18, contradiction: left === "I hate trading" || right === "I hate trading" ? .78 : .08 };
  }
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
  const diagnostic = await engine.diagnosePair("You ought to learn trading", "You should learn to trade");
  assert.equal(diagnostic.relation, "SAME_MEANING"); assert.equal(diagnostic.forward.entailment, .94); assert.equal(diagnostic.reverse.entailment, .92);
  assert.ok(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0])) === 1);
  assert.equal(engine.retrieveCandidates(new Float32Array([1, 0, 0]), Array.from({ length: 8 }, (_, id) => ({ id, embedding: new Float32Array([1, 0, 0]) }))).length, SEMANTIC_RULES.candidateLimit);
  const inspection = await engine.inspectEmbeddings("You ought to learn trading", "You should learn to trade", 2);
  assert.equal(inspection.left.dimensions, 3); assert.equal(inspection.left.preview.length, 2);
  assert.equal(inspection.sameBuffer, false); assert.equal(inspection.identical, false);
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
