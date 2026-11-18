import {VERSION,eligibleSemanticMemory,semanticSnapshot,semanticPairReceipt,validateSemanticContext,validateSemanticResult,persistSemantic} from './model-contract.js';
import {SEMANTIC_POLICY} from './scheduling.js';
import {dayKey} from '../autonomous/autonomous-schedule.js';
import {digest} from '../autonomous/tasks.js';
import {validatePermissions} from '../autonomous/research-permissions.js';
import {semanticDiagnostic} from './diagnostics.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function connectionContext(mind,ids){
 if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])fail('INVALID_MEMORY');
 const memories=[...ids].sort().map(id=>{const matches=mind.memories.filter(m=>m.id===id);if(matches.length!==1||!eligibleSemanticMemory(matches[0]))fail('INVALID_MEMORY');return matches[0];});
 if(memories.some((m,i)=>m.relatedMemoryIds?.includes(memories[1-i].id)))fail('ALREADY_CONNECTED');
 const context={version:VERSION,pairs:[{a:semanticSnapshot(memories[0]),b:semanticSnapshot(memories[1])}]};validateSemanticContext(context);return context;
}
// Explicit drops only. Shares the daily ledger and explicit supplemental allowance;
// never borrows research reservations or fabricates a research task.
export async function connectMemories(app,ids,identity){
 let fingerprint,dispatched=false,received=false;
 const store=app.db||app.store;
 const live=s=>{app.external?.assertWritable();if(app.disposed||s.mind?.id!==identity||s.mind.life?.lifeState!=='ALIVE')fail('IDENTITY_CHANGED');};
 try{
  live(app.state);const prefs=validatePermissions(await store.researchPermissions(identity),identity);
  if(!prefs.enabled)fail('PERMISSION_REQUIRED');
  const context=connectionContext(app.state.mind,ids),pair=semanticPairReceipt(context.pairs[0]);
  for(const memory of Object.values(context.pairs[0]))if(!memory.provenance&&await digest(memory.text)!==memory.quoteHash)fail('STALE_EVIDENCE');
  fingerprint=await digest(JSON.stringify({identity,context}));
  const grant={mindlingId:identity,capability:prefs.capability,revision:prefs.revision},day=dayKey(Date.now());
  await app.change(s=>{
   live(s);if(JSON.stringify(connectionContext(s.mind,ids))!==JSON.stringify(context))fail('STALE_EVIDENCE');
   const m=s.mind,attempts=m.manualSemanticAttempts||[];
   if(attempts.some(a=>a.fingerprint===fingerprint))fail('ALREADY_ASSESSED');
   if((m.learningTasks||[]).some(t=>(t.semanticAttempts||[]).some(a=>a.pairs?.includes(pair))))fail('ALREADY_ASSESSED');
   if(attempts.length>=256)fail('RECEIPT_LIMIT');
   const ledger=m.semanticLedger?.day===day?m.semanticLedger:{day,reserved:0,completed:0,supplemental:0};
   if(ledger.reserved>=SEMANTIC_POLICY.maxDaily)fail('WINDOW_LIMIT');
   if(!prefs.semanticCallsPerDay||(ledger.supplemental||0)>=prefs.semanticCallsPerDay)fail('ALLOWANCE_REQUIRED');
   ledger.reserved++;ledger.supplemental=(ledger.supplemental||0)+1;m.semanticLedger=ledger;
   m.manualSemanticAttempts=[...attempts,{fingerprint,pairs:[pair],state:'DISPATCHED',day,createdAt:Date.now(),trigger:'USER_MEMORY_DROP'}];return s;
  },{preserveGameplay:true,researchGrant:grant});
  dispatched=true;
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,45000);
  globalThis.window?.addEventListener('pagehide',abort,{once:true});
  let result;
  try{
   const response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:fingerprint,mode:'semantic',context})});
   const text=await response.text();received=true;if(text.length>100000)fail('INVALID_RESPONSE');
   try{result=JSON.parse(text);}catch{fail('INVALID_RESPONSE');}
   if(!response.ok)throw Object.assign(Error('API_FAILURE'),{code:'API_FAILURE',diagnostic:semanticDiagnostic(result.error?.diagnostic)});
   if(result.service!=='mindling-reasoning-service'||result.id!==fingerprint)fail('INVALID_RESPONSE');
  }finally{clearTimeout(timer);globalThis.window?.removeEventListener('pagehide',abort);}
  const verdict=validateSemanticResult(result.result,context);let code;
  await app.change(s=>{
   live(s);const record=s.mind.manualSemanticAttempts?.find(a=>a.fingerprint===fingerprint);
   if(record?.state!=='DISPATCHED')fail('STALE_EVIDENCE');
   if(JSON.stringify(connectionContext(s.mind,ids))!==JSON.stringify(context))fail('STALE_EVIDENCE');
   const outcomes=persistSemantic(s.mind,verdict.accepted);
   code=outcomes.some(o=>o.code==='RELATIONSHIP_PERSISTED')?'CONNECTED':verdict.accepted.length?'REJECTED':verdict.rejected?'REJECTED':'INSUFFICIENT_EVIDENCE';
   record.state='COMPLETED';record.outcome=code;record.rejections=verdict.rejections;record.completedAt=Date.now();
   if(s.mind.semanticLedger?.day===day)s.mind.semanticLedger.completed++;return s;
  },{preserveGameplay:true,researchGrant:grant});
  return {code};
 }catch(error){
  const code=error.code==='INVALID_SCHEMA'?'INVALID_RESPONSE':error.code|| (dispatched?(received?'PERSISTENCE_FAILED':'OUTCOME_UNKNOWN'):'PERSISTENCE_FAILED');
  if(dispatched)await app.change(s=>{live(s);const record=s.mind.manualSemanticAttempts?.find(a=>a.fingerprint===fingerprint);if(record?.state==='DISPATCHED'){record.state='OUTCOME_UNKNOWN';record.failure=code;record.received=received;if(error.diagnostic)record.diagnostic=error.diagnostic;}return s;},{preserveGameplay:true}).catch(()=>{});
  return {code};
 }
}
export const CONNECTION_MESSAGES={CONNECTED:'Semantic connection saved.',INSUFFICIENT_EVIDENCE:'Mindling found insufficient evidence for a connection.',REJECTED:'The proposed connection did not pass evidence validation.',ALREADY_CONNECTED:'These memories are already connected.',ALREADY_ASSESSED:'This evidence pair has already been assessed or reserved. No new request was sent.',PERMISSION_REQUIRED:'Enable Research authorization in the footer before connecting memories.',ALLOWANCE_REQUIRED:'An available Extra semantic analysis allowance is required in Settings.',WINDOW_LIMIT:'The daily semantic analysis limit has been reached.',RECEIPT_LIMIT:'The stored assessment limit has been reached.',INVALID_MEMORY:'Select two different current canonical memories.',STALE_EVIDENCE:'The memories changed during assessment. No connection was saved.',IDENTITY_CHANGED:'Mindling changed. No connection was saved.',API_FAILURE:'The semantic service rejected the request. No connection was saved; its reservation is retained.',INVALID_RESPONSE:'The service response could not be validated. Its reservation is retained.',PERSISTENCE_FAILED:'The result could not be saved. Do not repeat the request; its reservation is retained.',OUTCOME_UNKNOWN:'The request outcome is unknown. Its reservation is retained and it will not be retried automatically.'};
