import { MEMORY_MODELS, MEMORY_LAB_VERSION, QUALIFICATION, memoryModelIdentity } from './memory-intelligence-config.js';
import { buildAnalysisPrompt, extractModelJson, neutralUnqualifiedAnalysis, validateModelAnalysis } from './memory-intelligence-schema.js';
import { buildMemoryProposal } from './memory-intelligence-engine.js';
import { cosineSimilarity } from './evaluation.js';

let encoder = null; let generator = null; let queue = Promise.resolve();

class PipelineError extends Error {
  constructor(code, cause = null, detail = null) { super(code); this.code = code; this.cause = cause; this.detail = detail; }
}
const emit = (event, detail = {}) => postMessage({ event, detail });
const safeError = error => ({ name: String(error?.cause?.name || error?.name || 'Error').slice(0, 80), message: String(error?.cause?.message || error?.message || '').slice(0, 500), detail: error?.detail || null });

async function initialize() {
  if (encoder && generator) return modelStatus();
  let runtime;
  try { runtime = await import(MEMORY_MODELS.runtime.url); } catch (error) { throw new PipelineError('MEMORY_RUNTIME_IMPORT', error); }
  runtime.env.allowLocalModels = false; runtime.env.useBrowserCache = false;
  runtime.env.backends.onnx.wasm.numThreads = 1;
  const progress = model => event => emit(['download', 'progress', 'initiate'].includes(event?.status) ? 'MEMORY_DOWNLOADING' : 'MEMORY_INITIALIZING', { model, file: event?.file || null, loaded: event?.loaded || null, total: event?.total || null, status: event?.status || null });
  try {
    encoder = await runtime.pipeline('feature-extraction', MEMORY_MODELS.embedding.repo, {
      revision: MEMORY_MODELS.embedding.revision, dtype: MEMORY_MODELS.embedding.dtype, device: 'wasm', progress_callback: progress(MEMORY_MODELS.embedding.key),
    });
  } catch (error) { throw new PipelineError('MEMORY_EMBEDDING_INIT', error); }
  try {
    generator = await runtime.pipeline('text-generation', MEMORY_MODELS.analysis.repo, {
      revision: MEMORY_MODELS.analysis.revision, dtype: MEMORY_MODELS.analysis.dtype, device: 'wasm', progress_callback: progress(MEMORY_MODELS.analysis.key),
    });
  } catch (error) { await encoder?.dispose?.(); encoder = null; throw new PipelineError('MEMORY_ANALYSIS_INIT', error); }
  return modelStatus();
}

const modelStatus = () => ({
  ready: Boolean(encoder && generator), pipelineVersion: MEMORY_LAB_VERSION,
  embedding: { identity: memoryModelIdentity(MEMORY_MODELS.embedding), qualified: QUALIFICATION.embeddingRetrieval.qualified },
  analysis: { identity: memoryModelIdentity(MEMORY_MODELS.analysis), qualified: false, reason: MEMORY_MODELS.analysis.qualificationReason },
});

async function embed(text) {
  try { return Array.from((await encoder(text, { pooling: 'mean', normalize: true })).data); }
  catch (error) { throw new PipelineError('MEMORY_EMBEDDING_INFERENCE', error); }
}

function candidateContext(state, vector) {
  const memories = (state?.canonicalMemories || []).filter(memory => memory.status !== 'UNDONE').map(memory => ({
    id: memory.id, canonicalText: memory.canonicalText, categoryId: memory.categoryId, informationType: memory.informationType,
    similarity: cosineSimilarity(vector, memory.embedding),
  })).filter(item => Number.isFinite(item.similarity)).sort((left, right) => right.similarity - left.similarity).slice(0, 6);
  const categories = (state?.categories || []).map(category => {
    const values = memories.filter(memory => memory.categoryId === category.id).map(memory => memory.similarity);
    return { id: category.id, domain: category.domain, name: category.name, similarity: values.length ? Math.max(...values) : null };
  }).filter(item => Number.isFinite(item.similarity)).sort((left, right) => right.similarity - left.similarity).slice(0, 4);
  return { memories, categories };
}

async function generateAnalysis(originalText, context) {
  const messages = buildAnalysisPrompt(originalText, context);
  const prompt = generator.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
  let output;
  try { output = await generator(prompt, { max_new_tokens: MEMORY_MODELS.analysis.maxNewTokens, do_sample: false, return_full_text: false, add_special_tokens: false }); }
  catch (error) { throw new PipelineError('MEMORY_ANALYSIS_INFERENCE', error); }
  let raw = output?.[0]?.generated_text;
  if (Array.isArray(raw)) raw = raw.at(-1)?.content;
  const extracted = extractModelJson(raw);
  if (!extracted.value) return { raw: typeof raw === 'string' ? raw : null, parseMethod: extracted.method, validation: { valid: false, errors: [extracted.error] }, analysis: neutralUnqualifiedAnalysis(originalText, [extracted.error]) };
  const validation = validateModelAnalysis(extracted.value, originalText, context);
  return { raw, parseMethod: extracted.method, validation, analysis: validation.value || neutralUnqualifiedAnalysis(originalText, validation.errors) };
}

async function analyze(payload) {
  if (!encoder || !generator) throw new PipelineError('MEMORY_PIPELINE_NOT_READY');
  const originalText = payload?.originalText;
  if (typeof originalText !== 'string' || !originalText.trim() || originalText.length > 2000) throw new PipelineError('MEMORY_INPUT_INVALID');
  emit('MEMORY_EMBEDDING', { stage: 'candidate-retrieval' }); const started = performance.now();
  const embeddingStarted = performance.now(); const vector = await embed(originalText); const embeddingMs = performance.now() - embeddingStarted;
  const candidates = candidateContext(payload.state, vector);
  emit('MEMORY_ANALYZING', { stage: 'topic-type-relationship' }); const analysisStarted = performance.now();
  const generated = await generateAnalysis(originalText, candidates); const analysisMs = performance.now() - analysisStarted;
  const proposal = buildMemoryProposal({
    runId: payload.runId, originalText, embedding: vector, analysis: generated.analysis, candidates,
    diagnostics: {
      validation: generated.validation, parseMethod: generated.parseMethod, rawModelOutput: generated.raw,
      timings: { embeddingMs, analysisMs, totalMs: performance.now() - started },
      qualification: QUALIFICATION,
    },
  });
  return { proposal, modelStatus: modelStatus() };
}

async function dispose() {
  await encoder?.dispose?.(); await generator?.dispose?.(); encoder = null; generator = null; return { disposed: true };
}

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = data.action === 'init' ? await initialize() : data.action === 'analyze' ? await analyze(data.payload) : data.action === 'dispose' ? await dispose() : (() => { throw new PipelineError('MEMORY_ACTION_INVALID'); })();
      postMessage({ id: data.id, result });
    } catch (error) { postMessage({ id: data.id, error: error.code || 'MEMORY_PIPELINE_FAILED', diagnostic: safeError(error) }); }
  });
};
