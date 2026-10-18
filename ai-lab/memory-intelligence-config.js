import { TRANSFORMERS_RUNTIME } from './model-catalog.js';

export const MEMORY_LAB_VERSION = 'memory-intelligence-lab-v1';

export const MEMORY_MODELS = Object.freeze({
  embedding: Object.freeze({
    key: 'multilingual-minilm-l12',
    repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900',
    dtype: 'q8', backend: 'wasm', dimensions: 384, bytes: 135_392_488,
    license: 'Apache-2.0', qualifiedFor: Object.freeze(['candidate-retrieval']),
  }),
  analysis: Object.freeze({
    key: 'qwen3-0.6b',
    repo: 'onnx-community/Qwen3-0.6B-ONNX',
    revision: '58ca03a5e7b354b480b1a82b34bde8dc7b854cc0',
    dtype: 'q8', backend: 'wasm', bytes: 626_901_570,
    license: 'Apache-2.0', qualifiedFor: Object.freeze([]),
    qualificationReason: 'LOCAL_ANALYSIS_MODEL_UNQUALIFIED', maxNewTokens: 360,
  }),
  runtime: TRANSFORMERS_RUNTIME,
});

export const MEMORY_DOWNLOAD_BYTES = MEMORY_MODELS.embedding.bytes + MEMORY_MODELS.analysis.bytes;

export const ACCEPTANCE_THRESHOLDS = Object.freeze({
  topic: Object.freeze({ domainAccuracy: .85, topicAccuracy: .80, categoryReuseAccuracy: .90, maximumDuplicationRate: .05 }),
  informationType: Object.freeze({ accuracy: .80, macroF1: .75, minimumPerClassRecall: .65, maximumAbstentionRate: .30 }),
  relationship: Object.freeze({ linkPrecision: .95, macroF1: .75, maximumFalseMergeRate: .02, contradictionRecall: .80 }),
  endToEnd: Object.freeze({ decisionAccuracy: .80, dataPreservation: 1, idempotency: 1 }),
});

export const QUALIFICATION = Object.freeze({
  embeddingRetrieval: Object.freeze({ qualified: true, evidence: 'PR #76 real q8 WASM reference comparison' }),
  topicDiscovery: Object.freeze({ qualified: false, reason: MEMORY_MODELS.analysis.qualificationReason }),
  informationType: Object.freeze({ qualified: false, reason: MEMORY_MODELS.analysis.qualificationReason }),
  relationshipDecision: Object.freeze({ qualified: false, reason: MEMORY_MODELS.analysis.qualificationReason }),
  endToEnd: Object.freeze({ qualified: false, reason: 'SEMANTIC_STAGES_UNQUALIFIED' }),
});

export const memoryModelIdentity = model => `${model.repo}@${model.revision}:${model.dtype}/${model.backend}`;
