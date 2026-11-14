// Hypotheses are model proposals, never source evidence or canonical knowledge.
const string=maxLength=>({type:'string',minLength:1,maxLength});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,n)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=n&&!/[\p{Cc}\p{Cf}]/u.test(v);
const fail=()=>{throw Object.assign(Error('Unverified hypothesis contract is invalid.'),{code:'RESPONSE_PARSE_ERROR',detail:'HYPOTHESIS_CONTRACT_INVALID'});};
const types=['broader-than','narrower-than','related-to','part-of','instance-of','equivalent-label'];
export const hypothesesSchema={type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['id','claim','status','relationship'],properties:{
 id:{type:'string',enum:['h1','h2','h3']},claim:string(240),status:{type:'string',enum:['unverified']},
 relationship:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['from','to','type'],properties:{from:string(80),to:string(80),type:{type:'string',enum:types}}}]}
}}};
export function validateHypotheses(items){
 if(!Array.isArray(items)||items.length>3)fail();const ids=new Set();
 for(const h of items){
  if(!exact(h,['id','claim','status','relationship'])||!['h1','h2','h3'].includes(h.id)||ids.has(h.id)||!text(h.claim,240)||h.status!=='unverified')fail();ids.add(h.id);
  if(h.relationship!==null&&(!exact(h.relationship,['from','to','type'])||!text(h.relationship.from,80)||!text(h.relationship.to,80)||!types.includes(h.relationship.type)))fail();
 }return items;
}
export const HYPOTHESIS_INSTRUCTIONS='In this same planning call, propose up to three concise atomic factual hypotheses from model knowledge to investigate, not facts already verified. Each has id h1/h2/h3, claim (1–240 characters), status unverified, and relationship null or one tentative conceptual relationship (from/to labels up to 80 characters; supported vocabulary only). Never invent a source, quotation or citation. Propose falsifiable claims, not guesses at current rankings or dates. Use an empty hypotheses list when clarification or insufficient model knowledge prevents useful proposals. Search queries must neutrally verify or challenge the hypotheses, not assume they are true. No extra inference call is available for hypothesis generation.';
export function reviewSchema(hypotheses){return {type:'array',minItems:hypotheses.length,maxItems:hypotheses.length,items:{type:'object',additionalProperties:false,required:['id','status','claimIndex','reason'],properties:{id:{type:'string',enum:hypotheses.map(h=>h.id)},status:{type:'string',enum:['supported','contradicted','insufficient']},claimIndex:{type:['integer','null'],minimum:0,maximum:2},reason:string(240)}}};}
export function validateHypothesisReview(review,claims,ids=null){
 if(!Array.isArray(review)||review.length>3||ids&&review.length!==ids.length)fail();const seen=new Set();
 for(const r of review){
  if(!exact(r,['id','status','claimIndex','reason'])||!['h1','h2','h3'].includes(r.id)||seen.has(r.id)||ids&&!ids.includes(r.id)||!['supported','contradicted','insufficient','rejected'].includes(r.status)||!text(r.reason,240))fail();seen.add(r.id);
  if(r.status==='supported'){if(!Number.isSafeInteger(r.claimIndex)||!claims[r.claimIndex])fail();}
  else if(r.claimIndex!==null)fail();
 }return review;
}
export const HYPOTHESIS_EVALUATION_INSTRUCTIONS='hypotheses are UNVERIFIED model suggestions, never evidence. Assess each independently against retained sources and scope; actively check contradictory evidence. Return one hypothesisReview per supplied ID: supported only if a claim at claimIndex supplies direct source support for the entire hypothesis including qualifications; contradicted or insufficient otherwise with claimIndex null. Keep claimIndex zero-based in your claims array. Every returned claim must support at least one supported hypothesis. Copy claim quotes ONLY from retained source passages, never from hypotheses or existing knowledge. Never mark support merely because the hypothesis sounds plausible. A proposed relationship is not validated by this review and must await canonical semantic processing.';

export function hypothesisStage(task){
 if(task.code==='PLANNING')return 'Understanding';
 if(task.status==='RESEARCHING')return 'Verifying sources';
 if(task.status==='EVALUATING')return 'Evaluating evidence';
 if(task.status==='COMMITTING')return 'Saving memories';
 if(task.status==='COMPLETED'&&task.semanticWork?.state==='DISPATCHED')return 'Organizing knowledge';
 if(task.status==='COMPLETED')return task.semanticWork?.state==='DEFERRED'?'Memories saved · organization pending':'Memories saved';
 return task.hypotheses?.length&&task.code==='QUEUED'?'Hypotheses prepared':null;
}
