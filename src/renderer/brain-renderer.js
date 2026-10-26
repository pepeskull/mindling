import { VIEW_ZOOM } from '../ui/view-zoom.js';
import { ThreeSeedScene } from './three-seed-scene.js';
import { CanvasSeedScene } from './canvas-seed-scene.js';
import { StageBrainScene } from './stage-brain-scene.js';
import { SceneInteraction } from './scene-interaction.js';
import { canonicalBrain } from './canonical-brain.js';

const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js';

// One morphology implementation per backend. Modes change framing/scheduling,
// not geometry, materials, palette, dendrites or the canonical brain model.
export class BrainRenderer {
  constructor(host, onSelection, { mode = 'dashboard', three = null, interaction = null, framing = null, externallyScheduled = false, stageScene = null, seedOnly = false } = {}) {
    this.host = host; this.onSelection = onSelection; this.mode = mode; this.three = three;
    this.interaction = interaction || new SceneInteraction(mode==='development'?{minZoom:VIEW_ZOOM.min,maxZoom:VIEW_ZOOM.max,wheelScale:VIEW_ZOOM.wheel}:{}); this.ownsInteraction = !interaction;
    this.stageScene=stageScene;this.seedOnly=seedOnly; this.external = externallyScheduled; this.framing = framing; this.model = canonicalBrain({});
    this.abort = new AbortController(); this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.visible = mode === 'dashboard'; this.frame = null; this.lastTime = null; this.disposed = false;
  }
  async initialize(model) {
    this.model = {...canonicalBrain(model),stage:model.stage};
    try { this.three = await import(THREE_MODULE_URL); } catch { this.three = null; }
    if (this.disposed) return;
    this.mount(this.host, this.model);
  }
  mount(host, model) {
    this.host = host; this.model = {...canonicalBrain(model),stage:model.stage};
    const framing = this.framing || ({ allowZoomOverflow:this.mode==='development', active:()=>this.mode==='development'||this.model.nodes.length>5, referenceHeight: () => this.host.clientHeight, radius: () => Math.max(1.5, ...this.model.nodes.map(node => Math.hypot(...node.position) + node.size * .7)) });
    const create = () => this.seedOnly ? (this.three?new ThreeSeedScene(this.three,this.onSelection,this.interaction,framing):new CanvasSeedScene(this.onSelection,this.interaction,framing)) : new StageBrainScene(this.three, this.onSelection, this.interaction, framing, this.stageScene);
    this.view = create();
    try { this.view.mount(host, this.model); }
    catch { this.view.destroy(); this.three = null; this.view = create(); this.view.mount(host, this.model); }
    this.reduced=Boolean(this.motion.matches||this.deceased);this.view.setReducedMotion(this.reduced);
    this.host.querySelector('canvas')?.setAttribute('aria-hidden','true');
    host.dataset.brainBackend = this.three ? 'three' : 'canvas';
    if (this.ownsInteraction) this.interaction.connect(host, { onTap: event => { this.selectAt(event); this.request(); }, onHover: event => { this.hoverAt(event); this.request(); } });
    if (!this.external) {
      for (const type of ['pointermove','wheel']) host.addEventListener(type, () => this.request(), { signal: this.abort.signal });
      document.addEventListener('visibilitychange', () => { this.pause(); this.request(); }, { signal: this.abort.signal });
      this.motion.addEventListener('change', () => { this.setReducedMotion(this.motion.matches || this.deceased); }, { signal: this.abort.signal });
      this.observer = new ResizeObserver(() => this.resize(host.clientWidth, host.clientHeight)); this.observer.observe(host);
      this.resize(host.clientWidth, host.clientHeight); this.request();
    }
  }
  update(model) { this.model = {...canonicalBrain(model),stage:model.stage}; this.view?.update(this.model); this.request(); }
  resize(width, height) { this.view?.resize(width, height); this.request(); }
  selectAt(event) { return this.view?.selectAt(event) || null; }
  hoverAt(event) { return this.view?.hoverAt?.(event) || null; }
  setSelection(selection) { this.view?.setSelection(selection); this.request(); }
  focusSelection(selection){const focused=this.view?.focusSelection?.(selection);this.request();return focused;}
  resetFocus(){this.view?.resetFocus?.();this.request();}
  inputTarget(){return this.view?.inputTarget?.()||null;}
  receiveInput(){
    const edge=this.model.synapses[0];if(!edge)return;
    this.activate([edge.from,edge.to]);this.signal({source:edge.from,destination:edge.to,synapse:edge.id,outcome:'INPUT_RECEIVED',entry:false});
  }
  signal(route) { this.view?.signal(route); this.request(); }
  highlightRoute(route) { this.view?.highlightRoute(route); this.request(); }
  activate(ids) { this.highlightRoute({ neuronIds: ids, synapseIds: [] }); this.highlightUntil = performance.now() / 1000 + 2.4; }
  setReducedMotion(value) { this.reduced = Boolean(value); this.view?.setReducedMotion(this.reduced); this.pause(); this.request(); }
  setVisible(value) { this.visible = value; this.pause(); if (!value) { this.view?.highlightRoute(null); this.highlightUntil = 0; } this.request(); }
  pause() { cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = null; }
  request() {
    if (this.external || this.disposed || !this.view || !this.visible || document.hidden || this.frame !== null) return;
    this.frame = requestAnimationFrame(time => {
      this.frame = null; if (this.disposed || !this.visible || document.hidden) return;
      const delta = this.lastTime === null ? 0 : Math.min(.1, (time - this.lastTime) / 1000); this.lastTime = time;
      if (this.reduced) { const pose = this.interaction.capturePose(); this.interaction.restorePose({ ...pose, zoom: pose.targetZoom }); }
      this.interaction.update(delta); this.render(time / 1000, delta);
      if (!this.reduced && this.model.nodes.length) this.request();
    });
  }
  render(elapsed, delta, network) { if (this.highlightUntil && elapsed >= this.highlightUntil) { this.view?.highlightRoute(null); this.highlightUntil = 0; } this.view?.render(elapsed, delta, network); }
  destroy() {
    if (this.disposed) return; this.disposed = true; this.visible = false; this.pause(); this.abort.abort(); this.observer?.disconnect();
    if (this.ownsInteraction) this.interaction.disconnect(); this.view?.destroy(); this.view = null; this.model = null; delete this.host.dataset.brainBackend;
  }
}
