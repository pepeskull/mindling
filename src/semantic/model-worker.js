import {semanticDiagnostic} from './diagnostics.js';
import {reserveSemantic,deferredSemantic} from './scheduling.js';
import {LIMITS,digest,tasksFor} from '../autonomous/tasks.js';
import {VERSION,semanticCandidates,semanticPairReceipt,validateSemanticResult,persistSemantic} from './model-contract.js';
const active=new WeakSet(),queued=new WeakMap();
const error=code=>Object.assign(Error(code),{code});
// Bounded lifecycle queue, never polling. Acquisition retains priority and its
// full existing allowance; supplemental semantic calls require an explicit grant.
export async function runSemantic(engine,task){
 if(task.status!=='COMPLETED'||!task.knowledgeIds?.length||['DISPATCHED','OUTCOME_UNKNOWN'].includes(task.semanticWork?.state))return;
 if(active.has(engine)){let queue=queued.get(engine);if(!queue)queued.set(engine,queue=new Set());if(queue.size<LIMITS.tasks)queue.add(task.id);return;}
 active.add(engine);let fingerprint=null,identity=engine.app.state.mind?.id,dispatched=false,reservedAttempt=false,knownNotDispatched=false;
 const now=()=>Date.now(),owner=engine.session||'offline-test-owner';
 const defer=async reason=>engine.patch(task.id,null,current=>{if(current.semanticWork?.state==='RESERVED'){current.semanticWork.reason=reason;current.semanticWork.updatedAt=now();return;}if(!['DISPATCHED','OUTCOME_UNKNOWN'].includes(current.semanticWork?.state))deferredSemantic(current,{version:VERSION,fingerprint,reason,now:now()});}).catch(()=>{});
 try{
  const prefs=await engine.loadPermissions(true);identity=engine.app.state.mind.id;if(!prefs.enabled){await defer('WAITING_PERMISSION');return;}
  if(globalThis.navigator?.onLine===false){await defer('WAITING_CONNECTIVITY');return;}
  if(engine.disposed||engine.app.disposed||globalThis.document?.hidden)return;
  engine.assertLive(identity);
  const currentMind=engine.app.state.mind;const context=semanticCandidates({...currentMind,learningTasks:currentMind.learningTasks||[task]},task.knowledgeIds);if(!context.pairs.length){await defer('NO_CANDIDATES');return;}
  for(const pair of context.pairs)for(const memory of [pair.a,pair.b])if(!memory.provenance&&await digest(memory.text)!==memory.quoteHash)throw error('STALE_EVIDENCE');
  fingerprint=await digest(JSON.stringify(context));
  const topicFingerprint=await digest(String(task.topic||task.objective||task.id).normalize('NFC').toLowerCase());
  const grant=engine.grant(prefs);let reserved=false;
  await engine.patch(task.id,null,(current,next)=>{
   if(current.status!=='COMPLETED')return;
   const work=current.semanticWork;
   if(work?.state==='RESERVED'&&work.fingerprint===fingerprint&&work.version===VERSION){
    work.owner=owner;work.updatedAt=now();reserved=true;return;
   }
   const outcome=reserveSemantic(current,next.mind,{fingerprint,version:VERSION,submitted:context.pairs.length,allowance:prefs.semanticCallsPerDay||0,now:now(),owner,topicFingerprint});
   reserved=outcome==='RESERVED';
   if(!reserved&&outcome!=='UNCHANGED_OR_RESERVED')deferredSemantic(current,{version:VERSION,fingerprint,reason:outcome,now:now()});
  },{researchGrant:grant});
  if(!reserved)return;reservedAttempt=true;
  engine.assertLive(identity);const fresh=await engine.loadPermissions(true);if(!fresh.enabled||fresh.revision!==prefs.revision)throw error('AUTHORIZATION_CHANGED');
  const controller=new AbortController(),abort=()=>controller.abort(),hidden=()=>{if(globalThis.document?.hidden)abort();};
  engine.abort.signal.addEventListener('abort',abort,{once:true});globalThis.document?.addEventListener('visibilitychange',hidden);const timer=setTimeout(abort,45000);
  let result;try{
   if(engine.abort.signal.aborted)throw error('REQUEST_INTERRUPTED');
   await engine.patch(task.id,null,(current,next)=>{engine.assertLive(identity);if(JSON.stringify(semanticCandidates({...next.mind,learningTasks:next.mind.learningTasks||[current]},current.knowledgeIds))!==JSON.stringify(context))throw error('STALE_EVIDENCE');const w=current.semanticWork;if(w?.state!=='RESERVED'||w.owner!==owner||w.fingerprint!==fingerprint)throw error('STALE_EVIDENCE');w.state='DISPATCHED';w.updatedAt=now();const attempt=current.semanticAttempts?.find(a=>a.fingerprint===fingerprint);if(attempt){attempt.state='DISPATCHED';attempt.pairs=context.pairs.map(semanticPairReceipt);}},{researchGrant:grant});
   dispatched=true;
   const response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:fingerprint,mode:'semantic',context})});
   const text=await response.text();if(text.length>100000)throw error('INVALID_SCHEMA');
   if(!response.ok){let code,diagnostic;try{const failure=JSON.parse(text);code=failure.error?.code;diagnostic=semanticDiagnostic(failure.error?.diagnostic);knownNotDispatched=code==='MODEL_UNAVAILABLE'&&failure.id===fingerprint&&failure.inferenceDispatched===false;}catch{}throw Object.assign(error(['INVALID_SCHEMA','MODEL_UNAVAILABLE','REQUEST_INTERRUPTED'].includes(code)?code:response.status===503?'MODEL_UNAVAILABLE':'API_FAILURE'),{diagnostic});}
   try{result=JSON.parse(text);}catch{throw error('INVALID_SCHEMA');}
  }catch(failure){if(failure.name==='AbortError')throw error('REQUEST_INTERRUPTED');throw failure;}finally{clearTimeout(timer);engine.abort.signal.removeEventListener('abort',abort);globalThis.document?.removeEventListener('visibilitychange',hidden);}
  if(!result||typeof result!=='object')throw error('INVALID_SCHEMA');
  if(result.service!=='mindling-reasoning-service'||result.id!==fingerprint)throw error('STALE_EVIDENCE');
  const verdict=validateSemanticResult(result.result,context);engine.assertLive(identity);
  await engine.patch(task.id,null,(current,next)=>{
   if(next.mind.id!==identity||current.semanticAnalysis?.fingerprint!==fingerprint||current.semanticAnalysis.status!=='RESERVED')throw error('STALE_EVIDENCE');
   const outcomes=persistSemantic(next.mind,verdict.accepted),persisted=outcomes.filter(o=>o.code==='RELATIONSHIP_PERSISTED').length;
   if(current.semanticWork?.fingerprint!==fingerprint||current.semanticWork.state!=='DISPATCHED')throw error('STALE_EVIDENCE');
   current.semanticWork.state='COMPLETED';current.semanticWork.updatedAt=now();
   const attempt=current.semanticAttempts?.find(a=>a.fingerprint===fingerprint);if(attempt){attempt.state='COMPLETED';attempt.result={proposed:result.result.relationships.length,accepted:verdict.accepted.length,persisted,rejections:[...verdict.rejections,...outcomes.filter(o=>o.code!=='RELATIONSHIP_PERSISTED')],pairs:context.pairs.map((pair,index)=>{
    const matches=r=>JSON.stringify([r?.memoryA,r?.memoryB].sort())===JSON.stringify([pair.a.id,pair.b.id].sort());
    const proposed=result.result.relationships.flatMap((r,i)=>matches(r)?[i]:[]),accepted=verdict.accepted.findIndex(matches);
    return {index,outcome:accepted>=0?outcomes[accepted].code:proposed.length?'REJECTED':'MODEL_ABSTAINED',rejections:verdict.rejections.filter(r=>proposed.includes(r.index)).map(r=>r.code)};
   })};}
   if(next.mind.semanticLedger?.day===attempt?.day)next.mind.semanticLedger.completed++;
   Object.assign(current.semanticAnalysis,{status:'COMPLETED',proposed:result.result.relationships.length,accepted:verdict.accepted.length,persisted,rejected:verdict.rejected+outcomes.length-persisted,abstained:verdict.abstained,rejections:[...verdict.rejections,...outcomes.filter(o=>o.code!=='RELATIONSHIP_PERSISTED')].slice(0,context.pairs.length)});
  },{researchGrant:grant});
 }catch(failure){
  const codes=['INVALID_SCHEMA','STALE_EVIDENCE','MODEL_UNAVAILABLE','REQUEST_INTERRUPTED','AUTHORIZATION_CHANGED'];const code=codes.includes(failure.code)?failure.code:'API_FAILURE';
  if(fingerprint&&engine.app.state.mind?.id===identity)await engine.patch(task.id,null,current=>{
   if(current.semanticWork?.fingerprint!==fingerprint||current.semanticWork.owner!==owner)return;
   if(dispatched&&!knownNotDispatched){current.semanticWork.state='OUTCOME_UNKNOWN';current.semanticWork.reason=code;const attempt=current.semanticAttempts?.find(a=>a.fingerprint===fingerprint);if(attempt)attempt.state='OUTCOME_UNKNOWN';Object.assign(current.semanticAnalysis,{status:'FAILED_OR_INTERRUPTED',failure:code,...(failure.diagnostic?{diagnostic:semanticDiagnostic(failure.diagnostic)}:{})});}
   else if(reservedAttempt){current.semanticWork.reason=knownNotDispatched?'WAITING_MODEL':code;current.semanticWork.state='RESERVED';const attempt=current.semanticAttempts?.find(a=>a.fingerprint===fingerprint);if(knownNotDispatched&&attempt)attempt.state='RESERVED';}
  }).catch(()=>{});
 }finally{
  active.delete(engine);const queue=queued.get(engine),id=queue?.values().next().value;if(id){queue.delete(id);const next=tasksFor(engine.app.state.mind).find(t=>t.id===id);if(next&&!engine.disposed&&!engine.app.disposed)void runSemantic(engine,next);}
 }
}
