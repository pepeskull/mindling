import {LIMITS,digest} from '../autonomous/tasks.js';
import {semanticCandidates,validateSemanticResult,persistSemantic} from './model-contract.js';
const active=new WeakSet();
// Only public source-backed research memories, under the existing research grant
// and remaining four-inference task budget. No new polling or paid retries.
export async function runSemantic(engine,task){
 if(active.has(engine)||task.status!=='COMPLETED'||!task.knowledgeIds?.length)return;
 active.add(engine);let fingerprint=null,controller=null;
 try{
  const prefs=await engine.loadPermissions(true),identity=engine.app.state.mind.id;if(!prefs.enabled)return;
  engine.assertLive(identity);
  const context=semanticCandidates(engine.app.state.mind,task.knowledgeIds);if(!context.pairs.length)return;
  fingerprint=await digest(JSON.stringify(context));
  if((engine.app.state.mind.learningTasks||[]).some(t=>t.semanticAnalysis?.fingerprint===fingerprint))return;
  const grant=engine.grant(prefs);let reserved=false;
  await engine.patch(task.id,null,(current)=>{
   if(current.semanticAnalysis?.fingerprint===fingerprint)return;
   if((current.modelCalls||0)>=LIMITS.inferenceCalls){current.semanticDeferral='BUDGET';return;}
   current.modelCalls=(current.modelCalls||0)+1;
   current.semanticAnalysis={version:1,fingerprint,status:'RESERVED',submitted:context.pairs.length};reserved=true;
  },{researchGrant:grant});
  if(!reserved)return;
  engine.assertLive(identity);const fresh=await engine.loadPermissions(true);if(!fresh.enabled||fresh.revision!==prefs.revision)throw Error('Permission changed');
  controller=new AbortController();const abort=()=>controller.abort();engine.abort.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,45000);
  let response,result;try{
   response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:fingerprint,mode:'semantic',context})});
   const text=await response.text();if(text.length>100000||!response.ok)throw Error('Semantic response rejected');result=JSON.parse(text);
  }finally{clearTimeout(timer);engine.abort.signal.removeEventListener('abort',abort);}
  if(result.service!=='mindling-reasoning-service'||result.id!==fingerprint)throw Error('Invalid semantic receipt');
  const verdict=validateSemanticResult(result.result,context);engine.assertLive(identity);
  await engine.patch(task.id,null,(current,next)=>{
   if(next.mind.id!==identity||current.semanticAnalysis?.fingerprint!==fingerprint||current.semanticAnalysis.status!=='RESERVED')throw Error('Stale analysis');
   persistSemantic(next.mind,verdict.accepted);
   Object.assign(current.semanticAnalysis,{status:'COMPLETED',accepted:verdict.accepted.length,rejected:verdict.rejected,abstained:verdict.abstained});
  },{researchGrant:grant});
 }catch{
  if(fingerprint)await engine.patch(task.id,null,current=>{if(current.semanticAnalysis?.fingerprint===fingerprint&&current.semanticAnalysis.status==='RESERVED')current.semanticAnalysis.status='FAILED_OR_INTERRUPTED';}).catch(()=>{});
 }finally{active.delete(engine);}
}
