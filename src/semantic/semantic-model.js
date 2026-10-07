import { meanPoolWithAttentionMask, normalizeEmbedding, vectorStatistics } from "./knowledge-topic-e5.js";

export const SEMANTIC_MODELS = Object.freeze({
  runtime: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm",
  encoder: "Xenova/all-MiniLM-L6-v2",
  pairClassifier: "Xenova/nli-deberta-v3-xsmall",
  equivalenceCandidate: "Xenova/paraphrase-MiniLM-L3-v2",
  propositionCandidate: "cross-encoder/stsb-TinyBERT-L4",
  knowledgeTopicCandidate: "Xenova/multilingual-e5-small",
  revision: "main",
  embeddingDimensions: 384
});

const softmax = values => {
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
};

export function createInferenceQueue() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => {});
    return result;
  };
}

export function resolveNliLabels(id2label) {
  const entries = Object.entries(id2label || {}).map(([index, label]) => [Number(index), String(label).toLowerCase()]);
  const required = ["contradiction", "entailment", "neutral"];
  const resolved = Object.fromEntries(required.map(name => [name, entries.find(([, label]) => label === name)?.[0]]));
  if (required.some(name => !Number.isInteger(resolved[name]))) throw new Error("NLI model label mapping is incomplete");
  return resolved;
}

export async function loadSemanticModels() {
  const { env, pipeline, AutoTokenizer, AutoModelForSequenceClassification } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const options = { dtype: "q8", revision: SEMANTIC_MODELS.revision };
  let encoder; let backend = "wasm";
  if (globalThis.navigator?.gpu) {
    try { encoder = await pipeline("feature-extraction", SEMANTIC_MODELS.encoder, { ...options, device: "webgpu" }); backend = "webgpu"; }
    catch { encoder = null; }
  }
  encoder ||= await pipeline("feature-extraction", SEMANTIC_MODELS.encoder, { ...options, device: "wasm" });
  const tokenizer = await AutoTokenizer.from_pretrained(SEMANTIC_MODELS.pairClassifier, options);
  const classifier = await AutoModelForSequenceClassification.from_pretrained(SEMANTIC_MODELS.pairClassifier, options);
  const labels = resolveNliLabels(classifier.config.id2label);
  const runEncoder = createInferenceQueue();
  const runClassifier = createInferenceQueue();

  return {
    backend,
    async encode(text) {
      return runEncoder(async () => {
        const output = await encoder(text, { pooling: "mean", normalize: true });
        // Copy while the session owns the result. Some ONNX execution providers
        // reuse output buffers on the next invocation.
        return new Float32Array(output.data);
      });
    },
    async classify(premise, hypothesis) {
      return runClassifier(async () => {
        const inputs = await tokenizer(premise, { text_pair: hypothesis, truncation: true });
        const output = await classifier(inputs);
        const probabilities = softmax([...output.logits.data]);
        return Object.fromEntries(Object.entries(labels).map(([name, index]) => [name, probabilities[index]]));
      });
    }
  };
}

export async function loadEquivalenceCandidate() {
  const { env, pipeline } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const extractor = await pipeline("feature-extraction", SEMANTIC_MODELS.equivalenceCandidate, { dtype: "q8", revision: SEMANTIC_MODELS.revision, device: "wasm" });
  const run = createInferenceQueue();
  return text => run(async () => {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  });
}

export async function loadPropositionCandidate() {
  const { env, AutoTokenizer, AutoModelForSequenceClassification } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const options = { dtype: "fp32", revision: SEMANTIC_MODELS.revision, device: "wasm" };
  const tokenizer = await AutoTokenizer.from_pretrained(SEMANTIC_MODELS.propositionCandidate, options);
  const model = await AutoModelForSequenceClassification.from_pretrained(SEMANTIC_MODELS.propositionCandidate, options);
  if (Object.keys(model.config.id2label || {}).length !== 1) throw new Error("Proposition candidate must expose one STS regression output");
  const run = createInferenceQueue();
  return (left, right) => run(async () => {
    const inputs = await tokenizer(left, { text_pair: right, truncation: true });
    const output = await model(inputs);
    const rawLogit = Number(output.logits.data[0]);
    return { rawLogit, score: 1 / (1 + Math.exp(-rawLogit)) };
  });
}

// Development-only candidate. Nothing in normal startup calls this loader.
// E5 documents query:/passage: prefixes; canonical memories are symmetric
// corpus items, so the diagnostic encodes both sides as passages.
export async function loadKnowledgeTopicCandidate() {
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const { env, AutoTokenizer, AutoModel } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const options = { dtype: "q8", revision: SEMANTIC_MODELS.revision };
  const attempts = [];
  const tokenizer = await AutoTokenizer.from_pretrained(SEMANTIC_MODELS.knowledgeTopicCandidate, options);
  let model; let backend = "wasm";
  if (globalThis.navigator?.gpu) {
    try { model = await AutoModel.from_pretrained(SEMANTIC_MODELS.knowledgeTopicCandidate, { ...options, device: "webgpu" }); backend = "webgpu"; }
    catch (error) { attempts.push({ backend: "webgpu", error: String(error?.message || error) }); }
  }
  if (!model) {
    try { model = await AutoModel.from_pretrained(SEMANTIC_MODELS.knowledgeTopicCandidate, { ...options, device: "wasm" }); }
    catch (error) { attempts.push({ backend: "wasm", error: String(error?.message || error) }); throw error; }
  }
  const run = createInferenceQueue();
  const loadMilliseconds = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
  const formatInput = (text, prefix) => prefix === "none" ? text : `${prefix}: ${text}`;
  const candidate = {
    model: SEMANTIC_MODELS.knowledgeTopicCandidate,
    backend,
    attempts,
    loadMilliseconds,
    artifact: { dtype: "q8", graphBytesApproximate: 118_000_000, verifiedAt: "https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx" },
    inputStrategy: "SYMMETRIC_PASSAGE_PREFIX",
    expectedDimensions: 384,
    contract: null,
    async inspect(text, prefix = "passage") {
      return run(async () => {
        const formattedInput = formatInput(text, prefix);
        const inputs = await tokenizer(formattedInput, { truncation: true });
        const output = await model(inputs); const outputKeys = Object.keys(output);
        const tensor = output.last_hidden_state;
        if (!tensor) throw new Error(`E5 output does not contain last_hidden_state; received: ${outputKeys.join(", ")}`);
        const tensorShape = [...tensor.dims]; const mask = inputs.attention_mask;
        if (!mask) throw new Error("E5 tokenizer output does not contain attention_mask");
        const { pooled, includedTokens } = meanPoolWithAttentionMask(tensor.data, tensorShape, mask.data);
        const preNormalization = vectorStatistics(pooled); const embedding = normalizeEmbedding(pooled); const postNormalization = vectorStatistics(embedding);
        const inputShapes = Object.fromEntries(Object.entries(inputs).filter(([, value]) => value?.dims).map(([name, value]) => [name, [...value.dims]]));
        const modelContract = { tokenizerInputs: Object.keys(inputs), inputShapes, outputKeys, outputTensorShapes: Object.fromEntries(outputKeys.filter(key => output[key]?.dims).map(key => [key, [...output[key].dims]])),
          selectedTensor: "last_hidden_state", selectedTensorShape: tensorShape, tensorSemantics: "[batch, sequence_length, hidden_size]",
          poolingMethod: "ATTENTION_MASKED_MEAN", normalizationMethod: "L2_ACROSS_FINAL_EMBEDDING" };
        candidate.contract = modelContract;
        return { originalText: text, formattedInput, embedding: new Float32Array(embedding), modelContract,
          normalization: { dimension: embedding.length, preNorm: preNormalization.norm, postNorm: postNormalization.norm,
            componentMin: postNormalization.componentMin, componentMax: postNormalization.componentMax,
            componentMean: postNormalization.componentMean, componentStdDev: postNormalization.componentStdDev },
          tokenSanity: { tokenCount: inputs.input_ids.data.length, nonPaddingTokenCount: includedTokens,
            sequenceLength: tensorShape[1], embeddingDimension: tensorShape[2], finalEmbeddingNorm: postNormalization.norm,
            tokenTypeIdsPresent: Boolean(inputs.token_type_ids) } };
      });
    },
    async encode(text) {
      const result = await candidate.inspect(text, "passage");
      return new Float32Array(result.embedding);
    }
  };
  return candidate;
}
