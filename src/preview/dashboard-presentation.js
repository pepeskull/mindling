import { STAGES } from './evolution-model.js';
import { conditionFor, warningFor } from '../life/life-system.js';
import { formatLifePercentage } from '../ui/life-format.js';

export const PEER_NAMES = Object.freeze(['Nova', 'Echo', 'Atlas']);
export const PRESETS = Object.freeze([
  [78, 72, 82, 64, 0], [82, 76, 70, 73, 3], [85, 68, 62, 78, 12],
  [88, 74, 42, 82, 28], [90, 80, 76, 86, 56], [87, 72, 68, 89, 96],
  [92, 84, 79, 91, 160]
].map(([health, nutrition, rest, wellbeing, memories]) => Object.freeze({
  attributes: Object.freeze({ health, nutrition, rest, wellbeing }), memories
})));

export function presentationFor(timeline, morph) {
  const stage = STAGES[timeline.stage - 1], preset = PRESETS[stage.number - 1];
  const network = timeline.network;
  const active = stage.number === 7 && network.state !== 'DISCONNECTED';
  const connected = active && !network.stopping ? network.peers.filter(p => ['CONNECTED', 'EXCHANGING'].includes(p.state) && p.link === 1).length : 0;
  const social = !active ? 'Not Connected' : network.state === 'DISCONNECTING' ? 'Disconnecting'
    : connected ? `Connected · ${connected} Mindling${connected === 1 ? '' : 's'}${network.state === 'EXCHANGING' ? ' · Active' : ''}`
    : network.state === 'DISCOVERING' ? 'Discovering' : 'Connecting';
  const life = { attributes: preset.attributes, condition: conditionFor(preset.attributes), lifeState: 'ALIVE' };
  return { stage, transition: morph.progress, neurons: stage.count, synapses: morph.target.edges.length,
    memories: preset.memories, life, social, active, connected,
    peers: network.peers.map((peer, index) => ({ id:peer.id,name:peer.name||'',demo:peer.demo===true,stage:peer.stage,connected:peer.stage===7&&active&&!network.stopping&&['CONNECTED','EXCHANGING'].includes(peer.state)&&peer.link===1, visibility: active && peer.state !== 'DISCONNECTED' ? peer.visibility * network.fade : 0 })) };
}

// Presentation only: no app events, gameplay objects, storage, or independent clock.
export class PreviewDashboardPresentation {
  stage = null; social = null;
  constructor(root = document) {
    this.root = root;
    this.subtitle = root.querySelector(".hero-copy span"); this.subtitle?.remove();
    this.indicator = document.createElement('small'); this.indicator.className = 'preview-simulated';
    this.indicator.textContent = 'Simulated'; this.indicator.hidden = true;
    root.querySelector('.social-status').append(this.indicator);
  }
  update(state) {
    const q = selector => this.root.querySelector(selector);
    if (this.stage !== state.stage.number) {
      this.stage = state.stage.number;
      this.root.querySelectorAll('.stages li').forEach((row, index) => {
        const current = index + 1 === this.stage;
        row.classList.toggle('current', current); row.classList.toggle('completed', index + 1 < this.stage);
        if (current) row.setAttribute('aria-current', 'step'); else row.removeAttribute('aria-current');
        row.querySelector('small').textContent = current ? 'Current' : index + 1 < this.stage ? 'Completed' : 'Locked';
      });
      q('.hero-copy p').textContent = `${state.stage.name} · Stage ${String(this.stage).padStart(2, '0')}`;
      q('[data-life-stage]').textContent = state.stage.name;
      for (const key of ['neurons', 'synapses', 'memories']) q(`[data-stat="${key}"]`).textContent = state[key];
      for (const [name, value] of Object.entries(state.life.attributes)) {
        const row = q(`[data-life-attribute="${name}"]`), progress = row.querySelector('progress');
        const valueLabel = row.querySelector('strong');
        valueLabel.textContent = formatLifePercentage(value);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) valueLabel.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 400 });
        progress.hidden = false; progress.value = value; progress.textContent = formatLifePercentage(value);
        row.classList.toggle('critical', value <= 14);
      }
      q('[data-life-condition]').textContent = state.life.condition;
      q('[data-life-condition]').dataset.condition = state.life.condition;
      q('[data-life-warning] span').textContent = warningFor(state.life).message;
      q('.life-panel').title = 'Illustrative development values';
    }
    if (this.social !== state.social) { this.social = state.social; q('.social-status em').textContent = state.social; }
    if (this.indicator.hidden === state.active) this.indicator.hidden = !state.active;
  }
  destroy() { this.indicator.remove(); if (this.subtitle) this.root.querySelector(".hero-copy").append(this.subtitle); }
}
