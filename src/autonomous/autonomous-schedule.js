import { specializationFor } from '../pathways/specialization-taxonomy.js';
import { graphData } from '../memory/graph-data.js';
import { publicResearchTopic, validQuery } from './research-contract.js';
export const AUTONOMY=Object.freeze({dailyTasks:3,cooldown:10*60*1000,retryDelay:60000});
export const dayKey=now=>new Date(now).toISOString().slice(0,10);
export function nextOpportunity(mind,now=Date.now()){
  const ledger=mind.autonomousLearning||{},tasks=mind.learningTasks||[];
  if(ledger.nextAt>now||ledger.day===dayKey(now)&&ledger.started>=AUTONOMY.dailyTasks||tasks.some(task=>task.engineVersion===4&&!['COMPLETED','CANCELLED','FAILED'].includes(task.status)))return null;
  const used=new Set(tasks.filter(task=>task.engineVersion===4).map(task=>task.topic?.toLowerCase()));
  const followups=tasks.filter(task=>task.engineVersion===4&&task.status==='COMPLETED'&&task.nextQuestion).sort((a,b)=>b.updatedAt-a.updatedAt).map(task=>task.nextQuestion);
  // Existing canonical distribution chooses a knowledge orientation, never a fabricated skill.
  const publicLabel=label=>specializationFor(label)?.aliases[0]||null;
  const graph=graphData(mind),areas=graph.distribution.slice().sort((a,b)=>a.count-b.count||a.label.localeCompare(b.label,'en')).map(area=>publicLabel(area.label)).filter(Boolean);
  const interests=(mind.pathways||[]).map(publicLabel).filter(Boolean);
  for(const topic of [...followups,...areas,...interests]){
    if(!validQuery(topic)||used.has(topic.toLowerCase())||!publicResearchTopic({topic,objective:topic}))continue;
    return topic;
  }
  return null;
}
export function autonomousStatus(engine){
  if(!engine?.preferences?.enabled)return 'PAUSED';
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return 'OFFLINE';
  const task=engine.active&&engine.app.state.mind?.learningTasks?.find(task=>task.id===engine.active.id);
  const phase=task&&({QUEUED:'PLANNING',RESEARCHING:'RESEARCHING',EVALUATING:'ANALYZING',COMMITTING:'LEARNING'})[task.status];if(phase)return phase;
  const latest=engine.app.state.mind?.learningTasks?.filter(task=>task.engineVersion===4).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(latest?.status==='BLOCKED')return latest.code==='RATE_LIMITED'?'RATE_LIMITED':latest.code==='OFFLINE'?'OFFLINE':['INTERRUPTED','ACCESS_DISABLED','BUDGET_EXHAUSTED','MODEL_CLARIFICATION','QUERY_REVIEW','PERMISSION_REQUIRED'].includes(latest.code)?'PAUSED':'ERROR';
  return 'IDLE';
}
