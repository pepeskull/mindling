import { understandInput, knowledgeGap, LEARNING_MODES } from '../learning/input-understanding.js';
import { trainingContext } from '../training/retrieval.js';
import { learn } from '../preview/sandbox/engine.js';
import { energyAt, spendEnergy } from '../economy/energy.js';
import { LIFE_RULES } from '../life/life-system.js';
import { stimulatePreviewLife } from '../preview/sandbox/life.js';
import { LIMITS, validTask, writableTasks, tasksFor, terminal, digest } from './tasks.js';
import { publicTextURL, retrieveDocument, evaluateDocument } from './research-sources.js';

const engines=new WeakMap();
export function learningEngine(app){let engine=engines.get(app);if(!engine){engine=new AutonomousLearningEngine(app);engines.set(app,engine);}return engine;}
export function stopLearning(app){engines.get(app)?.destroy();}
export function learningSession(app){return engines.get(app)?.session||null;}
const done=(task,...units)=>{task.completedWork=[...new Set([...task.completedWork,...units])];};
const activityFor=mode=>mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';
const replyFor=(task,mind)=>({answer:task.status==='COMPLETED'?`Bounded research completed. The authorized document reports:\n\n${task.knowledgeIds.map(id=>mind.memories.find(memory=>memory.id===id)?.content).filter(Boolean).join('\n\n')}\n\nThese are attributed source excerpts, not independent verification or complete coverage of the topic.`:task.message,memoryIds:task.status==='COMPLETED'?task.knowledgeIds:[],uncertainty:'high',insufficientInformation:true,researchTaskId:task.id});

export class AutonomousLearningEngine {
  constructor(app){
    this.app=app;this.abort=new AbortController();this.disposed=false;this.session=crypto.randomUUID();this.followers=new Map();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.active?.controller.abort();},{signal:this.abort.signal});
    window.addEventListener('pagehide',()=>this.active?.controller.abort(),{signal:this.abort.signal});
  }
  assertLive(identity){
    this.app.external?.assertWritable();
    const mind=this.app.state?.mind;
    if(this.disposed||this.app.disposed||document.hidden||!mind||mind.id!==identity||mind.life.lifeState!=='ALIVE')throw Error('Learning was paused. A matching living Mindling and an open, visible page are required.');
    return mind;
  }
  async taskId(interpretation,identity){
    // Exact normalized objectives only: preserve names, numbers, negation and
    // comparisons. No fuzzy merging of materially different questions.
    const dated=interpretation.timeSensitive?new Date().toISOString().slice(0,10):'';
    return digest(JSON.stringify([identity,interpretation.depth,interpretation.normalizedText.replace(/[.!?。！？]+$/u,''),interpretation.scope,dated]));
  }
  async existing(interpretation){const mind=this.app.state?.mind;if(!mind)return null;const id=await this.taskId(interpretation,mind.id);return tasksFor(this.app.state.mind).find(task=>task.id===id&&!terminal(task))||null;}
  async prepare(interpretation,requestId,{reply=null}={}){
    const identity=this.app.state.mind?.id,mind=this.assertLive(identity);
    if(interpretation.depth!==LEARNING_MODES.TALK_RESEARCH&&energyAt(mind.energy,this.app.state.now).remaining<LIFE_RULES.activity[activityFor(interpretation.depth)].energyCost)throw Error('Not enough Energy for the existing learning activity.');
    const context=trainingContext(interpretation.normalizedText,mind),gap=knowledgeGap(interpretation,context,reply,Date.now(),mind);
    const id=await this.taskId(interpretation,identity),now=Date.now();
    const task={version:1,id,mindlingId:identity,requestId,run:crypto.randomUUID(),mode:interpretation.depth,objective:interpretation.normalizedText,topic:interpretation.topic,scope:{...interpretation.scope},timeSensitive:interpretation.timeSensitive,
      status:'BLOCKED',createdAt:now,updatedAt:now,attempts:0,sourceRequests:0,completedWork:['understanding','retrieval','plan'],referenceIds:gap.referenceIds,sourceReferences:[],knowledgeIds:[],
      plan:interpretation.depth===LEARNING_MODES.DEEP?['Compare relevant concepts','Check relationships and exceptions','Synthesize bounded evidence']:['Identify essential concepts','Read authorized source material','Retain relevant source-attributed knowledge'],
      code:interpretation.clarification?'CLARIFICATION':'NO_SOURCE',message:interpretation.clarification||'Research unavailable: no document source is authorized. Open Memory and select this gray task to authorize a public text document. No research has been completed.',
      energyCharged:interpretation.depth===LEARNING_MODES.TALK_RESEARCH&&mind.processed.includes(requestId),gapReasons:gap.reasons};
    await this.app.change(state=>{
      this.assertLive(identity);if(state.mind?.id!==identity||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===identity))throw Error('A matching living Mindling is required.');
      const tasks=writableTasks(state.mind);if(tasks.some(item=>item.id===id))return state;
      if(tasks.filter(item=>!terminal(item)).length>=LIMITS.unfinished)throw Error('Cancel an unfinished learning task before starting another.');
      const next=structuredClone(state),retained=tasks.slice();
      while(retained.length>=LIMITS.tasks){const index=retained.findIndex(terminal);if(index<0)throw Error('Learning task history is full.');retained.splice(index,1);}
      if(!validTask(task,identity))throw Error('The learning request could not be validated.');
      next.mind.learningTasks=[...retained,task];return next;
    },{preserveGameplay:true});
    return tasksFor(this.app.state.mind).find(item=>item.id===id);
  }
  async patch(id,run,change){
    const identity=this.app.state.mind?.id;
    await this.app.change(state=>{
      if(this.disposed||this.app.disposed||state.mind?.id!==identity)throw Error('Learning was closed or identity changed.');
      const next=structuredClone(state),task=writableTasks(next.mind).find(item=>item.id===id);
      if(!task||run&&task.run!==run)throw Error('This task changed in another interaction.');
      change(task,next);task.updatedAt=Math.max(task.createdAt,Date.now());
      if(!validTask(task,identity))throw Error('Learning task update was invalid.');return next;
    },{preserveGameplay:true});
    return tasksFor(this.app.state.mind).find(item=>item.id===id);
  }
  async act(action,id,url=''){
    const mind=this.assertLive(this.app.state.mind?.id),task=tasksFor(mind).find(item=>item.id===id);
    if(!task)throw Error('This learning task is unavailable.');
    if(action==='cancel'){
      if(terminal(task))return;
      if(this.active?.id===id)this.active.controller.abort();
      return this.patch(id,null,item=>{if(terminal(item))return;item.run=crypto.randomUUID();item.status='CANCELLED';item.code='CANCELLED';item.message='Learning cancelled. No further work will be performed.';});
    }
    if(action!=='authorize')throw Error('Unknown learning action.');
    if(this.active)throw Error('One research task can run at a time.');
    if(task.status==='COMPLETED'||task.status==='CANCELLED')throw Error('This task has finished.');
    if(task.code==='CLARIFICATION')throw Error(task.message);
    if(task.attempts>=LIMITS.attempts||task.sourceRequests>=LIMITS.sourceRequests)throw Error('This task reached its bounded research-attempt limit. No automatic retry is performed.');
    if(typeof url!=='string'||url.length>1001)throw Error('Provide a bounded public document URL list.');
    const urls=[...new Set(url.split(/\r?\n/).map(value=>value.trim()).filter(Boolean).map(publicTextURL))];
    if(!urls.length||urls.length>(task.mode===LEARNING_MODES.DEEP?2:1)||task.sourceRequests+urls.length>LIMITS.sourceRequests)throw Error('Authorize one document, or up to two for Deep Training, within the remaining three-request limit.');
    const activity=activityFor(task.mode);
    if(!task.energyCharged&&energyAt(mind.energy,this.app.state.now).remaining<LIFE_RULES.activity[activity].energyCost)throw Error('Not enough Energy for the existing activity cost.');
    const run=crypto.randomUUID(),controller=new AbortController();this.active={id,controller};
    try{
      const queued=await this.patch(id,null,item=>{
        if(terminal(item)||item.attempts>=LIMITS.attempts||item.sourceRequests+urls.length>LIMITS.sourceRequests)throw Error('This task finished or reached its bounded resource limit in another interaction.');
        item.run=run;item.session=this.session;item.status='QUEUED';item.attempts++;item.sourceRequests+=urls.length;item.code='';item.message='Authorized documents queued. Work runs only while this page is open.';
        item.sourceReferences=[...item.sourceReferences.filter(source=>!urls.includes(source.url)),...urls.map(url=>{const prior=item.sourceReferences.find(source=>source.url===url);return prior?{...prior,lastAuthorizedAt:Date.now()}:{url,authorizedAt:Date.now()};})];
      });
      this.assertLive(task.mindlingId);
      await this.patch(id,run,item=>{item.status='RESEARCHING';item.message='Reading the authorized document.';});
      const documents=[];
      for(const sourceURL of urls){
        const document=await retrieveDocument(sourceURL,{signal:controller.signal});this.assertLive(task.mindlingId);documents.push(document);
        await this.patch(id,run,item=>{const source=item.sourceReferences.find(source=>source.url===sourceURL);Object.assign(source,{hash:document.hash,observedAt:document.observedAt});});
      }
      if(controller.signal.aborted)throw new DOMException('Research interrupted.','AbortError');
      await this.patch(id,run,item=>{item.status='EVALUATING';item.message='Evaluating source excerpts, relevance and dates.';done(item,'source');});
      const interpretation=understandInput(task.objective,activity),pools=[];
      for(const document of documents)pools.push((await evaluateDocument(document,interpretation)).map(item=>({...item,document})));
      // Round-robin preserves a bounded contribution from each authorized source
      // in Deep Training without inventing cross-source agreement or conclusions.
      const evidence=[];
      for(let index=0;index<LIMITS.memories;index++)for(const pool of pools)if(pool[index]&&evidence.length<LIMITS.memories)evidence.push(pool[index]);
      if(controller.signal.aborted)throw new DOMException('Research interrupted.','AbortError');
      if(!evidence.length)return await this.patch(id,run,item=>{done(item,'evidence');item.status='BLOCKED';item.code='NO_EVIDENCE';item.message=task.timeSensitive?'No relevant excerpt with a fresh explicit date was found. Fetch time alone does not establish a current fact.':'The document did not provide suitable bounded evidence for this objective. No knowledge was saved.';});
      await this.patch(id,run,item=>{done(item,'evidence');item.status='COMMITTING';item.message='Checking evidence against current canonical knowledge.';item.acceptedQuotes=evidence.map(item=>item.quoteHash);});
      const ids=evidence.map((_,index)=>`${id.slice(0,56)}:${queued.attempts}:${index}`);
      await this.app.change(state=>{
        this.assertLive(task.mindlingId);
        if(controller.signal.aborted||state.mind?.id!==task.mindlingId||state.mind.life.lifeState!=='ALIVE'||state.tombstones.some(item=>item.id===task.mindlingId))throw Error('Research was cancelled before memory integration.');
        let next=structuredClone(state),current=writableTasks(next.mind).find(item=>item.id===id);
        if(!current||current.run!==run||current.status!=='COMMITTING')throw Error('Task authorization changed before memory integration.');
        const knowledge=[];let formed=0;
        for(const [index,item]of evidence.entries()){
          const document=item.document,url=document.url;
          const duplicate=next.mind.memories.find(memory=>!memory.supersededBy&&memory.intelligence?.current!==false&&memory.kind!=='historical'&&memory.intelligence?.kind!=='historical'&&memory.research?.quoteHash===item.quoteHash);
          if(duplicate){knowledge.push(duplicate.id);continue;}
          const content=`Source observation (${new Date(document.observedAt).toISOString()}) from ${url}: ${item.quote}`;
          const authorization={taskId:id,run,url,sourceHash:document.hash,observedAt:document.observedAt,validAt:item.validAt,quote:item.quote,quoteHash:item.quoteHash,content};
          try{
            const candidate=learn(next,{id:ids[index],text:item.quote,mindId:task.mindlingId,activity:activity==='TALK'?'TEACH':activity,autonomous:authorization});
            if(candidate.mind.memories.some(memory=>memory.id===ids[index])){next=candidate;knowledge.push(ids[index]);formed++;}
          }catch{/* Conservative native duplicate/conflict/quality checks may reject an excerpt. */}
        }
        current=writableTasks(next.mind).find(item=>item.id===id);
        if(formed&&!current.energyCharged){
          // One existing activity charge, atomically with all accepted records.
          // Source reads/evaluation/retries never charge per-step Energy or XP.
          if(activity==='TALK'||next.mind.processed.includes(current.requestId))throw Error('The original activity authorization is unavailable.');
          next.mind.energy=spendEnergy(energyAt(next.mind.energy,next.now),LIFE_RULES.activity[activity].energyCost,next.now);
          stimulatePreviewLife(next.mind.life,activity,next.now);next.mind.processed.push(current.requestId);current.energyCharged=true;
        }
        current.knowledgeIds=[...new Set(knowledge)];current.updatedAt=Math.max(current.createdAt,Date.now());delete current.acceptedQuotes;
        if(knowledge.length){done(current,'knowledge','answer');current.status='COMPLETED';current.code='BOUNDED_EVIDENCE';current.message=`Bounded learning completed: ${formed} new source-attributed ${formed===1?'memory':'memories'}. This is partial topic coverage, not mastery. Autonomous learning awards 0 XP.`;}
        else{current.status='BLOCKED';current.code='NO_ACCEPTED_KNOWLEDGE';current.message='Native memory checks did not accept any new excerpt. Existing knowledge was preserved; no Energy or XP was spent by research.';}
        if(!validTask(current,task.mindlingId))throw Error('Research completion could not be validated.');return next;
      },{preserveGameplay:true,...(activity==='TALK'?{}:{journal:{id:`research:${id}:${queued.attempts}`,type:activity}})});
      const completed=tasksFor(this.app.state.mind).find(item=>item.id===id);
      if(completed.status==='COMPLETED'&&completed.mode===LEARNING_MODES.TALK_RESEARCH)this.app.dashboard?.showTalkResponse({id:this.followers.get(completed.id)||completed.requestId,state:'ready',reply:replyFor(completed,this.app.state.mind)});
      return completed;
    }catch(error){
      if(!this.disposed&&!this.app.disposed&&this.app.state.mind?.id===task.mindlingId){
        try{return await this.patch(id,run,item=>{if(terminal(item))return;item.status='BLOCKED';item.code=error.name==='AbortError'?'INTERRUPTED':'SOURCE_UNAVAILABLE';item.message=(error.message||'Research unavailable.').slice(0,900)+' Research is paused; retry requires explicit source authorization.';});}catch{/* A newer run/cancellation owns this task. */}
      }
      throw error;
    }finally{if(this.active?.controller===controller)this.active=null;}
  }
  reply(task){return replyFor(task,this.app.state.mind);}
  follow(task,requestId){if(task.mode!=='TALK_RESEARCH')return;this.followers.set(task.id,requestId);if(this.followers.size>LIMITS.tasks)this.followers.delete(this.followers.keys().next().value);}
  destroy(){this.disposed=true;this.active?.controller.abort();this.abort.abort();}
}
