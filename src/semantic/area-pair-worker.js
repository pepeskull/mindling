import {researchEnergyReady} from '../autonomous/energy-readiness.js';
import {areaPairPlan,validateAreaPairResult,combineAreaResults,areaFail} from './area-pair-contract.js';
import {reserveSemanticDispatch,settleSemanticDispatch} from './dispatch-guard.js';
import {digest} from '../autonomous/tasks.js';
import {validatePermissions} from '../autonomous/research-permissions.js';
import {semanticDiagnostic} from './diagnostics.js';
import {persistAreaRelations} from './area-relations.js';
import {graphData} from '../memory/graph-data.js';
import {mergeProposal,commitHierarchy} from '../memory/knowledge-hierarchy.js';
export async function connectAreas(app,ids,identity,onProgress=()=>{},{automatic=false}={}){
 let fingerprint,stageIndex=-1,sent=false,dispatched=false,received=false,knownNotDispatched=false;
 const store=app.db||app.store,live=s=>{app.external?.assertWritable();if(app.disposed||s.mind?.id!==identity||s.mind.life?.lifeState!=='ALIVE')areaFail('IDENTITY_CHANGED');};
 try{
  live(app.state);
  if(globalThis.navigator?.onLine===false||globalThis.document?.hidden)areaFail('ANALYSIS_PAUSED');
  const plan=areaPairPlan(app.state.mind,ids);
  const graph=graphData(app.state.mind),existing=graph.areaRelations.filter(r=>[r.from,r.to].every(id=>ids.includes(id)));
  if(existing.length){const types=new Set(existing.map(r=>r.type));if(types.size>1)areaFail('CONFLICT');return {code:types.has('related-to')?'RELATED':types.has('overlaps')?'OVERLAPS':['broader-than','narrower-than'].some(t=>types.has(t))?'CONTAINS':'CONFLICT',reason:existing[0].reason};}
  fingerprint=await digest(JSON.stringify({identity,plan}));
  if(app.state.mind.areaPairAttempts?.some(a=>JSON.stringify(a.areas)===JSON.stringify(plan.areas.map(a=>a.id))&&a.steps.some(s=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(s.state))))areaFail('ALREADY_ASSESSED');
  for(const area of plan.areas)for(const memory of area.memories)if(!memory.provenance&&await digest(memory.text)!==memory.quoteHash)areaFail('STALE_EVIDENCE');
  const snapshot=JSON.stringify(plan),fresh=s=>{live(s);if(JSON.stringify(areaPairPlan(s.mind,ids))!==snapshot)areaFail('STALE_EVIDENCE');};
  const completed=()=>app.state.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint);
  if(completed()?.state==='COMPLETED')return {code:completed().outcome,reason:completed().reason};
  for(stageIndex=0;stageIndex<plan.stages.length;stageIndex++){
   dispatched=false;received=false;knownNotDispatched=false;
   if(completed()?.steps[stageIndex]?.state==='COMPLETED')continue;
   const previousStep=completed()?.steps[stageIndex];
   if(previousStep?.state==='DEFERRED'&&previousStep.retryAt>Date.now())areaFail('ANALYSIS_PAUSED');
   if(previousStep&&previousStep.state!=='DEFERRED')areaFail('ALREADY_ASSESSED');
   const prefs=validatePermissions(await store.researchPermissions(identity),identity);if(!prefs.enabled)areaFail('PERMISSION_REQUIRED');
   const grant={mindlingId:identity,capability:prefs.capability,revision:prefs.revision},context=plan.stages[stageIndex],requestId=await digest(JSON.stringify({fingerprint,stageIndex,context}));
   const progress={stage:stageIndex+1,total:plan.stages.length,memories:plan.areas.reduce((n,a)=>n+a.memories.length,0),excluded:plan.areas.reduce((n,a)=>n+a.excluded,0)};
   if(globalThis.navigator?.onLine===false||globalThis.document?.hidden)areaFail('ANALYSIS_PAUSED');
   onProgress(progress);
   await app.change(s=>{
    fresh(s);const m=s.mind;if(automatic&&!researchEnergyReady(m))areaFail('ENERGY_LOW');const attempts=m.areaPairAttempts||[];let record=attempts.find(a=>a.fingerprint===fingerprint);
    if(attempts.some(a=>a.fingerprint!==fingerprint&&JSON.stringify(a.areas)===JSON.stringify(plan.areas.map(a=>a.id))&&a.steps.some(s=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(s.state))))areaFail('ALREADY_ASSESSED');
    const previous=record?.steps[stageIndex];
    if(previous&&(previous.state!=='DEFERRED'||previous.retryAt>Date.now()))areaFail('ALREADY_ASSESSED');
    if(!record&&attempts.length>=32)areaFail('RECEIPT_LIMIT');
    if(automatic&&m.nextAreaAssessment>Date.now())areaFail('SEMANTIC_BUSY');
    if(!reserveSemanticDispatch(m,requestId))areaFail('SEMANTIC_BUSY');
    if(!record){record={fingerprint,state:'PARTIAL',areas:plan.areas.map(a=>a.id),steps:[],total:plan.stages.length,createdAt:Date.now()};attempts.push(record);}m.areaPairAttempts=attempts;
    if(automatic)m.nextAreaAssessment=Date.now()+600000;
    record.steps[stageIndex]={state:'DISPATCHED',requestId,progress};return s;
   },{preserveGameplay:true,researchGrant:grant});
   dispatched=true;sent=true;
   const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,45000);globalThis.window?.addEventListener('pagehide',abort,{once:true});
   let result;try{
    const response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:requestId,mode:'area-pair',context})});
    const text=await response.text();received=true;if(text.length>100000)areaFail('INVALID_RESPONSE');try{result=JSON.parse(text);}catch{areaFail('INVALID_RESPONSE');}
    if(!response.ok&&result.service==='mindling-reasoning-service'&&result.id===requestId&&result.inferenceDispatched===false&&[429,503].includes(response.status)){
     knownNotDispatched=true;areaFail('ANALYSIS_PAUSED');
    }
    if(!response.ok)throw Object.assign(Error('API_FAILURE'),{code:'API_FAILURE',diagnostic:semanticDiagnostic(result.error?.diagnostic)});
    if(result.service!=='mindling-reasoning-service'||result.id!==requestId)areaFail('INVALID_RESPONSE');
   }finally{clearTimeout(timer);globalThis.window?.removeEventListener('pagehide',abort);}
   const checked=validateAreaPairResult(result.result,context);
   await app.change(s=>{fresh(s);const step=s.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint)?.steps[stageIndex];if(step?.state!=='DISPATCHED'||step.requestId!==requestId)areaFail('STALE_EVIDENCE');step.state='COMPLETED';step.result=checked;settleSemanticDispatch(s.mind,requestId);return s;},{preserveGameplay:true,researchGrant:grant});
   dispatched=false;
  }
  const prefs=validatePermissions(await store.researchPermissions(identity),identity);if(!prefs.enabled)areaFail('PERMISSION_REQUIRED');
  const grant={mindlingId:identity,capability:prefs.capability,revision:prefs.revision};let outcome;
  await app.change(s=>{
   fresh(s);const record=s.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint);if(!record||record.steps.some(step=>step.state!=='COMPLETED'))areaFail('INCOMPLETE_ANALYSIS');
   outcome=combineAreaResults(record.steps.map(step=>step.result),plan);
   if(['RELATED','OVERLAPS','CONTAINS'].includes(outcome.decision)){
    const g=graphData(s.mind);if(g.areaRelations.some(r=>[r.from,r.to].every(id=>ids.includes(id))))areaFail('CONFLICT');
    const from=plan.areas[outcome.parent==='B'?1:0].id,to=plan.areas[outcome.parent==='B'?0:1].id;
    const relation={version:1,from,to,type:outcome.decision==='CONTAINS'?'broader-than':outcome.decision==='OVERLAPS'?'overlaps':'related-to',direction:outcome.decision==='CONTAINS'?'from-to':'symmetric',reason:outcome.reason,validation:'model-supported-not-independently-verified',areas:plan.areas.map(({id,label})=>({id,label})),evidence:outcome.evidence,analysis:{kind:'area-pair',fingerprint,stages:plan.stages.length,coverage:plan.areas.map(({id,currentIds,memories})=>outcome.decision==='CONTAINS'&&id===from?{id,currentIds:[...new Set(plan.areas.flatMap(a=>a.currentIds))].sort(),memories:[...new Map(plan.areas.flatMap(a=>a.memories).map(m=>[m.id,m])).values()]}:{id,currentIds,memories})}};
    const committedCoverage=relation.analysis.coverage;relation.analysis.coverage=plan.areas.map(({id,currentIds,memories})=>({id,currentIds,memories}));
    if(persistAreaRelations(s.mind,[relation],g.areas)[0]!=='AREA_PERSISTED')areaFail('STALE_EVIDENCE');
    if(outcome.decision==='CONTAINS'){const updated=graphData(s.mind),proposal=mergeProposal(updated,s.mind.knowledgeHierarchy,from,to);if(!proposal.valid||proposal.parentId!==from)areaFail('CONFLICT');s.mind=commitHierarchy(s.mind,updated,proposal);}
    const stored=s.mind.semanticAreaRelations.records.find(r=>r.analysis?.fingerprint===fingerprint);stored.analysis={...stored.analysis,coverage:committedCoverage};
   }
   record.state='COMPLETED';record.outcome=outcome.decision;record.reason=outcome.reason||'No complete supported relationship was established.';return s;
  },{preserveGameplay:true,researchGrant:grant});
  return {code:outcome.decision,reason:outcome.reason,dispatched:sent};
 }catch(error){
  const code=error.code==='INVALID_SCHEMA'?'INVALID_RESPONSE':error.code||(dispatched?(received?'PERSISTENCE_FAILED':'OUTCOME_UNKNOWN'):'PERSISTENCE_FAILED');
  if(dispatched)await app.change(s=>{live(s);const step=s.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint)?.steps[stageIndex];if(step?.state==='DISPATCHED'){step.state=knownNotDispatched?'DEFERRED':'OUTCOME_UNKNOWN';if(knownNotDispatched)step.retryAt=Date.now()+60000;step.failure=code;settleSemanticDispatch(s.mind,step.requestId,true);if(error.diagnostic)step.diagnostic=error.diagnostic;}return s;},{preserveGameplay:true}).catch(()=>{});
  const record=app.state.mind?.id===identity?app.state.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint):null;
  return {code,dispatched:sent,completed:record?.steps.filter(s=>s.state==='COMPLETED').length||0,total:record?.total||0};
 }
}
