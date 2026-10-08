import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKnowledgeAreaInspection,
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
