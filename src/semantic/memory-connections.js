import { editableMemoryText } from '../learning/correction-content.js';
import { meaningfulKnowledgeLabels } from '../learning/knowledge-labels.js';
import { sourceStatus } from '../memory/content-integrity.js';
import { features, sentences } from '../learning/text.js';

export const CONNECTION_LIMITS=Object.freeze({records:1000,candidates:12,links:4,clauses:8});
const generic=new Set(['data','information','knowledge','system','technology','thing','topic','process','object','resource']);
const singular=word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>3&&word.endsWith('s')&&!/(?:ss|us|is)$/u.test(word)?word.slice(0,-1):word;
function phrase(value){
  const text=value.normalize('NFC').toLowerCase().replace(/^(?:a|an|the)\s+/u,'').trim();
  if(!/^[\p{L}][\p{L}\p{M}'’ -]{1,100}$/u.test(text))return null;
  const words=text.split(/\s+/u).map(singular);
  if(words.length>8||words.length===1&&(words[0].length<4||generic.has(words[0])))return null;
  return words.join(' ');
}
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
  const content=editableMemoryText(memory);
  // Without a scope-aware language model, a later negation/qualification can
  // retract an earlier sentence. Do not selectively mine an asserted prefix.
  if(features(content).negative||/\b(?:may|might|could|would|perhaps|fictional|imaginary|named|titled|called|metaphor|if|unless)\b/iu.test(content))return null;
  const metadata=new Set(features(`${memory.category} ${memory.topic}`).tokens.map(singular)),facts=[];
  for(const sentence of sentences(content).slice(0,CONNECTION_LIMITS.clauses)){
    if(sentence.length>500||features(sentence).negative||/["“”`?]/u.test(sentence)||/\b(?:may|might|could|would|perhaps|fictional|imaginary|named|titled|called|metaphor|if|unless)\b/iu.test(sentence))continue;
    const match=sentence.replace(/[.]$/u,'').match(/^(.+?)\s+(is|are|has|have|uses?|depend(?:s)? on|rel(?:y|ies) on|runs? on|operates? on|records?|contain(?:s)?|includes?|supports?|enables?|provides?)\s+(.+)$/iu);
    if(!match)continue;
    const subject=phrase(match[1]),object=phrase(match[3].split(/\s+(?:to|for|whose|which|that|issued|recorded|arranged|located)\b/iu)[0]);
    if(!subject||!object||subject===object)continue;
    const tokens=[...subject.split(' '),...object.split(' ')];if(!tokens.some(word=>metadata.has(word)&&word.length>=4))continue;
    const verb=match[2].toLowerCase(),predicate=/^(is|are)$/u.test(verb)?'defines':/^(has|have|contain|include)/u.test(verb)?'contains':/^(use|depend|rel|run|operate)/u.test(verb)?'uses':verb.replace(/s$/u,'');
    const part=match[1].match(/^(.+?)\s+(?:on|in|of)\s+(.+)$/iu),owner=part?phrase(part[2]):null,component=part?phrase(part[1]):null;
    facts.push({subject,predicate,object,...(owner&&component?{owner,component}:{})});
  }
  return facts.length?{memory,facts}:null;
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
  return candidates;
}
function indexFor(mind,selected=[]){
  if(!Array.isArray(mind.memories)||mind.memories.length>CONNECTION_LIMITS.records)return {descriptors:new Map(),terms:new Map()};
  const list=(mind.memories||[]).filter(m=>m&&typeof m.id==='string'),counts=new Map();for(const m of list)counts.set(m.id,(counts.get(m.id)||0)+1);
  const ordered=list.filter(m=>counts.get(m.id)===1).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const selectedSet=new Set(selected),bounded=[...ordered.filter(m=>selectedSet.has(m.id)),...ordered.filter(m=>!selectedSet.has(m.id))].slice(0,CONNECTION_LIMITS.records);
  const descriptors=new Map(),terms=new Map();
  for(const memory of bounded){const d=describe(memory);if(!d)continue;descriptors.set(memory.id,d);for(const key of new Set(d.facts.flatMap(f=>[f.subject,f.object,f.owner].filter(Boolean)))){if(!terms.has(key))terms.set(key,new Set());terms.get(key).add(memory.id);}}
  return {descriptors,terms};
}
function connect(index,id){
  const left=index.descriptors.get(id);if(!left)return;
  const candidates=new Set();for(const fact of left.facts)for(const key of [fact.subject,fact.object,fact.owner].filter(Boolean))for(const other of index.terms.get(key)||[])if(other!==id)candidates.add(other);
  for(const otherId of [...candidates].sort().slice(0,CONNECTION_LIMITS.candidates)){
    const right=index.descriptors.get(otherId),a=left.memory,b=right.memory;
    if(a.relatedMemoryIds?.includes(b.id)&&b.relatedMemoryIds?.includes(a.id))continue;
    if((a.semanticAssociations?.length||0)>=CONNECTION_LIMITS.links||(b.semanticAssociations?.length||0)>=CONNECTION_LIMITS.links)continue;
    // Single nouns can be homonyms across fields (planet/element Mercury).
    // Try every supported structural basis before leaving a pair unresolved.
    const sameMetadata=a.category.normalize('NFC').toLowerCase()===b.category.normalize('NFC').toLowerCase()&&a.topic.normalize('NFC').toLowerCase()===b.topic.normalize('NFC').toLowerCase();
    const basis=relationship(left,right).find(item=>sameMetadata||item.entity.split(' ').filter(w=>!['and','on','in','of','a','the'].includes(w)).length>=2);if(!basis)continue;
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
  const index=indexFor(state.mind);for(const id of index.descriptors.keys())connect(index,id);return state;
}
