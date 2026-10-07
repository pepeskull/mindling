const CLUSTER_SIMILARITY = 0.62;
export const KNOWLEDGE_RULES = Object.freeze({ clusterSimilarity: CLUSTER_SIMILARITY, representativeSimilarity: .48, maximumRepresentatives: 3, displayedAreas: 8,
  strengthWeight: .45, activationWeight: .25, densityWeight: .2, cohesionWeight: .1,
  activationSaturation: 5, memoryDensitySaturation: 5, specializationMinimumMemories: 3, specializationMinimumShare: .6 });

const cosine = (left, right) => {
  if (!left?.length || left.length !== right?.length) return -1;
  let dot = 0; let a = 0; let b = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; a += left[index] ** 2; b += right[index] ** 2; }
  return dot / (Math.sqrt(a) * Math.sqrt(b) || 1);
};
const averageVector = memories => {
  const vectors = memories.map(memory => memory.embedding).filter(Boolean);
  if (!vectors.length) return null;
  const centroid = new Float32Array(vectors[0].length);
  for (const vector of vectors) for (let index = 0; index < centroid.length; index += 1) centroid[index] += vector[index] / vectors.length;
  return centroid;
};
const bounded = value => Math.max(0, Math.min(1, value));
const stableHash = values => values.reduce((hash, value) => [...value].reduce((current, character) => (current * 31 + character.codePointAt(0)) >>> 0, hash), 2166136261).toString(16).padStart(8, "0");
const tokens = memory => String(memory.normalizedContent || memory.content || "").normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

const representativesFor = memories => {
  if (memories.length <= KNOWLEDGE_RULES.maximumRepresentatives) return memories;
  const centroid = averageVector(memories);
  const ranked = [...memories].sort((left, right) => cosine(left.embedding, centroid) - cosine(right.embedding, centroid) || String(left.id).localeCompare(String(right.id)));
  const selected = [ranked[0]];
  while (selected.length < KNOWLEDGE_RULES.maximumRepresentatives) {
    const remaining = ranked.filter(memory => !selected.includes(memory));
    remaining.sort((left, right) => Math.min(...selected.map(item => cosine(left.embedding, item.embedding))) - Math.min(...selected.map(item => cosine(right.embedding, item.embedding))) || String(left.id).localeCompare(String(right.id)));
    selected.push(remaining[0]);
  }
  return selected;
};

const displayIdentity = (cluster, allMemories, fallbackIndex) => {
  const globalFrequency = new Map();
  for (const memory of allMemories) for (const token of new Set(tokens(memory))) globalFrequency.set(token, (globalFrequency.get(token) || 0) + 1);
  const areaFrequency = new Map(); const firstSeen = new Map(); let sequence = 0;
  for (const memory of cluster.memories) for (const token of new Set(tokens(memory))) {
    areaFrequency.set(token, (areaFrequency.get(token) || 0) + 1);
    if (!firstSeen.has(token)) firstSeen.set(token, sequence++);
  }
  const ranked = [...areaFrequency].map(([token, frequency]) => ({ token, score: frequency * Math.log((allMemories.length + 1) / ((globalFrequency.get(token) || 0) + 1)), frequency }))
    .sort((left, right) => right.score - left.score || right.frequency - left.frequency || right.token.length - left.token.length || firstSeen.get(left.token) - firstSeen.get(right.token));
  const chosen = ranked.slice(0, 3).map(item => item.token.charAt(0).toLocaleUpperCase() + item.token.slice(1));
  return chosen.length ? chosen.join(" · ") : `Emerging Knowledge ${String(fallbackIndex + 1).padStart(2, "0")}`;
};

export function deriveKnowledgeDevelopment(memories) {
  const ordered = [...memories].sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || String(left.id).localeCompare(String(right.id)));
  const clusters = [];
  for (const memory of ordered) {
    let selected = null; let best = CLUSTER_SIMILARITY;
    for (const cluster of clusters) {
      const similarity = cosine(memory.embedding, cluster.centroid);
      const representativeAgreement = cluster.representatives.every(representative => cosine(memory.embedding, representative.embedding) >= KNOWLEDGE_RULES.representativeSimilarity);
      if (representativeAgreement && similarity > best) { best = similarity; selected = cluster; }
    }
    if (!selected) {
      selected = { memories: [], centroid: null, representatives: [] };
      clusters.push(selected);
    }
    selected.memories.push(memory);
    selected.centroid = averageVector(selected.memories);
    selected.representatives = representativesFor(selected.memories);
  }
  const areas = clusters.map((cluster, index) => {
    const count = cluster.memories.length;
    const averageStrength = cluster.memories.reduce((sum, memory) => sum + bounded(memory.strength || 0), 0) / count;
    const activation = cluster.memories.reduce((sum, memory) => sum + Math.min(memory.activations || 0, KNOWLEDGE_RULES.activationSaturation) / KNOWLEDGE_RULES.activationSaturation, 0) / count;
    const cohesion = cluster.centroid ? cluster.memories.reduce((sum, memory) => sum + Math.max(0, cosine(memory.embedding, cluster.centroid)), 0) / count : 0;
    const progress = bounded(averageStrength * KNOWLEDGE_RULES.strengthWeight + activation * KNOWLEDGE_RULES.activationWeight +
      Math.min(count / KNOWLEDGE_RULES.memoryDensitySaturation, 1) * KNOWLEDGE_RULES.densityWeight + cohesion * KNOWLEDGE_RULES.cohesionWeight);
    const memoryIds = cluster.memories.map(memory => memory.id).sort();
    const neuronIds = [...new Set(cluster.memories.flatMap(memory => memory.neuronIds || []))].sort();
    const synapseIds = [...new Set(cluster.memories.flatMap(memory => memory.synapseIds || []))].sort();
    const centroidMetadata = cluster.centroid ? { dimensions: cluster.centroid.length, norm: Math.sqrt([...cluster.centroid].reduce((sum, value) => sum + value ** 2, 0)) } : { dimensions: 0, norm: 0 };
    return { id: `area-${stableHash(memoryIds)}`, label: displayIdentity(cluster, ordered, index), progress,
      cohesion, centroid: centroidMetadata, memoryIds, memoryCount: count, representativeMemoryIds: cluster.representatives.map(memory => memory.id).sort(), neuronIds, synapseIds };
  });
  const total = memories.length;
  const overall = total ? areas.reduce((sum, area) => sum + area.progress * area.memoryCount, 0) / total : 0;
  return { overall, areas, canonicalMemoryCount: total };
}

export function deriveNeuronParticipation(state, neuronId, development = deriveKnowledgeDevelopment(state.memories)) {
  const memories = state.memories.filter(memory => (memory.neuronIds || []).includes(neuronId));
  const areaParticipation = development.areas.map(area => {
    const participating = memories.filter(memory => area.memoryIds.includes(memory.id));
    return { id: area.id, label: area.label, memoryCount: participating.length,
      share: memories.length ? participating.length / memories.length : 0 };
  }).filter(area => area.memoryCount).sort((left, right) => right.share - left.share || left.id.localeCompare(right.id));
  const reinforcement = memories.length ? memories.reduce((sum, memory) => sum + (memory.strength || 0), 0) / memories.length : 0;
  const activations = memories.reduce((sum, memory) => sum + (memory.activations || 0), 0);
  const dominantShare = areaParticipation[0]?.share || 0;
  const specialized = memories.length >= KNOWLEDGE_RULES.specializationMinimumMemories && dominantShare >= KNOWLEDGE_RULES.specializationMinimumShare;
  return { neuronId, memoryIds: memories.map(memory => memory.id), memoryCount: memories.length, reinforcement,
    activationTotal: activations, activity: activations >= 8 ? "High" : activations >= 3 ? "Moderate" : activations ? "Emerging" : "Quiet",
    areaParticipation, dominantShare, specialization: specialized ? "EMERGING_SPECIALIZATION" : "UNSPECIALIZED", primaryAreaId: specialized ? areaParticipation[0].id : null };
}
