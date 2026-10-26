import { capturedContent, sourceStatus } from '../../memory/content-integrity.js';
import { normalize } from '../../learning/text.js';
import { assignCategory } from '../../semantic/memory-intelligence.js';
import { explicitMutableKind, atomicStatements } from './atomic-memory.js';

// One existing formation/growth step per submission, even when several facts are saved.
export function formationAssociations(mind) {
  const foundation=mind.synapses[mind.memories.length%4];
  foundation.strength=Math.min(1,foundation.strength+.05);foundation.activations++;
  let nodeId=foundation.to,synapseId=foundation.id;
  if(mind.stage>1){
    nodeId=mind.nodes.length<64?`learned-${mind.nodes.length}`:mind.nodes[5+(mind.memories.length%59)].id;
    if(mind.nodes.length<64)mind.nodes.push({id:nodeId,position:[0,0,0],size:.6});
    const edge=mind.synapses.find(edge=>edge.to===nodeId);synapseId=edge?.id||`origin-${nodeId}`;
    if(edge){edge.strength=Math.min(1,edge.strength+.08);edge.activations++;}
    else mind.synapses.push({id:synapseId,from:'origin',to:nodeId,strength:.28,activations:1});
  }
  return {neuronIds:[...new Set(['origin',foundation.to,nodeId])],synapseIds:[...new Set([foundation.id,synapseId])]};
}
export function serviceMetadata(decision,activity,at) {
  return {name:'mindling-learning-service',confidence:decision.confidence,verification:'unverified-player-claim',activity,learnedAt:at};
}
export function recordMemory(mind,{id,text,decision,event,at,associations}) {
  if(id.length>100||mind.memories.some(memory=>memory.id===id))throw Error('Memory identifier conflict. No Energy or XP changed.');
  const memory={id,content:text,contentIntegrity:capturedContent(text),concept:decision.concept,normalized:normalize(text),normalizedConcept:normalize(decision.concept),createdAt:at,strength:.3,activations:1,
    neuronIds:[...associations.neuronIds],synapseIds:[...associations.synapseIds],relatedMemoryIds:[],source:'SERVICE',areaSuggestion:decision.category,
    analysis:serviceMetadata(decision,event.activity,at),submissionId:event.id,
    intelligence:{kind:decision.kind,certainty:decision.certainty,current:decision.kind!=='historical',verification:'unverified-player-claim',operation:decision.operation,relationship:decision.relationship}};
  assignCategory(mind,memory,decision);mind.memories.push(memory);return memory;
}
export function decomposeLegacy(mind,parent,at) {
  if(parent.componentMemoryIds)return parent.componentMemoryIds.map(id=>mind.memories.find(memory=>memory.id===id));
  const parts=atomicStatements(parent.content);
  const ids=parts.map((_,index)=>parent.id.length<=96?`${parent.id}~${index}`:crypto.randomUUID());
  if(ids.some(id=>mind.memories.some(memory=>memory.id===id)))throw Error('Legacy component identifier conflict. No Energy or XP changed.');
  const children=parts.map((content,index)=>{
    const child={...structuredClone(parent),id:ids[index],content,contentIntegrity:sourceStatus(parent)==='captured'?capturedContent(content):undefined,normalized:normalize(content),parentMemoryId:parent.id,valueHistory:[],
      relatedMemoryIds:[...new Set([...(parent.relatedMemoryIds||[]),parent.id,...ids.filter(id=>id!==ids[index])])],
      intelligence:{...parent.intelligence,kind:explicitMutableKind(content)||'claim',certainty:parent.intelligence?.certainty||'asserted',verification:'unverified-player-claim',current:true},
      reinforcementRevision:normalize(content),reinforcementVariants:[]};
    delete child.componentMemoryIds;delete child.supersededBy;delete child.supersededByIds;
    return child;
  });
  parent.relatedMemoryIds=[...new Set([...(parent.relatedMemoryIds||[]),...ids])];
  parent.componentMemoryIds=ids;parent.supersededBy=ids[0];parent.supersededByIds=ids;parent.decomposedAt=at;
  parent.intelligence={...parent.intelligence,kind:parent.intelligence?.kind||parent.kind||'claim',current:false};
  mind.memories.push(...children);return children;
}
export function reinforceMemory(mind,target,text,at) {
  const revision=normalize(target.content),key=normalize(text);
  if(target.reinforcementRevision!==revision){target.reinforcementRevision=revision;target.reinforcementVariants=[];}
  const variants=target.reinforcementVariants||[];
  // At most three distinct reinforcements per saved value, never one per retry or day.
  if(!variants.includes(key)&&variants.length<3){
    target.reinforcementVariants=[...variants,key];target.strength=Math.min(1,(target.strength||0)+.05);
    target.activations=(target.activations||0)+1;target.reinforcementCount=(target.reinforcementCount||0)+1;
    for(const edge of mind.synapses.filter(edge=>target.synapseIds?.includes(edge.id))){edge.strength=Math.min(1,edge.strength+.05);edge.activations++;}
  }
  target.lastReinforcedAt=at;
}
