import { developmentData } from './development-data.js';
import { NeuralDevelopmentScene } from './neural-development-scene.js';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const date = value => value === null ? 'Not recorded' : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const eventDate = event => `${event.simulated ? 'Simulated date: ' : ''}${date(event.recordedAt ?? event.at)}`;
const value = number => number === null ? '—' : number.toLocaleString();

export class DevelopmentView {
  constructor(root) {
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
            <div class="development-training"><p class="development-eyebrow">DEMONSTRATED ABILITY</p><h4>Cognitive Training <span>Coming Soon</span></h4><p>Stored knowledge is a starting point. Future evaluations will test how your Mindling applies it to unfamiliar problems.</p><p>No cognitive evaluations are recorded.</p></div>
          </div>
        </section>
        <section class="development-pathways development-panel" aria-labelledby="pathways-title">
          <div class="development-panel-heading"><div><p class="development-eyebrow">03 / DIRECTION</p><h3 id="pathways-title">Pathways & Learning</h3></div></div>
          <div class="development-panel-body"><h4>Selected pathways</h4><div class="development-pathway-list" data-development-pathways></div><p class="development-muted">Selected directions, not measured abilities.</p>
            <h4>Acquired knowledge</h4><ul class="development-areas" data-development-areas></ul><p class="development-muted">Current memory counts by area. Pathway-specific knowledge links are not recorded.</p>
            <h4>Recent development</h4><ol class="development-events" data-development-events></ol>
          </div>
        </section>
      </div>`;
    this.scene = new NeuralDevelopmentScene(root.querySelector('.development-scene'), id => this.showSelection(id));
    root.addEventListener('click', event => { const action = event.target.closest('[data-development-camera]')?.dataset.developmentCamera; if (action) this.scene.control(action); }, { signal: this.abort.signal });
    root.querySelector('[data-development-neuron]').addEventListener('change', event => this.scene.select(event.target.value || null), { signal: this.abort.signal });
  }
  update(state = {}, life = null) {
    if (this.abort.signal.aborted) return;
    this.state = state; this.life = life; this.dirty = true;
    if (this.visible) this.refresh();
  }
  setVisible(visible) {
    this.visible = visible;
    if (visible && this.dirty) this.refresh();
    this.scene.setVisible(visible);
  }
  refresh() {
    this.dirty = false;
    const data = developmentData(this.state, this.life), signature = JSON.stringify(data);
    if (signature === this.signature) return;
    this.signature = signature; this.data = data; this.scene.update(data);
    this.root.querySelector('.development-network-empty').hidden = Boolean(data.nodes.length);
    this.root.querySelector('.development-network-empty span').textContent = data.neuronCount ? 'Saved neurons have no drawable positions.' : 'No saved neurons are available yet.';
    this.root.querySelector('[data-development-name]').textContent = data.name;
    this.root.querySelector('[data-development-presence]').textContent = data.deceased ? 'Preserved architecture' : 'Living architecture';
    const stats = this.root.querySelector('[data-development-brain-stats]'); stats.replaceChildren();
    for (const [count, label] of [[data.neuronCount, 'Neurons'], [data.synapseCount, 'Synapses'], [data.memoryCount, 'Memories']]) { const item = element('div'); item.append(element('strong', value(count)), element('span', label)); stats.append(item); }
    const select = this.root.querySelector('[data-development-neuron]');
    select.replaceChildren(new Option('Choose a neuron', ''), ...data.nodes.map((node, index) => new Option(`Neuron ${String(index + 1).padStart(2, '0')}`, node.id)));
    select.disabled = !data.nodes.length; this.showSelection(this.scene.selected);
    this.root.querySelector('[data-development-scene-note]').textContent = !data.neuronCount ? 'No saved neural network yet. Your Mindling’s network will appear here.' : data.unplottedNodes || data.unplottedEdges ? `${data.unplottedNodes} neurons lack saved positions; ${data.unplottedEdges} connections cannot be drawn. Totals preserve all identified records.` : 'Drag to rotate · Scroll to zoom. Ambient pulses are decorative, not learning events.';
    const metrics = this.root.querySelector('[data-development-metrics]'); metrics.replaceChildren();
    for (const [label, count] of [['Current memories', data.currentMemories], ['Knowledge areas', data.areaCount], ['Lifetime XP', data.lifetimeXP], ['Stage milestones', data.milestones]]) { const row = element('div'); row.append(element('dt', label), element('dd', value(count))); metrics.append(row); }
    const xp = this.root.querySelector('[data-development-xp]'); xp.replaceChildren(element('h4', 'Stage progression'));
    if (data.stageXP !== null && data.targetXP !== null) {
      xp.append(element('p', `${value(data.stageXP)} / ${value(data.targetXP)} stage XP`));
      const progress = element('progress'); progress.max = data.targetXP; progress.value = Math.min(data.stageXP, data.targetXP); progress.setAttribute('aria-label', 'XP toward the next stage requirement'); progress.textContent = `${data.stageXP} of ${data.targetXP} XP`; xp.append(progress);
      xp.append(element('p', 'Evolution also requires time and learning milestones.', 'development-muted'));
    } else xp.append(element('p', data.stageNumber === 7 ? `${value(data.stageXP)} stage XP · Final recorded stage` : 'Stage XP is not available in this record.', 'development-muted'));
    if (data.enteredAt !== null) xp.append(element('p', `${data.simulatedClock ? 'Simulation stage entered' : 'Current stage entered'} ${date(data.enteredAt)}`, 'development-muted'));
    const pathways = this.root.querySelector('[data-development-pathways]'); pathways.replaceChildren();
    for (const pathway of data.pathways) pathways.append(element('span', pathway));
    if (!data.pathways.length) pathways.append(element('p', 'No pathways recorded.', 'development-muted'));
    const areas = this.root.querySelector('[data-development-areas]'); areas.replaceChildren();
    for (const area of data.areas) { const item = element('li'); item.append(element('span', area.label), element('strong', String(area.count))); areas.append(item); }
    if (!data.areas.length) areas.append(element('li', 'No current knowledge areas yet.', 'development-muted'));
    const events = this.root.querySelector('[data-development-events]'); events.replaceChildren();
    for (const event of data.events) { const item = element('li'), time = element('time', eventDate(event)); if (!event.simulated) time.dateTime = new Date(event.recordedAt ?? event.at).toISOString(); else time.title = 'The real save date was not recorded for this older preview event.'; item.append(time, element('strong', event.title), element('p', event.detail)); if (event.xp !== undefined && event.xp !== null) item.append(element('span', `${event.xp} XP recorded`)); events.append(item); }
    if (!data.events.length) events.append(element('li', 'No development events recorded yet.', 'development-muted'));
  }
  showSelection(id) {
    const index = this.data?.nodes.findIndex(node => node.id === id) ?? -1;
    const text = index < 0 ? 'Select a neuron to explore its saved connections.' : `Neuron ${String(index + 1).padStart(2, '0')} · ${this.data.edges.filter(edge => edge.from === id || edge.to === id).length} drawable saved connections`;
    this.root.querySelector('[data-development-selection]').textContent = text;
    this.root.querySelector('[data-development-neuron]').value = index < 0 ? '' : id;
  }
  destroy() { if (this.abort.signal.aborted) return; this.abort.abort(); this.scene.destroy(); this.state = null; this.life = null; this.data = null; this.root.replaceChildren(); }
}
