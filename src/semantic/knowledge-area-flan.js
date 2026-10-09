import { createInferenceQueue, SEMANTIC_MODELS } from "./semantic-model.js";
import { createTopicVerification, evaluateShadowBoundary, KNOWLEDGE_AREA_2_EVALUATION, TOPIC_RELATION } from "./knowledge-area-foundation.js";
import { KNOWLEDGE_RELATION_MATRIX } from "./knowledge-relation.js";
import { KNOWLEDGE_TOPIC_MULTILINGUAL, KNOWLEDGE_TOPIC_NINE } from "./knowledge-topic-e5.js";

export const FLAN_TOPIC_MODEL = Object.freeze({
  id: "onnx-community/flan-t5-small-ONNX",
  revision: "76988c16f73cadb2c2e13e2d7d85608944223105",
  baseModel: "google/flan-t5-small",
  parameters: 77_000_000,
  license: "Apache-2.0",
  dtype: "q8",
  approximateGraphBytes: 94_900_000,
  authority: "SHADOW_ONLY",
  persistence: "NONE"
});

// The normal Knowledge Area 2.0 experiment deliberately uses the backend that
// produced valid generation in the browser. Backend comparison remains a
// separate diagnostic and creates its own isolated sessions.
export const FLAN_SHADOW_RUNTIME = Object.freeze({ backend: "wasm", allowFallback: false });

const now = () => globalThis.performance?.now?.() ?? Date.now();
export const extractFlanGeneratedText = output => {
  const record = Array.isArray(output) ? output[0] : output;
  if (!record || typeof record.generated_text !== "string") throw new Error("FLAN text2text pipeline returned an unexpected response shape");
  return record.generated_text.trim();
};
const responseMetadata = output => ({
  container: Array.isArray(output) ? "array" : typeof output,
  length: Array.isArray(output) ? output.length : null,
  keys: Object.keys(Array.isArray(output) ? output[0] || {} : output || {}),
  generatedTextType: typeof (Array.isArray(output) ? output[0]?.generated_text : output?.generated_text),
  generatedTextLength: String(Array.isArray(output) ? output[0]?.generated_text ?? "" : output?.generated_text ?? "").length
});

const safeProgress = event => ({ status: String(event?.status || "unknown"), file: event?.file ? String(event.file) : null,
  name: event?.name ? String(event.name) : null, loaded: Number.isFinite(event?.loaded) ? event.loaded : null,
  total: Number.isFinite(event?.total) ? event.total : null });
const disposeValues = values => { for (const value of Object.values(values || {})) if (typeof value?.dispose === "function") value.dispose(); };

export async function loadFlanTopicProvider({ backend: requestedBackend = null, allowFallback = true } = {}) {
  const startedAt = now();
  const { env, pipeline } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true; env.useWasmCache = true;
  const options = { dtype: FLAN_TOPIC_MODEL.dtype, revision: FLAN_TOPIC_MODEL.revision };
  const attempts = []; const artifactEvents = []; let generator; let backend = requestedBackend || "wasm";
  const load = device => pipeline("text2text-generation", FLAN_TOPIC_MODEL.id, { ...options, device,
    progress_callback: event => { if (artifactEvents.length < 80) artifactEvents.push(safeProgress(event)); } });
  if (requestedBackend) {
    const attemptStartedAt = now();
    try { generator = await load(requestedBackend); }
    catch (error) { attempts.push({ backend: requestedBackend, milliseconds: now() - attemptStartedAt, error: String(error?.message || error) }); throw error; }
  } else if (globalThis.navigator?.gpu) {
    const attemptStartedAt = now();
    try { generator = await load("webgpu"); backend = "webgpu"; }
    catch (error) {
      attempts.push({ backend: "webgpu", milliseconds: now() - attemptStartedAt, error: String(error?.message || error) });
      if (!allowFallback) throw error;
    }
  }
  if (!generator) {
    const attemptStartedAt = now();
    try { generator = await load("wasm"); backend = "wasm"; }
    catch (error) { attempts.push({ backend: "wasm", milliseconds: now() - attemptStartedAt, error: String(error?.message || error) }); throw error; }
  }
  const run = createInferenceQueue();
  const generate = (prompt, maximumTokens) => run(async () => {
    const inferenceStartedAt = now();
    const generationParameters = { max_new_tokens: maximumTokens, min_new_tokens: 1, do_sample: false, num_beams: 1 };
    const output = await generator(prompt, generationParameters);
    const text = extractFlanGeneratedText(output);
    let generatedTokenCount = null; let generatedTokens;
    try {
      generatedTokens = generator.tokenizer([text], { add_special_tokens: false });
      generatedTokenCount = generatedTokens.input_ids?.data?.length ?? null;
    } catch { generatedTokenCount = null; }
    finally { disposeValues(generatedTokens); }
    return { text, generatedTokenCount, rawResponse: structuredClone(output), responseMetadata: responseMetadata(output), generationParameters,
      inferenceMilliseconds: now() - inferenceStartedAt };
  });
  const modelContract = { decoderStartTokenId: generator.model?.config?.decoder_start_token_id ?? null,
    eosTokenId: generator.model?.config?.eos_token_id ?? null, padTokenId: generator.model?.config?.pad_token_id ?? null,
    tokenizerEosTokenId: generator.tokenizer?.eos_token_id ?? null, tokenizerPadTokenId: generator.tokenizer?.pad_token_id ?? null };
  const inspectTokens = (prompt, maximumTokens) => run(async () => {
    const generationParameters = { max_new_tokens: maximumTokens, min_new_tokens: 1, do_sample: false, num_beams: 1 };
    let inputs; let tokenIds;
    try {
      inputs = generator.tokenizer([prompt], { padding: true, truncation: true });
      tokenIds = await generator.model.generate({ ...inputs, ...generationParameters });
      return { dimensions: [...tokenIds.dims], tokenIds: [...tokenIds.data].slice(0, 64).map(Number),
        decodedWithSpecialTokens: generator.tokenizer.batch_decode(tokenIds, { skip_special_tokens: false }),
        decodedWithoutSpecialTokens: generator.tokenizer.batch_decode(tokenIds, { skip_special_tokens: true }), generationParameters };
    } finally { tokenIds?.dispose?.(); disposeValues(inputs); }
  });
  return { ...FLAN_TOPIC_MODEL, requestedBackend, backend, attempts, artifactEvents, loadMilliseconds: now() - startedAt,
    generate, inspectTokens, modelContract, dispose: () => generator.dispose?.() };
}

export const loadFlanShadowProvider = (loader = loadFlanTopicProvider) => loader(FLAN_SHADOW_RUNTIME);

export async function auditFlanGeneration(provider) {
  const prompt = "Translate English to German: The house is wonderful.";
  const result = await provider.generate(prompt, 32);
  const tokenAudit = !result.text && provider.inspectTokens ? await provider.inspectTokens(prompt, 32) : null;
  return { model: FLAN_TOPIC_MODEL.id, revision: FLAN_TOPIC_MODEL.revision, requestedBackend: provider.requestedBackend || provider.backend,
    backend: provider.backend, prompt,
    pipelineResponse: result.rawResponse, responseMetadata: result.responseMetadata,
    generatedText: result.text, generatedTextLength: result.text.length, generationParameters: result.generationParameters,
    modelContract: provider.modelContract || null, tokenAudit, inferenceMilliseconds: result.inferenceMilliseconds,
    conclusion: result.text ? "NONEMPTY_GENERATION_OBSERVED" : "EMPTY_GENERATION_OBSERVED",
    extractionContract: "output[0].generated_text", canonicalAuthority: false, productionAuthority: false, persistence: "NONE" };
}

const backendDiagnostic = async (backend, loader) => {
  const startedAt = now(); let provider;
  try { provider = await loader({ backend, allowFallback: false }); }
  catch (error) { return { requestedBackend: backend, actualBackend: null, loadStatus: "FAILED", loadMilliseconds: now() - startedAt,
    initializationError: String(error?.message || error), generationStatus: "NOT_RUN", generationError: null }; }
  try {
    const audit = await auditFlanGeneration(provider);
    return { requestedBackend: backend, actualBackend: provider.backend, loadStatus: "READY", loadMilliseconds: provider.loadMilliseconds,
      artifactRequestEvents: provider.artifactEvents || [], quantization: provider.dtype, expectedArtifactPolicy: "Transformers.js dtype=q8 selection",
      generationStatus: "COMPLETE", generationError: null, ...audit };
  } catch (error) {
    return { requestedBackend: backend, actualBackend: provider.backend, loadStatus: "READY", loadMilliseconds: provider.loadMilliseconds,
      artifactRequestEvents: provider.artifactEvents || [], quantization: provider.dtype, expectedArtifactPolicy: "Transformers.js dtype=q8 selection",
      generationStatus: "FAILED", generationError: String(error?.message || error) };
  } finally { await provider.dispose?.(); }
};

export async function compareFlanBackends(loader = loadFlanTopicProvider) {
  const webgpu = await backendDiagnostic("webgpu", loader);
  const wasm = await backendDiagnostic("wasm", loader);
  let interpretation = "INCONCLUSIVE";
  if (webgpu.generationStatus === "COMPLETE" && wasm.generationStatus === "COMPLETE") {
    if (!webgpu.generatedText && wasm.generatedText) interpretation = "WEBGPU_SPECIFIC_GENERATION_FAILURE";
    else if (!webgpu.generatedText && !wasm.generatedText) interpretation = "BOTH_BACKENDS_EMPTY";
    else if (webgpu.generatedText && wasm.generatedText) interpretation = "BOTH_BACKENDS_NONEMPTY";
    else interpretation = "WASM_SPECIFIC_GENERATION_FAILURE";
  } else if (wasm.loadStatus === "FAILED" || wasm.generationStatus === "FAILED") interpretation = "WASM_UNAVAILABLE_OR_FAILED";
  return { model: FLAN_TOPIC_MODEL.id, revision: FLAN_TOPIC_MODEL.revision,
    prompt: "Translate English to German: The house is wonderful.",
    generationParameters: { max_new_tokens: 32, min_new_tokens: 1, do_sample: false, num_beams: 1 },
    sessionsIndependent: true, fallbackAllowed: false, webgpu, wasm, interpretation,
    canonicalAuthority: false, productionAuthority: false, persistence: "NONE" };
}

export async function discoverTopic(provider, memory) {
  const prompt = `Identify the broad subject of the statement. Reply with only a short noun phrase. Do not explain.\nStatement: ${memory.content}\nSubject:`;
  const result = await provider.generate(prompt, 12);
  const subject = result.text.replace(/^subject\s*:\s*/iu, "").split(/\r?\n/u)[0].trim().slice(0, 80) || null;
  return { memoryId: String(memory.id), subject, rawOutput: result.text, backend: provider.backend || null,
    promptContract: "OPEN_VOCABULARY_SUBJECT_HYPOTHESIS",
    inferenceMilliseconds: result.inferenceMilliseconds, modelGenerated: true, membershipAuthority: false };
}

const verificationPrompt = (left, right) => `Decide whether the two statements concern the same broad subject. They do not need to mean the same thing. Reply with exactly SAME_AREA, DIFFERENT_AREA, or UNCERTAIN.\nStatement A: ${left}\nStatement B: ${right}\nDecision:`;
const parseDecision = output => {
  const normalized = output.trim().toUpperCase().replace(/[.\s]+$/u, "");
  return Object.values(TOPIC_RELATION).includes(normalized) ? normalized : TOPIC_RELATION.UNCERTAIN;
};

export async function verifyTopicPair(provider, left, right) {
  const startedAt = now();
  const forward = await provider.generate(verificationPrompt(left.content, right.content), 6);
  const reverse = await provider.generate(verificationPrompt(right.content, left.content), 6);
  const forwardDecision = parseDecision(forward.text); const reverseDecision = parseDecision(reverse.text);
  const decision = forwardDecision === reverseDecision ? forwardDecision : TOPIC_RELATION.UNCERTAIN;
  return { leftId: String(left.id), rightId: String(right.id), decision, forwardDecision, reverseDecision,
    forwardRawOutput: forward.text, reverseRawOutput: reverse.text,
    backend: provider.backend || null,
    reason: forwardDecision === reverseDecision ? "BIDIRECTIONAL_GENERATIVE_AGREEMENT" : "DIRECTIONAL_DISAGREEMENT",
    inferenceMilliseconds: forward.inferenceMilliseconds + reverse.inferenceMilliseconds, totalMilliseconds: now() - startedAt,
    modelGenerated: true, labelUsedAsEvidence: false, canonicalAuthority: false, productionAuthority: false, persistence: "NONE" };
}

export async function simulateFlanKnowledgeAreas(provider, memories, maximumMemories = 12) {
  if (memories.length > maximumMemories) throw new Error(`Shadow simulation is bounded to ${maximumMemories} memories`);
  const ordered = memories.map(memory => ({ id: String(memory.id), content: String(memory.content || "") })).sort((a, b) => a.id.localeCompare(b.id));
  const discoveries = [];
  for (const memory of ordered) discoveries.push(await discoverTopic(provider, memory));
  const verifications = [];
  for (let left = 0; left < ordered.length; left += 1) for (let right = left + 1; right < ordered.length; right += 1) {
    verifications.push(await verifyTopicPair(provider, ordered[left], ordered[right]));
  }
  const contracts = verifications.map(item => createTopicVerification({ leftId: item.leftId, rightId: item.rightId,
    decision: item.decision, evidence: item, verifier: FLAN_TOPIC_MODEL.id }));
  let clusters = ordered.map(memory => [memory.id]);
  for (const evidence of verifications.filter(item => item.decision === TOPIC_RELATION.SAME_AREA)) {
    const left = clusters.find(cluster => cluster.includes(evidence.leftId)); const right = clusters.find(cluster => cluster.includes(evidence.rightId));
    if (!left || !right || left === right) continue;
    const boundary = evaluateShadowBoundary(left, right, contracts);
    if (boundary.decision !== TOPIC_RELATION.SAME_AREA) continue;
    clusters = clusters.filter(cluster => cluster !== left && cluster !== right);
    clusters.push([...left, ...right].sort());
  }
  clusters.sort((a, b) => a[0].localeCompare(b[0]));
  return { model: FLAN_TOPIC_MODEL.id, revision: FLAN_TOPIC_MODEL.revision, backend: provider.backend || null, discoveries, verifications,
    areas: clusters.map((memoryIds, index) => ({ id: `flan-shadow-${index + 1}`, memoryIds, status: "SHADOW_MODEL_EVIDENCE",
      subjectHypotheses: discoveries.filter(item => memoryIds.includes(item.memoryId)).map(item => item.subject).filter(Boolean) })),
    completeBoundaryRequired: true, orderDeterministic: true, canonicalAuthority: false, productionAuthority: false, persistence: "NONE" };
}

export async function runFlanTopicEvaluation(provider) {
  const startedAt = now(); const rows = [];
  for (let index = 0; index < KNOWLEDGE_RELATION_MATRIX.length; index += 1) {
    const pair = KNOWLEDGE_RELATION_MATRIX[index];
    rows.push({ index, group: pair.group, expected: pair.expected, left: pair.left, right: pair.right,
      ...await verifyTopicPair(provider, { id: `left-${index}`, content: pair.left }, { id: `right-${index}`, content: pair.right }) });
  }
  const same = rows.filter(row => row.expected === "SAME_TOPIC"); const different = rows.filter(row => row.expected === "DIFFERENT_TOPIC");
  const decided = rows.filter(row => row.decision !== TOPIC_RELATION.UNCERTAIN);
  return { model: FLAN_TOPIC_MODEL.id, rows, summary: {
    pairCount: rows.length,
    sameTopicRecall: same.length ? same.filter(row => row.decision === TOPIC_RELATION.SAME_AREA).length / same.length : null,
    differentTopicRejection: different.length ? different.filter(row => row.decision === TOPIC_RELATION.DIFFERENT_AREA).length / different.length : null,
    coverage: rows.length ? decided.length / rows.length : null,
    abstentionRate: rows.length ? (rows.length - decided.length) / rows.length : null,
    hardNegativesRejected: rows.filter(row => row.group === "hard-negative" && row.decision === TOPIC_RELATION.DIFFERENT_AREA).length,
    hardNegativeCount: rows.filter(row => row.group === "hard-negative").length
  }, elapsedMilliseconds: now() - startedAt, calibrationUsed: false, productionAuthority: false, persistence: "NONE" };
}

export async function runFlanMultilingualEvaluation(provider) {
  const rows = [];
  for (let index = 0; index < KNOWLEDGE_TOPIC_MULTILINGUAL.length; index += 1) {
    const pair = KNOWLEDGE_TOPIC_MULTILINGUAL[index];
    rows.push({ ...pair, ...await verifyTopicPair(provider, { id: `multi-left-${index}`, content: pair.left },
      { id: `multi-right-${index}`, content: pair.right }) });
  }
  return { model: FLAN_TOPIC_MODEL.id, rows, languageQualityClaimed: false, productionAuthority: false, persistence: "NONE" };
}

export async function runFlanRegressionCorpora(provider) {
  const fixtures = {
    tradingProgramming: [...KNOWLEDGE_TOPIC_NINE, "Plants need sunlight to grow"],
    bicycleBee: [...KNOWLEDGE_AREA_2_EVALUATION.bicycleBee]
  };
  const results = {};
  for (const [name, content] of Object.entries(fixtures)) results[name] = await simulateFlanKnowledgeAreas(provider,
    content.map((text, index) => ({ id: `${name}-${index + 1}`, content: text })));
  return { model: FLAN_TOPIC_MODEL.id, results, expectedLabelsUsedAtRuntime: false, productionAuthority: false, persistence: "NONE" };
}

const DISCOVERY_PROMPTS = Object.freeze([
  Object.freeze({ id: "CURRENT_SHORT_NOUN_PHRASE", build: text => `Identify the broad subject of the statement. Reply with only a short noun phrase. Do not explain.\nStatement: ${text}\nSubject:` }),
  Object.freeze({ id: "WHAT_IS_THIS_ABOUT", build: text => `What is this statement about? Answer with one short subject noun phrase only.\nStatement: ${text}\nSubject:` }),
  Object.freeze({ id: "GENERAL_FIELD_OR_SUBJECT", build: text => `Name the general field or subject discussed by this statement. Return only a short subject noun phrase.\nStatement: ${text}\nSubject:` })
]);

const VERIFICATION_PROMPTS = Object.freeze([
  Object.freeze({ id: "CURRENT_THREE_TOKEN", maximumTokens: 6, build: verificationPrompt,
    parse: parseDecision, compliant: output => Object.values(TOPIC_RELATION).includes(output.trim().toUpperCase().replace(/[.\s]+$/u, "")) }),
  Object.freeze({ id: "YES_NO", maximumTokens: 3,
    build: (left, right) => `Do these two statements concern the same broad subject? Answer only YES or NO.\nStatement A: ${left}\nStatement B: ${right}\nAnswer:`,
    parse: output => output.trim().toUpperCase().replace(/[.\s]+$/u, "") === "YES" ? TOPIC_RELATION.SAME_AREA
      : output.trim().toUpperCase().replace(/[.\s]+$/u, "") === "NO" ? TOPIC_RELATION.DIFFERENT_AREA : TOPIC_RELATION.UNCERTAIN,
    compliant: output => ["YES", "NO"].includes(output.trim().toUpperCase().replace(/[.\s]+$/u, "")) }),
  Object.freeze({ id: "SAME_OR_DIFFERENT", maximumTokens: 3,
    build: (left, right) => `Classify whether these statements discuss the same broad subject. Reply only SAME or DIFFERENT.\nStatement A: ${left}\nStatement B: ${right}\nAnswer:`,
    parse: output => output.trim().toUpperCase().replace(/[.\s]+$/u, "") === "SAME" ? TOPIC_RELATION.SAME_AREA
      : output.trim().toUpperCase().replace(/[.\s]+$/u, "") === "DIFFERENT" ? TOPIC_RELATION.DIFFERENT_AREA : TOPIC_RELATION.UNCERTAIN,
    compliant: output => ["SAME", "DIFFERENT"].includes(output.trim().toUpperCase().replace(/[.\s]+$/u, "")) })
]);

const normalizeDiagnosticText = value => String(value || "").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function inspectSubjectLabelFormat(output, memory) {
  const text = String(output || "").trim(); const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const singleCharacterWords = words.filter(word => [...word].length === 1).length;
  const reasons = [];
  if (!text) reasons.push("EMPTY");
  if (words.length > 8) reasons.push("TOO_LONG");
  if (normalizeDiagnosticText(text) === normalizeDiagnosticText(memory)) reasons.push("COPIES_MEMORY");
  if (words.length && singleCharacterWords / words.length > .5) reasons.push("FRAGMENTED_TOKENS");
  if (text && !/[\p{L}\p{N}]/u.test(text)) reasons.push("NO_ALPHANUMERIC_CONTENT");
  return { formatCompliant: reasons.length === 0, reasons, wordCount: words.length,
    semanticCorrectness: "REVIEW_REQUIRED" };
}

const FINAL_DISCOVERY_MEMORIES = Object.freeze(KNOWLEDGE_AREA_2_EVALUATION.bicycleBee.map((content, index) => Object.freeze({
  id: `bicycle-bee-${index + 1}`, content, expected: index < 3 ? "cycling-related subject" : index < 6 ? "bee-related subject" : "the grounded subject of this singleton"
})));
const pairsWithin = (items, offset, length, group) => {
  const rows = [];
  for (let left = offset; left < offset + length; left += 1) for (let right = left + 1; right < offset + length; right += 1)
    rows.push({ group, expected: "SAME_TOPIC", left: items[left], right: items[right] });
  return rows;
};
const hardNegativePairs = KNOWLEDGE_RELATION_MATRIX.filter(pair => pair.group === "hard-negative");
export const FLAN_FINAL_DIAGNOSTIC = Object.freeze({
  discoveryVariantCount: DISCOVERY_PROMPTS.length, verificationVariantCount: VERIFICATION_PROMPTS.length,
  discoveryMemoryCount: FINAL_DISCOVERY_MEMORIES.length,
  verificationPairs: Object.freeze([
    ...pairsWithin(KNOWLEDGE_AREA_2_EVALUATION.bicycleBee, 0, 3, "bicycle-same"),
    ...pairsWithin(KNOWLEDGE_AREA_2_EVALUATION.bicycleBee, 3, 3, "bee-same"),
    { group: "bicycle-bee", expected: "DIFFERENT_TOPIC", left: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[0], right: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[3] },
    { group: "trading-programming", expected: "DIFFERENT_TOPIC", left: KNOWLEDGE_TOPIC_NINE[0], right: KNOWLEDGE_TOPIC_NINE[3] },
    { group: "unrelated-singletons", expected: "DIFFERENT_TOPIC", left: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[6], right: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[7] },
    { group: "unrelated-singletons", expected: "DIFFERENT_TOPIC", left: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[8], right: KNOWLEDGE_AREA_2_EVALUATION.bicycleBee[9] },
    ...hardNegativePairs
  ]),
  runtimeAuthority: false
});

const diagnosticPair = async (provider, variant, pair, index) => {
  const forward = await provider.generate(variant.build(pair.left, pair.right), variant.maximumTokens);
  const reverse = await provider.generate(variant.build(pair.right, pair.left), variant.maximumTokens);
  const forwardDecision = variant.parse(forward.text); const reverseDecision = variant.parse(reverse.text);
  const decision = forwardDecision === reverseDecision ? forwardDecision : TOPIC_RELATION.UNCERTAIN;
  const expectedDecision = pair.expected === "SAME_TOPIC" ? TOPIC_RELATION.SAME_AREA : TOPIC_RELATION.DIFFERENT_AREA;
  return { index, variant: variant.id, group: pair.group, expected: pair.expected, left: pair.left, right: pair.right,
    forwardRawOutput: forward.text, reverseRawOutput: reverse.text,
    forwardGeneratedTokenCount: forward.generatedTokenCount ?? null, reverseGeneratedTokenCount: reverse.generatedTokenCount ?? null,
    forwardDecision, reverseDecision, decision, expectedDecision,
    formatCompliant: variant.compliant(forward.text) && variant.compliant(reverse.text), correctness: decision === expectedDecision,
    inferenceMilliseconds: forward.inferenceMilliseconds + reverse.inferenceMilliseconds };
};

const summarizeVerification = rows => {
  const same = rows.filter(row => row.expected === "SAME_TOPIC"); const different = rows.filter(row => row.expected === "DIFFERENT_TOPIC");
  const decided = rows.filter(row => row.decision !== TOPIC_RELATION.UNCERTAIN); const hard = rows.filter(row => row.group === "hard-negative");
  return { pairCount: rows.length, nonemptyGenerationRate: rows.length ? rows.filter(row => row.forwardRawOutput && row.reverseRawOutput).length / rows.length : null,
    exactDecisionFormatCompliance: rows.length ? rows.filter(row => row.formatCompliant).length / rows.length : null,
    sameTopicRecall: same.length ? same.filter(row => row.decision === TOPIC_RELATION.SAME_AREA).length / same.length : null,
    differentTopicRejection: different.length ? different.filter(row => row.decision === TOPIC_RELATION.DIFFERENT_AREA).length / different.length : null,
    criticalHardNegativesRejected: hard.filter(row => row.decision === TOPIC_RELATION.DIFFERENT_AREA).length,
    criticalHardNegativeCount: hard.length, coverage: rows.length ? decided.length / rows.length : null,
    abstentionRate: rows.length ? (rows.length - decided.length) / rows.length : null,
    inferenceMilliseconds: rows.reduce((total, row) => total + row.inferenceMilliseconds, 0) };
};

export async function runFlanFinalCandidateDiagnostic(provider) {
  const startedAt = now(); const discovery = [];
  for (const variant of DISCOVERY_PROMPTS) for (const memory of FINAL_DISCOVERY_MEMORIES) {
    const result = await provider.generate(variant.build(memory.content), 12); const format = inspectSubjectLabelFormat(result.text, memory.content);
    discovery.push({ variant: variant.id, memoryId: memory.id, memory: memory.content, expected: memory.expected,
      rawOutput: result.text, parsedResult: result.text.trim() || null, generatedTokenCount: result.generatedTokenCount ?? null,
      ...format, correctness: "REVIEW_REQUIRED", inferenceMilliseconds: result.inferenceMilliseconds });
  }
  const verification = [];
  for (const variant of VERIFICATION_PROMPTS) for (let index = 0; index < FLAN_FINAL_DIAGNOSTIC.verificationPairs.length; index += 1)
    verification.push(await diagnosticPair(provider, variant, FLAN_FINAL_DIAGNOSTIC.verificationPairs[index], index));
  const discoverySummaries = DISCOVERY_PROMPTS.map(variant => { const rows = discovery.filter(row => row.variant === variant.id); return {
    variant: variant.id, count: rows.length, nonemptyGenerationRate: rows.filter(row => row.rawOutput).length / rows.length,
    formatValidSubjectLabelRate: rows.filter(row => row.formatCompliant).length / rows.length,
    semanticallyValidSubjectLabelRate: null, semanticReviewRequired: true,
    inferenceMilliseconds: rows.reduce((total, row) => total + row.inferenceMilliseconds, 0) }; });
  const verificationSummaries = VERIFICATION_PROMPTS.map(variant => ({ variant: variant.id,
    ...summarizeVerification(verification.filter(row => row.variant === variant.id)) }));
  const everyVerificationVariantFails = verificationSummaries.every(summary => summary.sameTopicRecall < .8
    || summary.differentTopicRejection < .95 || summary.criticalHardNegativesRejected !== summary.criticalHardNegativeCount);
  return { status: everyVerificationVariantFails ? "CANDIDATE_REJECTED" : "INCONCLUSIVE",
    reason: everyVerificationVariantFails ? "ALL_BOUNDED_VERIFICATION_FORMATS_FAILED_PRELIMINARY_QUALITY_GATES" : "REAL_BROWSER_SUBJECT_REVIEW_AND_FULL_FROZEN_EVALUATION_REQUIRED",
    model: FLAN_TOPIC_MODEL.id, revision: FLAN_TOPIC_MODEL.revision, backend: provider.backend || null,
    diagnosticScope: { discoveryVariants: DISCOVERY_PROMPTS.map(item => item.id), verificationVariants: VERIFICATION_PROMPTS.map(item => item.id),
      discoveryMemoryCount: FINAL_DISCOVERY_MEMORIES.length, verificationPairCount: FLAN_FINAL_DIAGNOSTIC.verificationPairs.length,
      alternativePromptLimitRespected: true },
    discovery: { rows: discovery, summaries: discoverySummaries }, verification: { rows: verification, summaries: verificationSummaries },
    fullFrozenEvaluationRun: false, multilingualEvaluationRun: false,
    elapsedMilliseconds: now() - startedAt, canonicalAuthority: false, productionAuthority: false, persistence: "NONE" };
}

export { parseDecision as parseFlanTopicDecision };
