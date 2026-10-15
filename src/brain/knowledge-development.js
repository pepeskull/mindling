const CLUSTER_SIMILARITY = 0.62;
export const KNOWLEDGE_RULES = Object.freeze({ clusterSimilarity: CLUSTER_SIMILARITY, maximumRepresentatives: 3, displayedAreas: 8,
  maximumAreaMemories: 12, strengthWeight: .45, activationWeight: .25, densityWeight: .2, cohesionWeight: .1,
  activationSaturation: 5, memoryDensitySaturation: 5, specializationMinimumMemories: 3, specializationMinimumShare: .6,
  labelMinimumMemories: 2, labelMinimumCohesion: .75, labelMaximumWords: 5 });

const cosine = (left, right) => {
  if (!left?.length || left.length !== right?.length) return -1;
  let dot = 0; let a = 0; let b = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; a += left[index] ** 2; b += right[index] ** 2; }
  return dot / (Math.sqrt(a) * Math.sqrt(b) || 1);
};
const averageVector = memories => {
  const first = memories.find(memory => memory.embedding?.length);
  const vectors = memories.filter(memory => memory.embedding?.length && memory.source === first?.source && memory.embedding?.length === first?.embedding.length).map(memory => memory.embedding);
  if (!vectors.length) return null;
  const centroid = new Float32Array(vectors[0].length);
  for (const vector of vectors) for (let index = 0; index < centroid.length; index += 1) centroid[index] += vector[index] / vectors.length;
  return centroid;
};
const bounded = value => Math.max(0, Math.min(1, value));
const stableHash = values => values.reduce((hash, value) => [...value].reduce((current, character) => (current * 31 + character.codePointAt(0)) >>> 0, hash), 2166136261).toString(16).padStart(8, "0");
const pairKey = (left, right) => [String(left), String(right)].sort().join("\u0000");
const median = values => { const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

const representativesFor = (memories, similarityFor) => {
  if (memories.length <= KNOWLEDGE_RULES.maximumRepresentatives) return memories;
  const ranked = [...memories].sort((left, right) => {
    const leftAverage = memories.filter(item => item !== left).reduce((sum, item) => sum + similarityFor(left, item), 0) / (memories.length - 1);
    const rightAverage = memories.filter(item => item !== right).reduce((sum, item) => sum + similarityFor(right, item), 0) / (memories.length - 1);
    return leftAverage - rightAverage || String(left.id).localeCompare(String(right.id));
  });
  const selected = [ranked[0]];
  while (selected.length < KNOWLEDGE_RULES.maximumRepresentatives) {
    const remaining = ranked.filter(memory => !selected.includes(memory));
    remaining.sort((left, right) => Math.min(...selected.map(item => similarityFor(left, item))) - Math.min(...selected.map(item => similarityFor(right, item))) || String(left.id).localeCompare(String(right.id)));
    selected.push(remaining[0]);
  }
  return selected;
};

const centralMemory = (memories, similarityFor) => [...memories].sort((left, right) => {
  const leftAverage = memories.length === 1 ? 1 : memories.filter(item => item !== left).reduce((sum, item) => sum + similarityFor(left, item), 0) / (memories.length - 1);
  const rightAverage = memories.length === 1 ? 1 : memories.filter(item => item !== right).reduce((sum, item) => sum + similarityFor(right, item), 0) / (memories.length - 1);
  return rightAverage - leftAverage || String(left.id).localeCompare(String(right.id));
})[0];

const displayIdentity = (cluster, cohesion, similarityFor, fallbackIndex) => {
  if (cluster.length < KNOWLEDGE_RULES.labelMinimumMemories || cohesion < KNOWLEDGE_RULES.labelMinimumCohesion) return {
    label: `Emerging Knowledge ${String(fallbackIndex + 1).padStart(2, "0")}`, source: "NEUTRAL_FALLBACK", confidence: "LOW",
    reason: cluster.length < KNOWLEDGE_RULES.labelMinimumMemories ? "SINGLETON_AREA" : "INSUFFICIENT_CLUSTER_COHESION"
  };
  const source = String(centralMemory(cluster, similarityFor).content || "").trim();
  const words = source.match(/[^\s]+/gu) || [];
  if (!words.length) return { label: `Emerging Knowledge ${String(fallbackIndex + 1).padStart(2, "0")}`, source: "NEUTRAL_FALLBACK", confidence: "LOW", reason: "NO_DISPLAYABLE_CONTENT" };
  if (words.length <= KNOWLEDGE_RULES.labelMaximumWords) return { label: `Emerging Knowledge ${String(fallbackIndex + 1).padStart(2, "0")}`, source: "NEUTRAL_FALLBACK", confidence: "LOW", reason: "CONTENT_TOO_SHORT_FOR_SAFE_EXCERPT" };
  const clipped = words.slice(0, KNOWLEDGE_RULES.labelMaximumWords).join(" ");
  return { label: `${clipped}…`, source: "CENTRAL_MEMORY_EXCERPT", confidence: "CONSERVATIVE", reason: "COHERENT_MULTI_MEMORY_AREA" };
};

export function deriveKnowledgeDevelopment(memories) {
  const ordered = [...memories].sort((left, right) => String(left.id).localeCompare(String(right.id)) || String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  const similarities = new Map(); const similarityFor = (left, right) => left === right ? 1 : similarities.get(pairKey(left.id, right.id)) ?? -1;
  const edges = [];
  for (let left = 0; left < ordered.length; left += 1) for (let right = left + 1; right < ordered.length; right += 1) {
    const similarity = ordered[left].source === ordered[right].source ? cosine(ordered[left].embedding, ordered[right].embedding) : -1;
    similarities.set(pairKey(ordered[left].id, ordered[right].id), similarity);
    if (similarity >= KNOWLEDGE_RULES.clusterSimilarity) edges.push({ left: ordered[left], right: ordered[right], similarity });
  }
  edges.sort((left, right) => right.similarity - left.similarity || pairKey(left.left.id, left.right.id).localeCompare(pairKey(right.left.id, right.right.id)));
  let clusters = ordered.map(memory => [memory]); const clusterByMemory = new Map(clusters.map(cluster => [cluster[0].id, cluster]));
  for (const edge of edges) {
    const leftCluster = clusterByMemory.get(edge.left.id); const rightCluster = clusterByMemory.get(edge.right.id);
    if (edge.left.categoryId || edge.right.categoryId) continue;
    if (leftCluster === rightCluster || leftCluster.length + rightCluster.length > KNOWLEDGE_RULES.maximumAreaMemories) continue;
    const crossSimilarities = leftCluster.flatMap(left => rightCluster.map(right => similarityFor(left, right)));
    if (Math.min(...crossSimilarities) < KNOWLEDGE_RULES.clusterSimilarity) continue;
    const merged = [...leftCluster, ...rightCluster].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    clusters = clusters.filter(cluster => cluster !== leftCluster && cluster !== rightCluster); clusters.push(merged);
    for (const memory of merged) clusterByMemory.set(memory.id, merged);
  }
  const categorized = new Map();
  for (const memory of ordered.filter(memory => memory.categoryId && memory.category)) {
    if (!categorized.has(memory.categoryId)) categorized.set(memory.categoryId, []);
    categorized.get(memory.categoryId).push(memory);
  }
  clusters = [...clusters.filter(cluster => !cluster.some(memory => categorized.has(memory.categoryId))), ...categorized.values()];
  clusters.sort((left, right) => String(left[0]?.id).localeCompare(String(right[0]?.id)));

  const assignments = [];
  const areas = clusters.map((cluster, index) => {
    const centroid = averageVector(cluster); const count = cluster.length;
    const pairwise = cluster.flatMap((memory, memoryIndex) => cluster.slice(memoryIndex + 1).map(other => similarityFor(memory, other)));
    const cohesion = centroid ? cluster.reduce((sum, memory) => sum + Math.max(0, cosine(memory.embedding, centroid)), 0) / count : 0;
    const representatives = representativesFor(cluster, similarityFor);
    const averageStrength = cluster.reduce((sum, memory) => sum + bounded(memory.strength || 0), 0) / count;
    const activation = cluster.reduce((sum, memory) => sum + Math.min(memory.activations || 0, KNOWLEDGE_RULES.activationSaturation) / KNOWLEDGE_RULES.activationSaturation, 0) / count;
    const progress = bounded(averageStrength * KNOWLEDGE_RULES.strengthWeight + activation * KNOWLEDGE_RULES.activationWeight +
      Math.min(count / KNOWLEDGE_RULES.memoryDensitySaturation, 1) * KNOWLEDGE_RULES.densityWeight + cohesion * KNOWLEDGE_RULES.cohesionWeight);
    const memoryIds = cluster.map(memory => memory.id).sort(); const id = cluster[0].categoryId || `area-${stableHash(memoryIds)}`;
    const identity = cluster[0].categoryId && cluster[0].category ? { label: cluster[0].category, source: 'SAVED_CATEGORY', confidence: 'ASSESSED', reason: 'PERSISTENT_CATEGORY' } : displayIdentity(cluster, cohesion, similarityFor, index);
    for (const memory of cluster) assignments.push({ memoryId: memory.id, content: String(memory.content || "").slice(0, 72), areaId: id,
      centroidSimilarity: cosine(memory.embedding, centroid), representativeSimilarities: representatives.map(item => ({ memoryId: item.id, similarity: similarityFor(memory, item) })),
      clusterMinimumSimilarity: pairwise.length ? Math.min(...pairwise) : 1, clusterMedianSimilarity: pairwise.length ? median(pairwise) : 1,
      assignmentReason: count === 1 ? "SINGLETON_NO_COHERENT_MERGE" : "COMPLETE_LINK_COHERENT" });
    return { id, label: identity.label, labelSource: identity.source, labelConfidence: identity.confidence, labelReason: identity.reason, progress, cohesion,
      clusterMinimumSimilarity: pairwise.length ? Math.min(...pairwise) : 1, clusterMedianSimilarity: pairwise.length ? median(pairwise) : 1,
      centroid: centroid ? { dimensions: centroid.length, norm: Math.sqrt([...centroid].reduce((sum, value) => sum + value ** 2, 0)) } : { dimensions: 0, norm: 0 },
      memoryIds, memoryCount: count, representativeMemoryIds: representatives.map(memory => memory.id).sort(),
      neuronIds: [...new Set(cluster.flatMap(memory => memory.neuronIds || []))].sort(), synapseIds: [...new Set(cluster.flatMap(memory => memory.synapseIds || []))].sort() };
  });
  const total = memories.length; const overall = total ? areas.reduce((sum, area) => sum + area.progress * area.memoryCount, 0) / total : 0;
  return { overall, areas, assignments: assignments.sort((left, right) => String(left.memoryId).localeCompare(String(right.memoryId))), canonicalMemoryCount: total };
}

export function deriveNeuronParticipation(state, neuronId, development = deriveKnowledgeDevelopment(state.memories)) {
  const memories = state.memories.filter(memory => (memory.neuronIds || []).includes(neuronId));
  const areaParticipation = development.areas.map(area => { const participating = memories.filter(memory => area.memoryIds.includes(memory.id)); return {
    id: area.id, label: area.label, memoryCount: participating.length, share: memories.length ? participating.length / memories.length : 0
  }; }).filter(area => area.memoryCount).sort((left, right) => right.share - left.share || left.id.localeCompare(right.id));
  const reinforcement = memories.length ? memories.reduce((sum, memory) => sum + (memory.strength || 0), 0) / memories.length : 0;
  const activations = memories.reduce((sum, memory) => sum + (memory.activations || 0), 0); const dominantShare = areaParticipation[0]?.share || 0;
  const specialized = memories.length >= KNOWLEDGE_RULES.specializationMinimumMemories && dominantShare >= KNOWLEDGE_RULES.specializationMinimumShare;
  return { neuronId, memoryIds: memories.map(memory => memory.id), memoryCount: memories.length, reinforcement, activationTotal: activations,
    activity: activations >= 8 ? "High" : activations >= 3 ? "Moderate" : activations ? "Emerging" : "Quiet", areaParticipation, dominantShare,
    specialization: specialized ? "EMERGING_SPECIALIZATION" : "UNSPECIALIZED", primaryAreaId: specialized ? areaParticipation[0].id : null };
}
