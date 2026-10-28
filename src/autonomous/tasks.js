import { LEARNING_MODES } from '../learning/input-understanding.js';
export const TASK_STATES=Object.freeze(['PREPARED','QUEUED','RESEARCHING','EVALUATING','COMMITTING','COMPLETED','BLOCKED','FAILED','CANCELLED']);
export const LIMITS=Object.freeze({tasks:24,unfinished:8,concurrent:1,attempts:2,sourceRequests:3,memories:3,sourceBytes:65536,inferenceCalls:0});
export const WORK=Object.freeze(['understanding','retrieval','plan','source','evidence','knowledge','answer']);
const modes=Object.values(LEARNING_MODES);
export const terminal=task=>['COMPLETED','CANCELLED','FAILED'].includes(task.status);
export const taskProgress=task=>Math.min(1,new Set(task.completedWork||[]).size/WORK.length);
export function validTask(task,mindId){
  try {
  return !!task&&task.version===1&&/^[a-f0-9]{64}$/.test(task.id)&&task.mindlingId===mindId&&modes.includes(task.mode)&&TASK_STATES.includes(task.status)
    &&typeof task.objective==='string'&&task.objective.length>0&&task.objective.length<=2000&&typeof task.topic==='string'&&task.topic.length<=160
    &&typeof task.run==='string'&&task.run.length<=100&&typeof task.requestId==='string'&&task.requestId.length<=100
    &&Number.isSafeInteger(task.createdAt)&&Number.isSafeInteger(task.updatedAt)&&task.updatedAt>=task.createdAt
    &&Number.isSafeInteger(task.attempts)&&task.attempts>=0&&task.attempts<=LIMITS.attempts&&Number.isSafeInteger(task.sourceRequests)&&task.sourceRequests>=0&&task.sourceRequests<=LIMITS.sourceRequests
    &&Array.isArray(task.completedWork)&&new Set(task.completedWork).size===task.completedWork.length&&task.completedWork.every(unit=>WORK.includes(unit))
    &&Array.isArray(task.sourceReferences)&&task.sourceReferences.length<=LIMITS.sourceRequests&&task.sourceReferences.every(source=>typeof source?.url==='string'&&source.url.length<=500&&new URL(source.url).protocol==='https:'&&!new URL(source.url).username&&!new URL(source.url).password&&Number.isSafeInteger(source.authorizedAt)&&(!source.hash||/^[a-f0-9]{64}$/.test(source.hash))&&(!source.observedAt||Number.isSafeInteger(source.observedAt)&&source.observedAt>=source.authorizedAt))
    &&Array.isArray(task.knowledgeIds)&&task.knowledgeIds.length<=LIMITS.memories&&task.knowledgeIds.every(id=>typeof id==='string'&&id.length<=160)
    &&Array.isArray(task.referenceIds)&&task.referenceIds.length<=24&&task.referenceIds.every(id=>typeof id==='string'&&id.length<=160)
    &&Array.isArray(task.plan)&&task.plan.length<=3&&task.plan.every(label=>typeof label==='string'&&label.length<=160)
    &&typeof task.message==='string'&&task.message.length<=1000&&typeof task.energyCharged==='boolean'&&typeof task.timeSensitive==='boolean'
    &&(!task.acceptedQuotes||Array.isArray(task.acceptedQuotes)&&task.acceptedQuotes.length<=LIMITS.memories&&task.acceptedQuotes.every(hash=>/^[a-f0-9]{64}$/.test(hash)))
    &&(!task.scope||typeof task.scope==='object')&&JSON.stringify(task).length<=12000;
  } catch { return false; }
}
export function tasksFor(mind={}){return Array.isArray(mind.learningTasks)?mind.learningTasks.filter(task=>validTask(task,mind.mindlingId||mind.id)).slice(0,LIMITS.tasks):[];}
export function writableTasks(mind){
  if(mind.learningTasks!==undefined&&(!Array.isArray(mind.learningTasks)||mind.learningTasks.length>LIMITS.tasks||mind.learningTasks.some(task=>!validTask(task,mind.id))))throw Error('Saved learning tasks could not be validated. Existing data was preserved.');
  return mind.learningTasks||[];
}
export async function digest(value){const bytes=new TextEncoder().encode(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export function validateResearchClaim(state,authorization){
  const task=writableTasks(state.mind).find(item=>item.id===authorization.taskId);
  const source=task?.sourceReferences.find(item=>item.hash===authorization.sourceHash&&item.url===authorization.url);
  if(!task||task.status!=='COMMITTING'||task.run!==authorization.run||!source||!source.observedAt||!Number.isSafeInteger(authorization.observedAt)||authorization.observedAt!==source.observedAt
    ||typeof authorization.quote!=='string'||authorization.quote.length<40||authorization.quote.length>700||!Array.isArray(task.acceptedQuotes)||!task.acceptedQuotes.includes(authorization.quoteHash)
    ||typeof authorization.content!=='string'||authorization.content.length>2000
    ||authorization.content!==`Source observation (${new Date(source.observedAt).toISOString()}) from ${source.url}: ${authorization.quote}`)throw Error('Research evidence or task authorization changed. No knowledge was saved.');
  return task;
}
