import { validatePlanningContext, validQuery } from './research-contract.js';
import { validClarification, validateAnswers } from '../learning/clarification-model.js';
import { LEARNING_MODES } from '../learning/input-understanding.js';
export const TASK_STATES=Object.freeze(['PREPARED','QUEUED','RESEARCHING','EVALUATING','COMMITTING','COMPLETED','BLOCKED','FAILED','CANCELLED']);
export const LIMITS=Object.freeze({tasks:24,unfinished:8,concurrent:1,attempts:2,sourceRequests:3,memories:3,sourceBytes:65536,inferenceCalls:4});
export const WORK=Object.freeze(['understanding','retrieval','plan','source','evidence','knowledge','answer']);
const modes=Object.values(LEARNING_MODES);
export const terminal=task=>['COMPLETED','CANCELLED','FAILED'].includes(task.status);
export const taskProgress=task=>Math.min(1,new Set(task.completedWork||[]).size/WORK.length);
export function validTask(task,mindId){
  try {
  if(task?.sourcePlan){validatePlanningContext(task.sourcePlan.request);if(!Array.isArray(task.sourcePlan.queries)||task.sourcePlan.queries.length>2||!task.sourcePlan.queries.every(validQuery)||!['web','biomedical','unsupported'].includes(task.sourcePlan.sourceCategory)||typeof task.sourcePlan.available!=='boolean')return false;}
  if(task?.pendingEvidence&&(!Array.isArray(task.pendingEvidence)||task.pendingEvidence.length>3||task.pendingEvidence.some(claim=>typeof claim.quote!=='string'||claim.quote.length<40||claim.quote.length>700||!/^[a-f0-9]{64}$/.test(claim.quoteHash)||!/^[a-f0-9]{64}$/.test(claim.sourceHash)||typeof claim.category!=='string'||!claim.category.trim()||claim.category.length>80||typeof claim.topic!=='string'||!claim.topic.trim()||claim.topic.length>100||!task.sourceReferences?.some(source=>source.url===claim.sourceURL&&source.hash===claim.sourceHash&&source.observedAt===claim.observedAt))))return false;
  if(task?.evidenceDiagnostics&&(!Array.isArray(task.evidenceDiagnostics.rejections)||task.evidenceDiagnostics.rejections.length>3||task.evidenceDiagnostics.rejections.some(item=>!/^[A-Z_]{1,60}$/.test(item.code))||!Number.isSafeInteger(task.evidenceDiagnostics.candidates)||task.evidenceDiagnostics.candidates<0||task.evidenceDiagnostics.candidates>3||!Number.isSafeInteger(task.evidenceDiagnostics.accepted)||task.evidenceDiagnostics.accepted<0||task.evidenceDiagnostics.accepted>3))return false;
  if(task?.memoryRejections&&(!Array.isArray(task.memoryRejections)||task.memoryRejections.length>3||task.memoryRejections.some(item=>!/^[A-Z_]{1,60}$/.test(item.code))))return false;
  if(task?.interpretationAnswers)validateAnswers(task.interpretationAnswers);
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
    &&(task.engineVersion===undefined||[2,3,4].includes(task.engineVersion))
    &&(task.planningCalls===undefined||Number.isSafeInteger(task.planningCalls)&&task.planningCalls>=0&&task.planningCalls<=2)
    &&(task.evaluationCalls===undefined||Number.isSafeInteger(task.evaluationCalls)&&task.evaluationCalls>=0&&task.evaluationCalls<=2)
    &&(task.attemptedSourceIds===undefined||Array.isArray(task.attemptedSourceIds)&&task.attemptedSourceIds.length<=3&&task.attemptedSourceIds.every(id=>typeof id==='string'&&id.length<=100))
    &&(task.modelCalls===undefined||Number.isSafeInteger(task.modelCalls)&&task.modelCalls>=0&&task.modelCalls<=LIMITS.inferenceCalls)
    &&(task.originalText===undefined||typeof task.originalText==='string'&&task.originalText.length<=2000)
    &&(task.coordinatorClarification===undefined||validClarification(task.coordinatorClarification))
    &&(task.clarificationRounds===undefined||Number.isSafeInteger(task.clarificationRounds)&&task.clarificationRounds>=0&&task.clarificationRounds<=1)
    &&(task.autonomous===undefined||typeof task.autonomous==='boolean')
    &&(task.retryAt===undefined||Number.isSafeInteger(task.retryAt)&&task.retryAt>=0)
    &&(task.nextQuestion===undefined||task.nextQuestion===null||validQuery(task.nextQuestion))
    &&(task.completedToolCalls===undefined||Number.isSafeInteger(task.completedToolCalls)&&task.completedToolCalls>=0&&task.completedToolCalls<=2)
    &&typeof task.message==='string'&&task.message.length<=1000&&typeof task.energyCharged==='boolean'&&typeof task.timeSensitive==='boolean'
    &&(task.reservedBytes===undefined||Number.isSafeInteger(task.reservedBytes)&&task.reservedBytes>=0&&task.reservedBytes<=196608)
    &&(task.totalBytes===undefined||Number.isSafeInteger(task.totalBytes)&&task.totalBytes>=0&&task.totalBytes<=196608)
    &&(task.discoveryQueries===undefined||Number.isSafeInteger(task.discoveryQueries)&&task.discoveryQueries>=0&&task.discoveryQueries<=2)
    &&(task.discoveryCandidates===undefined||Array.isArray(task.discoveryCandidates)&&task.discoveryCandidates.length<=4&&task.discoveryCandidates.every(candidate=>typeof candidate.url==='string'&&candidate.url.length<=500&&typeof candidate.title==='string'&&candidate.title.length<=240))
    &&(!task.acceptedQuotes||Array.isArray(task.acceptedQuotes)&&task.acceptedQuotes.length<=LIMITS.memories&&task.acceptedQuotes.every(hash=>/^[a-f0-9]{64}$/.test(hash)))
    &&(!task.scope||typeof task.scope==='object')&&JSON.stringify(task).length<=(task.engineVersion===4?27000:18000);
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
  if([3,4].includes(task.engineVersion)&&!task.pendingEvidence?.some(claim=>claim.quoteHash===authorization.quoteHash&&claim.quote===authorization.quote&&claim.validAt===authorization.validAt&&claim.sourceURL===authorization.url&&claim.sourceHash===authorization.sourceHash&&claim.category===authorization.classification?.category&&claim.topic===authorization.classification?.topic))throw Error('Research classification or source evidence changed.');
  return task;
}
export function taskStatusLabel(task){
  if(![2,3,4].includes(task.engineVersion)&&!terminal(task))return 'Historical research';
  if(task.status==='BLOCKED')return ({RATE_LIMITED:'Rate limited — Retry scheduled',OFFLINE:'Offline — Research paused',INFORMATION_UNSUPPORTED:'Research paused — Search tool unsupported',INFORMATION_UNAUTHORIZED:'Research paused — Search access unavailable',PERMISSION_REQUIRED:'Awaiting consent',ACCESS_DISABLED:'Planning disabled',QUERY_REVIEW:'Review public topic',MODEL_CLARIFICATION:'Clarification needed',TOOLS_UNAVAILABLE:'Research paused — Information access unavailable',INFORMATION_UNCONFIGURED:'Research paused — Information access unavailable',INFORMATION_PERMISSION:'Awaiting information-access consent',INFORMATION_DISABLED:'Research paused — Information access disabled',SOURCE_UNSUPPORTED:'Research paused — No suitable source',NO_EVIDENCE:'Research paused — Insufficient evidence',BUDGET_EXHAUSTED:'Research paused — Budget reached',PLANNING_UNAVAILABLE:'Planning unavailable',CLARIFICATION:'Clarification needed',INTERRUPTED:'Research paused'})[task.code]||'Research unavailable';
  return ({PREPARED:'Preparing research',QUEUED:'Mindling planning',RESEARCHING:task.code==='SEARCHING'?'Searching sources':'Retrieving sources',EVALUATING:'Evaluating evidence',COMMITTING:'Integrating knowledge',COMPLETED:'Completed',CANCELLED:'Cancelled',FAILED:'Research unavailable'})[task.status]||'Research paused';
}
