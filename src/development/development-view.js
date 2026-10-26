import { renderEvolutionProgress } from '../ui/evolution-progress.js';
import { canonicalSelectionText } from '../renderer/canonical-selection.js';
import { AdaptivePathwaysView } from '../pathways/pathway-view.js';
import { TrainingPanel } from '../training/training-panel.js';
import { developmentData } from './development-data.js';
import { NeuralDevelopmentScene } from './neural-development-scene.js';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const date = value => value === null ? 'Not recorded' : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const eventDate = event => `${event.simulated ? 'Simulated date: ' : ''}${date(event.recordedAt ?? event.at)}`;
const value = number => number === null ? '—' : number.toLocaleString();

export class DevelopmentView {
  constructor(root, { trainingStore, events } = {}) {
    this.root = root; this.abort = new AbortController(); this.visible = false;
    root.innerHTML = `
      <div class="development-grid">
        <section class="development-evolution development-panel" aria-labelledby="evolution-title">
          <div class="development-panel-heading"><div><p class="development-eyebrow">01 / NEURAL EVOLUTION</p><h3 id="evolution-title" data-development-name>Your Mindling</h3></div><span class="development-presence" data-development-presence>Living architecture</span></div>
          <div class="development-scene" tabindex="0" role="img" aria-label="Canonical neural network. Drag to rotate, scroll to zoom, arrow keys rotate, plus and minus zoom. Select a neuron below for keyboard access."><div class="development-network-empty" hidden><p>A network waiting to grow.</p><span>No saved neurons are available yet.</span></div></div>
          <div class="development-scene-controls glass-line" aria-label="Neural visualization controls"><button type="button" data-development-camera="out" aria-label="Zoom out">−</button><button type="button" data-development-camera="in" aria-label="Zoom in">+</button><button type="button" data-development-camera="reset">Reset view</button><label>Inspect neuron<select data-development-neuron aria-label="Select a neuron"><option value="">Choose a neuron</option></select></label></div>
          <p class="development-selection" data-development-selection aria-live="polite">Select a neuron to explore its saved connections.</p>
          <div class="development-brain-stats" data-development-brain-stats></div>
          <p class="development-caption" data-development-scene-note>Ambient motion illustrates the saved network.</p>
        </section>
        <section class="development-cognition development-panel" aria-labelledby="cognition-title">
          <div class="development-panel-heading"><div><p class="development-eyebrow">02 / PROGRESSION</p><h3 id="cognition-title">Cognitive Development</h3></div></div>
          <div class="development-panel-body">
            <dl class="development-metrics" data-development-metrics></dl>
            <div class="development-xp" data-development-xp></div>
            <p class="development-muted">Memory, knowledge-area and neural growth trends need historical snapshots. Current totals are shown above.</p>
            <div class="development-training" data-cognitive-training></div>
          </div>
        </section>
        <section class="development-pathways development-panel" aria-labelledby="pathways-title">
          <div class="development-panel-heading"><div><p class="development-eyebrow">03 / DIRECTION</p><h3 id="pathways-title">Pathways & Learning</h3></div></div>
          <div class="development-panel-body"><div data-adaptive-pathways></div>
            <h4>Acquired knowledge</h4><ul class="development-areas" data-development-areas></ul><p class="development-muted">Current memory counts by area. Pathway-specific knowledge links are not recorded.</p>
            <h4>Recent development</h4><ol class="development-events" data-development-events></ol>
          </div>
        </section>
      </div>`;
    this.pathways = new AdaptivePathwaysView(root.querySelector('[data-adaptive-pathways]'));
    this.scene = new NeuralDevelopmentScene(root.querySelector('.development-scene'), selection => this.showSelection(selection));
    this.training = new TrainingPanel(root.querySelector('[data-cognitive-training]'), { store: trainingStore, events, onComplete: ids => {
      const references = new Set(ids);
      const neuronIds = (this.state?.memories || []).filter(memory => references.has(memory.id)).flatMap(memory => Array.isArray(memory.neuronIds) ? memory.neuronIds : []);
      this.scene.activate(neuronIds);
    } });
    root.addEventListener('click', event => { const action = event.target.closest('[data-development-camera]')?.dataset.developmentCamera; if (action) this.scene.control(action); }, { signal: this.abort.signal });
    root.querySelector('[data-development-neuron]').addEventListener('change', event => this.scene.select(event.target.value || null), { signal: this.abort.signal });
  }
  update(state = {}, life = null) {
    if (this.abort.signal.aborted) return;
    this.state = state; this.life = life; this.training.update(state); this.pathways.update(state); this.dirty = true;
    if (this.visible) this.refresh();
  }
  setVisible(visible) {
    this.visible = visible;
    if (visible && this.dirty) this.refresh();
    this.scene.setVisible(visible);
    this.training.setVisible(visible);
  }
  refresh() {
    this.dirty = false;
    const data = developmentData(this.state, this.life), signature = JSON.stringify(data);
    renderEvolutionProgress(this.root.querySelector('[data-development-xp]'),this.state,this.state.developmentNow??Date.now());
    if (signature === this.signature) return;
    this.signature = signature; this.data = data; this.scene.update(data);
    this.root.querySelector('.development-network-empty').hidden = Boolean(data.nodes.length);
    this.root.querySelector('.development-network-empty span').textContent = data.neuronCount ? 'Saved neurons have no drawable positions.' : 'No saved neurons are available yet.';
    this.root.querySelector('[data-development-name]').textContent = data.name;
    this.root.querySelector('[data-development-presence]').textContent = data.deceased ? 'Preserved architecture' : 'Living architecture';
    const stats = this.root.querySelector('[data-development-brain-stats]'); stats.replaceChildren();
    for (const [count, label] of [[data.neuronCount, 'Canonical neurons'], [data.synapseCount, 'Canonical synapses'], [data.memoryCount, 'Memories']]) { const item = element('div'); item.append(element('strong', value(count)), element('span', label)); stats.append(item); }
    const select = this.root.querySelector('[data-development-neuron]');
    select.replaceChildren(new Option('Choose a neuron', ''), ...data.nodes.map((node, index) => new Option(`Neuron ${String(index + 1).padStart(2, '0')}`, node.id)));
    select.disabled = !data.nodes.length; this.showSelection(this.scene.selection);
    this.root.querySelector('[data-development-scene-note]').textContent = !data.neuronCount ? 'No saved neural network yet. Your Mindling’s network will appear here.' : data.unplottedNodes || data.unplottedEdges ? `${data.unplottedNodes} neurons lack saved positions; ${data.unplottedEdges} connections cannot be drawn. Totals preserve all identified records.` : `Stage ${data.stageNumber} — ${data.stage}. Visual morphology: ${data.visualNeuronCount} presentation-only nodes. Bright cores mark canonical neurons; ambient pulses are decorative. Drag to rotate · Scroll to zoom.`;
    const metrics = this.root.querySelector('[data-development-metrics]'); metrics.replaceChildren();
    for (const [label, count] of [['Energy', data.energyText], ['Current memories', data.currentMemories], ['Knowledge areas', data.areaCount], ['Lifetime XP', data.lifetimeXP], ['Stage milestones', data.milestones]]) { const row = element('div'); row.append(element('dt', label), element('dd', value(count))); metrics.append(row); }
    const areas = this.root.querySelector('[data-development-areas]'); areas.replaceChildren();
    for (const area of data.areas) { const item = element('li'); item.append(element('span', area.label), element('strong', String(area.count))); areas.append(item); }
    if (!data.areas.length) areas.append(element('li', 'No current knowledge areas yet.', 'development-muted'));
    const events = this.root.querySelector('[data-development-events]'); events.replaceChildren();
    for (const event of data.events) { const item = element('li'), time = element('time', eventDate(event)); if (!event.simulated) time.dateTime = new Date(event.recordedAt ?? event.at).toISOString(); else time.title = 'The real save date was not recorded for this older preview event.'; item.append(time, element('strong', event.title), element('p', event.detail)); if (event.xp !== undefined && event.xp !== null) item.append(element('span', `${event.xp} XP recorded`)); events.append(item); }
    if (!data.events.length) events.append(element('li', 'No development events recorded yet.', 'development-muted'));
  }
  showSelection(selection) {
    const id=typeof selection==='string'?selection:selection?.id;
    this.root.querySelector('[data-development-selection]').textContent=canonicalSelectionText(this.state,typeof selection==='string'?{type:'neuron',id}:selection);
    this.root.querySelector('[data-development-neuron]').value=selection?.type==='synapse'?'':id||'';
  }

  destroy() { if (this.abort.signal.aborted) return; this.abort.abort(); this.training.destroy(); this.pathways.destroy(); this.scene.destroy(); this.state = null; this.life = null; this.data = null; this.root.replaceChildren(); }
}
