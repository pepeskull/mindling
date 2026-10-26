import { CognitiveEngine } from '../cognition/cognitive-engine.js';
import { cognitiveMetrics, evaluationMetrics } from '../cognition/metrics.js';
import { excerptDescription } from '../memory/content-integrity.js';
import { trainingContext } from './retrieval.js';
import { CRITERIA } from './contract.js';

const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const labels = { supported: 'Supported answer', partially_supported: 'Partially supported answer', unsupported: 'Unsupported answer', inconclusive: 'Inconclusive evaluation', memoryUsage: 'Relevant memory usage', logicalConsistency: 'Logical consistency', contradictions: 'Contradictions', exceptions: 'Exceptions', uncertainty: 'Uncertainty awareness', explanation: 'Explanation quality', met: 'Met', not_met: 'Not met', unclear: 'Unclear', not_applicable: 'Not applicable' };
const date = at => new Date(at).toLocaleString();

export class TrainingPanel {
  constructor(host, { store = null, events, onComplete } = {}) {
    this.host = host; this.store = store; this.onComplete = onComplete; this.abort = new AbortController(); this.generation = 0; this.busy = false;
    this.engine = new CognitiveEngine({ store, events });
    host.innerHTML = `<p class="development-eyebrow">DEMONSTRATED ABILITY</p><h4>Cognitive Training</h4>
      <p class="training-disclosure">Running an evaluation sends your problem and up to 24 candidate memories, including recorded conflicts and links, to the configured AI provider. It makes up to three model requests and may incur provider costs. No XP is awarded and no Energy is deducted.</p>
      <p class="training-disclosure">Reasoning and evaluation use the same provider/model. Results assess support from stored claims, not independently verified truth or general intelligence.</p>
      <section class="cognitive-progress" aria-labelledby="cognitive-progress-title"><h4 id="cognitive-progress-title">Cognitive Progress</h4><dl data-cognitive-summary></dl><p class="development-muted" data-cognitive-memory>Completed evaluations will show actual memory usage here.</p><p class="development-muted" data-cognitive-change>At least two retained evaluations are needed to compare measured results.</p><p class="development-muted" data-cognitive-uncertainty></p><p class="development-muted">These are provider-assessed observations, not independently verified intelligence. Problems, knowledge contexts and models may differ.</p></section>
      <form class="training-form"><label>Problem<textarea name="problem" maxlength="2000" rows="4" required placeholder="Ask your Mindling to apply what it has learned…"></textarea></label><p class="development-muted" data-training-scope>Only a bounded selection of this Mindling’s stored knowledge is sent.</p><button type="submit">Run Evaluation</button></form>
      <p class="training-status" role="status" aria-live="polite">Ready</p><div data-training-result></div>
      <h4>Recorded evaluations</h4><p class="development-muted" data-training-totals>No evaluations loaded.</p><div data-training-history></div>`;
    this.form = host.querySelector('form'); this.input = host.querySelector('textarea'); this.button = host.querySelector('button'); this.status = host.querySelector('.training-status');
    this.form.addEventListener('submit', event => { event.preventDefault(); this.submit(); }, { signal: this.abort.signal });
    this.input.addEventListener('input', () => { clearTimeout(this.previewTimer); this.previewTimer = setTimeout(() => this.preview(), 200); }, { signal: this.abort.signal });
    host.addEventListener('click', event => { const id = event.target.closest('[data-training-record]')?.dataset.trainingRecord; if (id && !this.busy) { const record = this.history?.records.find(item => item.id === id); if (record) this.renderResult(record); } }, { signal: this.abort.signal });
    this.button.disabled = true;
    if (!store) this.status.textContent = 'Evaluations are available in interactive gameplay, not read-only snapshots.';
  }
  update(state = {}) {
    this.state = state;
    const identity = state.mindlingId || state.id;
    if (identity !== this.identity) {
      this.cancel(); this.identity = identity; this.history = null; this.currentRecord = null; this.input.value = '';
      this.host.querySelector('[data-training-result]').replaceChildren(); this.host.querySelector('[data-training-history]').replaceChildren();
      this.host.querySelector('[data-training-totals]').textContent = 'No evaluations loaded.';
      this.engine.setActiveMindling(identity); this.renderProgress();
      if (this.visible) this.load();
    }
    this.button.disabled = !this.store || !identity || this.busy;
    if (this.currentRecord && !this.busy) this.renderResult(this.currentRecord);
  }
  setVisible(visible) { this.visible = visible; if (visible) { this.load(); this.preview(); } else this.cancel(); }
  cancel() { this.generation++; this.engine.cancel(); clearTimeout(this.previewTimer); this.busy = false; this.input.disabled = false; if (this.store) this.status.textContent = 'Ready'; this.button.disabled = !this.store || !this.identity; }
  setStatus(text) { this.status.textContent = text; }
  preview() {
    if (!this.state) return;
    const problem = this.input.value.trim(), context = trainingContext(problem, this.state);
    this.host.querySelector('[data-training-scope]').textContent = problem ? `${context.candidates.length} of ${context.totalCurrent} usable current memories preselected locally. The service will assess semantic relevance; no whole-database upload beyond this bounded candidate pool.` : 'Enter a problem to preview the bounded memory selection.';
  }
  async load() {
    if (!this.store || !this.identity) return;
    const token = this.generation, identity = this.identity;
    try { const { history } = await this.engine.history(); if (token !== this.generation || identity !== this.identity || !this.visible) return; this.history = history; this.renderHistory(); }
    catch { if (token === this.generation) this.setStatus('Training history could not be loaded. Check local storage and reopen Development.'); }
  }
  async submit() {
    if (this.busy || !this.visible || !this.store || !this.identity) return;
    const problem = this.input.value.trim();
    if (!problem || this.input.value.length > 2000) { this.setStatus('Enter a problem between 1 and 2,000 characters.'); return; }
    this.busy = true; this.button.disabled = true; this.input.disabled = true;
    this.currentRecord = null; this.host.querySelector('[data-training-result]').replaceChildren();
    const token = this.generation, identity = this.identity;
    this.setStatus('Retrieving memories, reasoning and evaluating support…');
    try {
      const completion = await this.engine.requestUserProblem({ mindlingId: identity, problem });
      if (token !== this.generation || !this.visible || identity !== this.identity) return;
      this.state = completion.source; this.history = completion.history; this.renderHistory(); this.renderResult(completion.record);
      this.setStatus(completion.cached ? 'Showing the saved evaluation for this problem and knowledge context. No new request was sent.' : 'Evaluation completed and saved. No XP, Energy or knowledge changes.');
      if (!completion.cached) this.onComplete?.(completion.record.result.reasoning.memoryIds);
    } catch (error) {
      if (token === this.generation) this.setStatus(error.message || 'Evaluation failed. No result was saved.');
    } finally {
      if (token === this.generation) { this.busy = false; this.button.disabled = !this.store || !this.identity; this.input.disabled = false; }
    }
  }
  renderProgress() {
    const metrics = cognitiveMetrics(this.history), summary = this.host.querySelector('[data-cognitive-summary]'); summary.replaceChildren();
    const add = (label, count) => { const row = node('div'); row.append(node('dt', label), node('dd', count === null ? '—' : String(count))); summary.append(row); };
    add('Completed evaluations', this.history ? metrics.completed : null);
    for (const [outcome, count] of Object.entries(metrics.outcomes)) add(labels[outcome], this.history ? count : null);
    const latest = metrics.latest;
    this.host.querySelector('[data-cognitive-memory]').textContent = latest ? `Latest retained evaluation (${date(latest.at)}): ${latest.candidateMemories} candidates, ${latest.retrievedMemories} retrieved semantically, ${latest.directlyReferencedMemories} directly cited. Coverage: ${latest.memoryCoverage.referenced} / ${latest.memoryCoverage.retrieved} retrieved memories cited${latest.memoryCoverage.retrieved ? '.' : ' (no coverage fraction available).'} Applicable criteria met: ${latest.criteria.passed} / ${latest.criteria.applicable}; ${latest.criteria.unclear} unclear.` : 'Completed evaluations will show actual memory usage here.';
    const comparison = metrics.comparison;
    this.host.querySelector('[data-cognitive-change]').textContent = comparison ? `Last two retained results (${date(comparison.previous.at)} → ${date(comparison.latest.at)}): ${labels[comparison.previous.outcome]} → ${labels[comparison.latest.outcome]}; memories cited ${comparison.previous.directlyReferencedMemories} of ${comparison.previous.retrievedMemories} retrieved → ${comparison.latest.directlyReferencedMemories} of ${comparison.latest.retrievedMemories} retrieved; applicable criteria met ${comparison.previous.criteria.passed}/${comparison.previous.criteria.applicable} → ${comparison.latest.criteria.passed}/${comparison.latest.criteria.applicable}; uncertainty ${comparison.previous.uncertainty} → ${comparison.latest.uncertainty}. This comparison is not a controlled measure of improvement.` : 'At least two retained evaluations are needed to compare measured results.';
    this.host.querySelector('[data-cognitive-uncertainty]').textContent = !this.history ? 'Evaluation metrics have not been loaded.' : `${metrics.retainedCount} retained observations: uncertainty low ${metrics.uncertainty.low}, moderate ${metrics.uncertainty.moderate}, high ${metrics.uncertainty.high}. Completed/outcome counts above are lifetime totals; other summaries use only retained records.`;
  }
  renderHistory() {
    const host = this.host.querySelector('[data-training-history]'); host.replaceChildren();
    const history = this.history;
    if (!history) return;
    this.renderProgress();
    this.host.querySelector('[data-training-totals]').textContent = `${history.records.length} retained records, up to 20 per Mindling. Select an entry to inspect its evidence and measured results.`;
    for (const record of [...history.records].reverse()) { const button = node('button', `${date(record.at)} · ${labels[record.result.outcome]} · ${record.problem.slice(0, 90)}`, 'training-history-item'); const m = evaluationMetrics(record); button.append(node('span', `${m.retrievedMemories} retrieved · ${m.directlyReferencedMemories} cited · ${m.criteria.passed}/${m.criteria.applicable} applicable criteria met · ${m.uncertainty} uncertainty`, 'cognitive-record-metrics')); button.type = 'button'; button.dataset.trainingRecord = record.id; host.append(button); }
    if (!history.records.length) host.append(node('p', 'No completed evaluations yet.', 'development-muted'));
  }
  renderResult(record) {
    this.currentRecord = record;
    const host = this.host.querySelector('[data-training-result]'); host.replaceChildren();
    const { reasoning, evaluation, selection, outcome, model } = record.result;
    host.append(node('h4', labels[outcome]), node('p', `Saved ${date(record.at)} · ${model}`, 'development-muted'), node('h5', 'Problem'), node('p', record.problem), node('h5', 'Answer'), node('p', reasoning.answer), node('h5', 'Explanation'), node('p', reasoning.explanation));
    const measured = evaluationMetrics(record);
    host.append(node('p', `Measured usage: ${measured.candidateMemories} candidates; ${measured.retrievedMemories} retrieved; ${measured.directlyReferencedMemories} directly cited. ${measured.retrievedMemories ? `Coverage: ${measured.memoryCoverage.referenced} of ${measured.memoryCoverage.retrieved} retrieved memories cited.` : 'Coverage unavailable: no memories were retrieved.'} Criteria: ${measured.criteria.passed}/${measured.criteria.applicable} applicable met, ${measured.criteria.failed} not met, ${measured.criteria.unclear} unclear.`, 'development-muted'));
    if (reasoning.insufficientInformation) host.append(node('p', 'Insufficient information: a supported answer could not be established.', 'training-warning'));
    host.append(node('p', `Uncertainty: ${reasoning.uncertainty}`, 'development-muted'));
    for (const missing of reasoning.missingInformation) host.append(node('p', `Missing: ${missing}`));
    if (reasoning.facts.length) { host.append(node('h5', 'Quoted stored claims')); for (const fact of reasoning.facts) host.append(node('blockquote', `${fact.quote} (${fact.basis === 'recorded_conflict' ? 'Recorded conflict' : 'Stored claim'}; ${fact.memoryId})`)); }
    if (reasoning.inferences.length) { host.append(node('h5', 'Inferences')); for (const inference of reasoning.inferences) host.append(node('p', `${inference.text} [${inference.memoryIds.join(', ')}]`)); }
    host.append(node('h5', 'Referenced memories'));
    for (const memoryId of reasoning.memoryIds) {
      const memory = record.context.candidates.find(item => item.id === memoryId), current = this.state?.memories?.find(item => item.id === memoryId);
      host.append(node('p', memory.content), node('p', excerptDescription(memory), 'development-muted'));
      host.append(node('p', `${memoryId}${!current ? ' · no longer available in this Mindling' : current.supersededBy || current.intelligence?.current === false ? ' · historical or superseded since evaluation' : (typeof current.content !== 'string' || current.content.trim() !== memory.content) && memory.complete ? ' · content changed since evaluation' : ''}`, 'development-muted'));
    }
    if (!reasoning.memoryIds.length) host.append(node('p', 'No memories were cited.'));
    host.append(node('h5', 'Evaluation criteria'), node('p', evaluation.summary));
    for (const key of CRITERIA) { const c = evaluation.criteria[key]; host.append(node('h6', `${labels[key]} — ${labels[c.status]}`), node('p', c.explanation)); if (c.memoryIds.length) host.append(node('p', `Criterion evidence: ${c.memoryIds.map(id => `${id} (${reasoning.memoryIds.includes(id) ? 'cited by reasoning' : 'selected but not cited by reasoning'})`).join(', ')}`, 'development-muted')); }
    const audit = node('details'); audit.append(node('summary', 'Retrieval and evaluation method'));
    audit.append(node('p', selection.explanation), node('p', `${record.context.candidates.length} candidates from ${record.context.totalCurrent} current records; ${selection.memoryIds.length} selected semantically. Candidate search is bounded and may miss relevant knowledge. Only saved ID relationships were supplied; relationships do not establish truth.`));
    for (const memory of record.context.candidates) audit.append(node('p', `${memory.id}: ${memory.ranking.reasons.join('; ')}; ${excerptDescription(memory)}${memory.contradictions.length ? '; recorded conflicts supplied' : ''}${memory.conflictsComplete ? '' : '; conflict context is incomplete'}${memory.omittedLinks ? `; ${memory.omittedLinks} links omitted` : ''}`));
    for (const id of selection.memoryIds.filter(id => !reasoning.memoryIds.includes(id))) audit.append(node('p', `Selected but not cited by reasoning: ${id}. This is context for review, not a quoted premise of the answer.`));
    for (const memory of record.context.candidates) for (const link of memory.links) if (!link.inContext) audit.append(node('p', `${memory.id} → ${link.id}: ${link.availability || 'outside context'} saved ${link.kind} reference; target content was not supplied and is not evidence.`));
    audit.append(node('p', 'Outcome rule: insufficient information or no references → inconclusive; failed memory usage/logical consistency → unsupported; other failed criteria → partially supported; unclear criteria → inconclusive; otherwise supported. Same-provider model review is fallible and is not independent verification.')); host.append(audit);
  }
  destroy() { this.cancel(); this.engine.destroy(); this.abort.abort(); this.state = null; this.history = null; this.currentRecord = null; this.host.replaceChildren(); }
}
