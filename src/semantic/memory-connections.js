import { meaningfulKnowledgeLabels } from '../learning/knowledge-labels.js';
import { sourceStatus } from '../memory/content-integrity.js';
import { claimStructure, entityHead, genericEntity } from './claim-structure.js';

export const CONNECTION_LIMITS=Object.freeze({records:1000,candidates:12,links:4,clauses:8});
function eligible(memory){
  return memory&&typeof memory.id==='string'&&memory.id.trim()&&typeof memory.content==='string'&&memory.content.length<=2000&&
    !memory.supersededBy&&memory.intelligence?.current!==false&&!['historical','preference','goal','intention'].includes(memory.intelligence?.kind||memory.kind)&&
    memory.intelligence?.certainty!=='uncertain'&&sourceStatus(memory)!=='incomplete'&&meaningfulKnowledgeLabels(memory)&&
    (memory.contradictions===undefined||Array.isArray(memory.contradictions)&&!memory.contradictions.some(c=>c?.status!=='resolved'))&&
    (memory.relatedMemoryIds===undefined||Array.isArray(memory.relatedMemoryIds)&&memory.relatedMemoryIds.every(id=>typeof id==='string'))&&
    (memory.semanticAssociations===undefined||Array.isArray(memory.semanticAssociations)&&memory.semanticAssociations.every(e=>e&&typeof e.memoryId==='string'));
}
function describe(memory,diagnostics=null){
  if(!eligible(memory)){if(diagnostics)diagnostics.ELIGIBILITY_EXCLUDED=(diagnostics.ELIGIBILITY_EXCLUDED||0)+1;return null;}
  // Classification labels select presentation groups, not proposition eligibility.
  // A broad or independently assigned topic must not erase explicit claim structure.
  const parsed=claimStructure(memory),facts=parsed.facts;
  if(diagnostics){for(const [key,count]of Object.entries(parsed.diagnostics))diagnostics[key]=(diagnostics[key]||0)+count;if(!facts.length)diagnostics.NO_PROPOSITIONS=(diagnostics.NO_PROPOSITIONS||0)+1;}
  return facts.length?{memory,facts,operations:parsed.operations,contexts:parsed.contexts,strongContexts:parsed.strongContexts}:null;
}
// Structural, claim-grounded rules. Neither common words nor matching metadata
// suffice. A generic association never asserts equivalence, entailment or truth.
function relationship(left,right){
  const candidates=[];
  for(const a of left.facts)for(const b of right.facts){
    if(a.object===b.subject&&['defines','uses'].includes(a.predicate))candidates.push({rule:a.predicate==='defines'?'definition-subject':'dependency-subject',entity:a.object});
    if(b.object===a.subject&&['defines','uses'].includes(b.predicate))candidates.push({rule:b.predicate==='defines'?'definition-subject':'dependency-subject',entity:b.object});
    if(a.predicate==='uses'&&b.predicate==='uses'&&a.object===b.object&&a.subject!==b.subject)candidates.push({rule:'shared-dependency',entity:a.object});
    if(a.subject===b.subject&&a.predicate!==b.predicate&&!genericEntity.has(a.subject))candidates.push({rule:'complementary-subject',entity:a.subject});
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
  // Complementary material operations need a second explicit process anchor.
  // The actor/action can be known without resolving its pronominal object.
  // This is a shared-process association, not identity, causation or entailment.
  const process=left.operations.find(a=>!genericEntity.has(a.actor)&&right.operations.some(b=>a.actor===b.actor&&a.predicate===b.predicate&&['validate','record','process','submit'].includes(a.predicate)));
  const material=new Set(['group','store','assemble','pack','purpose-produce','purpose-create','purpose-build']);
  if(process)for(const a of left.facts)for(const b of right.facts){
    if(a.object===b.object&&!genericEntity.has(a.object)&&a.object!==process.actor&&a.predicate!==b.predicate&&material.has(a.predicate)&&material.has(b.predicate))candidates.push({rule:'shared-material-process',entity:a.object,scope:`${process.actor}:${process.predicate}`});
  }
  return candidates;
}
function indexFor(mind,selected=[],diagnostics=null){
  if(!Array.isArray(mind.memories)||mind.memories.length>CONNECTION_LIMITS.records){if(diagnostics)diagnostics.RECORD_LIMIT_OR_INVALID_STORE=1;return {descriptors:new Map(),terms:new Map()};}
  const list=(mind.memories||[]).filter(m=>m&&typeof m.id==='string'),counts=new Map();for(const m of list)counts.set(m.id,(counts.get(m.id)||0)+1);
  const ordered=list.filter(m=>counts.get(m.id)===1).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const selectedSet=new Set(selected),bounded=[...ordered.filter(m=>selectedSet.has(m.id)),...ordered.filter(m=>!selectedSet.has(m.id))].slice(0,CONNECTION_LIMITS.records);
  const descriptors=new Map(),terms=new Map();
  for(const memory of bounded){const d=describe(memory,diagnostics);if(!d)continue;descriptors.set(memory.id,d);for(const key of new Set(d.facts.flatMap(f=>[f.subject,f.object,f.owner,...(d.contexts.size?[entityHead(f.subject),entityHead(f.object)]:[])].filter(Boolean)))){if(!terms.has(key))terms.set(key,new Set());terms.get(key).add(memory.id);}}
  return {descriptors,terms};
}
function connect(index,id,diagnostics=null){
  const note=key=>{if(diagnostics)diagnostics[key]=(diagnostics[key]||0)+1;};
  const left=index.descriptors.get(id);if(!left)return;
  const candidates=new Set();for(const fact of left.facts)for(const key of [fact.subject,fact.object,fact.owner,...(left.contexts.size?[entityHead(fact.subject),entityHead(fact.object)]:[])].filter(Boolean))for(const other of index.terms.get(key)||[])if(other!==id)candidates.add(other);
  if(!candidates.size)note('NO_CANDIDATE');
  const priority=id=>{const other=index.descriptors.get(id).memory;return (other.topic===left.memory.topic?2:0)+(other.category===left.memory.category?1:0);};
  let justified=0;
  for(const otherId of [...candidates].sort((a,b)=>priority(b)-priority(a)||(a<b?-1:a>b?1:0))){
    const right=index.descriptors.get(otherId),a=left.memory,b=right.memory;
    if(a.relatedMemoryIds?.includes(b.id)&&b.relatedMemoryIds?.includes(a.id)&&a.semanticAssociations?.some(e=>e.memoryId===b.id)&&b.semanticAssociations?.some(e=>e.memoryId===a.id))continue;
    const activeDegree=memory=>(memory.semanticAssociations||[]).filter(edge=>index.descriptors.has(edge.memoryId)).length;
    if(activeDegree(a)>=CONNECTION_LIMITS.links){note('DEGREE_LIMIT');break;}
    if(activeDegree(b)>=CONNECTION_LIMITS.links){note('DEGREE_LIMIT');continue;}
    // Single nouns can be homonyms across fields (planet/element Mercury).
    // Try every supported structural basis before leaving a pair unresolved.
    const sameMetadata=a.category.normalize('NFC').toLowerCase()===b.category.normalize('NFC').toLowerCase()&&a.topic.normalize('NFC').toLowerCase()===b.topic.normalize('NFC').toLowerCase();
    const relations=relationship(left,right);
    const basis=relations.find(item=>item.scope||sameMetadata||item.entity.split(' ').filter(w=>!['and','on','in','of','a','the'].includes(w)).length>=2);if(!basis){note(relations.length?'AMBIGUITY_REJECTED':'RELATIONSHIP_UNJUSTIFIED');continue;}
    note('JUSTIFIED_NOT_PERSISTED');
    // Unsupported lexical candidates must not consume the relationship allowance.
    // Search remains bounded by the canonical-record and clause limits.
    if(++justified>CONNECTION_LIMITS.candidates)break;
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

// Local-only inspection on a clone: no writes, inference calls, XP or raw text.
let hydrationStatus='NOT_OBSERVED';
export function semanticHydrationStatus(status){if(['COMMITTED','FAILED'].includes(status))hydrationStatus=status;}
export function semanticDiagnostics(value){
  const mind=value?.mind||value,counts={};
  if(!Array.isArray(mind?.memories))return {hydration:hydrationStatus,counts:{INVALID_STORE:1}};
  const copy={memories:mind.memories.length>CONNECTION_LIMITS.records?mind.memories:structuredClone(mind.memories)};
  const index=indexFor(copy,[],counts);for(const id of index.descriptors.keys())connect(index,id,counts);
  return {hydration:hydrationStatus,counts,note:'Missing justified edges may indicate changed data, limits, or reconciliation not yet committed; they alone do not prove a storage failure.'};
}
