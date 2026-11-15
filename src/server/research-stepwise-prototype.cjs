'use strict';
// Internal prototype only. Not routed from the production endpoint: its browser
// receipt currently reserves one Responses inference, not two. The host owns
// durable load/save and authorization; never accept this ledger from a client.
const information=require('./research-information.cjs');
const checkpoints=require('./research-checkpoint.cjs');
const {fail}=require('./research-http.cjs');
const enabled=()=>process.env.MINDLING_STEPWISE_RESEARCH==='prototype';

async function runStep({load,save,context,originalId,apiKey,model,signal,authorize,needSecond=false}){
  if(!enabled())throw fail('INVALID_REQUEST','STEPWISE_DISABLED');
  if(typeof load!=='function'||typeof save!=='function'||typeof authorize!=='function')throw fail('INVALID_REQUEST','DURABLE_HOST_REQUIRED');
  const contract=await import('../autonomous/research-contract.js');
  contract.validateRetrievalContext(context);
  // Host must serialize calls per task and reject stale writes, as the existing
  // task/run storage does. A saved reservation is never silently retried.
  const state=await load();
  if(!state||!Number.isInteger(state.modelCalls)||state.modelCalls<1||state.modelCalls>4||!Number.isInteger(state.reservedTools)||state.reservedTools<0||state.reservedTools>2||!Number.isInteger(state.completedSteps)||state.completedSteps<0||state.completedSteps>2)throw fail('INVALID_REQUEST','LEDGER_INVALID');
  if(['RESERVED','UNKNOWN','BLOCKED'].includes(state.status))return {state,blocked:true};
  let previous=null;
  if(state.checkpoint){previous=await checkpoints.verify(state.checkpoint,apiKey);if(previous.originalId!==originalId||JSON.stringify(previous.request)!==JSON.stringify(context.request)||JSON.stringify(previous.hypotheses||[])!==JSON.stringify(context.hypotheses||[]))throw fail('INVALID_REQUEST','CHECKPOINT_CONTEXT_MISMATCH');}
  // A second slot is not a reason to dispatch: the host must supply an explicit
  // evidence-gap decision. There is no automatic loop or evaluation here.
  if(state.completedSteps&&(!needSecond||state.completedSteps>=2))return {state,blocked:false};
  if(state.reservedTools>=2||state.modelCalls>=3)throw fail('BUDGET_EXHAUSTED','EVALUATION_SLOT_REQUIRED');
  if(!await authorize())throw fail('INVALID_REQUEST','AUTHORIZATION_REQUIRED');
  const reserved={...state,status:'RESERVED',modelCalls:state.modelCalls+1,reservedTools:state.reservedTools+1};
  await save(reserved); // Persist before any potentially billable request.
  const trace={};let acquired;
  try{acquired=await information.search({...context,remainingCalls:1},apiKey,model,signal,trace);}
  catch(error){
    const stopped={...reserved,status:trace.outcomeUnknown?'UNKNOWN':'BLOCKED',failure:error.code||'REQUEST_INTERRUPTED',accounting:trace.toolAccounting||null};
    await save(stopped);return {state:stopped,blocked:true};
  }
  // Existing strict extraction/accounting has already rejected unfinished tools.
  contract.validateAcquisition(acquired);
  const sources=[...(previous?.evidence.sources||[])];
  for(const source of acquired.sources){
    const existing=sources.find(s=>s.id===source.id);
    const observation={responseId:acquired.responseId,observedAt:source.observedAt,title:source.title};
    if(existing)existing.observations=[...(existing.observations||[]),observation];
    else sources.push({...source,responseId:acquired.responseId,observations:[observation]});
  }
  // Never rewrite quotations or silently discard extra source provenance to fit.
  if(sources.length>3)throw fail('RESPONSE_PARSE_ERROR','COMBINED_SOURCE_LIMIT');
  const evidence={...acquired,sources,requests:(state.confirmedTools||0)+acquired.requests,bytes:(state.bytes||0)+acquired.bytes};
  contract.validateAcquisition(evidence);
  let checkpoint=state.checkpoint;
  if(sources.length){checkpoint=checkpoints.seal(evidence,context.request,originalId,apiKey,context.plan||[],context.hypotheses);contract.validateResearchCheckpoint(checkpoint);}
  const completed={...reserved,status:'ACCOUNTED',completedSteps:state.completedSteps+1,checkpoint:checkpoint||null,confirmedTools:evidence.requests,bytes:evidence.bytes};
  await save(completed);
  return {state:completed,blocked:false};
}
const active=new Set();
async function step(options){
  if(active.has(options.originalId))throw fail('EVALUATION_IN_PROGRESS','STEP_IN_PROGRESS');
  active.add(options.originalId);
  try{return await runStep(options);}finally{active.delete(options.originalId);}
}
module.exports={enabled,step};
