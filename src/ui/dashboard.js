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
import { formatLifePercentage } from './life-format.js';
import { STAGES } from '../preview/evolution-model.js';
import { previewWarning } from '../preview/sandbox/life.js';

export class Dashboard {
  #unsubscribe;
  #memoryMap;
  #development;
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

  constructor(events, { onInput, onCare, onNewMindling, onViewChange, onLearningTask=null, onClarification=null, onCancelClarification=null, onResearchAccess=null, readOnly = false } = {}) {
    this.#onResearchAccess=onResearchAccess;this.onLearningTask=onLearningTask;this.#onClarification=onClarification;this.#onCancelClarification=onCancelClarification;
    this.stageChip=new StageChip(document.querySelector('[data-life-stage]'));
    this.primaryView='dashboard';
    this.#memoryMap = new NeuralMemoryView(document.querySelector("#memory-view"),{onLearningTask});
    this.#development = new DevelopmentView(document.querySelector("#development-view"));
    this.#onViewChange = onViewChange;
    this.#readOnly = readOnly;
    this.#events = events;
    this.#onInput = onInput;
    this.#onCare = onCare;
    this.#onNewMindling = onNewMindling;
    this.#unsubscribe = events.on(EVENTS.STATE_READY, (state) => this.render(state));
    this.#eventUnsubscribes = [
      events.on(EVENTS.MEMORY_CREATED, () => this.#showStatus("Memory formed")),
      events.on(EVENTS.MEMORY_REINFORCED, () => this.#showStatus("Memory reinforced")),
      events.on(EVENTS.LEARNING_FAILED, () => this.#showStatus("Learning could not be saved")),
      events.on(EVENTS.EVENT_HANDLER_FAILED, () => this.#showStatus("A dashboard update could not be completed")),
      events.on(EVENTS.LIFE_UPDATED, life => this.#renderLife(life))
    ];
    this.#mountResearchSettings();
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
    this.#listen(document.querySelector("[data-close-network]"), "click", () => { document.querySelector("#network-view").hidden = true; });
    document.querySelectorAll("[data-mobile-view]").forEach(button => this.#listen(button, "click", () => this.#openMobileView(button.dataset.mobileView)));
    this.#listen(document.querySelector("[data-download-profile]"), "click", () => { if (this.#state) downloadMindlingProfile(this.#state, this.#life); });
    this.#listen(document.querySelector('[data-dismiss-talk]'),'click',()=>{this.#onCancelClarification?.();this.talkDismissed=true;document.querySelector('[data-talk-response]').hidden=true;if(this.talkOpenedPanel)document.querySelector('.right-panel').classList.remove('mobile-open');this.talkOpenedPanel=false;});
    this.#listen(document.querySelector("#mindling-input"), "focus", () => document.documentElement.classList.add("input-active"));
    this.#listen(document.querySelector("#mindling-input"), "blur", () => document.documentElement.classList.remove("input-active"));
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
    if(this.#state?.mindlingId!==state.mindlingId){this.researchDialog?.close();this.#onCancelClarification?.();document.querySelector('[data-talk-response]').hidden=true;this.talkRequest=null;this.talkDismissed=false;}
    this.#state = state;
    if(this.researchSetting&&!this.researchDialog.open){this.researchSetting.checked=Boolean(state.researchPermissions?.enabled);}
    const learningStatus=this.researchDialog?.querySelector('[data-autonomous-status]');if(learningStatus)learningStatus.textContent=`Autonomous learning: ${state.autonomousStatus||'PAUSED'}${state.autonomousReason?' — '+state.autonomousReason:''}`;
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
  }

  #setPrimaryView(view) {
    this.primaryView=view;this.stageChip.setActive(view==='dashboard');
    const memory = view === "memories", development = view === "development";
    document.querySelector("#development-view").hidden = !development;
    this.#development.setVisible(development);
    document.querySelector("#app").classList.toggle("development-mode", development);
    document.querySelector("#memory-view").hidden = !memory;
    this.#memoryMap.setVisible(memory);
    document.querySelector("#app").classList.toggle("memory-mode", memory);
    document.querySelectorAll("[data-view]").forEach(item => { const active = item.dataset.view === view; item.classList.toggle("active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
    document.querySelectorAll("[data-mobile-view]").forEach(item => item.classList.toggle("active", item.dataset.mobileView === (memory ? "memories" : "dashboard")));
    this.#onViewChange?.(view);
  }

  #openMobileView(view) {
    const left = document.querySelector(".left-stack"); const right = document.querySelector(".right-panel");
    left.classList.toggle("mobile-open", view === "development"); right.classList.toggle("mobile-open", view === "dashboard");
    this.#setPrimaryView(view === "memories" ? "memories" : "dashboard");
    document.querySelector("#network-view").hidden = view !== "network";
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
  show() { this.stageChip.setActive(this.primaryView==='dashboard');document.querySelector(".dashboard-chrome").classList.remove("is-hidden"); }
  hide() { this.stageChip.setActive(false);document.querySelector(".dashboard-chrome").classList.add("is-hidden"); }

  setStorageStatus(available) {
    const status = document.querySelector(".storage-status");
    status.hidden = available;
    status.textContent = available ? "" : "Local storage unavailable";
  }

  async #submitInteraction(event) {
    event.preventDefault();
    const input = document.querySelector("#mindling-input");
    if (input.value.length > LEARNING_INPUT_LIMIT) { this.#showStatus('Use at most 2,000 characters. Your text has not been submitted.'); return; }
    const text = input.value.trim();
    if (!text || this.#pending) return;
    this.#pending = true; const submit = this.#form.querySelector("button[type='submit']"); submit.disabled = true;
    const id=crypto.randomUUID();this.beginInteraction(id);
    this.#form.classList.add('processing');
    if(this.#mode==='TALK')this.showTalkResponse({id,state:'processing'});
    this.#showStatus("Understanding request");
    try {
      const result = await this.#onInput(text, this.#mode, id);
      this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:result.accepted?'accepted':'cancel',activity:this.#mode});
      if(result.needsClarification)this.showTalkResponse({id,state:'clarification',reply:result.talkResponse});
      else if(this.#mode==='TALK')this.showTalkResponse({id,state:result.accepted?'ready':'error',reply:result.talkResponse,message:result.message||'Talk was not accepted. No Energy was spent.'});
      if (result.accepted) { input.value = ""; this.#showStatus(result.message || `${LIFE_RULES.activity[this.#mode].label} completed`); }
      else this.#showStatus(result.message || (result.reason === "OUT_OF_ENERGY" ? "Out of energy" : result.reason === "MINDLING_DECEASED" ? "This Mindling is deceased" : "Activity was not accepted"));
    } catch { if(this.#mode==='TALK')this.showTalkResponse({id,state:'error',message:'Talk could not complete. No response was generated.'});this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:'cancel'});this.#showStatus("Activity could not be saved"); }
    finally { this.#form.classList.remove('processing');this.#pending = false; submit.disabled = this.#life?.lifeState === 'DECEASED'; if (!input.disabled) input.focus(); }
  }

  showTalkResponse({id,state,reply,message}) {
    if(this.#listeners.signal.aborted)return;
    if(state==='processing'||state==='clarification'){this.talkRequest=id;this.talkDismissed=false;}
    if(this.talkRequest!==id||this.talkDismissed)return;
    const panel=document.querySelector('[data-talk-response]'),status=panel.querySelector('[data-talk-status]'),content=panel.querySelector('[data-talk-content]');
    panel.hidden=false;panel.dataset.state=state;content.replaceChildren();
    const container=panel.closest('.right-panel');
    if(this.primaryView==='dashboard'&&matchMedia('(max-width:800px)').matches&&container&&!container.classList.contains('mobile-open')){container.classList.add('mobile-open');this.talkOpenedPanel=true;}
    if(container)container.scrollTop=Math.max(0,panel.offsetTop-container.clientHeight/2);
    if(state==='processing'){status.textContent='Preparing a response from your stored knowledge…';return;}
    if(state==='error'){status.textContent=message||'A valid Talk response is unavailable. No Energy was spent.';return;}
    if(!reply){status.textContent='No validated response was returned.';return;}
    if(reply.researchAccess){this.#renderResearchAccess(content,status,reply.researchAccess);return;}
    if(reply.clarification){
      const model=reply.clarification;status.textContent='';const question=document.createElement('p');question.textContent=model.question;content.append(question);
      const choices=document.createElement('div');choices.className='clarification-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',model.question);
      for(const option of model.options){const button=document.createElement('button');button.type='button';button.textContent=option.label;button.disabled=!this.#onClarification;button.addEventListener('click',()=>this.#resumeClarification(model,option.id));choices.append(button);}content.append(choices);
      if(model.freeText){const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),send=document.createElement('button');label.textContent='Your clarification';input.maxLength=300;input.required=true;input.setAttribute('aria-label',model.question);send.type='submit';send.textContent='Continue';label.append(input);label.className='clarification-input';form.className='clarification-form';form.append(label,send);form.addEventListener('submit',event=>{event.preventDefault();if(input.reportValidity())this.#resumeClarification(model,'text',input.value);});content.append(form);}
      this.clarificationInputValue=document.querySelector('#mindling-input').value;return;
    }
    status.textContent=reply.memoryIds.length?`${reply.memoryIds.length} stored memories referenced · ${reply.uncertainty} uncertainty${reply.insufficientInformation?' · Limited supporting knowledge':''}`:'No relevant stored knowledge available';
    const answer=document.createElement('p');answer.textContent=reply.answer;content.append(answer);
    if(reply.sources?.length){const list=document.createElement('ol');list.className='research-citations';for(const source of reply.sources.slice(0,3)){let url;try{url=new URL(source.url);}catch{continue;}if(url.protocol!=='https:'||url.username||url.password)continue;const item=document.createElement('li'),link=document.createElement('a');link.href=url.href;link.textContent=source.title||url.hostname;link.target='_blank';link.rel='noopener noreferrer';item.append(link);if(source.publishedAt)item.append(document.createTextNode(` · ${source.publishedAt}`));list.append(item);}content.append(list);}
  }

  openDashboard(){this.#setPrimaryView('dashboard');}
  beginInteraction(id){this.latestInteraction=id;this.talkDismissed=false;}
  canContinueResearch(id){return !this.#listeners.signal.aborted&&this.latestInteraction===id&&this.primaryView==='dashboard'&&!this.talkDismissed;}
  showResearchResult(task,id,reply){if(!this.canContinueResearch(id)||this.#state?.mindlingId!==task.mindlingId)return;this.talkRequest=id;this.showTalkResponse({id,state:'ready',reply});}
  showResearchAccess(task,id,topic){
    if(!this.canContinueResearch(id)||this.#state?.mindlingId!==task.mindlingId)return;
    this.talkRequest=id;this.showTalkResponse({id,state:'ready',reply:{researchAccess:{taskId:task.id,requestId:id,topic},memoryIds:[]}});
  }
  #renderResearchAccess(content,status,access){
    status.textContent='Mindling research access';
    const copy=document.createElement('p');copy.textContent='Enable autonomous learning? Mindling can research public topics, follow useful knowledge gaps and retain source-attributed memories while this app is active. The existing AI connection and hosted web search may incur charges: at most 3 automatically initiated tasks per UTC day, 2 web tool calls and 4 inference requests per task. Private memories, identity keys and wallet data are not shared. This does not authorize publishing, purchases or account changes. You can disable it at any time in Settings.';content.append(copy);
    const label=document.createElement('label'),input=document.createElement('input');label.className='clarification-input';label.textContent=access.topic===null?'Public topic to share (omit private details)':'Public topic';input.value=access.topic||'';input.maxLength=120;input.required=true;label.append(input);content.append(label);
    const choices=document.createElement('div');choices.className='clarification-choices';
    for(const [enabled,text]of [[true,'Allow & continue'],[false,'Not now']]){const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=!this.onLearningTask;button.addEventListener('click',async()=>{
      if(this.#pending||this.latestInteraction!==access.requestId)return;if(enabled&&!input.reportValidity())return;this.#pending=true;choices.querySelectorAll('button').forEach(node=>node.disabled=true);const identity=this.#state?.mindlingId;
      try{const result=await this.onLearningTask('consent',access.taskId,{enabled,topic:input.value.trim(),capability:'autonomous'});if(this.latestInteraction===access.requestId&&this.#state?.mindlingId===identity&&!this.talkDismissed&&content.isConnected){status.textContent=result.message;if(!enabled)content.replaceChildren();}}
      catch(error){if(this.latestInteraction===access.requestId&&this.#state?.mindlingId===identity)status.textContent=error.message;}
      finally{this.#pending=false;choices.querySelectorAll('button').forEach(node=>node.disabled=false);}
    });choices.append(button);}content.append(choices);
  }
  #mountResearchSettings(){
    if(!this.#onResearchAccess)return;
    const footer=document.querySelector('.footer-links'),open=document.createElement('button'),dialog=document.createElement('dialog');open.type='button';open.textContent='Settings';open.className='research-settings-link';
    dialog.className='research-settings glass-panel';dialog.setAttribute('aria-labelledby','research-settings-title');
    dialog.innerHTML='<h2 id="research-settings-title">Mindling settings</h2><label><input type="checkbox" data-planning-access> Enable autonomous learning</label><p>Mindling researches public topics and follows useful knowledge gaps while the app is active. The existing AI connection and hosted web search may incur charges. Automatic tasks: at most 3 per UTC day, 10 minutes apart. Each task: at most 2 web tool calls, 4 inference requests and 3 accepted memories. No private memories, identity keys or wallet data are shared. External actions require separate authorization. Disabling stops active work and prevents new memory integration.</p><p data-autonomous-status role="status"></p><p data-settings-feedback role="status"></p><div class="clarification-choices"><button type="button" data-save-access>Save</button><button type="button" data-close-settings>Close</button></div>';

    this.researchSetting=dialog.querySelector('[data-planning-access]');document.querySelector('#app').append(dialog);footer.append(open);this.researchDialog=dialog;this.researchSettingsButton=open;
    this.#listen(open,'click',()=>{this.researchSetting.checked=Boolean(this.#state?.researchPermissions?.enabled);dialog.showModal();});this.#listen(dialog.querySelector('[data-close-settings]'),'click',()=>dialog.close());
    this.#listen(dialog.querySelector('[data-save-access]'),'click',async event=>{const button=event.currentTarget,identity=this.#state?.mindlingId;button.disabled=true;try{await this.#onResearchAccess(this.researchSetting.checked);if(this.#state?.mindlingId===identity)dialog.querySelector('[data-settings-feedback]').textContent='Access preference saved.';}catch(error){dialog.querySelector('[data-settings-feedback]').textContent=error.message;}finally{button.disabled=false;}});
  }

  async #resumeClarification(model,choice,detail=''){
    if(this.#pending||this.talkDismissed||this.talkRequest!==model.requestId||!this.#onClarification)return;
    this.#pending=true;const identity=this.#state?.mindlingId,panel=document.querySelector('[data-talk-response]'),controls=[...panel.querySelectorAll('button:not([data-dismiss-talk]),input')];controls.forEach(node=>node.disabled=true);this.#form.classList.add('processing');
    const current=()=>!this.#listeners.signal.aborted&&!this.talkDismissed&&this.talkRequest===model.requestId&&this.#state?.mindlingId===identity;
    try{
      const result=await this.#onClarification(model.id,choice,detail);
      if(!current())return;
      if(result?.needsClarification)this.showTalkResponse({id:model.requestId,state:'clarification',reply:result.talkResponse});
      else if(result?.accepted&&result.talkResponse)this.showTalkResponse({id:model.requestId,state:'ready',reply:result.talkResponse});
      else if(result?.accepted){panel.hidden=true;this.#showStatus(result.message||'Request continued.');}
      else panel.querySelector('[data-talk-status]').textContent=result?.message||'The request could not continue. No clarification charge was made.';
      const input=document.querySelector('#mindling-input');if(result?.accepted&&input.value===this.clarificationInputValue)input.value='';
    }catch(error){if(current())panel.querySelector('[data-talk-status]').textContent=error.message||'Clarification could not continue.';}
    finally{this.#pending=false;this.#form.classList.remove('processing');controls.forEach(node=>node.disabled=false);}
  }
  showClarification(reply){this.beginInteraction(reply.clarification.requestId);this.#setPrimaryView('dashboard');this.showTalkResponse({id:reply.clarification.requestId,state:'clarification',reply});}

  destroy() {
    if (this.#listeners.signal.aborted) return;
    this.researchDialog?.close();this.researchDialog?.remove();this.researchSettingsButton?.remove();
    this.#listeners.abort();
    this.#setPrimaryView("dashboard");
    this.#memoryMap.destroy();
    this.#development.destroy();
    this.stageChip.destroy();
    this.#unsubscribe?.();
    this.#eventUnsubscribes.forEach(unsubscribe => unsubscribe());
    this.#form?.removeEventListener("submit", this.#handleSubmit);
    clearTimeout(this.#messageTimer);
  }
}
