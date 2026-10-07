import test from "node:test";
import assert from "node:assert/strict";
import { SemanticEngine, SEMANTIC_RULES, cosineSimilarity } from "../src/semantic/semantic-engine.js";
import { BrainEngine } from "../src/brain/brain-engine.js";
import { EventBus } from "../src/app/events.js";
import { CANONICAL_CONSISTENCY_PAIRS, CLEAN_SLATE_IDENTITY_10, CLEAN_SLATE_TRADER_10, SEMANTIC_CALIBRATION_PAIRS, SEMANTIC_GENERALIZATION_PAIRS, SEMANTIC_IDENTITY_HELD_OUT } from "../src/semantic/semantic-diagnostics.js";
import { createInferenceQueue, resolveNliLabels, SEMANTIC_MODELS } from "../src/semantic/semantic-model.js";
import { analyzeIdentityTriangle, evaluateShadowIdentity, selectShadowCandidate } from "../src/semantic/canonical-identity.js";
import { deriveKnowledgeDevelopment, deriveNeuronParticipation } from "../src/brain/knowledge-development.js";

if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };

test("development calibration covers the complete acceptance matrix", () => {
  assert.equal(SEMANTIC_CALIBRATION_PAIRS.length, 19);
  assert.equal(SEMANTIC_GENERALIZATION_PAIRS.length, 22);
  assert.equal(CANONICAL_CONSISTENCY_PAIRS.length, 21);
  assert.equal(SEMANTIC_CALIBRATION_PAIRS.length + SEMANTIC_GENERALIZATION_PAIRS.length + CANONICAL_CONSISTENCY_PAIRS.length, 62);
  const diagnosticText = JSON.stringify(CANONICAL_CONSISTENCY_PAIRS);
  for (const input of ["Learn how to trade", "Learn to trade", "Learn how trading works", "Learn how to become a trader", "Learn to be a trader", "Become a trader", "Become a better trader", "I want to become a trader", "I am a trader", "I do not want to become a trader"]) assert.match(diagnosticText, new RegExp(input));
});

test("shadow identity corpus is held out and clean-slate scenarios are isolated data", () => {
  assert.equal(SEMANTIC_IDENTITY_HELD_OUT.length, 40);
  assert.equal(CLEAN_SLATE_IDENTITY_10.length, 10);
  assert.equal(CLEAN_SLATE_TRADER_10.length, 10);
  assert.notEqual(CLEAN_SLATE_IDENTITY_10, CLEAN_SLATE_TRADER_10);
  assert.deepEqual(Object.keys(SEMANTIC_MODELS).filter(key => key.endsWith("Candidate")), ["equivalenceCandidate", "propositionCandidate"]);
});

test("shadow identity separates identity from relationship and preserves uncertainty", () => {
  const evidence = (entailment, neutral, contradiction, reverseEntailment = entailment) => ({
    nli: { forward: { entailment, neutral, contradiction }, reverse: { entailment: reverseEntailment, neutral, contradiction } },
    paraphrase: { score: .8 }, stsb: { score: .8 }, currentCanonicalRelation: "RELATED"
  });
  const same = evaluateShadowIdentity(evidence(.96, .02, .02));
  const notSame = evaluateShadowIdentity(evidence(.01, .01, .98));
  const asymmetric = evaluateShadowIdentity(evidence(.98, .18, .02, .62));
  const uncertain = evaluateShadowIdentity(evidence(.66, .25, .09, .64));
  assert.equal(same.identity, "SAME"); assert.equal(notSame.identity, "NOT_SAME");
  assert.equal(asymmetric.identity, "NOT_SAME"); assert.equal(uncertain.identity, "UNCERTAIN");
  for (const result of [same, notSame, asymmetric, uncertain]) {
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.relationship.decision, "UNRESOLVED");
  }
});

test("shadow candidate selection is deterministic and triangle analysis does not merge", () => {
  const candidates = [
    { rank: 1, retrieval: { cosine: .98 }, shadow: { identity: "SAME", evidence: { mutualEntailment: .91 } } },
    { rank: 2, retrieval: { cosine: .82 }, shadow: { identity: "SAME", evidence: { mutualEntailment: .97 } } }
  ];
  assert.equal(selectShadowCandidate(candidates).rank, 2);
  const triangle = analyzeIdentityTriangle([
    { shadow: { identity: "SAME" } }, { shadow: { identity: "SAME" } }, { shadow: { identity: "NOT_SAME" } }
  ]);
  assert.equal(triangle.status, "INCONSISTENT"); assert.equal(triangle.canonicalAuthority, false);
});

test("equivalence candidate initializes once and remains diagnostic-only", async () => {
  let initializations = 0;
  let propositionInitializations = 0; let propositionCalls = 0;
  const equivalenceLoader = async () => { initializations += 1; return async text => new Float32Array(text.length > 4 ? [1, 0] : [0, 1]); };
  const propositionLoader = async () => { propositionInitializations += 1; return async () => { propositionCalls += 1; return { rawLogit: 2, score: .88 }; }; };
  const engine = new SemanticEngine(loader, equivalenceLoader, propositionLoader); await engine.initialize();
  const first = await engine.inspectEquivalence("long sentence", "tiny");
  const second = await engine.inspectEquivalence("another sentence", "small");
  const combined = await engine.diagnoseWithEquivalence("You ought to learn trading", "You should learn to trade");
  const identity = await engine.inspectSemanticIdentity("You ought to learn trading", "You should learn to trade");
  assert.equal(initializations, 1); assert.equal(propositionInitializations, 1); assert.equal(propositionCalls, 2);
  assert.equal(first.canonicalAuthority, false); assert.equal(second.canonicalAuthority, false);
  assert.equal(combined.equivalence.canonicalAuthority, false); assert.equal(combined.proposition.canonicalAuthority, false); assert.ok(combined.nli.forward);
  assert.equal(identity.canonicalAuthority, false); assert.ok(identity.nli.forward); assert.ok(identity.nli.reverse);
  assert.equal(typeof identity.nli.mutualEntailment, "number"); assert.equal(identity.retrieval.floor, SEMANTIC_RULES.retrievalFloor);
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
    return { entailment, neutral: entailment >= .9 ? .03 : .18, contradiction: left === "I hate trading" || right === "I hate trading" ? .78 : .01 };
  }
});

test("embedding retrieval is bounded and pair inference decides canonical meaning", async () => {
  const equivalenceLoader = async () => async text => new Float32Array(vectors.get(text) || [0, 0, 1]);
  const propositionLoader = async () => async () => ({ rawLogit: 2, score: .88 });
  const engine = new SemanticEngine(loader, equivalenceLoader, propositionLoader); await engine.initialize(); engine.enableDiagnosticTracing();
  const original = { id: "one", content: "You should learn to trade", embedding: new Float32Array([1, 0, 0]) };
  const same = await engine.evaluate("You ought to learn trading", [original]);
  assert.equal(same.relation, "SAME_MEANING"); assert.equal(same.match, original);
  const related = await engine.evaluate("You need to learn to trade", [original]);
  assert.equal(related.relation, "RELATED"); assert.equal(related.match, null);
  assert.equal(engine.lastProductionTrace.productionDecision, "RELATED");
  assert.equal(engine.lastProductionTrace.candidates[0].memoryId, "one");
  const distinct = await engine.evaluate("Learn to play games", [original]);
  assert.equal(distinct.relation, "DISTINCT");
  const conflict = await engine.evaluate("I hate trading", [original]);
  assert.equal(conflict.relation, "RELATED"); assert.equal(conflict.match, null);
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

test("production identity reuses SAME but keeps NOT_SAME, UNCERTAIN, and cosine-only inputs separate", async () => {
  const outcomes = new Map([
    ["same|canonical", [.96, .02, .02]], ["canonical|same", [.95, .03, .02]],
    ["not-same|canonical", [.01, .01, .98]], ["canonical|not-same", [.01, .01, .98]],
    ["uncertain|canonical", [.65, .28, .07]], ["canonical|uncertain", [.64, .29, .07]],
    ["cosine-only|canonical", [.08, .84, .08]], ["canonical|cosine-only", [.08, .84, .08]]
  ]);
  const semanticLoader = async () => ({ backend: "mock", encode: async () => new Float32Array([1, 0]), classify: async (left, right) => { const [entailment, neutral, contradiction] = outcomes.get(`${left}|${right}`) || [.05, .9, .05]; return { entailment, neutral, contradiction }; } });
  const support = async () => async () => new Float32Array([1, 0]); const proposition = async () => async () => ({ rawLogit: 2, score: .88 });
  const engine = new SemanticEngine(semanticLoader, support, proposition); await engine.initialize();
  const canonical = { id: "canonical", content: "canonical", embedding: new Float32Array([1, 0]), matchedVariants: [] };
  assert.equal((await engine.evaluate("same", [canonical])).match.id, "canonical");
  for (const input of ["not-same", "uncertain", "cosine-only"]) assert.equal((await engine.evaluate(input, [canonical])).match, null);
});

test("cluster membership requires bounded representative agreement", async () => {
  const semanticLoader = async () => ({ backend: "mock", encode: async () => new Float32Array([1, 0]), classify: async (left, right) => {
    const disagreement = left === "drift" || right === "drift"; return disagreement ? { entailment: .55, neutral: .4, contradiction: .05 } : { entailment: .97, neutral: .02, contradiction: .01 };
  } });
  const support = async () => async () => new Float32Array([1, 0]); const proposition = async () => async () => ({ rawLogit: 2, score: .88 });
  const engine = new SemanticEngine(semanticLoader, support, proposition); await engine.initialize();
  const clustered = { id: "cluster", content: "canonical", embedding: new Float32Array([1, 0]), matchedVariants: ["drift"] };
  assert.equal((await engine.evaluate("candidate", [clustered])).match, null);
});

test("knowledge development is deterministic, derived, and preserves canonical memories", () => {
  const memories = [
    { id: "a", createdAt: "2026-01-01", embedding: new Float32Array([1, 0]), strength: .5, activations: 2 },
    { id: "b", createdAt: "2026-01-02", embedding: new Float32Array([.99, .01]), strength: .7, activations: 3 },
    { id: "c", createdAt: "2026-01-03", embedding: new Float32Array([0, 1]), strength: .4, activations: 1 }
  ];
  const before = structuredClone(memories); const first = deriveKnowledgeDevelopment(memories); const second = deriveKnowledgeDevelopment(memories);
  assert.deepEqual(first, second); assert.equal(first.areas.length, 2); assert.equal(first.canonicalMemoryCount, 3);
  assert.ok(first.areas.every(area => area.label.length > 0)); assert.ok(first.areas.every(area => area.id.startsWith("area-") && area.representativeMemoryIds.length));
  assert.deepEqual(memories, before); assert.ok(first.overall >= 0 && first.overall <= 1);
});

test("bounded representatives resist semantic chain drift", () => {
  const vector = degrees => { const radians = degrees * Math.PI / 180; return new Float32Array([Math.cos(radians), Math.sin(radians)]); };
  const memories = [
    { id: "a", content: "alpha source", embedding: vector(0), strength: .3, activations: 1, createdAt: "1" },
    { id: "b", content: "bridge concept", embedding: vector(50), strength: .3, activations: 1, createdAt: "2" },
    { id: "c", content: "distant target", embedding: vector(70), strength: .3, activations: 1, createdAt: "3" }
  ];
  const development = deriveKnowledgeDevelopment(memories);
  assert.equal(development.areas.length, 2);
  assert.ok(development.areas.some(area => area.memoryIds.includes("a") && area.memoryIds.includes("b") && !area.memoryIds.includes("c")));
});

test("neuron participation is local to deterministic memory routes", () => {
  const state = { memories: [
    { id: "a", neuronIds: ["origin", "upper"], embedding: new Float32Array([1, 0]), strength: .5, activations: 2, createdAt: "1" },
    { id: "b", neuronIds: ["origin", "right"], embedding: new Float32Array([0, 1]), strength: .7, activations: 3, createdAt: "2" }
  ] };
  const development = deriveKnowledgeDevelopment(state.memories);
  const origin = deriveNeuronParticipation(state, "origin", development); const upper = deriveNeuronParticipation(state, "upper", development); const lower = deriveNeuronParticipation(state, "lower", development);
  assert.equal(origin.memoryCount, 2); assert.equal(upper.memoryCount, 1); assert.equal(lower.memoryCount, 0);
  assert.deepEqual(upper.memoryIds, ["a"]); assert.ok(!upper.memoryIds.includes("b"));
  assert.notDeepEqual(origin.areaParticipation, upper.areaParticipation);
  assert.equal(upper.specialization, "UNSPECIALIZED");
});

test("neuron specialization requires sufficient concentrated participation", () => {
  const memories = Array.from({ length: 3 }, (_, index) => ({ id: `m${index}`, content: `shared concept ${index}`, neuronIds: ["upper"], embedding: new Float32Array([1, index * .01]), strength: .6, activations: 2, createdAt: String(index) }));
  const state = { memories }; const profile = deriveNeuronParticipation(state, "upper", deriveKnowledgeDevelopment(memories));
  assert.equal(profile.memoryCount, 3); assert.equal(profile.specialization, "EMERGING_SPECIALIZATION"); assert.ok(profile.dominantShare >= .6);
});

test("semantic area continuity reuses a neural route while unrelated areas may diverge", () => {
  const brain = new BrainEngine(new EventBus()); brain.create({ id: "primary", name: "Routes", stage: "NEURAL_SEED", traits: {}, pathways: [] });
  const evidence = embedding => ({ embedding, match: null, relation: "DISTINCT", related: [] });
  const first = brain.evaluateInput("first route memory", "TEACH", evidence(new Float32Array([1, 0]))); brain.commitLearning(first);
  const related = brain.evaluateInput("related route memory", "TEACH", evidence(new Float32Array([.99, .01]))); brain.commitLearning(related);
  assert.equal(related.route.synapse, first.route.synapse);
  let unrelated;
  for (let index = 0; index < 20; index += 1) { const candidate = brain.evaluateInput(`unrelated route ${index}`, "TEACH", evidence(new Float32Array([0, 1]))); if (candidate.route.synapse !== first.route.synapse) { unrelated = candidate; break; } }
  assert.ok(unrelated); assert.notEqual(unrelated.route.synapse, first.route.synapse);
});
