import { AdaptivePathwaysView } from '../pathways/pathway-view.js';
import { XP } from '../economy/xp.js';
import { developmentData } from './development-data.js';
import { NetworkView } from '../network/network-view.js';

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
          <p class="development-stage" data-development-stage></p>
          <div class="development-scene">
            <div class="network-cloud-plot"></div>
            <div class="development-network-empty" hidden><p>A network waiting to grow.</p><span>No saved neurons are available yet.</span></div>
          </div>
          <div class="development-progression"><dl class="development-metrics" data-development-metrics></dl><div class="development-xp" data-development-xp></div></div>
        </section>
        <section class="development-pathways development-panel" aria-labelledby="pathways-title">
          <div class="development-panel-heading"><div><p class="development-eyebrow">02 / DIRECTION</p><h3 id="pathways-title">Pathways & Learning</h3></div></div>
          <div class="development-panel-body"><div data-adaptive-pathways></div>
            <h4>Acquired knowledge</h4><ul class="development-areas" data-development-areas></ul><p class="development-muted">Current memory counts by area. Specialization evidence is tracked separately.</p>
            <h4>Recent development</h4><ol class="development-events" data-development-events></ol>
          </div>
        </section>
      </div>`;
    this.pathways = new AdaptivePathwaysView(root.querySelector('[data-adaptive-pathways]'));
    this.cloud = new NetworkView(root.querySelector('.network-cloud-plot'));
  }
  update(state = {}, life = null) {
    if (this.abort.signal.aborted) return;
    this.state = state; this.life = life; this.dirty = true;
    this.cloud.update(state);
    if (this.visible) this.refresh();
  }
  ingest(event) { return this.cloud.ingest(event); }
  setVisible(visible) {
    this.visible = visible;
    if (visible && this.dirty) this.refresh();
    this.cloud.setVisible(visible);
  }
  refresh() {
    this.dirty = false;
    const data = developmentData(this.state, this.life), signature = JSON.stringify(data);
    this.pathways.update(this.state, data.livePathways);
    if (signature === this.signature) return;
    this.signature = signature; this.data = data;
    this.root.querySelector('.development-network-empty').hidden = Boolean(data.nodes.length);
    this.root.querySelector('.development-network-empty span').textContent = data.neuronCount ? 'Saved neurons have no drawable positions.' : 'No saved neurons are available yet.';
    this.root.querySelector('[data-development-name]').textContent = data.name;
    this.root.querySelector('[data-development-stage]').textContent=`${data.stage} · Stage ${String(data.stageNumber??'—').padStart(2,'0')}`;
    this.root.querySelector('[data-development-presence]').textContent = data.deceased ? 'Preserved architecture' : 'Living architecture';
    const metrics = this.root.querySelector('[data-development-metrics]'); metrics.replaceChildren();
    for (const [label, count] of [['Energy', data.energyText], ['Current memories', data.currentMemories], ['Knowledge areas', data.areaCount], ['Lifetime XP', data.lifetimeXP]]) { const row = element('div'); row.append(element('dt', label), element('dd', value(count))); metrics.append(row); }
    const xp = this.root.querySelector('[data-development-xp]'); xp.replaceChildren(element('h4', 'Stage XP'));
    let stageProgress;
    if (data.stageXP !== null && data.targetXP !== null) {
      xp.append(element('p', `${value(data.stageXP)} / ${value(data.targetXP)} XP`));
      stageProgress = element('progress'); stageProgress.max = data.targetXP; stageProgress.value = Math.min(data.stageXP, data.targetXP);
      stageProgress.setAttribute('aria-label', 'XP toward the next stage requirement'); stageProgress.textContent = `${data.stageXP} of ${data.targetXP} XP`;
    } else xp.append(element('p', data.stageNumber === 7 ? `${value(data.stageXP)} stage XP · Final recorded stage` : 'Stage XP is not available in this record.', 'development-muted'));
    xp.append(element('p', `${data.dailyXP} / ${XP.daily} XP today`, 'daily-xp-counter'));
    if (stageProgress) xp.append(stageProgress);
    const dailyProgress = element('progress', `${data.dailyXP} of ${XP.daily} XP today`, 'daily-xp-progress');
    dailyProgress.max = XP.daily; dailyProgress.value = data.dailyXP;
    dailyProgress.setAttribute('aria-label', 'Daily XP earned today'); xp.append(dailyProgress);
    if (data.dailyXP === XP.daily) xp.append(element('p', 'Research paused — Daily XP limit reached', 'daily-xp-cap'));
    else if(data.researchAvailable&&!data.deceased)xp.append(element('p','Research available','daily-xp-cap'));
    const areas = this.root.querySelector('[data-development-areas]'); areas.replaceChildren();
    for (const area of data.areas) { const item = element('li'); item.append(element('span', area.label), element('strong', String(area.count))); areas.append(item); }
    if (!data.areas.length) areas.append(element('li', 'No current knowledge areas yet.', 'development-muted'));
    const events = this.root.querySelector('[data-development-events]'); events.replaceChildren();
    for (const event of data.events) { const item = element('li'), time = element('time', eventDate(event)); if (!event.simulated) time.dateTime = new Date(event.recordedAt ?? event.at).toISOString(); else time.title = 'The real save date was not recorded for this older preview event.'; item.append(time, element('strong', event.title), element('p', event.detail)); if (event.xp !== undefined && event.xp !== null) item.append(element('span', `${event.xp} XP recorded`)); events.append(item); }
    if (!data.events.length) events.append(element('li', 'No development events recorded yet.', 'development-muted'));
  }
  destroy() { if (this.abort.signal.aborted) return; this.abort.abort(); this.pathways.destroy(); this.cloud.destroy(); this.state = null; this.life = null; this.data = null; this.root.replaceChildren(); }
}
