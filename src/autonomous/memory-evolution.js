import { editableMemoryText, correctionComparison } from '../learning/correction-content.js';
import { analyzeNative } from '../learning/native-learning.js';
import { features, overlap } from '../learning/text.js';
import { candidateMetadata } from '../preview/sandbox/memory-retrieval.js';
import { groundedCanonicalMatch, sameCanonicalScope } from './canonical-match.js';
import { eligibleSemanticMemory, semanticSnapshot, semanticPairReceipt, validateSemanticResult, persistSemantic, VERSION } from '../semantic/model-contract.js';
import { sourceStatus } from '../memory/content-integrity.js';

export const currentMemory=m=>m&&!m.supersededBy&&m.intelligence?.current!==false&&m.kind!=='historical'&&m.intelligence?.kind!=='historical';
// Conservative publisher grouping: shared suffixes (e.g. co.uk) undercount
// rather than treating sibling subdomains as independent corroboration.
const host=url=>{try{return new URL(url).hostname.toLowerCase().split('.').slice(-2).join('.');}catch{return '';}};
const same=(a,b)=>correctionComparison(a)===correctionComparison(b);
const key=e=>`${e.sourceURL}|${e.sourceHash}|${e.quoteHash}`;
export function claimEvidence(claim,task){
  const source=task.sourceReferences.find(s=>s.url===claim.sourceURL&&s.hash===claim.sourceHash);
  if(!source)throw Error('Research evidence source changed.');
  const {canonicalMatch,...attribution}=claim;
  return {...attribution,taskId:task.id,title:source.title||null,type:source.type||null,publisher:source.publisher||null,publishedAt:source.publishedAt||null,responseId:source.responseId||null,verification:'tool-cited-unverified-synthesis',limitations:[...(task.limitations||[])]};
}
function originalEvidence(memory){
  const r=memory.research;return r?[{sourceURL:r.sourceURL,sourceHash:r.sourceHash,quoteHash:r.quoteHash,observedAt:r.observedAt}]:[];
}
// A deliberately narrow machine-checkable proposition: the wording, subject,
// unit and punctuation must be identical except ONE integer measurement/count.
// Dates, changing standings, negation and multi-sentence arguments are excluded.
export function quantityFrame(value){
  const text=correctionComparison(value),numbers=[...text.matchAll(/\d+/g)];
  if(/\b(years?|months?|dates?|centur(?:y|ies)|seasons?|standings|today|yesterday|tomorrow|currently|now|born|died|founded|occurred|before|after|during|AD|BC|BCE|CE)\b/iu.test(text))return null;
  if(numbers.length!==1||features(text).negative||/[.!?;:\n]/u.test(text.replace(/[.]$/u,''))||!/^.+\b(?:is|are|has|have|contains|equals|measures)\s+\d+\s+[\p{L}][\p{L} -]*[.]?$/u.test(text))return null;
  const number=numbers[0];if(Number(number[0])>=1900&&Number(number[0])<=2200)return null;
  return text.slice(0,number.index)+'{quantity}'+text.slice(number.index+number[0].length);
}
export function researchRelation(mind,claim){
  const active=(mind.memories||[]).filter(currentMemory),exact=active.find(m=>same(editableMemoryText(m),claim.quote));
  if(exact)return {kind:(exact.research?.validAt??null)===claim.validAt?'support':'conflict',target:exact};
  const frame=quantityFrame(claim.quote),numeric=frame?active.filter(m=>quantityFrame(editableMemoryText(m))===frame):[];
  if(numeric.length===1)return {kind:'conflict',target:numeric[0]};
  const match=claim.canonicalMatch,target=active.find(m=>m.id===match?.memoryId);
  const equivalent=target&&sourceStatus(target)==='captured'&&!['preference','goal','intention'].includes(target.intelligence?.kind||target.kind)&&
    !(target.contradictions||[]).some(item=>item.status!=='resolved')&&editableMemoryText(target)===match.existingClaim&&
    (target.research?.validAt??null)===claim.validAt&&groundedCanonicalMatch(match,claim.quote)&&sameCanonicalScope(match,claim.quote);
  // Existing native checks supply conservative conflict/uncertain handling.
  // Their lexical relationships are never used as authority for replacement.
  const view={...mind,memories:active.map(m=>({...m,content:editableMemoryText(m)}))};
  try{analyzeNative(claim.quote,view);}catch(error){
    if(/conflict/i.test(error.message)){
      const target=active.find(m=>{try{analyzeNative(claim.quote,{...mind,memories:[{...m,content:editableMemoryText(m)}]});return false;}catch(e){return /conflict/i.test(e.message);}});
      return {kind:'conflict',target};
    }
    if(!equivalent||!error.message.startsWith('This may repeat existing knowledge.'))return {kind:'uncertain',target:null};
  }
  return equivalent?{kind:'support',target}:{kind:'new',target:null};
}

export function linkComplementaryResearch(mind,memory,claim,at){
  const match=claim.canonicalMatch;
  if(match?.relation!=='complementary'||match.confidence!=='high'||!match.scopeDifference||!groundedCanonicalMatch(match,claim.quote))return;
  const target=mind.memories.find(m=>m.id===match.memoryId);
  if(target===memory||!eligibleSemanticMemory(memory)||!eligibleSemanticMemory(target)||editableMemoryText(target)!==match.existingClaim)return;
  const pair={a:semanticSnapshot(memory),b:semanticSnapshot(target)},receipt=semanticPairReceipt(pair);
  const attempts=[...(mind.manualSemanticAttempts||[]),...(mind.learningTasks||[]).flatMap(t=>t.semanticAttempts||[])];
  if(attempts.some(a=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(a.state)&&a.pairs?.includes(receipt)))return;
  const fullSpan=text=>({start:0,end:text.length,quote:text});
  const proposed={memoryA:memory.id,memoryB:target.id,type:'complements',direction:'symmetric',
    evidenceA:fullSpan(pair.a.text),evidenceB:fullSpan(pair.b.text),
    assessment:{support:'supported',reason:match.reason,qualifications:[match.scopeDifference],polarityPreserved:match.polarityPreserved,
      modalityPreserved:match.modalityPreserved,scopePreserved:match.scopePreserved,noEquivalence:true,evidenceSufficient:match.evidenceSufficient}};
  const verdict=validateSemanticResult({version:VERSION,relationships:[proposed]},{version:VERSION,pairs:[pair]});
  persistSemantic(mind,verdict.accepted,at,{evolve:false});
}
export function addSupportingEvidence(memory,evidence){
  const prior=memory.researchSupport||[];
  if([...originalEvidence(memory),...prior].some(e=>key(e)===key(evidence)))return 'duplicate';
  if(prior.length>=6)return 'capacity';
  const seenHosts=new Set([...originalEvidence(memory),...prior].map(e=>host(e.sourceURL)));
  memory.researchSupport=[...prior,evidence];
  if(Number.isFinite(evidence.observedAt)&&evidence.observedAt>(Date.parse(memory.lastEvidenceAt)||0)){
    memory.lastEvidenceAt=new Date(evidence.observedAt).toISOString();
  }
  const publisher=host(evidence.sourceURL);
  return publisher&&!seenHosts.has(publisher)&&!evidence.limitations.length?'independent':'retained';
}
export function retainConflict(memory,evidence){
  const prior=memory.contradictions||[];
  if(prior.some(e=>e.evidence&&key(e.evidence)===key(evidence)))return;
  if(prior.length>=6)throw Error('Research conflict evidence capacity reached.');
  memory.contradictions=[...prior,{id:`research:${evidence.taskId}:${evidence.quoteHash}:${evidence.sourceHash}`,claim:evidence.quote,status:'unresolved',evidence}];
}
export function replacementAllowed(mind,target,claim){
  if(!currentMemory(target)||candidateMetadata(target).verification==='verified'||claim.validAt!==null||target.research?.validAt!=null)return false;
  const frame=quantityFrame(claim.quote);
  if(!frame||quantityFrame(editableMemoryText(target))!==frame||target.category!==claim.category||target.topic!==claim.topic)return false;
  // Possible competing quantitative paraphrases block replacement even when
  // the native conflict detector cannot establish their exact relationship.
  // Similarity can veto a mutation; it never authorizes one.
  const incoming=features(claim.quote);
  if((mind.memories||[]).some(m=>{
    if(!currentMemory(m)||m.id===target.id)return false;
    const other=features(editableMemoryText(m));return other.quantities.length&&overlap(other.anchors,incoming.anchors)>=.35;
  }))return false;
  // A third conflicting value, mixed context, or material qualification blocks
  // automatic maintenance. Nothing is silently discarded to reach a quorum.
  const conflicts=(target.contradictions||[]).filter(c=>c.status!=='resolved');
  if(conflicts.some(c=>!c.evidence||!same(c.claim,claim.quote)||c.evidence.validAt!==null||c.evidence.limitations?.length))return false;
  const support=conflicts.map(c=>c.evidence),incumbents=[...originalEvidence(target),...(target.researchSupport||[])];
  const previousHosts=new Set(incumbents.map(e=>host(e.sourceURL)).filter(Boolean));
  const newHosts=new Set(support.map(e=>host(e.sourceURL)).filter(h=>h&&!previousHosts.has(h)));
  const lastObserved=Math.max(0,...incumbents.map(e=>e.observedAt||0));
  return newHosts.size>=2&&newHosts.size>previousHosts.size&&support.every(e=>e.observedAt>lastObserved)&&
    (mind.memories||[]).filter(m=>currentMemory(m)&&quantityFrame(editableMemoryText(m))===frame).length===1;
}
export function assertResearchReplacement(state,authorization){
  const target=state.mind.memories.find(m=>m.id===authorization.supersedes);
  if(!target||!replacementAllowed(state.mind,target,{quote:authorization.quote,validAt:authorization.validAt,...authorization.classification}))throw Error('Research replacement is not sufficiently supported.');
  const task=state.mind.learningTasks.find(t=>t.id===authorization.taskId);
  if(task.timeSensitive||task.limitations?.length)throw Error('Qualified evidence cannot automatically replace knowledge.');
  return target;
}
export function linkResearchSuccessor(mind,original,replacement){
  replacement.correctsMemoryId=original.id;replacement.provenance={source:'research',method:'evidence-supported-version'};
  replacement.researchSupport=(original.contradictions||[]).filter(c=>c.evidence&&same(c.claim,editableMemoryText(replacement))).map(c=>structuredClone(c.evidence));
  replacement.relatedMemoryIds=[...new Set([...(original.relatedMemoryIds||[]),...(replacement.relatedMemoryIds||[]),original.id])].filter(id=>id!==replacement.id);
  for(const memory of mind.memories)if(memory.id!==original.id&&memory.id!==replacement.id&&replacement.relatedMemoryIds.includes(memory.id))memory.relatedMemoryIds=[...new Set([...(memory.relatedMemoryIds||[]),replacement.id])];
  original.supersededBy=replacement.id;original.supersededAt=replacement.createdAt;original.intelligence={...original.intelligence,current:false};
  // Keep every conflicting source record as an audit trail, including resolved ones.
  for(const conflict of original.contradictions||[])if(conflict.evidence&&same(conflict.claim,editableMemoryText(replacement))){conflict.status='resolved';conflict.resolvedBy=replacement.id;}
}
