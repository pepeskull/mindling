import { cosineSimilarity, memoryVector } from './embeddings.js';

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

// Retrieval is allowed only after every historical memory has a known BGE
// vector. Unknown legacy vectors remain preserved, never compared by dimension.
export function memoryContext(embedding, mind) {
  if(mind.memories.some(m=>!memoryVector(m)))throw Error('Memory preparation is incomplete. No Energy or rewards changed.');
  const ranked=mind.memories.map(memory=>({memory,score:cosineSimilarity(embedding,memoryVector(memory).values)})).sort((a,b)=>b.score-a.score);
  const candidates=ranked.slice(0,3).map(item=>item.memory);
  const categories=(mind.categories||[]).map(category=>({category,score:Math.max(-1,...ranked.filter(item=>item.memory.categoryId===category.id).map(item=>item.score))})).filter(item=>mind.memories.some(m=>m.categoryId===item.category.id)).sort((a,b)=>b.score-a.score).slice(0,12).map(({category:{id,name}})=>({id,name}));
  const context={memories:candidates.map(m=>({id:m.id,content:m.content})),categories};
  validateMemoryContext(context);return context;
}
