import {LIMITS} from '../autonomous/tasks.js';
import {dayKey} from '../autonomous/autonomous-schedule.js';
export const SEMANTIC_POLICY=Object.freeze({perTaskWindow:1,maxDaily:3,defaultDaily:0});
export const semanticWindow=dayKey;
export function pendingSemantic(task,version){
 if(task.status!=='COMPLETED'||!task.knowledgeIds?.length)return false;
 if(['DISPATCHED','OUTCOME_UNKNOWN'].includes(task.semanticWork?.state))return false;
 return true;
}
// Must run within the existing gameplay transaction. Reservations are spend
// ceilings, never billing claims; a dispatched unknown request is never refunded.
export function reserveSemantic(task,mind,{fingerprint,version,submitted,allowance,now,owner,topicFingerprint}){
 const day=semanticWindow(now),tasks=mind.learningTasks||[task];
 if(tasks.some(t=>t.semanticAnalysis?.fingerprint===fingerprint||t.semanticAttempts?.some(a=>a.fingerprint===fingerprint)))return 'UNCHANGED_OR_RESERVED';
 const attempts=task.semanticAttempts||[];
 if(attempts.length>=LIMITS.inferenceCalls)return 'TASK_ANALYSIS_LIMIT';
 if(attempts.some(a=>a.day===day))return 'TASK_WINDOW_LIMIT';
 const ledger=mind.semanticLedger?.day===day?mind.semanticLedger:{day,reserved:0,completed:0};
 // The same small daily ceiling covers shared and supplemental allocations.
 if(ledger.reserved>=SEMANTIC_POLICY.maxDaily)return 'WINDOW_LIMIT';
 if(topicFingerprint&&ledger.topics?.includes(topicFingerprint))return 'TOPIC_WINDOW_LIMIT';
 let allocation='RESEARCH_REMAINDER';
 if((task.modelCalls||0)>=LIMITS.inferenceCalls){
  if(!Number.isSafeInteger(allowance)||allowance<=0||allowance>SEMANTIC_POLICY.maxDaily)return 'ALLOWANCE_REQUIRED';
  if((ledger.supplemental||0)>=allowance)return 'ALLOWANCE_EXHAUSTED';
  allocation='AUTHORIZED_SEMANTIC';ledger.supplemental=(ledger.supplemental||0)+1;
 }else task.modelCalls=(task.modelCalls||0)+1;
 ledger.reserved++;if(topicFingerprint)ledger.topics=[...(ledger.topics||[]),topicFingerprint];mind.semanticLedger=ledger;
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
 return {policy:SEMANTIC_POLICY,pendingTasks:tasks.filter(t=>t.semanticWork?.state==='DEFERRED'||t.semanticWork?.state==='RESERVED').length,ledger:mind?.semanticLedger?{day:mind.semanticLedger.day,reserved:mind.semanticLedger.reserved,completed:mind.semanticLedger.completed,supplemental:mind.semanticLedger.supplemental||0}:null,tasks:tasks.slice(0,LIMITS.tasks).map((t,index)=>({index,work:t.semanticWork?{state:t.semanticWork.state,reason:t.semanticWork.reason,version:t.semanticWork.version,allocation:t.semanticWork.allocation,trigger:t.semanticWork.trigger==='AUTHORIZED_TASK_CONTINUATION'?'AUTHORIZED_TASK_CONTINUATION':null,requestReference:/^[a-f0-9]{64}$/.test(t.semanticWork.fingerprint||'')?t.semanticWork.fingerprint:null}:null,analysis:t.semanticAnalysis?{status:t.semanticAnalysis.status,persisted:t.semanticAnalysis.persisted,failure:t.semanticAnalysis.failure}:null}))};
}
