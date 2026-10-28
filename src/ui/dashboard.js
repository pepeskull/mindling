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

  constructor(events, { onInput, onCare, onNewMindling, onViewChange, onLearningTask=null, readOnly = false } = {}) {
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
    this.#listen(document.querySelector('[data-dismiss-talk]'),'click',()=>{this.talkDismissed=true;document.querySelector('[data-talk-response]').hidden=true;if(this.talkOpenedPanel)document.querySelector('.right-panel').classList.remove('mobile-open');this.talkOpenedPanel=false;});
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
    if(this.#state?.mindlingId!==state.mindlingId){document.querySelector('[data-talk-response]').hidden=true;this.talkRequest=null;this.talkDismissed=false;}
    this.#state = state;
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
    const pathways = livePathways(graphData(state).distribution);
    document.querySelector('.pathways-copy').textContent = Array.from({ length: 3 }, (_, index) => pathways[index]?.title || 'Emerging Pathway').join(' · ');
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
    const id=crypto.randomUUID();
    this.#form.classList.add('processing');
    if(this.#mode==='TALK')this.showTalkResponse({id,state:'processing'});
    this.#showStatus("Understanding request");
    try {
      const result = await this.#onInput(text, this.#mode, id);
      this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:result.accepted?'accepted':'cancel',activity:this.#mode});
      if(this.#mode==='TALK')this.showTalkResponse({id,state:result.accepted?'ready':'error',reply:result.talkResponse,message:result.message||'Talk was not accepted. No Energy was spent.'});
      if (result.accepted) { input.value = ""; this.#showStatus(result.message || `${LIFE_RULES.activity[this.#mode].label} completed`); }
      else this.#showStatus(result.message || (result.reason === "OUT_OF_ENERGY" ? "Out of energy" : result.reason === "MINDLING_DECEASED" ? "This Mindling is deceased" : "Activity was not accepted"));
    } catch { if(this.#mode==='TALK')this.showTalkResponse({id,state:'error',message:'Talk could not complete. No response was generated.'});this.#events.emit(EVENTS.NEURAL_INPUT,{id,phase:'cancel'});this.#showStatus("Activity could not be saved"); }
    finally { this.#form.classList.remove('processing');this.#pending = false; submit.disabled = this.#life?.lifeState === 'DECEASED'; if (!input.disabled) input.focus(); }
  }

  showTalkResponse({id,state,reply,message}) {
    if(this.#listeners.signal.aborted)return;
    if(state==='processing'){this.talkRequest=id;this.talkDismissed=false;}
    if(this.talkRequest!==id||this.talkDismissed)return;
    const panel=document.querySelector('[data-talk-response]'),status=panel.querySelector('[data-talk-status]'),content=panel.querySelector('[data-talk-content]');
    panel.hidden=false;panel.dataset.state=state;content.replaceChildren();
    const container=panel.closest('.right-panel');
    if(this.primaryView==='dashboard'&&matchMedia('(max-width:800px)').matches&&container&&!container.classList.contains('mobile-open')){container.classList.add('mobile-open');this.talkOpenedPanel=true;}
    if(container)container.scrollTop=Math.max(0,panel.offsetTop-container.clientHeight/2);
    if(state==='processing'){status.textContent='Preparing a response from your stored knowledge…';return;}
    if(state==='error'){status.textContent=message||'A valid Talk response is unavailable. No Energy was spent.';return;}
    if(!reply){status.textContent='No validated response was returned.';return;}
    status.textContent=reply.memoryIds.length?`${reply.memoryIds.length} stored memories referenced · ${reply.uncertainty} uncertainty${reply.insufficientInformation?' · Limited supporting knowledge':''}`:'No relevant stored knowledge available';
    const answer=document.createElement('p');answer.textContent=reply.answer;content.append(answer);
  }

  destroy() {
    if (this.#listeners.signal.aborted) return;
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
