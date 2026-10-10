import { STAGES, PreviewTimeline, AMELIA_STATUS, smooth } from "./evolution-model.js";
import { EvolutionScene } from "./evolution-scene.js";
import { SceneInteraction } from "../renderer/scene-interaction.js";
import { ThreeSeedScene } from "../renderer/three-seed-scene.js";
import { CanvasSeedScene } from "../renderer/canvas-seed-scene.js";
import { createNeuralSeedState } from "../brain/neural-seed-state.js";

export class EvolutionPreview {
  timeline = new PreviewTimeline(); interaction = new SceneInteraction();
  frame = null; disposed = false; lastTime = null; elapsed = 0; displayedStage = 1;
  seedWeight = 1; seedFrom = 1; transition = 1;
  motion = matchMedia('(prefers-reduced-motion: reduce)');
  constructor({ onExit, forceCanvas = false } = {}) { this.onExit = onExit; this.forceCanvas = forceCanvas; }
  async start() {
    this.host = document.createElement('section'); this.host.className = 'evolution-preview'; this.host.setAttribute('aria-label', 'Neural evolution development preview');
    this.host.innerHTML = `<div class="preview-scene" aria-label="Interactive neural evolution: drag to rotate, scroll to zoom"><div class="preview-layer preview-seed"></div><div class="preview-layer preview-growth"></div></div>
      <header class="preview-heading"><p>NEURAL EVOLUTION — DEVELOPMENT PREVIEW</p><h1 data-preview-title>Neural Seed</h1><span data-preview-description></span></header>
      <aside class="preview-provenance">Original Mindling geometry<span>Amelia integration: ${AMELIA_STATUS}</span></aside>
      <div class="preview-toolbar glass-panel"><div class="preview-stage-row"><label>Current Stage <select aria-label="Current Stage">${STAGES.map(s => `<option value="${s.number}">${s.number}. ${s.name}</option>`).join('')}</select></label><output data-preview-counter aria-live="polite">1 / 7</output><span data-preview-playback>Paused</span></div>
      <div class="preview-buttons"><button data-action="previous">Previous Stage</button><button data-action="next">Next Stage</button><button data-action="play">Play</button><button data-action="pause">Pause</button><button data-action="restart">Restart</button><button data-action="exit">Exit Preview</button></div>
      <div class="preview-network" hidden><p>NETWORK SIMULATION — NO LIVE CONNECTIONS</p><div><button data-action="connect">Start Simulation</button><button data-action="disconnect">Stop Simulation</button><output data-network-state role="status">DISCONNECTED</output></div><ol>${[1, 2, 3].map(n => `<li>Simulated brain ${n} <span data-peer="${n - 1}">DISCONNECTED</span></li>`).join('')}</ol></div>
      <p class="preview-help">Drag to rotate · Scroll or pinch to zoom · Visual simulation only</p></div>`;
    document.body.append(this.host); this.host.querySelector('select').focus();
    this.sceneHost = this.host.querySelector('.preview-scene'); this.seedHost = this.host.querySelector('.preview-seed'); this.growthHost = this.host.querySelector('.preview-growth');
    this.growthHost.style.opacity = '0';
    this.interaction.connect(this.sceneHost);
    let three = null;
    if (!this.forceCanvas) { try { three = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js'); } catch { /* Native Canvas fallback. */ } }
    if (this.disposed) return;
    this.view = new EvolutionScene({ three, interaction: this.interaction, reduced: this.motion.matches });
    this.seed = three ? new ThreeSeedScene(three, null, this.interaction) : new CanvasSeedScene(null, this.interaction);
    try { this.view.mount(this.growthHost); this.seed.mount(this.seedHost, structuredClone(createNeuralSeedState())); }
    catch {
      this.view.destroy(); this.seed.destroy?.(); this.seedHost.replaceChildren(); this.growthHost.replaceChildren();
      this.view = new EvolutionScene({ interaction: this.interaction, reduced: this.motion.matches }); this.view.mount(this.growthHost);
      this.seed = new CanvasSeedScene(null, this.interaction); this.seed.mount(this.seedHost, structuredClone(createNeuralSeedState()));
    }
    this.host.dataset.backend = this.view.three ? 'three' : 'canvas';
    this.host.addEventListener('click', this.click); this.host.querySelector('select').addEventListener('change', this.select);
    this.motion.addEventListener('change', this.motionChanged);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(this.sceneHost);
    document.addEventListener('visibilitychange', this.visibility);
    if (!this.motion.matches) this.timeline.play();
    this.resize(); this.refresh(); this.schedule();
  }
  resize = () => { this.sceneHost.style.bottom = `${this.host.querySelector('.preview-toolbar').offsetHeight + 32}px`; const { width, height } = this.sceneHost.getBoundingClientRect(); this.view?.resize(width, height); this.seed?.resize(width, height); };
  select = event => { this.timeline.pause(); this.timeline.select(Number(event.target.value)); this.syncStage(); this.refresh(); };
  click = event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || this.disposed) return;
    if (action === 'exit') { this.destroy(); this.onExit?.(); return; }
    if (action === 'connect' && this.timeline.stage === 7) this.timeline.network.start();
    else if (action === 'disconnect') this.timeline.network.stop();
    else if (['previous', 'next', 'play', 'pause', 'restart'].includes(action)) {
      if (action === 'previous' || action === 'next') this.timeline.pause();
      this.timeline[action]();
    }
    this.syncStage(); this.refresh();
  };
  motionChanged = () => {
    this.view.reduced = this.motion.matches;
    this.seed.setReducedMotion(this.motion.matches);
    if (this.motion.matches) { this.timeline.pause(); this.view.select(this.timeline.stage); this.transition = 1; this.seedWeight = this.timeline.stage === 1 ? 1 : 0; }
    this.refresh();
  };
  syncStage() {
    if (this.displayedStage === this.timeline.stage) return;
    this.displayedStage = this.timeline.stage; this.seedFrom = this.seedWeight; this.transition = this.motion.matches ? 1 : 0;
    this.view.select(this.timeline.stage);
  }
  refresh() {
    const t = this.timeline, stage = STAGES[t.stage - 1];
    this.host.dataset.stage = String(t.stage);
    this.host.querySelector('[data-preview-title]').textContent = stage.name;
    this.host.querySelector('[data-preview-description]').textContent = stage.description;
    this.host.querySelector('select').value = String(t.stage);
    this.host.querySelector('[data-preview-counter]').textContent = `${t.stage} / 7`;
    this.host.querySelector('[data-preview-playback]').textContent = this.motion.matches ? (t.playing ? 'Playing · Reduced motion' : 'Paused · Reduced motion') : t.playing ? 'Playing · 5 seconds per stage' : 'Paused';
    this.host.querySelector('[data-action=previous]').disabled = t.stage === 1;
    this.host.querySelector('[data-action=next]').disabled = t.stage === 7;
    this.host.querySelector('[data-action=play]').disabled = t.playing || t.stage === 7;
    this.host.querySelector('[data-action=pause]').disabled = !t.playing;
    this.host.querySelector('.preview-network').hidden = t.stage !== 7;
    this.resize(); this.refreshNetwork();
  }
  refreshNetwork() {
    const n = this.timeline.network, output = this.host.querySelector('[data-network-state]');
    if (output.textContent !== n.state) output.textContent = n.state;
    this.host.querySelector('[data-action=connect]').disabled = n.state !== 'DISCONNECTED';
    this.host.querySelector('[data-action=disconnect]').disabled = n.state === 'DISCONNECTED' || n.state === 'DISCONNECTING';
    n.peers.forEach((peer, i) => { const node = this.host.querySelector(`[data-peer="${i}"]`); const state = n.stopping ? 'DISCONNECTING' : peer.state; if (node.textContent !== state) node.textContent = state; });
  }
  schedule() { if (!this.disposed && !document.hidden && this.frame === null) this.frame = requestAnimationFrame(this.render); }
  render = now => {
    this.frame = null; if (this.disposed || document.hidden) return;
    const delta = this.lastTime === null ? 0 : Math.max(0, (now - this.lastTime) / 1000); this.lastTime = now; this.elapsed += delta;
    const previous = this.timeline.stage; this.timeline.tick(delta); this.syncStage(); if (previous !== this.timeline.stage) this.refresh();
    this.interaction.update(delta); this.transition = Math.min(1, this.transition + delta / 1.6);
    const target = this.timeline.stage === 1 ? 1 : 0; this.seedWeight = this.seedFrom * (1 - smooth(this.transition)) + target * smooth(this.transition);
    this.seedHost.style.opacity = String(this.seedWeight); this.growthHost.style.opacity = String(1 - this.seedWeight);
    // Both views share this one scheduler and interaction, including during the crossfade.
    if (this.seedWeight > 0) this.seed.render(now / 1000, delta);
    if (this.seedWeight < 1) this.view.render(this.elapsed, delta, this.timeline.network);
    this.refreshNetwork(); this.schedule();
  };
  visibility = () => { if (document.hidden) { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; } else { this.lastTime = null; this.schedule(); } };
  destroy() {
    if (this.disposed) return; this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null;
    this.observer?.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.motion.removeEventListener('change', this.motionChanged);
    this.host?.removeEventListener('click', this.click); this.host?.querySelector('select')?.removeEventListener('change', this.select);
    this.timeline.pause(); this.timeline.network.reset(); this.interaction.disconnect(); this.seed?.destroy(); this.view?.destroy(); this.host?.remove();
  }
}
