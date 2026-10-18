import { MODEL_CATALOG, modelIdentity, formatBytes } from './model-catalog.js';
import { EXAMPLES, evaluateResultForExample } from './evaluation.js';
import { EMBEDDING_BENCHMARK, embeddingBenchmarkMetrics } from './embedding-benchmark.js';
import { ModelSequenceController } from './model-runner.js';
import { displayMetric } from './benchmark.js';

const $ = selector => document.querySelector(selector);
const grid = $('[data-model-grid]');
const input = $('[data-input]');
const selected = new Set(['qwen-0.5b']);
const results = [];
const telemetry = new Map();
const completed = new Set();
let labReady = false;
let labReadyPromise;
let latestRelationship = null;

function escape(value) {
  return String(value).replace(/[&<>'"]/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function renderCatalog() {
  grid.innerHTML = MODEL_CATALOG.map((model, index) => `
    <label class="model-card ${selected.has(model.key) ? 'selected' : ''}" data-model-card="${model.key}">
      <input type="checkbox" value="${model.key}" ${selected.has(model.key) ? 'checked' : ''} aria-label="Select ${escape(model.name)}">
      <div><h3>${String(index + 1).padStart(2, '0')} · ${escape(model.name)}</h3><span class="family">${escape(model.family)} · ${escape(model.kind)}</span>
        <div class="model-meta"><div><span>Task</span><strong>${escape(model.task)}</strong></div><div><span>Languages</span><strong>${escape(model.languages)}</strong></div><div><span>Download</span><strong>${formatBytes(model.bytes)}</strong></div><div><span>Runtime</span><strong>${model.runtime.webgpu ? 'WebGPU · ' : ''}WASM</strong></div></div>
        <p>${escape(model.notes)}</p>${model.restriction ? `<p class="restriction">${escape(model.restriction)}</p>` : ''}
        <div class="model-foot"><code title="${escape(modelIdentity(model))}">${escape(model.repo || 'Two pinned model components')}@${escape((model.revision || 'hybrid').slice(0, 9))}</code><span class="cache-state" data-cache-state="${model.key}">${completed.has(model.key) ? 'Usable this session' : 'Download required / unchecked'}</span></div>
      </div>
    </label>`).join('');
  grid.querySelectorAll('input').forEach(box => box.addEventListener('change', () => {
    if (box.checked) selected.add(box.value); else selected.delete(box.value);
    box.closest('.model-card').classList.toggle('selected', box.checked); updateSelectedCount();
  }));
  updateSelectedCount();
}

function updateSelectedCount() {
  $('[data-selected-count]').textContent = `${selected.size} model${selected.size === 1 ? '' : 's'} selected`;
  $('[data-run]').disabled = selected.size === 0 || controller.active || !labReady;
}

function renderExamples() {
  const select = $('[data-examples]');
  select.innerHTML = '<option value="">Choose an editable example</option>' + EXAMPLES.map((example, index) => `<option value="${index}">${escape(example)}</option>`).join('');
  select.addEventListener('change', () => { if (select.value !== '') input.value = EXAMPLES[Number(select.value)]; });
}

function setRunUi(active) {
  $('[data-run]').disabled = active || selected.size === 0 || !labReady;
  $('[data-stop]').disabled = !active;
  $('[data-run-relationships]').disabled = active || !labReady;
  $('[data-run-embedding-benchmark]').disabled = active || !labReady;
  $('[data-pulse]').classList.toggle('active', active);
}

function eventHandler(event) {
  const model = event.model;
  if (model) $('[data-current-model]').textContent = model.name;
  $('[data-run-progress]').textContent = event.state === 'IDLE' ? (event.stopped ? 'Stopped' : 'Sequence complete') : event.state.toLowerCase().replaceAll('_', ' ');
  if (!model) return;
  const stats = telemetry.get(model.key) || { downloadBytes: 0, downloadStarted: null, downloadMs: null };
  if (event.state === 'DOWNLOADING') {
    if (stats.downloadStarted === null) stats.downloadStarted = performance.now();
    if (Number.isFinite(event.loaded)) stats.downloadBytes = Math.max(stats.downloadBytes, event.loaded);
    const percent = Number.isFinite(event.total) && event.total ? ` · ${Math.min(100, event.loaded / event.total * 100).toFixed(0)}%` : '';
    $('[data-run-progress]').textContent = `downloading${percent}`;
  } else if (stats.downloadStarted !== null && stats.downloadMs === null && ['INITIALIZING', 'RUNNING'].includes(event.state)) stats.downloadMs = performance.now() - stats.downloadStarted;
  telemetry.set(model.key, stats);
  if (event.state === 'RESULT') {
    const row = { model, result: event.result, telemetry: stats, evaluation: evaluateResultForExample(event.result, input.value.trim(), model.kind) };
    results.push(row);
    if (event.result.ok) completed.add(model.key);
    renderResult(row); renderComparison(); $('[data-export]').disabled = false;
    const state = document.querySelector(`[data-cache-state="${model.key}"]`);
    if (state) state.textContent = event.result.ok ? 'Usable this session' : 'Failed · rerun selected';
  }
}

const controller = new ModelSequenceController({ onEvent: eventHandler });

function observedRows(row) {
  const value = row.result.observed || {};
  const items = [
    ['Domain', value.domain], ['Topic', value.topic], ['Information type', value.type || value.typeLabel],
    ['Confidence / score', Number.isFinite(value.confidence) ? value.confidence.toFixed(3) : Number.isFinite(value.score) ? value.score.toFixed(3) : null],
    ['Evidence', value.evidence], ['Sentiment', value.sentiment],
    ['Vector dimensions', row.result.embedding?.dimensions], ['Vector norm', Number.isFinite(row.result.embedding?.norm) ? row.result.embedding.norm.toFixed(4) : null],
    ['Cold initialization', Number.isFinite(row.result.timings?.initializationMs) ? `${row.result.timings.initializationMs.toFixed(0)} ms` : null],
    ['Loaded-model inference', Number.isFinite(row.result.timings?.inferenceMs) ? `${row.result.timings.inferenceMs.toFixed(0)} ms` : null],
  ];
  return items.map(([label, value]) => `<div><span>${label}</span><strong>${escape(value ?? 'Not produced')}</strong></div>`).join('');
}

function renderResult(row) {
  $('[data-results-section]').hidden = false;
  const valid = row.result.ok && row.result.validation?.valid;
  const status = row.result.ok ? (valid ? 'Valid output' : 'Invalid output') : 'Failed';
  const card = document.createElement('details'); card.className = 'result-card'; card.open = true;
  card.innerHTML = `<summary><h3>${escape(row.model.name)}</h3><span>${escape(row.model.task)}</span><span>${displayMetric(row.result.timings?.totalMs, ' ms')}</span><span class="status ${valid ? 'valid' : row.result.ok ? 'invalid' : 'failed'}">${status}</span></summary>
    <div class="result-body"><div><h4>Observed values</h4><div class="observed-grid">${observedRows(row)}</div><h4 style="margin-top:20px">Evaluation</h4><p class="${row.evaluation.pass === false ? 'diagnostic' : ''}">${escape(row.evaluation.label)}</p></div><div><h4>Raw model/native output</h4><pre></pre></div></div>`;
  const raw = row.result.ok ? {
    identity: row.result.identity, backend: row.result.backend, settings: { dtype: row.model.dtype, maxNewTokens: row.model.maxNewTokens || null },
    rawGeneratedText: row.result.raw ?? 'Not produced — this task does not generate text.', nativeOutput: row.result.nativeOutput ?? null,
    parsed: row.result.parsed ?? null, validation: row.result.validation, embedding: row.result.embedding ?? null,
    memory: row.result.memory ?? 'Unavailable', download: {
      bytesObserved: row.telemetry.downloadBytes || 'Unavailable or served from cache',
      durationMs: row.telemetry.downloadMs ?? 'Unavailable or served from cache',
    }, postprocessing: row.result.postprocessing ?? null, timings: row.result.timings,
  } : { error: row.result.error, diagnostic: row.result.diagnostic };
  card.querySelector('pre').textContent = JSON.stringify(raw, null, 2);
  if (row.result.error === 'OUT_OF_MEMORY' || row.result.error === 'WORKER_RUNTIME') {
    const notice = document.createElement('p'); notice.className = 'diagnostic';
    notice.textContent = 'The browser worker could not continue. Close memory-heavy tabs and restart the browser before retrying this model.';
    card.querySelector('.result-body > div').append(notice);
  }
  $('[data-results]').append(card);
}

function renderComparison() {
  const success = results.filter(row => row.result.ok).length;
  const valid = results.filter(row => row.result.ok && row.result.validation?.valid).length;
  const scored = results.filter(row => row.evaluation.scored);
  const passed = scored.filter(row => row.evaluation.pass).length;
  $('[data-benchmark-summary]').innerHTML = `<div><span>Execution success</span><strong>${success} / ${results.length} · ${results.length ? (success / results.length * 100).toFixed(0) : 0}%</strong></div><div><span>Task output valid</span><strong>${valid} / ${results.length} · ${results.length ? (valid / results.length * 100).toFixed(0) : 0}%</strong></div><div><span>Pre-scored semantic cases</span><strong>${scored.length ? `${passed} / ${scored.length} · ${(passed / scored.length * 100).toFixed(0)}%` : 'Unavailable'}</strong></div>`;
  $('[data-comparison]').innerHTML = results.map(row => {
    const valid = row.result.ok && row.result.validation?.valid;
    return `<tr><td>${escape(row.model.name)}</td><td>${escape(row.model.task)}</td><td>${valid ? 'Valid' : row.result.ok ? 'Invalid' : 'Failed'}</td><td>${escape(row.evaluation.label)}</td><td>${displayMetric(row.result.timings?.totalMs, ' ms')}</td><td>${row.telemetry.downloadBytes ? formatBytes(row.telemetry.downloadBytes) : 'Cached or unavailable'}</td><td>${escape(row.result.backend || 'Not produced')}</td><td>${escape(row.result.error || 'None')}</td></tr>`;
  }).join('');
}

async function runSelected() {
  if (controller.active) return;
  await labReadyPromise;
  if (!labReady) return;
  const text = input.value.trim(); if (!text) { input.focus(); return; }
  results.length = 0; telemetry.clear(); $('[data-results]').replaceChildren(); $('[data-comparison]').replaceChildren(); $('[data-results-section]').hidden = false; $('[data-export]').disabled = true;
  setRunUi(true);
  const models = MODEL_CATALOG.filter(model => selected.has(model.key));
  try {
    await controller.run(models, () => ({
      text, backendPreference: $('[data-backend]').value,
      references: ['learn trading and stocks', 'learn finance and crypto', 'The Earth rotates around its axis.'],
    }));
  } finally { setRunUi(false); $('[data-current-model]').textContent = 'No model running'; }
}

function relationshipOptions() {
  const strategy = $('[data-clustering]').value;
  return strategy === 'complete-link'
    ? { clustering: strategy, threshold: Number($('[data-cluster-threshold]').value) }
    : { clustering: 'disabled' };
}

async function runRelationshipWorkload(texts, benchmarkCases = null) {
  if (controller.active) return;
  await labReadyPromise;
  if (!labReady) return;
  const model = MODEL_CATALOG.find(item => item.key === $('[data-relationship-model]').value);
  if (!model || texts.length < 2) return;
  setRunUi(true);
  let relationshipResult = null;
  const listener = controller.onEvent;
  controller.onEvent = event => {
    if (event.state === 'RESULT') relationshipResult = event.result;
    else listener(event);
  };
  try {
    await controller.run([model], () => ({
      text: texts[0], relationshipTexts: texts, backendPreference: $('[data-backend]').value,
      relationshipOptions: benchmarkCases ? { clustering: 'disabled' } : relationshipOptions(),
    }));
  } finally { controller.onEvent = listener; setRunUi(false); }
  if (relationshipResult?.relationships) {
    const benchmark = benchmarkCases ? embeddingBenchmarkMetrics(benchmarkCases, relationshipResult.relationships) : null;
    latestRelationship = { model: modelIdentity(model), backend: relationshipResult.backend, texts, diagnostics: relationshipResult.embeddings, report: relationshipResult.relationships, benchmark };
    $('[data-results-section]').hidden = false;
    $('[data-export]').disabled = false;
    renderRelationships(relationshipResult, texts, model, benchmark);
  } else if (relationshipResult) renderRelationshipFailure(relationshipResult, model);
}

async function runRelationships() {
  const texts = $('[data-relationship-input]').value.split(/\n+/u).map(value => value.trim()).filter(Boolean).slice(0, 24);
  const button = $('[data-run-relationships]'); button.textContent = 'Analyzing…';
  try { await runRelationshipWorkload(texts); } finally { button.textContent = 'Analyze relationships'; }
}

async function runEmbeddingBenchmark() {
  const button = $('[data-run-embedding-benchmark]'); button.textContent = 'Benchmarking…';
  try { await runRelationshipWorkload(EMBEDDING_BENCHMARK.map(item => item.text), EMBEDDING_BENCHMARK); }
  finally { button.textContent = 'Run broad benchmark'; }
}

function number(value, digits = 6) { return Number.isFinite(value) ? value.toFixed(digits) : 'N/A'; }

function renderRelationshipFailure(result, model) {
  const output = $('[data-relationship-output]'); output.hidden = false;
  output.innerHTML = `<h3>${escape(model.name)}</h3><p class="diagnostic">${escape(result.error || 'Relationship analysis failed')}</p>`;
}

function renderRelationships(result, texts, model, benchmark) {
  const report = result.relationships;
  const output = $('[data-relationship-output]'); output.hidden = false;
  const head = texts.map((_, index) => `<th>M${index + 1}</th>`).join('');
  const body = report.matrix.map((row, index) => `<tr><td>M${index + 1}</td>${row.map(value => `<td>${number(value)}</td>`).join('')}</tr>`).join('');
  const diagnosticRows = (result.embeddings || []).map((item, index) => `<tr><td>M${index + 1}</td><td>${escape(modelIdentity(model))}</td><td>${escape(result.backend)}</td><td>${escape(item.tokenCount ?? 'N/A')}</td><td>${escape(item.dimensions)}</td><td>${number(item.norm)}</td><td>${number(item.minimum)}</td><td>${number(item.maximum)}</td><td>${number(item.mean)}</td><td>${number(item.standardDeviation)}</td><td>${escape(item.fingerprint || 'N/A')}</td><td>${item.finite ? 'No' : 'Yes'}</td></tr>`).join('');
  const pairRows = report.pairs.map(pair => `<tr><td>M${pair.from + 1}–M${pair.to + 1}</td><td>${number(pair.cosine)}</td><td>${number(pair.euclideanDistance)}</td><td>${pair.exactlyEqual ? 'Yes' : 'No'}</td><td>${number(pair.maximumAbsoluteDifference)}</td><td>${number(pair.meanAbsoluteDifference)}</td></tr>`).join('');
  const clusterText = report.clustering.strategy === 'disabled'
    ? '<li>Disabled: pairwise measurements only.</li>'
    : report.clusters.length ? report.clusters.map(cluster => `<li>${cluster.map(index => `M${index + 1}`).join(', ')}</li>`).join('') : '<li>No exploratory complete-link cluster met the displayed threshold.</li>';
  const uncertainText = report.clustering.threshold === null
    ? 'Unavailable without a model-specific threshold.'
    : report.uncertain.length ? report.uncertain.map(pair => `M${pair.from + 1}–M${pair.to + 1} (${number(pair.cosine)})`).join(', ') : 'No pair is within ±0.05 of the exploratory threshold.';
  const benchmarkHtml = benchmark ? `<div class="diagnostic-table"><h4>Broad benchmark</h4><div class="benchmark-summary"><div><span>Related mean</span><strong>${number(benchmark.relatedMean)}</strong></div><div><span>Unrelated mean</span><strong>${number(benchmark.unrelatedMean)}</strong></div><div><span>Separation</span><strong>${number(benchmark.separation)}</strong></div><div><span>Ranking accuracy</span><strong>${number(benchmark.pairwiseRankingAccuracy)}</strong></div><div><span>Exploratory FP rate</span><strong>${number(benchmark.exploratoryThreshold?.falsePositiveRate)}</strong></div><div><span>Exploratory FN rate</span><strong>${number(benchmark.exploratoryThreshold?.falseNegativeRate)}</strong></div></div><p>${escape(benchmark.qualification)}</p></div>` : '';
  const diagnosticsHtml = $('[data-developer-diagnostics]').checked ? `<div class="diagnostic-table"><h4>Embedding diagnostics</h4><div class="table-scroll"><table><thead><tr><th>Input</th><th>Model / revision / dtype</th><th>Backend</th><th>Tokens</th><th>Dimensions</th><th>Norm</th><th>Min</th><th>Max</th><th>Mean</th><th>Std dev</th><th>Fingerprint</th><th>Non-finite</th></tr></thead><tbody>${diagnosticRows}</tbody></table></div><h4>Pair diagnostics</h4><div class="table-scroll"><table><thead><tr><th>Pair</th><th>Cosine</th><th>Euclidean</th><th>Exactly equal</th><th>Max abs diff</th><th>Mean abs diff</th></tr></thead><tbody>${pairRows}</tbody></table></div></div>` : '';
  output.innerHTML = `<h3>${escape(model.name)} · ${escape(result.backend)} · cosine similarity</h3><div class="table-scroll"><table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>${benchmarkHtml}${diagnosticsHtml}<div class="cluster-list"><p>${escape(report.caution)}</p><p>${escape(report.clustering.explanation)}</p><strong>Clusters</strong><ol>${clusterText}</ol><strong>Uncertain relationships</strong><p>${escape(uncertainText)}</p><strong>Memory key</strong><ol>${texts.map(text => `<li>${escape(text)}</li>`).join('')}</ol></div>`;
}

async function probeCapabilities() {
  $('[data-wasm]').textContent = typeof WebAssembly === 'object' ? 'Available' : 'Unavailable';
  let adapter = null; try { adapter = await navigator.gpu?.requestAdapter(); } catch {}
  $('[data-webgpu]').textContent = adapter ? 'Adapter available' : navigator.gpu ? 'API present · no adapter' : 'Unavailable';
  try {
    const registration = await navigator.serviceWorker?.register('./lab-cache.js', { type: 'module', scope: './' });
    await navigator.serviceWorker?.ready;
    if (!registration?.active) throw new Error('inactive');
    if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/ai-lab/lab-cache.js')) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('controller timeout')), 5000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/ai-lab/lab-cache.js')) throw new Error('wrong cache controller');
    const status = await new Promise((resolve, reject) => {
      const channel = new MessageChannel(); const timer = setTimeout(() => reject(new Error('timeout')), 3000);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); resolve(data); };
      registration.active.postMessage({ kind: 'LAB_CACHE_STATUS' }, [channel.port2]);
    });
    $('[data-cache]').textContent = `${status.urls.length} isolated file${status.urls.length === 1 ? '' : 's'}`;
    for (const model of MODEL_CATALOG) {
      const parts = model.components || [model];
      const count = status.urls.filter(url => parts.some(part => url.startsWith(`https://huggingface.co/${part.repo}/resolve/${part.revision}/`))).length;
      const node = document.querySelector(`[data-cache-state="${model.key}"]`);
      if (node && count) node.textContent = `${count} cached file${count === 1 ? '' : 's'} · unverified`;
    }
    labReady = true; updateSelectedCount(); $('[data-run-relationships]').disabled = false; $('[data-run-embedding-benchmark]').disabled = false; return true;
  } catch { $('[data-cache]').textContent = 'Unavailable · testing disabled'; return false; }
}

$('[data-select-all]').addEventListener('click', () => { MODEL_CATALOG.forEach(model => selected.add(model.key)); renderCatalog(); });
$('[data-deselect-all]').addEventListener('click', () => { selected.clear(); renderCatalog(); });
$('[data-run]').addEventListener('click', runSelected);
$('[data-stop]').addEventListener('click', () => controller.stop());
$('[data-run-relationships]').addEventListener('click', runRelationships);
$('[data-run-embedding-benchmark]').addEventListener('click', runEmbeddingBenchmark);
$('[data-clustering]').addEventListener('change', event => { $('[data-cluster-threshold]').disabled = event.target.value === 'disabled'; });
$('[data-export]').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), input: input.value, results, latestRelationship }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mindling-ai-lab-results.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

renderCatalog(); renderExamples();
$('[data-relationship-model]').innerHTML = MODEL_CATALOG.filter(model => ['embedding', 'hybrid'].includes(model.kind)).map(model => `<option value="${model.key}">${escape(model.name)}</option>`).join('');
labReadyPromise = probeCapabilities();
