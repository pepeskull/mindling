import { createInferenceQueue, SEMANTIC_MODELS } from "./semantic-model.js";
import { KNOWLEDGE_RELATION_MATRIX } from "./knowledge-relation.js";
import { KNOWLEDGE_TOPIC_MULTILINGUAL, KNOWLEDGE_TOPIC_NINE } from "./knowledge-topic-e5.js";

export const JINA_TOPIC_MODEL = Object.freeze({
  id: "jinaai/jina-reranker-v1-tiny-en",
  revision: "main",
  dtype: "q8",
  artifact: "onnx/model_quantized.onnx",
  approximateGraphBytes: 33_400_000,
  authority: "SHADOW_ONLY",
  persistence: "NONE"
});

export const KNOWLEDGE_TOPIC_TEN = Object.freeze([...KNOWLEDGE_TOPIC_NINE, "Plants need sunlight to grow"]);
export const JINA_DIAGNOSTIC_LIMITS = Object.freeze({ maximumSimulationMemories: 10, maximumSimulationPairs: 45 });

const now = () => globalThis.performance?.now?.() ?? Date.now();
export const sigmoid = value => 1 / (1 + Math.exp(-value));

const disposeTensors = collection => {
  for (const value of Object.values(collection || {})) if (typeof value?.dispose === "function") value.dispose();
};

export async function loadJinaTopicCandidate() {
  const startedAt = now();
  const { env, AutoTokenizer, AutoModelForSequenceClassification } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const options = { dtype: JINA_TOPIC_MODEL.dtype, revision: JINA_TOPIC_MODEL.revision };
  const tokenizer = await AutoTokenizer.from_pretrained(JINA_TOPIC_MODEL.id, options);
  const attempts = []; let model; let backend = "wasm";
  if (globalThis.navigator?.gpu) {
    try { model = await AutoModelForSequenceClassification.from_pretrained(JINA_TOPIC_MODEL.id, { ...options, device: "webgpu" }); backend = "webgpu"; }
    catch (error) { attempts.push({ backend: "webgpu", error: String(error?.message || error) }); }
  }
  if (!model) {
    try { model = await AutoModelForSequenceClassification.from_pretrained(JINA_TOPIC_MODEL.id, { ...options, device: "wasm" }); }
    catch (error) { attempts.push({ backend: "wasm", error: String(error?.message || error) }); throw error; }
  }
  const run = createInferenceQueue();
  const candidate = {
    ...JINA_TOPIC_MODEL,
    backend,
    attempts,
    loadMilliseconds: now() - startedAt,
    tokenizer: JINA_TOPIC_MODEL.id,
    modelClass: "AutoModelForSequenceClassification",
    runtime: "Transformers.js 3.8.1",
    contract: null,
    async score(query, document) {
      return run(async () => {
        const inferenceStartedAt = now(); let inputs; let output;
        try {
          inputs = await tokenizer(query, { text_pair: document, padding: true, truncation: true });
          output = await model(inputs);
          const logits = output.logits;
          if (!logits?.data || logits.data.length !== 1) throw new Error(`Jina reranker expected one logit, received ${logits?.data?.length ?? "none"}`);
          const rawScore = Number(logits.data[0]);
          if (!Number.isFinite(rawScore)) throw new Error("Jina reranker produced a non-finite logit");
          const inputShapes = Object.fromEntries(Object.entries(inputs).filter(([, value]) => value?.dims).map(([key, value]) => [key, [...value.dims]]));
          const outputKeys = Object.keys(output); const outputShapes = Object.fromEntries(outputKeys.filter(key => output[key]?.dims).map(key => [key, [...output[key].dims]]));
          candidate.contract = {
            tokenizerInputs: Object.keys(inputs), inputShapes, outputKeys, outputShapes,
            selectedOutput: "logits", selectedShape: [...logits.dims], outputInterpretation: "RAW_RELEVANCE_LOGIT",
            documentedTransform: "SIGMOID_FOR_RELEVANCE_RANKING", truncation: true, padding: true,
            id2label: model.config?.id2label || null
          };
          return { rawScore, relevanceScore: sigmoid(rawScore), inferenceMilliseconds: now() - inferenceStartedAt,
            contract: structuredClone(candidate.contract) };
        } finally {
          disposeTensors(output);
          disposeTensors(inputs);
        }
      });
    }
  };
  return candidate;
}

export async function inspectJinaPair(model, left, right) {
  const startedAt = now();
  const forward = await model.score(left, right);
  const reverse = await model.score(right, left);
  const rawScores = [forward.rawScore, reverse.rawScore];
  const relevanceScores = [forward.relevanceScore, reverse.relevanceScore];
  return {
    left, right,
    forwardRawScore: forward.rawScore, reverseRawScore: reverse.rawScore,
    minimumRawScore: Math.min(...rawScores), maximumRawScore: Math.max(...rawScores), meanRawScore: rawScores.reduce((sum, value) => sum + value, 0) / 2,
    rawScoreAsymmetry: Math.abs(forward.rawScore - reverse.rawScore),
    forwardRelevanceScore: forward.relevanceScore, reverseRelevanceScore: reverse.relevanceScore,
    minimumRelevanceScore: Math.min(...relevanceScores), maximumRelevanceScore: Math.max(...relevanceScores),
    meanRelevanceScore: relevanceScores.reduce((sum, value) => sum + value, 0) / 2,
    relevanceScoreAsymmetry: Math.abs(forward.relevanceScore - reverse.relevanceScore),
    backend: model.backend, forwardInferenceMilliseconds: forward.inferenceMilliseconds,
    reverseInferenceMilliseconds: reverse.inferenceMilliseconds,
    inferenceMilliseconds: forward.inferenceMilliseconds + reverse.inferenceMilliseconds,
    totalMilliseconds: now() - startedAt,
    scoreMeaning: "RAW_RELEVANCE_LOGIT_WITH_DOCUMENTED_SIGMOID_TRANSFORM",
    canonicalAuthority: false, authority: "SHADOW_ONLY", persistence: "NONE"
  };
}

const quantile = (sorted, position) => {
  if (!sorted.length) return null;
  const offset = (sorted.length - 1) * position; const lower = Math.floor(offset); const fraction = offset - lower;
  return sorted[lower] + (sorted[lower + 1] === undefined ? 0 : fraction * (sorted[lower + 1] - sorted[lower]));
};

const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return { count: sorted.length, minimum: sorted[0] ?? null, maximum: sorted.at(-1) ?? null,
    median: quantile(sorted, .5), mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    p10: quantile(sorted, .1), p25: quantile(sorted, .25), p75: quantile(sorted, .75), p90: quantile(sorted, .9) };
};

export function summarizeJinaRows(rows) {
  const groups = {
    SAME_TOPIC: rows.filter(row => row.expected === "SAME_TOPIC"),
    DIFFERENT_TOPIC: rows.filter(row => row.expected === "DIFFERENT_TOPIC"),
    HARD_NEGATIVE: rows.filter(row => row.group === "hard-negative"),
    SAME_TOPIC_DIFFERENT_STRUCTURE: rows.filter(row => row.group === "same-subject-different-structure")
  };
  const distributions = Object.fromEntries(Object.entries(groups).map(([name, members]) => [name, distribution(members.map(row => row.minimumRawScore))]));
  const relevanceDistributions = Object.fromEntries(Object.entries(groups).map(([name, members]) => [name, distribution(members.map(row => row.minimumRelevanceScore))]));
  const asymmetry = Object.fromEntries(Object.entries(groups).map(([name, members]) => [name, distribution(members.map(row => row.rawScoreAsymmetry))]));
  const same = groups.SAME_TOPIC.map(row => row.minimumRawScore); const different = groups.DIFFERENT_TOPIC.map(row => row.minimumRawScore);
  let wins = 0; let comparisons = 0;
  for (const positive of same) for (const negative of different) { wins += positive > negative ? 1 : positive === negative ? .5 : 0; comparisons += 1; }
  const sameMinimum = distributions.SAME_TOPIC.minimum; const differentMaximum = distributions.DIFFERENT_TOPIC.maximum;
  return {
    distributions, relevanceDistributions, asymmetry,
    groupCounts: Object.fromEntries(Object.entries(groups).map(([name, members]) => [name, members.length])),
    rankingProbability: comparisons ? wins / comparisons : null,
    rawGlobalSeparation: sameMinimum !== null && differentMaximum !== null && sameMinimum > differentMaximum ?
      { separated: true, openInterval: [differentMaximum, sameMinimum] } : { separated: false, overlap: true },
    thresholdSelected: false, classificationEvaluated: false
  };
}

export async function runJinaMatrix(model) {
  const startedAt = now(); const rows = []; const failures = [];
  for (const pair of KNOWLEDGE_RELATION_MATRIX) {
    try { rows.push({ group: pair.group, expected: pair.expected, ...await inspectJinaPair(model, pair.left, pair.right) }); }
    catch (error) { failures.push({ group: pair.group, expected: pair.expected, left: pair.left, right: pair.right, error: String(error?.message || error) }); }
  }
  return { model: JINA_TOPIC_MODEL.id, rows, summary: summarizeJinaRows(rows), failures,
    elapsedMilliseconds: now() - startedAt, expectedPairCount: KNOWLEDGE_RELATION_MATRIX.length,
    modelMetadata: { ...JINA_TOPIC_MODEL, backend: model.backend, loadMilliseconds: model.loadMilliseconds },
    calibrationStatus: "INSUFFICIENT_CALIBRATION", canonicalAuthority: false, authority: "SHADOW_ONLY", persistence: "NONE" };
}

export async function runJinaMultilingual(model) {
  const rows = []; const failures = [];
  for (const pair of KNOWLEDGE_TOPIC_MULTILINGUAL) {
    try { rows.push({ ...pair, ...await inspectJinaPair(model, pair.left, pair.right) }); }
    catch (error) { failures.push({ ...pair, error: String(error?.message || error) }); }
  }
  return { model: JINA_TOPIC_MODEL.id, rows, summary: summarizeJinaRows(rows), failures, modelLanguageClaim: "ENGLISH_FOCUSED",
    multilingualAuthorityClaimed: false, heldOut: true, thresholdTuningAllowed: false,
    canonicalAuthority: false, authority: "SHADOW_ONLY", persistence: "NONE" };
}

export async function simulateJinaAreas(model) {
  const startedAt = now(); const memories = KNOWLEDGE_TOPIC_TEN.map((content, index) => ({ id: `jina-ten-${index + 1}`, content }));
  if (memories.length > JINA_DIAGNOSTIC_LIMITS.maximumSimulationMemories) throw new Error("Jina simulation exceeds its memory bound");
  const pairEvidence = [];
  for (let left = 0; left < memories.length; left += 1) for (let right = left + 1; right < memories.length; right += 1) {
    pairEvidence.push({ leftId: memories[left].id, rightId: memories[right].id, ...await inspectJinaPair(model, memories[left].content, memories[right].content) });
  }
  return {
    model: JINA_TOPIC_MODEL.id,
    status: "INSUFFICIENT_CALIBRATION",
    reason: "RAW_RELEVANCE_HAS_NO_PREDECLARED_SAME_AREA_POLICY",
    memories,
    pairEvidence,
    diagnosticView: memories.map(memory => ({ memoryIds: [memory.id], uncertainty: "NO_CLASSIFICATION_POLICY" })),
    clusteringPolicy: "NOT_RUN_WITHOUT_INDEPENDENT_CALIBRATION",
    completeLinkSafety: "PRESERVED_BY_NOT_MERGING",
    representativeTradeoff: "Representative checks are bounded but are not equivalent to all-member complete-link validation.",
    maximumSimulationMemories: JINA_DIAGNOSTIC_LIMITS.maximumSimulationMemories,
    maximumSimulationPairs: JINA_DIAGNOSTIC_LIMITS.maximumSimulationPairs,
    elapsedMilliseconds: now() - startedAt,
    canonicalAuthority: false, authority: "SHADOW_ONLY", persistence: "NONE"
  };
}

export async function auditJinaModel(model) {
  const sentence = "Risk management is important when trading";
  const repeated = [await model.score(sentence, "Traders study market prices"), await model.score(sentence, "Traders study market prices"), await model.score(sentence, "Traders study market prices")];
  const reverse = await model.score("Traders study market prices", sentence);
  const repeatedRawScores = repeated.map(item => item.rawScore);
  const repeatedInferenceMilliseconds = repeated.map(item => item.inferenceMilliseconds);
  const maximumRepeatedDifference = Math.max(...repeatedRawScores) - Math.min(...repeatedRawScores);
  const browserRuntime = typeof window !== "undefined" && typeof document !== "undefined";
  const contract = repeated[0].contract;
  const contractValid = contract?.selectedOutput === "logits" && contract.selectedShape?.reduce((product, value) => product * value, 1) === 1;
  return {
    model: JINA_TOPIC_MODEL.id,
    revision: JINA_TOPIC_MODEL.revision,
    tokenizer: model.tokenizer,
    modelClass: model.modelClass,
    runtime: model.runtime,
    artifact: JINA_TOPIC_MODEL.artifact,
    approximateGraphBytes: JINA_TOPIC_MODEL.approximateGraphBytes,
    quantization: JINA_TOPIC_MODEL.dtype,
    backend: model.backend,
    providerAttempts: model.attempts,
    loadMilliseconds: model.loadMilliseconds,
    modelContract: contract,
    scoreExtraction: { rawOutput: "logits[0]", preservedRawLogit: true, documentedTransform: "sigmoid(rawLogit)", probabilityAssumed: false },
    repeatedInput: { rawScores: repeatedRawScores, inferenceMilliseconds: repeatedInferenceMilliseconds,
      maximumDifference: maximumRepeatedDifference, deterministic: maximumRepeatedDifference <= 1e-5 },
    directionalBehavior: { forwardRawScore: repeated[0].rawScore, reverseRawScore: reverse.rawScore, asymmetry: Math.abs(repeated[0].rawScore - reverse.rawScore) },
    truncation: { enabled: true, direction: "TOKENIZER_DEFAULT", maximumLength: "MODEL_CONFIG_DEFAULT" },
    errorHandling: "LOAD_AND_INFERENCE_ERRORS_REJECT_EXPLICITLY",
    bufferSafety: "SCALAR_LOGIT_COPIED_BEFORE_TENSORS_ARE_DISPOSED; SESSION_CALLS_SERIALIZED",
    resourceSafety: "TEMPORARY_INPUT_AND_OUTPUT_TENSORS_DISPOSED_WHEN_SUPPORTED",
    performance: { modelLoadMilliseconds: model.loadMilliseconds, firstInferenceMilliseconds: repeatedInferenceMilliseconds[0],
      laterInferenceMeanMilliseconds: repeatedInferenceMilliseconds.slice(1).reduce((sum, value) => sum + value, 0) / 2,
      forwardReversePairMilliseconds: repeated[0].inferenceMilliseconds + reverse.inferenceMilliseconds },
    runtimeCompatibility: { browserRuntime, backend: model.backend, webgpuFailureRecorded: model.attempts.some(attempt => attempt.backend === "webgpu") },
    conclusion: browserRuntime && contractValid && maximumRepeatedDifference <= 1e-5 ? "IMPLEMENTATION_CORRECT" : "IMPLEMENTATION_UNCERTAIN",
    semanticQualityConclusion: "NOT_EVALUATED_BY_IMPLEMENTATION_AUDIT",
    canonicalAuthority: false, authority: "SHADOW_ONLY", persistence: "NONE"
  };
}
