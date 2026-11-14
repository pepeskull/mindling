import { taskProgress } from './tasks.js';
const PAUSES={
 ACCESS_DISABLED:'Research authorization is off. Existing knowledge is preserved.',
 PERMISSION_REQUIRED:'Research authorization is required.',
 ENERGY_LOW:'Research is paused until sufficient energy is available.',
 BUDGET_EXHAUSTED:'The research budget is exhausted; no extra calls will be made.',
 REQUEST_INTERRUPTED:'The request was interrupted. Unknown work remains reserved.',
 SUBJECT_MISMATCH:'The saved research subject needs review before continuation.',
 QUERY_REVIEW:'The public research subject needs clarification.',
 PLANNING_UNAVAILABLE:'Research planning could not complete. Inspect the task diagnostics.',
 INSUFFICIENT_EVIDENCE:'Retrieved evidence was insufficient to retain knowledge.'
};
export function learningSummary(task,memories=[]){
  const status=({COMPLETED:'Completed',CANCELLED:'Cancelled',FAILED:'Research unavailable',BLOCKED:'Learning paused',PREPARED:'Preparing',QUEUED:'Preparing',RESEARCHING:'Researching',EVALUATING:'Evaluating',COMMITTING:'Retaining knowledge'})[task.status]||'Learning paused';
  const message=task.status==='COMPLETED'?'Supported knowledge retained.':task.status==='CANCELLED'?'Learning cancelled.':task.status==='FAILED'?'Reliable research is unavailable right now.':task.status==='BLOCKED'?(task.code==='TOOL_LIFECYCLE_INCOMPLETE'?'Provider tool work has an unknown outcome. Budget remains reserved; automatic repeat search is blocked.':task.code==='NO_EVIDENCE'?'More supporting evidence is needed.':task.code==='OFFLINE'?'Learning will resume when connected.':['CLARIFICATION','MODEL_CLARIFICATION'].includes(task.code)?'Please clarify what you want to learn.':(PAUSES[task.code]||'Research is paused. Inspect this task’s diagnostic code; existing knowledge is preserved.')):'Exploring and connecting knowledge.';
  return {diagnosticCode:typeof task.code==='string'&&/^[A-Z_]{1,80}$/.test(task.code)?task.code:null,subject:task.topic||'Learning',status,message,progress:Math.round(taskProgress(task)*100),retained:memories.filter(m=>!m.historical&&task.knowledgeIds.includes(m.recordId)&&m.raw.research?.taskId===task.id).length,sources:task.sourceReferences.filter(s=>s.hash&&s.observedAt).length};
}
