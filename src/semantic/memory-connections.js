import { meaningfulKnowledgeLabels } from '../learning/knowledge-labels.js';
import { sourceStatus } from '../memory/content-integrity.js';
import { features } from '../learning/text.js';
import { claimStructure, singular, entityHead, genericEntity } from './claim-structure.js';

export const CONNECTION_LIMITS=Object.freeze({records:1000,candidates:12,links:4,clauses:8});
function eligible(memory){
  return memory&&typeof memory.id==='string'&&memory.id.trim()&&typeof memory.content==='string'&&memory.content.length<=2000&&
    !memory.supersededBy&&memory.intelligence?.current!==false&&!['historical','preference','goal','intention'].includes(memory.intelligence?.kind||memory.kind)&&
    memory.intelligence?.certainty!=='uncertain'&&sourceStatus(memory)!=='incomplete'&&meaningfulKnowledgeLabels(memory)&&
    (memory.contradictions===undefined||Array.isArray(memory.contradictions)&&!memory.contradictions.some(c=>c?.status!=='resolved'))&&
    (memory.relatedMemoryIds===undefined||Array.isArray(memory.relatedMemoryIds)&&memory.relatedMemoryIds.every(id=>typeof id==='string'))&&
    (memory.semanticAssociations===undefined||Array.isArray(memory.semanticAssociations)&&memory.semanticAssociations.every(e=>e&&typeof e.memoryId==='string'));
}
function describe(memory){
  if(!eligible(memory))return null;
  const parsed=claimStructure(memory),metadata=new Set(features(`${memory.category} ${memory.topic}`).tokens.map(singular));
  const facts=parsed.facts.filter(f=>[...f.subject.split(' '),...f.object.split(' ')].some(w=>metadata.has(w)&&w.length>=4)||parsed.facts.length>=2);
  return facts.length?{memory,facts,contexts:parsed.contexts,strongContexts:parsed.strongContexts}:null;
}
// Structural, claim-grounded rules. Neither common words nor matching metadata
// suffice. A generic association never asserts equivalence, entailment or truth.
function relationship(left,right){
  const candidates=[];
  for(const a of left.facts)for(const b of right.facts){
    if(a.object===b.subject&&['defines','uses'].includes(a.predicate))candidates.push({rule:a.predicate==='defines'?'definition-subject':'dependency-subject',entity:a.object});
    if(b.object===a.subject&&['defines','uses'].includes(b.predicate))candidates.push({rule:b.predicate==='defines'?'definition-subject':'dependency-subject',entity:b.object});
    if(a.predicate==='uses'&&b.predicate==='uses'&&a.object===b.object&&a.subject!==b.subject)candidates.push({rule:'shared-dependency',entity:a.object});
    if(a.subject===b.subject&&a.predicate!==b.predicate&&a.predicate!=='defines'&&b.predicate!=='defines')candidates.push({rule:'complementary-subject',entity:a.subject});
    if(a.predicate==='contains'&&b.owner===a.subject&&(a.object===b.component||a.object.endsWith(' '+b.component)))candidates.push({rule:'part-description',entity:b.component});
    if(b.predicate==='contains'&&a.owner===b.subject&&(b.object===a.component||b.object.endsWith(' '+a.component)))candidates.push({rule:'part-description',entity:a.component});
  }
  const scopes=[...left.contexts].filter(c=>right.contexts.has(c)&&!genericEntity.has(c)&&(left.strongContexts.has(c)||right.strongContexts.has(c)));
  if(scopes.length)for(const a of left.facts)for(const b of right.facts){
    const actor=entityHead(a.subject),otherActor=entityHead(b.subject),object=entityHead(a.object),otherObject=entityHead(b.object);
    if(actor===otherActor&&!genericEntity.has(actor)&&a.predicate!==b.predicate)candidates.push({rule:'scoped-actor-functions',entity:actor,scope:scopes[0]});
    if(a.predicate==='defines'&&a.subject===b.object||b.predicate==='defines'&&b.subject===a.object)candidates.push({rule:'scoped-definition-operation',entity:a.predicate==='defines'?a.subject:b.subject,scope:scopes[0]});
    if(a.object===b.object&&((a.predicate==='uses'&&['give','provide'].includes(b.predicate))||(b.predicate==='uses'&&['give','provide'].includes(a.predicate))))candidates.push({rule:'scoped-provided-dependency',entity:a.object,scope:scopes[0]});
    if(object===otherObject&&!genericEntity.has(object)&&['validate','group','store','record','create','process','submit','uses'].includes(a.predicate)&&['validate','group','store','record','create','process','submit','uses'].includes(b.predicate))candidates.push({rule:'scoped-object-operations',entity:object,scope:scopes[0]});
  }
  return candidates;
}
function indexFor(mind,selected=[]){
  if(!Array.isArray(mind.memories)||mind.memories.length>CONNECTION_LIMITS.records)return {descriptors:new Map(),terms:new Map()};
  const list=(mind.memories||[]).filter(m=>m&&typeof m.id==='string'),counts=new Map();for(const m of list)counts.set(m.id,(counts.get(m.id)||0)+1);
  const ordered=list.filter(m=>counts.get(m.id)===1).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const selectedSet=new Set(selected),bounded=[...ordered.filter(m=>selectedSet.has(m.id)),...ordered.filter(m=>!selectedSet.has(m.id))].slice(0,CONNECTION_LIMITS.records);
  const descriptors=new Map(),terms=new Map();
  for(const memory of bounded){const d=describe(memory);if(!d)continue;descriptors.set(memory.id,d);for(const key of new Set(d.facts.flatMap(f=>[f.subject,f.object,f.owner,...(d.contexts.size?[entityHead(f.subject),entityHead(f.object)]:[])].filter(Boolean)))){if(!terms.has(key))terms.set(key,new Set());terms.get(key).add(memory.id);}}
  return {descriptors,terms};
}
function connect(index,id){
  const left=index.descriptors.get(id);if(!left)return;
  const candidates=new Set();for(const fact of left.facts)for(const key of [fact.subject,fact.object,fact.owner,...(left.contexts.size?[entityHead(fact.subject),entityHead(fact.object)]:[])].filter(Boolean))for(const other of index.terms.get(key)||[])if(other!==id)candidates.add(other);
  const priority=id=>{const other=index.descriptors.get(id).memory;return (other.topic===left.memory.topic?2:0)+(other.category===left.memory.category?1:0);};
  for(const otherId of [...candidates].sort((a,b)=>priority(b)-priority(a)||(a<b?-1:a>b?1:0)).slice(0,CONNECTION_LIMITS.candidates)){
    const right=index.descriptors.get(otherId),a=left.memory,b=right.memory;
    if(a.relatedMemoryIds?.includes(b.id)&&b.relatedMemoryIds?.includes(a.id)&&a.semanticAssociations?.some(e=>e.memoryId===b.id)&&b.semanticAssociations?.some(e=>e.memoryId===a.id))continue;
    const activeDegree=memory=>(memory.semanticAssociations||[]).filter(edge=>index.descriptors.has(edge.memoryId)).length;
    if(activeDegree(a)>=CONNECTION_LIMITS.links||activeDegree(b)>=CONNECTION_LIMITS.links)continue;
    // Single nouns can be homonyms across fields (planet/element Mercury).
    // Try every supported structural basis before leaving a pair unresolved.
    const sameMetadata=a.category.normalize('NFC').toLowerCase()===b.category.normalize('NFC').toLowerCase()&&a.topic.normalize('NFC').toLowerCase()===b.topic.normalize('NFC').toLowerCase();
    const basis=relationship(left,right).find(item=>item.scope||sameMetadata||item.entity.split(' ').filter(w=>!['and','on','in','of','a','the'].includes(w)).length>=2);if(!basis)continue;
    a.relatedMemoryIds=[...new Set([...(a.relatedMemoryIds||[]),b.id])];b.relatedMemoryIds=[...new Set([...(b.relatedMemoryIds||[]),a.id])];
    for(const [self,other]of [[a,b],[b,a]]){
      self.semanticAssociations||=[];
      if(!self.semanticAssociations.some(e=>e.memoryId===other.id))self.semanticAssociations.push({version:1,memoryId:other.id,...basis});
    }
  }
}
export function connectSemanticMemory(mind,memoryId){connect(indexFor(mind,[memoryId]),memoryId);}
export function reconcileSemanticConnections(state){
  if(!state?.mind||!Array.isArray(state.mind.memories))return state;
  const index=indexFor(state.mind),frequencies=new Map();for(const d of index.descriptors.values())frequencies.set(d.memory.topic,(frequencies.get(d.memory.topic)||0)+1);
  // Evaluate close, explicitly labelled contexts before broad bridges consume
  // the bounded degree. Labels prioritize candidates, never justify an edge.
  const ids=[...index.descriptors.keys()].sort((a,b)=>frequencies.get(index.descriptors.get(b).memory.topic)-frequencies.get(index.descriptors.get(a).memory.topic)||(a<b?-1:a>b?1:0));for(const id of ids)connect(index,id);return state;
}
