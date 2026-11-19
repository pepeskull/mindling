import {reserveSemanticDispatch} from './dispatch-guard.js';
import {LIMITS} from '../autonomous/tasks.js';
import {dayKey} from '../autonomous/autonomous-schedule.js';
export const SEMANTIC_POLICY=Object.freeze({perTaskAttempts:LIMITS.inferenceCalls});
export const semanticWindow=dayKey;
export function pendingSemantic(task,version){
 if(task.status!=='COMPLETED'||!task.knowledgeIds?.length)return false;
 if(['DISPATCHED','OUTCOME_UNKNOWN'].includes(task.semanticWork?.state))return false;
 return true;
}
// Must run within the existing gameplay transaction. Reservations are spend
// ceilings, never billing claims; a dispatched unknown request is never refunded.
export function reserveSemantic(task,mind,{fingerprint,version,submitted,now,owner}){
 const day=semanticWindow(now),tasks=mind.learningTasks||[task];
 if(tasks.some(t=>t.semanticAnalysis?.fingerprint===fingerprint||t.semanticAttempts?.some(a=>a.fingerprint===fingerprint)))return 'UNCHANGED_OR_RESERVED';
 const attempts=task.semanticAttempts||[];
 if(attempts.length>=LIMITS.inferenceCalls)return 'TASK_ANALYSIS_LIMIT';
 if(!reserveSemanticDispatch(mind,fingerprint,now))return 'SEMANTIC_BUSY';
 const allocation='SEMANTIC';
 task.semanticAttempts=[...attempts,{fingerprint,day,allocation,state:'RESERVED',owner}];
 task.semanticAnalysis={version,fingerprint,status:'RESERVED',submitted};
 task.semanticWork={version,memoryIds:[...task.knowledgeIds],fingerprint,state:'RESERVED',owner,createdAt:task.semanticWork?.createdAt||now,updatedAt:now,allocation};
 delete task.semanticDeferral;return 'RESERVED';
}
export function deferredSemantic(task,{version,fingerprint,reason,now}){
 task.semanticDeferral=reason;
 task.semanticWork={version,memoryIds:[...(task.knowledgeIds||[])],fingerprint:fingerprint||null,state:'DEFERRED',reason,createdAt:task.semanticWork?.createdAt||now,updatedAt:now};
}
export function semanticQueue(mind,version){return (mind?.learningTasks||[]).filter(task=>pendingSemantic(task,version)).sort((a,b)=>(a.semanticWork?.createdAt||a.createdAt||0)-(b.semanticWork?.createdAt||b.createdAt||0)||String(a.id).localeCompare(String(b.id))).slice(0,LIMITS.tasks);}
export function semanticSchedulingDiagnostics(mind){
 const tasks=mind?.learningTasks||[];
 return {policy:SEMANTIC_POLICY,dispatchLeaseUntil:mind?.semanticDispatch?.until||null,
  profilesPending:mind?.semanticProfiles?.pending||0,
  areaAssessments:(mind?.areaPairAttempts||[]).map(a=>({state:a.state,outcome:a.outcome,total:a.total,
   steps:a.steps.map(step=>({state:step.state,failure:step.failure,diagnostic:step.diagnostic}))})),pendingTasks:tasks.filter(t=>t.semanticWork?.state==='DEFERRED'||t.semanticWork?.state==='RESERVED').length,ledger:mind?.semanticLedger?{day:mind.semanticLedger.day,reserved:mind.semanticLedger.reserved,completed:mind.semanticLedger.completed,supplemental:mind.semanticLedger.supplemental||0}:null,tasks:tasks.slice(0,LIMITS.tasks).map((t,index)=>({index,work:t.semanticWork?{state:t.semanticWork.state,reason:t.semanticWork.reason,version:t.semanticWork.version,allocation:t.semanticWork.allocation,trigger:t.semanticWork.trigger==='AUTHORIZED_TASK_CONTINUATION'?'AUTHORIZED_TASK_CONTINUATION':null,requestReference:/^[a-f0-9]{64}$/.test(t.semanticWork.fingerprint||'')?t.semanticWork.fingerprint:null}:null,analysis:t.semanticAnalysis?{status:t.semanticAnalysis.status,persisted:t.semanticAnalysis.persisted,failure:t.semanticAnalysis.failure}:null}))};
}
