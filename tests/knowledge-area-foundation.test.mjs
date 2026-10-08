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
