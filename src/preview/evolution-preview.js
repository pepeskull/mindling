import { ExternalView } from '../network/external-view.js';
import { PreviewTimeline, smooth } from "./evolution-model.js";
import { EvolutionScene } from "./evolution-scene.js";
import { SceneInteraction } from "../renderer/scene-interaction.js";
import { BrainRenderer } from "../renderer/brain-renderer.js";
import { createNeuralSeedState } from "../brain/neural-seed-state.js";

import { Dashboard } from '../ui/dashboard.js';
import { EventBus } from '../app/events.js';
import { readDashboardSnapshot } from './dashboard-snapshot.js';
import { presentationFor, PreviewDashboardPresentation } from './dashboard-presentation.js';
import { AutomaticNetworkCountdown } from './automatic-playback.js';

export class EvolutionPreview {
  timeline = new PreviewTimeline(); interaction = new SceneInteraction();
  frame = null; disposed = false; lastTime = null; elapsed = 0; displayedStage = 1;
  seedWeight = 1; seedFrom = 1; transition = 1;
  motion = matchMedia('(prefers-reduced-motion: reduce)');
  constructor({ forceCanvas = false, snapshotProvider = readDashboardSnapshot, originalFraming = true, interactive = false, autoPlay = true, autoNetwork = true, canonicalBrain = false } = {}) {
    this.canonicalBrain = canonicalBrain; this.forceCanvas = forceCanvas; this.snapshotProvider = snapshotProvider; this.originalFraming = originalFraming;
    this.interactive = interactive; this.autoPlay = autoPlay; this.autoNetwork = autoNetwork;
    this.events = new EventBus(); this.dashboardOptions = {};
  }
  countdown = new AutomaticNetworkCountdown();
  async start() {
    this.host = document.querySelector('#scene');
    if (!this.host) throw new Error('Dashboard scene container is required');
    this.originalLabel = this.host.getAttribute('aria-label');
    document.querySelector('#app').classList.add('dashboard-preview');
    document.querySelector('#app').classList.toggle('original-preview-framing', this.originalFraming);
    this.dashboard = new Dashboard(this.events, { readOnly: !this.interactive, ...this.dashboardOptions, onViewChange: this.primaryViewChanged });
    const snapshot = this.snapshotProvider ? await this.snapshotProvider() : null;
    if (this.disposed) return;
    if (snapshot) this.dashboard.showSnapshot(snapshot);
    if (!this.interactive) this.presentation = new PreviewDashboardPresentation();
    this.host.setAttribute('aria-label', this.interactive ? 'Interactive Mindling neural network' : 'Development preview of neural evolution; saved gameplay is unchanged');
    this.host.innerHTML = `<div class="preview-layer preview-seed"></div><div class="preview-layer preview-growth"></div>`;
    this.sceneHost = this.host; this.seedHost = this.host.querySelector('.preview-seed'); this.growthHost = this.host.querySelector('.preview-growth');
    this.growthHost.style.opacity = '0';
    this.interaction.connect(this.sceneHost,{onTap:event=>this.external?.tap(event)});
    let three = null;
    if (!this.forceCanvas) { try { three = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js'); } catch { /* Native Canvas fallback. */ } }
    if (this.disposed) return;
    this.view = new EvolutionScene({ three, interaction: this.interaction, reduced: this.motion.matches, fitDashboard: true, originalFraming: this.originalFraming,shareContext:this.canonicalBrain });
    const framing=this.originalFraming?null:{referenceHeight:()=>document.querySelector('#app').clientHeight};
    this.seed = new BrainRenderer(this.seedHost, null, { three, interaction:this.interaction, framing, mode:'dashboard', externallyScheduled:true,stageScene:this.canonicalBrain?this.view:null,seedOnly:!this.canonicalBrain });
    const seedModel = this.seedModel || (this.canonicalBrain ? {nodes:[],synapses:[]} : structuredClone(createNeuralSeedState()));
    try { this.view.mount(this.growthHost); this.seed.mount(this.canonicalBrain?this.growthHost:this.seedHost, seedModel); }
    catch {
      this.view.destroy(); this.seed.destroy?.(); this.seedHost.replaceChildren(); this.growthHost.replaceChildren();
      this.view = new EvolutionScene({ interaction: this.interaction, reduced: this.motion.matches, fitDashboard: true, originalFraming: this.originalFraming,shareContext:this.canonicalBrain }); this.view.mount(this.growthHost);
      this.seed = new BrainRenderer(this.seedHost, null, { interaction:this.interaction, framing, mode:'dashboard', externallyScheduled:true,stageScene:this.canonicalBrain?this.view:null,seedOnly:!this.canonicalBrain }); this.seed.mount(this.canonicalBrain?this.growthHost:this.seedHost, seedModel);
    }
    this.external=new ExternalView(this);
    this.host.dataset.backend = this.view.three ? 'three' : 'canvas';
    this.motion.addEventListener('change', this.motionChanged);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(this.sceneHost);
    for (const node of document.querySelectorAll('.topbar, .left-stack, .right-panel, .hero-copy, #interaction-form')) this.observer.observe(node);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    if(!this.interactive && new URLSearchParams(location.search).get('preview-mode')==='demo'){
      this.modeLink=document.createElement('a');this.modeLink.className='preview-mode-link';this.modeLink.href='?stage-preview=1';this.modeLink.textContent='Open interactive sandbox';document.querySelector('#app').append(this.modeLink);
    }
    if (this.autoPlay) this.timeline.play();
    this.resize(); this.refresh(); this.schedule();
  }
  resize = () => {
    if (this.disposed) return;
    const app = document.querySelector('#app').getBoundingClientRect();
    const bounds = selector => document.querySelector(selector).getBoundingClientRect();
    const header = bounds('.topbar'), hero = bounds('.hero-copy'), input = bounds('#interaction-form');
    const mobile = matchMedia('(max-width: 800px)').matches;
    const left = mobile ? 8 : bounds('.left-stack').right - app.left + 12;
    const right = mobile ? 8 : app.right - bounds('.right-panel').left + 12;
    const top = Math.max(header.bottom, hero.bottom) - app.top + 12;
    const bottom = Math.max(16, app.bottom - input.top + 12);
    if(this.external)this.external.notice.style.bottom=`${bottom+4}px`;
    this.host.style.inset = `${top}px ${right}px ${bottom}px ${left}px`;
    const { width, height } = this.host.getBoundingClientRect();
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    const renderHeight=this.originalFraming?Math.max(1,height-44):height;
    this.view?.resize(width, renderHeight); this.seed?.resize(width, renderHeight);
  };
  motionChanged = () => {
    this.view.reduced = this.motion.matches || Boolean(this.deceased);
    this.seed.setReducedMotion(this.view.reduced);
    if (this.motion.matches) { if(!this.canonicalBrain)this.view.select(this.timeline.stage); this.transition = 1; this.seedWeight = this.timeline.stage === 1 ? 1 : 0; }
    this.refresh();
  };
  syncStage() {
    if (this.displayedStage === this.timeline.stage) return;
    this.displayedStage = this.timeline.stage; this.seedFrom = this.seedWeight; this.transition = this.motion.matches ? 1 : 0;
    if(!this.canonicalBrain)this.view.select(this.timeline.stage);
  }
  refresh() {
    this.host.dataset.stage = String(this.timeline.stage);
    this.refreshNetwork();
  }
  refreshNetwork() {
    if(this.external?.locked){this.external.refresh();return;}
    this.host.dataset.network = this.timeline.network.state;
    this.presentationState = presentationFor(this.timeline, this.view.morph);
    this.presentation.update(this.presentationState);
    this.view.updateLabels(this.presentationState.peers);this.external?.refresh();
  }
  primaryViewChanged = view => {
    this.primaryView = view;this.external?.refresh();
    if (view === 'development' || view === 'memories') { cancelAnimationFrame(this.frame); this.frame = null; }
    else { this.lastTime = null; this.schedule(); }
  };
  schedule() { if (!this.disposed && this.view && this.seed && !document.hidden && !['development','memories'].includes(this.primaryView) && this.frame === null) this.frame = requestAnimationFrame(this.render); }
  render = now => {
    this.frame = null; if (this.disposed || document.hidden || ['development','memories'].includes(this.primaryView)) return;
    const delta = this.lastTime === null ? 0 : Math.max(0, (now - this.lastTime) / 1000); this.lastTime = now; this.elapsed += delta;
    this.external?.tick(delta);
    const ready = this.timeline.stage === 7 && this.transition === 1 && this.view.morph.progress === 1;
    const previous = this.timeline.stage; this.timeline.tick(delta); this.syncStage(); if (previous !== this.timeline.stage) this.refresh();
    if (this.autoNetwork && !this.external?.locked && !this.deceased) this.countdown.update(delta, { stage: this.timeline.stage, transitionComplete: ready, network: this.timeline.network });
    this.interaction.update(delta); this.transition = Math.min(1, this.transition + delta / 1.6);
    if(this.canonicalBrain){
      const visiting=Boolean(this.external?.locked);
      this.seedWeight=0;this.seedHost.style.opacity='0';this.growthHost.style.opacity='1';
      this.view.hideCanonicalCenter=false;
      if(visiting)this.view.render(this.elapsed,delta,this.timeline.network);
      else this.seed.render(now/1000,delta,this.timeline.network);
    }else{
      const target = this.timeline.stage === 1 ? 1 : 0; this.seedWeight = this.seedFrom * (1 - smooth(this.transition)) + target * smooth(this.transition);
      this.seedHost.style.opacity = String(this.seedWeight); this.growthHost.style.opacity = String(1 - this.seedWeight);
      if (this.seedWeight > 0) this.seed.render(now / 1000, delta);
      if (this.seedWeight < 1) this.view.render(this.elapsed, delta, this.timeline.network);
    }
    this.refreshNetwork(); this.schedule();
  };
  visibility = () => { if (document.hidden) { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; } else { this.lastTime = null; this.schedule(); } };
  destroy() {
    if (this.disposed) return; this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null;
    this.observer?.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.motion.removeEventListener('change', this.motionChanged);
    window.removeEventListener('resize', this.resize);
    this.external?.destroy();
    this.modeLink?.remove();this.presentation?.destroy(); this.dashboard?.destroy();
    this.timeline.pause(); this.timeline.network.reset(); this.interaction.disconnect(); this.seed?.destroy(); this.view?.destroy();
    this.host?.replaceChildren(); this.host?.removeAttribute('style');
    if (this.host) { this.host.setAttribute('aria-label', this.originalLabel); delete this.host.dataset.stage; delete this.host.dataset.backend; delete this.host.dataset.network; }
    document.querySelector('#app')?.classList.remove('dashboard-preview', 'original-preview-framing');
  }
}
