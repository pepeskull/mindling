import test from "node:test";
import assert from "node:assert/strict";
import { SemanticEngine, SEMANTIC_RULES, cosineSimilarity } from "../src/semantic/semantic-engine.js";
import { BrainEngine } from "../src/brain/brain-engine.js";
import { EventBus } from "../src/app/events.js";
import { CANONICAL_CONSISTENCY_PAIRS, CLEAN_SLATE_IDENTITY_10, CLEAN_SLATE_TRADER_10, SEMANTIC_CALIBRATION_PAIRS, SEMANTIC_GENERALIZATION_PAIRS, SEMANTIC_IDENTITY_HELD_OUT } from "../src/semantic/semantic-diagnostics.js";
import { createInferenceQueue, resolveNliLabels, SEMANTIC_MODELS } from "../src/semantic/semantic-model.js";
import { analyzeIdentityTriangle, evaluateShadowIdentity, selectShadowCandidate } from "../src/semantic/canonical-identity.js";
import { deriveKnowledgeDevelopment, deriveNeuronParticipation } from "../src/brain/knowledge-development.js";
import { KNOWLEDGE_RELATION_MATRIX, KNOWLEDGE_RELATION_RULES, shadowKnowledgeDecision } from "../src/semantic/knowledge-relation.js";
import { compareEmbeddingVectors, dotProduct, KNOWLEDGE_TOPIC_E5_RULES, KNOWLEDGE_TOPIC_MULTILINGUAL, KNOWLEDGE_TOPIC_NINE, meanPoolWithAttentionMask, normalizeEmbedding, runE5ImplementationAudit, simulateTopicAreas, summarizeTopicScores, vectorStatistics } from "../src/semantic/knowledge-topic-e5.js";
import { auditJinaModel, inspectJinaPair, JINA_DIAGNOSTIC_LIMITS, JINA_TOPIC_MODEL, KNOWLEDGE_TOPIC_TEN, runJinaMatrix, runJinaMultilingual, sigmoid, simulateJinaAreas, summarizeJinaRows } from "../src/semantic/knowledge-topic-jina.js";

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
  assert.deepEqual(Object.keys(SEMANTIC_MODELS).filter(key => key.endsWith("Candidate")), ["equivalenceCandidate", "propositionCandidate", "knowledgeTopicCandidate"]);
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
  assert.ok(!development.areas.some(area => ["a", "b", "c"].every(id => area.memoryIds.includes(id))));
  assert.ok(development.areas.some(area => area.memoryCount === 1));
});

test("complete-link grouping is order resistant with deterministic IDs and labels", () => {
  const memories = [
    { id: "z", content: "Camera aperture controls incoming light during exposure", embedding: new Float32Array([1, 0]), strength: .4, activations: 1 },
    { id: "a", content: "Aperture changes depth of field in photographs", embedding: new Float32Array([.98, .02]), strength: .5, activations: 2 },
    { id: "m", content: "Rain filled the empty reservoir", embedding: new Float32Array([0, 1]), strength: .3, activations: 1 }
  ];
  const forward = deriveKnowledgeDevelopment(memories); const reversed = deriveKnowledgeDevelopment([...memories].reverse());
  assert.deepEqual(forward, reversed); assert.equal(forward.areas.length, 2);
  const coherent = forward.areas.find(area => area.memoryCount === 2);
  assert.equal(coherent.labelSource, "CENTRAL_MEMORY_EXCERPT"); assert.match(coherent.id, /^area-[a-f0-9]{8}$/);
  const singleton = forward.areas.find(area => area.memoryCount === 1);
  assert.equal(singleton.labelSource, "NEUTRAL_FALLBACK"); assert.match(singleton.label, /^Emerging Knowledge/);
});

test("browser regression corpus structure preserves coherent groups and unrelated singletons", () => {
  const corpus = [
    ["trade-1", "Stock trading involves buying and selling shares", [1, 0, 0, 0, 0]],
    ["trade-2", "Risk management is important when trading", [.96, .1, 0, 0, 0]],
    ["trade-3", "Traders study market prices", [.94, .12, 0, 0, 0]],
    ["code-1", "JavaScript is used for web development", [0, 1, 0, 0, 0]],
    ["code-2", "Programming requires writing instructions for computers", [.05, .96, .05, 0, 0]],
    ["code-3", "Developers use code to build software", [0, .94, .12, 0, 0]],
    ["music", "Anna enjoys classical music", [0, 0, 1, 0, 0]],
    ["orbit", "The Earth orbits the Sun", [0, 0, 0, 1, 0]],
    ["dog", "Dogs need regular exercise", [0, 0, 0, 0, 1]]
  ].map(([id, content, embedding]) => ({ id, content, embedding: new Float32Array(embedding), strength: .32, activations: 1 }));
  const development = deriveKnowledgeDevelopment(corpus);
  assert.equal(development.areas.length, 5);
  assert.ok(development.areas.some(area => ["trade-1", "trade-2", "trade-3"].every(id => area.memoryIds.includes(id))));
  assert.ok(development.areas.some(area => ["code-1", "code-2", "code-3"].every(id => area.memoryIds.includes(id))));
  for (const id of ["music", "orbit", "dog"]) assert.ok(development.areas.some(area => area.memoryIds.length === 1 && area.memoryIds[0] === id));
  assert.equal(development.assignments.length, 9);
});

test("generalization corpora form coherent areas without a production taxonomy", () => {
  const groups = [
    ["Boiling pasta requires hot water", "Sauces can be prepared while pasta cooks", "Cooking time affects pasta texture"],
    ["Mars has two small moons", "Telescopes help astronomers observe distant objects", "Planetary motion can be studied over time"],
    ["Aperture affects how much light reaches the sensor", "Shutter speed changes motion blur", "ISO affects sensor sensitivity"]
  ];
  const memories = groups.flatMap((group, groupIndex) => group.map((content, index) => ({ id: `${groupIndex}-${index}`, content,
    embedding: new Float32Array(groups.map((_, vectorIndex) => vectorIndex === groupIndex ? 1 : index * .01)), strength: .32, activations: 1 })));
  const before = structuredClone(memories); const development = deriveKnowledgeDevelopment(memories);
  assert.equal(development.areas.length, 3); assert.ok(development.areas.every(area => area.memoryCount === 3)); assert.deepEqual(memories, before);
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

test("knowledge relation matrix is bounded and includes browser, generalization, and hard-negative evidence", () => {
  assert.equal(KNOWLEDGE_RELATION_MATRIX.length, 70);
  const content = JSON.stringify(KNOWLEDGE_RELATION_MATRIX);
  for (const sentence of ["Stock trading involves buying and selling shares", "Programming requires writing instructions for computers", "Anna enjoys classical music", "Boiling pasta requires hot water", "Aperture affects how much light reaches the sensor", "Traders study market prices", "Astronomers study distant stars"]) assert.match(content, new RegExp(sentence));
  assert.equal(KNOWLEDGE_RELATION_RULES.candidateLimit, 3); assert.equal(KNOWLEDGE_RELATION_RULES.maximumCandidatePairs, 24);
});

test("shadow knowledge mechanics distinguish consensus, weak evidence, and uncertainty without authority", () => {
  const evidence = overrides => ({ embeddingCosine: .8, paraphraseSimilarity: .8, stsScore: .8, productionKnowledgeEligible: true,
    nli: { maxContradiction: .1 }, ...overrides });
  assert.equal(shadowKnowledgeDecision(evidence({})).decision, "SAME_AREA");
  assert.equal(shadowKnowledgeDecision(evidence({ embeddingCosine: .2, paraphraseSimilarity: .2, stsScore: .2, productionKnowledgeEligible: false })).decision, "DIFFERENT_AREA");
  const uncertain = shadowKnowledgeDecision(evidence({ stsScore: .4 }));
  assert.equal(uncertain.decision, "UNCERTAIN"); assert.equal(uncertain.canonicalAuthority, false);
});

test("knowledge diagnostics reuse model evidence and remain read-only", async () => {
  const semanticLoader = async () => ({ backend: "mock", encode: async text => new Float32Array(text.startsWith("same") ? [1, 0] : [0, 1]),
    classify: async () => ({ entailment: .1, neutral: .8, contradiction: .1 }) });
  const support = async () => async text => new Float32Array(text.startsWith("same") ? [1, 0] : [0, 1]);
  const proposition = async () => async () => ({ rawLogit: 2, score: .88 });
  const engine = new SemanticEngine(semanticLoader, support, proposition); await engine.initialize();
  const relation = await engine.inspectKnowledgeRelation("same left", "same right");
  assert.equal(relation.productionKnowledgeEligible, true); assert.equal(relation.shadow.decision, "SAME_AREA");
  assert.ok(relation.nli.forward); assert.equal(relation.canonicalAuthority, false);
  const memories = [
    { id: "a", content: "same left", embedding: new Float32Array([1, 0]), strength: .32, activations: 1, neuronIds: ["origin", "upper"], synapseIds: ["origin-upper"] },
    { id: "b", content: "same right", embedding: new Float32Array([1, 0]), strength: .32, activations: 1, neuronIds: ["origin", "upper"], synapseIds: ["origin-upper"] },
    { id: "c", content: "different", embedding: new Float32Array([0, 1]), strength: .32, activations: 1, neuronIds: ["origin", "right"], synapseIds: ["origin-right"] }
  ];
  const before = structuredClone(memories); const simulation = await engine.simulateKnowledgeAreas(memories);
  assert.equal(simulation.canonicalAuthority, false); assert.equal(simulation.persistence, "NONE");
  assert.ok(simulation.candidatePairs.length <= KNOWLEDGE_RELATION_RULES.maximumCandidatePairs);
  assert.deepEqual(memories, before);
});

test("E5 topic candidate is lazy, copied, reused, and diagnostic-only", async () => {
  let initializations = 0; const source = new Float32Array([1, 0, 0]);
  const topicLoader = async () => { initializations += 1; return { model: SEMANTIC_MODELS.knowledgeTopicCandidate, backend: "mock-wasm", attempts: [], loadMilliseconds: 12,
    artifact: { dtype: "q8", graphBytesApproximate: 118_000_000 }, inputStrategy: "SYMMETRIC_PASSAGE_PREFIX",
    encode: async text => { source.set(text.includes("different") ? [0, 1, 0] : [1, 0, 0]); return new Float32Array(source); } }; };
  const engine = new SemanticEngine(loader, async () => async () => new Float32Array([1, 0]), async () => async () => ({ rawLogit: 1, score: .7 }), topicLoader);
  assert.equal(engine.knowledgeTopicE5Status.status, "idle"); assert.equal(initializations, 0);
  await engine.initialize(); assert.equal(initializations, 0);
  const first = await engine.inspectKnowledgeTopicE5("same left", "same right");
  const second = await engine.inspectKnowledgeTopicE5("same left", "different right");
  assert.equal(initializations, 1); assert.equal(engine.knowledgeTopicE5Status.status, "ready");
  assert.equal(first.e5Cosine, 1); assert.equal(second.e5Cosine, 0);
  assert.equal(first.canonicalAuthority, false); assert.equal(first.persistence, "NONE");
  assert.equal(first.e5.inputStrategy, "SYMMETRIC_PASSAGE_PREFIX");
});

test("E5 matrix preserves 70 frozen pairs and reports raw distributions", async () => {
  let initializations = 0;
  const topicLoader = async () => { initializations += 1; return { backend: "mock", attempts: [], loadMilliseconds: 1, artifact: {}, inputStrategy: "SYMMETRIC_PASSAGE_PREFIX",
    encode: async text => new Float32Array(text.includes("Dogs") ? [0, 1] : [1, 0]) }; };
  const engine = new SemanticEngine(loader, async () => async () => new Float32Array([1, 0]), async () => async () => ({ rawLogit: 1, score: .7 }), topicLoader);
  await engine.initialize(); const result = await engine.runKnowledgeTopicE5Matrix();
  assert.equal(result.rows.length, 70); assert.equal(initializations, 1); assert.equal(result.classificationStatus, "RAW_DISTRIBUTIONS_FIRST");
  assert.equal(result.canonicalAuthority, false); assert.equal(result.persistence, "NONE");
  assert.equal(result.summary.distributions.HARD_NEGATIVE.count, 5);
  assert.equal(result.summary.distributions.SAME_TOPIC_DIFFERENT_STRUCTURE.count, 4);
  assert.ok(result.uniqueInputs > 0 && result.uniqueInputs < result.rows.length * 2);
});

test("E5 shadow clustering is nonpersistent, order resistant, and complete-link safe", async () => {
  const vectors = { a: [1, 0], b: [.98, .2], bridge: [.75, .66], other: [0, 1] };
  const encode = async text => new Float32Array(vectors[text]); const cosine = (left, right) => {
    const dot = left[0] * right[0] + left[1] * right[1]; return dot / (Math.hypot(...left) * Math.hypot(...right));
  };
  const memories = Object.keys(vectors).map(id => ({ id, content: id })); const before = structuredClone(memories);
  const raw = await simulateTopicAreas(memories, encode, cosine);
  assert.equal(raw.shadowAreas.length, 4); assert.equal(raw.decisionPolicy, "RAW_EVIDENCE_ONLY");
  assert.ok(raw.shadowAreas.every(area => area.uncertainty === "NO_DECISION_THRESHOLD_PROMOTED"));
  assert.equal(raw.assignments.length, 4); assert.equal(raw.blockedMerges.length, 6); assert.ok(raw.blockedMerges.every(item => item.uncertainty));
  const first = await simulateTopicAreas(memories, encode, cosine, .8); const reversed = await simulateTopicAreas([...memories].reverse(), encode, cosine, .8);
  assert.deepEqual(first.shadowAreas, reversed.shadowAreas); assert.deepEqual(memories, before);
  assert.ok(first.shadowAreas.some(area => area.memoryIds.includes("a") && area.memoryIds.includes("b")));
  assert.ok(!first.shadowAreas.some(area => ["a", "b", "bridge"].every(id => area.memoryIds.includes(id))));
  assert.equal(first.persistence, "NONE"); assert.equal(first.canonicalAuthority, false);
  assert.equal(KNOWLEDGE_TOPIC_E5_RULES.maximumDiagnosticMemories, 9); assert.equal(KNOWLEDGE_TOPIC_E5_RULES.maximumPairEvidence, 36);
  await assert.rejects(() => simulateTopicAreas(Array.from({ length: 10 }, (_, id) => ({ id: String(id), content: "a" })), encode, cosine), /exceeds its diagnostic memory bound/);
});

test("E5 initialization failure is explicit and never falls back to MiniLM evidence", async () => {
  const engine = new SemanticEngine(loader, async () => async () => new Float32Array([1, 0]), async () => async () => ({ rawLogit: 1, score: .7 }),
    async () => { throw new Error("unsupported E5 operator"); });
  await engine.initialize();
  await assert.rejects(() => engine.inspectKnowledgeTopicE5("left", "right"), /unsupported E5 operator/);
  assert.equal(engine.knowledgeTopicE5Status.status, "unavailable");
  assert.match(engine.knowledgeTopicE5Status.error, /unsupported E5 operator/);
});

test("E5 score summaries and multilingual diagnostics remain evaluation-only", () => {
  const summary = summarizeTopicScores([
    { group: "same", expected: "SAME_TOPIC", e5Cosine: .9 }, { group: "same", expected: "SAME_TOPIC", e5Cosine: .8 },
    { group: "hard-negative", expected: "DIFFERENT_TOPIC", e5Cosine: .2 }, { group: "different", expected: "DIFFERENT_TOPIC", e5Cosine: .3 }
  ]);
  assert.equal(summary.distributions.SAME_TOPIC.count, 2); assert.equal(summary.distributions.DIFFERENT_TOPIC.count, 2);
  assert.equal(summary.distributions.HARD_NEGATIVE.count, 1); assert.equal(summary.rawSeparation.separated, true); assert.equal(summary.decisionPromoted, false);
  assert.equal(KNOWLEDGE_TOPIC_NINE.length, 9); assert.equal(KNOWLEDGE_TOPIC_MULTILINGUAL.length, 6);
  assert.ok(KNOWLEDGE_TOPIC_MULTILINGUAL.some(pair => pair.group.startsWith("swedish")));
  assert.ok(KNOWLEDGE_TOPIC_MULTILINGUAL.some(pair => pair.group.startsWith("cross-lingual")));
});

test("E5 manual pooling respects attention masks and normalizes only the final embedding", () => {
  const tokens = new Float32Array([
    1, 2, 3,
    3, 4, 5,
    10_000, 10_000, 10_000
  ]);
  const { pooled, includedTokens } = meanPoolWithAttentionMask(tokens, [1, 3, 3], new BigInt64Array([1n, 1n, 0n]));
  assert.equal(includedTokens, 2); assert.deepEqual([...pooled], [2, 3, 4]);
  const normalized = normalizeEmbedding(pooled); const stats = vectorStatistics(normalized);
  assert.equal(normalized.length, 3); assert.ok(Math.abs(stats.norm - 1) < 1e-6);
  assert.throws(() => meanPoolWithAttentionMask(tokens, [1, 3, 3], new BigInt64Array([0n, 0n, 0n])), /contains no tokens/);
});

test("E5 vector diagnostics validate cosine, copies, and numerical independence", () => {
  const left = normalizeEmbedding(new Float32Array([3, 4])); const right = normalizeEmbedding(new Float32Array([4, -3]));
  assert.ok(Math.abs(cosineSimilarity(left, right) - dotProduct(left, right)) < 1e-7);
  assert.ok(Math.abs(cosineSimilarity(left, left) - 1) < 1e-7);
  const comparison = compareEmbeddingVectors(left, new Float32Array(left));
  assert.equal(comparison.maxAbsoluteDifference, 0); assert.equal(comparison.identicalComponentCount, left.length);
  const changed = new Float32Array(left); changed[0] += .25;
  assert.ok(compareEmbeddingVectors(left, changed).maxAbsoluteDifference > 0);
});

test("bounded E5 implementation audit reports contract checks without persistence", async () => {
  const contract = { tokenizerInputs: ["input_ids", "attention_mask"], inputShapes: { input_ids: [1, 8], attention_mask: [1, 8] },
    outputKeys: ["last_hidden_state"], outputTensorShapes: { last_hidden_state: [1, 8, 4] }, selectedTensor: "last_hidden_state",
    selectedTensorShape: [1, 8, 4], tensorSemantics: "[batch, sequence_length, hidden_size]", poolingMethod: "ATTENTION_MASKED_MEAN",
    normalizationMethod: "L2_ACROSS_FINAL_EMBEDDING" };
  const embeddingFor = (text, prefix) => {
    let hash = prefix === "passage" ? 3 : prefix === "query" ? 5 : 7;
    for (const character of text) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
    return normalizeEmbedding(new Float32Array([1 + hash % 13, 2 + hash % 17, 3 + hash % 19, 4 + hash % 23]));
  };
  const model = { model: SEMANTIC_MODELS.knowledgeTopicCandidate, backend: "mock-webgpu", inputStrategy: "SYMMETRIC_PASSAGE_PREFIX", expectedDimensions: 4,
    inspect: async (text, prefix = "passage") => { const embedding = embeddingFor(text, prefix); const stats = vectorStatistics(embedding); return {
      originalText: text, embedding: new Float32Array(embedding), modelContract: contract,
      normalization: { dimension: 4, preNorm: 8, postNorm: stats.norm, componentMin: stats.componentMin, componentMax: stats.componentMax,
        componentMean: stats.componentMean, componentStdDev: stats.componentStdDev },
      tokenSanity: { tokenCount: 8, nonPaddingTokenCount: 8, sequenceLength: 8, embeddingDimension: 4, finalEmbeddingNorm: stats.norm, tokenTypeIdsPresent: true }
    }; } };
  const audit = await runE5ImplementationAudit(model, cosineSimilarity);
  assert.equal(audit.conclusion, "IMPLEMENTATION_CORRECT"); assert.equal(audit.modelContract.poolingMethod, "ATTENTION_MASKED_MEAN");
  assert.equal(audit.normalization.dimension, 4); assert.ok(Math.abs(audit.normalization.postNorm - 1) < 1e-6);
  assert.equal(audit.bufferIndependence.independentBuffers, true); assert.equal(audit.pairSanity.length, 7);
  assert.equal(audit.backendComparison.status, "NOT_TESTED"); assert.equal(audit.canonicalAuthority, false); assert.equal(audit.persistence, "NONE");
});

const createMockJinaModel = () => ({
  ...JINA_TOPIC_MODEL,
  backend: "mock-wasm",
  attempts: [],
  loadMilliseconds: 12,
  tokenizer: JINA_TOPIC_MODEL.id,
  modelClass: "AutoModelForSequenceClassification",
  runtime: "Transformers.js 3.8.1",
  async score(left, right) {
    const rawScore = (left.length % 11) / 5 + (right.length % 7) / 10;
    return { rawScore, relevanceScore: sigmoid(rawScore), inferenceMilliseconds: 2,
      contract: { tokenizerInputs: ["input_ids", "attention_mask", "token_type_ids"], inputShapes: { input_ids: [1, 12] },
        outputKeys: ["logits"], outputShapes: { logits: [1, 1] }, selectedOutput: "logits", selectedShape: [1, 1],
        outputInterpretation: "RAW_RELEVANCE_LOGIT", documentedTransform: "SIGMOID_FOR_RELEVANCE_RANKING", truncation: true, padding: true, id2label: { 0: "LABEL_0" } }
    };
  }
});

test("Jina topic candidate remains lazy and reports bidirectional raw evidence", async () => {
  let initializations = 0; const jinaLoader = async () => { initializations += 1; return createMockJinaModel(); };
  const engine = new SemanticEngine(loader, async () => async () => new Float32Array([1, 0]), async () => async () => ({ rawLogit: 1, score: .7 }),
    async () => ({ encode: async () => new Float32Array([1, 0]) }), jinaLoader);
  assert.equal(engine.jinaStatus.status, "idle"); assert.equal(initializations, 0);
  await engine.initialize(); assert.equal(initializations, 0);
  const result = await engine.inspectKnowledgeTopicJina("short", "a longer document");
  assert.equal(initializations, 1); assert.equal(engine.jinaStatus.status, "ready");
  assert.equal(typeof result.forwardRawScore, "number"); assert.equal(typeof result.reverseRawScore, "number");
  assert.equal(result.meanRawScore, (result.forwardRawScore + result.reverseRawScore) / 2);
  assert.equal(result.rawScoreAsymmetry, Math.abs(result.forwardRawScore - result.reverseRawScore));
  assert.equal(result.canonicalAuthority, false); assert.equal(result.authority, "SHADOW_ONLY"); assert.equal(result.persistence, "NONE");
});

test("Jina diagnostics reuse frozen fixtures and do not select a threshold", async () => {
  const model = createMockJinaModel();
  const matrix = await runJinaMatrix(model);
  assert.equal(matrix.expectedPairCount, 70); assert.equal(matrix.rows.length, 70); assert.equal(matrix.failures.length, 0);
  assert.equal(matrix.summary.groupCounts.SAME_TOPIC, 25); assert.equal(matrix.summary.groupCounts.DIFFERENT_TOPIC, 45);
  assert.equal(matrix.summary.groupCounts.HARD_NEGATIVE, 5); assert.equal(matrix.summary.groupCounts.SAME_TOPIC_DIFFERENT_STRUCTURE, 4);
  assert.equal(matrix.summary.thresholdSelected, false); assert.equal(matrix.summary.classificationEvaluated, false);
  assert.equal(matrix.calibrationStatus, "INSUFFICIENT_CALIBRATION");
  const multilingual = await runJinaMultilingual(model);
  assert.equal(multilingual.rows.length, KNOWLEDGE_TOPIC_MULTILINGUAL.length); assert.equal(multilingual.multilingualAuthorityClaimed, false);
  assert.equal(multilingual.thresholdTuningAllowed, false);
});

test("Jina ten-memory simulation is isolated and refuses uncalibrated merges", async () => {
  const fixtureBefore = [...KNOWLEDGE_TOPIC_TEN]; const simulation = await simulateJinaAreas(createMockJinaModel());
  assert.equal(simulation.status, "INSUFFICIENT_CALIBRATION"); assert.equal(simulation.memories.length, 10);
  assert.equal(simulation.pairEvidence.length, JINA_DIAGNOSTIC_LIMITS.maximumSimulationPairs);
  assert.equal(simulation.diagnosticView.length, 10); assert.ok(simulation.diagnosticView.every(area => area.memoryIds.length === 1));
  assert.equal(simulation.clusteringPolicy, "NOT_RUN_WITHOUT_INDEPENDENT_CALIBRATION");
  assert.equal(simulation.canonicalAuthority, false); assert.equal(simulation.persistence, "NONE");
  assert.deepEqual(KNOWLEDGE_TOPIC_TEN, fixtureBefore);
  assert.deepEqual(KNOWLEDGE_TOPIC_TEN.slice(0, 9), KNOWLEDGE_TOPIC_NINE);
});

test("Jina audit remains uncertain outside a real browser and score summaries preserve raw values", async () => {
  const model = createMockJinaModel(); const audit = await auditJinaModel(model);
  assert.equal(audit.conclusion, "IMPLEMENTATION_UNCERTAIN"); assert.equal(audit.modelContract.selectedOutput, "logits");
  assert.equal(audit.scoreExtraction.probabilityAssumed, false); assert.equal(audit.repeatedInput.deterministic, true);
  assert.equal(audit.semanticQualityConclusion, "NOT_EVALUATED_BY_IMPLEMENTATION_AUDIT");
  const pair = await inspectJinaPair(model, "left", "right");
  const summary = summarizeJinaRows([{ group: "one", expected: "SAME_TOPIC", ...pair }, { group: "hard-negative", expected: "DIFFERENT_TOPIC", ...pair }]);
  assert.equal(summary.distributions.SAME_TOPIC.count, 1); assert.equal(summary.distributions.HARD_NEGATIVE.count, 1);
  assert.equal(summary.thresholdSelected, false); assert.equal(sigmoid(0), .5);
});

test("Jina initialization failures remain explicit and unavailable", async () => {
  const engine = new SemanticEngine(loader, async () => async () => new Float32Array([1, 0]), async () => async () => ({ rawLogit: 1, score: .7 }),
    async () => ({ encode: async () => new Float32Array([1, 0]) }), async () => { throw new Error("Jina ONNX unsupported"); });
  await engine.initialize();
  await assert.rejects(() => engine.inspectKnowledgeTopicJina("left", "right"), /Jina ONNX unsupported/);
  assert.equal(engine.jinaStatus.status, "unavailable"); assert.match(engine.jinaStatus.lastError, /Jina ONNX unsupported/);
});
