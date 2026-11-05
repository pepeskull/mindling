import {ACTIVITY_CODES} from '../app/activity-journal.js';
import {semanticDiagnostic} from '../semantic/diagnostics.js';
// Projection of existing persisted records: no second journal and no private payloads.
export const binary=code=>[...new TextEncoder().encode(code)].map(byte=>byte.toString(2).padStart(8,'0')).join(' ');
export const decodeBinary=value=>new TextDecoder().decode(Uint8Array.from(value.split(' ').map(byte=>parseInt(byte,2))));
export function activityEvents(mind={}){
 const events=new Map();
 const add=(id,timestamp,type,subsystem,status)=>{if(Number.isFinite(timestamp)&&timestamp>0)events.set(id,{id,timestamp,type,subsystem,status,binary:binary(type)});};
 for(const h of mind.history||[]){const type=h.kind==='reinforcement'?'MEMORY_REINFORCED':h.kind==='talk'?'TALK_COMPLETED':'LEARNING_RECORDED';add(`history:${h.id}`,h.recordedAt||h.at,type,'learning','completed');}
 for(const t of mind.learningTasks||[]){
  add(`task:${t.id}:created`,t.createdAt,'RESEARCH_TASK_CREATED','research','scheduled');
  if(t.activityEvents?.length){for(const e of t.activityEvents)if(ACTIVITY_CODES.has(e.type)&&['research','semantic'].includes(e.subsystem)&&['scheduled','running','completed','paused','failed','cancelled'].includes(e.status))add(`event:${t.id}:${e.sequence}`,e.timestamp,e.type,e.subsystem,e.status);continue;}
  const type={QUEUED:'RESEARCH_QUEUED',RESEARCHING:'RESEARCH_STARTED',EVALUATING:'EVIDENCE_EVALUATING',COMMITTING:'MEMORY_INTEGRATING',COMPLETED:'RESEARCH_COMPLETED',BLOCKED:'RESEARCH_PAUSED',FAILED:'RESEARCH_FAILED',CANCELLED:'RESEARCH_CANCELLED'}[t.status];
  if(type)add(`task:${t.id}:state`,t.updatedAt,type,'research',t.status.toLowerCase());
  const a=t.semanticAnalysis,w=t.semanticWork;
  if(a){const code=a.status==='COMPLETED'?'SEMANTIC_ANALYSIS_COMPLETED':a.status==='FAILED_OR_INTERRUPTED'?'SEMANTIC_ANALYSIS_FAILED':w?.state==='DISPATCHED'?'SEMANTIC_ANALYSIS_STARTED':'SEMANTIC_ANALYSIS_SCHEDULED';
   add(`semantic:${t.id}:${a.fingerprint}`,w?.updatedAt||t.updatedAt,code,'semantic',a.status==='COMPLETED'?'completed':a.status==='FAILED_OR_INTERRUPTED'?'failed':w?.state==='DISPATCHED'?'running':'scheduled');
   if(a.status==='COMPLETED'&&a.persisted>0)add(`links:${t.id}:${a.fingerprint}`,w?.updatedAt||t.updatedAt,'MEMORY_RELATION_ACCEPTED','semantic','completed');
  }
 }
 return [...events.values()].sort((a,b)=>b.timestamp-a.timestamp||a.id.localeCompare(b.id)).slice(0,80);
}
export function semanticSummary(mind={},now=Date.now()){
 const tasks=(mind.learningTasks||[]).filter(t=>t.semanticAnalysis||t.semanticWork);
 const current=mind.semanticLedger?.day===new Date(now).toISOString().slice(0,10)?mind.semanticLedger:{};
 const latest=tasks.slice().sort((a,b)=>(b.semanticWork?.updatedAt||b.updatedAt)-(a.semanticWork?.updatedAt||a.updatedAt));
 const failure=latest.find(t=>t.semanticAnalysis?.status==='FAILED_OR_INTERRUPTED'),success=latest.find(t=>t.semanticAnalysis?.status==='COMPLETED');
 const attempts=tasks.flatMap(t=>t.semanticAttempts||[]);
 const completed=tasks.filter(t=>t.semanticAnalysis?.status==='COMPLETED'||t.semanticAttempts?.some(a=>a.state==='COMPLETED')).length;
 const successTimes=[...attempts.filter(a=>a.state==='COMPLETED').map(a=>a.completedAt),success?.semanticWork?.updatedAt].filter(Number.isFinite);
 const totals=key=>tasks.reduce((n,t)=>{const r=(t.semanticAttempts||[]).filter(a=>a.state==='COMPLETED'&&a.result);return n+(r.length?r.reduce((sum,a)=>sum+(key==='accepted'?(a.result.accepted||0):(a.result.rejections?.length||0)),0):(t.semanticAnalysis?.[key]||0));},0);
 return {pending:tasks.filter(t=>['DEFERRED','RESERVED'].includes(t.semanticWork?.state)).length,running:tasks.filter(t=>t.semanticWork?.state==='DISPATCHED').length,completed,failed:tasks.filter(t=>t.semanticAnalysis?.status==='FAILED_OR_INTERRUPTED').length,
 reserved:current.reserved||0,callsCompleted:current.completed||0,remaining:mind.researchPermissions?.enabled?Math.max(0,Math.min(3-(current.reserved||0),(mind.researchPermissions?.semanticCallsPerDay||0)-(current.supplemental||0))):0,
 examined:tasks.reduce((n,t)=>n+(t.semanticAttempts||[]).filter(a=>a.state==='COMPLETED').reduce((sum,a)=>sum+(a.pairs?.length||0),0),0),accepted:totals('accepted'),rejected:totals('rejected'),
 lastSuccess:successTimes.length?Math.max(...successTimes):null,lastFailure:failure?{code:['INCOMPLETE_GENERATION','INVALID_SCHEMA','API_FAILURE','REQUEST_INTERRUPTED','MODEL_UNAVAILABLE','STALE_EVIDENCE','AUTHORIZATION_CHANGED'].includes(failure.semanticAnalysis.failure)?failure.semanticAnalysis.failure:'ANALYSIS_FAILED',diagnostic:semanticDiagnostic(failure.semanticAnalysis.diagnostic),correlationId:/^[a-f0-9]{64}$/.test(failure.semanticAnalysis.fingerprint)?failure.semanticAnalysis.fingerprint:null}:null};
}
// No deployed authenticated transport exists. Adapters must explicitly provide
// validated public records; demo network nodes are never read here.
export function connectedAgents(adapter){
 if(!adapter?.authorized||typeof adapter.publicConnections!=='function')return [];
 return adapter.publicConnections().filter(a=>a&&a.demo!==true&&typeof a.publicId==='string'&&typeof a.name==='string'&&['CONNECTED','CONNECTING','PENDING','OFFLINE','DISCONNECTED','ERROR'].includes(a.status)).slice(0,50).map(a=>({name:a.name.slice(0,80),publicId:a.publicId.slice(0,100),status:a.status,lastCommunication:Number.isFinite(a.lastCommunication)?a.lastCommunication:null,verified:a.verified===true,method:typeof a.method==='string'?a.method.slice(0,60):null}));
}

export function relationOrigins(mind={}){
 const pairs={teach:new Set(),semantic:new Set(),coSubmitted:new Set()};
 for(const m of mind.memories||[])for(const [kind,ids]of [['teach',(m.modelAssociations||[]).map(a=>a.memoryId)],['semantic',(m.semanticAssociations||[]).filter(a=>a.rule==='model-assessed-relation').map(a=>a.memoryId)],['coSubmitted',m.coSubmittedMemoryIds||[]]])for(const id of ids)if(id!==m.id)pairs[kind].add(JSON.stringify([m.id,id].sort()));
 return Object.fromEntries(Object.entries(pairs).map(([k,v])=>[k,v.size]));
}
