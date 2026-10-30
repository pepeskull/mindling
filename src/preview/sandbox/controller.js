import { knowledgeTalk } from '../../cognition/talk-response.js';
import { interpretInteraction } from '../../learning/clarification.js';
import { learningEngine, stopLearning, learningSession, researchPermissions, syncResearchPermissions } from '../../autonomous/learning-engine.js';
import { CognitiveEngine } from '../../cognition/cognitive-engine.js';
import { EVENTS } from '../../app/events.js';
import { energyCapacityForStage } from '../../economy/energy.js';
import { PATHWAYS, DEFAULT_ORIGINS } from '../../pathways/pathways.js';
import { LEARNING_INPUT_LIMIT } from '../../memory/content-integrity.js';
import { learningContext } from './learning-assessment.js';
import { EvolutionPreview } from '../evolution-preview.js';
import { AutomaticNetworkCountdown } from '../automatic-playback.js';
import { STAGES } from '../evolution-model.js';
import { presentationFor } from '../dashboard-presentation.js';
import { condition, carePreview, previewWarning } from './life.js';
import { createSandbox,newMindling,advanceTime,resetClock,eligibility,learn,upgradeSandbox,advanceSandbox,DAY } from './engine.js';
import { LIFE_RULES } from '../../life/life-system.js';
import { TestWalletUI } from './wallet-ui.js';
import { PreviewStore } from './storage.js';
import { requestLearningAssessment } from './learning-service.js';

export class SandboxPreview extends EvolutionPreview {
  constructor(options={}) { super({...options,snapshotProvider:async()=>({status:'empty'}),originalFraming:true,canonicalBrain:true}); this.listeners=new AbortController(); }
  async start() {
    if(new URLSearchParams(location.search).get('stage-preview')!=='1')throw Error('Sandbox requires explicit preview URL');
    const store=await new PreviewStore().open();
    if(this.disposed){store.close();return;}
    // Same isolated repository, with no mounted training UI or automatic requests.
    this.cognition=new CognitiveEngine({events:this.events,store:{
      load:id=>store.trainingHistory(id),
      source:id=>{this.external?.assertWritable();return store.trainingSource(id);},
      save:record=>{this.external?.assertWritable();return store.saveTraining(record);}
    }});
    this.store=store;this.state=await this.store.change(s=>s?advanceSandbox(s):createSandbox());
    if(this.disposed){store.close();return;}
    this.stabilityRow=document.createElement('div');this.stabilityRow.className='life-attribute';this.stabilityRow.dataset.lifeAttribute='neuralStability';
    this.stabilityRow.innerHTML='<svg class="life-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg><label>Neural Stability</label><strong>—</strong><progress aria-label="Neural Stability" max="100" value="100">100%</progress>';
    document.querySelector('[data-life-warning]').before(this.stabilityRow);
    document.querySelector('#app').classList.add('sandbox-mode');
    this.seedModel=this.state.mind?{nodes:this.state.mind.nodes,synapses:this.state.mind.synapses,stage:this.state.mind.stage}:null;
    await super.start();if(this.disposed)return;
    this.timeline.pause();
    this.panel=document.createElement('details');this.panel.className='sandbox-controls glass-panel';this.panel.open=true;
    this.panel.innerHTML=`<summary>Development sandbox · isolated test data</summary><div class="sandbox-body"><a href="?stage-preview=1&preview-mode=demo">Replay automatic demonstration</a><p>Talk generates a knowledge-grounded response; Teach and Deep Training use the learning service. Your message and relevant selected memories may be sent to an external service. Claims are not fact-checked. Production data stays separate.</p><label>Test name <input data-test-name maxlength="40" value="Test Mindling"></label><fieldset class="sandbox-origin-pathways"><legend>Origin pathways · choose at least three</legend>${PATHWAYS.map(id=>`<label><input type="checkbox" data-test-pathway value="${id}" ${DEFAULT_ORIGINS.includes(id)?'checked':''}>${id}</label>`).join('')}</fieldset><button data-sandbox="new">Create new test Mindling…</button><div class="time-controls">${[1,12,24,168].map(h=>`<button data-hours="${h}">+${h===24?'1 day':h===168?'7 days':h+' hours'}</button>`).join('')}<button data-sandbox="clock">Reset simulated time offset</button></div><button data-sandbox="fixture">Run labelled learning fixture</button><button data-sandbox="reset">Reset preview gameplay…</button><pre data-diagnostics></pre><label>Inspect neuron <select data-node-selection></select></label><p data-node-info></p><p data-sandbox-status role="status">Create an isolated test Mindling to begin.</p><details><summary>XP history and recent learning</summary><pre data-history></pre></details></div>`;
    document.querySelector('#app').append(this.panel);
    this.listen(this.panel,'click',e=>{const button=e.target.closest('button');if(!button)return;this.action(async()=>{
      if(button.dataset.hours)return this.change(s=>advanceTime(s,Number(button.dataset.hours)));
      switch(button.dataset.sandbox){
        case 'new': if(confirm('Create a new isolated test Mindling? The current test identity will be archived.'))await this.change(s=>newMindling(s,{name:this.panel.querySelector('[data-test-name]').value,pathways:[...this.panel.querySelectorAll('[data-test-pathway]:checked')].map(input=>input.value),confirmed:true}));this.panel.open=false;break;
        case 'reset': if(confirm('Reset preview gameplay? Production data and the test player wallet are preserved.'))await this.change(s=>{const n=newMindling(s,{confirmed:true});n.origin=n.now;return n;});break;
        case 'clock':await this.change(resetClock);break;
        case 'fixture':await this.runFixture();break;
      }
    });});
    this.listen(document.querySelector('#interaction-form'),'submit',e=>{e.preventDefault();this.action(()=>this.submitLearning());});
    for(const button of document.querySelectorAll('[data-care]')){
      const detail=button.querySelector('small');
      this.careLabels??=[];this.careLabels.push([detail,detail.textContent]);
      detail.textContent=`Free · ${LIFE_RULES.care[button.dataset.care].cooldownHours}h`;
      this.listen(button,'click',()=>this.action(()=>this.care(button.dataset.care)));
    }
    for(const button of document.querySelectorAll('[data-input-mode],[data-activity-mode]'))this.listen(button,'click',()=>this.setActivity(button.dataset.inputMode||button.dataset.activityMode));
    this.listen(this.panel.querySelector('[data-node-selection]'),'change',e=>this.inspectNode(e.target.value));
    this.listen(document.querySelector('[data-new-mindling]'),'click',()=>this.panel.querySelector('[data-sandbox="new"]').click());
    this.setActivity('TEACH');
    this.interaction.connect(this.host,{onTap:event=>{
      if(this.external?.tap(event))return;
      if(!this.state.mind)return;
      const hit=this.seed.selectAt(event);
      this.events.emit(EVENTS.SCENE_SELECTION,hit);
      const id=hit?.type==='neuron'?hit.id:null;
      if(id){this.panel.querySelector('[data-node-selection]').value=id;this.inspectNode(id);}
    },onHover:event=>this.seed.hoverAt(event)});
    this.walletUI=new TestWalletUI(this);
    this.renderState();
    this.energyTimer=setInterval(()=>{
      if(this.external?.locked||this.busy||this.pendingMutations||!this.state.mind)return;
      const now=this.state.now+Math.max(0,Date.now()-this.state.wallAt),energy=this.state.mind.energy;
      this.dashboard.renderEnergy(energy,now);
      if(eligibility({...this.state,now}).eligible)this.change(s=>s).catch(error=>this.status(error.message));
      else if(now>=energy.updatedAt+720000&&energy.remaining-energy.bonus<energyCapacityForStage(this.state.mind.stage))this.change(s=>s).catch(error=>this.status(error.message));
    },1000);
    this.lifeTimer=setInterval(()=>{if(!this.busy&&!this.pendingMutations&&!this.external?.locked)this.change(s=>s).catch(error=>this.status(error.message));},60_000);
    this.listen(document,'visibilitychange',()=>{if(!document.hidden&&!this.busy)this.change(s=>s).catch(error=>this.status(error.message));});
  }
  listen(node,type,fn){node.addEventListener(type,event=>{if(!this.external?.locked)fn(event);},{signal:this.listeners.signal});}
  async action(fn){if(this.busy||this.external?.locked)return;this.busy=true;document.querySelector('#interaction-form').classList.add('processing');this.updateInputAvailability();this.status('Working…');try{const result=await fn();if(this.panel?.querySelector('[data-sandbox-status]').textContent==='Working…')this.status('Preview state saved.');return result;}catch(e){this.status(e.message||'Preview operation failed; state unchanged.');}finally{this.busy=false;document.querySelector('#interaction-form').classList.remove('processing');this.updateInputAvailability();}}
  status(text){if(this.disposed)return;const el=this.panel?.querySelector('[data-sandbox-status]');if(el)el.textContent=text;const inline=document.querySelector('#interaction-form .interaction-status');if(inline){inline.textContent=text;inline.classList.add('visible');}}
  async change(reducer,{preserveGameplay=false,researchGrant=null}={}) {
    this.external?.assertWritable();
    this.pendingMutations=(this.pendingMutations||0)+1;
    try {
      const memories=this.state.mind?.memories.length||0;
      this.state=await this.store.change(s=>{this.external?.assertWritable();return reducer(preserveGameplay?s:advanceSandbox(s));},{researchGrant});
      if(!this.disposed){
        this.renderState();
        if(this.state.mind?.memories.length>memories){
          const edge=this.state.mind.synapses[(this.state.mind.memories.length-1)%4];
          this.seed.signal({entry:false,source:'origin',destination:edge.to,synapse:edge.id,outcome:'MEMORY_FORMATION'});
        }
      }
    } finally { this.pendingMutations--; }
  }
  async submitLearning(request=null){
    this.external?.assertWritable();
    let text=request?.text??document.querySelector('#mindling-input').value;
    if(text.length>LEARNING_INPUT_LIMIT)throw Error('Use at most 2,000 characters. Your text has not been submitted.');
    await this.change(s=>s);
    const m=this.state.mind;if(!m||m.life.lifeState!=='ALIVE')throw Error('Create a living test Mindling first');
    const activity=request?.activity??this.activity;
    const id=request?.id??crypto.randomUUID();
    if(!request)this.dashboard.beginInteraction(id);
    if(!request&&activity==='TALK')this.dashboard.showTalkResponse({id,state:'processing'});
    try {
      const input=interpretInteraction(this,text,activity,id,request?.continuation),{interpretation}=input;
      if(input.result){if(!request)this.dashboard.showTalkResponse({id,state:'clarification',reply:input.result.talkResponse});return input.result;}
      input.guard();
      if(input.taskId&&input.paid){
        const task=await learningEngine(this).prepare(interpretation,id,{taskId:input.taskId,guard:input.guard});learningEngine(this).follow(task,id);learningEngine(this).startIfAuthorized(task);
        return {accepted:true,message:'Research request clarified. No additional Energy spent.',talkResponse:learningEngine(this).reply(task)};
      }
      if(interpretation.requiresResearch){
        this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity});
        const task=await learningEngine(this).prepare(interpretation,id,{taskId:input.taskId,guard:input.guard});learningEngine(this).startIfAuthorized(task);
        this.status(`${task.message} No XP awarded. No additional Energy spent.`);
        document.querySelector('#mindling-input').value='';
        this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'accepted',activity});return {accepted:true,message:task.message};
      }
      if(activity==='TALK'){
        const reply=await knowledgeTalk(this,text,id,{interpretation,guard:input.guard});
        if(!request)this.dashboard.showTalkResponse({id,state:'ready',reply});
        this.status(reply.energySpent===0?'Existing research task reused · no Energy spent.':'Talk completed · 1 Energy spent.');
        document.querySelector('#mindling-input').value='';
        this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'accepted',activity});return {accepted:true,talkResponse:reply};
      }
      text=interpretation.factText||text;
      const submittedContext=JSON.stringify(learningContext(text,m));
      this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity});
      const assessment=await requestLearningAssessment(text,structuredClone(m));
      if(this.disposed)throw Error('Preview was closed before learning completed. No Energy or XP changed.');
      await this.change(s=>{
        input.guard();
        if(s.mind?.id!==m.id)throw Error('Mindling identity changed. Submit again.');
        if(JSON.stringify(learningContext(text,s.mind))!==submittedContext)throw Error('Relevant memories changed. Submit again. No Energy or XP changed.');
        const next=learn(s,{id,text,mindId:m.id,activity,assessment});const previous=input.taskId&&next.mind.learningTasks?.find(task=>task.id===input.taskId);if(previous&&previous.code==='CLARIFICATION'){previous.status='CANCELLED';previous.code='CLARIFIED_AS_FACT';previous.message='Resolved through direct factual teaching; no research was performed.';previous.updatedAt=Math.max(previous.updatedAt,Date.now());}return next;
      });
      const event=this.state.mind.history.find(item=>item.id===id);
      const messages={VERIFY_BEFORE_STORAGE:'This claim needs verification before storage.',REJECT_UNSAFE_INSTRUCTION:'This instruction cannot be stored.',ASK_FOR_CLARIFICATION:'Please clarify the subject and what you want remembered.',NO_MEMORY_CHANGE:'No memory change was needed.',FLAG_CONTRADICTION:'Conflicting claim recorded; existing knowledge was preserved.',UPDATE_EXISTING:'Current preference or goal updated. Previous values were preserved.',BATCH:'Independent statements processed together; existing history was preserved.'};
      const message=event?.kind==='reinforcement'?'Already learned. Memory reinforced.':messages[event?.operation]||'Input learned through the Mindling learning service; the claim remains player-provided and is not fact-checked.';
      this.status(`${message} ${event?.energySpent?`${event.energySpent} Energy spent.`:'No Energy spent.'}${event?.xp?'':' No XP awarded.'}`);
      document.querySelector('#mindling-input').value='';
      const operations=event?.operations||[event?.operation],refused=operations.every(operation=>['REJECT_UNSAFE_INSTRUCTION','VERIFY_BEFORE_STORAGE','ASK_FOR_CLARIFICATION'].includes(operation));
      this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:refused?'cancel':'accepted',activity});
      return {accepted:true,message};
    } catch(error){this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'cancel'});if(!request&&activity==='TALK')this.dashboard.showTalkResponse({id,state:'error',message:error.message});throw error;}
  }
  async care(type){await this.change(s=>carePreview(s,type));}
  setActivity(type){
    if(this.external?.locked)return;
    this.activity=type;
    document.querySelectorAll('[data-input-mode],[data-activity-mode]').forEach(b=>{const selected=(b.dataset.inputMode||b.dataset.activityMode)===type;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    document.querySelector('#interaction-form button[type=submit]').setAttribute('aria-label','Send message');
    document.querySelector('#mindling-input').placeholder=type==='TALK'?'Share a thought or something to remember…':'Teach your Mindling something new…';
    this.updateInputAvailability();
  }
  updateInputAvailability(){
    const m=this.state?.mind,alive=m?.life?.lifeState==='ALIVE',cost=LIFE_RULES.activity[this.activity]?.energyCost??Infinity,locked=Boolean(this.busy||this.external?.locked);
    const input=document.querySelector('#mindling-input'),submit=document.querySelector('#interaction-form button[type=submit]');
    if(input)input.disabled=!alive||locked;
    if(submit){submit.disabled=!alive||locked;submit.title=!alive?'Create a living test Mindling first':locked?'Wait for the current message to finish':this.activity==='TALK'?'Talk costs 1 Energy when a response is accepted':`Meaningful changes cost ${cost} Energy; duplicates and no-change decisions are free`;}
  }

  async runFixture(){
    const text='Photosynthesis converts light energy into chemical energy stored in glucose.';
    await this.change(s=>learn(s,{id:crypto.randomUUID(),text}));
    this.status('Deterministic fixture — no learning service request. Repeating it earns no XP.');
  }
  renderState(){
    syncResearchPermissions(this);
    this.cognition?.setActiveMindling(this.state.mind?.id || null);
    if(this.external?.locked)return;
    const m=this.state.mind;if(!m){this.dashboard.stageChip.setStage('—',{enabled:false});document.querySelectorAll('[data-stat]').forEach(el=>el.textContent='0');return;}
    if(this.identityId!==m.id){this.identityId=m.id;this.countdown=new AutomaticNetworkCountdown();this.timeline.network.reset();}
    this.seed.update({nodes:m.nodes,synapses:m.synapses,stage:m.stage});
    const stage=m.stage;if(this.timeline.stage!==stage){this.timeline.select(stage);this.syncStage();this.host.dataset.stage=String(stage);}
    // Reuse the canonical Memory UI with sandbox records, never with invented demo counts.
    this.dashboard.render({...m,developmentClock:'simulated',developmentNow:this.state.now,mindlingId:m.id,createdAt:new Date(m.createdAt).toISOString(),learningSession:learningSession(this),autonomousStatus:learningEngine(this).status,autonomousReason:learningEngine(this).diagnostics.reason,researchPermissions:researchPermissions(this)});
    this.presentation.stage=null;
    this.refreshNetwork();
    const alive=m.life.lifeState==='ALIVE';
    this.view.reduced=!alive||this.motion.matches;this.seed.setReducedMotion(!alive||this.motion.matches);
    if(!alive){this.timeline.network.reset();this.countdown.started=true;}
    document.querySelector('[data-memorial]').hidden=alive;
    document.querySelector('[data-memorial-age]').textContent=alive?'':`Test identity ${m.id}`;
    document.querySelector('[data-memorial-dates]').textContent=alive?'':`Died at ${new Date(m.life.deathAt).toISOString()}`;
    document.querySelector('[data-new-mindling]').disabled=false;
    document.querySelector('#mindling-input').disabled=!alive;
    document.querySelector('#interaction-form button[type=submit]').disabled=!alive;
    document.querySelector('[data-download-profile]').disabled=true;
    document.querySelectorAll('[data-care]').forEach(b=>{b.disabled=!alive;b.title=`Free preventive care; ${LIFE_RULES.care[b.dataset.care].cooldownHours}-hour virtual cooldown`;});
    document.querySelectorAll('[data-input-mode],[data-activity-mode]').forEach(b=>{b.disabled=!alive;b.title='Uses available Energy; no activity cooldown';});
    this.dashboard.renderEnergy(m.energy,this.state.now);
    this.updateInputAvailability();
    document.querySelector('[data-energy-progress]').hidden=false;
    document.querySelector('[data-neural-cycle]').textContent=`NC ${String(1+Math.floor((this.state.now-m.createdAt)/DAY)).padStart(4,'0')}`;
    document.querySelector('[data-neural-cycles]').textContent=`${1+Math.floor((this.state.now-m.createdAt)/DAY)} Neural Cycles`;
    if(!this.panel)return;
    const gate=eligibility(this.state);
    this.panel.querySelector('[data-diagnostics]').textContent=`${STAGES[stage-1].name}\nStage XP: ${m.stageXP} / ${gate.required.xp} · Lifetime: ${m.lifetimeXP}\nStage entered: ${new Date(m.enteredAt).toISOString()}\nStage days: ${(gate.elapsed/DAY).toFixed(2)} / ${gate.required.days}\nLearning milestones: ${gate.concepts} / ${gate.required.concepts}\nEligible: ${gate.eligible}\nVirtual time: ${new Date(this.state.now).toISOString()}\nOffset: ${((this.state.now-this.state.origin)/DAY).toFixed(2)} days`;
    this.panel.querySelector('[data-history]').textContent=JSON.stringify(m.history.slice(-12).map(event=>({...event,source:event.source==='NATIVE'?'Local learning':event.source==='SERVICE'?'Mindling learning service':event.source?'Historical record':undefined})),null,2);
    const select=this.panel.querySelector('[data-node-selection]');const previous=select.value;select.replaceChildren(...m.nodes.map(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.id;return o;}));if(m.nodes.some(n=>n.id===previous))select.value=previous;this.inspectNode(select.value);

  }
  inspectNode(id){if(this.external?.locked)return;this.view.selectedCanonical=id;this.seed.highlightRoute({neuronIds:[id],synapseIds:[]});const m=this.state.mind;this.panel.querySelector('[data-node-info]').textContent=`${id}: ${m.memories.filter(v=>v.neuronIds.includes(id)).length} memories · ${m.synapses.filter(e=>e.from===id||e.to===id).length} connections`;}
  refreshNetwork(){
    if(this.external?.locked){this.external.refresh();return;}
    if(!this.view||!this.presentation)return;
    const state=presentationFor(this.timeline,this.view.morph),m=this.state?.mind;
    if(m){state.memories=m.memories.length;state.life={...m.life,condition:condition(m.life)};}
    if(!m)return;
    const changed=this.presentation.stage!==state.stage.number;
    this.presentation.update(state);
    if(changed){document.querySelector('.life-panel').title='Actual isolated sandbox Life System 2.0';document.querySelector('[data-life-warning] span').textContent=previewWarning(m.life);}
    if(m.life.lifeState==='DECEASED'){this.view.reduced=true;this.seed.setReducedMotion(true);}
    this.view.updateLabels(state.peers);this.host.dataset.network=this.timeline.network.state;this.external?.refresh();
  }
  destroy(){stopLearning(this);clearInterval(this.lifeTimer);clearInterval(this.energyTimer);this.walletUI?.destroy();this.listeners.abort();this.stabilityRow?.remove();for(const [node,text] of this.careLabels||[])node.textContent=text;this.panel?.remove();this.cognition?.destroy();this.store?.close();document.querySelector('#app')?.classList.remove('sandbox-mode');super.destroy();}
}
