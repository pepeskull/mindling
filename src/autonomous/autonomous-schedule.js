import { specializationFor } from '../pathways/specialization-taxonomy.js';
import { graphData } from '../memory/graph-data.js';
import { publicResearchTopic, validQuery } from './research-contract.js';
export const AUTONOMY=Object.freeze({dailyTasks:3,cooldown:10*60*1000,retryDelay:60000});
export const dayKey=now=>new Date(now).toISOString().slice(0,10);
const retryable=['INTERRUPTED','OFFLINE','RATE_LIMITED','PLANNING_UNAVAILABLE'];
export function blocksOpportunity(task){
  if(task.engineVersion!==4||['COMPLETED','CANCELLED','FAILED'].includes(task.status))return false;
  if(['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status)||task.pendingEvidence?.length)return true;
  if(['INFORMATION_UNCONFIGURED','INFORMATION_UNSUPPORTED','INFORMATION_UNAUTHORIZED'].includes(task.code))return true;
  return retryable.includes(task.code)&&task.attempts<2&&(task.modelCalls||0)<4;
}
export function nextOpportunity(mind,now=Date.now()){
  const ledger=mind.autonomousLearning||{},tasks=mind.learningTasks||[];
  if(ledger.nextAt>now||ledger.day===dayKey(now)&&ledger.started>=AUTONOMY.dailyTasks||tasks.some(blocksOpportunity))return null;
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
export function autonomousDiagnostics(engine){
  if(!engine?.preferences?.enabled)return {status:'PAUSED',reason:'Autonomous learning is disabled.'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {status:'OFFLINE',reason:'Waiting for an internet connection.'};
  const tasks=engine.app.state.mind?.learningTasks||[],active=engine.active&&tasks.find(task=>task.id===engine.active.id);
  const phase=active&&({QUEUED:'PLANNING',RESEARCHING:'RESEARCHING',EVALUATING:'ANALYZING',COMMITTING:'LEARNING'})[active.status];
  if(phase)return {status:phase,reason:active.message,taskId:active.id};
  // A manual research outcome does not diagnose the autonomous scheduler.
  const latest=tasks.filter(task=>task.engineVersion===4&&task.autonomous).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(latest?.status==='BLOCKED'||latest?.status==='FAILED'){
    const paused=['NO_EVIDENCE','SOURCE_UNSUPPORTED','INTERRUPTED','ACCESS_DISABLED','BUDGET_EXHAUSTED','MODEL_CLARIFICATION','QUERY_REVIEW','PERMISSION_REQUIRED','QUEUED'];
    const status=latest.code==='RATE_LIMITED'?'RATE_LIMITED':latest.code==='OFFLINE'?'OFFLINE':paused.includes(latest.code)?'PAUSED':'ERROR';
    return {status,reason:latest.message,taskId:latest.id};
  }
  return {status:'IDLE',reason:'Waiting for the next eligible learning opportunity.'};
}
export const autonomousStatus=engine=>autonomousDiagnostics(engine).status;
