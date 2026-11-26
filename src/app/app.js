import { EnergyClient } from '../payment/energy-client.js';
import { TopUp } from '../payment/top-up.js';
import { energyAt } from '../economy/energy.js';
import { reconcileSemanticConnections, semanticHydrationStatus } from '../semantic/memory-connections.js';
import { repairCorrectionMetadata } from '../learning/correction-metadata-repair.js';
import { knowledgeTalk } from '../cognition/talk-response.js';
import { interpretInteraction } from '../learning/clarification.js';
import { learningEngine, stopLearning, learningSession, researchPermissions, syncResearchPermissions } from '../autonomous/learning-engine.js';
import { DAILY_RESEARCH_PAUSE } from '../autonomous/research-xp.js';
import { conversationCopy } from '../cognition/conversation-language.js';
import { CognitiveEngine } from '../cognition/cognitive-engine.js';
import { energyCapacityForStage } from '../economy/energy.js';
import { EvolutionPreview } from '../preview/evolution-preview.js';
import { AutomaticNetworkCountdown } from '../preview/automatic-playback.js';
import { STAGES } from '../preview/evolution-model.js';
import { teachMemory } from '../learning/teach-memory.js';
import { talk, eligibility } from '../preview/sandbox/engine.js';
import { carePreview } from '../preview/sandbox/life.js';
import { LIFE_RULES } from '../life/life-system.js';
import { MindlingDatabase } from '../storage/database.js';
import { Onboarding } from '../ui/onboarding.js';
import { createLocalIdentity } from '../identity/identity.js';
import { EVENTS } from './events.js';
import { advanceGameplay, createGameplayMindling, dashboardLife, dashboardState } from './gameplay-state.js';

// Share rendering and pure gameplay rules, never preview fixtures, time or wallets.
export class MindlingApp extends EvolutionPreview {
  constructor() {
    super({ interactive: true, autoPlay: false, autoNetwork: true, snapshotProvider: null, canonicalBrain:true });
    this.db = new MindlingDatabase(); this.listeners = new AbortController();
    this.energyClient = new EnergyClient(this);
    // Keep cognition available internally without mounting a training interface.
    this.cognition = new CognitiveEngine({ events:this.events, store:{
      load:id=>this.db.trainingHistory(id),
      transport:(kind,id)=>this.energyClient.transport(kind,id),
      source:id=>{this.external?.assertWritable();return this.db.trainingSource(id);},
      save:record=>{this.external?.assertWritable();return this.db.saveTraining(record);}
    } });
    this.dashboardOptions = {
      onInput: (text, activity, id) => this.submitInput(text, activity, id),
      onCare: type => this.performCare(type),
      onNewMindling: () => this.beginNewMindling()
    };
  }

  async start() {
    await this.db.open();
    if (this.disposed) { this.db.close(); return; }
    try{
      this.state = await this.db.changeGameplay(s => reconcileSemanticConnections(repairCorrectionMetadata(advanceGameplay(s))));
      semanticHydrationStatus('COMMITTED');
    }catch(error){semanticHydrationStatus('FAILED');throw error;}
    if (this.disposed) { this.db.close(); return; }
    this.seedModel = this.state.mind ? { nodes: this.state.mind.nodes, synapses: this.state.mind.synapses, stage:this.state.mind.stage } : null;
    this.stabilityRow = document.createElement('div');
    this.stabilityRow.className = 'life-attribute'; this.stabilityRow.dataset.lifeAttribute = 'neuralStability';
    this.stabilityRow.innerHTML = '<svg class="life-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg><label>Neural Stability</label><strong>—</strong><progress aria-label="Neural Stability" max="100" value="100">100%</progress>';
    document.querySelector('[data-life-warning]').before(this.stabilityRow);
    document.querySelector('#app').classList.add('gameplay-mode');
    await super.start();
    if (this.disposed) return;
    this.dashboard.setStorageStatus(true);
    this.topUp = new TopUp(this.energyClient,this.listeners.signal);
    this.interaction.connect(this.host, {
      onTap: event => {
        if(this.external?.tap(event))return;
        if (!this.state.mind) return;
        const hit = this.seed.selectSynapseAt(event);
        if (hit === undefined) return;
        if (!hit?.id) {this.events.emit(EVENTS.SCENE_SELECTION,null);return;}
        this.view.selectedCanonical = null;
        this.events.emit(EVENTS.SCENE_SELECTION, hit);
      },
      onHover: event => { this.seed.hoverAt?.(event); }
    });
    this.events.on(EVENTS.MEMORY_SELECTED, route => { this.seed.highlightRoute(route); this.view.selectedCanonical = route?.neuronIds?.[0] || null; });
    this.renderState();
    if (this.state.mind) {this.dashboard.show();void this.syncEnergy();} else this.showOnboarding();
    this.lifeTimer = setInterval(() => this.refreshState(), 60_000);
    this.energyTimer=setInterval(()=>{if(!this.external?.locked&&this.state?.mind){
      this.dashboard.renderEnergy(this.state.mind.energy,Date.now());
      this.dashboard.tickCareCooldowns();
      const e=this.state.mind.energy;
      if(!this.pendingMutations&&eligibility({...this.state,now:Date.now()}).eligible)this.refreshState();
      else if(e.version===2&&e.remaining-e.bonus<energyCapacityForStage(this.state.mind.stage)&&Date.now()>=e.updatedAt+720000&&!this.pendingMutations)this.refreshState();
    }},1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {void this.refreshState();void this.syncEnergy();}
    }, { signal: this.listeners.signal });
    window.addEventListener('online',()=>void this.syncEnergy(),{signal:this.listeners.signal});
  }

  async change(reducer = state => state, options = {}) {
    this.external?.assertWritable();this.pendingMutations=(this.pendingMutations||0)+1;
    try {
      const activity=options.energyOperation;
      const operationId=activity&&this.state?.mind?.energyAuthority?
        await this.energyClient.operation(activity.kind,activity.id):null;
      let localCommit;
      const state=await this.db.changeGameplay(saved=>{
        this.external?.assertWritable();
        const initial=options.preserveGameplay?saved:advanceGameplay(saved);
        const current=initial.mind?.energy,previousXP=initial.mind?.lifetimeXP;
        const updated=reducer(initial);
        if(operationId&&updated.mind?.energyAuthority){
          const mind=updated.mind,authority=mind.energyAuthority;
          const baseline=energyAt(current,updated.now);
          const cost=baseline.remaining-mind.energy.remaining;
          if(!Number.isSafeInteger(cost)||cost<0||cost>3)throw Error('Invalid Energy settlement.');
          mind.energy=baseline;
          const research=updated.mind.learningTasks?.find(item=>item.id===activity.id);
          const memoryHashes=research?(research.knowledgeIds||[]).flatMap(id=>{
            const memory=mind.memories.find(item=>item.id===id);
            return memory?.research?.taskId===activity.id?[memory.research.quoteHash]:[];
          }):undefined;
          localCommit={id:operationId,cost,memoryHashes,awardedXP:mind.lifetimeXP-previousXP};
          authority.pending=[...(authority.pending||[]).filter(item=>item.id!==operationId),localCommit];
        }
        return updated;
      },options);
      if (!this.disposed) { this.state=state; this.renderState(); }
      if(localCommit&&!this.disposed){
        try {await this.energyClient.finish(localCommit,state.mind.id);}
        catch {this.dashboard.showEnergySyncStatus('Energy settlement pending. Your saved progress is available locally.');}
      }
      return this.state||state;
    } finally { this.pendingMutations--; }
  }

  async syncEnergy(){
    if(this.disposed||this.external?.locked||!this.state?.mind)return;
    const id=this.state.mind.id;
    try{
      const ready=await this.energyClient.sync();
      if(ready===true&&!this.disposed&&this.state.mind?.id===id&&this.state.mind.life.lifeState==='ALIVE')this.topUp?.enable(id);
    }catch(error){if(this.state?.mind?.id===id)this.dashboard?.showEnergySyncStatus(error.message);}
  }

  async refreshState() {
    if (this.disposed || this.external?.locked) return;
    const stage=this.state?.mind?.stage;
    try {
      await this.change();
      if(stage!==this.state?.mind?.stage)void this.syncEnergy();
    } catch { if (!this.disposed) this.dashboard.setStorageStatus(false); }
  }

  async submitInput(text, activity, id, {continuation=null}={}) {
    try {
      await this.change();
      const m = this.state.mind;
      if (!m || m.life.lifeState !== 'ALIVE') return { accepted: false, reason: 'MINDLING_DECEASED' };
      const rule = LIFE_RULES.activity[activity];
      if (!rule) throw Error('Unknown activity');
      if (typeof text !== 'string' || text.length > 2000) throw Error('Share a short, readable claim.');
      const input=interpretInteraction(this,text,activity,id,continuation),{interpretation}=input;
      if(input.result)return input.result;
      if (m.energy.remaining < rule.energyCost&&!input.paid) return { accepted: false, reason: 'OUT_OF_ENERGY' };
      input.guard();
      if(input.taskId&&input.paid){
        const task=await learningEngine(this).prepare(interpretation,id,{taskId:input.taskId,guard:input.guard});
        learningEngine(this).follow(task,id);learningEngine(this).startIfAuthorized(task);
        return {accepted:true,message:'Research request clarified. No additional Energy spent.',talkResponse:learningEngine(this).reply(task)};
      }
      if(interpretation.requiresResearch){
        this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity});
        const task=await learningEngine(this).prepare(interpretation,id,{taskId:input.taskId,guard:input.guard});
        learningEngine(this).startIfAuthorized(task);
        return {accepted:true,message:`${task.message} Rewards apply only after qualifying learning is saved.`,learningTaskId:task.id};
      }
      if (activity === 'TALK') {
        const reply=await knowledgeTalk(this,text,id,{journal:true,interpretation,guard:input.guard});
        const memory=m.memories.find(item=>item.id===reply.memoryIds[0]);
        if(memory)this.seed.highlightRoute({neuronIds:memory.neuronIds||[],synapseIds:memory.synapseIds||[]});
        return {accepted:true,message:reply.energySpent===0?'Existing research task reused · no Energy spent.':'Talk completed · 1 Energy spent.',talkResponse:reply};
      } else {
        text=interpretation.factText||text;
        this.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity});
        const {event,message}=await teachMemory(this,{id,text,activity,taskId:input.taskId},{guard:input.guard,journal:true});
        const memory = this.state.mind.memories.find(item => item.id === (event?.memoryIds?.[0] || id));
        const edge = this.state.mind.synapses.find(item => item.id === memory?.synapseIds?.[0]);
        if (edge) this.seed.signal({entry:false,source:edge.from,destination:edge.to,synapse:edge.id,outcome:event?.kind==='reinforcement'?'REINFORCEMENT':'MEMORY_FORMATION'});
        return {accepted:true,message,learningEvent:event};
      }
    } catch (error) {
      if (!this.disposed) await this.refreshState();
      if(error.code===DAILY_RESEARCH_PAUSE)return {accepted:false,reason:error.code,message:conversationCopy(text).pause};
      return { accepted: false, reason: 'ACTIVITY_UNAVAILABLE', message: error.message?.replaceAll('virtual time', 'time').replaceAll('virtual day', 'UTC day').replaceAll('test Mindling', 'Mindling').replace('Sandbox memory capacity', 'Local memory capacity') || 'Activity is unavailable. No Energy or rewards changed.' };
    }
  }

  async performCare(type) {
    try { await this.change(s => carePreview(s, type)); return { accepted: true }; }
    catch (error) { await this.refreshState(); return { accepted: false, message: error.message }; }
  }

  showOnboarding() {
    this.external?.assertWritable();
    this.dashboard.hide();this.primaryViewChanged('onboarding');
    this.onboarding = new Onboarding(document.querySelector('#onboarding'), async draft => {
      await this.onboarding.birth(draft.name,{
        create:async()=>{
          const identity=await createLocalIdentity();
          await this.change(s=>createGameplayMindling(s,draft,identity),{identity});
        }
      });
      if (this.disposed) return;
      this.onboarding.hide();this.view.claimRenderer();this.dashboard.openDashboard(); this.dashboard.show(); this.renderState();void this.syncEnergy();document.querySelector('#mindling-input').focus();
    },{three:this.view.three});
    this.onboarding.show();
  }

  async beginNewMindling() {
    await this.change();
    if (this.state.mind?.life.lifeState === 'DECEASED') this.showOnboarding();
  }

  renderState() {
    syncResearchPermissions(this);
    this.cognition.setActiveMindling(this.state.mind?.id || null);
    if (this.external?.locked || !this.view || !this.dashboard || !this.state.mind) return;
    const m = this.state.mind;
    this.deceased = m.life.lifeState === 'DECEASED';
    if(this.topUp)this.topUp.button.disabled=this.deceased||this.topUp.identity!==m.id;
    if (this.identityId !== m.id) { this.identityId = m.id; this.clearBrainActivity(); this.seed.setSelection(null); this.countdown = new AutomaticNetworkCountdown(); this.timeline.network.reset(); this.view.selectedCanonical = null; this.events.emit(EVENTS.SCENE_SELECTION,null); }
    if (this.timeline.stage !== m.stage) { this.timeline.select(m.stage); this.syncStage(); }
    this.host.dataset.stage = String(m.stage);
    this.seed.update({ nodes: m.nodes, synapses: m.synapses, stage:m.stage });
    this.dashboard.render({...dashboardState(m),developmentNow:this.state.now,learningSession:learningSession(this),autonomousStatus:learningEngine(this).status,autonomousReason:learningEngine(this).diagnostics.reason,autonomousTask:learningEngine(this).diagnostics.topic,researchPermissions:researchPermissions(this)});
    this.events.emit(EVENTS.LIFE_UPDATED, dashboardLife(this.state));
    document.querySelectorAll('.stages li').forEach((row, index) => {
      const current = index + 1 === m.stage;
      row.classList.toggle('current', current); row.classList.toggle('completed', index + 1 < m.stage);
      if (current) row.setAttribute('aria-current', 'step'); else row.removeAttribute('aria-current');
      row.querySelector('small').textContent = current ? 'Current' : index + 1 < m.stage ? 'Completed' : 'Locked';
    });
    this.view.reduced = this.motion.matches || this.deceased; this.seed.setReducedMotion(this.view.reduced);
    document.querySelector('.life-panel').title = 'Life System 2.0';
  }

  refreshNetwork() {
    if(this.deceased)this.timeline.network.reset();
    this.external?.refresh();
    if(!this.external?.locked){const n=this.timeline.network;document.querySelector('.social-status em').textContent=n.state==='DISCONNECTED'?'Not Connected':'Demo network · '+n.state.toLowerCase();}
  }

  destroy() {
    if (this.disposed) return;
    stopLearning(this);
    clearInterval(this.lifeTimer);clearInterval(this.energyTimer); this.listeners.abort(); this.stabilityRow?.remove();
    this.cognition.destroy();this.onboarding?.hide(); this.db.close(); document.querySelector('#app')?.classList.remove('gameplay-mode');
    super.destroy();
  }
}
