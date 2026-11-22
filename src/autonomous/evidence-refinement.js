import { LIMITS } from './tasks.js';

const states=['QUEUED','DISPATCHED','RECEIVED','COMPLETED','EXHAUSTED','INTERRUPTED','SKIPPED'];
const reasons=['BUDGET_EXHAUSTED','CHECKPOINT_EXPIRED','EVIDENCE_UNAVAILABLE','INSUFFICIENT_EVIDENCE','REQUEST_INTERRUPTED','EVALUATION_FAILED'];

export function validRefinement(record){
  if(!record||Object.keys(record).sort().join(',')!=='id,reason,startedAt,state,version'||record.version!==1||!states.includes(record.state))return false;
  if(record.reason!==null&&!reasons.includes(record.reason))return false;
  const reserved=['DISPATCHED','RECEIVED','COMPLETED','EXHAUSTED','INTERRUPTED'].includes(record.state);
  return reserved?/^[a-f0-9]{64}$/.test(record.id)&&Number.isSafeInteger(record.startedAt)&&record.startedAt>0:record.id===null&&record.startedAt===null;
}

export const queuedRefinement=()=>({version:1,state:'QUEUED',id:null,startedAt:null,reason:null});
export const refinementWaiting=task=>task?.engineVersion===4&&task.status==='BLOCKED'&&(task.evidenceRefinement?.state==='QUEUED'||!task.evidenceRefinement&&task.code==='NO_MODEL_CANDIDATES');

export function refinementBlocker(task,now){
  const checkpoint=task.pendingSourceEvidence,diagnostic=task.serviceDiagnostic,receipt=task.researchExecution;
  const empty=diagnostic?.candidateOutcome==='NO_GENERATED_CANDIDATES'&&diagnostic.validation?.candidates===0;
  const kept=task.pendingEvidence?.length||0;
  const partial=diagnostic?.candidateOutcome==='CANDIDATES_ACCEPTED'&&kept>0&&kept<LIMITS.memories&&task.evidenceDiagnostics?.rejections?.length>0&&diagnostic.validation?.accepted>=kept;
  if(!checkpoint?.evidence?.sources?.length||!receipt||receipt.toolState!=='COMPLETED'||receipt.outcomeUnknown!==false||task.researchObservation||diagnostic?.errorCategory!==null||diagnostic.correlationId!==receipt.correlationId||(!empty&&!partial))return 'EVIDENCE_UNAVAILABLE';
  if(checkpoint.expiresAt<=now)return 'CHECKPOINT_EXPIRED';
  if((task.modelCalls||0)>=LIMITS.inferenceCalls||(task.evaluationCalls||0)>=2)return 'BUDGET_EXHAUSTED';
  return null;
}

export function skipRefinement(task,reason){
  task.evidenceRefinement={...queuedRefinement(),state:'SKIPPED',reason};
  task.message=refinementMessage(task.evidenceRefinement);
  if(task.pendingEvidence?.length)delete task.pendingSourceEvidence;
}

// The first assessment is already validated. An interrupted second evaluation
// must never replace its search receipt or prevent local integration.
export function keepPartialEvidence(task,reason){
  task.evidenceRefinement.state='INTERRUPTED';
  task.evidenceRefinement.reason=reason;
  delete task.pendingSourceEvidence;
  delete task.pendingSourceEvaluation;
  task.status='BLOCKED';task.code='QUEUED';task.message=refinementMessage(task.evidenceRefinement);
}

export function refinementMessage(record){
  switch(record?.state){
    case 'QUEUED':return 'Research will automatically check the saved sources once more when it can continue.';
    case 'DISPATCHED':return 'Research is checking the saved sources for narrower claims.';
    case 'RECEIVED':return 'Research received the refined claims and is checking their evidence.';
    case 'COMPLETED':return 'Research completed its check of the saved sources.';
    case 'EXHAUSTED':return 'The additional check found no further evidence-backed claims to retain.';
    case 'INTERRUPTED':return 'The additional check was interrupted. Its reservation is retained and the request will not be repeated.';
    case 'SKIPPED':
      if(record.reason==='BUDGET_EXHAUSTED')return 'There is no remaining budget for another source evaluation.';
      if(record.reason==='CHECKPOINT_EXPIRED')return 'The signed source checkpoint expired before another evaluation could start.';
      return 'The saved results do not contain reusable evidence for another evaluation.';
    default:return '';
  }
}
