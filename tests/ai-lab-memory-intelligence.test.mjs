import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPTANCE_THRESHOLDS, MEMORY_MODELS, QUALIFICATION } from '../ai-lab/memory-intelligence-config.js';
import { extractModelJson, validateModelAnalysis } from '../ai-lab/memory-intelligence-schema.js';
import { applyReviewedProposal, buildMemoryProposal, createLabState, mergeCategories, rejectProposal, renameCategory, undoLatestReviewedRun } from '../ai-lab/memory-intelligence-engine.js';
import { MEMORY_BENCHMARK, classificationMetrics, relationshipMetrics, topicMetrics } from '../ai-lab/memory-intelligence-benchmark.js';

const context = {
  categories: [{ id: 'category-existing', domain: 'Science', name: 'Ocean currents', similarity: .7 }],
  memories: [{ id: 'memory-existing', canonicalText: 'Ocean currents move heat.', similarity: .8 }],
};
const validModelValue = {
  language: 'en', domain: 'Ocean Science', topic: 'Ocean currents', primaryType: 'FACT_CLAIM', secondaryTypes: [], informationConfidence: .8,
  evidence: 'Ocean currents move heat.',
  categoryDecision: { action: 'REUSE_EXISTING', existingCategoryId: 'category-existing', confidence: .8 },
  memoryDecision: { action: 'LINK_EXISTING', targetMemoryId: 'memory-existing', confidence: .8, evidence: 'Ocean currents move heat.', reason: 'Same stated claim.' },
};

test('memory pipeline pins local browser models and keeps semantic stages unqualified', () => {
  assert.equal(MEMORY_MODELS.embedding.backend, 'wasm');
  assert.match(MEMORY_MODELS.embedding.revision, /^[a-f0-9]{40}$/u);
  assert.match(MEMORY_MODELS.analysis.revision, /^[a-f0-9]{40}$/u);
  assert.equal(QUALIFICATION.embeddingRetrieval.qualified, true);
  assert.equal(QUALIFICATION.topicDiscovery.qualified, false);
  assert.equal(QUALIFICATION.relationshipDecision.qualified, false);
  assert.equal(ACCEPTANCE_THRESHOLDS.relationship.maximumFalseMergeRate, .02);
});

test('strict model validation preserves IDs, quotes and qualification status', () => {
  const parsed = extractModelJson(`\`\`\`json\n${JSON.stringify(validModelValue)}\n\`\`\``);
  assert.equal(parsed.method, 'fenced');
  const result = validateModelAnalysis(parsed.value, validModelValue.evidence, context);
  assert.equal(result.valid, true);
  assert.equal(result.value.memoryDecision.action, 'NEEDS_REVIEW');
  assert.equal(result.value.memoryDecision.modelProposedAction, 'LINK_EXISTING');
  assert.equal(result.value.informationType.qualified, false);
  assert.ok(validateModelAnalysis({ ...validModelValue, memoryDecision: { ...validModelValue.memoryDecision, targetMemoryId: 'invented' } }, validModelValue.evidence, context).errors.includes('MEMORY_REFERENCE_UNKNOWN'));
  assert.ok(validateModelAnalysis({ ...validModelValue, categoryDecision: { ...validModelValue.categoryDecision, existingCategoryId: 'invented' } }, validModelValue.evidence, context).errors.includes('CATEGORY_REFERENCE_UNKNOWN'));
  assert.ok(validateModelAnalysis({ ...validModelValue, evidence: 'fabricated quote' }, validModelValue.evidence, context).errors.includes('EVIDENCE_INVALID'));
});

const analysis = validateModelAnalysis(validModelValue, validModelValue.evidence, context).value;
const proposal = buildMemoryProposal({ runId: 'run-1', originalText: validModelValue.evidence, embedding: [1, 0], analysis, candidates: context, createdAt: '2026-01-01T00:00:00.000Z' });
const ids = (() => { let value = 0; return prefix => `${prefix}-${++value}`; })();

test('reviewed create is atomic, preserves original text and is idempotent', () => {
  const review = { action: 'CREATE_NEW', targetMemoryId: null, domain: 'Ocean Science', topic: 'Ocean currents', categoryId: null, categoryName: 'Ocean currents', primaryType: 'FACT_CLAIM', secondaryTypes: [] };
  const first = applyReviewedProposal(createLabState(), proposal, review, { now: '2026-01-02T00:00:00.000Z', idFactory: ids });
  assert.equal(first.categories.length, 1); assert.equal(first.canonicalMemories.length, 1); assert.equal(first.observations.length, 1);
  assert.equal(first.observations[0].originalText, validModelValue.evidence);
  assert.equal(first.canonicalMemories[0].canonicalText, validModelValue.evidence);
  assert.deepEqual(applyReviewedProposal(first, proposal, review), first);
});

test('link reinforces a canonical memory without destroying either observation', () => {
  const createReview = { action: 'CREATE_NEW', targetMemoryId: null, domain: 'Ocean Science', topic: 'Ocean currents', categoryId: null, categoryName: 'Ocean currents', primaryType: 'FACT_CLAIM', secondaryTypes: [] };
  let state = applyReviewedProposal(createLabState(), proposal, createReview, { idFactory: prefix => `${prefix}-a`, now: '2026-01-02T00:00:00.000Z' });
  const secondAnalysis = { ...analysis, language: 'sv' };
  const second = buildMemoryProposal({ runId: 'run-2', originalText: 'Havsströmmar transporterar värme.', embedding: [.8, .2], analysis: secondAnalysis, candidates: { memories: [{ id: 'memory-a', similarity: .91 }], categories: [] } });
  state = applyReviewedProposal(state, second, { action: 'LINK_EXISTING', targetMemoryId: 'memory-a', domain: 'Ocean Science', topic: 'Ocean currents', categoryId: null, categoryName: '', primaryType: 'FACT_CLAIM', secondaryTypes: [] }, { idFactory: prefix => `${prefix}-b` });
  assert.equal(state.canonicalMemories.length, 1); assert.equal(state.observations.length, 2); assert.equal(state.canonicalMemories[0].observationIds.length, 2);
  assert.deepEqual(state.observations.map(item => item.originalText), [validModelValue.evidence, 'Havsströmmar transporterar värme.']);
  const undone = undoLatestReviewedRun(state, '2026-01-03T00:00:00.000Z');
  assert.equal(undone.canonicalMemories.length, 1); assert.equal(undone.observations.length, 2); assert.equal(undone.canonicalMemories[0].observationIds.length, 1);
  assert.equal(undone.observations.find(item => item.runId === 'run-2').status, 'UNDONE');
  assert.equal(undone.runs.find(run => run.id === 'run-2').status, 'UNDONE');
  assert.deepEqual(applyReviewedProposal(undone, second, { action: 'LINK_EXISTING' }), undone);
});

test('related and contradictory reviews create separate reversible memories', () => {
  const createReview = { action: 'CREATE_NEW', targetMemoryId: null, domain: 'Marine Science', topic: 'Kelp forests', categoryId: null, categoryName: 'Kelp forests', primaryType: 'FACT_CLAIM', secondaryTypes: [] };
  let state = applyReviewedProposal(createLabState(), proposal, createReview, { idFactory: prefix => `${prefix}-base` });
  for (const [runId, action, text] of [['run-related', 'RELATED_BUT_DISTINCT', 'Kelp forests shelter many fish.'], ['run-contradiction', 'CONTRADICTS_OR_UPDATES', 'Kelp does not grow at this site anymore.']]) {
    const nextProposal = buildMemoryProposal({ runId, originalText: text, embedding: [.7, .3], analysis, candidates: { memories: [{ id: 'memory-base', similarity: .82 }], categories: [] } });
    state = applyReviewedProposal(state, nextProposal, { action, targetMemoryId: 'memory-base', domain: 'Marine Science', topic: 'Kelp forests', categoryId: 'category-base', categoryName: '', primaryType: 'FACT_CLAIM', secondaryTypes: [] }, { idFactory: prefix => `${prefix}-${runId}` });
  }
  assert.equal(state.canonicalMemories.length, 3); assert.equal(state.relationships.length, 2);
  assert.deepEqual(new Set(state.relationships.map(item => item.type)), new Set(['RELATED_BUT_DISTINCT', 'CONTRADICTS_OR_UPDATES']));
  assert.ok(state.relationships.every(item => item.reversible));
});

test('rejection, rename and category merge preserve canonical memories', () => {
  const rejected = rejectProposal(createLabState(), proposal);
  assert.equal(rejected.runs[0].status, 'REJECTED'); assert.equal(rejected.canonicalMemories.length, 0);
  const state = {
    ...createLabState(), categories: [
      { id: 'c1', domain: 'Crafts', name: 'Glazing', aliases: [] }, { id: 'c2', domain: 'Crafts', name: 'Ceramics', aliases: [] },
    ], canonicalMemories: [{ id: 'm1', categoryId: 'c1', updatedAt: null }],
  };
  const renamed = renameCategory(state, 'c1', 'Ceramic glazing'); assert.ok(renamed.categories[0].aliases.includes('Glazing'));
  const merged = mergeCategories(renamed, 'c1', 'c2'); assert.equal(merged.categories.length, 1); assert.equal(merged.canonicalMemories[0].categoryId, 'c2'); assert.equal(merged.canonicalMemories.length, 1);
});

test('benchmark has independent development and held-out sets above required size', () => {
  assert.deepEqual(MEMORY_BENCHMARK.counts, { topic: 100, informationType: 108, relationship: 120 });
  for (const cases of [MEMORY_BENCHMARK.topic, MEMORY_BENCHMARK.informationType, MEMORY_BENCHMARK.relationship]) {
    assert.ok(cases.some(item => item.split === 'development')); assert.ok(cases.some(item => item.split === 'heldOut'));
    assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  }
  const developmentTopics = new Set(MEMORY_BENCHMARK.topic.filter(item => item.split === 'development').flatMap(item => item.expectedTopic));
  const heldTopics = new Set(MEMORY_BENCHMARK.topic.filter(item => item.split === 'heldOut').flatMap(item => item.expectedTopic));
  assert.equal([...developmentTopics].some(topic => heldTopics.has(topic)), false);
  for (const split of ['development', 'heldOut']) assert.deepEqual(new Set(MEMORY_BENCHMARK.informationType.filter(item => item.split === split).map(item => item.language)), new Set(['en', 'sv']));
});

test('benchmark metrics expose topic, type and false-merge quality', () => {
  const topicCases = MEMORY_BENCHMARK.topic.slice(0, 2); const topic = topicMetrics(topicCases, topicCases.map(item => ({ domain: item.expectedDomain[0], topic: item.expectedTopic[0] })));
  assert.equal(topic.domainAccuracy, 1); assert.equal(topic.topicAccuracy, 1);
  const reuse = topicMetrics(topicCases, topicCases.map((item, index) => ({ domain: item.expectedDomain[0], topic: item.expectedTopic[0], categoryId: index ? 'category-a' : 'category-a' })));
  assert.equal(reuse.categoryReuseAccuracy, 1); assert.equal(reuse.categoryDuplicationRate, 0);
  const typeCases = [{ expected: 'QUESTION' }, { expected: 'OPINION' }, { expected: 'QUESTION' }]; const type = classificationMetrics(typeCases, ['QUESTION', 'QUESTION', 'UNCERTAIN']);
  assert.equal(type.accuracy, 1 / 3); assert.equal(type.abstentionRate, 1 / 3); assert.equal(type.confusion.length, 9);
  const relationCases = [{ expected: 'LINK_EXISTING' }, { expected: 'CREATE_NEW' }, { expected: 'CONTRADICTS_OR_UPDATES' }]; const relation = relationshipMetrics(relationCases, ['LINK_EXISTING', 'LINK_EXISTING', 'CONTRADICTS_OR_UPDATES']);
  assert.equal(relation.linkPrecision, .5); assert.equal(relation.falseMergeRate, 1 / 3); assert.equal(relation.contradictionRecall, 1);
  assert.equal(relation.confusion.length, 5); assert.ok(relation.macroF1 > 0 && relation.macroF1 < 1);
});
