import {MAX_WEB_SEARCH_CALLS,remainingWebSearchCalls} from './research-budget.js';
import {queuedRefinement,refinementWaiting,refinementBlocker,refinementMessage,skipRefinement,keepPartialEvidence} from './evidence-refinement.js';
import {researchEnergyReady} from './energy-readiness.js';
import {areaProfileCandidates} from '../semantic/area-profiles.js';
import {connectAreas} from '../semantic/area-pair-worker.js';
import {taskClarification} from './clarification-tasks.js';
import {researchSubject,subjectMatches} from './research-subject.js';
import {recordTaskActivity} from '../app/activity-journal.js';
import {researchLearningContext} from '../learning/research-learning-context.js';
import {semanticQueue} from '../semantic/scheduling.js';
import { VERSION as SEMANTIC_VERSION } from '../semantic/model-contract.js';
import { runSemantic } from '../semantic/model-worker.js';
import { activityReward, cappedXPAward } from '../economy/xp.js';
import { researchRelation, claimEvidence, addSupportingEvidence, retainConflict, replacementAllowed, linkComplementaryResearch } from './memory-evolution.js';
import { validateResearchClaim } from './tasks.js';
import { correctMemory, belongsToResearchTask } from '../learning/memory-corrections.js';
import { SERVICE_MESSAGES, canRetryResearch, retryableServiceFailure, matchingEvaluationFailure, researchFailureMessage } from './service-diagnostics.js';
import { AUTONOMY, automaticPause, dayKey, nextOpportunity, autonomousStatus, autonomousDiagnostics } from './autonomous-schedule.js';
import { emitBrainActivity } from '../app/brain-activity.js';
import { EVENTS } from '../app/events.js';
import { evidenceRejection, canonicalRejection, rejectionExplanation } from './research-evidence.js';
import { learn } from '../preview/sandbox/engine.js';
import { stimulatePreviewLife } from '../preview/sandbox/life.js';
import { understandInput, knowledgeGap, LEARNING_MODES } from '../learning/input-understanding.js';
import { trainingContext } from '../training/retrieval.js';
import { energyAt, spendEnergy } from '../economy/energy.js';
import { LIFE_RULES } from '../life/life-system.js';
import { LIMITS, validTask, writableTasks, tasksFor, terminal, digest } from './tasks.js';
import { defaultPermissions, validatePermissions } from './research-permissions.js';
import { INFORMATION_CAPABILITY, publicResearchTopic, savedPublicTopic } from './research-contract.js';
import { requestResearchPlanning, requestResearchAcquisition, requestResearchCapabilities, requestResearchEvaluation } from '../cognition/reasoning-client.js';
import { beginClarification, cancelTaskClarification } from '../learning/clarification.js';
import { CLIENT_RESEARCH_CODES, clientResearchFailure } from './client-diagnostics.js';
import { validateResearchReceipt } from '../cognition/research-receipt.js';
import { DAILY_RESEARCH_PAUSE, DAILY_RESEARCH_MESSAGE, requireResearchXP, researchXPCapped, researchXPTime, hasAcquiredResearch } from './research-xp.js';
import { applyMemoryEvolution, connectionEvolution } from '../memory/evolution-policy.js';
import { conversationCopy } from '../cognition/conversation-language.js';

const engines=new WeakMap();
export function learningEngine(app){let engine=engines.get(app);if(!engine){engine=new AutonomousLearningEngine(app);engines.set(app,engine);}return engine;}
export function stopLearning(app){engines.get(app)?.destroy();}
export function learningSession(app){return engines.get(app)?.session||null;}
export function researchPermissions(app){const engine=engines.get(app),id=app.state?.mind?.id||'';return {...(engine?.preferences||defaultPermissions(id)),loaded:Boolean(engine?.preferences&&engine.permissionIdentity===id&&!engine.permissionLoading)};}
export function syncResearchPermissions(app){const engine=learningEngine(app),id=app.state?.mind?.id;if(id&&engine.permissionIdentity!==id)engine.loadPermissions().then(()=>{if(!app.disposed&&app.state.mind?.id===id){app.renderState();engine.recover();}}).catch(()=>{});}
const operationFor=task=>task.autonomous?'autonomous':task.mode===LEARNING_MODES.DEEP?'deep-research':task.mode===LEARNING_MODES.TALK_RESEARCH?'talk-research':'foundation';
const activityFor=mode=>mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';
const integrationIssue=(reason,message=reason)=>Object.assign(Error(message),{integrationReason:reason});
function integrationFailure(task,controller,error){
  if(error.clientDiagnostic||!task.researchExecution)return error;
  const paused=controller.signal.aborted||document.hidden||navigator.onLine===false;
  const {correlationId:id,operation:mode}=task.researchExecution;
  const integrationReason=paused?undefined:error.integrationReason||({QuotaExceededError:'STORAGE_QUOTA',AbortError:'STORAGE_ABORTED'}[error.name]||'LOCAL_COMMIT_FAILED');
  return Object.assign(clientResearchFailure(paused?'INTEGRATION_PAUSED':'INTEGRATION_FAILED',{
    id,mode,phase:'INTEGRATION',received:true,validated:true,status:200,reason:controller.signal.reason,integrationReason
  }),{execution:task.serviceDiagnostic});
}
function committedIntegration(state,task,run){
  const mind=state?.mind;
  if(mind?.id!==task.mindlingId)return null;
  const saved=tasksFor(mind).find(item=>item.id===task.id&&item.run===run&&item.researchExecution?.correlationId===task.researchExecution?.correlationId);
  return saved&&!saved.pendingEvidence&&(saved.status==='COMPLETED'&&saved.code==='SOURCE_BACKED'||saved.status==='BLOCKED'&&saved.code==='NO_EVIDENCE')?saved:null;
}
function reportIntegrationFollowUp(task,code){
  console.warn(JSON.stringify({event:'mindling.research.client.follow-up',phase:'POST_COMMIT',code,
    correlationId:task.researchExecution?.correlationId,operation:task.researchExecution?.operation}));
}

export class AutonomousLearningEngine {
  constructor(app){
    this.app=app;this.abort=new AbortController();this.session=crypto.randomUUID();this.followers=new Map();this.queue=new Set();
    // Hiding a tab must not discard paid in-flight work. Receipt validation and
    // persistence may finish hidden; sources() defers integration until visible.
    // Scheduling still refuses new work while hidden. Real teardown/revocation
    // continues to abort, preserving unknown-outcome reservations.
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.recover();},{signal:this.abort.signal});
    window.addEventListener('pagehide',()=>this.active?.controller.abort('PAGEHIDE'),{signal:this.abort.signal});
    window.addEventListener('offline',()=>this.active?.controller.abort('OFFLINE'),{signal:this.abort.signal});
    window.addEventListener('online',()=>this.recover(),{signal:this.abort.signal});
  }
  async loadPermissions(fresh=false){
    const id=this.app.state?.mind?.id;if(!id)return defaultPermissions('');
    if(!fresh&&this.permissionIdentity===id)return this.permissionLoading||this.preferences;
    if(this.permissionIdentity!==id){this.active?.controller.abort('ACCESS_CHANGED');this.preferences=defaultPermissions(id);this.queue.clear();}this.permissionIdentity=id;
    const loading=(this.app.db||this.app.store).researchPermissions(id).then(value=>{if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');const checked=validatePermissions(value,id);if(checked.revision>=this.preferences.revision)this.preferences=checked;return this.preferences;}).finally(()=>{if(this.permissionLoading===loading)this.permissionLoading=null;});
    this.permissionLoading=loading;return loading;
  }
  assertLive(identity){
    this.app.external?.assertWritable();const mind=this.app.state?.mind;
    if(this.disposed||this.app.disposed||document.hidden||!mind||mind.id!==identity||mind.life.lifeState!=='ALIVE')throw Error('Research is paused. A matching living Mindling and a visible page are required.');return mind;
  }
  requestId(task){return this.followers.get(task.id)||task.requestId;}
  notify(task){if(task.autonomous||!['COMPLETED','BLOCKED','FAILED'].includes(task.status))return;this.app.dashboard?.showResearchResult(task,this.requestId(task),this.reply(task));}
  async setAccess(enabled,automaticRequestLimit){
    this.app.external?.assertWritable();const id=this.app.state.mind?.id;if(!id||this.disposed)throw Error('Mindling unavailable.');
    this.active?.controller.abort('ACCESS_CHANGED');clearTimeout(this.wakeTimer);const prefs=await (this.app.db||this.app.store).saveResearchPermissions(id,{enabled,automaticRequestLimit});
    if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');this.preferences=validatePermissions(prefs,id);this.permissionIdentity=id;this.app.renderState();
    await this.app.energyClient?.researchPermission(enabled,prefs.automaticRequestLimit,prefs.revision);
    if(enabled){this.recover();void this.tick().catch(()=>this.schedule());}return prefs;
  }
  recover(){
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||!this.preferences?.enabled)return;
    this.recoverSemantic();
    for(const task of tasksFor(this.app.state.mind)){const interrupted=task.session!==this.session&&['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status),aborted=this.active?.id===task.id&&this.active.controller.signal.aborted;
      if(task.evidenceRefinement?.state==='DISPATCHED')continue;
      const known=interrupted&&matchingEvaluationFailure(task);
      if(task.engineVersion===4&&!terminal(task)&&known){
        this.patch(task.id,task.run,item=>{item.status='BLOCKED';item.code=item.lastFailureCode=known.errorCategory;item.lastFailurePhase=known.phase;item.message=researchFailureMessage(known,!!item.pendingSourceEvidence);item.retryAt??=Date.now()+AUTONOMY.retryDelay;}).catch(()=>{});continue;
      }
      if(task.engineVersion===4&&!terminal(task)&&interrupted&&!canRetryResearch(task)){
        this.patch(task.id,task.run,item=>{
          item.status='BLOCKED';
          const receipt=item.researchExecution;
          const matched=item.serviceDiagnostic?.correlationId===receipt?.correlationId&&item.serviceDiagnostic?.operation===receipt?.operation;
          if(!matched&&receipt?.clientDispatched&&receipt.correlationId&&receipt.operation){
            const failure=clientResearchFailure('TRANSPORT_INTERRUPTED',{id:receipt.correlationId,mode:receipt.operation,phase:'TRANSPORT'});
            item.clientDiagnostic=failure.clientDiagnostic;item.code=item.lastFailureCode=failure.code;item.lastFailurePhase='TRANSPORT';item.message=failure.message;if(receipt.operation==='research-acquire'){receipt.outcomeUnknown=true;receipt.toolState='OUTCOME_UNKNOWN';}
          }else{item.lastFailurePhase=item.lastFailurePhase||item.status;item.code=item.lastFailureCode||'REQUEST_INTERRUPTED';item.message=SERVICE_MESSAGES[item.code]||'Research interrupted; unknown remote work remains reserved.';}
        }).catch(()=>{});continue;
      }if(task.engineVersion===4&&!terminal(task)&&(['PERMISSION_REQUIRED','ACCESS_DISABLED','ENERGY_LOW','INTERRUPTED','QUEUED','OFFLINE'].includes(task.code)||interrupted||aborted||task.pendingSourceEvaluation||task.pendingEvidence?.length))this.startIfAuthorized(task);}
    this.schedule();
  }
  recoverSemantic(){
    if(!this.preferences?.enabled||this.disposed||this.app.disposed||document.hidden||navigator.onLine===false)return;
    const semanticTasks=semanticQueue(this.app.state.mind,SEMANTIC_VERSION);
    if(!this.active && !this.areaAssessment && (this.nextMemoryAssessment||0)<=Date.now() && researchEnergyReady(this.app.state.mind)){
      const task=semanticTasks[(this.memoryAssessmentCursor||0) % semanticTasks.length];
      if(task){
        this.memoryAssessmentCursor=(this.memoryAssessmentCursor||0)+1;
        this.nextMemoryAssessment=Date.now()+AUTONOMY.cooldown;
        void runSemantic(this,task);
      }
    }
  }
  startIfAuthorized(task){
    if(!task||terminal(task)||task.engineVersion!==4||!canRetryResearch(task)||['CLARIFICATION','MODEL_CLARIFICATION','SOURCE_UNSUPPORTED','SUBJECT_MISMATCH','CLARIFICATION_UNAVAILABLE','QUERY_REVIEW','BUDGET_EXHAUSTED','NO_EVIDENCE','INFORMATION_UNCONFIGURED','INFORMATION_UNSUPPORTED','INFORMATION_UNAUTHORIZED'].includes(task.code)||this.disposed)return;
    this.queue.add(task.id);this.drain();
  }
  async drain(){
    if(this.draining||this.active||this.disposed||document.hidden||navigator.onLine===false)return;this.draining=true;
    try{
      const prefs=await this.loadPermissions(true);
      for(const id of [...this.queue]){
        this.queue.delete(id);const task=tasksFor(this.app.state.mind).find(item=>item.id===id);if(!task||terminal(task)||task.engineVersion!==4)continue;
        this.assertLive(task.mindlingId);
        if(refinementWaiting(task)&&(!prefs.enabled||!researchEnergyReady(this.app.state.mind)))continue;
        if(!prefs.enabled){
          const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ACCESS_DISABLED';item.message='Autonomous learning is disabled. You can enable it in Research access under Notifications.';});this.notify(blocked);continue;
        }
        if(!researchEnergyReady(this.app.state.mind)){await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ENERGY_LOW';item.message='Research paused — Insufficient energy.';});continue;}
        if(task.sourcePlan&&!subjectMatches(task,task.sourcePlan.request.topic)){await this.patch(id,null,item=>{item.status='BLOCKED';item.code='SUBJECT_MISMATCH';item.message='Research paused — The saved search subject differs from the original request. Existing knowledge and reservations are preserved.';});continue;}
        const topic=savedPublicTopic(task)||publicResearchTopic(task);
        if(topic===null){const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='QUERY_REVIEW';item.message='Mindling could not safely identify a public research subject. The original request is preserved and no planning call was sent.';});if(!task.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(task)))this.app.dashboard.showResearchAccess(blocked,this.requestId(task),null);continue;}
        await this.run(task,topic);
      }
    }catch{const waiting=[...this.queue];this.queue.clear();if(!this.disposed&&!this.app.disposed&&!document.hidden)for(const id of waiting){try{const blocked=await this.patch(id,null,item=>{if(terminal(item))return;item.status='BLOCKED';item.code='PLANNING_UNAVAILABLE';item.message='Mindling planning could not confirm access. No planning request was sent.';});this.notify(blocked);}catch{/* A changed identity or read-only view owns this state. */}}}
    finally{this.draining=false;if(this.queue.size&&!this.active&&!document.hidden&&!this.disposed)queueMicrotask(()=>this.drain());}
  }
  async taskId(interpretation,identity){const dated=interpretation.timeSensitive?new Date().toISOString().slice(0,10):'';return digest(JSON.stringify([INFORMATION_CAPABILITY,identity,interpretation.depth,interpretation.normalizedText.replace(/[.!?。！？]+$/u,''),interpretation.scope,dated]));}
  async existing(interpretation){const mind=this.app.state?.mind;if(!mind)return null;const key=await this.taskId(interpretation,mind.id);return tasksFor(this.app.state.mind).find(task=>task.engineVersion===4&&(task.queryKey||task.id)===key&&!terminal(task))||null;}
  async prepare(interpretation,requestId,{reply=null,taskId=null,guard=()=>{},autonomous=false}={}){
    const identity=this.app.state.mind?.id,mind=this.assertLive(identity);
    if(!autonomous&&interpretation.depth!==LEARNING_MODES.TALK_RESEARCH&&energyAt(mind.energy,this.app.state.now).remaining<LIFE_RULES.activity[activityFor(interpretation.depth)].energyCost)throw Error('Not enough Energy for the existing learning activity.');
    if(interpretation.clarification)throw Error('Resolve the clarification before preparing research.');
    const context=trainingContext(interpretation.requestText||interpretation.normalizedText,mind),gap=knowledgeGap(interpretation,context,reply,Date.now(),mind),queryKey=await this.taskId(interpretation,identity),id=taskId||queryKey,now=Date.now();
    const task={version:1,engineVersion:4,workVersion:2,id,queryKey,mindlingId:identity,requestId,run:crypto.randomUUID(),mode:interpretation.depth,originalText:interpretation.normalizedText,objective:interpretation.requestText||interpretation.normalizedText,topic:interpretation.topic,scope:{...interpretation.scope},interpretationAnswers:{...interpretation.answers},timeSensitive:interpretation.timeSensitive,
      autonomous,status:'BLOCKED',createdAt:now,updatedAt:now,attempts:0,searchToolLimit:MAX_WEB_SEARCH_CALLS,sourceRequests:0,completedWork:['understanding'],referenceIds:gap.referenceIds,sourceReferences:[],knowledgeIds:[],
      plan:interpretation.depth===LEARNING_MODES.DEEP?['Identify bounded subtopics','Compare available evidence and conflicts','Retain only supported knowledge']:['Identify essential concepts','Check evidence availability','Retain only supported knowledge'],
      code:'PERMISSION_REQUIRED',message:'Preparing Mindling research. Source-backed learning requires a connected information tool.',energyCharged:autonomous||interpretation.depth===LEARNING_MODES.TALK_RESEARCH&&mind.processed.includes(requestId),gapReasons:gap.reasons};
    await this.app.change(state=>{
      guard();this.assertLive(identity);if(state.mind?.id!==identity||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===identity))throw Error('A matching living Mindling is required.');
      const tasks=writableTasks(state.mind),existing=tasks.find(item=>item.id===id||!taskId&&(item.queryKey||item.id)===queryKey);
      if(existing){
        if(!taskId){if(existing.engineVersion!==4){const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===existing.id);target.planningCalls=existing.engineVersion===2?Math.min(existing.attempts,2):0;target.modelCalls=target.planningCalls;target.engineVersion=4;target.code='PERMISSION_REQUIRED';target.message=task.message;target.originalText=task.originalText;return next;}return state;}if(existing.status!=='BLOCKED'||!['CLARIFICATION','MODEL_CLARIFICATION'].includes(existing.code))throw Error('This clarification changed.');
        const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===id);Object.assign(target,{engineVersion:4,queryKey,originalText:task.originalText,objective:task.objective,topic:task.topic,scope:task.scope,interpretationAnswers:task.interpretationAnswers,timeSensitive:task.timeSensitive,code:task.code,message:task.message,run:crypto.randomUUID(),clarificationRounds:(target.clarificationRounds||0)+1,updatedAt:Math.max(target.createdAt,now)});delete target.coordinatorClarification;delete target.sourcePlan;delete target.approvedPublicTopic;return next;
      }
      requireResearchXP(this.app,state);
      if(tasks.filter(item=>!terminal(item)).length>=LIMITS.unfinished)throw Error('Cancel an unfinished task before starting another.');
      const next=structuredClone(state),retained=tasks.slice();while(retained.length>=LIMITS.tasks){const index=retained.findIndex(terminal);if(index<0)throw Error('Research task history is full.');retained.splice(index,1);}
      if(autonomous){const ledger=next.mind.autonomousLearning||{},day=dayKey(now),started=ledger.day===day?ledger.started||0:0;const pause=automaticPause(next.mind,this.preferences,now);if(pause)throw Error(pause);next.mind.autonomousLearning={day,started:started+1,reservedRequests:(ledger.day===day?(ledger.reservedRequests??started*4):0)+4,nextAt:now+AUTONOMY.cooldown};}
      if(!validTask(task,identity))throw Error('The research request could not be validated.');next.mind.learningTasks=[...retained,task];return next;
    },{preserveGameplay:true,...(autonomous?{researchGrant:this.grant(this.preferences)}:{})});
    return tasksFor(this.app.state.mind).find(item=>item.id===id||!taskId&&(item.queryKey||item.id)===queryKey);
  }
  async patch(id,run,change,options={}){
    const identity=this.app.state.mind?.id;
    await this.app.change(state=>{if(this.disposed||this.app.disposed||state.mind?.id!==identity)throw Error('Research was closed or identity changed.');const next=structuredClone(state),task=writableTasks(next.mind).find(item=>item.id===id);if(!task||run&&task.run!==run)throw Error('This task changed.');const before={status:task.status,semanticWork:task.semanticWork?{...task.semanticWork}:null};change(task,next);task.updatedAt=Math.max(task.createdAt,Date.now());recordTaskActivity(before,task,task.updatedAt);if(!validTask(task,identity))throw Error('Research task update was invalid.');return next;},{preserveGameplay:true,...options});
    return tasksFor(this.app.state.mind).find(item=>item.id===id);
  }
  clarification(task){
    const model=taskClarification(task);if(!model)throw Error('This task no longer needs clarification.');
    const original=task.originalText||task.objective,answers=task.interpretationAnswers||{},interpretation={clarification:model};
    return beginClarification(this.app,original,activityFor(task.mode),task.requestId,interpretation,{taskId:task.id,paid:task.energyCharged,answers});
  }
  async act(action,id,payload={}){
    const mind=this.assertLive(this.app.state.mind?.id),task=tasksFor(mind).find(item=>item.id===id);if(!task)throw Error('This research task is unavailable.');
    if(['forget-memory','correct-memory'].includes(action))return this.manageKnowledge(task,action,payload);
    if(action==='clarify')return this.clarification(task);
    if(action==='cancel'){cancelTaskClarification(this.app,id);this.queue.delete(id);if(this.active?.id===id)this.active.controller.abort('CANCELLED');const stopped=await this.patch(id,null,item=>{if(terminal(item))return;item.run=crypto.randomUUID();item.status='CANCELLED';item.code='CANCELLED';item.message='Research cancelled. Existing knowledge was preserved.';});await this.app.energyClient?.release(operationFor(task),id).catch(()=>{});return stopped;}
    if(terminal(task))throw Error('This task has finished.');
    if(task.engineVersion!==4&&action!=='consent')throw Error('This historical task is preserved. Submit the topic again to use autonomous web research.');
    if(action==='consent'||action==='review-topic'){
      if(!(await this.loadPermissions(true)).enabled)throw Error('Enable autonomous learning in Research access under Notifications before continuing.');
      const topic=publicResearchTopic(task,payload.choice==='confirm-subject'?researchSubject(task):payload.topic??null);if(topic===null)throw Error('Choose a public topic without private details.');
      const prefs=this.preferences;
      const next=await this.patch(id,null,(item,state)=>{if(!hasAcquiredResearch(item))requireResearchXP(this.app,state);item.approvedPublicTopic={version:1,queryKey:item.queryKey||item.id,topic,approvedAt:Date.now()};item.code='QUEUED';item.message='Public topic clarified; continuing under saved research authorization.';},{researchGrant:this.grant(prefs)});
      this.startIfAuthorized(next);return {accepted:true,message:'Research continues under your saved research authorization.'};
    }
    if(!['retry','continue'].includes(action))throw Error('Unknown research action.');
    if(task.pendingSourceEvidence||task.evidenceRefinement||task.code==='NO_MODEL_CANDIDATES')throw Error('Saved evidence is managed automatically.');
    if(!canRetryResearch(task))throw Error(SERVICE_MESSAGES.BUDGET_EXHAUSTED);
    if(!(await this.loadPermissions(true)).enabled)throw Error('Allow Mindling planning in Research access under Notifications before continuing this historical or interrupted task.');
    const next=await this.patch(id,null,(item,state)=>{if(!hasAcquiredResearch(item))requireResearchXP(this.app,state);if(item.engineVersion===2&&item.planningCalls===undefined){item.planningCalls=Math.min(item.attempts,2);item.modelCalls=item.planningCalls;}if(item.code!==DAILY_RESEARCH_PAUSE&&!item.pendingSourceEvaluation&&!item.pendingEvidence?.length)item.attempts++;item.engineVersion=4;item.code='QUEUED';item.status='BLOCKED';item.message='Mindling planning queued under current authorization.';});this.startIfAuthorized(next);return next;
  }
  context(task,topic){const scope=task.scope||{};return {...(task.autonomous?{autonomous:true}:{}),topic,mode:task.mode,freshness:task.timeSensitive,scope:{criterion:scope.metric||null,geography:scope.regions||[scope.region].filter(Boolean),geographyMode:scope.regionMode||null,period:scope.period||null,quantity:Number.isSafeInteger(scope.count)&&scope.count>0?scope.count:null}};}
  grant(prefs){return {mindlingId:this.app.state.mind.id,capability:INFORMATION_CAPABILITY,revision:prefs.revision};}
  async requested(task,interpretation){
    if(task.engineVersion!==4)return this.patch(task.id,null,item=>{item.planningCalls=item.engineVersion===2?Math.min(item.attempts,2):0;item.modelCalls=item.planningCalls;item.engineVersion=4;item.code='PERMISSION_REQUIRED';item.originalText=interpretation.normalizedText;item.message='Preparing Mindling research under current authorization.';});return task;
  }
  assertResearchEnergy(mind){
    if(!researchEnergyReady(mind))throw Error('ENERGY_LOW');
  }
  async run(task,topic){
    if(this.active||!canRetryResearch(task))return;this.assertLive(task.mindlingId);
    const controller=new AbortController(),run=crypto.randomUUID();this.active={id:task.id,run,controller};const deadline=setTimeout(()=>controller.abort('RUN_DEADLINE'),120000);
    try{
      let prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
      let current=await this.patch(task.id,task.run,(item,state)=>{
        if(terminal(item)||!canRetryResearch(item))throw Error('Task changed or finished.');
        const inflight=['QUEUED','RESEARCHING','EVALUATING'].includes(item.status)&&
          ['PLANNING','SEARCHING','EVALUATING','REFINING_EVIDENCE'].includes(item.code)&&
          !item.pendingSourceEvaluation&&!item.pendingEvidence?.length;
        if(inflight&&item.researchAdmission?.run===item.run&&item.session!==this.session&&Date.now()-item.researchAdmission.startedAt<120000)return;
        if(!hasAcquiredResearch(item)&&researchXPCapped(this.app,state)){
          item.status='BLOCKED';item.code=DAILY_RESEARCH_PAUSE;item.message=DAILY_RESEARCH_MESSAGE;return;
        }
        item.run=run;item.session=this.session;item.attempts=Math.max(1,item.attempts);
      },{researchGrant:this.grant(prefs)});
      if(current.run!==run){if(current.code===DAILY_RESEARCH_PAUSE)this.notify(current);return;}
      if(!current.sourcePlan&&!current.pendingEvidence?.length){
        current=await this.patch(task.id,run,(item,next)=>{this.assertResearchEnergy(next.mind);requireResearchXP(this.app,next);const planned=item.planningCalls??(item.plannedAt?Math.min(item.attempts,2):0),used=item.modelCalls??planned;if(planned>=2||used>=LIMITS.inferenceCalls)throw Error('BUDGET_EXHAUSTED');item.researchAdmission={run,startedAt:Date.now()};item.planningCalls=planned+1;item.modelCalls=used+1;item.status='QUEUED';item.code='PLANNING';item.message='Understanding the request and preparing unverified hypotheses.';},{researchGrant:this.grant(prefs)});
        const context=this.context(task,topic),id=await digest(JSON.stringify([task.id,run,'plan',context]));
        const result=await requestResearchPlanning({id,context,signal:controller.signal,fetcher:this.app.energyClient?.transport(operationFor(task),task.id)});this.assertLive(task.mindlingId);if(controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
        current=await this.patch(task.id,run,item=>{
          item.hypotheses=result.planning.hypotheses||[];item.plan=result.planning.plan;item.plannedAt=Date.now();item.completedWork=[...new Set([...item.completedWork,'plan'])];item.status='BLOCKED';
          const question=result.planning.clarification;
          if(question&&question.options.length>=2&&!(item.clarificationRounds>=1)&&item.modelCalls<LIMITS.inferenceCalls){item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:question.question,options:question.options,freeText:false};item.code='MODEL_CLARIFICATION';item.message=question.question;}
          else if(question){item.code='CLARIFICATION_UNAVAILABLE';item.message='Research paused — The subject could not be resolved safely with the available choices.';}
          else{item.sourcePlan={request:context,queries:result.planning.queries,sourceCategory:result.planning.sourceCategory,available:result.information?.available===true};item.code='QUEUED';item.message='Hypotheses prepared — awaiting source verification.';}
        },{researchGrant:this.grant(prefs)});
        if(current.code==='MODEL_CLARIFICATION'){if(!current.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(current)))this.app.dashboard.showClarification(this.clarification(current).talkResponse);return;}
      }
      if(current.code==='CLARIFICATION_UNAVAILABLE'){this.notify(current);return;}
      await this.sources(current,run,controller);
    }catch(error){
      if(error.clientDiagnostic){this.clientFailure={taskId:task.id,run,diagnostic:error.clientDiagnostic};console.warn(JSON.stringify({event:'mindling.research.client',...error.clientDiagnostic}));}
      try{
      const code=error.code===DAILY_RESEARCH_PAUSE?DAILY_RESEARCH_PAUSE:error.message==='ENERGY_LOW'?'ENERGY_LOW':error.clientDiagnostic?.code||error.diagnostic?.errorCategory||(navigator.onLine===false?'OFFLINE':error.name==='AbortError'?'REQUEST_INTERRUPTED':Object.hasOwn(SERVICE_MESSAGES,error.code||error.message)?error.code||error.message:/^INFORMATION_[A-Z_]+$/.test(error.code||'')?error.code:'PLANNING_UNAVAILABLE');
      const blocked=await this.patch(task.id,run,item=>{
        if(terminal(item))return;
        if(code===DAILY_RESEARCH_PAUSE){item.status='BLOCKED';item.code=code;item.message=DAILY_RESEARCH_MESSAGE;return;}
        // Loss of authorization or Energy before the reservation leaves the same work queued.
        if(refinementWaiting(task)&&refinementWaiting(item))return;
        if(item.pendingEvidence?.length&&['DISPATCHED','RECEIVED'].includes(item.evidenceRefinement?.state)&&code!=='INTEGRATION_PAUSED'){
          item.lastFailureCode=code;item.lastFailurePhase=error.clientDiagnostic?.phase||error.diagnostic?.phase||'SOURCE_EVALUATION';
          if(error.clientDiagnostic)item.clientDiagnostic=error.clientDiagnostic;
          keepPartialEvidence(item,error.clientDiagnostic?.phase==='TRANSPORT'?'REQUEST_INTERRUPTED':'EVALUATION_FAILED');
          return;
        }
        // Keep the original failure instead of replacing it with a failed retry preflight.
        if(code==='BUDGET_EXHAUSTED'&&item.lastFailureCode){item.retryBlockedReason=code;item.status='BLOCKED';return;}
        item.lastFailurePhase=error.clientDiagnostic?.phase||error.diagnostic?.phase||(item.code==='PLANNING'?'PLANNING':item.status);item.status='BLOCKED';item.code=code;item.lastFailureCode=code;
        item.retryAt=Date.now()+AUTONOMY.retryDelay*Math.max(1,item.attempts);
        if(error.clientDiagnostic){item.clientDiagnostic=error.clientDiagnostic;}
        if(error.execution){item.serviceDiagnostic=error.execution;this.recordExecution(item,error.execution);}
        if(error.diagnostic){item.serviceDiagnostic=error.diagnostic;this.recordExecution(item,error.diagnostic);}
        else if(!error.execution&&!item.pendingSourceEvaluation&&!item.pendingEvidence?.length&&item.researchExecution&&['RESERVED','DISPATCHED'].includes(item.researchExecution.toolState)){item.researchExecution.toolState='OUTCOME_UNKNOWN';item.researchExecution.outcomeUnknown=true;}
        if(error.checkpoint&&JSON.stringify(error.checkpoint.request)===JSON.stringify(item.sourcePlan?.request)){
          item.pendingSourceEvidence=error.checkpoint;
          const acquired=error.checkpoint.evidence;item.completedToolCalls=acquired.requests;item.completedWork=[...new Set([...item.completedWork,'retrieval','source'])];
          for(const source of acquired.sources)if(!item.sourceReferences.some(ref=>ref.url===source.url))item.sourceReferences.push({url:source.url,title:source.title,provider:source.provider,type:source.type,hash:source.hash,status:'pending-analysis',authorizedAt:Date.now(),observedAt:Date.now()});
        }
        if(error.observation?.correlationId===item.researchExecution?.correlationId&&item.researchExecution?.outcomeUnknown)item.researchObservation=error.observation;
        if(item.evidenceRefinement?.state==='DISPATCHED'){
          item.evidenceRefinement.state='INTERRUPTED';
          item.evidenceRefinement.reason=error.clientDiagnostic?.phase==='TRANSPORT'?'REQUEST_INTERRUPTED':'EVALUATION_FAILED';
        }
        if(error.recoveryBlockedReason)item.retryBlockedReason=error.recoveryBlockedReason;
        item.message=code==='ENERGY_LOW'?'Research is waiting for Energy.':error.clientDiagnostic?CLIENT_RESEARCH_CODES[code]:error.diagnostic?researchFailureMessage(error.diagnostic,!!item.pendingSourceEvidence):code==='OFFLINE'?'Research paused — Offline.':SERVICE_MESSAGES[code]||'Research paused. The task details preserve the service failure.';
      });
      if(blocked?.code==='QUEUED'&&blocked.evidenceRefinement?.state==='INTERRUPTED'&&blocked.pendingEvidence?.length&&!controller.signal.aborted&&!document.hidden&&navigator.onLine!==false)await this.integrate(blocked,run,controller);
      else this.notify(blocked);
    }catch{
      const receipt=error.execution||error.diagnostic;
      const diagnostic=error.clientDiagnostic||(receipt&&['research-acquire','research-evaluate'].includes(receipt.operation)?clientResearchFailure('CHECKPOINT_PERSISTENCE_FAILED',{id:receipt.correlationId,mode:receipt.operation,phase:'CHECKPOINT_PERSISTENCE',received:true,status:null}).clientDiagnostic:null);
      if(diagnostic){
        this.clientFailure={taskId:task.id,run,diagnostic,serverDiagnostic:receipt};
        console.warn(JSON.stringify({event:'mindling.research.client.persistence',...diagnostic}));
      }
      if(receipt)console.warn(JSON.stringify({event:'mindling.research.server-receipt',...receipt}));
      // A changed run/identity is never overwritten, even to record an error.
    }}
    finally{clearTimeout(deadline);if(this.active?.controller===controller)this.active=null;if(!this.disposed&&!this.app.disposed)this.app.renderState();this.schedule();}
  }
  async saveResearchReceipt(task,run,id,result,prefs,authorizedAt){
    const receivedAt=Date.now(),mode=result.execution.operation;
    const failure=code=>Object.assign(clientResearchFailure(code,{id,mode,phase:'CHECKPOINT_PERSISTENCE',received:true,validated:true,status:200}),{execution:result.execution});
    if(this.disposed||this.app.disposed||this.app.state.mind?.id!==task.mindlingId)throw failure('STALE_RESEARCH_RESPONSE');
    try{
      await this.app.change(state=>{
        if(this.disposed||this.app.disposed||state.mind?.id!==task.mindlingId||state.mind.life.lifeState!=='ALIVE')throw failure('STALE_RESEARCH_RESPONSE');
        const next=structuredClone(state),item=writableTasks(next.mind).find(value=>value.id===task.id);
        if(!item||item.run!==run||terminal(item)||item.researchExecution?.correlationId!==id||item.researchExecution.operation!==mode)throw failure('STALE_RESEARCH_RESPONSE');
        item.serviceDiagnostic=result.execution;delete item.clientDiagnostic;this.recordExecution(item,result.execution);
        if(result.sourceCheckpoint){
          item.pendingSourceEvidence=result.sourceCheckpoint;
          item.pendingSourceEvaluation={version:1,evaluation:result.acquisition.evaluation,receivedAt,authorizedAt};
        }
        for(const source of result.acquisition.sources){
          const metadata={url:source.url,title:source.title,provider:source.provider,type:source.type,hash:source.hash,status:'received-awaiting-checks',authorizedAt,observedAt:receivedAt};
          const previous=item.sourceReferences.find(ref=>ref.url===source.url);
          if(!previous)item.sourceReferences.push(metadata);
          else if(!result.execution.refinement||previous.hash!==source.hash)Object.assign(previous,metadata);
        }
        if(result.execution.refinement){
          if(item.evidenceRefinement?.state!=='DISPATCHED'||item.evidenceRefinement.id!==id)throw failure('STALE_RESEARCH_RESPONSE');
          item.evidenceRefinement.state='RECEIVED';
        }
        item.status='EVALUATING';item.code='RECEIVED';item.message='Correlated research evidence was received and saved for local checks.';
        if(result.acquisition.sources.length)item.completedWork=[...new Set([...item.completedWork,'retrieval','source'])];
        item.updatedAt=Math.max(item.createdAt,receivedAt);
        if(!validTask(item,task.mindlingId))throw failure('CHECKPOINT_PERSISTENCE_FAILED');
        return next;
      },{preserveGameplay:true,researchGrant:this.grant(prefs)});
    }catch(error){if(error.clientDiagnostic)throw error;throw failure('CHECKPOINT_PERSISTENCE_FAILED');}
    return tasksFor(this.app.state.mind).find(item=>item.id===task.id);
  }
  async sources(task,run,controller){
    const block=async(code,message)=>{const stopped=await this.patch(task.id,run,item=>{item.status='BLOCKED';item.code=code;item.message=message;});this.notify(stopped);return stopped;};
    if(!task.sourcePlan||!subjectMatches(task,task.sourcePlan.request.topic))return block('SUBJECT_MISMATCH','Research paused — The saved search does not match the original subject. No new knowledge was accepted.');
    let refining=refinementWaiting(task);
    if(refining){
      const skip=refinementBlocker(task,Date.now());
      if(skip){
        task=await this.patch(task.id,run,item=>skipRefinement(item,skip));
        if(!task.pendingEvidence?.length)return task;
        refining=false;
      }else if(!researchEnergyReady(this.app.state.mind))return;
    }
    if(!task.pendingEvidence?.length&&!task.pendingSourceEvaluation&&!refining){
      if(!researchEnergyReady(this.app.state.mind))return block('ENERGY_LOW','Research is waiting for Energy.');
      if(task.sourcePlan.sourceCategory!=='web')return block('SOURCE_UNSUPPORTED','Research paused — This request cannot be safely researched.');
      if(!task.sourcePlan.available){const id=await digest(JSON.stringify([task.id,run,'capabilities'])),result=await requestResearchCapabilities({id,context:{},signal:controller.signal,fetcher:this.app.energyClient?.transport(operationFor(task),task.id)});if(!result.information.available)return block('INFORMATION_UNCONFIGURED','Research paused — Web information access is not configured.');task=await this.patch(task.id,run,item=>{item.sourcePlan.available=true;});}
    }
    let prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    if(task.pendingEvidence?.length&&!refining&&!task.pendingSourceEvaluation){
      try{return await this.integrate(task,run,controller,prefs);}catch(error){throw integrationFailure(task,controller,error);}
    }
    let authorizedAt=Date.now(),observedAt=Date.now(),current=task,result;
    if(task.pendingSourceEvaluation){
      const saved=task.pendingSourceEvaluation,checkpoint=task.pendingSourceEvidence;
      authorizedAt=saved.authorizedAt;observedAt=saved.receivedAt;
      result={service:'mindling-reasoning-service',kind:'research-acquisition',acquisition:{...checkpoint.evidence,evaluation:saved.evaluation},execution:task.serviceDiagnostic,sourceCheckpoint:checkpoint};
      const mode=task.researchExecution.operation,id=task.researchExecution.correlationId;
      const context=mode==='research-acquire'?{request:task.sourcePlan.request,plan:task.plan,remainingCalls:task.researchExecution.reserved,...(task.hypotheses?.length?{hypotheses:task.hypotheses}:{})}:{checkpoint,...(task.evidenceRefinement?.state==='RECEIVED'?{refinement:true}:{})};
      validateResearchReceipt(result,{id,mode,context});
    }else{
      const checkpoint=task.pendingSourceEvidence,remainingCalls=remainingWebSearchCalls(task);
      if(!checkpoint&&remainingCalls<1)throw Error('BUDGET_EXHAUSTED');
      const learning=researchLearningContext(task.sourcePlan.request.topic,this.app.state.mind,task.plan);
      const retainedQuotes=refining?[...new Set((task.pendingEvidence||[]).map(claim=>claim.quote))]:[];
      const context=checkpoint?{checkpoint,learning,...(refining?{refinement:true}:{}),...(retainedQuotes.length?{retainedQuotes}:{})}:{request:task.sourcePlan.request,queries:task.sourcePlan.queries,remainingCalls,plan:task.plan,learning,...(task.hypotheses?.length?{hypotheses:task.hypotheses}:{})};
      // Stable across reloads, time, and changes to the category prompt context.
      const id=await digest(JSON.stringify(refining?[task.id,'refinement-v1',checkpoint.evidence.responseId,checkpoint.evidence.sources.map(s=>[s.id,s.hash]).sort()]:[task.id,run,checkpoint?'source-evaluation':'web-search',context]));
      current=await this.patch(task.id,run,(item,next)=>{
        if(refining&&!researchEnergyReady(next.mind))return;
        this.assertResearchEnergy(next.mind);
        if(refining){
          if(!refinementWaiting(item)||item.pendingSourceEvidence?.signature!==checkpoint.signature)throw Error('Research evidence changed.');
          const skip=refinementBlocker(item,Date.now());
          if(skip){
            skipRefinement(item,skip);return;
          }
          item.evidenceRefinement={...queuedRefinement(),id,state:'DISPATCHED',startedAt:Date.now()};
        }
        const calls=checkpoint?1:2;if((item.modelCalls||0)+calls>LIMITS.inferenceCalls||(item.evaluationCalls||0)>=2)throw Error('BUDGET_EXHAUSTED');
        item.modelCalls=(item.modelCalls||0)+calls;item.evaluationCalls=(item.evaluationCalls||0)+1;
        if(!checkpoint){
          if(item.researchAdmission?.run!==run){requireResearchXP(this.app,next);item.researchAdmission={run,startedAt:Date.now()};}
          if(item.researchExecution?.outcomeUnknown||!remainingCalls||remainingWebSearchCalls(item)!==remainingCalls)throw Error('BUDGET_EXHAUSTED');
          item.sourceRequests+=remainingCalls;
          item.researchExecution={version:1,reserved:remainingCalls,toolState:'RESERVED',clientDispatched:false,upstreamDispatched:null,completed:0,failed:0,outcomeUnknown:false};
        }
        delete item.researchObservation;
        item.researchExecution.correlationId=id;item.researchExecution.operation=checkpoint?'research-evaluate':'research-acquire';
        if(refining)item.researchExecution.clientDispatched=true;
        item.status=checkpoint?'EVALUATING':'RESEARCHING';item.code=refining?'REFINING_EVIDENCE':checkpoint?'EVALUATING':'SEARCHING';item.message=refining?refinementMessage(item.evidenceRefinement):checkpoint?'Evaluating the previously retrieved signed evidence; no new search.':'Researching public sources and comparing cited evidence.';
      },{researchGrant:this.grant(prefs)});
      if(refining&&current.evidenceRefinement?.state!=='DISPATCHED'){
        if(current.evidenceRefinement?.state==='SKIPPED'&&current.pendingEvidence?.length)return this.integrate(current,run,controller,prefs);
        return;
      }
      if(!refining)current=await this.patch(task.id,run,item=>{item.researchExecution.clientDispatched=true;if(!checkpoint)item.researchExecution.toolState='DISPATCHED';});
      result=await (checkpoint?requestResearchEvaluation:requestResearchAcquisition)({id,context,signal:controller.signal,fetcher:this.app.energyClient?.transport(operationFor(task),task.id)});
      current=await this.saveResearchReceipt(task,run,id,result,prefs,authorizedAt);
      observedAt=current.pendingSourceEvaluation?.receivedAt||Date.now();
    }
    const clientFailure=(code,phase)=>Object.assign(clientResearchFailure(code,{id:current.researchExecution.correlationId,mode:current.researchExecution.operation,phase,received:true,validated:true,status:200,reason:controller.signal.reason}),{execution:result.execution});
    if(controller.signal.aborted||document.hidden||navigator.onLine===false)throw clientFailure('INTEGRATION_PAUSED','INTEGRATION');
    const acquired=result.acquisition,pending=[];
    const validation=result.execution?.validation;
    const rejections=(validation?.rejections||[]).map(({index,rule})=>({index,code:rule}));
    for(const source of acquired.sources)if(await digest(source.text)!==source.hash)throw clientFailure('EVIDENCE_VALIDATION_FAILED','EVIDENCE_VALIDATION');
    for(const claim of acquired.evaluation.claims){
      const source=acquired.sources.find(item=>item.id===claim.sourceId),reason=evidenceRejection(claim,source,task,Date.now());
      if(reason){rejections.push({sourceId:claim.sourceId,code:reason});continue;}
      const validAt=claim.validAt===null?null:Date.parse(claim.validAt+'T00:00:00Z');
      const originalObservation=result.execution.refinement&&current.sourceReferences.find(ref=>ref.hash===source.hash&&ref.url===source.url);
      pending.push({quote:claim.quote,quoteHash:await digest(claim.quote),sourceURL:source.url,sourceHash:source.hash,observedAt:originalObservation?.observedAt??observedAt,validAt,category:claim.category,topic:claim.topic,...(claim.canonicalMatch?{canonicalMatch:claim.canonicalMatch}:{})});
    }
    const candidateOutcome=!acquired.evaluation.claims.length&&!rejections.length?(acquired.sources.length?'NO_MODEL_CANDIDATES':'NO_CITED_PASSAGES'):null;
    try{current=await this.patch(task.id,run,item=>{
      if(terminal(item)||item.researchExecution?.correlationId!==result.execution.correlationId)throw clientFailure('STALE_RESEARCH_RESPONSE','EVIDENCE_PERSISTENCE');
      if(result.execution){item.serviceDiagnostic=result.execution;this.recordExecution(item,result.execution);}
      const refined=result.execution.refinement===true;
      const original=refined?item.pendingEvidence||[]:[];
      const partial=original.length>0;
      const hashes=new Set(original.map(claim=>claim.quoteHash));
      const additional=partial?pending.filter(claim=>{
        if(hashes.has(claim.quoteHash))return false;
        hashes.add(claim.quoteHash);return true;
      }).slice(0,LIMITS.memories-original.length):pending;
      const accepted=[...original,...additional];
      const refinePartial=!refined&&!item.evidenceRefinement&&accepted.length>0&&accepted.length<LIMITS.memories&&rejections.length>0;
      if(refined){
        item.evidenceRefinement.state=additional.length?'COMPLETED':'EXHAUSTED';
        item.evidenceRefinement.reason=additional.length?null:'INSUFFICIENT_EVIDENCE';
      }
      if(!refinePartial&&(candidateOutcome!=='NO_MODEL_CANDIDATES'||refined))delete item.pendingSourceEvidence;
      delete item.pendingSourceEvaluation;
      if(!partial)item.evidenceDiagnostics={version:1,candidateOutcome,candidates:validation?.candidates??acquired.evaluation.claims.length,accepted:pending.length,rejections,extraction:acquired.diagnostics||null};
      if(result.execution.operation==='research-acquire'||!item.totalBytes)item.totalBytes=acquired.bytes;
      item.status='EVALUATING';item.code='EVALUATING';item.message='Checking tool-cited research against canonical memory.';item.responseId=acquired.responseId;item.completedToolCalls=acquired.requests;
      if(!partial){item.hypothesisReview=acquired.evaluation.hypothesisReview||[];item.nextQuestion=acquired.evaluation.nextQuestion;}
      item.limitations=partial?[...new Set([...(item.limitations||[]),...acquired.evaluation.limitations])]:acquired.evaluation.limitations;
      if(accepted.length)item.pendingEvidence=accepted;else delete item.pendingEvidence;
      for(const source of acquired.sources){
        const existing=item.sourceReferences.find(ref=>ref.url===source.url);
        const original=result.execution.refinement&&existing?.hash===source.hash?existing:null;
        const metadata={url:source.url,title:source.title,provider:source.provider,domain:source.domain,publishedAt:null,type:source.type,status:source.status,
          hash:source.hash,...(source.passages?{passages:source.passages}:{excerpt:source.text}),authorizedAt:original?.authorizedAt??authorizedAt,
          observedAt:original?.observedAt??observedAt,serverRetrievedAt:source.observedAt,responseId:acquired.responseId};
        if(existing)Object.assign(existing,metadata);else item.sourceReferences.push(metadata);
      }
      if(acquired.requests)item.completedWork=[...new Set([...item.completedWork,'retrieval'])];
      if(acquired.sources.length)item.completedWork=[...new Set([...item.completedWork,'source','evidence'])];
      if(refinePartial){
        const skip=refinementBlocker(item,Date.now());
        if(skip)skipRefinement(item,skip);
        else{item.evidenceRefinement=queuedRefinement();item.status='BLOCKED';item.code='REFINING_EVIDENCE';item.message=refinementMessage(item.evidenceRefinement);}
      }else if(!accepted.length){
        item.status='BLOCKED';
        item.code=candidateOutcome==='NO_MODEL_CANDIDATES'?'NO_MODEL_CANDIDATES':'NO_EVIDENCE';
        item.message=`Research paused — Insufficient evidence. ${rejectionExplanation(candidateOutcome||rejections[0]?.code)} No research knowledge was saved.`;
        if(refined)item.message=refinementMessage(item.evidenceRefinement);
        else if(refinementWaiting(item)){
          const skip=refinementBlocker(item,Date.now());
          item.evidenceRefinement={...queuedRefinement(),...(skip?{state:'SKIPPED',reason:skip}:{})};
          item.message=refinementMessage(item.evidenceRefinement);
        }
      }
    },{researchGrant:this.grant(prefs)});}catch(error){if(error.clientDiagnostic)throw error;throw clientFailure('EVIDENCE_PERSISTENCE_FAILED','EVIDENCE_PERSISTENCE');}
    if(!current.pendingEvidence?.length||refinementWaiting(current)){
      if(!current.pendingEvidence?.length&&!refinementWaiting(current))await this.app.energyClient?.release(operationFor(task),task.id).catch(()=>{});
      this.notify(current);return current;
    }
    try{return await this.integrate(current,run,controller,prefs);}catch(error){throw integrationFailure(current,controller,error);}
  }
  recordExecution(task,diagnostic){
    const receipt=task.researchExecution;if(!receipt)return;
    receipt.upstreamDispatched=receipt.upstreamDispatched===true||diagnostic.searchDispatched;receipt.completed=diagnostic.completed;receipt.failed=diagnostic.failed;receipt.outcomeUnknown=diagnostic.outcomeUnknown;
    receipt.toolState=diagnostic.outcomeUnknown?'OUTCOME_UNKNOWN':diagnostic.completed>0?'COMPLETED':diagnostic.failed>0?'FAILED':diagnostic.searchDispatched?'FAILED':'RESERVED';
    task.completedToolCalls=diagnostic.completed;
    if(diagnostic.searchCompleted)task.completedWork=[...new Set([...task.completedWork,'retrieval'])];
  }
  async integrate(task,run,controller,prefs){
    try{prefs=await this.loadPermissions(true);}catch{throw integrationIssue('PERMISSION_UNAVAILABLE');}
    if(!prefs.enabled||controller.signal.aborted)throw integrationIssue('PERMISSION_UNAVAILABLE');
    const evidence=task.pendingEvidence||[];for(const claim of evidence)if(await digest(claim.quote)!==claim.quoteHash)throw integrationIssue('EVIDENCE_CHANGED','Saved evidence changed.');
    if(!task.sourcePlan||!subjectMatches(task,task.sourcePlan.request.topic))throw integrationIssue('SUBJECT_MISMATCH');
    await this.patch(task.id,run,item=>{item.status='COMMITTING';item.code='INTEGRATING';item.message='Integrating accepted source-backed knowledge.';item.acceptedQuotes=evidence.map(item=>item.quoteHash);});
    const activity=activityFor(task.mode),grant=this.grant(prefs);
    const stored=await this.app.change(state=>{
      this.assertLive(task.mindlingId);if(controller.signal.aborted||state.mind?.id!==task.mindlingId||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===task.mindlingId))throw Error('Research was cancelled.');
      let next=structuredClone(state),current=writableTasks(next.mind).find(item=>item.id===task.id);if(!current||current.run!==run||current.status!=='COMMITTING')throw integrationIssue('TASK_CHANGED');
      const knowledge=[],memoryRejections=[],evolution=[],unintegrated=[];
      const at=researchXPTime(this.app,state),iso=new Date(at).toISOString();
      let formed=0,evidenceAdded=0,independent=false;
      for(const claim of evidence){
        if((next.mind.researchExclusions||[]).includes(claim.quoteHash)){memoryRejections.push({code:'EXCLUDED_BY_USER',quoteHash:claim.quoteHash});continue;}
        const id=`${task.id.slice(0,40)}:${claim.quoteHash.slice(0,40)}`,content=`Source observation (${new Date(claim.observedAt).toISOString()}) from ${claim.sourceURL}: ${claim.quote}`;
        const authorization={taskId:task.id,run,url:claim.sourceURL,sourceHash:claim.sourceHash,observedAt:claim.observedAt,validAt:claim.validAt,quote:claim.quote,quoteHash:claim.quoteHash,content,classification:{category:claim.category,topic:claim.topic}};
        try{validateResearchClaim(next,authorization);}catch{throw integrationIssue('CLAIM_AUTHORIZATION_FAILED');}
        const relation=researchRelation(next.mind,claim),support=claimEvidence(claim,current);
        if(relation.kind==='support'){
          const added=addSupportingEvidence(relation.target,support);
          if(added==='capacity')memoryRejections.push({code:'SUPPORT_CAPACITY',quoteHash:claim.quoteHash});
          else if(added!=='duplicate'){
            const corroborates=added==='independent';
            evidenceAdded++;independent||=corroborates;knowledge.push(relation.target.id);
            evolution.push([relation.target.id,corroborates?'RESEARCH_CORROBORATION':'RESEARCH_USE']);
          }else knowledge.push(relation.target.id);
          continue;
        }
        if(relation.kind==='uncertain'){
          memoryRejections.push({code:'CANONICAL_DUPLICATE_OR_UNCERTAIN',quoteHash:claim.quoteHash});
          unintegrated.push(support);continue;
        }
        if(relation.kind==='conflict'){
          if(!relation.target){memoryRejections.push({code:'CANONICAL_CONFLICT',quoteHash:claim.quoteHash});continue;}
          if(current.evidenceRefinement?.state==='COMPLETED'&&knowledge.includes(relation.target.id)){memoryRejections.push({code:'CANONICAL_CONFLICT',quoteHash:claim.quoteHash});continue;}
          try{retainConflict(relation.target,support);}catch{memoryRejections.push({code:'CONFLICT_CAPACITY',quoteHash:claim.quoteHash});continue;}
          if(current.timeSensitive||current.limitations?.length||!replacementAllowed(next.mind,relation.target,claim)){memoryRejections.push({code:'CANONICAL_CONFLICT',quoteHash:claim.quoteHash});continue;}
          authorization.supersedes=relation.target.id;
        }
        try{
          const candidate=learn(next,{id,text:claim.quote,mindId:task.mindlingId,activity:activity==='TALK'?'TEACH':activity,autonomous:authorization});
          const memory=candidate.mind.memories.find(memory=>memory.id===id);
          if(!memory){
            memoryRejections.push({code:'CANONICAL_DUPLICATE_OR_UNCERTAIN',quoteHash:claim.quoteHash});unintegrated.push(support);continue;
          }
          linkComplementaryResearch(candidate.mind,memory,claim,iso);
          next=candidate;
          if(authorization.supersedes)for(let i=memoryRejections.length-1;i>=0;i--)if(memoryRejections[i].code==='CANONICAL_CONFLICT'&&memoryRejections[i].quoteHash===claim.quoteHash)memoryRejections.splice(i,1);
          knowledge.push(id);formed++;
        }catch(error){memoryRejections.push({code:canonicalRejection(error),quoteHash:claim.quoteHash});unintegrated.push(support);}
      }
      current=writableTasks(next.mind).find(item=>item.id===task.id);
      if(formed&&!current.autonomous&&!current.energyCharged){
        if(activity==='TALK'||next.mind.processed.includes(current.requestId))throw integrationIssue('ACTIVITY_CHARGE_UNAVAILABLE');
        const energy=energyAt(next.mind.energy,next.now),cost=LIFE_RULES.activity[activity].energyCost;
        if(energy.remaining<cost)throw integrationIssue('ENERGY_UNAVAILABLE');
        next.mind.energy=spendEnergy(energy,cost,next.now);stimulatePreviewLife(next.mind.life,activity,next.now);next.mind.processed.push(current.requestId);current.energyCharged=true;
      }
      const priorIds=new Set(state.mind.memories.map(memory=>memory.id));
      const strengthened=applyMemoryEvolution(next.mind.memories,[...evolution.filter(([id])=>priorIds.has(id)),...connectionEvolution(state.mind.memories,next.mind.memories)],iso);
      current.integrationSummary={created:formed,evidenceAdded,strengthened:strengthened.length};
      const rewarded=next.mind.history.some(e=>(e.requestId===current.requestId&&Boolean(e.rewardBasis))||(e.id===current.requestId&&e.kind==='talk'&&(e.xp>0||e.rewardEligible)));
      if((formed||independent)&&!current.learningRewarded&&!rewarded){
        const award=cappedXPAward(activityReward(activity),next.mind.history,at);
        let event=next.mind.history.find(e=>e.taskId===current.id&&e.kind==='research'&&knowledge.includes(e.id));
        if(!event){
          event={id:`research-support:${current.id}`,taskId:current.id,kind:'research-support',memoryIds:[...new Set(knowledge)]};
          next.mind.history.push(event);
        }
        Object.assign(event,{at,day:Math.floor(at/86400000),xp:award,activity,requestId:current.requestId,rewardBasis:'research-learning'});
        next.mind.stageXP+=award;next.mind.lifetimeXP+=award;
        if(formed&&!current.autonomous&&activity!=='TALK'&&event.concept)next.mind.milestones.push(event.concept);
        current.learningRewarded=true;
      }
      current.memoryRejections=memoryRejections;
      if(unintegrated.length)current.unintegratedEvidence=unintegrated.slice(0,3);
      current.knowledgeIds=[...new Set(knowledge)];delete current.pendingEvidence;delete current.acceptedQuotes;current.updatedAt=Math.max(current.createdAt,Date.now());
      if(knowledge.length){current.completedWork=[...new Set([...current.completedWork,'knowledge','answer'])];current.status='COMPLETED';current.code='SOURCE_BACKED';current.message=formed?`Research completed: ${formed} new source-attributed ${formed===1?'memory':'memories'} retained. This is bounded evidence, not complete topic coverage or independent verification.`:evidenceAdded?'Research completed: additional evidence retained for existing knowledge.':'Research completed: the matching evidence was already saved.';}else{current.status='BLOCKED';current.code='NO_EVIDENCE';current.message=`Research paused — Insufficient evidence. ${rejectionExplanation(memoryRejections[0]?.code)} Existing knowledge was preserved.`;}
      recordTaskActivity({status:'COMMITTING',semanticWork:current.semanticWork},current,current.updatedAt);
      if(!validTask(current,task.mindlingId))throw integrationIssue('COMPLETION_INVALID');return next;
    },{preserveGameplay:true,researchGrant:grant,energyOperation:{kind:operationFor(task),id:task.id},...(activity==='TALK'||task.autonomous?{}:{journal:{id:`research:${task.id}:${run}`,type:activity}})}).catch(error=>{
      // Both app controllers publish the saved state before calling the renderer.
      // A matching committed task distinguishes a renderer fault from rollback.
      const completed=committedIntegration(this.app.state,task,run);
      if(!completed)throw error;
      reportIntegrationFollowUp(completed,'STATE_REFRESH_FAILED');
      return this.app.state;
    });
    const completed=committedIntegration(stored??this.app.state,task,run);
    if(!completed)throw integrationIssue('COMMIT_UNCONFIRMED');
    if(this.disposed||this.app.disposed||this.app.state.mind?.id!==task.mindlingId)return completed;
    try{
      this.notify(completed);this.recover();
      const memory=this.app.state.mind.memories.find(item=>item.id===completed.knowledgeIds[0]);
      if(memory)this.app.seed?.highlightRoute?.({neuronIds:memory.neuronIds||[],synapseIds:memory.synapseIds||[]});
      if(completed.knowledgeIds.length){
        emitBrainActivity(this.app,task.mindlingId,'research',completed.knowledgeIds);
        this.app.events?.emit(EVENTS.NEURAL_INPUT,{id:task.id,phase:'accepted',activity,autonomous:!!task.autonomous});
      }
    }catch{reportIntegrationFollowUp(completed,'COMPLETION_NOTIFICATION_FAILED');}
    return completed;
  }
  reply(task){
    const sv=/[åäö]|\b(?:vilket|sverige|lär)\b/iu.test(task.objective),completed=task.status==='COMPLETED';
    const memories=completed?task.knowledgeIds.map(id=>this.app.state.mind.memories.find(memory=>memory.id===id&&!memory.supersededBy&&memory.intelligence?.current!==false)).filter(Boolean):[];
    const sources=task.sourceReferences.filter(source=>memories.some(memory=>memory.research?.sourceURL===source.url||memory.researchSupport?.some(e=>e.taskId===task.id&&e.sourceURL===source.url))).map(({url,title,publishedAt})=>({url,title:title||url,publishedAt}));
    const quotes=memories.map(memory=>{const position=memory.content.indexOf(': ',memory.content.indexOf(' from '));return position>=0?memory.content.slice(position+2):memory.content;});
    const found=task.sourceReferences.some(source=>source.hash),unsupported=task.code==='SOURCE_UNSUPPORTED',active=['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status);
    const paused=task.code==='TOOL_LIFECYCLE_INCOMPLETE'?(sv?'Jag kan inte bekräfta hur sökningen avslutades. Uppgiften är pausad och budgeten förblir reserverad. Jag startar ingen ny sökning automatiskt.':'I can’t confirm how the search finished. The task is paused and its budget stays reserved. I won’t automatically repeat the search.'):task.code==='CLARIFICATION_UNAVAILABLE'?(sv?'Jag kan inte säkert avgränsa frågan med de tillgängliga alternativen. Ingen ytterligare sökning har startats.':'I can’t safely resolve the remaining ambiguity with the available choices. No further search was started.'):task.code==='SUBJECT_MISMATCH'?(sv?'Det sparade sökämnet stämmer inte med din ursprungliga fråga. Jag har pausat uppgiften utan att ändra dina minnen.':'The saved search subject does not match your original request. I paused the task without changing your memories.'):unsupported?(sv?'Jag kan inte verifiera den här frågan med de tillgängliga källorna.':'I can’t verify this question with the available sources.'):found?(sv?'Jag hittade källor, men kunde inte säkert behålla ytterligare kunskap från dem. Dina befintliga minnen är oförändrade.':'I found sources, but couldn’t safely retain additional knowledge from them. Your existing memories are unchanged.'):active?(sv?'Jag undersöker vilket underlag som finns för din fråga.':'I’m checking the available evidence for your request.'):(sv?'Jag förstår vad du vill lära dig, men kan inte hämta tillräckligt tillförlitliga källor just nu. Forskningsuppgiften är pausad.':'I understand what you want to learn, but I can’t retrieve reliable supporting sources right now. The research task is paused.');
    const copy=conversationCopy(task.objective);
    const answer=completed?copy.summary+'\n\n'+quotes.join('\n\n'):task.code===DAILY_RESEARCH_PAUSE?copy.pause:['NO_EVIDENCE','NO_MODEL_CANDIDATES'].includes(task.code)?paused+' '+(sv?'Källornas underlag eller aktualitet räckte inte för att spara ett nytt påstående.':'The source evidence or its date did not establish a supported new claim. See the learning task for details.'):paused;
    return {answer,memoryIds:memories.map(memory=>memory.id),sources,uncertainty:completed?'medium':'high',insufficientInformation:!completed||!memories.length,researchTaskId:task.id};
  }
  follow(task,requestId){this.followers.set(task.id,requestId);if(this.followers.size>LIMITS.tasks)this.followers.delete(this.followers.keys().next().value);}
  async manageKnowledge(task,action,{memoryId,text}={}){
    const identity=task.mindlingId;
    if(action==='correct-memory')return correctMemory(this.app,{memoryId,text},{journal:!!this.app.db,guard:()=>{
      this.assertLive(identity);if(!belongsToResearchTask(this.app.state.mind,memoryId,task.id))throw Error('This memory does not belong to the selected research task.');
    }});
    await this.app.change(state=>{
      this.assertLive(identity);const next=structuredClone(state),memory=next.mind.memories.find(memory=>memory.id===memoryId&&memory.research?.taskId===task.id);
      if(!memory||memory.supersededBy||memory.intelligence?.current===false)throw Error('This retained research memory changed.');
      if(memory.research?.quoteHash)next.mind.researchExclusions=[...new Set([...(next.mind.researchExclusions||[]),memory.research.quoteHash])].slice(-1000);
      next.mind.memories=next.mind.memories.filter(item=>item.id!==memoryId);
      for(const item of next.mind.memories){item.relatedMemoryIds=(item.relatedMemoryIds||[]).filter(key=>key!==memoryId);if(Array.isArray(item.semanticAssociations))item.semanticAssociations=item.semanticAssociations.filter(entry=>entry.memoryId!==memoryId);}
      for(const saved of next.mind.learningTasks||[])saved.knowledgeIds=saved.knowledgeIds.filter(key=>key!==memoryId);
      return next;
    },{preserveGameplay:true});
    return {accepted:true,message:'Research memory removed from current knowledge. Historical task/source records are retained.'};
  }
  schedule(){
    clearTimeout(this.wakeTimer);if(this.disposed||this.app.disposed||!this.preferences?.enabled||document.hidden)return;
    this.wakeTimer=setTimeout(()=>this.tick().catch(()=>this.schedule()),AUTONOMY.retryDelay);
  }
  async tick(){
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||this.active||this.draining||this.areaAssessment)return this.schedule();
    const prefs=await this.loadPermissions(true);if(!prefs.enabled)return;
    const now=Date.now(),tasks=tasksFor(this.app.state.mind);
    const abandoned=tasks.find(task=>!terminal(task)&&task.evidenceRefinement?.state==='DISPATCHED'&&now-task.evidenceRefinement.startedAt>=120000);
    if(abandoned){const stopped=await this.patch(abandoned.id,abandoned.run,item=>{
      if(item.evidenceRefinement?.state!=='DISPATCHED')return;
      if(item.pendingEvidence?.length){keepPartialEvidence(item,'REQUEST_INTERRUPTED');return;}
      item.evidenceRefinement.state='INTERRUPTED';
      item.evidenceRefinement.reason='REQUEST_INTERRUPTED';
      item.status='BLOCKED';item.code='REQUEST_INTERRUPTED';item.message=refinementMessage(item.evidenceRefinement);
    });if(stopped?.code==='QUEUED'){this.startIfAuthorized(stopped);return;}}
    if(!researchEnergyReady(this.app.state.mind,now))return this.schedule();
    const refinement=tasks.find(refinementWaiting);
    if(refinement){this.startIfAuthorized(refinement);return;}
    const capped=researchXPCapped(this.app);
    const energyWaiting=tasks.find(task=>task.code==='ENERGY_LOW'&&canRetryResearch(task)&&(!capped||hasAcquiredResearch(task)));if(energyWaiting){this.startIfAuthorized(energyWaiting);return;}
    const untilReset=tasks.find(task=>!capped&&task.autonomous&&task.code===DAILY_RESEARCH_PAUSE&&canRetryResearch(task));
    if(untilReset){this.startIfAuthorized(untilReset);return;}
    const retry=tasks.find(task=>task.engineVersion===4&&!terminal(task)&&retryableServiceFailure(task)&&(task.retryAt||0)<=now&&canRetryResearch(task)&&(!capped||hasAcquiredResearch(task)));
    if(retry){const next=await this.patch(retry.id,null,item=>{if(!item.pendingSourceEvaluation&&!item.pendingEvidence?.length)item.attempts++;item.code='QUEUED';});this.startIfAuthorized(next);return;}
    if(!this.areaAssessment && (this.nextAreaAssessment||0)<=now){
      this.areaAssessment=true;
      try{
        const mind=this.app.state.mind;
        // Rotate the shortlist so a cached result cannot starve newer candidates.
        const candidates=areaProfileCandidates(mind);
        const offset=(this.areaAssessmentCursor||0)%Math.max(1,candidates.length);
        for(const ids of candidates.slice(offset,offset+12)){
          this.areaAssessmentCursor=(this.areaAssessmentCursor||0)+1;
          const outcome=await connectAreas(this.app,ids,mind.id,undefined,{automatic:true});
          if(outcome.dispatched)return this.schedule();
        }
      }finally{this.areaAssessment=false;this.nextAreaAssessment=Date.now()+AUTONOMY.cooldown;}
    }
    const topic=capped?null:nextOpportunity(this.app.state.mind,now,prefs);
    if(topic){const interpretation=understandInput(`Learn about ${topic}`,'TEACH');if(!interpretation.clarification){const task=await this.prepare(interpretation,`autonomous:${crypto.randomUUID()}`,{autonomous:true});this.startIfAuthorized(task);return;}}
    this.recoverSemantic();
    this.schedule();
  }
  get status(){return autonomousStatus(this);}
  get diagnostics(){return autonomousDiagnostics(this);}
  destroy(){clearTimeout(this.wakeTimer);this.disposed=true;this.active?.controller.abort('DISPOSED');this.abort.abort();this.queue.clear();}
}
