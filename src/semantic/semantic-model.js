export const SEMANTIC_MODELS = Object.freeze({
  runtime: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm",
  encoder: "Xenova/all-MiniLM-L6-v2",
  pairClassifier: "Xenova/nli-deberta-v3-xsmall",
  revision: "main",
  embeddingDimensions: 384
});

const softmax = values => {
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
};

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

  return {
    backend,
    async encode(text) {
      const output = await encoder(text, { pooling: "mean", normalize: true });
      return new Float32Array(output.data);
    },
    async classify(premise, hypothesis) {
      const inputs = await tokenizer(premise, { text_pair: hypothesis, truncation: true });
      const output = await classifier(inputs);
      const probabilities = softmax([...output.logits.data]);
      const labels = classifier.config.id2label || { 0: "contradiction", 1: "neutral", 2: "entailment" };
      return Object.fromEntries(probabilities.map((score, index) => [String(labels[index] || labels[String(index)] || index).toLowerCase(), score]));
    }
  };
}
