import {researchSubject,subjectMatches} from './research-subject.js';
import {recordTaskActivity} from '../app/activity-journal.js';
import {researchLearningContext} from '../learning/research-learning-context.js';
import {semanticQueue} from '../semantic/scheduling.js';
import { VERSION as SEMANTIC_VERSION } from '../semantic/model-contract.js';
import { runSemantic } from '../semantic/model-worker.js';
import { activityReward } from '../economy/xp.js';
import { researchRelation, claimEvidence, addSupportingEvidence, retainConflict, replacementAllowed } from './memory-evolution.js';
import { validateResearchClaim } from './tasks.js';
import { correctMemory, belongsToResearchTask } from '../learning/memory-corrections.js';
import { SERVICE_MESSAGES, canRetryResearch, retryableServiceFailure, matchingEvaluationFailure, researchFailureMessage } from './service-diagnostics.js';
import { AUTONOMY, automaticPause, dayKey, nextOpportunity, autonomousStatus, autonomousDiagnostics } from './autonomous-schedule.js';
import { EVENTS } from '../app/events.js';
import { evidenceRejection, canonicalRejection, rejectionExplanation } from './research-evidence.js';
import { learn, XP } from '../preview/sandbox/engine.js';
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

const engines=new WeakMap();
export function learningEngine(app){let engine=engines.get(app);if(!engine){engine=new AutonomousLearningEngine(app);engines.set(app,engine);}return engine;}
export function stopLearning(app){engines.get(app)?.destroy();}
export function learningSession(app){return engines.get(app)?.session||null;}
export function researchPermissions(app){const engine=engines.get(app),id=app.state?.mind?.id||'';return {...(engine?.preferences||defaultPermissions(id)),loaded:Boolean(engine?.preferences&&engine.permissionIdentity===id&&!engine.permissionLoading)};}
export function syncResearchPermissions(app){const engine=learningEngine(app),id=app.state?.mind?.id;if(id&&engine.permissionIdentity!==id)engine.loadPermissions().then(()=>{if(!app.disposed&&app.state.mind?.id===id){app.renderState();engine.recover();}}).catch(()=>{});}
const activityFor=mode=>mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';

export class AutonomousLearningEngine {
  constructor(app){
    this.app=app;this.abort=new AbortController();this.session=crypto.randomUUID();this.followers=new Map();this.queue=new Set();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.active?.controller.abort('HIDDEN');else this.recover();},{signal:this.abort.signal});
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
    if(enabled){this.recover();void this.tick().catch(()=>this.schedule());}return prefs;
  }
  async setSemanticAllowance(semanticCallsPerDay){
    const prefs=await this.loadPermissions(true),id=this.app.state.mind?.id;this.assertLive(id);
    const next=await (this.app.db||this.app.store).saveResearchPermissions(id,{enabled:prefs.enabled,semanticCallsPerDay});
    if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');
    this.preferences=validatePermissions(next,id);this.app.renderState();this.recover();return this.preferences;
  }
  recover(){
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||!this.preferences?.enabled)return;
    const semanticTasks=semanticQueue(this.app.state.mind,SEMANTIC_VERSION);
    for(const task of semanticTasks)void runSemantic(this,task);
    for(const task of tasksFor(this.app.state.mind)){const interrupted=task.session!==this.session&&['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status),aborted=this.active?.id===task.id&&this.active.controller.signal.aborted;
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
        if(!prefs.enabled){
          const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ACCESS_DISABLED';item.message='Autonomous learning is disabled. You can enable it in Settings.';});this.notify(blocked);continue;
        }
        if(task.autonomous&&energyAt(this.app.state.mind.energy,Date.now()).remaining<2){await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ENERGY_LOW';item.message='Research paused — Insufficient energy.';});continue;}
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
      autonomous,status:'BLOCKED',createdAt:now,updatedAt:now,attempts:0,sourceRequests:0,completedWork:['understanding'],referenceIds:gap.referenceIds,sourceReferences:[],knowledgeIds:[],
      plan:interpretation.depth===LEARNING_MODES.DEEP?['Identify bounded subtopics','Compare available evidence and conflicts','Retain only supported knowledge']:['Identify essential concepts','Check evidence availability','Retain only supported knowledge'],
      code:'PERMISSION_REQUIRED',message:'Preparing Mindling research. Source-backed learning requires a connected information tool.',energyCharged:autonomous||interpretation.depth===LEARNING_MODES.TALK_RESEARCH&&mind.processed.includes(requestId),gapReasons:gap.reasons};
    await this.app.change(state=>{
      guard();this.assertLive(identity);if(state.mind?.id!==identity||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===identity))throw Error('A matching living Mindling is required.');
      const tasks=writableTasks(state.mind),existing=tasks.find(item=>item.id===id||!taskId&&(item.queryKey||item.id)===queryKey);
      if(existing){
        if(!taskId){if(existing.engineVersion!==4){const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===existing.id);target.planningCalls=existing.engineVersion===2?Math.min(existing.attempts,2):0;target.modelCalls=target.planningCalls;target.engineVersion=4;target.code='PERMISSION_REQUIRED';target.message=task.message;target.originalText=task.originalText;return next;}return state;}if(existing.status!=='BLOCKED'||!['CLARIFICATION','MODEL_CLARIFICATION'].includes(existing.code))throw Error('This clarification changed.');
        const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===id);Object.assign(target,{engineVersion:4,queryKey,originalText:task.originalText,objective:task.objective,topic:task.topic,scope:task.scope,interpretationAnswers:task.interpretationAnswers,timeSensitive:task.timeSensitive,code:task.code,message:task.message,run:crypto.randomUUID(),clarificationRounds:(target.clarificationRounds||0)+1,updatedAt:Math.max(target.createdAt,now)});delete target.coordinatorClarification;delete target.sourcePlan;delete target.approvedPublicTopic;return next;
      }
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
    const original=task.originalText||task.objective,answers=task.interpretationAnswers||{},interpretation={...understandInput(original,activityFor(task.mode),{answers})};
    if(task.coordinatorClarification)interpretation.clarification=task.coordinatorClarification;
    return beginClarification(this.app,original,activityFor(task.mode),task.requestId,interpretation,{taskId:task.id,paid:task.energyCharged,answers});
  }
  async act(action,id,payload={}){
    const mind=this.assertLive(this.app.state.mind?.id),task=tasksFor(mind).find(item=>item.id===id);if(!task)throw Error('This research task is unavailable.');
    if(['forget-memory','correct-memory'].includes(action))return this.manageKnowledge(task,action,payload);
    if(action==='clarify')return this.clarification(task);
    if(action==='cancel'){cancelTaskClarification(this.app,id);this.queue.delete(id);if(this.active?.id===id)this.active.controller.abort('CANCELLED');return this.patch(id,null,item=>{if(terminal(item))return;item.run=crypto.randomUUID();item.status='CANCELLED';item.code='CANCELLED';item.message='Research cancelled. Existing knowledge was preserved.';});}
    if(terminal(task))throw Error('This task has finished.');
    if(task.engineVersion!==4&&action!=='consent')throw Error('This historical task is preserved. Submit the topic again to use autonomous web research.');
    if(action==='consent'||action==='review-topic'){
      if(!(await this.loadPermissions(true)).enabled)throw Error('Enable autonomous learning in Settings before continuing.');
      const topic=publicResearchTopic(task,payload.choice==='confirm-subject'?researchSubject(task):payload.topic??null);if(topic===null)throw Error('Choose a public topic without private details.');
      const prefs=this.preferences;
      const next=await this.patch(id,null,item=>{item.approvedPublicTopic={version:1,queryKey:item.queryKey||item.id,topic,approvedAt:Date.now()};item.code='QUEUED';item.message='Public topic clarified; continuing under Settings authorization.';},{researchGrant:this.grant(prefs)});
      this.startIfAuthorized(next);return {accepted:true,message:'Research continues under your saved Settings authorization.'};
    }
    if(!['retry','continue'].includes(action))throw Error('Unknown research action.');
    if(!canRetryResearch(task))throw Error(SERVICE_MESSAGES.BUDGET_EXHAUSTED);
    if(!(await this.loadPermissions(true)).enabled)throw Error('Allow Mindling planning in Settings before continuing this historical or interrupted task.');
    const next=await this.patch(id,null,item=>{if(item.engineVersion===2&&item.planningCalls===undefined){item.planningCalls=Math.min(item.attempts,2);item.modelCalls=item.planningCalls;}if(!item.pendingSourceEvaluation&&!item.pendingEvidence?.length)item.attempts++;item.engineVersion=4;item.code='QUEUED';item.status='BLOCKED';item.message='Mindling planning queued under current authorization.';});this.startIfAuthorized(next);return next;
  }
  context(task,topic){const scope=task.scope||{};return {...(task.autonomous?{autonomous:true}:{}),topic,mode:task.mode,freshness:task.timeSensitive,scope:{criterion:scope.metric||null,geography:scope.regions||[scope.region].filter(Boolean),geographyMode:scope.regionMode||null,period:scope.period||null,quantity:Number.isSafeInteger(scope.count)&&scope.count>0?scope.count:null}};}
  grant(prefs){return {mindlingId:this.app.state.mind.id,capability:INFORMATION_CAPABILITY,revision:prefs.revision};}
  async requested(task,interpretation){
    if(task.engineVersion!==4)return this.patch(task.id,null,item=>{item.planningCalls=item.engineVersion===2?Math.min(item.attempts,2):0;item.modelCalls=item.planningCalls;item.engineVersion=4;item.code='PERMISSION_REQUIRED';item.originalText=interpretation.normalizedText;item.message='Preparing Mindling research under current authorization.';});return task;
  }
  async run(task,topic){
    if(this.active)return;this.assertLive(task.mindlingId);
    const controller=new AbortController(),run=crypto.randomUUID();this.active={id:task.id,run,controller};const deadline=setTimeout(()=>controller.abort('RUN_DEADLINE'),120000);
    try{
      let current=await this.patch(task.id,null,item=>{if(terminal(item))throw Error('Task finished.');item.run=run;item.session=this.session;item.attempts=Math.max(1,item.attempts);});
      let prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
      if(!current.sourcePlan&&!current.pendingEvidence?.length){
        current=await this.patch(task.id,run,item=>{const planned=item.planningCalls??(item.plannedAt?Math.min(item.attempts,2):0),used=item.modelCalls??planned;if(planned>=2||used>=LIMITS.inferenceCalls)throw Error('BUDGET_EXHAUSTED');item.planningCalls=planned+1;item.modelCalls=used+1;item.status='QUEUED';item.code='PLANNING';item.message='Mindling is planning what information to look for.';});
        const context=this.context(task,topic),id=await digest(JSON.stringify([task.id,run,'plan',context]));
        const result=await requestResearchPlanning({id,context,signal:controller.signal});this.assertLive(task.mindlingId);if(controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
        current=await this.patch(task.id,run,item=>{
          item.plan=result.planning.plan;item.plannedAt=Date.now();item.completedWork=[...new Set([...item.completedWork,'plan'])];item.status='BLOCKED';
          const question=result.planning.clarification;
          if(question&&question.options.length>=2&&!(item.clarificationRounds>=1)&&item.modelCalls<LIMITS.inferenceCalls){item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:question.question,options:question.options,freeText:false};item.code='MODEL_CLARIFICATION';item.message=question.question;}
          else if(question){item.code='CLARIFICATION_UNAVAILABLE';item.message='Research paused — The subject could not be resolved safely with the available choices.';}
          else{item.sourcePlan={request:context,queries:result.planning.queries,sourceCategory:result.planning.sourceCategory,available:result.information?.available===true};item.code='QUEUED';item.message='Mindling has prepared a bounded source search.';}
        },{researchGrant:this.grant(prefs)});
        if(current.code==='MODEL_CLARIFICATION'){if(!current.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(current)))this.app.dashboard.showClarification(this.clarification(current).talkResponse);return;}
      }
      if(current.code==='CLARIFICATION_UNAVAILABLE'){this.notify(current);return;}
      await this.sources(current,run,controller);
    }catch(error){
      if(error.clientDiagnostic){this.clientFailure={taskId:task.id,run,diagnostic:error.clientDiagnostic};console.warn(JSON.stringify({event:'mindling.research.client',...error.clientDiagnostic}));}
      try{
      const code=error.clientDiagnostic?.code||error.diagnostic?.errorCategory||(navigator.onLine===false?'OFFLINE':error.name==='AbortError'?'REQUEST_INTERRUPTED':Object.hasOwn(SERVICE_MESSAGES,error.code||error.message)?error.code||error.message:/^INFORMATION_[A-Z_]+$/.test(error.code||'')?error.code:'PLANNING_UNAVAILABLE');
      const blocked=await this.patch(task.id,run,item=>{
        if(terminal(item))return;
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
        if(error.recoveryBlockedReason)item.retryBlockedReason=error.recoveryBlockedReason;
        item.message=error.clientDiagnostic?CLIENT_RESEARCH_CODES[code]:error.diagnostic?researchFailureMessage(error.diagnostic,!!item.pendingSourceEvidence):code==='OFFLINE'?'Research paused — Offline.':SERVICE_MESSAGES[code]||'Research paused. The task details preserve the service failure.';
      });this.notify(blocked);
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
          const previous=item.sourceReferences.find(ref=>ref.url===source.url);if(previous)Object.assign(previous,metadata);else item.sourceReferences.push(metadata);
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
    if(!task.pendingEvidence?.length&&!task.pendingSourceEvaluation){
      if(task.sourcePlan.sourceCategory!=='web')return block('SOURCE_UNSUPPORTED','Research paused — This request cannot be safely researched.');
      if(!task.sourcePlan.available){const id=await digest(JSON.stringify([task.id,run,'capabilities'])),result=await requestResearchCapabilities({id,context:{},signal:controller.signal});if(!result.information.available)return block('INFORMATION_UNCONFIGURED','Research paused — Web information access is not configured.');task=await this.patch(task.id,run,item=>{item.sourcePlan.available=true;});}
    }
    let prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    if(task.pendingEvidence?.length){
      try{return await this.integrate(task,run,controller,prefs);}catch(error){throw Object.assign(clientResearchFailure(controller.signal.aborted||document.hidden?'INTEGRATION_PAUSED':'INTEGRATION_FAILED',{id:task.researchExecution.correlationId,mode:task.researchExecution.operation,phase:'INTEGRATION',received:true,validated:true,status:200,reason:controller.signal.reason}),{execution:task.serviceDiagnostic});}
    }
    let authorizedAt=Date.now(),observedAt=Date.now(),current=task,result;
    if(task.pendingSourceEvaluation){
      const saved=task.pendingSourceEvaluation,checkpoint=task.pendingSourceEvidence;
      authorizedAt=saved.authorizedAt;observedAt=saved.receivedAt;
      result={service:'mindling-reasoning-service',kind:'research-acquisition',acquisition:{...checkpoint.evidence,evaluation:saved.evaluation},execution:task.serviceDiagnostic,sourceCheckpoint:checkpoint};
      const mode=task.researchExecution.operation,id=task.researchExecution.correlationId;
      const context=mode==='research-acquire'?{request:task.sourcePlan.request,plan:task.plan}:{checkpoint};
      validateResearchReceipt(result,{id,mode,context});
    }else{
      const checkpoint=task.pendingSourceEvidence,remainingCalls=2-(task.sourceRequests||0);
      if(!checkpoint&&remainingCalls<1)throw Error('BUDGET_EXHAUSTED');
      const learning=researchLearningContext(task.sourcePlan.request.topic,this.app.state.mind,task.plan);
      const context=checkpoint?{checkpoint,learning}:{request:task.sourcePlan.request,queries:task.sourcePlan.queries,remainingCalls,plan:task.plan,learning};
      const id=await digest(JSON.stringify([task.id,run,checkpoint?'source-evaluation':'web-search',context]));
      current=await this.patch(task.id,run,item=>{
        const calls=checkpoint?1:2;if((item.modelCalls||0)+calls>LIMITS.inferenceCalls||(item.evaluationCalls||0)>=2)throw Error('BUDGET_EXHAUSTED');
        item.modelCalls=(item.modelCalls||0)+calls;item.evaluationCalls=(item.evaluationCalls||0)+1;
        if(!checkpoint){item.sourceRequests+=remainingCalls;item.researchExecution={version:1,reserved:remainingCalls,toolState:'RESERVED',clientDispatched:false,upstreamDispatched:null,completed:0,failed:0,outcomeUnknown:false};}
        item.researchExecution.correlationId=id;item.researchExecution.operation=checkpoint?'research-evaluate':'research-acquire';
        item.status=checkpoint?'EVALUATING':'RESEARCHING';item.code=checkpoint?'EVALUATING':'SEARCHING';item.message=checkpoint?'Evaluating the previously retrieved signed evidence; no new search.':'Researching public sources and comparing cited evidence.';
      });
      current=await this.patch(task.id,run,item=>{item.researchExecution.clientDispatched=true;if(!checkpoint)item.researchExecution.toolState='DISPATCHED';});
      result=await (checkpoint?requestResearchEvaluation:requestResearchAcquisition)({id,context,signal:controller.signal});
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
      pending.push({quote:claim.quote,quoteHash:await digest(claim.quote),sourceURL:source.url,sourceHash:source.hash,observedAt,validAt,category:claim.category,topic:claim.topic});
    }
    if(!acquired.evaluation.claims.length&&!rejections.length)rejections.push({code:acquired.sources.length?'NO_MODEL_CANDIDATES':'NO_CITED_PASSAGES'});
    try{current=await this.patch(task.id,run,item=>{
      if(terminal(item)||item.researchExecution?.correlationId!==result.execution.correlationId)throw clientFailure('STALE_RESEARCH_RESPONSE','EVIDENCE_PERSISTENCE');
      if(result.execution){item.serviceDiagnostic=result.execution;this.recordExecution(item,result.execution);}
      delete item.pendingSourceEvidence;delete item.pendingSourceEvaluation;
      item.evidenceDiagnostics={version:1,candidates:validation?.candidates??acquired.evaluation.claims.length,accepted:pending.length,rejections,extraction:acquired.diagnostics||null};
      item.totalBytes=(item.totalBytes||0)+acquired.bytes;item.status='EVALUATING';item.code='EVALUATING';item.message='Checking tool-cited research against canonical memory.';item.limitations=acquired.evaluation.limitations;item.nextQuestion=acquired.evaluation.nextQuestion;item.responseId=acquired.responseId;item.completedToolCalls=acquired.requests;
      if(pending.length)item.pendingEvidence=pending;else delete item.pendingEvidence;
      for(const source of acquired.sources){const metadata={url:source.url,title:source.title,provider:source.provider,domain:source.domain,publishedAt:null,type:source.type,status:source.status,hash:source.hash,...(source.passages?{passages:source.passages}:{excerpt:source.text}),authorizedAt,observedAt,serverRetrievedAt:source.observedAt,responseId:acquired.responseId};const existing=item.sourceReferences.find(ref=>ref.url===source.url);if(existing)Object.assign(existing,metadata);else item.sourceReferences.push(metadata);}
      if(acquired.requests)item.completedWork=[...new Set([...item.completedWork,'retrieval'])];
      if(acquired.sources.length)item.completedWork=[...new Set([...item.completedWork,'source','evidence'])];
    },{researchGrant:this.grant(prefs)});}catch(error){if(error.clientDiagnostic)throw error;throw clientFailure('EVIDENCE_PERSISTENCE_FAILED','EVIDENCE_PERSISTENCE');}
    if(!pending.length)return block('NO_EVIDENCE',`Research paused — Insufficient evidence. ${rejectionExplanation(rejections[0]?.code)} No research knowledge was saved.`);
    try{return await this.integrate(current,run,controller,prefs);}catch(error){if(error.clientDiagnostic)throw error;throw clientFailure(controller.signal.aborted||document.hidden?'INTEGRATION_PAUSED':'INTEGRATION_FAILED','INTEGRATION');}
  }
  recordExecution(task,diagnostic){
    const receipt=task.researchExecution;if(!receipt)return;
    receipt.upstreamDispatched=receipt.upstreamDispatched===true||diagnostic.searchDispatched;receipt.completed=diagnostic.completed;receipt.failed=diagnostic.failed;receipt.outcomeUnknown=diagnostic.outcomeUnknown;
    receipt.toolState=diagnostic.outcomeUnknown?'OUTCOME_UNKNOWN':diagnostic.completed>0?'COMPLETED':diagnostic.failed>0?'FAILED':diagnostic.searchDispatched?'FAILED':'RESERVED';
    task.completedToolCalls=diagnostic.completed;
    if(diagnostic.searchCompleted)task.completedWork=[...new Set([...task.completedWork,'retrieval'])];
  }
  async integrate(task,run,controller,prefs){
    prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    const evidence=task.pendingEvidence||[];for(const claim of evidence)if(await digest(claim.quote)!==claim.quoteHash)throw Error('Saved evidence changed.');
    if(!task.sourcePlan||!subjectMatches(task,task.sourcePlan.request.topic))throw Error('SUBJECT_MISMATCH');
    await this.patch(task.id,run,item=>{item.status='COMMITTING';item.code='INTEGRATING';item.message='Integrating accepted source-backed knowledge.';item.acceptedQuotes=evidence.map(item=>item.quoteHash);});
    const activity=activityFor(task.mode),grant=this.grant(prefs);
    await this.app.change(state=>{
      this.assertLive(task.mindlingId);if(controller.signal.aborted||state.mind?.id!==task.mindlingId||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===task.mindlingId))throw Error('Research was cancelled.');
      let next=structuredClone(state),current=writableTasks(next.mind).find(item=>item.id===task.id);if(!current||current.run!==run||current.status!=='COMMITTING')throw Error('Task authorization changed.');
      const knowledge=[],memoryRejections=[];let formed=0;
      for(const claim of evidence){
        if((next.mind.researchExclusions||[]).includes(claim.quoteHash)){memoryRejections.push({code:'EXCLUDED_BY_USER',quoteHash:claim.quoteHash});continue;}
        const id=`${task.id.slice(0,40)}:${claim.quoteHash.slice(0,40)}`,content=`Source observation (${new Date(claim.observedAt).toISOString()}) from ${claim.sourceURL}: ${claim.quote}`;
        const authorization={taskId:task.id,run,url:claim.sourceURL,sourceHash:claim.sourceHash,observedAt:claim.observedAt,validAt:claim.validAt,quote:claim.quote,quoteHash:claim.quoteHash,content,classification:{category:claim.category,topic:claim.topic}};
        validateResearchClaim(next,authorization);
        const relation=researchRelation(next.mind,claim),support=claimEvidence(claim,current);
        if(relation.kind==='support'){if(addSupportingEvidence(relation.target,support)==='capacity')memoryRejections.push({code:'SUPPORT_CAPACITY',quoteHash:claim.quoteHash});else knowledge.push(relation.target.id);continue;}
        if(relation.kind==='uncertain'){memoryRejections.push({code:'CANONICAL_DUPLICATE_OR_UNCERTAIN',quoteHash:claim.quoteHash});continue;}
        if(relation.kind==='conflict'){
          if(!relation.target){memoryRejections.push({code:'CANONICAL_CONFLICT',quoteHash:claim.quoteHash});continue;}
          try{retainConflict(relation.target,support);}catch{memoryRejections.push({code:'CONFLICT_CAPACITY',quoteHash:claim.quoteHash});continue;}
          if(current.timeSensitive||current.limitations?.length||!replacementAllowed(next.mind,relation.target,claim)){memoryRejections.push({code:'CANONICAL_CONFLICT',quoteHash:claim.quoteHash});continue;}
          authorization.supersedes=relation.target.id;
        }
        try{const candidate=learn(next,{id,text:claim.quote,mindId:task.mindlingId,activity:activity==='TALK'?'TEACH':activity,autonomous:authorization});if(candidate.mind.memories.some(memory=>memory.id===id)){next=candidate;
          if(authorization.supersedes)for(let i=memoryRejections.length-1;i>=0;i--)if(memoryRejections[i].code==='CANONICAL_CONFLICT'&&memoryRejections[i].quoteHash===claim.quoteHash)memoryRejections.splice(i,1);
          knowledge.push(id);formed++;}else memoryRejections.push({code:'CANONICAL_DUPLICATE_OR_UNCERTAIN',quoteHash:claim.quoteHash});}catch(error){memoryRejections.push({code:canonicalRejection(error),quoteHash:claim.quoteHash});}
      }
      current=writableTasks(next.mind).find(item=>item.id===task.id);
      if(formed&&!current.autonomous&&!current.energyCharged){if(activity==='TALK'||next.mind.processed.includes(current.requestId))throw Error('The original activity charge is unavailable.');next.mind.energy=spendEnergy(energyAt(next.mind.energy,next.now),LIFE_RULES.activity[activity].energyCost,next.now);stimulatePreviewLife(next.mind.life,activity,next.now);next.mind.processed.push(current.requestId);current.energyCharged=true;}
      // Directly requested Teach/Deep research has the same one-activity
      // activity reward as supplied teaching. Background research remains 0 XP.
      if(formed&&current.autonomous===false&&activity!=='TALK'&&!current.learningRewarded&&!next.mind.history.some(e=>e.requestId===current.requestId&&e.xp>0)){
        const award=activityReward(activity),day=Math.floor(next.now/86400000),earned=next.mind.history.filter(e=>e.day===day).reduce((sum,e)=>sum+e.xp,0);
        if(earned+award>XP.daily)throw Error('Daily XP limit reached.');
        const event=next.mind.history.find(e=>e.taskId===current.id&&e.memoryIds===undefined&&e.kind==='research'&&knowledge.includes(e.id));
        if(!event)throw Error('Committed learning reward event is unavailable.');
        event.xp=award;event.activity=activity;event.requestId=current.requestId;event.rewardBasis='user-directed-learning';
        next.mind.stageXP+=award;next.mind.lifetimeXP+=award;next.mind.milestones.push(event.concept);current.learningRewarded=true;
      }
      current.memoryRejections=memoryRejections;
      current.knowledgeIds=[...new Set(knowledge)];delete current.pendingEvidence;delete current.acceptedQuotes;current.updatedAt=Math.max(current.createdAt,Date.now());
      if(knowledge.length){current.completedWork=[...new Set([...current.completedWork,'knowledge','answer'])];current.status='COMPLETED';current.code='SOURCE_BACKED';current.message=`Research completed: ${formed} new source-attributed ${formed===1?'memory':'memories'} retained. This is bounded evidence, not complete topic coverage or independent verification.`;}else{current.status='BLOCKED';current.code='NO_EVIDENCE';current.message=`Research paused — Insufficient evidence. ${rejectionExplanation(memoryRejections[0]?.code)} Existing knowledge was preserved.`;}
      recordTaskActivity({status:'COMMITTING',semanticWork:current.semanticWork},current,current.updatedAt);
      if(!validTask(current,task.mindlingId))throw Error('Research completion was invalid.');return next;
    },{preserveGameplay:true,researchGrant:grant,...(activity==='TALK'||task.autonomous?{}:{journal:{id:`research:${task.id}:${run}`,type:activity}})});
    const completed=tasksFor(this.app.state.mind).find(item=>item.id===task.id);this.notify(completed);this.recover();if(completed.knowledgeIds.length){const memory=this.app.state.mind.memories.find(item=>item.id===completed.knowledgeIds[0]);if(memory)this.app.seed?.highlightRoute?.({neuronIds:memory.neuronIds||[],synapseIds:memory.synapseIds||[]});this.app.events?.emit(EVENTS.NEURAL_INPUT,{id:task.id,phase:'accepted',activity:activityFor(task.mode),autonomous:!!task.autonomous});}return completed;
  }
  reply(task){
    const sv=/[åäö]|\b(?:vilket|sverige|lär)\b/iu.test(task.objective),completed=task.status==='COMPLETED';
    const memories=completed?task.knowledgeIds.map(id=>this.app.state.mind.memories.find(memory=>memory.id===id&&!memory.supersededBy&&memory.intelligence?.current!==false)).filter(Boolean):[];
    const sources=task.sourceReferences.filter(source=>memories.some(memory=>memory.research?.sourceURL===source.url||memory.researchSupport?.some(e=>e.taskId===task.id&&e.sourceURL===source.url))).map(({url,title,publishedAt})=>({url,title:title||url,publishedAt}));
    const quotes=memories.map(memory=>{const position=memory.content.indexOf(': ',memory.content.indexOf(' from '));return position>=0?memory.content.slice(position+2):memory.content;});
    const found=task.sourceReferences.some(source=>source.hash),unsupported=task.code==='SOURCE_UNSUPPORTED',active=['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status);
    const paused=task.code==='CLARIFICATION_UNAVAILABLE'?(sv?'Jag kan inte säkert avgränsa frågan med de tillgängliga alternativen. Ingen ytterligare sökning har startats.':'I can’t safely resolve the remaining ambiguity with the available choices. No further search was started.'):task.code==='SUBJECT_MISMATCH'?(sv?'Det sparade sökämnet stämmer inte med din ursprungliga fråga. Jag har pausat uppgiften utan att ändra dina minnen.':'The saved search subject does not match your original request. I paused the task without changing your memories.'):unsupported?(sv?'Jag kan inte verifiera den här frågan med de tillgängliga källorna.':'I can’t verify this question with the available sources.'):found?(sv?'Jag hittade källor, men kunde inte säkert behålla ytterligare kunskap från dem. Dina befintliga minnen är oförändrade.':'I found sources, but couldn’t safely retain additional knowledge from them. Your existing memories are unchanged.'):active?(sv?'Jag undersöker vilket underlag som finns för din fråga.':'I’m checking the available evidence for your request.'):(sv?'Jag förstår vad du vill lära dig, men kan inte hämta tillräckligt tillförlitliga källor just nu. Forskningsuppgiften är pausad.':'I understand what you want to learn, but I can’t retrieve reliable supporting sources right now. The research task is paused.');
    const answer=completed?(sv?'Här är vad jag kunde behålla från de källstödda sökresultaten:':'Here is what I could retain from the source-supported search report:')+'\n\n'+quotes.join('\n\n'):task.code==='NO_EVIDENCE'?paused+' '+(sv?'Källornas underlag eller aktualitet räckte inte för att spara ett nytt påstående.':'The source evidence or its date did not establish a supported new claim. See the learning task for details.'):paused;
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
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||this.active||this.draining)return this.schedule();
    const prefs=await this.loadPermissions(true);if(!prefs.enabled)return;
    const now=Date.now(),tasks=tasksFor(this.app.state.mind);
    const energyWaiting=tasks.find(task=>task.autonomous&&task.code==='ENERGY_LOW');if(energyWaiting&&energyAt(this.app.state.mind.energy,now).remaining>=2){this.startIfAuthorized(energyWaiting);return;}
    const retry=tasks.find(task=>task.engineVersion===4&&!terminal(task)&&retryableServiceFailure(task)&&(task.retryAt||0)<=now&&canRetryResearch(task));
    if(retry){const next=await this.patch(retry.id,null,item=>{if(!item.pendingSourceEvaluation&&!item.pendingEvidence?.length)item.attempts++;item.code='QUEUED';});this.startIfAuthorized(next);return;}
    const topic=nextOpportunity(this.app.state.mind,now,prefs);
    if(topic){const interpretation=understandInput(`Learn about ${topic}`,'TEACH');if(!interpretation.clarification){const task=await this.prepare(interpretation,`autonomous:${crypto.randomUUID()}`,{autonomous:true});this.startIfAuthorized(task);return;}}
    this.schedule();
  }
  get status(){return autonomousStatus(this);}
  get diagnostics(){return autonomousDiagnostics(this);}
  destroy(){clearTimeout(this.wakeTimer);this.disposed=true;this.active?.controller.abort('DISPOSED');this.abort.abort();this.queue.clear();}
}
