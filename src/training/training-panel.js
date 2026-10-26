import { excerptDescription } from '../memory/content-integrity.js';
import { trainingContext, assertTrainingContext } from './retrieval.js';
import { CRITERIA, validateContext, validateResult } from './contract.js';

const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const labels = { supported: 'Supported answer', partially_supported: 'Partially supported answer', unsupported: 'Unsupported answer', inconclusive: 'Inconclusive evaluation', memoryUsage: 'Relevant memory usage', logicalConsistency: 'Logical consistency', contradictions: 'Contradictions', exceptions: 'Exceptions', uncertainty: 'Uncertainty awareness', explanation: 'Explanation quality', met: 'Met', not_met: 'Not met', unclear: 'Unclear', not_applicable: 'Not applicable' };
const errors = { SERVICE_UNAVAILABLE: 'The reasoning service is not configured or its model is unavailable.', RATE_LIMITED: 'Too many requests. Wait a minute before trying again.', EVALUATION_IN_PROGRESS: 'This evaluation is already running. Wait for it to finish.', EVALUATION_TIMEOUT: 'The evaluation timed out. No successful result was recorded.', REQUEST_INVALID: 'The stored context could not be submitted. Refresh and try again.', REQUEST_TOO_LARGE: 'The selected context is too large. Try a shorter problem.' };
const describeError = code => (Object.hasOwn(errors, code) ? errors[code] : null) || 'The service could not complete a valid evaluation. No successful result was recorded.';
const date = at => new Date(at).toLocaleString();

export class TrainingPanel {
  constructor(host, { store = null, onComplete } = {}) {
    this.host = host; this.store = store; this.onComplete = onComplete; this.abort = new AbortController(); this.generation = 0; this.busy = false;
    host.innerHTML = `<p class="development-eyebrow">DEMONSTRATED ABILITY</p><h4>Cognitive Training</h4>
      <p class="training-disclosure">Running an evaluation sends your problem and up to 24 candidate memories, including recorded conflicts and links, to the configured AI provider. It makes up to three model requests and may incur provider costs. No XP is awarded and no Energy is deducted.</p>
      <p class="training-disclosure">Reasoning and evaluation use the same provider/model. Results assess support from stored claims, not independently verified truth or general intelligence.</p>
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
      if (this.visible) this.load();
    }
    this.button.disabled = !this.store || !identity || this.busy;
    if (this.currentRecord && !this.busy) this.renderResult(this.currentRecord);
  }
  setVisible(visible) { this.visible = visible; if (visible) { this.load(); this.preview(); } else this.cancel(); }
  cancel() { this.generation++; this.request?.abort(); clearTimeout(this.previewTimer); this.busy = false; this.input.disabled = false; if (this.store) this.status.textContent = 'Ready'; this.button.disabled = !this.store || !this.identity; }
  setStatus(text) { this.status.textContent = text; }
  preview() {
    if (!this.state) return;
    const problem = this.input.value.trim(), context = trainingContext(problem, this.state);
    this.host.querySelector('[data-training-scope]').textContent = problem ? `${context.candidates.length} of ${context.totalCurrent} usable current memories preselected locally. The service will assess semantic relevance; no whole-database upload beyond this bounded candidate pool.` : 'Enter a problem to preview the bounded memory selection.';
  }
  async load() {
    if (!this.store || !this.identity) return;
    const token = this.generation, identity = this.identity;
    try { const history = await this.store.load(identity); if (token !== this.generation || identity !== this.identity || !this.visible) return; this.history = history; this.renderHistory(); }
    catch { if (token === this.generation) this.setStatus('Training history could not be loaded. Check local storage and reopen Development.'); }
  }
  async fingerprint(context, identity) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ identity, context })));
    return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  async submit() {
    if (this.busy || !this.visible || !this.store || !this.identity) return;
    const problem = this.input.value.trim();
    if (!problem || problem.length > 2000) { this.setStatus('Enter a problem between 1 and 2,000 characters.'); return; }
    this.busy = true; this.button.disabled = true; this.input.disabled = true;
    this.currentRecord = null; this.host.querySelector('[data-training-result]').replaceChildren();
    this.request = new AbortController(); const controller = this.request, signal = controller.signal, token = this.generation, identity = this.identity;
    const live = () => { if (token !== this.generation || !this.visible || signal.aborted || identity !== this.identity) throw new DOMException('Evaluation cancelled', 'AbortError'); };
    let timer;
    try {
      this.setStatus('Retrieving current stored knowledge…');
      const source = await this.store.source(identity); live();
      const context = trainingContext(problem, source);
      if (!context.candidates.length) throw Error('No usable current memories are stored. Teach relevant rules and exceptions before evaluating a problem.');
      validateContext(context);
      const id = await this.fingerprint(context, identity); live();
      const run = async () => {
        const previous = await this.store.load(identity); live();
        const existing = previous.records.find(record => record.id === id);
        if (existing) { this.history = previous; this.renderHistory(); this.renderResult(existing); this.setStatus('Showing the saved evaluation for this problem and knowledge context. No new request was sent.'); return; }
        this.setStatus('Selecting relevant memories, generating an answer and evaluating its support…');
        timer = setTimeout(() => controller.abort(), 55000);
        const response = await fetch('/api/mindling/reason', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ id, context }) });
        const bodyText = await response.text(); live();
        if (bodyText.length > 100000) throw Error('The reasoning service returned an oversized response. No result was saved.');
        let result; try { result = JSON.parse(bodyText); } catch { throw Error('The reasoning service returned an unreadable response. No result was saved.'); }
        if (!response.ok) throw Error(describeError(result?.error?.code));
        validateResult(result, context);
        const latest = await this.store.source(identity); live(); assertTrainingContext(context, latest);
        const record = { id, mindlingId: identity, at: Date.now(), problem, context, result };
        this.setStatus('Saving the completed evaluation…');
        // The store checks identity and context atomically against persisted data.
        const history = await this.store.save(record); live();
        this.state = latest; this.history = history; this.renderHistory(); this.renderResult(record);
        this.setStatus('Evaluation completed and saved. No XP, Energy or knowledge changes.');
        this.onComplete?.(result.reasoning.memoryIds);
      };
      if (navigator.locks?.request) await navigator.locks.request(`mindling-training:${identity}:${id}`, { ifAvailable: true }, async lock => { if (!lock) throw Error('This evaluation is running in another tab. Wait, then try again.'); await run(); });
      else await run();
    } catch (error) {
      if (token === this.generation) this.setStatus(error.name === 'AbortError' ? 'Evaluation cancelled or timed out. No new successful result is shown.' : error.message === 'Invalid reasoning service data' ? 'The service returned an invalid evaluation. No result was saved.' : error.message || 'Evaluation failed. No result was saved.');
    } finally {
      clearTimeout(timer);
      if (token === this.generation) { this.busy = false; this.button.disabled = !this.store || !this.identity; this.input.disabled = false; }
    }
  }
  renderHistory() {
    const host = this.host.querySelector('[data-training-history]'); host.replaceChildren();
    const history = this.history;
    if (!history) return;
    const t = history.totals;
    this.host.querySelector('[data-training-totals]').textContent = `${t.completed} completed · ${t.supported} supported · ${t.partially_supported} partial · ${t.unsupported} unsupported · ${t.inconclusive} inconclusive. Showing up to 20 retained records.`;
    for (const record of [...history.records].reverse()) { const button = node('button', `${date(record.at)} · ${labels[record.result.outcome]} · ${record.problem.slice(0, 90)}`, 'training-history-item'); button.type = 'button'; button.dataset.trainingRecord = record.id; host.append(button); }
    if (!history.records.length) host.append(node('p', 'No completed evaluations yet.', 'development-muted'));
  }
  renderResult(record) {
    this.currentRecord = record;
    const host = this.host.querySelector('[data-training-result]'); host.replaceChildren();
    const { reasoning, evaluation, selection, outcome, model } = record.result;
    host.append(node('h4', labels[outcome]), node('p', `Saved ${date(record.at)} · ${model}`, 'development-muted'), node('h5', 'Problem'), node('p', record.problem), node('h5', 'Answer'), node('p', reasoning.answer), node('h5', 'Explanation'), node('p', reasoning.explanation));
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
  destroy() { this.cancel(); this.abort.abort(); this.state = null; this.history = null; this.currentRecord = null; this.host.replaceChildren(); }
}
