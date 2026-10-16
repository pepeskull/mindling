import { validLabel as label } from './assessment-contract.js';
import { cosineSimilarity, memoryVector } from './embeddings.js';

export const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const exactMemory = (memories, text) => memories.find(memory =>
  [memory.normalized, memory.normalizedContent, memory.content, ...(memory.matchedVariants || [])]
    .some(value => typeof value === 'string' && normalize(value) === normalize(text)));
export const INTELLIGENCE_FIELDS = ['category', 'categoryId', 'topic', 'relationship', 'relatedMemoryId', 'confidence', 'evidence'];

// Codes are assigned only here, never copied from model output or exception text.
const MEMORY_DIAGNOSTICS = new Set([
  'MEMORY_CONTEXT_SHAPE', 'MEMORY_CONTEXT_MEMORY', 'MEMORY_CONTEXT_CATEGORY', 'MEMORY_CONTEXT_DUPLICATE_ID',
  'MEMORY_CATEGORY_LABEL', 'MEMORY_TOPIC_LABEL', 'MEMORY_CATEGORY_ID', 'MEMORY_RELATED_ID',
  'MEMORY_RELATIONSHIP', 'MEMORY_CONFIDENCE', 'MEMORY_EVIDENCE_FIELD',
  'MEMORY_REFERENCE_REQUIRED', 'MEMORY_DUPLICATE_MISMATCH', 'MEMORY_CORRECTION_MISMATCH',
  'MEMORY_REFERENCE_UNKNOWN', 'MEMORY_CATEGORY_UNKNOWN', 'MEMORY_CORRECTION_CONFIDENCE',
  'MEMORY_CORRECTION_EVIDENCE_LENGTH', 'MEMORY_CORRECTION_EVIDENCE_QUOTE', 'MEMORY_REPEAT_CONFIDENCE'
]);
class MemoryValidationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalidMemory = (code, message) => { throw new MemoryValidationError(code, message); };
export function memoryValidationCode(error) {
  return error instanceof MemoryValidationError && MEMORY_DIAGNOSTICS.has(error.code) ? error.code : 'MEMORY_INVALID';
}

export function validateMemoryContext(context) {
  if (!context || Object.keys(context).sort().join() !== 'categories,memories' || !Array.isArray(context.memories) || context.memories.length > 3 || !Array.isArray(context.categories) || context.categories.length > 12) invalidMemory('MEMORY_CONTEXT_SHAPE', 'Invalid memory context');
  for (const memory of context.memories) {
    if (!memory || Object.keys(memory).sort().join() !== 'content,id' || typeof memory.id !== 'string' || !memory.id.length || memory.id.length > 100 || typeof memory.content !== 'string' || !memory.content.length || memory.content.length > 1000) invalidMemory('MEMORY_CONTEXT_MEMORY', 'Invalid memory reference');
  }
  for (const category of context.categories) if (!category || Object.keys(category).sort().join() !== 'id,name' || typeof category.id !== 'string' || !category.id.length || category.id.length > 100 || !label(category.name)) invalidMemory('MEMORY_CONTEXT_CATEGORY', 'Invalid category reference');
  if (new Set(context.memories.map(m => m.id)).size !== context.memories.length || new Set(context.categories.map(c => c.id)).size !== context.categories.length) invalidMemory('MEMORY_CONTEXT_DUPLICATE_ID', 'Repeated context reference');
}

export function validateMemoryAssessment(a, context, text) {
  if (!label(a.category)) invalidMemory('MEMORY_CATEGORY_LABEL', 'Invalid memory assessment');
  if (!label(a.topic)) invalidMemory('MEMORY_TOPIC_LABEL', 'Invalid memory assessment');
  if (typeof a.categoryId !== 'string' || a.categoryId.length > 100) invalidMemory('MEMORY_CATEGORY_ID', 'Invalid memory assessment');
  if (typeof a.relatedMemoryId !== 'string' || a.relatedMemoryId.length > 100) invalidMemory('MEMORY_RELATED_ID', 'Invalid memory assessment');
  if (!['new', 'repeated', 'related', 'corrective', 'uncertain'].includes(a.relationship)) invalidMemory('MEMORY_RELATIONSHIP', 'Invalid memory assessment');
  if (!Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) invalidMemory('MEMORY_CONFIDENCE', 'Invalid memory assessment');
  if (typeof a.evidence !== 'string' || a.evidence.length > 500) invalidMemory('MEMORY_EVIDENCE_FIELD', 'Invalid memory assessment');
  const linked = ['repeated', 'related', 'corrective', 'uncertain'].includes(a.relationship);
  if (linked !== Boolean(a.relatedMemoryId)) invalidMemory('MEMORY_REFERENCE_REQUIRED', 'Inconsistent memory assessment');
  if (a.duplicate !== (a.relationship === 'repeated')) invalidMemory('MEMORY_DUPLICATE_MISMATCH', 'Inconsistent memory assessment');
  if ((a.kind === 'correction') !== (a.relationship === 'corrective')) invalidMemory('MEMORY_CORRECTION_MISMATCH', 'Inconsistent memory assessment');
  if (context) {
    validateMemoryContext(context);
    if (a.relatedMemoryId && !context.memories.some(m => m.id === a.relatedMemoryId)) invalidMemory('MEMORY_REFERENCE_UNKNOWN', 'Unknown memory reference');
    if (a.categoryId && !context.categories.some(c => c.id === a.categoryId)) invalidMemory('MEMORY_CATEGORY_UNKNOWN', 'Unknown category reference');
  }
  if (a.relationship === 'corrective') {
    if (a.confidence < .95) invalidMemory('MEMORY_CORRECTION_CONFIDENCE', 'Correction evidence is insufficient');
    if (a.evidence.trim().length < 40) invalidMemory('MEMORY_CORRECTION_EVIDENCE_LENGTH', 'Correction evidence is insufficient');
    if (text !== undefined && !text.includes(a.evidence)) invalidMemory('MEMORY_CORRECTION_EVIDENCE_QUOTE', 'Correction evidence is insufficient');
  }
  if (a.relationship === 'repeated' && a.confidence < .95) invalidMemory('MEMORY_REPEAT_CONFIDENCE', 'Equivalence evidence is insufficient');
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
