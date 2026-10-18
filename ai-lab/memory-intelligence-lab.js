import { INFORMATION_TYPES } from './evaluation.js';
import { MEMORY_ACTIONS } from './memory-intelligence-schema.js';
import { MEMORY_DOWNLOAD_BYTES, MEMORY_MODELS, memoryModelIdentity } from './memory-intelligence-config.js';
import { applyReviewedProposal, mergeCategories, rejectProposal, renameCategory, undoLatestReviewedRun } from './memory-intelligence-engine.js';
import { MemoryIntelligenceStore } from './memory-intelligence-store.js';
import { MemoryIntelligenceClient } from './memory-intelligence-client.js';
import { MEMORY_BENCHMARK } from './memory-intelligence-benchmark.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>'"]/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const formatBytes = bytes => `${(bytes / 1_000_000).toFixed(0)} MB`;
const store = new MemoryIntelligenceStore();
let state; let proposal = null; let ready = false; let busy = false;

const client = new MemoryIntelligenceClient({ onEvent: ({ event, detail }) => {
  if (event === 'MEMORY_DOWNLOADING') {
    const progress = detail.total && detail.loaded ? ` · ${Math.min(100, detail.loaded / detail.total * 100).toFixed(0)}%` : '';
    setStatus(`Downloading ${detail.model}${progress}`);
  } else if (event === 'MEMORY_INITIALIZING') setStatus(`Initializing ${detail.model}`);
  else if (event === 'MEMORY_EMBEDDING') setStatus('Retrieving semantic candidates');
  else if (event === 'MEMORY_ANALYZING') setStatus('Generating unqualified semantic proposal');
} });

function setStatus(message, failed = false) {
  const node = $('[data-memory-status]'); node.textContent = message; node.classList.toggle('diagnostic', failed);
}

function setBusy(value) {
  busy = value; $('[data-memory-enable]').disabled = value || ready; $('[data-memory-run]').disabled = value || !ready;
}

function options(items, selected = '') {
  return items.map(item => `<option value="${escape(item.value)}" ${item.value === selected ? 'selected' : ''}>${escape(item.label)}</option>`).join('');
}

function renderState() {
  const activeMemories = state.canonicalMemories.filter(memory => memory.status !== 'UNDONE');
  const activeObservations = state.observations.filter(observation => observation.status !== 'UNDONE');
  $('[data-memory-stats]').innerHTML = [
    ['Revision', state.revision], ['Categories', state.categories.length], ['Canonical memories', `${activeMemories.length} active · ${state.canonicalMemories.length} total`], ['Observations', `${activeObservations.length} active · ${state.observations.length} total`], ['Relationships', `${state.relationships.filter(item => item.status !== 'UNDONE').length} active · ${state.relationships.length} total`],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('[data-memory-categories]').innerHTML = state.categories.length ? [...state.categories].sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name)).map(category => {
    const count = activeMemories.filter(memory => memory.categoryId === category.id).length;
    return `<div class="memory-item"><strong>${escape(category.domain)} → ${escape(category.name)}</strong><small>${escape(category.id)} · ${count} canonical memor${count === 1 ? 'y' : 'ies'} · ${escape(category.source)}${category.aliases?.length ? ` · aliases: ${escape(category.aliases.join(', '))}` : ''}</small></div>`;
  }).join('') : '<p class="privacy-note">No reviewed categories yet.</p>';
  $('[data-memory-memories]').innerHTML = state.canonicalMemories.length ? state.canonicalMemories.map(memory => {
    const category = state.categories.find(item => item.id === memory.categoryId);
    const observations = state.observations.filter(item => memory.observationIds.includes(item.id));
    const relations = state.relationships.filter(item => item.status !== 'UNDONE' && (item.fromMemoryId === memory.id || item.toMemoryId === memory.id));
    return `<div class="memory-item"><strong>${escape(memory.canonicalText)}</strong><small>${escape(memory.id)} · ${escape(memory.status || 'ACTIVE')} · ${escape(category ? `${category.domain} → ${category.name}` : 'Missing category')} · ${escape(memory.informationType)} · ${observations.filter(item => item.status !== 'UNDONE').length} active observation(s) · ${relations.length} active relation(s)</small></div>`;
  }).join('') : '<p class="privacy-note">No accepted memories yet.</p>';
  const categoryItems = state.categories.map(category => ({ value: category.id, label: `${category.domain} → ${category.name}` }));
  $('[data-category-source]').innerHTML = options([{ value: '', label: 'Select category' }, ...categoryItems]);
  $('[data-category-target]').innerHTML = options([{ value: '', label: 'Select target' }, ...categoryItems]);
  if (proposal) prepareReview();
}

function renderProposal() {
  const panel = $('[data-memory-proposal]'); panel.hidden = false;
  const topMemory = proposal.candidates.memories?.[0]; const validation = proposal.diagnostics.validation;
  const stages = [
    ['A · Input', proposal.language || 'und', 'Original text preserved exactly'],
    ['B · Topic', proposal.topic?.name || 'Unavailable', `${proposal.domain?.name || 'Unavailable'} · model proposal · unqualified`],
    ['C · Type', proposal.informationType.primary, `model estimate ${proposal.informationType.modelEstimate ?? 'N/A'} · unqualified`],
    ['D · Retrieval', topMemory ? topMemory.id : 'No candidate', topMemory ? `cosine ${topMemory.similarity.toFixed(6)} · retrieval only` : 'MiniLM q8 WASM'],
    ['E · Decision', 'NEEDS_REVIEW', `model proposed ${proposal.memoryDecision.modelProposedAction || 'no valid action'}`],
  ];
  $('[data-memory-stages]').innerHTML = stages.map(([stage, value, detail]) => `<article><span>${escape(stage)}</span><strong>${escape(value)}</strong><small>${escape(detail)}</small></article>`).join('');
  $('[data-memory-raw]').textContent = JSON.stringify({
    originalText: proposal.originalText, domain: proposal.domain, topic: proposal.topic, informationType: proposal.informationType,
    categoryDecision: proposal.categoryDecision, memoryDecision: proposal.memoryDecision, candidates: proposal.candidates,
    evidence: proposal.evidence, validation, timings: proposal.diagnostics.timings, rawModelOutput: proposal.diagnostics.rawModelOutput,
  }, null, 2);
  prepareReview();
}

function prepareReview() {
  if (!proposal) return;
  const modelAction = MEMORY_ACTIONS.includes(proposal.memoryDecision.modelProposedAction) && proposal.memoryDecision.modelProposedAction !== 'NEEDS_REVIEW' ? proposal.memoryDecision.modelProposedAction : '';
  $('[data-review-action]').innerHTML = options([{ value: '', label: 'Choose reviewed action' }, ...MEMORY_ACTIONS.filter(action => action !== 'NEEDS_REVIEW').map(action => ({ value: action, label: action }))], modelAction);
  const targetItems = state.canonicalMemories.filter(memory => memory.status !== 'UNDONE').map(memory => ({ value: memory.id, label: `${memory.canonicalText.slice(0, 75)} · ${memory.id}` }));
  const proposedTarget = state.canonicalMemories.some(memory => memory.id === proposal.memoryDecision.modelProposedTargetMemoryId && memory.status !== 'UNDONE') ? proposal.memoryDecision.modelProposedTargetMemoryId : '';
  $('[data-review-target]').innerHTML = options([{ value: '', label: 'No target' }, ...targetItems], proposedTarget);
  $('[data-review-domain]').value = proposal.domain?.name || '';
  $('[data-review-topic]').value = proposal.topic?.name || '';
  const categoryItems = state.categories.map(category => ({ value: category.id, label: `${category.domain} → ${category.name}` }));
  const proposedCategory = state.categories.some(category => category.id === proposal.categoryDecision.existingCategoryId) ? proposal.categoryDecision.existingCategoryId : '';
  $('[data-review-category]').innerHTML = options([{ value: '', label: 'Create reviewed category' }, ...categoryItems], proposedCategory);
  $('[data-review-category-name]').value = proposal.topic?.name || '';
  $('[data-review-type]').innerHTML = options(INFORMATION_TYPES.map(type => ({ value: type, label: type })), proposal.informationType.primary);
  $('[data-review-secondary]').value = proposal.informationType.secondary.join(', ');
  updateReviewControls();
}

function updateReviewControls() {
  const action = $('[data-review-action]').value;
  $('[data-review-target]').disabled = !['LINK_EXISTING', 'RELATED_BUT_DISTINCT', 'CONTRADICTS_OR_UPDATES'].includes(action);
  const existing = Boolean($('[data-review-category]').value); $('[data-review-category-name]').disabled = existing;
}

async function enableModels() {
  setBusy(true); setStatus('Preparing explicit local model download');
  try { await client.initialize(); ready = true; $('[data-memory-model-state]').textContent = 'Ready · WASM · analysis unqualified'; $('[data-memory-enable]').textContent = 'Pipeline ready'; setStatus('Ready for local analysis'); }
  catch (error) { setStatus(`${error.code || error.message}: ${error.diagnostic?.message || 'initialization failed'}`, true); }
  finally { setBusy(false); }
}

async function runPipeline() {
  const originalText = $('[data-memory-input]').value; if (!originalText.trim() || busy) return;
  setBusy(true); proposal = null; $('[data-memory-proposal]').hidden = true;
  try {
    const result = await client.analyze({ runId: `run-${crypto.randomUUID()}`, originalText, state }); proposal = result.proposal; renderProposal();
    setStatus(proposal.diagnostics.validation.valid ? 'Proposal ready · human review required' : `Model output rejected: ${proposal.diagnostics.validation.errors.join(', ')}`);
  } catch (error) { setStatus(`${error.code || error.message}: ${error.diagnostic?.message || 'analysis failed'}`, true); }
  finally { setBusy(false); }
}

async function acceptReview(event) {
  event.preventDefault(); if (!proposal) return;
  const review = {
    action: $('[data-review-action]').value, targetMemoryId: $('[data-review-target]').disabled ? null : $('[data-review-target]').value || null,
    domain: $('[data-review-domain]').value, topic: $('[data-review-topic]').value,
    categoryId: $('[data-review-category]').value || null, categoryName: $('[data-review-category-name]').value,
    primaryType: $('[data-review-type]').value,
    secondaryTypes: $('[data-review-secondary]').value.split(',').map(value => value.trim().toUpperCase()).filter(Boolean),
  };
  try { state = await store.update(current => applyReviewedProposal(current, proposal, review)); proposal = null; $('[data-memory-proposal]').hidden = true; renderState(); setStatus('Reviewed decision saved atomically to isolated lab state'); }
  catch (error) { setStatus(error.message, true); }
}

async function rejectCurrent() {
  if (!proposal) return; state = await store.update(current => rejectProposal(current, proposal)); proposal = null; $('[data-memory-proposal]').hidden = true; renderState(); setStatus('Proposal rejected; no category or memory was created');
}

function exportState() {
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(), models: MEMORY_MODELS,
    evaluation: {
      version: MEMORY_BENCHMARK.version, policy: MEMORY_BENCHMARK.policy,
      acceptanceThresholds: MEMORY_BENCHMARK.acceptanceThresholds,
      counts: MEMORY_BENCHMARK.counts,
      cases: { topic: MEMORY_BENCHMARK.topic, informationType: MEMORY_BENCHMARK.informationType, relationship: MEMORY_BENCHMARK.relationship },
    },
    state,
  }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mindling-memory-intelligence-lab.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function resetState() {
  if (!confirm('Reset only the isolated Memory Intelligence Lab state?')) return;
  state = await store.reset(); await store.open(); proposal = null; $('[data-memory-proposal]').hidden = true; renderState(); setStatus('Isolated lab state reset; model cache and player data unchanged');
}

async function renameSelectedCategory() {
  try { state = await store.update(current => renameCategory(current, $('[data-category-source]').value, $('[data-category-name]').value)); renderState(); setStatus('Category renamed; memory links preserved'); }
  catch (error) { setStatus(error.message, true); }
}

async function mergeSelectedCategories() {
  try { state = await store.update(current => mergeCategories(current, $('[data-category-source]').value, $('[data-category-target]').value)); renderState(); setStatus('Categories reconciled; canonical memories preserved'); }
  catch (error) { setStatus(error.message, true); }
}

async function undoLatestReview() {
  if (!confirm('Undo the most recent accepted lab decision? Later dependent memories must be undone first.')) return;
  try { state = await store.update(current => undoLatestReviewedRun(current)); proposal = null; $('[data-memory-proposal]').hidden = true; renderState(); setStatus('Most recent reviewed decision undone; earlier observations remain intact'); }
  catch (error) { setStatus(error.message, true); }
}

async function initializeLab() {
  $('[data-memory-embedding-model]').textContent = memoryModelIdentity(MEMORY_MODELS.embedding);
  $('[data-memory-analysis-model]').textContent = memoryModelIdentity(MEMORY_MODELS.analysis);
  $('[data-memory-download]').textContent = formatBytes(MEMORY_DOWNLOAD_BYTES);
  $('[data-memory-enable]').addEventListener('click', enableModels); $('[data-memory-run]').addEventListener('click', runPipeline);
  $('[data-memory-review]').addEventListener('submit', acceptReview); $('[data-memory-reject]').addEventListener('click', rejectCurrent);
  $('[data-review-action]').addEventListener('change', updateReviewControls); $('[data-review-category]').addEventListener('change', updateReviewControls);
  $('[data-memory-export]').addEventListener('click', exportState); $('[data-memory-reset]').addEventListener('click', resetState);
  $('[data-memory-undo]').addEventListener('click', undoLatestReview);
  $('[data-category-rename]').addEventListener('click', renameSelectedCategory); $('[data-category-merge]').addEventListener('click', mergeSelectedCategories);
  state = await store.read(); renderState();
}

initializeLab().catch(error => setStatus(error.message, true));
