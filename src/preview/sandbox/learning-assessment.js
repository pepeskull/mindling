import { retrievePreviewMemories, candidateMetadata } from './memory-retrieval.js';
import { validateAssessment } from './memory-decision.js';
import { validateText } from '../../learning/text.js';
import { exactMemory } from '../../semantic/memory-intelligence.js';

export const LEARNING_SERVICE = 'mindling-learning-service';
const RELATIONSHIPS = new Set(['new', 'related', 'repeated', 'reject']);
const EVIDENCE = new Set(['none', 'lexical_overlap', 'semantic_match', 'exact_match', 'insufficient']);

const clean = (value, maximum) => typeof value === 'string' && value === value.trim() && value.length <= maximum ? value : null;

export function learningContext(text, mind) {
  validateText(text,{allowQuestion:true});
  const active = (mind.memories || []).filter(memory => typeof memory.content === 'string');
  const ranked = retrievePreviewMemories(text, active, { limit: 8 }).map(item => item.memory);
  if(ranked.some(m=>typeof m.id!=='string'||!m.id||m.id.length>100))throw Error('Saved memory identifiers are invalid. No Energy or XP changed.');
  const candidates = ranked.map(memory => ({
    id: memory.id,
    content: memory.content.slice(0, 500).trim(),
    categoryId: typeof memory.categoryId === 'string' ? memory.categoryId.slice(0, 100) : '',
    category: typeof memory.category === 'string' ? memory.category.slice(0, 80) : '',
    topic: typeof memory.topic === 'string' ? memory.topic.slice(0, 100) : '',
    ...candidateMetadata(memory),
    complete:memory.content.length<=500
  }));
  const categories = [];
  for (const category of [...(mind.categories || []), ...active.map(memory => ({ id: memory.categoryId, name: memory.category }))]) {
    if (typeof category?.id !== 'string' || !category.id || typeof category.name !== 'string' || !category.name.trim()) continue;
    if (!categories.some(item => item.id === category.id)) categories.push({ id: category.id.slice(0, 100), name: category.name.trim().slice(0, 80) });
    if (categories.length === 12) break;
  }
  return { input: text.trim(), candidates, categories };
}

export function localExactAssessment(text, mind) {
  const match = exactMemory((mind.memories || []).filter(m=>!m.supersededBy&&m.intelligence?.current!==false), text);
  return match ? {
    meaningful: true, relationship: 'repeated', concept: '', category: '', categoryId: '', topic: '',
    relatedMemoryId: match.id, confidence: 1, evidence: 'exact_match'
  } : null;
}

export function validateServiceAssessment(raw, context) {
  if(raw?.version===2||raw?.version===3)return validateAssessment(raw,context);
  // Explicit legacy contract for already deployed clients and deterministic historical fixtures.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Learning analysis was invalid. No Energy or XP changed.');
  const keys = ['meaningful','relationship','concept','category','categoryId','topic','relatedMemoryId','confidence','evidence'];
  if (Object.keys(raw).length !== keys.length || keys.some(key => !Object.hasOwn(raw, key))) throw Error('Learning analysis was incomplete. No Energy or XP changed.');
  if (typeof raw.meaningful !== 'boolean' || !RELATIONSHIPS.has(raw.relationship) || !EVIDENCE.has(raw.evidence)) throw Error('Learning analysis was invalid. No Energy or XP changed.');
  const concept = clean(raw.concept, 100), category = clean(raw.category, 80), categoryId = clean(raw.categoryId, 100), topic = clean(raw.topic, 100), relatedMemoryId = clean(raw.relatedMemoryId, 100);
  if ([concept, category, categoryId, topic, relatedMemoryId].includes(null) || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) throw Error('Learning analysis was invalid. No Energy or XP changed.');
  const memoryIds = new Set(context.candidates.map(item => item.id)), categoryIds = new Set(context.categories.map(item => item.id));
  if (categoryId && !categoryIds.has(categoryId)) throw Error('Learning analysis referenced an unknown category. No Energy or XP changed.');
  if (categoryId && context.categories.find(item => item.id === categoryId)?.name !== category) throw Error('Learning analysis changed an existing category label. No Energy or XP changed.');
  if (relatedMemoryId && !memoryIds.has(relatedMemoryId)) throw Error('Learning analysis referenced an unknown memory. No Energy or XP changed.');
  if (!raw.meaningful || raw.relationship === 'reject') {
    if (raw.meaningful || raw.relationship !== 'reject' || concept || category || categoryId || topic || relatedMemoryId || raw.evidence !== 'insufficient') throw Error('Learning rejection was invalid. No Energy or XP changed.');
    return Object.freeze({ ...raw });
  }
  if (!concept || !category || !topic) throw Error('Learning analysis lacked reusable labels. No Energy or XP changed.');
  if (raw.relationship === 'new' && (relatedMemoryId || !['none','insufficient'].includes(raw.evidence) || raw.confidence < .55)) throw Error('New-memory analysis was invalid. No Energy or XP changed.');
  if (raw.relationship === 'related' && (!relatedMemoryId || !['lexical_overlap','semantic_match'].includes(raw.evidence) || raw.confidence < .65)) throw Error('Related-memory analysis was invalid. No Energy or XP changed.');
  if (raw.relationship === 'repeated' && (!relatedMemoryId || !['exact_match','semantic_match'].includes(raw.evidence) || raw.confidence < .88)) throw Error('Duplicate analysis was invalid. No Energy or XP changed.');
  return Object.freeze({ meaningful:true, relationship:raw.relationship, concept, category, categoryId, topic, relatedMemoryId, confidence:raw.confidence, evidence:raw.evidence });
}

export function serviceLearningAnalysis(text, mind, assessment) {
  const context=learningContext(text,mind),valid=validateServiceAssessment(assessment,context);
  if(valid.version===2||valid.version===3)return {decision:valid};
  if(!valid.meaningful||valid.relationship==='reject')throw Error('The learning service could not approve this input. No Energy or XP changed.');
  const relationship={new:'NEW_MEMORY',related:'RELATED_MEMORY',repeated:'SAME_MEMORY'}[valid.relationship];
  const operation={new:'CREATE_NEW',related:'LINK_TO_EXISTING',repeated:'REINFORCE_EXISTING'}[valid.relationship];
  return {decision:validateAssessment({version:2,relationship,operation,responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:valid.concept,category:valid.category,categoryId:valid.categoryId,topic:valid.topic,relatedMemoryId:valid.relatedMemoryId,confidence:valid.confidence},context)};
}
