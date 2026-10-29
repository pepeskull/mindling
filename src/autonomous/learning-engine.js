import { understandInput, knowledgeGap, LEARNING_MODES } from '../learning/input-understanding.js';
import { trainingContext } from '../training/retrieval.js';
import { energyAt } from '../economy/energy.js';
import { LIFE_RULES } from '../life/life-system.js';
import { LIMITS, validTask, writableTasks, tasksFor, terminal, digest } from './tasks.js';
import { defaultPermissions, validatePermissions } from './research-permissions.js';
import { RESEARCH_CAPABILITY, publicResearchTopic } from './research-contract.js';
import { requestResearchPlanning } from '../cognition/reasoning-client.js';
import { beginClarification, cancelTaskClarification } from '../learning/clarification.js';

const engines=new WeakMap();
export function learningEngine(app){let engine=engines.get(app);if(!engine){engine=new AutonomousLearningEngine(app);engines.set(app,engine);}return engine;}
export function stopLearning(app){engines.get(app)?.destroy();}
export function learningSession(app){return engines.get(app)?.session||null;}
export function researchPermissions(app){return engines.get(app)?.preferences||defaultPermissions(app.state?.mind?.id||'');}
export function syncResearchPermissions(app){const engine=learningEngine(app),id=app.state?.mind?.id;if(id&&engine.permissionIdentity!==id)engine.loadPermissions().then(()=>{if(!app.disposed&&app.state.mind?.id===id){app.renderState();engine.recover();}}).catch(()=>{});}
const activityFor=mode=>mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';
const unavailable='Mindling can prepare a research plan, but its connected AI integration has no web search or source-retrieval tools. No external evidence was retrieved and no research knowledge was saved.';
const legacyMessage='Historical research task. The former source-access workflow is no longer available. Saved sources and accepted knowledge are preserved.';

export class AutonomousLearningEngine {
  constructor(app){
    this.app=app;this.abort=new AbortController();this.session=crypto.randomUUID();this.followers=new Map();this.queue=new Set();this.reviewedTopics=new Map();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.active?.controller.abort();else this.recover();},{signal:this.abort.signal});
    window.addEventListener('pagehide',()=>this.active?.controller.abort(),{signal:this.abort.signal});
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
    this.active?.controller.abort();const prefs=await (this.app.db||this.app.store).saveResearchPermissions(id,{enabled});
    if(this.app.state.mind?.id!==id)throw Error('Mindling identity changed.');this.preferences=validatePermissions(prefs,id);this.permissionIdentity=id;this.app.renderState();
    if(enabled)this.recover();return prefs;
  }
  recover(){
    if(this.disposed||this.app.disposed||document.hidden||!this.preferences?.enabled)return;
    for(const task of tasksFor(this.app.state.mind)){const interrupted=task.session!==this.session&&['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status),aborted=this.active?.id===task.id&&this.active.controller.signal.aborted;if(task.engineVersion===2&&!terminal(task)&&(['PERMISSION_REQUIRED','ACCESS_DISABLED','INTERRUPTED','QUEUED'].includes(task.code)||interrupted||aborted))this.startIfAuthorized(task);}
  }
  startIfAuthorized(task){
    if(!task||terminal(task)||task.engineVersion!==2||['CLARIFICATION','MODEL_CLARIFICATION','TOOLS_UNAVAILABLE'].includes(task.code)||this.disposed)return;
    this.queue.add(task.id);this.drain();
  }
  async drain(){
    if(this.draining||this.active||this.disposed||document.hidden)return;this.draining=true;
    try{
      const prefs=await this.loadPermissions(true);
      for(const id of [...this.queue]){
        this.queue.delete(id);const task=tasksFor(this.app.state.mind).find(item=>item.id===id);if(!task||terminal(task)||task.engineVersion!==2)continue;
        this.assertLive(task.mindlingId);
        if(!prefs.enabled){
          if(!prefs.decided&&this.app.dashboard?.canContinueResearch(this.requestId(task)))this.app.dashboard.showResearchAccess(task,this.requestId(task),publicResearchTopic(task));
          else{const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='ACCESS_DISABLED';item.message='Mindling research planning is disabled. You can change access in Settings.';});this.notify(blocked);}continue;
        }
        const topic=this.reviewedTopics.get(id)||publicResearchTopic(task);
        if(topic===null){const blocked=await this.patch(id,null,item=>{item.status='BLOCKED';item.code='QUERY_REVIEW';item.message='Review a short public topic before sharing a potentially sensitive request with Mindling planning.';});if(this.app.dashboard?.canContinueResearch(this.requestId(task)))this.app.dashboard.showResearchAccess(blocked,this.requestId(task),null);continue;}
        await this.run(task,topic);
      }
    }catch{const waiting=[...this.queue];this.queue.clear();if(!this.disposed&&!this.app.disposed&&!document.hidden)for(const id of waiting){try{const blocked=await this.patch(id,null,item=>{if(terminal(item))return;item.status='BLOCKED';item.code='PLANNING_UNAVAILABLE';item.message='Mindling planning could not confirm access. No planning request was sent.';});this.notify(blocked);}catch{/* A changed identity or read-only view owns this state. */}}}
    finally{this.draining=false;if(this.queue.size&&!this.active&&!document.hidden&&!this.disposed)queueMicrotask(()=>this.drain());}
  }
  async taskId(interpretation,identity){const dated=interpretation.timeSensitive?new Date().toISOString().slice(0,10):'';return digest(JSON.stringify([identity,interpretation.depth,interpretation.normalizedText.replace(/[.!?。！？]+$/u,''),interpretation.scope,dated]));}
  async existing(interpretation){const mind=this.app.state?.mind;if(!mind)return null;const key=await this.taskId(interpretation,mind.id);return tasksFor(this.app.state.mind).find(task=>(task.queryKey||task.id)===key&&!terminal(task))||null;}
  async prepare(interpretation,requestId,{reply=null,taskId=null,guard=()=>{}}={}){
    const identity=this.app.state.mind?.id,mind=this.assertLive(identity);
    if(interpretation.depth!==LEARNING_MODES.TALK_RESEARCH&&energyAt(mind.energy,this.app.state.now).remaining<LIFE_RULES.activity[activityFor(interpretation.depth)].energyCost)throw Error('Not enough Energy for the existing learning activity.');
    if(interpretation.clarification)throw Error('Resolve the clarification before preparing research.');
    const context=trainingContext(interpretation.requestText||interpretation.normalizedText,mind),gap=knowledgeGap(interpretation,context,reply,Date.now(),mind),queryKey=await this.taskId(interpretation,identity),id=taskId||queryKey,now=Date.now();
    const task={version:1,engineVersion:2,id,queryKey,mindlingId:identity,requestId,run:crypto.randomUUID(),mode:interpretation.depth,originalText:interpretation.normalizedText,objective:interpretation.requestText||interpretation.normalizedText,topic:interpretation.topic,scope:{...interpretation.scope},interpretationAnswers:{...interpretation.answers},timeSensitive:interpretation.timeSensitive,
      status:'BLOCKED',createdAt:now,updatedAt:now,attempts:0,sourceRequests:0,completedWork:['understanding','retrieval','plan'],referenceIds:gap.referenceIds,sourceReferences:[],knowledgeIds:[],
      plan:interpretation.depth===LEARNING_MODES.DEEP?['Identify bounded subtopics','Compare available evidence and conflicts','Retain only supported knowledge']:['Identify essential concepts','Check evidence availability','Retain only supported knowledge'],
      code:'PERMISSION_REQUIRED',message:'Preparing Mindling research. Source-backed learning requires a connected information tool.',energyCharged:interpretation.depth===LEARNING_MODES.TALK_RESEARCH&&mind.processed.includes(requestId),gapReasons:gap.reasons};
    await this.app.change(state=>{
      guard();this.assertLive(identity);if(state.mind?.id!==identity||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===identity))throw Error('A matching living Mindling is required.');
      const tasks=writableTasks(state.mind),existing=tasks.find(item=>item.id===id||!taskId&&(item.queryKey||item.id)===queryKey);
      if(existing){
        if(!taskId)return state;if(existing.status!=='BLOCKED'||!['CLARIFICATION','MODEL_CLARIFICATION'].includes(existing.code))throw Error('This clarification changed.');
        const next=structuredClone(state),target=next.mind.learningTasks.find(item=>item.id===id);Object.assign(target,{engineVersion:2,queryKey,originalText:task.originalText,objective:task.objective,topic:task.topic,scope:task.scope,interpretationAnswers:task.interpretationAnswers,timeSensitive:task.timeSensitive,code:task.code,message:task.message,run:crypto.randomUUID(),clarificationRounds:(target.clarificationRounds||0)+1,updatedAt:Math.max(target.createdAt,now)});delete target.coordinatorClarification;return next;
      }
      if(tasks.filter(item=>!terminal(item)).length>=LIMITS.unfinished)throw Error('Cancel an unfinished task before starting another.');
      const next=structuredClone(state),retained=tasks.slice();while(retained.length>=LIMITS.tasks){const index=retained.findIndex(terminal);if(index<0)throw Error('Research task history is full.');retained.splice(index,1);}
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
    if(action==='clarify')return this.clarification(task);
    if(action==='cancel'){cancelTaskClarification(this.app,id);this.queue.delete(id);this.reviewedTopics.delete(id);if(this.active?.id===id)this.active.controller.abort();return this.patch(id,null,item=>{if(terminal(item))return;item.run=crypto.randomUUID();item.status='CANCELLED';item.code='CANCELLED';item.message='Research cancelled. Existing knowledge was preserved.';});}
    if(terminal(task))throw Error('This task has finished.');
    if(action==='consent'){
      if(typeof payload.enabled!=='boolean')throw Error('Choose whether to allow Mindling planning.');
      if(payload.enabled){const topic=publicResearchTopic(task,payload.topic??null);if(topic===null)throw Error('Review a short public topic first.');this.reviewedTopics.set(id,topic);}
      if(!this.preferences?.enabled||!payload.enabled)await this.setAccess(payload.enabled);
      if(payload.enabled){this.startIfAuthorized(task);return {accepted:true,message:'Mindling planning continues automatically.'};}return {accepted:true,message:'Mindling planning remains disabled.'};
    }
    if(!['retry','continue'].includes(action))throw Error('Unknown research action.');
    if(task.attempts>=LIMITS.attempts)throw Error('This task reached its bounded attempt limit.');
    if(!(await this.loadPermissions(true)).enabled)throw Error('Allow Mindling planning in Settings before continuing this historical or interrupted task.');
    const next=await this.patch(id,null,item=>{item.engineVersion=2;item.code='QUEUED';item.status='BLOCKED';item.message='Mindling planning queued under current authorization.';});this.startIfAuthorized(next);return next;
  }
  async run(task,topic){
    if(this.active||task.attempts>=LIMITS.attempts)return;this.assertLive(task.mindlingId);
    const controller=new AbortController(),run=crypto.randomUUID();this.active={id:task.id,controller};const deadline=setTimeout(()=>controller.abort(),55000);
    try{
      const queued=await this.patch(task.id,null,item=>{if(terminal(item)||item.attempts>=LIMITS.attempts)throw Error('Task finished or exhausted its budget.');item.run=run;item.session=this.session;item.attempts++;item.status='QUEUED';item.code='PLANNING';item.message='Mindling is preparing a bounded research plan. No sources have been retrieved.';});
      const authorization=await this.loadPermissions(true);if(!authorization.enabled||controller.signal.aborted)throw new DOMException('Planning cancelled.','AbortError');
      const scope=task.scope||{},context={topic,mode:task.mode,freshness:task.timeSensitive,scope:{criterion:scope.metric||null,geography:scope.regions||[scope.region].filter(Boolean),geographyMode:scope.regionMode||null,period:scope.period||null,quantity:Number.isSafeInteger(scope.count)&&scope.count>0?scope.count:null}},id=await digest(JSON.stringify([task.id,run,context]));
      const result=await requestResearchPlanning({id,context,signal:controller.signal});this.assertLive(task.mindlingId);if(controller.signal.aborted)throw new DOMException('Planning cancelled.','AbortError');
      const grant={mindlingId:task.mindlingId,capability:RESEARCH_CAPABILITY,revision:authorization.revision};
      const finished=await this.patch(task.id,run,item=>{
        if(controller.signal.aborted||terminal(item))throw Error('Planning was cancelled.');item.plan=result.planning.plan;item.plannedAt=Date.now();item.status='BLOCKED';
        const question=result.planning.clarification;
        if(question&&!(item.clarificationRounds>=1)&&queued.attempts<LIMITS.attempts){item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:question.question,options:question.options,freeText:question.options.length===0};item.code='MODEL_CLARIFICATION';item.message=question.question;}
        else{item.code='TOOLS_UNAVAILABLE';item.message=task.timeSensitive?'Mindling cannot verify current information: no live search or source-retrieval tool is connected. No current answer or research memory was invented.':unavailable;}
      },{researchGrant:grant});
      if(finished.code==='MODEL_CLARIFICATION'&&this.app.dashboard?.canContinueResearch(this.requestId(finished)))this.app.dashboard.showClarification(this.clarification(finished).talkResponse);else this.notify(finished);
      // No source/knowledge/answer work unit is completed without actual evidence.
    }catch(error){try{const blocked=await this.patch(task.id,run,item=>{if(terminal(item))return;item.status='BLOCKED';item.code=error.name==='AbortError'?'INTERRUPTED':'PLANNING_UNAVAILABLE';item.message=error.name==='AbortError'?'Mindling planning paused. Completed work is saved.':'Mindling planning is unavailable. No evidence or research knowledge was saved.';});this.notify(blocked);}catch{/* A newer run, cancellation or identity owns the task. */}}
    finally{clearTimeout(deadline);this.reviewedTopics.delete(task.id);if(this.active?.controller===controller)this.active=null;}
  }
  reply(task){return {answer:task.engineVersion!==2&&task.status!=='COMPLETED'?legacyMessage:task.message,memoryIds:task.status==='COMPLETED'?task.knowledgeIds:[],uncertainty:'high',insufficientInformation:true,researchTaskId:task.id};}
  follow(task,requestId){this.followers.set(task.id,requestId);if(this.followers.size>LIMITS.tasks)this.followers.delete(this.followers.keys().next().value);}
  destroy(){this.disposed=true;this.active?.controller.abort();this.abort.abort();this.queue.clear();this.reviewedTopics.clear();}
}
