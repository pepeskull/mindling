export const TRANSFORMERS_RUNTIME = Object.freeze({
  id: '@huggingface/transformers',
  version: '3.8.1',
  url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js',
});

const candidate = value => Object.freeze(value);

export const MODEL_CATALOG = Object.freeze([
  candidate({
    key: 'qwen-0.5b', name: 'Qwen2.5 0.5B Instruct', family: 'Qwen2.5', kind: 'generation',
    task: 'Structured semantic analysis', repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    revision: '22942cb7d7ba4cc81bb4673549ca4d4614469b5e', dtype: 'q8', bytes: 519_137_612,
    license: 'Apache-2.0', languages: 'English; broader multilingual ability is unqualified here',
    runtime: { webgpu: true, wasm: true }, maxNewTokens: 160,
    notes: 'Existing baseline. Swedish quality must be measured; structured JSON is not guaranteed.',
  }),
  candidate({
    key: 'smollm2-360m', name: 'SmolLM2 360M Instruct', family: 'SmolLM2', kind: 'generation',
    task: 'Structured semantic analysis', repo: 'onnx-community/SmolLM2-360M-Instruct-ONNX',
    revision: 'fe7c7db4c8921c9e3fa1c65cfd296fb3b1b1a8f9', dtype: 'q8', bytes: 366_643_000,
    license: 'Apache-2.0', languages: 'English', runtime: { webgpu: true, wasm: true }, maxNewTokens: 160,
    notes: 'Compact instruction model. Swedish and schema reliability are not claimed.',
  }),
  candidate({
    key: 'lamini-flan-t5', name: 'LaMini Flan-T5 248M', family: 'Flan-T5', kind: 'text2text',
    task: 'Instruction classification', repo: 'Xenova/LaMini-Flan-T5-248M',
    revision: '091769c59d551fed68a9b8baf4f70f7effa69a56', dtype: 'q8', bytes: 278_460_053,
    license: 'CC-BY-NC-4.0', languages: 'English', runtime: { webgpu: true, wasm: true }, maxNewTokens: 160,
    notes: 'Non-commercial license. Swedish quality is not claimed.', restriction: 'Non-commercial use only; review before any production use.',
  }),
  candidate({
    key: 'multilingual-minilm', name: 'Multilingual MiniLM L12', family: 'Sentence Transformers', kind: 'embedding',
    task: 'Similarity, retrieval and clustering', repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900', dtype: 'q8', bytes: 135_392_488,
    license: 'Apache-2.0', languages: '50 languages, including English and Swedish', dimensions: 384,
    runtime: { webgpu: false, wasm: true },
    notes: 'Produces vectors, not classifications or generated text. q8 WebGPU is disabled after reference comparison found collapsed embeddings; use WASM.',
  }),
  candidate({
    key: 'multilingual-e5-small', name: 'Multilingual E5 Small', family: 'E5', kind: 'embedding',
    task: 'Retrieval and semantic grouping', repo: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78', dtype: 'q8', bytes: 135_392_016,
    license: 'MIT', languages: '94 languages, including English and Swedish', dimensions: 384,
    runtime: { webgpu: false, wasm: true },
    notes: 'Uses query: prefixes for symmetric similarity. q8 WebGPU is disabled after reference comparison found collapsed embeddings; use WASM.',
  }),
  candidate({
    key: 'bge-m3', name: 'BGE-M3', family: 'BGE', kind: 'embedding',
    task: 'Multilingual semantic similarity', repo: 'Xenova/bge-m3',
    revision: '4de13258303883538bd53b696b452bf8099f0858', dtype: 'q8', bytes: 586_779_297,
    license: 'MIT', languages: 'Multilingual; Swedish is not separately qualified here', dimensions: 1024,
    runtime: { webgpu: false, wasm: true }, notes: 'Large browser download and memory footprint. WebGPU embedding quality has not been qualified; use WASM.',
    restriction: 'Resource intensive; may exceed practical browser memory on constrained devices.',
  }),
  candidate({
    key: 'multilingual-nli', name: 'Multilingual MiniLMv2 NLI', family: 'MiniLMv2 / XNLI', kind: 'zero-shot',
    task: 'Zero-shot information-type classification', repo: 'onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX',
    revision: 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e', dtype: 'q8', bytes: 124_500_283,
    license: 'MIT', languages: '15 listed languages; Swedish is not listed', runtime: { webgpu: true, wasm: true },
    notes: 'Scores supplied candidate labels. Scores are not calibrated probabilities.',
  }),
  candidate({
    key: 'multilingual-sentiment', name: 'Multilingual DistilBERT Sentiment', family: 'DistilBERT', kind: 'classification',
    task: 'Direct sentiment classification', repo: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    revision: '9d9ac661fd7b0b48535a1fc99b20ae6947629e65', dtype: 'q8', bytes: 138_875_652,
    license: 'Apache-2.0', languages: '12 listed languages; Swedish is not listed', runtime: { webgpu: true, wasm: true },
    notes: 'A direct classifier used as an opinion/sentiment signal; it does not predict topic or domain.',
  }),
  candidate({
    key: 'tinyllama-1.1b', name: 'TinyLlama 1.1B Chat', family: 'TinyLlama', kind: 'generation',
    task: 'Structured semantic analysis', repo: 'onnx-community/TinyLlama-1.1B-Chat-v1.0-ONNX',
    revision: 'cb463df0db21d713728366575b5a71f80de7adb2', dtype: 'q4', bytes: 911_595_398,
    license: 'Apache-2.0', languages: 'English', runtime: { webgpu: true, wasm: true }, maxNewTokens: 160,
    notes: 'Largest generation candidate in this lab; Swedish quality is not claimed.',
    restriction: 'Resource intensive; initialization can fail on memory-limited browsers.',
  }),
  candidate({
    key: 'hybrid-minilm-nli', name: 'MiniLM + NLI Hybrid', family: 'Deterministic hybrid pipeline', kind: 'hybrid',
    task: 'Similarity + zero-shot type + deterministic schema', bytes: 259_892_771,
    license: 'Apache-2.0 + MIT', languages: 'MiniLM supports Swedish; NLI does not list Swedish',
    runtime: { webgpu: false, wasm: true },
    components: Object.freeze([
      { repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900', dtype: 'q8', task: 'feature-extraction' },
      { repo: 'onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX', revision: 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e', dtype: 'q8', task: 'zero-shot-classification' },
    ]),
    notes: 'Pipeline, not one pretrained model. Its q8 embedding component uses WASM because WebGPU produced invalid semantic geometry.',
  }),
]);

export const modelIdentity = model => model.repo
  ? `${model.repo}@${model.revision}:${model.dtype}`
  : model.components.map(part => `${part.repo}@${part.revision}:${part.dtype}`).join(' + ');

export const formatBytes = bytes => {
  if (!Number.isFinite(bytes)) return 'Unavailable';
  return `${(bytes / 1_000_000).toFixed(bytes > 100_000_000 ? 0 : 1)} MB`;
};

export const assertCatalog = (catalog = MODEL_CATALOG) => {
  if (catalog.length !== 10) throw new Error('CATALOG_COUNT');
  const keys = new Set();
  for (const model of catalog) {
    if (keys.has(model.key)) throw new Error('CATALOG_KEY_DUPLICATE');
    keys.add(model.key);
    const parts = model.components || [model];
    for (const part of parts) {
      if (!/^[a-f0-9]{40}$/u.test(part.revision || '')) throw new Error(`CATALOG_REVISION:${model.key}`);
      if (!part.repo || !part.dtype) throw new Error(`CATALOG_MODEL:${model.key}`);
    }
    if (!model.license || !model.runtime?.wasm) throw new Error(`CATALOG_METADATA:${model.key}`);
  }
  return true;
};

assertCatalog();
