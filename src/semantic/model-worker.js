import {LIMITS,digest,tasksFor} from '../autonomous/tasks.js';
import {VERSION,semanticCandidates,validateSemanticResult,persistSemantic} from './model-contract.js';
const active=new WeakSet(),queued=new WeakMap();
const error=code=>Object.assign(Error(code),{code});
// Bounded lifecycle queue, never polling. Acquisition retains priority and its
// full existing allowance; semantics may reserve only genuinely remaining calls.
export async function runSemantic(engine,task){
 if(task.status!=='COMPLETED'||!task.knowledgeIds?.length)return;
 if(active.has(engine)){let queue=queued.get(engine);if(!queue)queued.set(engine,queue=new Set());if(queue.size<LIMITS.tasks)queue.add(task.id);return;}
 active.add(engine);let fingerprint=null,identity=null;
 try{
  const prefs=await engine.loadPermissions(true);identity=engine.app.state.mind.id;if(!prefs.enabled)return;
  engine.assertLive(identity);
  const context=semanticCandidates(engine.app.state.mind,task.knowledgeIds);if(!context.pairs.length)return;
  for(const pair of context.pairs)for(const memory of [pair.a,pair.b])if(await digest(memory.text)!==memory.quoteHash)throw error('STALE_EVIDENCE');
  fingerprint=await digest(JSON.stringify(context));
  if((engine.app.state.mind.learningTasks||[]).some(t=>t.semanticAnalysis?.fingerprint===fingerprint))return;
  const grant=engine.grant(prefs);let reserved=false;
  await engine.patch(task.id,null,(current)=>{
   if(current.status!=='COMPLETED'||current.semanticAnalysis?.fingerprint===fingerprint)return;
   if((current.modelCalls||0)>=LIMITS.inferenceCalls){current.semanticDeferral='BUDGET_DEFERRED';return;}
   current.modelCalls=(current.modelCalls||0)+1;delete current.semanticDeferral;
   current.semanticAnalysis={version:VERSION,fingerprint,status:'RESERVED',submitted:context.pairs.length};reserved=true;
  },{researchGrant:grant});
  if(!reserved)return;
  engine.assertLive(identity);const fresh=await engine.loadPermissions(true);if(!fresh.enabled||fresh.revision!==prefs.revision)throw error('AUTHORIZATION_CHANGED');
  const controller=new AbortController(),abort=()=>controller.abort(),hidden=()=>{if(globalThis.document?.hidden)abort();};
  engine.abort.signal.addEventListener('abort',abort,{once:true});globalThis.document?.addEventListener('visibilitychange',hidden);const timer=setTimeout(abort,45000);
  let result;try{
   if(engine.abort.signal.aborted)throw error('REQUEST_INTERRUPTED');
   const response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:fingerprint,mode:'semantic',context})});
   const text=await response.text();if(text.length>100000)throw error('INVALID_SCHEMA');
   if(!response.ok){let code;try{code=JSON.parse(text)?.error?.code;}catch{}throw error(['INVALID_SCHEMA','MODEL_UNAVAILABLE','REQUEST_INTERRUPTED'].includes(code)?code:response.status===503?'MODEL_UNAVAILABLE':'API_FAILURE');}
   try{result=JSON.parse(text);}catch{throw error('INVALID_SCHEMA');}
  }catch(failure){if(failure.name==='AbortError')throw error('REQUEST_INTERRUPTED');throw failure;}finally{clearTimeout(timer);engine.abort.signal.removeEventListener('abort',abort);globalThis.document?.removeEventListener('visibilitychange',hidden);}
  if(!result||typeof result!=='object')throw error('INVALID_SCHEMA');
  if(result.service!=='mindling-reasoning-service'||result.id!==fingerprint)throw error('STALE_EVIDENCE');
  const verdict=validateSemanticResult(result.result,context);engine.assertLive(identity);
  await engine.patch(task.id,null,(current,next)=>{
   if(next.mind.id!==identity||current.semanticAnalysis?.fingerprint!==fingerprint||current.semanticAnalysis.status!=='RESERVED')throw error('STALE_EVIDENCE');
   const outcomes=persistSemantic(next.mind,verdict.accepted),persisted=outcomes.filter(o=>o.code==='RELATIONSHIP_PERSISTED').length;
   Object.assign(current.semanticAnalysis,{status:'COMPLETED',proposed:result.result.relationships.length,accepted:verdict.accepted.length,persisted,rejected:verdict.rejected+outcomes.length-persisted,abstained:verdict.abstained,rejections:[...verdict.rejections,...outcomes.filter(o=>o.code!=='RELATIONSHIP_PERSISTED')].slice(0,context.pairs.length)});
  },{researchGrant:grant});
 }catch(failure){
  const codes=['INVALID_SCHEMA','STALE_EVIDENCE','MODEL_UNAVAILABLE','REQUEST_INTERRUPTED','AUTHORIZATION_CHANGED'];const code=codes.includes(failure.code)?failure.code:'API_FAILURE';
  if(fingerprint&&engine.app.state.mind?.id===identity)await engine.patch(task.id,null,current=>{if(current.semanticAnalysis?.fingerprint===fingerprint&&current.semanticAnalysis.status==='RESERVED')Object.assign(current.semanticAnalysis,{status:'FAILED_OR_INTERRUPTED',failure:code});}).catch(()=>{});
 }finally{
  active.delete(engine);const queue=queued.get(engine),id=queue?.values().next().value;if(id){queue.delete(id);const next=tasksFor(engine.app.state.mind).find(t=>t.id===id);if(next&&!engine.disposed&&!engine.app.disposed)void runSemantic(engine,next);}
 }
}
