import { TRANSFORMERS_RUNTIME } from './model-catalog.js';
import {
  TYPE_LABELS, makeAnalysisPrompt, extractJson, validateStructuredAnalysis,
  embeddingDiagnostics, relationshipReport, deterministicHybridResult,
} from './evaluation.js';

let pipelines = [];
let queue = Promise.resolve();

class LabError extends Error {
  constructor(code, cause = null, diagnostic = null) { super(code); this.code = code; this.cause = cause; this.diagnostic = diagnostic; }
}

const safeDiagnostic = error => ({
  name: String(error?.cause?.name || error?.name || 'Error').slice(0, 80),
  message: String(error?.cause?.message || error?.message || '').slice(0, 500),
});

const emit = (event, detail = {}) => postMessage({ event, detail });

async function loadRuntime() {
  try {
    const runtime = await import(TRANSFORMERS_RUNTIME.url);
    runtime.env.allowLocalModels = false;
    runtime.env.useBrowserCache = false;
    if (runtime.env.backends?.onnx?.wasm) runtime.env.backends.onnx.wasm.numThreads = 1;
    return runtime;
  } catch (error) { throw new LabError('RUNTIME_IMPORT', error); }
}

async function availableBackend(preference, model) {
  if (preference === 'wasm') return 'wasm';
  if (!model.runtime.webgpu) {
    if (preference === 'webgpu') throw new LabError('WEBGPU_UNSUPPORTED_FOR_MODEL', null, { model: model.key, qualifiedBackend: 'wasm' });
    return 'wasm';
  }
  let adapter = null;
  try { adapter = await navigator.gpu?.requestAdapter(); } catch {}
  if (adapter) return 'webgpu';
  if (preference === 'webgpu') throw new LabError('WEBGPU_UNAVAILABLE');
  return 'wasm';
}

function progressCallback(modelKey) {
  const files = new Map();
  return event => {
    if (event?.file && Number.isFinite(event.loaded)) files.set(event.file, { loaded: event.loaded, total: event.total || null });
    const loaded = [...files.values()].reduce((sum, item) => sum + item.loaded, 0);
    const total = [...files.values()].reduce((sum, item) => sum + (item.total || 0), 0) || null;
    const downloading = ['initiate', 'download', 'progress'].includes(event?.status);
    emit(downloading ? 'DOWNLOADING' : 'INITIALIZING', { modelKey, file: event?.file || null, loaded, total, status: event?.status || null });
  };
}

async function createPipeline(runtime, task, model, backend) {
  try {
    const loaded = await runtime.pipeline(task, model.repo, {
      revision: model.revision, dtype: model.dtype, device: backend,
      progress_callback: progressCallback(model.key),
    });
    pipelines.push(loaded);
    return loaded;
  } catch (error) { throw new LabError('MODEL_INITIALIZATION', error, { task, backend }); }
}

function generatedText(output) {
  let value = output?.[0]?.generated_text;
  if (Array.isArray(value)) value = value.at(-1)?.content;
  return typeof value === 'string' ? value : null;
}

async function runGeneration(pipe, model, text) {
  const messages = makeAnalysisPrompt(text);
  emit('RUNNING');
  let output;
  try {
    if (model.kind === 'text2text') {
      const prompt = `${messages[0].content}\n\nUser text:\n${text}`;
      output = await pipe(prompt, { max_new_tokens: model.maxNewTokens, do_sample: false });
    } else {
      output = await pipe(messages, { max_new_tokens: model.maxNewTokens, do_sample: false, return_full_text: false });
    }
  } catch (error) { throw new LabError('TEXT_GENERATION', error); }
  const raw = generatedText(output);
  emit('VALIDATING');
  const parsed = extractJson(raw);
  const validation = parsed.value ? validateStructuredAnalysis(parsed.value, text) : { valid: false, errors: [parsed.error] };
  return {
    raw, nativeOutput: output, parsed: parsed.value, parseMethod: parsed.method,
    validation, observed: parsed.value ? {
      domain: parsed.value.domain ?? null, topic: parsed.value.topic ?? null, type: parsed.value.type ?? null,
      confidence: parsed.value.confidence ?? null, evidence: parsed.value.evidence ?? null,
    } : null,
  };
}

async function vectorsFor(pipe, texts, prefix = '') {
  const vectors = []; const metadata = [];
  for (const text of texts) {
    const prepared = `${prefix}${text}`;
    let tokens;
    try { tokens = await pipe.tokenizer(prepared, { padding: true, truncation: true }); }
    catch (error) { throw new LabError('EMBEDDING_TOKENIZATION', error); }
    let tensor;
    try { tensor = await pipe(prepared, { pooling: 'mean', normalize: true }); }
    catch (error) { throw new LabError('EMBEDDING_INFERENCE', error); }
    vectors.push(Array.from(tensor.data));
    const mask = tokens.attention_mask?.data;
    const tokenCount = mask ? Array.from(mask, Number).reduce((sum, value) => sum + value, 0) : tokens.input_ids?.dims?.at(-1) ?? null;
    metadata.push({
      tokenCount,
      tokenShape: tokens.input_ids?.dims ? Array.from(tokens.input_ids.dims) : null,
      outputShape: tensor.dims ? Array.from(tensor.dims) : null,
      prefix: prefix || null,
    });
  }
  return { vectors, metadata };
}

async function runEmbedding(pipe, model, text, references, relationshipTexts, relationshipOptions) {
  emit('RUNNING');
  const texts = relationshipTexts?.length > 1 ? relationshipTexts : [text, ...references];
  const { vectors, metadata } = await vectorsFor(pipe, texts, model.key === 'multilingual-e5-small' ? 'query: ' : '');
  emit('VALIDATING');
  const diagnostics = vectors.map((vector, index) => embeddingDiagnostics(vector, metadata[index]));
  return {
    raw: null, observed: null, parsed: null,
    embedding: diagnostics[0], embeddings: diagnostics,
    relationships: relationshipReport(texts, vectors, relationshipOptions), texts,
    validation: { valid: diagnostics.every(item => item.valid), errors: diagnostics.every(item => item.valid) ? [] : ['EMBEDDING_INVALID'] },
  };
}

async function runZeroShot(pipe, text) {
  emit('RUNNING');
  const labels = Object.values(TYPE_LABELS);
  let output;
  try { output = await pipe(text, labels, { multi_label: false, hypothesis_template: 'This text is {}.' }); }
  catch (error) { throw new LabError('CLASSIFICATION_INFERENCE', error); }
  emit('VALIDATING');
  const valid = Array.isArray(output?.labels) && Array.isArray(output?.scores) && output.labels.length === labels.length;
  return {
    raw: null, nativeOutput: output, parsed: null,
    observed: valid ? { typeLabel: output.labels[0], score: output.scores[0] } : null,
    validation: { valid, errors: valid ? [] : ['CLASSIFICATION_OUTPUT_INVALID'] },
  };
}

async function runClassification(pipe, text) {
  emit('RUNNING');
  let output;
  try { output = await pipe(text, { top_k: 5 }); }
  catch (error) { throw new LabError('CLASSIFICATION_INFERENCE', error); }
  emit('VALIDATING');
  const valid = Array.isArray(output) && output.length > 0 && output.every(row => typeof row.label === 'string' && Number.isFinite(row.score));
  return {
    raw: null, nativeOutput: output, parsed: null,
    observed: valid ? { sentiment: output[0].label, score: output[0].score } : null,
    validation: { valid, errors: valid ? [] : ['CLASSIFICATION_OUTPUT_INVALID'] },
  };
}

async function runHybrid(runtime, model, backend, text, references, relationshipTexts, relationshipOptions) {
  const [embeddingModel, nliModel] = model.components;
  const encoder = await createPipeline(runtime, embeddingModel.task, { ...embeddingModel, key: model.key, runtime: model.runtime }, backend);
  const classifier = await createPipeline(runtime, nliModel.task, { ...nliModel, key: model.key, runtime: model.runtime }, backend);
  emit('RUNNING');
  const texts = relationshipTexts?.length > 1 ? relationshipTexts : [text, ...references];
  const { vectors, metadata } = await vectorsFor(encoder, texts);
  let zeroShot;
  try { zeroShot = await classifier(text, Object.values(TYPE_LABELS), { multi_label: false, hypothesis_template: 'This text is {}.' }); }
  catch (error) { throw new LabError('CLASSIFICATION_INFERENCE', error); }
  emit('VALIDATING');
  const structured = deterministicHybridResult(text, zeroShot, vectors[0]);
  return {
    raw: null, nativeOutput: { zeroShot }, parsed: structured.value, observed: structured.value,
    embedding: embeddingDiagnostics(vectors[0], metadata[0]),
    embeddings: vectors.map((vector, index) => embeddingDiagnostics(vector, metadata[index])),
    relationships: relationshipReport(texts, vectors, relationshipOptions), texts,
    validation: { valid: structured.valid, errors: structured.errors }, postprocessing: structured.postprocessing,
  };
}

async function run(payload) {
  const { model, text, backendPreference = 'auto', references = [], relationshipTexts = [], relationshipOptions = {} } = payload;
  if (!model || typeof text !== 'string' || !text.trim() || text.length > 4000) throw new LabError('INPUT_INVALID');
  const requestedBackend = await availableBackend(backendPreference, model);
  const runtime = await loadRuntime();
  const started = performance.now();
  let backend = requestedBackend;
  let result;
  const execute = async device => {
    pipelines = [];
    const initializationStarted = performance.now();
    let value;
    if (model.kind === 'hybrid') value = await runHybrid(runtime, model, device, text, references, relationshipTexts, relationshipOptions);
    else {
      const task = model.kind === 'generation' ? 'text-generation'
        : model.kind === 'text2text' ? 'text2text-generation'
          : model.kind === 'embedding' ? 'feature-extraction'
            : model.kind === 'zero-shot' ? 'zero-shot-classification' : 'text-classification';
      const pipe = await createPipeline(runtime, task, model, device);
      const initializationMs = performance.now() - initializationStarted;
      const inferenceStarted = performance.now();
      if (model.kind === 'generation' || model.kind === 'text2text') value = await runGeneration(pipe, model, text);
      else if (model.kind === 'embedding') value = await runEmbedding(pipe, model, text, references, relationshipTexts, relationshipOptions);
      else if (model.kind === 'zero-shot') value = await runZeroShot(pipe, text);
      else value = await runClassification(pipe, text);
      value.timings = { initializationMs, inferenceMs: performance.now() - inferenceStarted };
    }
    return value;
  };
  try { result = await execute(backend); }
  catch (error) {
    if (backend === 'webgpu' && backendPreference === 'auto' && error.code === 'MODEL_INITIALIZATION') {
      await dispose(); backend = 'wasm'; result = await execute(backend); result.backendFallback = safeDiagnostic(error);
    } else throw error;
  }
  result.timings ||= { initializationMs: null, inferenceMs: null };
  result.timings.totalMs = performance.now() - started;
  const memory = Number.isFinite(performance?.memory?.usedJSHeapSize)
    ? { usedJSHeapBytes: performance.memory.usedJSHeapSize, source: 'performance.memory' } : null;
  return { ok: true, model: model.key, identity: model.repo ? `${model.repo}@${model.revision}:${model.dtype}` : 'hybrid-pipeline', backend, memory, ...result };
}

async function dispose() {
  let requested = 0; let completed = 0;
  for (const pipe of pipelines.splice(0)) {
    requested += 1;
    try { await pipe.dispose?.(); completed += 1; } catch {}
  }
  return { requested, completed, workerMustTerminate: true };
}

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = data.action === 'run' ? await run(data.payload) : data.action === 'dispose' ? await dispose() : (() => { throw new LabError('ACTION_INVALID'); })();
      postMessage({ id: data.id, result });
    } catch (error) {
      const diagnostic = safeDiagnostic(error);
      const memoryFailure = /out of memory|memory access out of bounds|allocation failed|bad_alloc/iu.test(diagnostic.message);
      postMessage({ id: data.id, error: memoryFailure ? 'OUT_OF_MEMORY' : error.code || 'MODEL_FAILED', diagnostic: { ...diagnostic, detail: error.diagnostic || null } });
    }
  });
};
