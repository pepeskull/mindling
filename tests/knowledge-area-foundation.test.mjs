import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKnowledgeAreaInspection,
  buildKnowledgeArea2AuditSnapshot,
  createProvisionalTopic,
  createTopicHypothesis,
  createTopicVerification,
  evaluateShadowBoundary,
  KNOWLEDGE_AREA_2_EVALUATION,
  TOPIC_HYPOTHESIS_STATUS,
  TOPIC_RELATION
} from "../src/semantic/knowledge-area-foundation.js";
import { auditFlanGeneration, compareFlanBackends, discoverTopic, extractFlanGeneratedText, FLAN_TOPIC_MODEL, parseFlanTopicDecision, runFlanTopicEvaluation, simulateFlanKnowledgeAreas, verifyTopicPair } from "../src/semantic/knowledge-area-flan.js";

const memories = [
  { id: "memory-b", content: "Second canonical fact", strength: .4, activations: 2, neuronIds: ["N-02", "N-03"] },
  { id: "memory-a", content: "First canonical fact", strength: .3, activations: 1, neuronIds: ["N-01", "N-02"] }
];

test("first memory creates a neutral provisional topic without semantic claims", () => {
  const before = structuredClone(memories[0]);
  const topic = createProvisionalTopic(memories[0]);
  assert.equal(topic.status, TOPIC_HYPOTHESIS_STATUS.PROVISIONAL);
  assert.equal(topic.subject, null); assert.equal(topic.discoveryAuthority, false); assert.equal(topic.canonicalAuthority, false);
  assert.match(topic.displayLabel, /^Emerging Knowledge /); assert.deepEqual(memories[0], before);
});

test("topic contracts are deterministic and discovered labels remain hypotheses", () => {
  const first = createTopicHypothesis({ memoryIds: ["memory-b", "memory-a"], subject: "candidate subject", label: "Candidate label", facets: ["facet"] });
  const second = createTopicHypothesis({ memoryIds: ["memory-a", "memory-b"], subject: "candidate subject", label: "Candidate label", facets: ["facet"] });
  assert.equal(first.id, second.id); assert.deepEqual(first.sourceMemoryIds, ["memory-a", "memory-b"]);
  assert.equal(first.status, TOPIC_HYPOTHESIS_STATUS.PROVISIONAL);
  assert.equal(first.labelSource, "UNVERIFIED_DISCOVERY_HYPOTHESIS"); assert.equal(first.discoveryAuthority, false);
});

test("uncertain verification and labels cannot authorize a merge", () => {
  const uncertain = createTopicVerification({ leftId: "memory-a", rightId: "memory-b", decision: TOPIC_RELATION.UNCERTAIN,
    evidence: { label: "same-looking label" }, verifier: "mock-contract-only" });
  assert.equal(uncertain.status, "UNCERTAIN"); assert.equal(uncertain.labelUsedAsEvidence, false); assert.equal(uncertain.mergeAuthorized, false);
  const boundary = evaluateShadowBoundary(["memory-a"], ["memory-b"], [uncertain]);
  assert.equal(boundary.decision, TOPIC_RELATION.UNCERTAIN); assert.equal(boundary.mergeAuthorized, false);
});

test("complete shadow boundary requires every pair and never gains production authority", () => {
  const assessments = [
    createTopicVerification({ leftId: "a", rightId: "c", decision: TOPIC_RELATION.SAME_AREA }),
    createTopicVerification({ leftId: "b", rightId: "c", decision: TOPIC_RELATION.SAME_AREA })
  ];
  const same = evaluateShadowBoundary(["b", "a"], ["c"], assessments);
  assert.equal(same.decision, TOPIC_RELATION.SAME_AREA); assert.equal(same.checks.length, 2);
  assert.equal(same.mergeAuthorized, false); assert.equal(same.productionAuthority, false);
  const missing = evaluateShadowBoundary(["a", "b"], ["c", "d"], assessments);
  assert.equal(missing.decision, TOPIC_RELATION.UNCERTAIN); assert.equal(missing.mergeAuthorized, false);
});

test("inspection exposes real canonical fields without mutating them or persisting derived state", () => {
  const before = structuredClone(memories);
  const topic = createTopicHypothesis({ memoryIds: memories.map(memory => memory.id) });
  const inspection = buildKnowledgeAreaInspection({ topic, memories });
  assert.equal(inspection.canonicalMemoryCount, 2); assert.equal(inspection.memories[0].content, "First canonical fact");
  assert.deepEqual(inspection.participatingNeuronIds, ["N-01", "N-02", "N-03"]);
  assert.equal(inspection.provisional, true); assert.equal(inspection.development, null);
  assert.equal(inspection.productionAuthority, false); assert.equal(inspection.persistence, "NONE");
  assert.deepEqual(memories, before);
});

test("bicycle and bee regression fixture is evaluation data, not runtime authority", () => {
  assert.equal(KNOWLEDGE_AREA_2_EVALUATION.bicycleBee.length, 10);
  assert.deepEqual(KNOWLEDGE_AREA_2_EVALUATION.expectedStructure.groupedSizes, [3, 3]);
  assert.equal(KNOWLEDGE_AREA_2_EVALUATION.expectedStructure.singletonCount, 4);
  assert.equal(KNOWLEDGE_AREA_2_EVALUATION.runtimeAuthority, false);
});

test("audit snapshot compares production and provisional areas without mutation or fabricated evidence", () => {
  const state = { memories }; const before = structuredClone(state);
  const production = { areas: [{ id: "area-current", label: "Current area", memoryCount: 2, cohesion: .8,
    memoryIds: ["memory-a", "memory-b"] }] };
  const snapshot = buildKnowledgeArea2AuditSnapshot(state, production);
  assert.equal(snapshot.canonicalMemoryCount, 2); assert.equal(snapshot.productionAreas.length, 1);
  assert.equal(snapshot.shadowAreas.length, 2); assert.equal(snapshot.summary.uncertainShadowAssignments, 2);
  assert.equal(snapshot.summary.verifiedShadowAssignments, 0); assert.equal(snapshot.verificationStatus.providerAvailable, false);
  assert.equal(snapshot.verificationStatus.message, "No validated topic verifier connected.");
  assert.ok(snapshot.shadowAreas.every(area => area.topicHypothesis === null && area.verification.evidence === null));
  assert.ok(snapshot.shadowAreas.every(area => area.verification.decision === TOPIC_RELATION.UNCERTAIN));
  assert.deepEqual(state, before);
  snapshot.canonicalMemories[0].content = "changed copy";
  assert.deepEqual(state, before);
});

test("audit snapshot safely handles empty and incomplete canonical state", () => {
  const empty = buildKnowledgeArea2AuditSnapshot({}, { areas: [] });
  assert.equal(empty.canonicalMemoryCount, 0); assert.deepEqual(empty.shadowAreas, []);
  const incomplete = buildKnowledgeArea2AuditSnapshot({ memories: [{ id: "minimal" }] }, { areas: [] });
  assert.equal(incomplete.canonicalMemories[0].content, "");
  assert.equal(incomplete.canonicalMemories[0].strength, null); assert.equal(incomplete.canonicalMemories[0].activations, null);
});

test("FLAN shadow provider preserves real outputs and fails malformed decisions closed", async () => {
  const outputs = ["Bicycles", "SAME_AREA", "SAME_AREA"];
  const provider = { generate: async () => ({ text: outputs.shift(), inferenceMilliseconds: 3 }) };
  const discovery = await discoverTopic(provider, { id: "a", content: "A bicycle has two wheels." });
  assert.equal(discovery.subject, "Bicycles"); assert.equal(discovery.rawOutput, "Bicycles"); assert.equal(discovery.membershipAuthority, false);
  const verified = await verifyTopicPair(provider, { id: "a", content: "A bicycle has two wheels." }, { id: "b", content: "Cyclists wear helmets." });
  assert.equal(verified.decision, TOPIC_RELATION.SAME_AREA); assert.equal(verified.productionAuthority, false);
  assert.equal(parseFlanTopicDecision("maybe"), TOPIC_RELATION.UNCERTAIN);
  assert.equal(FLAN_TOPIC_MODEL.revision, "76988c16f73cadb2c2e13e2d7d85608944223105");
});

test("fixed verifier evidence produces deterministic complete-boundary shadow groups", async () => {
  const provider = { generate: async prompt => ({
    text: prompt.includes("Subject:") ? "transport" : prompt.includes("Statement A: alpha") || prompt.includes("Statement A: beta") ? "SAME_AREA" : "DIFFERENT_AREA",
    inferenceMilliseconds: 1
  }) };
  const input = [{ id: "a", content: "alpha" }, { id: "b", content: "beta" }];
  const first = await simulateFlanKnowledgeAreas(provider, input); const second = await simulateFlanKnowledgeAreas(provider, [...input].reverse());
  assert.deepEqual(first.areas, second.areas); assert.deepEqual(first.areas[0].memoryIds, ["a", "b"]);
  assert.equal(first.productionAuthority, false); assert.equal(first.persistence, "NONE");
  assert.deepEqual(input, [{ id: "a", content: "alpha" }, { id: "b", content: "beta" }]);
});

test("frozen evaluation reports coverage without treating mock output as semantic quality", async () => {
  const provider = { generate: async () => ({ text: "UNCERTAIN", inferenceMilliseconds: 0 }) };
  const evaluation = await runFlanTopicEvaluation(provider);
  assert.equal(evaluation.rows.length, 70); assert.equal(evaluation.summary.coverage, 0); assert.equal(evaluation.summary.abstentionRate, 1);
  assert.equal(evaluation.summary.hardNegativeCount, 5); assert.equal(evaluation.calibrationUsed, false);
  assert.equal(evaluation.productionAuthority, false); assert.equal(evaluation.persistence, "NONE");
});

test("FLAN response extraction follows the text2text pipeline contract", () => {
  assert.equal(extractFlanGeneratedText([{ generated_text: "  Das Haus ist wunderbar. " }]), "Das Haus ist wunderbar.");
  assert.throws(() => extractFlanGeneratedText([{ text: "wrong key" }]), /unexpected response shape/);
  assert.throws(() => extractFlanGeneratedText([]), /unexpected response shape/);
});

test("generation sanity preserves response metadata and requires one non-EOS token", async () => {
  const provider = { backend: "mock-webgpu", modelContract: { decoderStartTokenId: 0, eosTokenId: 1, padTokenId: 0 },
    generate: async () => ({ text: "Das Haus ist wunderbar.", rawResponse: [{ generated_text: "Das Haus ist wunderbar." }],
      responseMetadata: { container: "array", length: 1, keys: ["generated_text"], generatedTextType: "string", generatedTextLength: 24 },
      generationParameters: { max_new_tokens: 32, min_new_tokens: 1, do_sample: false, num_beams: 1 }, inferenceMilliseconds: 4 }) };
  const audit = await auditFlanGeneration(provider);
  assert.equal(audit.conclusion, "NONEMPTY_GENERATION_OBSERVED"); assert.equal(audit.pipelineResponse[0].generated_text, "Das Haus ist wunderbar.");
  assert.equal(audit.generationParameters.min_new_tokens, 1); assert.equal(audit.extractionContract, "output[0].generated_text");
  assert.equal(audit.productionAuthority, false); assert.equal(audit.persistence, "NONE");
});

test("empty generation audit includes bounded raw token decoding when available", async () => {
  const provider = { backend: "mock-webgpu", modelContract: { decoderStartTokenId: 0, eosTokenId: 1, padTokenId: 0 },
    generate: async () => ({ text: "", rawResponse: [{ generated_text: "" }], responseMetadata: { generatedTextLength: 0 },
      generationParameters: { max_new_tokens: 32, min_new_tokens: 1, do_sample: false, num_beams: 1 }, inferenceMilliseconds: 2 }),
    inspectTokens: async () => ({ dimensions: [1, 2], tokenIds: [0, 1], decodedWithSpecialTokens: ["<pad></s>"], decodedWithoutSpecialTokens: [""] }) };
  const audit = await auditFlanGeneration(provider);
  assert.equal(audit.conclusion, "EMPTY_GENERATION_OBSERVED"); assert.deepEqual(audit.tokenAudit.tokenIds, [0, 1]);
  assert.deepEqual(audit.tokenAudit.decodedWithoutSpecialTokens, [""]);
});

test("backend comparison creates explicit independent sessions without fallback", async () => {
  const calls = []; const disposed = [];
  const loader = async options => {
    calls.push({ ...options }); const backend = options.backend;
    return { ...FLAN_TOPIC_MODEL, requestedBackend: backend, backend, loadMilliseconds: backend === "webgpu" ? 10 : 20,
      artifactEvents: [{ status: "ready", file: `${backend}.onnx` }], modelContract: { eosTokenId: 1 },
      generate: async () => ({ text: backend === "wasm" ? "Das Haus ist wunderbar." : "", rawResponse: [{ generated_text: backend === "wasm" ? "Das Haus ist wunderbar." : "" }],
        responseMetadata: { container: "array", length: 1, keys: ["generated_text"], generatedTextType: "string", generatedTextLength: backend === "wasm" ? 24 : 0 },
        generationParameters: { max_new_tokens: 32, min_new_tokens: 1, do_sample: false, num_beams: 1 }, inferenceMilliseconds: 3 }),
      dispose: () => disposed.push(backend) };
  };
  const comparison = await compareFlanBackends(loader);
  assert.deepEqual(calls, [{ backend: "webgpu", allowFallback: false }, { backend: "wasm", allowFallback: false }]);
  assert.deepEqual(disposed, ["webgpu", "wasm"]); assert.equal(comparison.sessionsIndependent, true); assert.equal(comparison.fallbackAllowed, false);
  assert.equal(comparison.webgpu.actualBackend, "webgpu"); assert.equal(comparison.wasm.actualBackend, "wasm");
  assert.equal(comparison.interpretation, "WEBGPU_SPECIFIC_GENERATION_FAILURE"); assert.equal(comparison.productionAuthority, false);
});

test("backend comparison reports WASM initialization failure separately", async () => {
  const loader = async ({ backend }) => {
    if (backend === "wasm") throw new Error("unsupported WASM operator");
    return { ...FLAN_TOPIC_MODEL, requestedBackend: backend, backend, loadMilliseconds: 1, artifactEvents: [],
      generate: async () => ({ text: "Nicht leer", rawResponse: [{ generated_text: "Nicht leer" }], responseMetadata: {},
        generationParameters: { max_new_tokens: 32, min_new_tokens: 1, do_sample: false, num_beams: 1 }, inferenceMilliseconds: 1 }), dispose() {} };
  };
  const comparison = await compareFlanBackends(loader);
  assert.equal(comparison.wasm.loadStatus, "FAILED"); assert.equal(comparison.wasm.generationStatus, "NOT_RUN");
  assert.match(comparison.wasm.initializationError, /unsupported WASM operator/);
  assert.equal(comparison.interpretation, "WASM_UNAVAILABLE_OR_FAILED");
});
