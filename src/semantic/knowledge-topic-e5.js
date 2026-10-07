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
