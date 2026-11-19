import {areaPairPlan,validateAreaPairResult,combineAreaResults,areaFail} from './area-pair-contract.js';
import {SEMANTIC_POLICY} from './scheduling.js';
import {dayKey} from '../autonomous/autonomous-schedule.js';
import {digest} from '../autonomous/tasks.js';
import {validatePermissions} from '../autonomous/research-permissions.js';
import {semanticDiagnostic} from './diagnostics.js';
import {persistAreaRelations} from './area-relations.js';
import {graphData} from '../memory/graph-data.js';
import {mergeProposal,commitHierarchy} from '../memory/knowledge-hierarchy.js';
import {CONNECTION_MESSAGES} from './manual-connection.js';
export const AREA_PAIR_MESSAGES={...CONNECTION_MESSAGES,RELATED:'A supported connection was saved between these areas.',OVERLAPS:'A supported overlap was saved; both areas remain distinct.',CONTAINS:'A supported parent–child relationship was saved. Canonical memories remain unchanged.',UNRELATED:'The supplied evidence does not justify a connection.',INSUFFICIENT_EVIDENCE:'The evidence does not justify a complete area relationship.',INVALID_AREA:'Choose two different knowledge areas.',EVIDENCE_LIMIT:'The complete evidence exceeds the bounded analysis limit. Nothing was omitted and no request was sent.',INCOMPLETE_ANALYSIS:'Analysis is incomplete. Completed steps are retained; no connection has been created.',CONFLICT:'The proposed relationship conflicts with an existing decision or hierarchy. No relationship was changed.',INVALID_EVIDENCE:'The proposed evidence did not pass validation. No connection was saved.',ALREADY_ASSESSED:'This area analysis is already in progress or has an unknown outcome. No repeat request was sent.'};
export async function connectAreas(app,ids,identity,onProgress=()=>{}){
 let fingerprint,stageIndex=-1,dispatched=false,received=false;
 const store=app.db||app.store,live=s=>{app.external?.assertWritable();if(app.disposed||s.mind?.id!==identity||s.mind.life?.lifeState!=='ALIVE')areaFail('IDENTITY_CHANGED');};
 try{
  live(app.state);const plan=areaPairPlan(app.state.mind,ids);
  const graph=graphData(app.state.mind),existing=graph.areaRelations.filter(r=>[r.from,r.to].every(id=>ids.includes(id)));
  if(existing.length){const types=new Set(existing.map(r=>r.type));if(types.size>1)areaFail('CONFLICT');return {code:types.has('related-to')?'RELATED':types.has('overlaps')?'OVERLAPS':['broader-than','narrower-than'].some(t=>types.has(t))?'CONTAINS':'CONFLICT',reason:existing[0].reason};}
  fingerprint=await digest(JSON.stringify({identity,plan}));
  if(app.state.mind.areaPairAttempts?.some(a=>JSON.stringify(a.areas)===JSON.stringify(plan.areas.map(a=>a.id))&&a.steps.some(s=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(s.state))))areaFail('ALREADY_ASSESSED');
  for(const area of plan.areas)for(const memory of area.memories)if(!memory.provenance&&await digest(memory.text)!==memory.quoteHash)areaFail('STALE_EVIDENCE');
  const snapshot=JSON.stringify(plan),fresh=s=>{live(s);if(JSON.stringify(areaPairPlan(s.mind,ids))!==snapshot)areaFail('STALE_EVIDENCE');};
  const completed=()=>app.state.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint);
  if(completed()?.state==='COMPLETED')return {code:completed().outcome,reason:completed().reason};
  for(stageIndex=0;stageIndex<plan.stages.length;stageIndex++){
   dispatched=false;received=false;
   if(completed()?.steps[stageIndex]?.state==='COMPLETED')continue;
   if(completed()?.steps[stageIndex])areaFail('ALREADY_ASSESSED');
   const prefs=validatePermissions(await store.researchPermissions(identity),identity);if(!prefs.enabled)areaFail('PERMISSION_REQUIRED');
   const grant={mindlingId:identity,capability:prefs.capability,revision:prefs.revision},day=dayKey(Date.now()),context=plan.stages[stageIndex],requestId=await digest(JSON.stringify({fingerprint,stageIndex,context}));
   const progress={stage:stageIndex+1,total:plan.stages.length,memories:plan.areas.reduce((n,a)=>n+a.memories.length,0),excluded:plan.areas.reduce((n,a)=>n+a.excluded,0)};
   onProgress(progress);
   await app.change(s=>{
    fresh(s);const m=s.mind,attempts=m.areaPairAttempts||[];let record=attempts.find(a=>a.fingerprint===fingerprint);
    if(attempts.some(a=>a.fingerprint!==fingerprint&&JSON.stringify(a.areas)===JSON.stringify(plan.areas.map(a=>a.id))&&a.steps.some(s=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(s.state))))areaFail('ALREADY_ASSESSED');
    if(record?.steps[stageIndex])areaFail('ALREADY_ASSESSED');if(!record&&attempts.length>=32)areaFail('RECEIPT_LIMIT');
    const ledger=m.semanticLedger?.day===day?m.semanticLedger:{day,reserved:0,completed:0,supplemental:0};
    if(ledger.reserved>=SEMANTIC_POLICY.maxDaily)areaFail('WINDOW_LIMIT');
    if(!prefs.semanticCallsPerDay||(ledger.supplemental||0)>=prefs.semanticCallsPerDay)areaFail('ALLOWANCE_REQUIRED');
    ledger.reserved++;ledger.supplemental=(ledger.supplemental||0)+1;m.semanticLedger=ledger;
    if(!record){record={fingerprint,state:'PARTIAL',areas:plan.areas.map(a=>a.id),steps:[],total:plan.stages.length,createdAt:Date.now()};attempts.push(record);}m.areaPairAttempts=attempts;
    record.steps[stageIndex]={state:'DISPATCHED',requestId,day,progress};return s;
   },{preserveGameplay:true,researchGrant:grant});
   dispatched=true;
   const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,45000);globalThis.window?.addEventListener('pagehide',abort,{once:true});
   let result;try{
    const response=await fetch('/api/mindling/reason',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({id:requestId,mode:'area-pair',context})});
    const text=await response.text();received=true;if(text.length>100000)areaFail('INVALID_RESPONSE');try{result=JSON.parse(text);}catch{areaFail('INVALID_RESPONSE');}
    if(!response.ok)throw Object.assign(Error('API_FAILURE'),{code:'API_FAILURE',diagnostic:semanticDiagnostic(result.error?.diagnostic)});
    if(result.service!=='mindling-reasoning-service'||result.id!==requestId)areaFail('INVALID_RESPONSE');
   }finally{clearTimeout(timer);globalThis.window?.removeEventListener('pagehide',abort);}
   const checked=validateAreaPairResult(result.result,context);
   await app.change(s=>{fresh(s);const step=s.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint)?.steps[stageIndex];if(step?.state!=='DISPATCHED'||step.requestId!==requestId)areaFail('STALE_EVIDENCE');step.state='COMPLETED';step.result=checked;if(s.mind.semanticLedger?.day===day)s.mind.semanticLedger.completed++;return s;},{preserveGameplay:true,researchGrant:grant});
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
  return {code:outcome.decision,reason:outcome.reason};
 }catch(error){
  const code=error.code==='INVALID_SCHEMA'?'INVALID_RESPONSE':error.code||(dispatched?(received?'PERSISTENCE_FAILED':'OUTCOME_UNKNOWN'):'PERSISTENCE_FAILED');
  if(dispatched)await app.change(s=>{live(s);const step=s.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint)?.steps[stageIndex];if(step?.state==='DISPATCHED'){step.state='OUTCOME_UNKNOWN';step.failure=code;if(error.diagnostic)step.diagnostic=error.diagnostic;}return s;},{preserveGameplay:true}).catch(()=>{});
  const record=app.state.mind?.id===identity?app.state.mind.areaPairAttempts?.find(a=>a.fingerprint===fingerprint):null;
  return {code,completed:record?.steps.filter(s=>s.state==='COMPLETED').length||0,total:record?.total||0};
 }
}
