import {validWebSearchCallCount} from '../autonomous/research-budget.js';
import {validateHypothesisReview} from '../autonomous/research-hypotheses.js';
import {validateAcquisition,validateResearchCheckpoint} from '../autonomous/research-contract.js';
import {validateServiceDiagnostic} from '../autonomous/service-diagnostics.js';
import {clientResearchFailure} from '../autonomous/client-diagnostics.js';

export function validateAcquisitionToolBudget(requests, limit, execution){
  if(!validWebSearchCallCount(limit)||requests>limit)throw Error('Research receipt exceeds the reserved tool budget.');
  const reportedLimits=[execution?.toolAccounting?.requestedLimit,execution?.providerOutput?.requestedMaxToolCalls];
  if(reportedLimits.some(value=>value!==undefined&&value!==limit))throw Error('Research receipt does not match the reserved tool budget.');
}

export function validateResearchReceipt(result,{id,mode,context}){
  const metadata={id,mode,received:true,status:200};
  let execution;
  try{
    if(result?.service!=='mindling-reasoning-service'||result.kind!=='research-acquisition')throw Error();
    validateServiceDiagnostic(result.execution);
    if(result.execution.correlationId!==id||result.execution.operation!==mode||Boolean(result.execution.refinement)!==Boolean(context.refinement))throw Error();
    execution=result.execution;
    validateAcquisition(result.acquisition);
    const a=result.acquisition;
    if(mode==='research-acquire')validateAcquisitionToolBudget(a.requests,context.remainingCalls,execution);
    if(execution.sourceCount!==a.sources.length||execution.completed!==a.requests||execution.outcomeUnknown||!execution.searchCompleted||execution.failed!==0||execution.errorCategory!==null&&!(a.sources.length===0&&execution.errorCategory==='NO_CITABLE_EVIDENCE')||execution.validation&&execution.validation.accepted!==a.evaluation.claims.length)throw Error();
  }catch{
    throw Object.assign(clientResearchFailure('RECEIPT_VALIDATION_FAILED',{...metadata,phase:'RECEIPT_VALIDATION'}),{execution});
  }
  if(result.acquisition.sources.length){
    try{
      const checkpoint=validateResearchCheckpoint(result.sourceCheckpoint);
      const request=mode==='research-acquire'?context.request:context.checkpoint.request;
      const hypotheses=(mode==='research-acquire'?context.hypotheses:context.checkpoint.hypotheses)||[];
      if(JSON.stringify(checkpoint.hypotheses||[])!==JSON.stringify(hypotheses))throw Error();
      if(!hypotheses.length&&result.acquisition.evaluation.hypothesisReview!==undefined)throw Error();
      if(hypotheses.length)validateHypothesisReview(result.acquisition.evaluation.hypothesisReview,result.acquisition.evaluation.claims,hypotheses.map(h=>h.id));
      const originalId=mode==='research-acquire'?id:context.checkpoint.originalId;
      const plan=mode==='research-acquire'?context.plan||[]:context.checkpoint.plan;
      if(checkpoint.originalId!==originalId||JSON.stringify(checkpoint.request)!==JSON.stringify(request)||JSON.stringify(checkpoint.plan)!==JSON.stringify(plan)||JSON.stringify(checkpoint.evidence)!==JSON.stringify({...result.acquisition,evaluation:{claims:[],limitations:[],nextQuestion:null}}))throw Error();
    }catch{
      throw Object.assign(clientResearchFailure('CHECKPOINT_VALIDATION_FAILED',{...metadata,phase:'CHECKPOINT_VALIDATION'}),{execution});
    }
  }
  return result;
}
