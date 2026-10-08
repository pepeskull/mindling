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

const now = () => globalThis.performance?.now?.() ?? Date.now();
const generatedText = output => String(Array.isArray(output) ? output[0]?.generated_text : output?.generated_text || "").trim();

export async function loadFlanTopicProvider() {
  const startedAt = now();
  const { env, pipeline } = await import(SEMANTIC_MODELS.runtime);
  env.useBrowserCache = true; env.useWasmCache = true;
  const options = { dtype: FLAN_TOPIC_MODEL.dtype, revision: FLAN_TOPIC_MODEL.revision };
  const attempts = []; let generator; let backend = "wasm";
  if (globalThis.navigator?.gpu) {
    try { generator = await pipeline("text2text-generation", FLAN_TOPIC_MODEL.id, { ...options, device: "webgpu" }); backend = "webgpu"; }
    catch (error) { attempts.push({ backend: "webgpu", error: String(error?.message || error) }); }
  }
  if (!generator) {
    try { generator = await pipeline("text2text-generation", FLAN_TOPIC_MODEL.id, { ...options, device: "wasm" }); }
    catch (error) { attempts.push({ backend: "wasm", error: String(error?.message || error) }); throw error; }
  }
  const run = createInferenceQueue();
  const generate = (prompt, maximumTokens) => run(async () => {
    const inferenceStartedAt = now();
    const output = await generator(prompt, { max_new_tokens: maximumTokens, do_sample: false, num_beams: 1 });
    return { text: generatedText(output), inferenceMilliseconds: now() - inferenceStartedAt };
  });
  return { ...FLAN_TOPIC_MODEL, backend, attempts, loadMilliseconds: now() - startedAt, generate };
}

export async function discoverTopic(provider, memory) {
  const prompt = `Identify the broad subject of the statement. Reply with only a short noun phrase. Do not explain.\nStatement: ${memory.content}\nSubject:`;
  const result = await provider.generate(prompt, 12);
  const subject = result.text.replace(/^subject\s*:\s*/iu, "").split(/\r?\n/u)[0].trim().slice(0, 80) || null;
  return { memoryId: String(memory.id), subject, rawOutput: result.text, promptContract: "OPEN_VOCABULARY_SUBJECT_HYPOTHESIS",
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
  return { model: FLAN_TOPIC_MODEL.id, discoveries, verifications,
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

export { parseDecision as parseFlanTopicDecision };
