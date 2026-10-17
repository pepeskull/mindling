import { normalize } from './text.js';
import { MODEL_KEY, CLASSIFIER_KEY, ANALYSIS_VERSION, INFORMATION_TYPES, EMBEDDING } from './model-config.js';
export const memoryBasis=mind=>JSON.stringify([mind.id,mind.memories.map(m=>[m.id,m.content,m.supersededBy||null])]);
export function validateClassification(value,text){
  if(!value||!INFORMATION_TYPES.includes(value.type)||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1)throw Error('LOCAL_CLASSIFICATION_INVALID');
  const label=key=>{if(typeof value[key]!=='string')throw Error('LOCAL_LABEL_INVALID');const v=value[key].normalize('NFC').replace(/\s+/gu,' ').trim();if(v.length<3||v.length>100||/[<>\p{Cc}\p{Cf}]/u.test(v))throw Error('LOCAL_LABEL_INVALID');return v;};
  if(typeof value.evidence!=='string'||!value.evidence.trim()||!text.includes(value.evidence))throw Error('LOCAL_EVIDENCE_INVALID');
  return {type:value.confidence<.65?'UNCERTAIN':value.type,domain:value.confidence<.65?'Unclassified information':label('domain'),topic:value.confidence<.65?'Uncertain topic':label('topic'),modelEstimate:value.confidence,evidence:value.evidence,verification:'unverified-player-input'};
}
export function validEmbedding(vector){
  if(!Array.isArray(vector)||vector.length!==EMBEDDING.dimensions||!vector.every(Number.isFinite))return false;
  const norm=vector.reduce((sum,value)=>sum+value*value,0);return Number.isFinite(norm)&&norm>0;
}
export function cosine(a,b){if(!validEmbedding(a)||!validEmbedding(b))return -1;let dot=0,x=0,y=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}return dot/Math.sqrt(x*y);}
export function indexedEntry(mind,memory){const entries=mind.intelligence?.entries,entry=entries&&Object.hasOwn(entries,memory.id)?entries[memory.id]:null;return entry?.version===ANALYSIS_VERSION&&entry.provenance?.classifier===CLASSIFIER_KEY&&entry.model===MODEL_KEY&&entry.text===memory.content&&validEmbedding(entry.embedding)?entry:null;}
export function semanticCandidates(mind,embedding){return mind.memories.filter(m=>!m.supersededBy).flatMap(memory=>{const entry=indexedEntry(mind,memory);return entry?[{memory,entry,similarity:cosine(embedding,entry.embedding)}]:[];}).filter(item=>item.similarity>=.55).sort((a,b)=>b.similarity-a.similarity).slice(0,5);}
export function validateAnalysis(analysis,text,mind,{migration=false}={}){
  if(analysis?.mode!=='ai'||analysis.classifier!==CLASSIFIER_KEY||analysis.version!==ANALYSIS_VERSION||analysis.model!==MODEL_KEY||analysis.text!==text||analysis.basis!==memoryBasis(mind)||!validEmbedding(analysis.embedding))throw Error('Local analysis is stale or invalid. Submit again; no Energy or XP changed.');
  validateClassification(analysis.classification,text);
  // Similarity is only a candidate signal. Never merge memories or grant duplicate XP
  // based on a semantic guess; ambiguous near-matches require a clearer submission.
  if(!migration&&semanticCandidates(mind,analysis.embedding).some(item=>item.similarity>=.86&&normalize(item.memory.content)!==normalize(text)))throw Error('This may repeat a stored memory. Clarify the distinct information; no Energy or XP changed.');
}
export function indexMemory(mind,memory,analysis){
  const classification=validateClassification(analysis.classification,memory.content);
  mind.intelligence||={version:ANALYSIS_VERSION,entries:{}};
  if(mind.intelligence.version!==ANALYSIS_VERSION)throw Error('Unsupported intelligence index; original memories preserved');
  const domainId=`domain:${normalize(classification.domain)}`,topicId=`${domainId}/topic:${normalize(classification.topic)}`;
  const relations=semanticCandidates(mind,analysis.embedding).filter(item=>item.memory.id!==memory.id).flatMap(item=>{
    const same=normalize(item.entry.topic)===normalize(classification.topic)&&normalize(item.entry.domain)===normalize(classification.domain);
    const goal=['GOAL','AMBITION'].includes(classification.type)||['GOAL','AMBITION'].includes(item.entry.type);
    // Strong factual links need separately validated evidence. The current candidate
    // integration deliberately creates only descriptive, non-factual associations.
    return [{target:item.memory.id,type:same?(goal?'GOAL_RELATED_TO':'SAME_TOPIC'):'RELATED_TOPIC',evidence:{method:'embedding-candidate-and-topic-labels',similarity:item.similarity,sourceQuote:classification.evidence,targetQuote:item.entry.evidence},verified:false}];
  });
  Object.defineProperty(mind.intelligence.entries,memory.id,{enumerable:true,configurable:true,writable:true,value:{...classification,version:ANALYSIS_VERSION,model:MODEL_KEY,text:memory.content,embedding:[...analysis.embedding],domainId,topicId,relations,provenance:{source:'player',method:'browser-local-models',classifier:analysis.classifier}}});
}
export function migrateIndex(state,items){
  const next=structuredClone(state);
  if(!next.mind||next.mind.life.lifeState!=='ALIVE'||next.tombstones.some(t=>t.id===next.mind.id))throw Error('No living Mindling');
  for(const item of items){validateAnalysis(item.analysis,item.analysis.text,next.mind,{migration:true});const memory=next.mind.memories.find(m=>m.id===item.id&&m.content===item.analysis.text);if(!memory)throw Error('Memory changed; classification was not saved');if(!indexedEntry(next.mind,memory))indexMemory(next.mind,memory,item.analysis);}
  return next;
}
