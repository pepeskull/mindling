export const KNOWLEDGE_TOPIC_E5_RULES = Object.freeze({ maximumDiagnosticMemories: 9, maximumPairEvidence: 36, maximumAreaMemories: 12 });

export const KNOWLEDGE_TOPIC_NINE = Object.freeze([
  "Stock trading involves buying and selling shares",
  "Risk management is important when trading",
  "Traders study market prices",
  "JavaScript is used for web development",
  "Programming requires writing instructions for computers",
  "Developers use code to build software",
  "Anna enjoys classical music",
  "The Earth orbits the Sun",
  "Dogs need regular exercise"
]);

// Reviewed development examples only. They never enter production semantics.
export const KNOWLEDGE_TOPIC_MULTILINGUAL = Object.freeze([
  { group: "swedish-same-topic", expected: "SAME_TOPIC", left: "Aktiekurser kan förändras snabbt", right: "Marknadens svängningar skapar risk för investerare" },
  { group: "swedish-different-topic", expected: "DIFFERENT_TOPIC", left: "JavaScript används i webbläsare", right: "Hundar behöver regelbunden motion" },
  { group: "spanish-same-topic", expected: "SAME_TOPIC", left: "La apertura controla cuánta luz entra en la cámara", right: "Una apertura más amplia deja pasar más luz al sensor" },
  { group: "spanish-different-topic", expected: "DIFFERENT_TOPIC", left: "Los telescopios permiten observar objetos distantes", right: "La pasta se cocina en agua caliente" },
  { group: "cross-lingual-same-topic", expected: "SAME_TOPIC", left: "Risk management is important when trading", right: "Riskhantering är viktig vid handel" },
  { group: "cross-lingual-different-topic", expected: "DIFFERENT_TOPIC", left: "Developers use code to build software", right: "Los perros necesitan ejercicio regular" }
]);

const now = () => globalThis.performance?.now?.() ?? Date.now();
const pairKey = (left, right) => [String(left), String(right)].sort().join("\u0000");
const quantile = (sorted, position) => {
  if (!sorted.length) return null;
  const offset = (sorted.length - 1) * position; const lower = Math.floor(offset); const fraction = offset - lower;
  return sorted[lower] + (sorted[lower + 1] === undefined ? 0 : fraction * (sorted[lower + 1] - sorted[lower]));
};

export const dotProduct = (left, right) => {
  if (!left?.length || left.length !== right?.length) return NaN;
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += left[index] * right[index];
  return dot;
};

export const vectorNorm = vector => Math.sqrt(dotProduct(vector, vector));

export function vectorStatistics(vector) {
  const values = [...vector]; const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  return { dimension: values.length, norm: vectorNorm(vector), componentMin: Math.min(...values), componentMax: Math.max(...values), componentMean: mean,
    componentStdDev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1)) };
}

export function normalizeEmbedding(vector) {
  const norm = vectorNorm(vector);
  if (!Number.isFinite(norm) || norm === 0) throw new Error("E5 pooled embedding has an invalid norm");
  return new Float32Array([...vector].map(value => value / norm));
}

export function meanPoolWithAttentionMask(tokenData, tensorShape, attentionMask) {
  if (tensorShape.length !== 3 || tensorShape[0] !== 1) throw new Error(`Expected E5 token tensor [1, sequence, hidden], received [${tensorShape}]`);
  const [, sequenceLength, hiddenSize] = tensorShape;
  if (tokenData.length !== sequenceLength * hiddenSize || attentionMask.length !== sequenceLength) throw new Error("E5 tensor and attention-mask shapes do not align");
  const pooled = new Float32Array(hiddenSize); let includedTokens = 0;
  for (let token = 0; token < sequenceLength; token += 1) {
    const weight = Number(attentionMask[token]);
    if (!weight) continue;
    includedTokens += weight;
    for (let hidden = 0; hidden < hiddenSize; hidden += 1) pooled[hidden] += Number(tokenData[token * hiddenSize + hidden]) * weight;
  }
  if (!includedTokens) throw new Error("E5 attention mask contains no tokens");
  for (let hidden = 0; hidden < hiddenSize; hidden += 1) pooled[hidden] /= includedTokens;
  return { pooled, includedTokens };
}

export function compareEmbeddingVectors(left, right) {
  if (left.length !== right.length) return { vectorLength: Math.max(left.length, right.length), maxAbsoluteDifference: Infinity, meanAbsoluteDifference: Infinity, identicalComponentCount: 0 };
  let maximum = 0; let total = 0; let identical = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = Math.abs(left[index] - right[index]); maximum = Math.max(maximum, difference); total += difference;
    if (left[index] === right[index]) identical += 1;
  }
  return { vectorLength: left.length, maxAbsoluteDifference: maximum, meanAbsoluteDifference: total / (left.length || 1), identicalComponentCount: identical };
}

const E5_AUDIT_SENTENCES = Object.freeze({
  trading: "Stock trading involves buying and selling shares",
  risk: "Risk management is important when trading",
  dogs: "Dogs need regular exercise",
  earth: "The Earth orbits the Sun",
  javascript: "JavaScript is used for web development"
});

export async function runE5ImplementationAudit(model, cosine) {
  const inspect = (text, prefix = "passage") => model.inspect(text, prefix);
  const inspected = {};
  for (const [name, text] of Object.entries(E5_AUDIT_SENTENCES)) inspected[name] = await inspect(text);
  const retained = Object.fromEntries(["trading", "dogs", "javascript"].map(name => [name, new Float32Array(inspected[name].embedding)]));
  await inspect("A completely unrelated sentence used after retained vectors");
  const retention = Object.fromEntries(Object.entries(retained).map(([name, snapshot]) => [name, compareEmbeddingVectors(snapshot, inspected[name].embedding)]));
  const independence = {
    tradingVsDogs: compareEmbeddingVectors(inspected.trading.embedding, inspected.dogs.embedding),
    dogsVsJavaScript: compareEmbeddingVectors(inspected.dogs.embedding, inspected.javascript.embedding),
    tradingVsJavaScript: compareEmbeddingVectors(inspected.trading.embedding, inspected.javascript.embedding),
    retainedAfterAdditionalInference: retention,
    independentBuffers: new Set([inspected.trading.embedding.buffer, inspected.dogs.embedding.buffer, inspected.javascript.embedding.buffer]).size === 3
  };

  const repeated = [await inspect(E5_AUDIT_SENTENCES.risk), await inspect(E5_AUDIT_SENTENCES.risk), await inspect(E5_AUDIT_SENTENCES.risk)];
  await inspect("The ocean contains salt water");
  const repeatedAfterOtherInputs = await inspect(E5_AUDIT_SENTENCES.risk);
  const repeatedComparisons = repeated.slice(1).map(item => compareEmbeddingVectors(repeated[0].embedding, item.embedding));
  repeatedComparisons.push(compareEmbeddingVectors(repeated[0].embedding, repeatedAfterOtherInputs.embedding));

  const rawPrefix = await inspect(E5_AUDIT_SENTENCES.risk, "none"); const queryPrefix = await inspect(E5_AUDIT_SENTENCES.risk, "query");
  const prefixAudit = {
    conclusion: "CORRECT",
    rationale: "E5 requires task prefixes; peer canonical memories are encoded symmetrically as corpus passages.",
    passageVsRawCosine: cosine(inspected.risk.embedding, rawPrefix.embedding),
    passageVsQueryCosine: cosine(inspected.risk.embedding, queryPrefix.embedding),
    rawVsQueryCosine: cosine(rawPrefix.embedding, queryPrefix.embedding),
    passageVsRawDifference: compareEmbeddingVectors(inspected.risk.embedding, rawPrefix.embedding),
    passageVsQueryDifference: compareEmbeddingVectors(inspected.risk.embedding, queryPrefix.embedding)
  };

  const sanityPairs = [
    [E5_AUDIT_SENTENCES.trading, E5_AUDIT_SENTENCES.risk],
    [E5_AUDIT_SENTENCES.trading, E5_AUDIT_SENTENCES.dogs],
    [E5_AUDIT_SENTENCES.javascript, "Developers use code to build software"],
    [E5_AUDIT_SENTENCES.javascript, E5_AUDIT_SENTENCES.earth],
    [E5_AUDIT_SENTENCES.dogs, "Computers need regular maintenance"],
    [E5_AUDIT_SENTENCES.risk, "Sleep is important when recovering"],
    [E5_AUDIT_SENTENCES.risk, "Riskhantering är viktig vid handel"]
  ];
  const cache = new Map(Object.values(inspected).map(item => [item.originalText, item]));
  const get = async text => { if (!cache.has(text)) cache.set(text, await inspect(text)); return cache.get(text); };
  const pairSanity = [];
  for (const [left, right] of sanityPairs) pairSanity.push({ left, right, e5Cosine: cosine((await get(left)).embedding, (await get(right)).embedding) });

  const cosineBetween = cosine(inspected.trading.embedding, inspected.dogs.embedding);
  const dotBetween = dotProduct(inspected.trading.embedding, inspected.dogs.embedding);
  const normsValid = Object.values(inspected).every(item => Math.abs(item.normalization.postNorm - 1) <= 1e-5);
  const retainedValid = Object.values(retention).every(item => item.maxAbsoluteDifference === 0);
  const independentValues = [independence.tradingVsDogs, independence.dogsVsJavaScript, independence.tradingVsJavaScript].every(item => item.maxAbsoluteDifference > 0);
  const repeatedValid = repeatedComparisons.every(item => item.maxAbsoluteDifference <= 1e-5);
  const contractValid = inspected.risk.modelContract.selectedTensor === "last_hidden_state" && inspected.risk.modelContract.selectedTensorShape.length === 3 &&
    inspected.risk.normalization.dimension === (model.expectedDimensions || inspected.risk.normalization.dimension);
  const implementationCorrect = normsValid && retainedValid && independentValues && repeatedValid && independence.independentBuffers && contractValid && Math.abs(cosineBetween - dotBetween) <= 1e-5;
  return {
    model: model.model, backend: model.backend, inputStrategy: model.inputStrategy, modelContract: inspected.risk.modelContract,
    normalization: inspected.risk.normalization,
    cosineValidation: { selfCosine: cosine(inspected.risk.embedding, inspected.risk.embedding), cosine: cosineBetween, dotProduct: dotBetween,
      absoluteDifference: Math.abs(cosineBetween - dotBetween) },
    bufferIndependence: independence,
    repeatedInput: { comparisons: repeatedComparisons, deterministicWithinTolerance: repeatedValid, tolerance: 1e-5 },
    prefixAudit,
    tokenSanity: ["trading", "risk", "dogs", "earth"].map(name => ({ sentence: inspected[name].originalText, ...inspected[name].tokenSanity })),
    pairSanity,
    backendComparison: { status: "NOT_TESTED", reason: "The audit does not initialize a second 118 MB session solely to force another provider." },
    conclusion: implementationCorrect ? "IMPLEMENTATION_CORRECT" : "IMPLEMENTATION_UNCERTAIN",
    canonicalAuthority: false, persistence: "NONE"
  };
}

export function summarizeTopicScores(rows) {
  const summarize = values => {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return { count: sorted.length, minimum: sorted[0] ?? null, maximum: sorted.at(-1) ?? null,
      median: quantile(sorted, .5), mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
      p10: quantile(sorted, .1), p25: quantile(sorted, .25), p75: quantile(sorted, .75), p90: quantile(sorted, .9) };
  };
  const groups = {
    SAME_TOPIC: rows.filter(row => row.expected === "SAME_TOPIC").map(row => row.e5Cosine),
    DIFFERENT_TOPIC: rows.filter(row => row.expected === "DIFFERENT_TOPIC").map(row => row.e5Cosine),
    HARD_NEGATIVE: rows.filter(row => row.group === "hard-negative").map(row => row.e5Cosine),
    SAME_TOPIC_DIFFERENT_STRUCTURE: rows.filter(row => row.group === "same-subject-different-structure").map(row => row.e5Cosine)
  };
  const distributions = Object.fromEntries(Object.entries(groups).map(([name, values]) => [name, summarize(values)]));
  const sameMinimum = distributions.SAME_TOPIC.minimum; const differentMaximum = distributions.DIFFERENT_TOPIC.maximum;
  return { distributions, rawSeparation: sameMinimum !== null && differentMaximum !== null && sameMinimum > differentMaximum ?
    { separated: true, openInterval: [differentMaximum, sameMinimum] } : { separated: false, overlap: true }, decisionPromoted: false };
}

export async function inspectTopicPair({ left, right, productionEncode, e5Encode, cosine }) {
  const startedAt = now();
  const productionLeft = await productionEncode(left); const productionRight = await productionEncode(right);
  const productionMiniLMCosine = cosine(productionLeft, productionRight);
  const e5StartedAt = now(); const e5Left = await e5Encode(left); const e5Right = await e5Encode(right);
  return { left, right, productionMiniLMCosine, e5Cosine: cosine(e5Left, e5Right),
    e5InferenceMilliseconds: now() - e5StartedAt, totalMilliseconds: now() - startedAt,
    e5: { model: "Xenova/multilingual-e5-small", inputStrategy: "SYMMETRIC_PASSAGE_PREFIX", leftPrefix: "passage:", rightPrefix: "passage:", dimensions: e5Left.length },
    canonicalAuthority: false, persistence: "NONE" };
}

export async function simulateTopicAreas(memories, encode, cosine, threshold = null) {
  const startedAt = now();
  if (memories.length > KNOWLEDGE_TOPIC_E5_RULES.maximumDiagnosticMemories) throw new Error("E5 shadow simulation exceeds its diagnostic memory bound");
  const local = [];
  for (const [index, memory] of memories.entries()) local.push({ id: String(memory.id ?? `e5-shadow-${index + 1}`), content: memory.content, embedding: await encode(memory.content) });
  local.sort((left, right) => left.id.localeCompare(right.id));
  const pairEvidence = [];
  for (let left = 0; left < local.length; left += 1) for (let right = left + 1; right < local.length; right += 1) pairEvidence.push({
    leftId: local[left].id, rightId: local[right].id, e5Cosine: cosine(local[left].embedding, local[right].embedding)
  });
  pairEvidence.sort((left, right) => right.e5Cosine - left.e5Cosine || pairKey(left.leftId, left.rightId).localeCompare(pairKey(right.leftId, right.rightId)));
  const evidenceFor = (left, right) => pairEvidence.find(pair => pairKey(pair.leftId, pair.rightId) === pairKey(left, right));
  let clusters = local.map(memory => [memory.id]); const allowedMerges = []; const blockedMerges = [];
  if (Number.isFinite(threshold)) for (const edge of pairEvidence) {
    const leftCluster = clusters.find(cluster => cluster.includes(edge.leftId)); const rightCluster = clusters.find(cluster => cluster.includes(edge.rightId));
    if (leftCluster === rightCluster || leftCluster.length + rightCluster.length > KNOWLEDGE_TOPIC_E5_RULES.maximumAreaMemories) continue;
    const boundary = leftCluster.flatMap(left => rightCluster.map(right => evidenceFor(left, right)));
    const minimum = Math.min(...boundary.map(item => item.e5Cosine));
    if (minimum >= threshold) {
      const merged = [...leftCluster, ...rightCluster].sort(); clusters = clusters.filter(cluster => cluster !== leftCluster && cluster !== rightCluster); clusters.push(merged);
      allowedMerges.push({ left: leftCluster, right: rightCluster, clusterMinimumEvidence: minimum,
        clusterMedianEvidence: quantile(boundary.map(item => item.e5Cosine).sort((a, b) => a - b), .5) });
    } else blockedMerges.push({ left: leftCluster, right: rightCluster, clusterMinimumEvidence: minimum, reason: "COMPLETE_LINK_BELOW_CALLER_THRESHOLD" });
  }
  if (!Number.isFinite(threshold)) for (const pair of pairEvidence) blockedMerges.push({ left: [pair.leftId], right: [pair.rightId],
    clusterMinimumEvidence: pair.e5Cosine, reason: "NO_DECISION_THRESHOLD_PROMOTED", uncertainty: true });
  const areas = clusters.map(memoryIds => {
    const inside = pairEvidence.filter(pair => memoryIds.includes(pair.leftId) && memoryIds.includes(pair.rightId)).map(pair => pair.e5Cosine).sort((a, b) => a - b);
    return { memoryIds, clusterMinimumEvidence: inside[0] ?? 1, clusterMedianEvidence: quantile(inside, .5) ?? 1,
      uncertainty: Number.isFinite(threshold) ? "CALLER_SUPPLIED_EXPERIMENTAL_THRESHOLD" : "NO_DECISION_THRESHOLD_PROMOTED" };
  }).sort((left, right) => left.memoryIds[0].localeCompare(right.memoryIds[0]));
  return { model: "Xenova/multilingual-e5-small", inputStrategy: "SYMMETRIC_PASSAGE_PREFIX", threshold,
    decisionPolicy: Number.isFinite(threshold) ? "CALLER_SUPPLIED_DIAGNOSTIC_ONLY" : "RAW_EVIDENCE_ONLY",
    shadowAreas: areas, assignments: areas.flatMap(area => area.memoryIds.map(memoryId => ({ memoryId, shadowAreaMemoryIds: area.memoryIds, uncertainty: area.uncertainty }))),
    pairEvidence, allowedMerges, blockedMerges, elapsedMilliseconds: now() - startedAt,
    maximumDiagnosticMemories: KNOWLEDGE_TOPIC_E5_RULES.maximumDiagnosticMemories, maximumPairEvidence: KNOWLEDGE_TOPIC_E5_RULES.maximumPairEvidence,
    orderBehavior: "INPUT_SORTED_BY_STABLE_MEMORY_ID", canonicalAuthority: false, persistence: "NONE" };
}
