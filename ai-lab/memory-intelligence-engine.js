import { INFORMATION_TYPES } from './evaluation.js';
import { MEMORY_ACTIONS, analysisModelEvidence } from './memory-intelligence-schema.js';
import { MEMORY_LAB_VERSION, QUALIFICATION } from './memory-intelligence-config.js';

const clone = value => structuredClone(value);
const labelValid = value => typeof value === 'string' && value.normalize('NFC').trim().length >= 2
  && value.normalize('NFC').trim().length <= 80 && !/[<>\p{Cc}\p{Cf}]/u.test(value);
const unitVector = vector => {
  const norm = Math.hypot(...vector); return norm ? vector.map(value => value / norm) : [...vector];
};
const centroid = observations => unitVector(observations[0].embedding.map((_, index) =>
  observations.reduce((sum, observation) => sum + observation.embedding[index], 0) / observations.length));

export function createLabState(createdAt = new Date().toISOString()) {
  return { version: MEMORY_LAB_VERSION, revision: 0, createdAt, updatedAt: null, categories: [], canonicalMemories: [], observations: [], relationships: [], runs: [] };
}

export function buildMemoryProposal({ runId, originalText, embedding, analysis, candidates = {}, diagnostics = {}, createdAt = new Date().toISOString() }) {
  if (!runId || typeof originalText !== 'string' || !originalText.trim() || !Array.isArray(embedding) || !embedding.length || embedding.some(value => !Number.isFinite(value))) throw Error('PROPOSAL_INPUT_INVALID');
  return {
    id: runId, originalText, embedding: [...embedding], createdAt,
    language: analysis.language,
    domain: analysis.domain == null ? null : { name: analysis.domain, source: 'model', status: 'proposed', qualified: QUALIFICATION.topicDiscovery.qualified },
    topic: analysis.topic == null ? null : { name: analysis.topic, source: 'model', status: 'proposed', qualified: QUALIFICATION.topicDiscovery.qualified },
    informationType: clone(analysis.informationType), categoryDecision: clone(analysis.categoryDecision), memoryDecision: clone(analysis.memoryDecision),
    evidence: analysisModelEvidence(), candidates: clone(candidates), diagnostics: clone(diagnostics),
  };
}

export function validateReview(review, state) {
  const errors = [];
  if (!review || !MEMORY_ACTIONS.includes(review.action) || review.action === 'NEEDS_REVIEW') errors.push('REVIEW_ACTION_REQUIRED');
  if (!labelValid(review.domain)) errors.push('REVIEW_DOMAIN_INVALID');
  if (!labelValid(review.topic)) errors.push('REVIEW_TOPIC_INVALID');
  if (!INFORMATION_TYPES.includes(review.primaryType)) errors.push('REVIEW_TYPE_INVALID');
  if (!Array.isArray(review.secondaryTypes) || review.secondaryTypes.some(type => !INFORMATION_TYPES.includes(type) || type === review.primaryType)) errors.push('REVIEW_SECONDARY_TYPES_INVALID');
  const targetRequired = ['LINK_EXISTING', 'RELATED_BUT_DISTINCT', 'CONTRADICTS_OR_UPDATES'].includes(review.action);
  if (targetRequired && !state.canonicalMemories.some(memory => memory.id === review.targetMemoryId && memory.status !== 'UNDONE')) errors.push('REVIEW_TARGET_UNKNOWN');
  if (!targetRequired && review.targetMemoryId != null) errors.push('REVIEW_TARGET_UNEXPECTED');
  if (review.action !== 'LINK_EXISTING' && review.categoryId && !state.categories.some(category => category.id === review.categoryId)) errors.push('REVIEW_CATEGORY_UNKNOWN');
  if (review.action !== 'LINK_EXISTING' && !review.categoryId && !labelValid(review.categoryName || review.topic)) errors.push('REVIEW_CATEGORY_LABEL_INVALID');
  return { valid: errors.length === 0, errors };
}

function categoryFor(next, review, now, idFactory) {
  if (review.categoryId) return next.categories.find(category => category.id === review.categoryId);
  const category = {
    id: idFactory('category'), domain: review.domain.normalize('NFC').trim(), name: (review.categoryName || review.topic).normalize('NFC').trim(),
    source: 'human-reviewed-model-proposal', createdAt: now, updatedAt: now, aliases: [],
  };
  next.categories.push(category); return category;
}

const addRelationship = (next, fromMemoryId, toMemoryId, type, proposal, now, idFactory) => {
  const existing = next.relationships.find(item => item.fromMemoryId === fromMemoryId && item.toMemoryId === toMemoryId && item.type === type);
  if (existing) return existing;
  const relation = {
    id: idFactory('relationship'), fromMemoryId, toMemoryId, type, createdAt: now,
    runId: proposal.id,
    source: 'human-review', modelProposal: proposal.memoryDecision.modelProposedAction,
    evidence: { sourceText: proposal.originalText, similarity: proposal.candidates.memories?.find(item => item.id === toMemoryId)?.similarity ?? null, model: proposal.evidence.decisionModel },
    reversible: true, status: 'ACTIVE',
  };
  next.relationships.push(relation); return relation;
};

export function applyReviewedProposal(state, proposal, review, options = {}) {
  if (state.runs.some(run => run.id === proposal.id)) return clone(state);
  const validation = validateReview(review, state); if (!validation.valid) throw Error(validation.errors.join(','));
  const next = clone(state); const now = options.now || new Date().toISOString();
  const idFactory = options.idFactory || (prefix => `${prefix}-${crypto.randomUUID()}`);
  const observation = {
    id: idFactory('observation'), runId: proposal.id, originalText: proposal.originalText, language: proposal.language,
    createdAt: proposal.createdAt, reviewedAt: now, embedding: [...proposal.embedding], embeddingModel: proposal.evidence.embeddingModel,
    informationType: { primary: review.primaryType, secondary: [...review.secondaryTypes], source: 'human-review', modelProposal: clone(proposal.informationType) },
    status: 'ACTIVE',
    provenance: {
      source: 'lab-user-input', review: 'explicit-human-acceptance', pipelineVersion: MEMORY_LAB_VERSION,
      classificationModel: proposal.evidence.classificationModel, decisionModel: proposal.evidence.decisionModel,
    },
  };
  next.observations.push(observation);
  let canonical;
  if (review.action === 'LINK_EXISTING') {
    canonical = next.canonicalMemories.find(memory => memory.id === review.targetMemoryId);
    canonical.observationIds.push(observation.id); canonical.updatedAt = now;
    canonical.embedding = centroid(next.observations.filter(item => canonical.observationIds.includes(item.id)));
  } else {
    const category = categoryFor(next, review, now, idFactory);
    canonical = {
      id: idFactory('memory'), canonicalText: proposal.originalText, canonicalTextSource: 'first-observation', categoryId: category.id,
      informationType: review.primaryType, observationIds: [observation.id], embedding: [...proposal.embedding],
      createdAt: now, updatedAt: now, status: 'ACTIVE', provenance: { decision: 'human-review', runId: proposal.id },
    };
    next.canonicalMemories.push(canonical);
    if (review.action === 'RELATED_BUT_DISTINCT') addRelationship(next, canonical.id, review.targetMemoryId, 'RELATED_BUT_DISTINCT', proposal, now, idFactory);
    if (review.action === 'CONTRADICTS_OR_UPDATES') addRelationship(next, canonical.id, review.targetMemoryId, 'CONTRADICTS_OR_UPDATES', proposal, now, idFactory);
  }
  next.runs.push({ id: proposal.id, status: 'APPLIED', reviewedAction: review.action, modelProposedAction: proposal.memoryDecision.modelProposedAction, observationId: observation.id, canonicalMemoryId: canonical.id, modelEvidence: clone(proposal.evidence), reviewedAt: now });
  next.revision += 1; next.updatedAt = now;
  return next;
}

export function rejectProposal(state, proposal, reason = 'Rejected by reviewer', now = new Date().toISOString()) {
  if (state.runs.some(run => run.id === proposal.id)) return clone(state);
  const next = clone(state); next.runs.push({ id: proposal.id, status: 'REJECTED', reason: String(reason).slice(0, 240), reviewedAt: now }); next.revision += 1; next.updatedAt = now; return next;
}

export function undoLatestReviewedRun(state, now = new Date().toISOString()) {
  const run = [...state.runs].reverse().find(item => item.status === 'APPLIED');
  if (!run) throw Error('REVIEWED_RUN_UNAVAILABLE');
  const next = clone(state); const mutableRun = next.runs.find(item => item.id === run.id);
  const memory = next.canonicalMemories.find(item => item.id === run.canonicalMemoryId);
  if (!memory) throw Error('REVIEWED_MEMORY_MISSING');
  const laterRelationship = next.relationships.some(item => item.status !== 'UNDONE' && item.runId !== run.id && (item.fromMemoryId === memory.id || item.toMemoryId === memory.id));
  const createdByRun = memory.provenance?.runId === run.id;
  if (createdByRun) {
    const laterObservations = memory.observationIds.filter(id => id !== run.observationId);
    if (laterObservations.length || laterRelationship) throw Error('REVIEWED_RUN_HAS_DEPENDENCIES');
    memory.status = 'UNDONE'; memory.updatedAt = now;
    next.relationships.filter(item => item.runId === run.id).forEach(item => { item.status = 'UNDONE'; item.undoneAt = now; });
  } else {
    memory.observationIds = memory.observationIds.filter(id => id !== run.observationId);
    if (!memory.observationIds.length) throw Error('REVIEWED_RUN_UNDO_INVALID');
    memory.embedding = centroid(next.observations.filter(item => memory.observationIds.includes(item.id) && item.id !== run.observationId));
    memory.updatedAt = now;
  }
  const observation = next.observations.find(item => item.id === run.observationId);
  if (!observation) throw Error('REVIEWED_OBSERVATION_MISSING');
  observation.status = 'UNDONE'; observation.undoneAt = now;
  mutableRun.status = 'UNDONE'; mutableRun.undoneAt = now;
  next.revision += 1; next.updatedAt = now;
  return next;
}

export function renameCategory(state, categoryId, name, now = new Date().toISOString()) {
  if (!labelValid(name)) throw Error('CATEGORY_NAME_INVALID');
  const next = clone(state); const category = next.categories.find(item => item.id === categoryId); if (!category) throw Error('CATEGORY_UNKNOWN');
  if (category.name !== name.trim()) category.aliases = [...new Set([...(category.aliases || []), category.name])];
  category.name = name.normalize('NFC').trim(); category.source = 'human-review'; category.updatedAt = now; next.revision += 1; next.updatedAt = now; return next;
}

export function mergeCategories(state, sourceId, targetId, now = new Date().toISOString()) {
  if (!sourceId || !targetId || sourceId === targetId) throw Error('CATEGORY_MERGE_INVALID');
  const next = clone(state); const source = next.categories.find(item => item.id === sourceId); const target = next.categories.find(item => item.id === targetId);
  if (!source || !target) throw Error('CATEGORY_UNKNOWN');
  next.canonicalMemories.filter(memory => memory.categoryId === sourceId).forEach(memory => { memory.categoryId = targetId; memory.updatedAt = now; });
  target.aliases = [...new Set([...(target.aliases || []), source.name, ...(source.aliases || [])])]; target.updatedAt = now;
  next.categories = next.categories.filter(item => item.id !== sourceId); next.runs.push({ id: `category-merge-${sourceId}-${targetId}-${next.revision}`, status: 'CATEGORY_MERGED', sourceId, targetId, reviewedAt: now });
  next.revision += 1; next.updatedAt = now; return next;
}
