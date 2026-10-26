export const SERVICE = 'mindling-reasoning-service';
export const CRITERIA = ['memoryUsage', 'logicalConsistency', 'contradictions', 'exceptions', 'uncertainty', 'explanation'];
export const OUTCOMES = ['supported', 'partially_supported', 'unsupported', 'inconclusive'];
const text = (value, max, empty = false) => typeof value === 'string' && value === value.trim() && value.length <= max && (empty || value.length > 0);
const object = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const strings = (value, max, length) => Array.isArray(value) && value.length <= max && value.every(item => text(item, length)) && new Set(value).size === value.length;
const fail = () => { throw Error('Invalid reasoning service data'); };
const boundedText = max => ({ type: 'string', minLength: 1, maxLength: max });
const strict = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const idArray = ids => ({ type: 'array', maxItems: 10, items: ids.length ? { type: 'string', enum: ids } : { type: 'string', maxLength: 0 } });

export function validateContext(value) {
  if (!object(value, ['version', 'problem', 'candidates', 'totalCurrent']) || ![1, 2].includes(value.version) || !text(value.problem, 2000) || !Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 24 || !Number.isSafeInteger(value.totalCurrent) || value.totalCurrent < value.candidates.length || value.totalCurrent > 100000) fail();
  const ids = new Set();
  for (const m of value.candidates) {
    if (!object(m, ['id','content','complete','concept','topic','category','kind','certainty','verification','confidence','contradictions','conflictsComplete','omittedLinks','links','ranking',...(value.version === 2 ? ['integrity'] : [])]) || !text(m.id, 160) || ids.has(m.id) || !text(m.content, 900) || typeof m.complete !== 'boolean') fail();
    if (value.version === 2) {
      const i = m.integrity;
      if (!object(i, ['sourceStatus','sourceLength','excerptLength','excerptTruncated']) || !['captured','incomplete','unknown'].includes(i.sourceStatus) || !Number.isSafeInteger(i.sourceLength) || i.sourceLength < m.content.length || i.excerptLength !== m.content.length || typeof i.excerptTruncated !== 'boolean' || i.excerptTruncated !== (i.sourceLength > i.excerptLength) || m.complete !== !i.excerptTruncated) fail();
    }
    ids.add(m.id);
    for (const [key, max] of [['concept',100],['topic',100],['category',80],['kind',40],['certainty',40],['verification',80]]) if (!text(m[key], max, true)) fail();
    if (m.confidence !== null && (!Number.isFinite(m.confidence) || m.confidence < 0 || m.confidence > 1)) fail();
    if (typeof m.conflictsComplete !== 'boolean' || !Number.isSafeInteger(m.omittedLinks) || m.omittedLinks < 0 || !strings(m.contradictions, 2, 300) || !Array.isArray(m.links) || m.links.length > 12 || !object(m.ranking, ['score', 'reasons']) || !Number.isFinite(m.ranking.score) || m.ranking.score < 0 || !strings(m.ranking.reasons, 3, 200)) fail();
    for (const link of m.links) if (!object(link, ['id','kind','inContext',...(value.version === 2 ? ['availability'] : [])]) || !text(link.id, 160) || !['association','co-submitted','part-of','history'].includes(link.kind) || typeof link.inContext !== 'boolean' || value.version === 2 && !['available','historical','missing','unusable'].includes(link.availability)) fail();
  }
  for (const m of value.candidates) for (const link of m.links) if (link.inContext !== ids.has(link.id) || link.id === m.id || value.version === 2 && link.inContext && link.availability !== 'available') fail();
  return value;
}
export function selectionSchema(context) { return strict({ memoryIds: idArray(context.candidates.map(m => m.id)), explanation: boundedText(800) }); }
export function validateSelection(value, context) {
  if (!object(value, ['memoryIds','explanation']) || !strings(value.memoryIds, 10, 160) || !text(value.explanation, 800) || value.memoryIds.some(id => !context.candidates.some(m => m.id === id))) fail();
  return value;
}
export function reasoningSchema(ids) {
  return strict({ answer: boundedText(2000), explanation: boundedText(2000),
    facts: { type: 'array', maxItems: 8, items: strict({ memoryId: { type: 'string', enum: ids.length ? ids : [''] }, quote: boundedText(900), basis: { type: 'string', enum: ['stored_claim','recorded_conflict'] } }) },
    inferences: { type: 'array', maxItems: 6, items: strict({ text: boundedText(500), memoryIds: idArray(ids) }) },
    memoryIds: idArray(ids), uncertainty: { type: 'string', enum: ['low','moderate','high'] }, insufficientInformation: { type: 'boolean' }, missingInformation: { type: 'array', maxItems: 6, items: boundedText(500) } });
}
export function validateReasoning(value, memories) {
  if (!object(value, ['answer','explanation','facts','inferences','memoryIds','uncertainty','insufficientInformation','missingInformation']) || !text(value.answer, 2000) || !text(value.explanation, 2000) || !Array.isArray(value.facts) || value.facts.length > 8 || !Array.isArray(value.inferences) || value.inferences.length > 6 || !strings(value.memoryIds, 10, 160) || !['low','moderate','high'].includes(value.uncertainty) || typeof value.insufficientInformation !== 'boolean' || !strings(value.missingInformation, 6, 500)) fail();
  const ids = new Set(memories.map(m => m.id)), used = new Set();
  for (const fact of value.facts) {
    if (!object(fact, ['memoryId','quote','basis']) || !ids.has(fact.memoryId) || !text(fact.quote, 900) || !['stored_claim','recorded_conflict'].includes(fact.basis)) fail();
    const memory = memories.find(m => m.id === fact.memoryId);
    if (!(fact.basis === 'stored_claim' ? [memory.content] : memory.contradictions).some(content => content.includes(fact.quote))) fail();
    used.add(fact.memoryId);
  }
  for (const inference of value.inferences) {
    if (!object(inference, ['text','memoryIds']) || !text(inference.text, 500) || !strings(inference.memoryIds, 10, 160) || !inference.memoryIds.length || inference.memoryIds.some(id => !ids.has(id) || !value.facts.some(fact => fact.memoryId === id))) fail();
    inference.memoryIds.forEach(id => used.add(id));
  }
  if ((!value.insufficientInformation && !value.facts.length) || value.memoryIds.some(id => !ids.has(id)) || value.memoryIds.length !== used.size || [...used].some(id => !value.memoryIds.includes(id)) || !value.insufficientInformation && !value.memoryIds.length || (value.insufficientInformation && !value.missingInformation.length) || (!value.insufficientInformation && value.missingInformation.length)) fail();
  return value;
}
export function evaluationSchema(ids) {
  const criterion = strict({ status: { type: 'string', enum: ['met','not_met','unclear','not_applicable'] }, explanation: boundedText(600), memoryIds: idArray(ids) });
  return strict({ criteria: strict(Object.fromEntries(CRITERIA.map(key => [key, criterion]))), summary: boundedText(1600) });
}
export function validateEvaluation(value, memories, reasoning = null) {
  if (!object(value, ['criteria','summary']) || !object(value.criteria, CRITERIA) || !text(value.summary, 1600)) fail();
  const ids = new Set(memories.map(m => m.id));
  for (const key of CRITERIA) {
    const c = value.criteria[key];
    if (!object(c, ['status','explanation','memoryIds']) || !['met','not_met','unclear','not_applicable'].includes(c.status) || !text(c.explanation, 600) || !strings(c.memoryIds, 10, 160) || c.memoryIds.some(id => !ids.has(id)) || key === 'memoryUsage' && c.status === 'met' && !c.memoryIds.length || key === 'contradictions' && c.status === 'not_applicable' && memories.some(memory => memory.contradictions.length) || ['memoryUsage','logicalConsistency','uncertainty','explanation'].includes(key) && c.status === 'not_applicable') fail();
    if (reasoning && c.status === 'met' && c.memoryIds.some(id => !reasoning.memoryIds.includes(id))) fail();
    if (reasoning && key === 'memoryUsage' && c.status === 'met' && !c.memoryIds.some(id => reasoning.memoryIds.includes(id))) fail();
  }
  return value;
}
// No model-supplied score or outcome. A conservative, public decision rule.
export function evaluationOutcome(reasoning, evaluation) {
  const values = Object.values(evaluation.criteria).map(c => c.status);
  if (reasoning.insufficientInformation || !reasoning.memoryIds.length) return 'inconclusive';
  if (evaluation.criteria.memoryUsage.status === 'not_met' || evaluation.criteria.logicalConsistency.status === 'not_met') return 'unsupported';
  if (values.includes('not_met')) return 'partially_supported';
  if (values.includes('unclear')) return 'inconclusive';
  return 'supported';
}
export function validateResult(value, context) {
  if (!object(value, ['service','model','selection','reasoning','evaluation','outcome']) || value.service !== SERVICE || !text(value.model, 200)) fail();
  validateSelection(value.selection, context);
  const memories = context.candidates.filter(m => value.selection.memoryIds.includes(m.id));
  validateReasoning(value.reasoning, memories); validateEvaluation(value.evaluation, memories, context.version === 2 ? value.reasoning : null);
  if (value.outcome !== evaluationOutcome(value.reasoning, value.evaluation)) fail();
  return value;
}
