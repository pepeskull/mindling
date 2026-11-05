import {editableMemoryText,currentMemoryVersion} from '../learning/correction-content.js';
import {semanticText} from './semantic-text.js';
import {sourceStatus} from '../memory/content-integrity.js';
import {sentences} from '../learning/text.js';
import {CONNECTION_LIMITS} from './memory-connections.js';
export const VERSION=2;
export const SEMANTIC_BATCH_PAIRS=2;
export const RELATIONS=Object.freeze({
 'application-of':{direction:'a-to-b',meaning:'A describes a use of the concept or technology described by B.'},
 'part-of':{direction:'a-to-b',meaning:'A describes an explicit component of the system described by B.'},
 'example-of':{direction:'a-to-b',meaning:'A describes an explicit instance of the general concept described by B.'},
 'qualifies':{direction:'a-to-b',meaning:'A states a limitation or condition material to the assertion in B.'},
 'complements':{direction:'symmetric',meaning:'Distinct explicit claims describe complementary aspects of the same identified subject; mere topical similarity is insufficient.'},
 'contrasts-with':{direction:'symmetric',meaning:'Claims explicitly distinguish comparable concepts or mechanisms; this does not assert equivalence.'},
 'process-related':{direction:'symmetric',meaning:'Claims describe explicit roles or steps within the same identified process, with scope preserved.'}
});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const fail=(code,detail)=>{throw Object.assign(Error(code),{code,...(detail?{detail}:{})});};
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const pairKey=(a,b)=>JSON.stringify([a,b].sort());
function storedClaim(m){return m?.source==='SERVICE'&&m.analysis?.name==='mindling-learning-service'&&m.analysis.verification==='unverified-player-claim'&&m.intelligence?.kind==='claim'&&m.intelligence.current===true&&sourceStatus(m)==='captured';}
export function semanticEligibilityIssue(m){
 if(!m||!text(m.id,100))return 'INVALID_MEMORY_ID';
 if(m.supersededBy||m.intelligence?.current===false||['historical','preference','goal','intention'].includes(m.intelligence?.kind||m.kind))return 'NOT_CURRENT_CLAIM';
 if(m.contradictions!==undefined&&(!Array.isArray(m.contradictions)||m.contradictions.some(c=>c?.status!=='resolved')))return 'UNRESOLVED_CONTRADICTION';
 if(sourceStatus(m)==='incomplete')return 'INCOMPLETE_CAPTURE';
 const passage=semanticText(m);if(!passage.text)return passage.reason||'EMPTY_PASSAGE';
 if(storedClaim(m))return null;
 if(m.source!=='AUTONOMOUS')return 'UNSUPPORTED_PROVENANCE';
 if(!m.research||!hash(m.research.sourceHash)||!hash(m.research.quoteHash)||!text(m.research.sourceURL,500)||!Number.isSafeInteger(m.research.observedAt)||m.research.observedAt<0)return 'MISSING_SOURCE_METADATA';
 return null;
}
export function eligibleSemanticMemory(m){return semanticEligibilityIssue(m)===null;}
const snapshot=m=>storedClaim(m)?{id:m.id,text:editableMemoryText(m),sourceHash:null,quoteHash:null,sourceURL:null,observedAt:null,provenance:{kind:'stored-claim',verification:'unverified-player-claim',correctsMemoryId:m.correctsMemoryId||null}}:{id:m.id,text:editableMemoryText(m),sourceHash:m.research.sourceHash,quoteHash:m.research.quoteHash,sourceURL:m.research.sourceURL,observedAt:m.research.observedAt};
export function validateSemanticContext(value){
 if(!exact(value,['version','pairs'])||value.version!==VERSION||!Array.isArray(value.pairs)||value.pairs.length>CONNECTION_LIMITS.links)fail('INVALID_SCHEMA');
 const seen=new Set(),memories=new Map();for(const pair of value.pairs){if(!exact(pair,['a','b']))fail('INVALID_SCHEMA');for(const m of [pair.a,pair.b]){
  const claim=exact(m,['id','text','sourceHash','quoteHash','sourceURL','observedAt','provenance'])&&exact(m.provenance,['kind','verification','correctsMemoryId'])&&m.provenance.kind==='stored-claim'&&m.provenance.verification==='unverified-player-claim'&&(m.provenance.correctsMemoryId===null||text(m.provenance.correctsMemoryId,100))&&m.sourceHash===null&&m.quoteHash===null&&m.sourceURL===null&&m.observedAt===null;
  const research=exact(m,['id','text','sourceHash','quoteHash','sourceURL','observedAt'])&&hash(m.sourceHash)&&hash(m.quoteHash)&&text(m.sourceURL,500)&&Number.isSafeInteger(m.observedAt)&&m.observedAt>=0;
  if(!text(m.id,100)||!text(m.text,2000)||(!claim&&!research))fail('INVALID_SCHEMA');
  if(memories.has(m.id)&&memories.get(m.id)!==JSON.stringify(m))fail('STALE_EVIDENCE');memories.set(m.id,JSON.stringify(m));
 }const key=pairKey(pair.a.id,pair.b.id);if(pair.a.id===pair.b.id||seen.has(key))fail('DUPLICATE_RELATION');seen.add(key);}return value;
}
const string=maxLength=>({type:'string',minLength:1,maxLength});
const spanSchema={type:'object',additionalProperties:false,required:['start','end','quote'],properties:{start:{type:'integer',minimum:0,maximum:2000},end:{type:'integer',minimum:1,maximum:2000},quote:string(2000)}};
const checks=['polarityPreserved','modalityPreserved','scopePreserved','noEquivalence','evidenceSufficient'];
const properties={memoryA:string(100),memoryB:string(100),type:{type:'string',enum:Object.keys(RELATIONS)},direction:{type:'string',enum:['a-to-b','symmetric']},evidenceA:spanSchema,evidenceB:spanSchema,assessment:{type:'object',additionalProperties:false,required:['support','reason','qualifications',...checks],properties:{support:{type:'string',enum:['supported','uncertain','unsupported']},reason:string(480),qualifications:{type:'array',maxItems:3,items:string(240)},...Object.fromEntries(checks.map(k=>[k,{type:'boolean'}]))}}};
export const semanticSchema={type:'object',additionalProperties:false,required:['version','relationships'],properties:{version:{type:'integer',enum:[VERSION]},relationships:{type:'array',maxItems:CONNECTION_LIMITS.links,items:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}}}};
// Sentence-boundary checks guard selective cuts. Semantic sufficiency, including
// cross-sentence qualifications, remains the model's explicitly recorded assessment.
function spanIssue(span,passage){
 if(!exact(span,['start','end','quote'])||!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||span.end>passage.length||!text(span.quote,2000))return 'INVALID_SCHEMA';
 if(passage.slice(span.start,span.end)!==span.quote)return 'EVIDENCE_NOT_FOUND';
 let cursor=0;const starts=new Set(),ends=new Set();for(const sentence of sentences(passage)){const at=passage.indexOf(sentence,cursor);starts.add(at);ends.add(at+sentence.length);cursor=at+sentence.length;}
 return starts.has(span.start)&&ends.has(span.end)?null:'QUALIFICATION_MISMATCH';
}
export function validateSemanticResult(value,context){
 validateSemanticContext(context);if(!exact(value,['version','relationships'])||value.version!==VERSION||!Array.isArray(value.relationships)||value.relationships.length>CONNECTION_LIMITS.links)fail('INVALID_SCHEMA','RESULT_ENVELOPE_INVALID');
 const accepted=[],rejections=[],seen=new Set();
 const reject=(index,code)=>rejections.push({index,code});
 for(const [index,r]of value.relationships.entries()){
  if(!exact(r,Object.keys(properties))||!text(r.memoryA,100)||!text(r.memoryB,100)){reject(index,'INVALID_SCHEMA');continue;}
  const found=context.pairs.find(p=>pairKey(p.a.id,p.b.id)===pairKey(r.memoryA,r.memoryB));if(!found){reject(index,'UNKNOWN_MEMORY');continue;}
  const pair=found.a.id===r.memoryA?found:{a:found.b,b:found.a},key=pairKey(r.memoryA,r.memoryB);
  if(seen.has(key)){reject(index,'DUPLICATE_RELATION');continue;}
  if(!Object.hasOwn(RELATIONS,r.type)){reject(index,'UNSUPPORTED_RELATION');continue;}
  if(r.direction!==RELATIONS[r.type].direction){reject(index,'INVALID_DIRECTION');continue;}
  const issue=spanIssue(r.evidenceA,pair.a.text)||spanIssue(r.evidenceB,pair.b.text);if(issue){reject(index,issue);continue;}
  const a=r.assessment;if(!exact(a,['support','reason','qualifications',...checks])||!['supported','uncertain','unsupported'].includes(a.support)||!text(a.reason,480)||!Array.isArray(a.qualifications)||a.qualifications.length>3||!a.qualifications.every(q=>text(q,240))||checks.some(k=>typeof a[k]!=='boolean')){reject(index,'INVALID_SCHEMA');continue;}
  if(!a.polarityPreserved||!a.noEquivalence){reject(index,'SEMANTIC_CONTRADICTION');continue;}
  if(!a.scopePreserved||!a.modalityPreserved){reject(index,'QUALIFICATION_MISMATCH');continue;}
  if(a.support!=='supported'||!a.evidenceSufficient){reject(index,'INSUFFICIENT_SUPPORT');continue;}
  seen.add(key);accepted.push({...r,version:VERSION,snapshotA:pair.a,snapshotB:pair.b});
 }
 return {accepted,rejected:rejections.length,rejections,abstained:value.relationships.length===0};
}
// Receipts identify the exact evidence version, never inferred semantic truth.
// Bounded by four pairs per attempt and the existing four attempts per task.
export const semanticPairReceipt=pair=>JSON.stringify([VERSION,...[pair.a,pair.b].sort((a,b)=>a.id<b.id?-1:1).map(m=>[m.id,m.sourceHash,m.quoteHash,m.sourceURL,m.observedAt,...(m.provenance?[m.provenance,m.text]:[])])]);
export function semanticCandidateReport(mind,ids,{limit=SEMANTIC_BATCH_PAIRS}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>CONNECTION_LIMITS.links)fail('INVALID_SCHEMA');
 const list=mind.memories||[],counts=new Map();for(const m of list)counts.set(m?.id,(counts.get(m?.id)||0)+1);
 const selected=new Set(ids.map(id=>currentMemoryVersion(list,id)?.id||id)),completed=new Set((mind.learningTasks||[]).flatMap(t=>(t.semanticAttempts||[]).filter(a=>a.state==='COMPLETED').flatMap(a=>a.pairs||[])));
 const unresolved=new Set((mind.learningTasks||[]).flatMap(t=>(t.semanticAttempts||[]).filter(a=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(a.state)).flatMap(a=>a.pairs||[])));
 const ordered=list.filter(m=>counts.get(m?.id)===1&&eligibleSemanticMemory(m)).sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||(a.id<b.id?-1:a.id>b.id?1:0));
 const eligible=ordered.slice(0,CONNECTION_LIMITS.records),snapshots=new Map(eligible.map(m=>[m.id,snapshot(m)])),pairs=[],decisions=[];
 for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
  const [a,b]=[eligible[i],eligible[j]].sort((a,b)=>a.id<b.id?-1:1),pair={a:snapshots.get(a.id),b:snapshots.get(b.id)};
  let reason=!selected.has(a.id)&&!selected.has(b.id)?'OUTSIDE_TASK':a.relatedMemoryIds?.includes(b.id)||b.relatedMemoryIds?.includes(a.id)?'EXISTING_LINK':
   [a,b].some(m=>new Set((m.semanticAssociations||[]).map(e=>e.memoryId)).size>=CONNECTION_LIMITS.links)?'DEGREE_LIMIT':completed.has(semanticPairReceipt(pair))?'ALREADY_ANALYZED':unresolved.has(semanticPairReceipt(pair))?'OUTCOME_UNRESOLVED':null;
  if(!reason){pairs.push(pair);reason=pairs.length<=limit?'SELECTED':'BATCH_LIMIT';}
  decisions.push({ids:[a.id,b.id],reason});
 }
 // Give new-to-existing comparisons precedence over within-task pairs. This
 // is delivery priority only, never evidence that a relation exists. Retain the
 // previous order for legacy four-pair reservations confirmed not dispatched.
 if(limit<=SEMANTIC_BATCH_PAIRS)pairs.sort((p,q)=>Number(selected.has(p.a.id)===selected.has(p.b.id))-Number(selected.has(q.a.id)===selected.has(q.b.id)));
 const chosen=new Set(pairs.slice(0,limit).map(p=>pairKey(p.a.id,p.b.id)));
 for(const decision of decisions)if(['SELECTED','BATCH_LIMIT'].includes(decision.reason))decision.reason=chosen.has(pairKey(...decision.ids))?'SELECTED':'BATCH_LIMIT';
 const current=list.filter(m=>m&&counts.get(m.id)===1&&!m.supersededBy&&m.intelligence?.current!==false&&(m.intelligence?.kind||m.kind)!=='historical');
 return {totalStoredRecordPairs:list.length*(list.length-1)/2,totalPossiblePairs:current.length*(current.length-1)/2,eligibleMemories:eligible.length,recordLimitExcluded:ordered.length-eligible.length,
  excludedMemories:list.filter(m=>counts.get(m?.id)!==1||!eligibleSemanticMemory(m)).map(m=>({id:m?.id,reason:counts.get(m?.id)!==1?'DUPLICATE_ID':semanticEligibilityIssue(m)})),
  generated:pairs.length,decisions,context:{version:VERSION,pairs:pairs.slice(0,limit)}};
}
export function semanticCandidates(mind,ids,options){return semanticCandidateReport(mind,ids,options).context;}
export function persistSemantic(mind,accepted){
 const outcomes=[];for(const r of accepted){
 const a=mind.memories.find(m=>m.id===r.memoryA),b=mind.memories.find(m=>m.id===r.memoryB);
 let code=!a||!b?'UNKNOWN_MEMORY':!eligibleSemanticMemory(a)||!eligibleSemanticMemory(b)?'MEMORY_INELIGIBLE':JSON.stringify(snapshot(a))!==JSON.stringify(r.snapshotA)||JSON.stringify(snapshot(b))!==JSON.stringify(r.snapshotB)?'STALE_EVIDENCE':null;
 if(!code&&(a.relatedMemoryIds?.includes(b.id)||b.relatedMemoryIds?.includes(a.id)))code='DUPLICATE_RELATION';
 if(!code&&[a,b].some(m=>new Set((m.semanticAssociations||[]).map(e=>e.memoryId)).size>=CONNECTION_LIMITS.links))code='DEGREE_LIMIT';
 if(code){outcomes.push({code});continue;}
 for(const [self,other]of [[a,b],[b,a]]){self.relatedMemoryIds=[...new Set([...(self.relatedMemoryIds||[]),other.id])];self.semanticAssociations||=[];self.semanticAssociations.push({version:1,memoryId:other.id,rule:'model-assessed-relation',entity:r.type,analysisVersion:VERSION,type:r.type,direction:r.direction,from:r.memoryA,to:r.memoryB,trust:'model-assessed-not-independently-verified',evidenceCoordinateSpace:'provenance-stripped-canonical-passage',evidenceA:r.evidenceA,evidenceB:r.evidenceB,sourceHashA:r.snapshotA.sourceHash,sourceHashB:r.snapshotB.sourceHash,...(r.snapshotA.provenance?{provenanceA:r.snapshotA.provenance}:{}),...(r.snapshotB.provenance?{provenanceB:r.snapshotB.provenance}:{})});}
 outcomes.push({code:'RELATIONSHIP_PERSISTED'});
 }return outcomes;
}
