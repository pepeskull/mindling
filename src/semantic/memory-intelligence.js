import { cosineSimilarity } from './semantic-engine.js';

export const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const exactMemory = (memories, text) => memories.find(memory =>
  [memory.normalized, memory.normalizedContent, memory.content, ...(memory.matchedVariants || [])]
    .some(value => typeof value === 'string' && normalize(value) === normalize(text)));
export const INTELLIGENCE_FIELDS = ['category', 'categoryId', 'topic', 'relationship', 'relatedMemoryId', 'confidence', 'evidence'];
const label = value => typeof value === 'string' && value.trim() === value && value.length >= 2 && value.length <= 60 && /^[\p{L}\p{N}][\p{L}\p{N} &()+.,'’/:-]*$/u.test(value);

export function validateMemoryContext(context) {
  if (!context || Object.keys(context).sort().join() !== 'categories,memories' || !Array.isArray(context.memories) || context.memories.length > 3 || !Array.isArray(context.categories) || context.categories.length > 12) throw Error('Invalid memory context');
  for (const memory of context.memories) {
    if (!memory || Object.keys(memory).sort().join() !== 'content,id' || typeof memory.id !== 'string' || !memory.id.length || memory.id.length > 100 || typeof memory.content !== 'string' || !memory.content.length || memory.content.length > 1000) throw Error('Invalid memory reference');
  }
  for (const category of context.categories) if (!category || Object.keys(category).sort().join() !== 'id,name' || typeof category.id !== 'string' || !category.id.length || category.id.length > 100 || !label(category.name)) throw Error('Invalid category reference');
  if (new Set(context.memories.map(m => m.id)).size !== context.memories.length || new Set(context.categories.map(c => c.id)).size !== context.categories.length) throw Error('Repeated context reference');
}

export function validateMemoryAssessment(a, context, text) {
  if (!label(a.category) || !label(a.topic) || typeof a.categoryId !== 'string' || a.categoryId.length > 100 || typeof a.relatedMemoryId !== 'string' || a.relatedMemoryId.length > 100 || !['new', 'repeated', 'related', 'corrective', 'uncertain'].includes(a.relationship) || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1 || typeof a.evidence !== 'string' || a.evidence.length > 500) throw Error('Invalid memory assessment');
  const linked = ['repeated', 'related', 'corrective', 'uncertain'].includes(a.relationship);
  if (linked !== Boolean(a.relatedMemoryId) || a.duplicate !== (a.relationship === 'repeated') || (a.kind === 'correction') !== (a.relationship === 'corrective')) throw Error('Inconsistent memory assessment');
  if (context) {
    validateMemoryContext(context);
    if (a.relatedMemoryId && !context.memories.some(m => m.id === a.relatedMemoryId)) throw Error('Unknown memory reference');
    if (a.categoryId && !context.categories.some(c => c.id === a.categoryId)) throw Error('Unknown category reference');
  }
  if (a.relationship === 'corrective' && (a.confidence < .95 || a.evidence.trim().length < 40 || (text !== undefined && !text.includes(a.evidence)))) throw Error('Correction evidence is insufficient');
  if (a.relationship === 'repeated' && a.confidence < .95) throw Error('Equivalence evidence is insufficient');
}

// Categories live alongside canonical memories in the existing atomic snapshot.
// Legacy suggestions alone are not sufficient evidence to classify old records.
export function assignCategory(mind, memory, assessment) {
  mind.categories ||= [];
  let category = mind.categories.find(c => c.id === assessment.categoryId) || mind.categories.find(c => normalize(c.name) === normalize(assessment.category));
  if (!category) {
    category = { id: `category-${crypto.randomUUID()}`, name: assessment.category };
    mind.categories.push(category);
  }
  memory.categoryId = category.id; memory.category = category.name; memory.topic = assessment.topic;
}

// Local embeddings never leave the device. Only three retrieved excerpts and
// twelve relevant category labels enter the signed assessment request.
export async function memoryContext(text, mind, semantic, cache) {
  const memories = mind.memories;
  const local = [];
  for (const memory of memories) {
    const key = `${mind.id}:${memory.id}:${memory.content}`;
    // Original production memories used this same 384-dimensional local encoder.
    const savedLocal = memory.type === 'learned' && ['TALK','TEACH','DEEP_TRAINING'].includes(memory.source) && memory.embedding?.length === 384 && Array.from(memory.embedding).every(Number.isFinite) && Array.from(memory.embedding).some(value => value !== 0);
    if (!cache.has(key)) cache.set(key, savedLocal ? memory.embedding : await semantic.encode(memory.content));
    local.push({ ...memory, embedding: cache.get(key) });
  }
  const comparison = local.length ? await semantic.evaluate(text, local) : null;
  const embedding = comparison?.embedding || (mind.categories?.length ? await semantic.encode(text) : null);
  const candidates = comparison?.match ? [comparison.match] : semantic.retrieveCandidates(embedding || [], local.filter(m => !m.supersededBy), 3).map(c => c.memory);
  const categories = [];
  for (const category of mind.categories || []) {
    if (!label(category.name) || !memories.some(m => m.categoryId === category.id)) continue;
    const key = `category:${category.name}`;
    if (!cache.has(key)) cache.set(key, await semantic.encode(category.name));
    categories.push({ ...category, score: cosineSimilarity(embedding, cache.get(key)) + (candidates.some(m => m.categoryId === category.id) ? 2 : 0) });
  }
  const context = { memories: candidates.map(m => ({ id: m.id, content: m.content.slice(0, 1000) })), categories: categories.sort((a,b) => b.score - a.score).slice(0,12).map(({id,name}) => ({id,name})) };
  validateMemoryContext(context);
  return { context, match: comparison?.match };
}
