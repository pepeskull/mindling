// Append only committed state transitions inside the existing task transaction.
// This is a bounded public-code journal, never model text or hidden reasoning.
const research={QUEUED:['RESEARCH_QUEUED','scheduled'],RESEARCHING:['RESEARCH_STARTED','running'],EVALUATING:['EVIDENCE_EVALUATING','running'],COMMITTING:['MEMORY_INTEGRATING','running'],COMPLETED:['RESEARCH_COMPLETED','completed'],BLOCKED:['RESEARCH_PAUSED','paused'],FAILED:['RESEARCH_FAILED','failed'],CANCELLED:['RESEARCH_CANCELLED','cancelled']};
const semantic={DEFERRED:['SEMANTIC_ANALYSIS_SCHEDULED','scheduled'],RESERVED:['SEMANTIC_ANALYSIS_SCHEDULED','scheduled'],DISPATCHED:['SEMANTIC_ANALYSIS_STARTED','running'],COMPLETED:['SEMANTIC_ANALYSIS_COMPLETED','completed'],OUTCOME_UNKNOWN:['SEMANTIC_ANALYSIS_FAILED','failed']};
export const ACTIVITY_CODES=new Set([...Object.values(research),...Object.values(semantic),['MEMORY_RELATION_ACCEPTED','completed']].map(([type])=>type));
export function recordTaskActivity(before,task,at){
 const append=(entry,subsystem)=>{if(!entry)return;const [type,status]=entry;task.activitySequence=(task.activitySequence||0)+1;task.activityEvents=[...(task.activityEvents||[]),{sequence:task.activitySequence,timestamp:at,type,subsystem,status}].slice(-16);};
 if(before.status!==task.status)append(research[task.status],'research');
 if(before.semanticWork?.state!==task.semanticWork?.state||before.semanticWork?.fingerprint!==task.semanticWork?.fingerprint){append(semantic[task.semanticWork?.state],'semantic');if(task.semanticWork?.state==='COMPLETED'&&task.semanticAnalysis?.persisted>0)append(['MEMORY_RELATION_ACCEPTED','completed'],'semantic');}
}
