import { automaticInstallation, MODEL_PACK } from '../learning/model-config.js';
import { pendingAwakening } from '../learning/install-progress.js';
import { analyzeNative } from '../learning/native-learning.js';
import { EvolutionPreview } from '../preview/evolution-preview.js';
import { AutomaticNetworkCountdown } from '../preview/automatic-playback.js';
import { STAGES } from '../preview/evolution-model.js';
import { learn, talk, visualMapping } from '../preview/sandbox/engine.js';
import { carePreview } from '../preview/sandbox/life.js';
import { LIFE_RULES } from '../life/life-system.js';
import { MindlingDatabase } from '../storage/database.js';
import { Onboarding } from '../ui/onboarding.js';
import { createLocalIdentity } from '../identity/identity.js';
import { EVENTS } from './events.js';
import { advanceGameplay, progressGameplay, createGameplayMindling, dashboardLife, dashboardState } from './gameplay-state.js';

// Share rendering and pure gameplay rules, never preview fixtures, time or wallets.
export class MindlingApp extends EvolutionPreview {
  constructor() {
    super({ interactive: true, autoPlay: false, autoNetwork: true, snapshotProvider: null });
    this.db = new MindlingDatabase(); this.listeners = new AbortController();
    this.dashboardOptions = {
      onInput: (text, activity, id) => this.submitInput(text, activity, id),
      onCare: type => this.performCare(type),
      onNewMindling: () => this.beginNewMindling()
    };
  }

  async start() {
    await this.db.open();
    if (this.disposed) { this.db.close(); return; }
    this.state = await this.db.changeGameplay(s => progressGameplay(advanceGameplay(s)));
    if (this.disposed) { this.db.close(); return; }
    this.seedModel = this.state.mind ? { nodes: this.state.mind.nodes.slice(0, 5), synapses: this.state.mind.synapses.slice(0, 4) } : null;
    this.stabilityRow = document.createElement('div');
    this.stabilityRow.className = 'life-attribute'; this.stabilityRow.dataset.lifeAttribute = 'neuralStability';
    this.stabilityRow.innerHTML = '<svg class="life-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg><label>Neural Stability</label><strong>—</strong><progress aria-label="Neural Stability" max="100" value="100">100%</progress>';
    document.querySelector('[data-life-warning]').before(this.stabilityRow);
    document.querySelector('#app').classList.add('gameplay-mode');
    await super.start();
    if (this.disposed) return;
    this.subtitle = document.querySelector('.hero-copy span'); this.subtitle?.remove();
    this.dashboard.setStorageStatus(true);
    this.interaction.connect(this.host, {
      onTap: event => {
        if(this.external?.tap(event))return;
        if (!this.state.mind) return;
        const hit = this.timeline.stage === 1 ? this.seed.selectAt(event) : { type: 'neuron', id: this.view.pickCanonical(event) };
        if (!hit?.id) return;
        this.view.selectedCanonical = hit.type === 'neuron' ? hit.id : null;
        this.events.emit(EVENTS.SCENE_SELECTION, hit);
      },
      onHover: event => { if (this.timeline.stage === 1) this.seed.hoverAt?.(event); }
    });
    this.events.on(EVENTS.MEMORY_SELECTED, route => { this.seed.highlightRoute(route); this.view.selectedCanonical = route?.neuronIds?.[0] || null; });
    for (const button of document.querySelectorAll('[data-care]')) button.querySelector('small').textContent = `Free · ${LIFE_RULES.care[button.dataset.care].cooldownHours}h`;
    this.renderState();
    if (this.state.mind) {
      const pending=await this.db.get('settings','local-ai-awakening');
      if(pendingAwakening(pending,this.state.mind,MODEL_PACK,automaticInstallation()))await this.resumeAwakening();
      else this.dashboard.show();
    } else this.showOnboarding();
    this.lifeTimer = setInterval(() => this.refreshState(), 60_000);
    this.energyTimer=setInterval(()=>{if(!this.external?.locked&&this.state?.mind){
      this.dashboard.renderEnergy(this.state.mind.energy,Date.now());
      const e=this.state.mind.energy;
      if(e.version===2&&e.remaining-e.bonus<10&&Date.now()>=e.updatedAt+720000&&!this.pendingMutations)this.refreshState();
    }},1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refreshState(); }, { signal: this.listeners.signal });
  }

  async change(reducer = state => state, options = {}) {
    this.external?.assertWritable();this.pendingMutations=(this.pendingMutations||0)+1;
    try {
      const state = await this.db.changeGameplay(s => {this.external?.assertWritable();return options.preserveGameplay?reducer(s):progressGameplay(reducer(advanceGameplay(s)));}, options);
      if (!this.disposed) { this.state = state; this.renderState(); }
      return state;
    } finally { this.pendingMutations--; }
  }

  async refreshState() {
    if (this.disposed || this.external?.locked) return;
    try { await this.change(); } catch { if (!this.disposed) this.dashboard.setStorageStatus(false); }
  }

  async submitInput(text, activity, id) {
    try {
      await this.change();
      const m = this.state.mind;
      if (!m || m.life.lifeState !== 'ALIVE') return { accepted: false, reason: 'MINDLING_DECEASED' };
      const rule = LIFE_RULES.activity[activity];
      if (!rule) throw Error('Unknown activity');
      if (m.energy.remaining < rule.energyCost) return { accepted: false, reason: 'OUT_OF_ENERGY' };
      if (typeof text !== 'string' || text.length > 2000) throw Error('Share a short, readable claim.');
      if (activity === 'TALK') {
        await this.change(s => {
          if (s.mind?.id !== m.id) throw Error('Mindling identity changed. Submit again.');
          return talk(s, text, {id});
        }, { journal: { id, type: activity } });
      } else {
        const preflight=analyzeNative(text,m,{allowQuestion:Boolean(this.intelligence?.ready)});
        const analysis=preflight.relationship==='repeated'?null:await this.intelligence?.prepare(text,structuredClone(m));
        if (this.disposed) return { accepted: false, reason: 'APPLICATION_CLOSED' };
        await this.change(s => {
          if (s.mind?.id !== m.id) throw Error('Mindling identity changed. Submit again.');
          return learn(s, {id, text, mindId:m.id, activity,analysis});
        }, {journal:{id,type:activity}});
        const event = this.state.mind.history.find(item => item.id === id);
        const memory = this.state.mind.memories.find(item => item.id === (event?.memoryId || id));
        const edge = this.state.mind.synapses.find(item => item.id === memory?.synapseIds?.[0]);
        if (edge) this.seed.signal({source:edge.from,destination:edge.to,synapse:edge.id,outcome:event?.kind==='reinforcement'?'REINFORCEMENT':'MEMORY_FORMATION'});
        return {accepted:true,message:event?.kind==='reinforcement'?'Already learned. Memory reinforced; no XP awarded.':analysis?'Input learned with experimental local AI organization; not fact-checked.':'Input learned with native lexical fallback; no semantic AI analysis or fact-checking.'};
      }
      const recalled = this.state.mind.nativeRecall?.memoryIds || [];
      const memory = this.state.mind.memories.find(item => item.id === recalled[0]);
      if (memory) this.seed.highlightRoute({neuronIds:memory.neuronIds||[],synapseIds:memory.synapseIds||[]});
      return { accepted: true, message: memory ? `Related stored claim (unverified): ${String(memory.content).slice(0,240)}` : 'Thought shared locally. No related stored claim found.' };
    } catch (error) {
      if (!this.disposed) await this.refreshState();
      return { accepted: false, reason: 'ACTIVITY_UNAVAILABLE', message: error.message?.replaceAll('virtual time', 'time').replaceAll('virtual day', 'UTC day').replaceAll('test Mindling', 'Mindling').replace('Sandbox memory capacity', 'Local memory capacity') || 'Activity is unavailable. No Energy or rewards changed.' };
    }
  }

  async performCare(type) {
    try { await this.change(s => carePreview(s, type)); return { accepted: true }; }
    catch (error) { await this.refreshState(); return { accepted: false, message: error.message }; }
  }

  showOnboarding() {
    this.external?.assertWritable();
    this.dashboard.hide();
    this.onboarding = new Onboarding(document.querySelector('#onboarding'), async draft => {
      await this.onboarding.birth(draft.name,{
        create:async()=>{
          const identity=await createLocalIdentity();
          await this.change(s=>createGameplayMindling(s,draft,identity),{identity});
        },
        ...this.awakeningInstallation()
      });
      if (this.disposed) return;
      this.onboarding.hide(); this.dashboard.show(); this.renderState();
    });
    this.onboarding.show();
  }

  awakeningInstallation(){
    if(!automaticInstallation())return {};
    let cancelled=false;
    return {
      cancel:()=>{cancelled=true;this.intelligence.cancel();void this.saveAwakening('native');},
      install:async(onProgress,retry)=>{
        if(cancelled)return false;
        await this.saveAwakening('pending');
        if(cancelled)return false;
        const ready=await this.intelligence.enable({onProgress,retry});
        if(ready)await this.saveAwakening('complete');
        return ready;
      }
    };
  }
  async saveAwakening(status){
    // Installation metadata is separate from canonical gameplay and reward records.
    try{await this.db.put('settings',{id:'local-ai-awakening',mindlingId:this.state.mind.id,pack:MODEL_PACK,status});}catch{if(status==='pending')throw Error('Installation consent could not be saved');}
  }
  async resumeAwakening(){
    this.dashboard.hide();this.onboarding=new Onboarding(document.querySelector('#onboarding'),()=>{});
    await this.onboarding.birth(this.state.mind.name,this.awakeningInstallation());
    if(!this.disposed){this.onboarding.hide();this.dashboard.show();}
  }

  async beginNewMindling() {
    await this.change();
    if (this.state.mind?.life.lifeState === 'DECEASED') this.showOnboarding();
  }

  renderState() {
    if (this.external?.locked || !this.view || !this.dashboard || !this.state.mind) return;
    const m = this.state.mind;
    this.deceased = m.life.lifeState === 'DECEASED';
    if (this.identityId !== m.id) { this.identityId = m.id; this.countdown = new AutomaticNetworkCountdown(); this.timeline.network.reset(); this.view.selectedCanonical = null; }
    if (this.timeline.stage !== m.stage) { this.timeline.select(m.stage); this.syncStage(); }
    this.host.dataset.stage = String(m.stage);
    this.seed.update({ nodes: m.nodes.slice(0, 5), synapses: m.synapses.slice(0, 4) });
    this.dashboard.render(dashboardState(m));
    this.events.emit(EVENTS.LIFE_UPDATED, dashboardLife(this.state));
    document.querySelector('.hero-copy h1').textContent = `${m.name} ${this.deceased ? '— Neural Collapse' : 'is learning.'}`;
    document.querySelector('.hero-copy p').textContent = `${STAGES[m.stage - 1].name} · Stage ${String(m.stage).padStart(2, '0')}`;
    document.querySelectorAll('.stages li').forEach((row, index) => {
      const current = index + 1 === m.stage;
      row.classList.toggle('current', current); row.classList.toggle('completed', index + 1 < m.stage);
      if (current) row.setAttribute('aria-current', 'step'); else row.removeAttribute('aria-current');
      row.querySelector('small').textContent = current ? 'Current' : index + 1 < m.stage ? 'Completed' : 'Locked';
    });
    this.view.reduced = this.motion.matches || this.deceased; this.seed.setReducedMotion(this.view.reduced);
    this.view.canonicalMapping = visualMapping(m, STAGES[m.stage - 1].count);
    this.view.morph.target.nodes.forEach((node, index) => {
      const id = this.view.canonicalMapping[index];
      const strength = m.synapses.filter(edge => edge.from === id || edge.to === id).reduce((sum, edge) => sum + edge.strength, 0);
      node.baseRadius ??= node.radius; node.radius = node.baseRadius * (1 + Math.min(.35, strength * .05));
    });
    this.view.morph.tick(0); this.view.buffers.rebuild(this.view.morph); this.view.centralSegments = this.view.buffers.segmentCount;
    document.querySelector('.life-panel').title = 'Life System 2.0';
  }

  refreshNetwork() {
    if(this.deceased)this.timeline.network.reset();
    this.external?.refresh();
    if(!this.external?.locked){const n=this.timeline.network;document.querySelector('.social-status em').textContent=n.state==='DISCONNECTED'?'Not Connected':'Demo network · '+n.state.toLowerCase();}
  }

  destroy() {
    if (this.disposed) return;
    clearInterval(this.lifeTimer);clearInterval(this.energyTimer); this.listeners.abort(); this.stabilityRow?.remove();
    this.onboarding?.hide(); this.db.close(); document.querySelector('#app')?.classList.remove('gameplay-mode');
    super.destroy();
    if (this.subtitle) document.querySelector('.hero-copy').append(this.subtitle);
  }
}
