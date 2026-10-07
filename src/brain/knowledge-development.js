const CLUSTER_SIMILARITY = 0.62;
export const KNOWLEDGE_RULES = Object.freeze({ clusterSimilarity: CLUSTER_SIMILARITY, displayedAreas: 8,
  strengthWeight: .45, activationWeight: .25, densityWeight: .2, cohesionWeight: .1,
  activationSaturation: 5, memoryDensitySaturation: 5 });

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

export function deriveKnowledgeDevelopment(memories) {
  const ordered = [...memories].sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || String(left.id).localeCompare(String(right.id)));
  const clusters = [];
  for (const memory of ordered) {
    let selected = null; let best = CLUSTER_SIMILARITY;
    for (const cluster of clusters) {
      const similarity = cosine(memory.embedding, cluster.centroid);
      if (similarity > best) { best = similarity; selected = cluster; }
    }
    if (!selected) {
      selected = { memories: [], centroid: null };
      clusters.push(selected);
    }
    selected.memories.push(memory);
    selected.centroid = averageVector(selected.memories);
  }
  const areas = clusters.map((cluster, index) => {
    const count = cluster.memories.length;
    const averageStrength = cluster.memories.reduce((sum, memory) => sum + bounded(memory.strength || 0), 0) / count;
    const activation = cluster.memories.reduce((sum, memory) => sum + Math.min(memory.activations || 0, KNOWLEDGE_RULES.activationSaturation) / KNOWLEDGE_RULES.activationSaturation, 0) / count;
    const cohesion = cluster.centroid ? cluster.memories.reduce((sum, memory) => sum + Math.max(0, cosine(memory.embedding, cluster.centroid)), 0) / count : 0;
    const progress = bounded(averageStrength * KNOWLEDGE_RULES.strengthWeight + activation * KNOWLEDGE_RULES.activationWeight +
      Math.min(count / KNOWLEDGE_RULES.memoryDensitySaturation, 1) * KNOWLEDGE_RULES.densityWeight + cohesion * KNOWLEDGE_RULES.cohesionWeight);
    return { id: `area-${index + 1}`, label: `Emerging Knowledge ${String(index + 1).padStart(2, "0")}`, progress,
      cohesion, memoryIds: cluster.memories.map(memory => memory.id), memoryCount: count };
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
  return { neuronId, memoryIds: memories.map(memory => memory.id), memoryCount: memories.length, reinforcement,
    activity: activations >= 8 ? "High" : activations >= 3 ? "Active" : activations ? "Emerging" : "Quiet", areaParticipation };
}
