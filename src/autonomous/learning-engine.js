import { AUTONOMY, dayKey, nextOpportunity, autonomousStatus, autonomousDiagnostics } from './autonomous-schedule.js';
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
import { INFORMATION_CAPABILITY, publicResearchTopic } from './research-contract.js';
import { requestResearchPlanning, requestResearchAcquisition, requestResearchCapabilities } from '../cognition/reasoning-client.js';
import { beginClarification, cancelTaskClarification } from '../learning/clarification.js';

const engines=new WeakMap();
export function learningEngine(app){let engine=engines.get(app);if(!engine){engine=new AutonomousLearningEngine(app);engines.set(app,engine);}return engine;}
export function stopLearning(app){engines.get(app)?.destroy();}
export function learningSession(app){return engines.get(app)?.session||null;}
export function researchPermissions(app){return engines.get(app)?.preferences||defaultPermissions(app.state?.mind?.id||'');}
export function syncResearchPermissions(app){const engine=learningEngine(app),id=app.state?.mind?.id;if(id&&engine.permissionIdentity!==id)engine.loadPermissions().then(()=>{if(!app.disposed&&app.state.mind?.id===id){app.renderState();engine.recover();}}).catch(()=>{});}
const activityFor=mode=>mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';

export class AutonomousLearningEngine {
  constructor(app){
    this.app=app;this.abort=new AbortController();this.session=crypto.randomUUID();this.followers=new Map();this.queue=new Set();this.reviewedTopics=new Map();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.active?.controller.abort();else this.recover();},{signal:this.abort.signal});
    window.addEventListener('pagehide',()=>this.active?.controller.abort(),{signal:this.abort.signal});
    window.addEventListener('offline',()=>this.active?.controller.abort(),{signal:this.abort.signal});
    window.addEventListener('online',()=>this.recover(),{signal:this.abort.signal});
  }
  async loadPermissions(fresh=false){
    const id=this.app.state?.mind?.id;if(!id)return defaultPermissions('');
    if(!fresh&&this.permissionIdentity===id)return this.permissionLoading||this.preferences;
    if(this.permissionIdentity!==id){this.active?.controller.abort();this.preferences=defaultPermissions(id);this.queue.clear();this.reviewedTopics.clear();}this.permissionIdentity=id;
    const loading=(this.app.db||this.app.store).researchPermissions(id).then(value=>{if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');const checked=validatePermissions(value,id);if(checked.revision>=this.preferences.revision)this.preferences=checked;return this.preferences;}).finally(()=>{if(this.permissionLoading===loading)this.permissionLoading=null;});
    this.permissionLoading=loading;return loading;
  }
  assertLive(identity){
    this.app.external?.assertWritable();const mind=this.app.state?.mind;
    if(this.disposed||this.app.disposed||document.hidden||!mind||mind.id!==identity||mind.life.lifeState!=='ALIVE')throw Error('Research is paused. A matching living Mindling and a visible page are required.');return mind;
  }
  requestId(task){return this.followers.get(task.id)||task.requestId;}
  notify(task){this.app.dashboard?.showResearchResult(task,this.requestId(task),this.reply(task));}
  async setAccess(enabled){
    this.app.external?.assertWritable();const id=this.app.state.mind?.id;if(!id||this.disposed)throw Error('Mindling unavailable.');
    this.active?.controller.abort();clearTimeout(this.wakeTimer);const prefs=await (this.app.db||this.app.store).saveResearchPermissions(id,{enabled});
    if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');this.preferences=validatePermissions(prefs,id);this.permissionIdentity=id;this.app.renderState();
    if(enabled)this.recover();return prefs;
  }
  recover(){
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||!this.preferences?.enabled)return;
    for(const task of tasksFor(this.app.state.mind)){const interrupted=task.session!==this.session&&['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status),aborted=this.active?.id===task.id&&this.active.controller.signal.aborted;if(task.engineVersion===4&&!terminal(task)&&(['PERMISSION_REQUIRED','ACCESS_DISABLED','INTERRUPTED','QUEUED','OFFLINE'].includes(task.code)||interrupted||aborted))this.startIfAuthorized(task);}
    this.schedule();
  }
  startIfAuthorized(task){
    if(!task||terminal(task)||task.engineVersion!==4||['CLARIFICATION','MODEL_CLARIFICATION','SOURCE_UNSUPPORTED','QUERY_REVIEW','BUDGET_EXHAUSTED','NO_EVIDENCE','INFORMATION_UNCONFIGURED','INFORMATION_UNSUPPORTED','INFORMATION_UNAUTHORIZED'].includes(task.code)||this.disposed)return;
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
          if(!prefs.decided&&!task.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(task)))this.app.dashboard.showResearchAccess(task,this.requestId(task),publicResearchTopic(task));
          else{const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ACCESS_DISABLED';item.message='Autonomous learning is disabled. You can enable it in Settings.';});this.notify(blocked);}continue;
        }
        const topic=this.reviewedTopics.get(id)||task.sourcePlan?.request?.topic||publicResearchTopic(task);
        if(topic===null){const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='QUERY_REVIEW';item.message='Review a short public topic before sharing a potentially sensitive request with Mindling planning.';});if(!task.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(task)))this.app.dashboard.showResearchAccess(blocked,this.requestId(task),null);continue;}
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
        const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===id);Object.assign(target,{engineVersion:4,queryKey,originalText:task.originalText,objective:task.objective,topic:task.topic,scope:task.scope,interpretationAnswers:task.interpretationAnswers,timeSensitive:task.timeSensitive,code:task.code,message:task.message,run:crypto.randomUUID(),clarificationRounds:(target.clarificationRounds||0)+1,updatedAt:Math.max(target.createdAt,now)});delete target.coordinatorClarification;delete target.sourcePlan;return next;
      }
      if(tasks.filter(item=>!terminal(item)).length>=LIMITS.unfinished)throw Error('Cancel an unfinished task before starting another.');
      const next=structuredClone(state),retained=tasks.slice();while(retained.length>=LIMITS.tasks){const index=retained.findIndex(terminal);if(index<0)throw Error('Research task history is full.');retained.splice(index,1);}
      if(autonomous){const ledger=next.mind.autonomousLearning||{},day=dayKey(now),started=ledger.day===day?ledger.started||0:0;if(started>=AUTONOMY.dailyTasks||ledger.nextAt>now)throw Error('Autonomous daily budget or cooldown reached.');next.mind.autonomousLearning={day,started:started+1,nextAt:now+AUTONOMY.cooldown};}
      if(!validTask(task,identity))throw Error('The research request could not be validated.');next.mind.learningTasks=[...retained,task];return next;
    },{preserveGameplay:true});
    return tasksFor(this.app.state.mind).find(item=>item.id===id||!taskId&&(item.queryKey||item.id)===queryKey);
  }
  async patch(id,run,change,options={}){
    const identity=this.app.state.mind?.id;
    await this.app.change(state=>{if(this.disposed||this.app.disposed||state.mind?.id!==identity)throw Error('Research was closed or identity changed.');const next=structuredClone(state),task=writableTasks(next.mind).find(item=>item.id===id);if(!task||run&&task.run!==run)throw Error('This task changed.');change(task,next);task.updatedAt=Math.max(task.createdAt,Date.now());if(!validTask(task,identity))throw Error('Research task update was invalid.');return next;},{preserveGameplay:true,...options});
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
    if(action==='cancel'){cancelTaskClarification(this.app,id);this.queue.delete(id);this.reviewedTopics.delete(id);if(this.active?.id===id)this.active.controller.abort();return this.patch(id,null,item=>{if(terminal(item))return;item.run=crypto.randomUUID();item.status='CANCELLED';item.code='CANCELLED';item.message='Research cancelled. Existing knowledge was preserved.';});}
    if(terminal(task))throw Error('This task has finished.');
    if(task.engineVersion!==4&&action!=='consent')throw Error('This historical task is preserved. Submit the topic again to use autonomous web research.');
    if(action==='consent'){
      if(typeof payload.enabled!=='boolean')throw Error('Choose whether to allow this capability.');
      if(payload.enabled){const topic=publicResearchTopic(task,payload.topic??null);if(topic===null)throw Error('Review a short public topic first.');this.reviewedTopics.set(id,topic);}
      if(!this.preferences?.enabled||!payload.enabled)await this.setAccess(payload.enabled);
      if(payload.enabled){this.startIfAuthorized(task);return {accepted:true,message:'Mindling planning continues automatically.'};}return {accepted:true,message:'Mindling planning remains disabled.'};
    }
    if(!['retry','continue'].includes(action))throw Error('Unknown research action.');
    if(task.attempts>=LIMITS.attempts)throw Error('This task reached its bounded attempt limit.');
    if(!(await this.loadPermissions(true)).enabled)throw Error('Allow Mindling planning in Settings before continuing this historical or interrupted task.');
    const next=await this.patch(id,null,item=>{if(item.engineVersion===2&&item.planningCalls===undefined){item.planningCalls=Math.min(item.attempts,2);item.modelCalls=item.planningCalls;}item.attempts++;item.engineVersion=4;item.code='QUEUED';item.status='BLOCKED';item.message='Mindling planning queued under current authorization.';});this.startIfAuthorized(next);return next;
  }
  context(task,topic){const scope=task.scope||{};return {...(task.autonomous?{autonomous:true}:{}),topic,mode:task.mode,freshness:task.timeSensitive,scope:{criterion:scope.metric||null,geography:scope.regions||[scope.region].filter(Boolean),geographyMode:scope.regionMode||null,period:scope.period||null,quantity:Number.isSafeInteger(scope.count)&&scope.count>0?scope.count:null}};}
  grant(prefs){return {mindlingId:this.app.state.mind.id,capability:INFORMATION_CAPABILITY,revision:prefs.revision};}
  async requested(task,interpretation){
    if(task.engineVersion!==4)return this.patch(task.id,null,item=>{item.planningCalls=item.engineVersion===2?Math.min(item.attempts,2):0;item.modelCalls=item.planningCalls;item.engineVersion=4;item.code='PERMISSION_REQUIRED';item.originalText=interpretation.normalizedText;item.message='Preparing Mindling research under current authorization.';});return task;
  }
  async run(task,topic){
    if(this.active)return;this.assertLive(task.mindlingId);
    const controller=new AbortController(),run=crypto.randomUUID();this.active={id:task.id,controller};const deadline=setTimeout(()=>controller.abort(),120000);
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
          if(question&&!(item.clarificationRounds>=1)&&item.modelCalls<LIMITS.inferenceCalls){item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:question.question,options:question.options,freeText:question.options.length===0};item.code='MODEL_CLARIFICATION';item.message=question.question;}
          else{item.sourcePlan={request:context,queries:result.planning.queries,sourceCategory:result.planning.sourceCategory,available:result.information?.available===true};item.code='QUEUED';item.message='Mindling has prepared a bounded source search.';}
        },{researchGrant:this.grant(prefs)});
        if(current.code==='MODEL_CLARIFICATION'){if(!current.autonomous&&this.app.dashboard?.canContinueResearch(this.requestId(current)))this.app.dashboard.showClarification(this.clarification(current).talkResponse);return;}
      }
      await this.sources(current,run,controller);
    }catch(error){try{
      const code=navigator.onLine===false?'OFFLINE':error.name==='AbortError'?'INTERRUPTED':/^(?:INFORMATION_[A-Z_]+|RATE_LIMITED|BUDGET_EXHAUSTED)$/.test(error.code||error.message)?error.code||error.message:'PLANNING_UNAVAILABLE';
      const blocked=await this.patch(task.id,run,item=>{if(terminal(item))return;item.lastFailurePhase=item.code==='PLANNING'?'PLANNING':item.status;item.status='BLOCKED';item.code=code;item.lastFailureCode=code;item.retryAt=Date.now()+AUTONOMY.retryDelay*Math.max(1,item.attempts);item.message=code==='OFFLINE'?'Research paused — Offline.':code==='INTERRUPTED'?'Research paused. Completed work is saved.':code==='INFORMATION_UNCONFIGURED'?'Research paused — Web information access is not configured.':code==='RATE_LIMITED'?'Research paused — Service rate limit. A bounded retry is scheduled.':'Research paused. Reliable supporting information could not be acquired within the service and research limits.';});this.notify(blocked);
    }catch{/* A newer run, cancellation or identity owns the task. */}}
    finally{clearTimeout(deadline);this.reviewedTopics.delete(task.id);if(this.active?.controller===controller)this.active=null;if(!this.disposed&&!this.app.disposed)this.app.renderState();this.schedule();}
  }
  async sources(task,run,controller){
    const block=async(code,message)=>{const stopped=await this.patch(task.id,run,item=>{item.status='BLOCKED';item.code=code;item.message=message;});this.notify(stopped);return stopped;};
    if(!task.pendingEvidence?.length){
      if(task.sourcePlan.sourceCategory!=='web')return block('SOURCE_UNSUPPORTED','Research paused — This request cannot be safely researched.');
      if(!task.sourcePlan.available){const id=await digest(JSON.stringify([task.id,run,'capabilities'])),result=await requestResearchCapabilities({id,context:{},signal:controller.signal});if(!result.information.available)return block('INFORMATION_UNCONFIGURED','Research paused — Web information access is not configured.');task=await this.patch(task.id,run,item=>{item.sourcePlan.available=true;});}
    }
    let prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    if(task.pendingEvidence?.length)return this.integrate(task,run,controller,prefs);
    const authorizedAt=Date.now(),remainingCalls=2-(task.sourceRequests||0);if(remainingCalls<1)throw Error('BUDGET_EXHAUSTED');
    // Reserve the whole hosted-tool budget before sending: unknown/aborted remote
    // work is never refunded, which prevents reload/cancellation cost loops.
    let current=await this.patch(task.id,run,item=>{if((item.modelCalls||0)+2>LIMITS.inferenceCalls)throw Error('BUDGET_EXHAUSTED');item.modelCalls=(item.modelCalls||0)+2;item.evaluationCalls=(item.evaluationCalls||0)+1;item.sourceRequests+=remainingCalls;item.status='RESEARCHING';item.code='SEARCHING';item.message='Researching public sources and comparing cited evidence.';});
    const context={request:current.sourcePlan.request,queries:current.sourcePlan.queries,remainingCalls,plan:current.plan},id=await digest(JSON.stringify([task.id,run,'web-search',context]));
    const result=await requestResearchAcquisition({id,context,signal:controller.signal});this.assertLive(task.mindlingId);if(controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    const acquired=result.acquisition,observedAt=Date.now(),pending=[],rejections=[];
    for(const source of acquired.sources)if(await digest(source.text)!==source.hash)throw Error('Source evidence hash did not match.');
    for(const claim of acquired.evaluation.claims){
      const source=acquired.sources.find(item=>item.id===claim.sourceId),reason=evidenceRejection(claim,source,task,observedAt);
      if(reason){rejections.push({sourceId:claim.sourceId,code:reason});continue;}
      const validAt=claim.validAt===null?null:Date.parse(claim.validAt+'T00:00:00Z');
      pending.push({quote:claim.quote,quoteHash:await digest(claim.quote),sourceURL:source.url,sourceHash:source.hash,observedAt,validAt,category:claim.category,topic:claim.topic});
    }
    if(!acquired.evaluation.claims.length)rejections.push({code:acquired.sources.length?'NO_MODEL_CANDIDATES':'NO_CITED_PASSAGES'});
    current=await this.patch(task.id,run,item=>{
      item.evidenceDiagnostics={version:1,candidates:acquired.evaluation.claims.length,accepted:pending.length,rejections,extraction:acquired.diagnostics||null};
      item.totalBytes=(item.totalBytes||0)+acquired.bytes;item.status='EVALUATING';item.code='EVALUATING';item.message='Checking tool-cited research against canonical memory.';item.limitations=acquired.evaluation.limitations;item.nextQuestion=acquired.evaluation.nextQuestion;item.responseId=acquired.responseId;item.completedToolCalls=acquired.requests;
      if(pending.length)item.pendingEvidence=pending;else delete item.pendingEvidence;
      for(const source of acquired.sources)item.sourceReferences.push({url:source.url,title:source.title,provider:source.provider,domain:source.domain,publishedAt:null,type:source.type,status:source.status,hash:source.hash,excerpt:source.text,...(source.passages?{passages:source.passages}:{}),authorizedAt,observedAt,serverRetrievedAt:source.observedAt,responseId:acquired.responseId});
      if(acquired.requests)item.completedWork=[...new Set([...item.completedWork,'retrieval'])];
      if(acquired.sources.length)item.completedWork=[...new Set([...item.completedWork,'source','evidence'])];
    },{researchGrant:this.grant(prefs)});
    if(!pending.length)return block('NO_EVIDENCE',`Research paused — Insufficient evidence. ${rejectionExplanation(rejections[0]?.code)} No research knowledge was saved.`);
    return this.integrate(current,run,controller,prefs);
  }
  async integrate(task,run,controller,prefs){
    prefs=await this.loadPermissions(true);if(!prefs.enabled||controller.signal.aborted)throw new DOMException('Research cancelled.','AbortError');
    const evidence=task.pendingEvidence||[];for(const claim of evidence)if(await digest(claim.quote)!==claim.quoteHash)throw Error('Saved evidence changed.');
    await this.patch(task.id,run,item=>{item.status='COMMITTING';item.code='INTEGRATING';item.message='Integrating accepted source-backed knowledge.';item.acceptedQuotes=evidence.map(item=>item.quoteHash);});
    const activity=activityFor(task.mode),grant=this.grant(prefs);
    await this.app.change(state=>{
      this.assertLive(task.mindlingId);if(controller.signal.aborted||state.mind?.id!==task.mindlingId||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===task.mindlingId))throw Error('Research was cancelled.');
      let next=structuredClone(state),current=writableTasks(next.mind).find(item=>item.id===task.id);if(!current||current.run!==run||current.status!=='COMMITTING')throw Error('Task authorization changed.');
      const knowledge=[],memoryRejections=[];let formed=0;
      for(const claim of evidence){
        if((next.mind.researchExclusions||[]).includes(claim.quoteHash)){memoryRejections.push({code:'EXCLUDED_BY_USER',quoteHash:claim.quoteHash});continue;}
        const duplicate=next.mind.memories.find(memory=>!memory.supersededBy&&memory.intelligence?.current!==false&&memory.kind!=='historical'&&memory.intelligence?.kind!=='historical'&&memory.research?.quoteHash===claim.quoteHash);if(duplicate){knowledge.push(duplicate.id);continue;}
        const id=`${task.id.slice(0,40)}:${claim.quoteHash.slice(0,40)}`,content=`Source observation (${new Date(claim.observedAt).toISOString()}) from ${claim.sourceURL}: ${claim.quote}`;
        const authorization={taskId:task.id,run,url:claim.sourceURL,sourceHash:claim.sourceHash,observedAt:claim.observedAt,validAt:claim.validAt,quote:claim.quote,quoteHash:claim.quoteHash,content,classification:{category:claim.category,topic:claim.topic}};
        try{const candidate=learn(next,{id,text:claim.quote,mindId:task.mindlingId,activity:activity==='TALK'?'TEACH':activity,autonomous:authorization});if(candidate.mind.memories.some(memory=>memory.id===id)){next=candidate;knowledge.push(id);formed++;}else memoryRejections.push({code:'CANONICAL_DUPLICATE_OR_UNCERTAIN',quoteHash:claim.quoteHash});}catch(error){memoryRejections.push({code:canonicalRejection(error),quoteHash:claim.quoteHash});}
      }
      current=writableTasks(next.mind).find(item=>item.id===task.id);
      if(formed&&!current.autonomous&&!current.energyCharged){if(activity==='TALK'||next.mind.processed.includes(current.requestId))throw Error('The original activity charge is unavailable.');next.mind.energy=spendEnergy(energyAt(next.mind.energy,next.now),LIFE_RULES.activity[activity].energyCost,next.now);stimulatePreviewLife(next.mind.life,activity,next.now);next.mind.processed.push(current.requestId);current.energyCharged=true;}
      current.memoryRejections=memoryRejections;
      current.knowledgeIds=[...new Set(knowledge)];delete current.pendingEvidence;delete current.acceptedQuotes;current.updatedAt=Math.max(current.createdAt,Date.now());
      if(knowledge.length){current.completedWork=[...new Set([...current.completedWork,'knowledge','answer'])];current.status='COMPLETED';current.code='SOURCE_BACKED';current.message=`Research completed: ${formed} new source-attributed ${formed===1?'memory':'memories'} retained. This is bounded evidence, not complete topic coverage or independent verification.`;}else{current.status='BLOCKED';current.code='NO_EVIDENCE';current.message=`Research paused — Insufficient evidence. ${rejectionExplanation(memoryRejections[0]?.code)} Existing knowledge was preserved.`;}
      if(!validTask(current,task.mindlingId))throw Error('Research completion was invalid.');return next;
    },{preserveGameplay:true,researchGrant:grant,...(activity==='TALK'||task.autonomous?{}:{journal:{id:`research:${task.id}:${run}`,type:activity}})});
    const completed=tasksFor(this.app.state.mind).find(item=>item.id===task.id);this.notify(completed);if(completed.knowledgeIds.length){const memory=this.app.state.mind.memories.find(item=>item.id===completed.knowledgeIds[0]);if(memory)this.app.seed?.highlightRoute?.({neuronIds:memory.neuronIds||[],synapseIds:memory.synapseIds||[]});this.app.events?.emit(EVENTS.NEURAL_INPUT,{id:task.id,phase:'accepted',activity:'TEACH'});}return completed;
  }
  reply(task){
    const sv=/[åäö]|\b(?:vilket|sverige|lär)\b/iu.test(task.objective),completed=task.status==='COMPLETED';
    const memories=completed?task.knowledgeIds.map(id=>this.app.state.mind.memories.find(memory=>memory.id===id&&!memory.supersededBy&&memory.intelligence?.current!==false)).filter(Boolean):[];
    const sources=task.sourceReferences.filter(source=>memories.some(memory=>memory.research?.sourceURL===source.url)).map(({url,title,publishedAt})=>({url,title:title||url,publishedAt}));
    const quotes=memories.map(memory=>{const position=memory.content.indexOf(': ',memory.content.indexOf(' from '));return position>=0?memory.content.slice(position+2):memory.content;});
    const found=task.sourceReferences.some(source=>source.hash),unsupported=task.code==='SOURCE_UNSUPPORTED',active=['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status);
    const paused=unsupported?(sv?'Jag kan inte verifiera den här frågan med de tillgängliga källorna.':'I can’t verify this question with the available sources.'):found?(sv?'Jag hittade källor, men kunde inte säkert behålla ytterligare kunskap från dem. Dina befintliga minnen är oförändrade.':'I found sources, but couldn’t safely retain additional knowledge from them. Your existing memories are unchanged.'):active?(sv?'Jag undersöker vilket underlag som finns för din fråga.':'I’m checking the available evidence for your request.'):(sv?'Jag förstår vad du vill lära dig, men kan inte hämta tillräckligt tillförlitliga källor just nu. Forskningsuppgiften är pausad.':'I understand what you want to learn, but I can’t retrieve reliable supporting sources right now. The research task is paused.');
    const answer=completed?(sv?'Här är vad jag kunde behålla från de källstödda sökresultaten:':'Here is what I could retain from the source-supported search report:')+'\n\n'+quotes.join('\n\n'):task.code==='NO_EVIDENCE'?paused+' '+(sv?'Källornas underlag eller aktualitet räckte inte för att spara ett nytt påstående.':'The source evidence or its date did not establish a supported new claim. See the learning task for details.'):paused;
    return {answer,memoryIds:memories.map(memory=>memory.id),sources,uncertainty:completed?'medium':'high',insufficientInformation:!completed||!memories.length,researchTaskId:task.id};
  }
  follow(task,requestId){this.followers.set(task.id,requestId);if(this.followers.size>LIMITS.tasks)this.followers.delete(this.followers.keys().next().value);}
  async manageKnowledge(task,action,{memoryId,text}={}){
    const id=crypto.randomUUID(),identity=task.mindlingId;
    if(action==='correct-memory'&&(typeof text!=='string'||!text.trim()||text.length>2000))throw Error('Enter a readable correction of at most 2,000 characters.');
    await this.app.change(state=>{
      this.assertLive(identity);const next=structuredClone(state),memory=next.mind.memories.find(memory=>memory.id===memoryId&&memory.research?.taskId===task.id);
      if(!memory||memory.supersededBy||memory.intelligence?.current===false)throw Error('This retained research memory changed.');
      if(memory.research?.quoteHash)next.mind.researchExclusions=[...new Set([...(next.mind.researchExclusions||[]),memory.research.quoteHash])].slice(-1000);
      if(action==='forget-memory'){
        next.mind.memories=next.mind.memories.filter(item=>item.id!==memoryId);
        for(const item of next.mind.memories)item.relatedMemoryIds=(item.relatedMemoryIds||[]).filter(key=>key!==memoryId);
        for(const saved of next.mind.learningTasks||[])saved.knowledgeIds=saved.knowledgeIds.filter(key=>key!==memoryId);
        return next;
      }
      // Manual corrections use the existing Teach reducer/costs. They are player
      // claims, never relabelled as statements from the original web source.
      memory.intelligence={...memory.intelligence,current:false};memory.supersededBy=id;
      const corrected=learn(next,{id,text:text.trim(),mindId:identity,activity:'TEACH'}),replacement=corrected.mind.memories.find(item=>item.id===id);
      if(!replacement)throw Error('The correction was not accepted as distinct canonical knowledge.');
      replacement.correctsMemoryId=memoryId;replacement.relatedMemoryIds=[...new Set([...(replacement.relatedMemoryIds||[]),memoryId])];return corrected;
    },{preserveGameplay:true});
    return {accepted:true,message:action==='forget-memory'?'Research memory removed from current knowledge. Historical task/source records are retained.':'Correction saved as a user-provided claim using normal Teach costs; the original is historical.'};
  }
  schedule(){
    clearTimeout(this.wakeTimer);if(this.disposed||this.app.disposed||!this.preferences?.enabled||document.hidden)return;
    this.wakeTimer=setTimeout(()=>this.tick().catch(()=>this.schedule()),AUTONOMY.retryDelay);
  }
  async tick(){
    if(this.disposed||this.app.disposed||document.hidden||navigator.onLine===false||this.active||this.draining)return this.schedule();
    const prefs=await this.loadPermissions(true);if(!prefs.enabled)return;
    const now=Date.now(),tasks=tasksFor(this.app.state.mind);
    const retry=tasks.find(task=>task.engineVersion===4&&!terminal(task)&&['INTERRUPTED','OFFLINE','RATE_LIMITED','PLANNING_UNAVAILABLE'].includes(task.code)&&(task.retryAt||0)<=now&&task.attempts<LIMITS.attempts&&((task.modelCalls||0)<LIMITS.inferenceCalls||task.pendingEvidence?.length));
    if(retry){const next=await this.patch(retry.id,null,item=>{item.attempts++;item.code='QUEUED';});this.startIfAuthorized(next);return;}
    const topic=nextOpportunity(this.app.state.mind,now);
    if(topic){const interpretation=understandInput(`Learn about ${topic}`,'TEACH');if(!interpretation.clarification){const task=await this.prepare(interpretation,`autonomous:${crypto.randomUUID()}`,{autonomous:true});this.startIfAuthorized(task);return;}}
    this.schedule();
  }
  get status(){return autonomousStatus(this);}
  get diagnostics(){return autonomousDiagnostics(this);}
  destroy(){clearTimeout(this.wakeTimer);this.disposed=true;this.active?.controller.abort();this.abort.abort();this.queue.clear();this.reviewedTopics.clear();}
}
