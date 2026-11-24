import { features, sentences, tokenize } from '../learning/text.js';

const kinds=['equivalent','complementary','contradictory','uncertain'];
const confidence=['high','moderate','low'];
const checks=['polarityPreserved','modalityPreserved','scopePreserved','evidenceSufficient'];
const fields={
  memoryId:{type:'string'},existingClaim:{type:'string'},sharedSubject:{type:'string'},
  relation:{type:'string',enum:kinds},confidence:{type:'string',enum:confidence},
  reason:{type:'string'},scopeDifference:{type:['string','null']},
  ...Object.fromEntries(checks.map(key=>[key,{type:'boolean'}]))
};
export const canonicalMatchSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:Object.keys(fields),properties:fields}]};
export const CANONICAL_MATCH_INSTRUCTIONS='For each selected range, return canonicalMatch=null if no current complete existing memory is applicable. Otherwise identify at most one existing memoryId, copy its complete existingClaim exactly, and quote a specific sharedSubject appearing literally in both passages. Compare the full selected range and full existing claim. Use equivalent only for the same full proposition in both directions, with identical subject (including species), quantities, unit, polarity, modality, scope, conditions and time; no specialization, generalization, added fact or omitted qualification. Use complementary for a materially distinct fact about the same specific subject, contradictory for a material conflict, or uncertain when in doubt. Set scopeDifference to null only when there is no material difference; otherwise state it. Assess polarityPreserved, modalityPreserved, scopePreserved and evidenceSufficient explicitly for the proposed decision. A comparison preserves scope by respecting both claims’ qualifications without generalizing or dropping them. Include concise reason and confidence. Existing memories never count as source evidence.';

const bounded=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&!/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\t]/g,''));
export function validCanonicalMatch(match){
  return match&&typeof match==='object'&&!Array.isArray(match)&&Object.keys(match).length===Object.keys(fields).length&&
    bounded(match.memoryId,100)&&bounded(match.existingClaim,500)&&bounded(match.sharedSubject,80)&&
    kinds.includes(match.relation)&&confidence.includes(match.confidence)&&bounded(match.reason,240)&&checks.every(key=>typeof match[key]==='boolean')&&
    (match.scopeDifference===null||bounded(match.scopeDifference,240));
}

function sharedSubject(text,subject){
  const literal=tokenize(text).join(' '),anchor=tokenize(subject).join(' ');
  return anchor.length>=4&&` ${literal} `.includes(` ${anchor} `);
}

export function groundedCanonicalMatch(match,quote,candidates){
  if(!validCanonicalMatch(match)||!sharedSubject(match.existingClaim,match.sharedSubject)||!sharedSubject(quote,match.sharedSubject))return false;
  return !candidates||candidates.some(m=>m.id===match.memoryId&&m.complete&&m.content===match.existingClaim);
}

// These are vetoes on an already grounded model decision, never a similarity
// test that establishes equivalence. Uncertainty leaves both passages intact.
const qualifications=/\b(?:if|unless|when|except|only|some|all|none|most|usually|typically|generally|often|sometimes|may|might|could|must|potentially|approximately|before|after|during|since|until|under|currently|formerly|historically|in the past|in the future|provided that|depending on|var(?:y|ies) with|at least|at most|up to)\b/giu;
const signature=(value,pattern)=>(value.toLowerCase().match(pattern)||[]).sort().join('|');
export function sameCanonicalScope(match,quote){
  const old=match.existingClaim,left=features(old),right=features(quote);
  return match.relation==='equivalent'&&match.confidence==='high'&&match.scopeDifference===null&&checks.every(key=>match[key])&&
    sentences(old).length===sentences(quote).length&&left.negative===right.negative&&
    JSON.stringify(left.quantities)===JSON.stringify(right.quantities)&&
    signature(old,qualifications)===signature(quote,qualifications);
}
