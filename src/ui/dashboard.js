import {activityResult, isCurrentInteraction, processingMessage, renderClarificationContent, renderResponseContent, researchPresentation} from './player-communication.js';
import {IntegrationView} from '../integration/integration-view.js';
import {ClarificationNotifications} from './clarification-notifications.js';
import {ResearchAccess} from './research-access.js';
import {pendingClarifications} from '../autonomous/clarification-tasks.js';
import { activityReward } from '../economy/xp.js';
import { StageChip } from './stage-chip.js';
import { stageMorphologyCounts } from '../renderer/stage-presentation.js';
import { LEARNING_INPUT_LIMIT } from '../memory/content-integrity.js';
import { DevelopmentView } from '../development/development-view.js';
import { NeuralMemoryView } from '../memory/neural-memory-view.js';
import { graphData } from '../memory/graph-data.js';
import { livePathways } from '../pathways/live-pathways.js';
import { energyLabel } from '../economy/energy.js';
import { EVENTS } from "../app/events.js";
import { downloadMindlingProfile, safeProfileFilename } from "../profile/mindling-profile.js";
import { LIFE_RULES, lifeStageFor, neuralCycles, warningFor } from "../life/life-system.js";
import { formatCareCooldown, formatLifePercentage } from './life-format.js';
import { STAGES } from '../preview/evolution-model.js';
import { basicCareNeeded, previewWarning } from '../preview/sandbox/life.js';

export class Dashboard {
  #unsubscribe;
  #memoryMap;
  #development;
  #careClock;
  #careButtons;
  #onViewChange;
  #readOnly = false;
  #listeners = new AbortController();
  #messageTimer;
  #form;
  #handleSubmit;
  #state;
  #events;
  #onInput;
  #onCare;
  #onNewMindling;
  #life;
  #pending = false;
  #mode = "TALK";
  #eventUnsubscribes = [];
  #onClarification;
  #onResearchAccess;
  #onCancelClarification;
  #interaction = null;

  constructor(events, { onInput, onCare, onNewMindling, onViewChange, onLearningTask=null, onMemoryView=null, onMergeAreas=null, onConnectMemories=null, onConnectAreas=null, onClarification=null, onCancelClarification=null, onResearchAccess=null, readOnly = false, careClock=Date.now } = {}) {
    for(const node of document.querySelectorAll('[data-activity-mode], [data-input-mode]')){
      const mode=node.dataset.activityMode||node.dataset.inputMode,policy=LIFE_RULES.activity[mode];if(!policy)continue;
      const reward=activityReward(mode),label=`${policy.label}: ${policy.energyCost} Energy · +${reward} XP`;
      node.title=label;node.setAttribute('aria-label',label);
      const small=node.querySelector('small');if(small)small.textContent=`${policy.energyCost} Energy · +${reward} XP`;
    }
    this.#onResearchAccess=onResearchAccess;this.onLearningTask=onLearningTask;this.#onClarification=onClarification;this.#onCancelClarification=onCancelClarification;
    this.stageChip=new StageChip(document.querySelector('[data-life-stage]'));
    this.primaryView='dashboard';
    this.#memoryMap = new NeuralMemoryView(document.querySelector("#memory-view"),{onLearningTask,onMemoryView,onMergeAreas,onConnectMemories,onConnectAreas});
    this.#development = new DevelopmentView(document.querySelector("#development-view"));
    this.integration=new IntegrationView(document.querySelector('#network-view'));
    this.#onViewChange = onViewChange;
    this.#readOnly = readOnly;
    this.#events = events;
    this.#onInput = onInput;
    this.#onCare = onCare;
    this.#careClock = careClock;
    this.#careButtons = [...document.querySelectorAll('[data-care]')];
    for(const button of this.#careButtons){
      const hours=LIFE_RULES.care[button.dataset.care].cooldownHours;
      button.querySelector('[data-care-duration]').textContent=` · ${hours}h`;
    }
    this.#onNewMindling = onNewMindling;
    this.#unsubscribe = events.on(EVENTS.STATE_READY, (state) => this.render(state));
    this.#eventUnsubscribes = [
      events.on(EVENTS.NEURAL_INPUT, event => this.integration.ingest(event)),
      events.on(EVENTS.LIFE_UPDATED, life => this.#renderLife(life))
    ];
    this.notifications=new ClarificationNotifications(document.querySelector('.header-status'),{canAct:()=>!this.locked,onTask:!readOnly&&onLearningTask?async id=>{
      if(this.#pending||!pendingClarifications(this.#state).some(task=>task.id===id))throw Error('Clarification unavailable.');
      const identity=this.#state.mindlingId,previous=this.interactionToken,result=await this.onLearningTask('clarify',id);
      if(identity!==this.#state?.mindlingId||this.#listeners.signal.aborted)return;
      if(result?.needsClarification)this.showClarification(result.talkResponse,previous);
    }:null});
    if(!readOnly&&onResearchAccess)this.researchAccess=new ResearchAccess(document.querySelector('.footer-links'),{getState:()=>this.#state,onSave:enabled=>this.#onResearchAccess(enabled),canAct:()=>!this.locked});
    this.#form = document.querySelector("#interaction-form");
    this.#handleSubmit = (event) => this.#submitInteraction(event);
    if (!readOnly) {
      this.#listen(this.#form, "submit", this.#handleSubmit);
      document.querySelectorAll("[data-input-mode]").forEach(button => this.#listen(button, "click", () => this.#setMode(button.dataset.inputMode)));
      document.querySelectorAll("[data-activity-mode]").forEach(button => this.#listen(button, "click", () => this.#setMode(button.dataset.activityMode)));
      document.querySelectorAll("[data-care]").forEach(button => this.#listen(button, "click", () => this.#care(button.dataset.care)));
      this.#listen(document.querySelector("[data-new-mindling]"), "click", () => { if (confirm("Preserve this memorial and begin raising a new Mindling?")) this.#onNewMindling(); });
    }
    this.#listen(document.querySelector("[data-view='development']"), "click", () => this.#setPrimaryView("development"));
    this.#listen(document.querySelector("[data-view='memories']"), "click", () => this.#setPrimaryView("memories"));
    this.#listen(document.querySelector("[data-view='dashboard']"), "click", event => { event.preventDefault(); this.#setPrimaryView("dashboard"); });
    this.#listen(document.querySelector("[data-view=network]"), "click", () => this.#setPrimaryView("network"));
    document.querySelectorAll("[data-mobile-view]").forEach(button => this.#listen(button, "click", () => this.#openMobileView(button.dataset.mobileView)));
    this.#listen(document.querySelector("[data-download-profile]"), "click", () => { if (this.#state) downloadMindlingProfile(this.#state, this.#life); });
    this.#listen(document.querySelector('[data-dismiss-talk]'),'click',()=>{this.#onCancelClarification?.();this.#interaction=null;document.querySelector('[data-talk-response]').hidden=true;this.#refreshNotifications();if(this.talkOpenedPanel)document.querySelector('.right-panel').classList.remove('mobile-open');this.talkOpenedPanel=false;});
    this.#listen(document.querySelector("#mindling-input"), "focus", () => document.documentElement.classList.add("input-active"));
    this.#listen(document.querySelector("#mindling-input"), "blur", () => document.documentElement.classList.remove("input-active"));
    const restore=()=>{
      let view=location.hash.slice(1)||'dashboard';
      if(view==='integration'){view='network';history.replaceState(history.state,'','#network');}
      if(['dashboard','development','memories','network'].includes(view))this.#setPrimaryView(view,false);
    };
    this.#listen(window,'hashchange',restore);this.#listen(window,'popstate',restore);restore();
    this.#listen(document,'visibilitychange',()=>this.tickCareCooldowns());
  }

  #listen(target, type, callback) { target.addEventListener(type, event=>{if(!this.locked)callback(event);}, { signal: this.#listeners.signal }); }

  showSnapshot(snapshot) {
    if (!this.#readOnly) throw new Error("Snapshot display requires a read-only dashboard");
    // Clear defaults: an absent record must never look like a real, healthy player.
    document.querySelectorAll('[data-stat], [data-life-stage], [data-neural-cycle], [data-neural-cycles], [data-energy-value], [data-profile-filename]').forEach(node => { node.textContent = '—'; });
    document.querySelectorAll('[data-life-attribute] strong').forEach(node => { node.textContent = '—'; });
    document.querySelectorAll('.life-panel progress, [data-energy-progress]').forEach(node => { node.value = 0; node.hidden = true; });
    const condition = document.querySelector('[data-life-condition]'); condition.textContent = 'UNAVAILABLE'; condition.dataset.condition = 'UNAVAILABLE';
    document.querySelector('[data-energy-reset]').textContent = 'No saved energy information';
    document.querySelector('[data-life-warning] span').textContent = 'No saved Life Status available.';
    document.querySelector('[data-life-status-title]').textContent = 'Mindling — Life Status';
    document.querySelector('.mindling-id').textContent = '';
    this.#renderPathways();
    this.stageChip.setName(null);
    this.stageChip.setStage('—',{enabled:false});
    this.#memoryMap.update({memories:[]});
    this.#development.update({});
    document.querySelector('.stages .current small').textContent = snapshot.state ? 'Saved' : 'Preview';
    if (snapshot.state) this.render(snapshot.state);
    if (snapshot.life) {
      document.querySelectorAll('.life-panel progress, [data-energy-progress]').forEach(node => { node.hidden = false; });
      this.#renderLife(snapshot.life, Date.parse(snapshot.life.lastSimulationAt || snapshot.life.birthTimestamp));
    }
    this.setStorageStatus(snapshot.status !== 'unavailable');
    document.querySelectorAll('[data-care], [data-activity-mode], [data-input-mode], [data-new-mindling], #mindling-input, #interaction-form button[type=submit]').forEach(node => { node.disabled = true; node.title = 'Gameplay actions are disabled in development preview'; });
    document.querySelector('[data-download-profile]').disabled = !snapshot.state;
    document.querySelector('#mindling-input').placeholder = 'Read-only development preview';
    this.show();
  }

  render(state) {
    if(this.#state?.mindlingId!==state.mindlingId){this.#onCancelClarification?.();document.querySelector('[data-talk-response]').hidden=true;this.#interaction=null;}
    this.#state = state;
    this.tickCareCooldowns();
    this.stageChip.setName(state.name);
    this.researchAccess?.refresh();this.#refreshNotifications();this.#refreshResearch();
    const brain=stageMorphologyCounts(state.stage);
    const stats = {
      neurons: brain.neurons ?? '—',
      synapses: brain.synapses ?? '—',
      memories: state.memories.length
    };

    for (const [key, value] of Object.entries(stats)) {
      document.querySelector(`[data-stat="${key}"]`).textContent = value;
    }
    this.#renderPathways(state);
    if (!state.name) return;
    document.querySelector("[data-life-status-title]").textContent = `${state.name} — Life Status`;
    document.querySelector(".mindling-id").textContent = state.mindlingId;
    document.querySelector("[data-profile-filename]").textContent = safeProfileFilename(state.name);
    this.#renderMemoryDevelopment();
  }

  #renderPathways(state = {}) {
    const pathways = livePathways(graphData(state),state);
    document.querySelector('.pathways-copy').textContent = pathways.map(pathway=>pathway.title).join(' · ');
  }

  #setMode(mode) {
    if (this.#pending) return;
    this.#mode = mode;
    document.querySelectorAll("[data-input-mode]").forEach(button => { const selected = button.dataset.inputMode === mode; button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected)); });
    document.querySelectorAll("[data-activity-mode]").forEach(button => button.classList.toggle("selected", button.dataset.activityMode === mode));
    const placeholders = { TALK: "Share a thought or personal experience...", TEACH: "Introduce new knowledge...", DEEP_TRAINING: "Begin a focused learning activity..." };
    document.querySelector("#mindling-input").placeholder = placeholders[mode];
    document.querySelector("#mindling-input").focus();
  }

  #renderMemoryDevelopment() {
    this.#memoryMap.update(this.#state);
    this.#development.update(this.#state, this.#life);
    this.integration.update(this.#state);
  }

  #setPrimaryView(view,record=true) {
    if(record&&location.hash!==`#${view}`)history.pushState(null,'',`#${view}`);
    this.primaryView=view;this.integration.setVisible(view==='network');document.querySelector('#app').classList.toggle('network-mode',view==='network');
    this.tickCareCooldowns();
    this.stageChip.setActive(view==='dashboard');
    const memory = view === "memories", development = view === "development";
    document.querySelector("#development-view").hidden = !development;
    this.#development.setVisible(development);
    document.querySelector("#app").classList.toggle("development-mode", development);
    document.querySelector("#memory-view").hidden = !memory;
    this.#memoryMap.setVisible(memory);
    document.querySelector("#app").classList.toggle("memory-mode", memory);
    document.querySelectorAll("[data-view]").forEach(item => { const active = item.dataset.view === view; item.classList.toggle("active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
    document.querySelectorAll("[data-mobile-view]").forEach(item => item.classList.toggle("active", item.dataset.mobileView === view));
    this.#onViewChange?.(view);
    this.#refreshNotifications();this.#refreshResearch();
  }

  #openMobileView(view) {
    const left = document.querySelector(".left-stack"); const right = document.querySelector(".right-panel");
    left.classList.toggle("mobile-open", view === "development"); right.classList.toggle("mobile-open", view === "dashboard");
    this.#setPrimaryView(view);
    document.querySelectorAll("[data-mobile-view]").forEach(button => button.classList.toggle("active", button.dataset.mobileView === view));
  }

  #showStatus(message) {
    const status = this.#form.querySelector(".interaction-status");
    status.textContent = message; status.classList.add("visible"); clearTimeout(this.#messageTimer);
    this.#messageTimer = setTimeout(() => status.classList.remove("visible"), 2800);
  }

  #renderLife(life, now = Date.now()) {
    this.#life = life;
    this.#development.update(this.#state || {}, life);
    const cycles = neuralCycles(life.birthTimestamp, now, life.deathTimestamp);
    document.querySelector("[data-neural-cycle]").textContent = `NC ${String(cycles).padStart(4, "0")}`;
    document.querySelector("[data-neural-cycles]").textContent = `${cycles} Neural ${cycles === 1 ? "Cycle" : "Cycles"}`;
    this.stageChip.setStage(life.version===2&&life.stage?STAGES[life.stage-1].name:lifeStageFor(cycles),{enabled:life.lifeState!=='DECEASED'});
    document.querySelector("[data-life-condition]").textContent = life.condition;
    document.querySelector("[data-life-condition]").dataset.condition = life.condition;
    for (const [name, value] of Object.entries(life.attributes)) {
      const row = document.querySelector(`[data-life-attribute="${name}"]`); const rounded = Math.round(value);
      if (!row) continue;
      row.querySelector("strong").textContent = formatLifePercentage(value); row.querySelector("progress").value = value; row.querySelector('progress').textContent = formatLifePercentage(value); row.classList.toggle("critical", rounded <= 14);
    }
    this.renderEnergy(life.energy,now);
    const warning = life.version === 2 ? { message: previewWarning(life).replace('Create a new test identity.', 'Raise a new Mindling when you are ready.') } : warningFor(life);
    document.querySelector("[data-life-warning] span").textContent = warning.message;
    document.querySelectorAll("[data-activity-mode]").forEach(button => { const rule = LIFE_RULES.activity[button.dataset.activityMode]; button.disabled = life.lifeState === "DECEASED" || life.energy.remaining < rule.energyCost; });
    document.querySelectorAll("[data-care]").forEach(button => { button.disabled = life.lifeState === "DECEASED"; });
    this.tickCareCooldowns();
    document.querySelector("#mindling-input").disabled = life.lifeState === "DECEASED";
    this.#form.querySelector("button[type=submit]").disabled = this.#pending || life.lifeState === "DECEASED";
    if (life.version === 2) document.querySelectorAll('[data-input-mode]').forEach(button => { button.disabled = life.lifeState === 'DECEASED' || life.energy.remaining < LIFE_RULES.activity[button.dataset.inputMode].energyCost; });
    document.querySelector("[data-memorial]").hidden = life.lifeState !== "DECEASED";
    if (life.lifeState === "DECEASED") {
      document.querySelector("[data-memorial-age]").textContent = `Neural age: NC ${String(cycles).padStart(4, "0")}`;
      document.querySelector("[data-memorial-dates]").textContent = `${new Date(life.birthTimestamp).toLocaleDateString()} — ${new Date(life.deathTimestamp).toLocaleDateString()}`;
    }
    if (life.energy.remaining === 0) document.querySelector("[data-energy-message]").hidden = false;
    else document.querySelector("[data-energy-message]").hidden = true;
  }

  renderEnergy(energy,now){
    const label=energyLabel(energy,now);
    document.querySelector('[data-energy-value]').textContent=label.value;
    document.querySelector('[data-energy-progress]').max=label.maximum;
    document.querySelector('[data-energy-progress]').value=label.bar;
    document.querySelector('[data-energy-progress]').textContent=label.value;
    document.querySelector('[data-energy-reset]').textContent=label.text;
  }

  async #care(type) {
    const result = await this.#onCare(type);
    const messages = { NOT_HUNGRY: "Your Mindling is not hungry.", ALREADY_RESTED: "Your Mindling is already resting.", CARE_COOLDOWN: "Your Mindling needs time before receiving more care.", CARE_NOT_NEEDED: "Your Mindling does not need care right now." };
    this.#showStatus(result.accepted ? "Care completed" : result.message || messages[result.reason] || "Care is unavailable");
  }
  tickCareCooldowns() {
    if(this.primaryView!=='dashboard'||document.hidden||this.locked||this.#listeners.signal.aborted||document.querySelector('.dashboard-chrome').classList.contains('is-hidden'))return;
    const life=this.#state?.life,now=Math.max(this.#state?.developmentNow??0,this.#careClock()),ready=[];
    for(const button of this.#careButtons){
      const output=button.querySelector('[data-care-cooldown]'),type=button.dataset.care;
      const last=life?.care?.[type];
      const expiresAt=last==null?now:Number.isFinite(last)?last+LIFE_RULES.care[type].cooldownHours*3600000:NaN;
      const label=life?.lifeState==='ALIVE'?formatCareCooldown(expiresAt,now):'',cooldownComplete=label==='Ready!';
      const availability=button.querySelector('[data-care-availability]');
      let state='unavailable',status='Unavailable';
      if(label&&!button.disabled){
        if(!cooldownComplete){state='cooling';status='Cooling down';}
        else if(basicCareNeeded(life,type)){state='available';status='Available';}
        else status='No care needed';
      }
      if(cooldownComplete&&button.dataset.careState==='cooling')ready.push(button.querySelector('.care-name').textContent);
      if(button.dataset.careState!==state)button.dataset.careState=state;
      if(availability.textContent!==status)availability.textContent=status;
      if(output.textContent!==(label||'—')){
        output.textContent=label||'—';
        output.dataset.ready=String(cooldownComplete);
      }
    }
    if(ready.length)document.querySelector('[data-care-announcement]').textContent=`${ready.join(', ')} cooldown complete.`;
  }

  show() { this.stageChip.setActive(this.primaryView==='dashboard');document.querySelector(".dashboard-chrome").classList.remove("is-hidden");this.tickCareCooldowns(); }
  hide() { this.stageChip.setActive(false);document.querySelector(".dashboard-chrome").classList.add("is-hidden"); }

  setStorageStatus(available) {
    const status = document.querySelector(".storage-status");
    status.hidden = available;
    status.textContent = available ? "" : "Local storage unavailable";
  }

  async #submitInteraction(event) {
    event.preventDefault();
    const input=document.querySelector('#mindling-input');
    if(input.value.length>LEARNING_INPUT_LIMIT){this.#showStatus('Use at most 2,000 characters. Your text has not been submitted.');return;}
    const text=input.value.trim();
    if(!text||this.#pending)return;
    const id=crypto.randomUUID(),activity=this.#mode,submitted=input.value;
    this.#pending=true;
    const submit=this.#form.querySelector("button[type='submit']");
    submit.disabled=true;
    const interaction=this.beginInteraction(id,activity,{inputValue:submitted});
    this.#form.classList.add('processing');
    try{
      const result=await this.#onInput(text,activity,id);
      this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:result.accepted?'accepted':'cancel',activity});
      if(this.interactionToken!==interaction)return;
      this.presentInteraction(id,result);
      if(result.accepted&&input.value===submitted&&!interaction.clarification)input.value='';
    }catch{
      this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:'cancel',activity});
      if(this.interactionToken===interaction)this.presentInteraction(id,{accepted:false});
    }finally{
      this.#form.classList.remove('processing');this.#pending=false;submit.disabled=this.#life?.lifeState==='DECEASED';
      if(this.interactionToken===interaction&&!interaction.clarification&&!input.disabled)input.focus();
    }
  }

  get interactionToken(){return this.#interaction;}
  #current(id){return !this.#listeners.signal.aborted&&isCurrentInteraction(this.#interaction,id,this.#state?.mindlingId);}
  openDashboard(){this.#setPrimaryView('dashboard');}
  beginInteraction(id,activity,{processing=true,inputValue}={}){
    const interaction={id,activity,inputValue,identity:this.#state?.mindlingId};
    this.#interaction=interaction;
    clearTimeout(this.#messageTimer);
    this.#form?.querySelector('.interaction-status')?.classList.remove('visible');
    if(processing)this.#showResponse(id,{state:'processing',message:processingMessage(activity,this.#state?.name)});
    return interaction;
  }
  presentInteraction(id,result){
    if(!this.#current(id))return;
    const interaction=this.#interaction,reply=result?.talkResponse;
    if(result?.needsClarification&&reply?.clarification){this.#showQuestion(id,reply.clarification);return;}
    if(interaction.clarification)return;
    const taskId=result?.learningTaskId||reply?.researchTaskId;
    if(taskId){
      interaction.taskId=taskId;
      interaction.unanswered=interaction.activity==='TALK'&&reply?.insufficientInformation===true;
      if(interaction.activity==='TALK'&&reply?.conversationalAnswer)interaction.priorAnswer=reply.conversationalAnswer;
      this.#refreshResearch();
    }else{
      const message=activityResult(interaction.activity,result,this.#state?.memories);
      const answer=result?.accepted&&interaction.activity==='TALK'&&reply?.answer===message?message:undefined;
      this.#showResponse(id,{state:result?.accepted?'ready':'error',message:answer?'':message,answer});
    }
  }
  canContinueResearch(id){return this.#current(id)&&this.primaryView==='dashboard';}
  showResearchResult(task,id){
    if(!this.canContinueResearch(id)||this.#state?.mindlingId!==task.mindlingId)return;
    this.#interaction.taskId=task.id;
    this.#refreshResearch(task);
  }
  #refreshResearch(latest){
    const interaction=this.#interaction;
    if(!interaction?.taskId||interaction.clarification||!this.canContinueResearch(interaction.id))return;
    const task=this.#state?.learningTasks?.find(item=>item.id===interaction.taskId)||latest;
    if(!task)return;
    if(task.code==='QUERY_REVIEW'&&interaction.reviewing)return;
    const model=researchPresentation(task,this.#state?.memories,{enabled:this.#state?.researchPermissions?.enabled,unanswered:interaction.unanswered});
    if(model.status==='Waiting'&&task.code==='PERMISSION_REQUIRED'&&this.#state?.researchPermissions?.enabled)return;
    const excerpts=interaction.activity==='TALK'?model.excerpts:[];
    const answer=interaction.activity==='TALK'&&!excerpts.length?interaction.priorAnswer:undefined;
    const message=interaction.activity==='DEEP_TRAINING'&&model.learned?'Training complete!':model.message;
    this.#showResponse(interaction.id,{state:model.active?'processing':'ready',message,excerpts,answer});
  }
  #responsePanel(state){
    const panel=document.querySelector('[data-talk-response]');
    panel.hidden=false;panel.dataset.state=state;
    panel.querySelector('h2').textContent=this.#state?.name||'Mindling';
    const container=panel.closest('.right-panel');
    if(this.primaryView==='dashboard'&&matchMedia('(max-width:800px)').matches&&container&&!container.classList.contains('mobile-open')){container.classList.add('mobile-open');this.talkOpenedPanel=true;}
    if(container)container.scrollTop=Math.max(0,panel.offsetTop-container.clientHeight/2);
    return panel;
  }
  #showResponse(id,{state,message,excerpts=[],answer}){
    if(!this.#current(id))return;
    const key=JSON.stringify([state,message,excerpts,answer]);
    if(this.#interaction.viewKey===key)return;
    this.#interaction.viewKey=key;
    renderResponseContent(this.#responsePanel(state),{message,excerpts,answer});
    this.#refreshNotifications();
  }
  #showQuestion(id,model){
    if(!this.#current(id)||this.#interaction.clarification?.id===model.id)return;
    this.#interaction.clarification=model;this.#interaction.viewKey=null;
    renderClarificationContent(this.#responsePanel('clarification'),model,this.#onClarification?choice=>this.#resumeClarification(model,choice):null);
    this.#refreshNotifications();
  }
  #refreshNotifications(){
    if(!this.#state)return;
    const activeTaskId=this.primaryView==='dashboard'?this.#interaction?.clarification?.taskId:null;
    this.notifications?.update(this.#state,{activeTaskId});
  }
  showResearchAccess(task,id,topic){
    if(!this.canContinueResearch(id)||this.#state?.mindlingId!==task.mindlingId)return;
    const interaction=this.#interaction;
    interaction.taskId=task.id;interaction.reviewing=true;
    this.#showResponse(id,{state:'ready',message:topic?'Is this a public topic I can research?':'I can only look up public topics. Can you tell me a little more?'});
    if(!topic)return;
    const panel=document.querySelector('[data-talk-response]'),content=panel.querySelector('[data-talk-content]');
    if(content.querySelector('button'))return;
    const button=document.createElement('button');button.type='button';button.textContent=`Confirm public topic: ${topic}`;content.append(button);
    button.addEventListener('click',async()=>{
      if(this.#pending||!this.onLearningTask||this.interactionToken!==interaction)return;
      button.disabled=true;
      try{
        await this.onLearningTask('review-topic',task.id,{choice:'confirm-subject'});
        if(this.interactionToken===interaction){interaction.reviewing=false;this.#refreshResearch();}
      }catch{
        if(this.interactionToken===interaction)panel.querySelector('[data-talk-status]').textContent=this.#state?.researchPermissions?.enabled?"I couldn't use that topic.":'Turn on Research first if you’d like me to explore this.';
      }finally{button.disabled=false;}
    });
  }

  async #resumeClarification(model,choice){
    if(this.#pending||!this.#current(model.requestId)||this.#interaction.clarification!==model||!this.#onClarification)return;
    const interaction=this.#interaction,panel=document.querySelector('[data-talk-response]');
    const status=panel.querySelector('[data-talk-status]'),controls=[...panel.querySelectorAll('button:not([data-dismiss-talk])')];
    this.#pending=true;controls.forEach(button=>button.disabled=true);this.#form.classList.add('processing');
    status.textContent=processingMessage(model.activity,this.#state?.name);
    const current=()=>this.interactionToken===interaction&&this.#current(model.requestId);
    try{
      const result=await this.#onClarification(model.id,choice);
      if(!current())return;
      if(result?.needsClarification||result?.accepted){
        interaction.clarification=null;
        this.presentInteraction(model.requestId,result);
        const input=document.querySelector('#mindling-input');
        if(result.accepted&&input.value===interaction.inputValue)input.value='';
      }else status.textContent=activityResult(model.activity,result);
    }catch{if(current())status.textContent="I couldn't continue with that answer.";}
    finally{
      this.#pending=false;this.#form.classList.remove('processing');controls.forEach(button=>button.disabled=false);
      if(current()&&interaction.clarification===model)controls[0]?.focus();
    }
  }
  showClarification(reply,previous=this.#interaction){
    if(previous!==this.#interaction||this.#listeners.signal.aborted)return;
    const model=reply?.clarification;if(!model)return;
    if(!this.#current(model.requestId))this.beginInteraction(model.requestId,model.activity,{processing:false});
    this.#setPrimaryView('dashboard');
    this.#showQuestion(model.requestId,model);
  }

  destroy() {
    if (this.#listeners.signal.aborted) return;
    this.researchAccess?.destroy();this.notifications?.destroy();
    this.#listeners.abort();
    this.#setPrimaryView("dashboard",false);
    this.#memoryMap.destroy();
    this.#development.destroy();
    this.integration.destroy();
    this.stageChip.destroy();
    this.#unsubscribe?.();
    this.#eventUnsubscribes.forEach(unsubscribe => unsubscribe());
    this.#form?.removeEventListener("submit", this.#handleSubmit);
    clearTimeout(this.#messageTimer);
  }
}
