export const MEMORY_RULES = Object.freeze({
  similarityThreshold: 0.68,
  formationThreshold: 0.58,
  initialStrength: 0.32,
  reinforcementRate: 0.24,
  maximumStrength: 1,
  weights: Object.freeze({ teaching: 0.48, quality: 0.3, novelty: 0.14, pathway: 0.08 })
});

export const normalizeContent = value => value
  .normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

const tokensFor = value => normalizeContent(value).split(" ").filter(Boolean);

export function tokenSimilarity(left, right) {
  const a = new Set(tokensFor(left)); const b = new Set(tokensFor(right));
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const token of a) if (b.has(token)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

function inputQuality(tokens, normalized) {
  if (tokens.length < 2 || normalized.length < 8) return 0.05;
  const uniqueRatio = new Set(tokens).size / tokens.length;
  const lengthSignal = Math.min(1, normalized.length / 48);
  const tokenSignal = Math.min(1, tokens.length / 7);
  return Math.min(1, uniqueRatio * 0.4 + lengthSignal * 0.3 + tokenSignal * 0.3);
}

export function evaluateMemory({ content, mode, memories, pathways }) {
  const normalizedContent = normalizeContent(content);
  const tokens = tokensFor(normalizedContent);
  const matches = memories.map(memory => ({ memory, similarity: tokenSimilarity(normalizedContent, memory.normalizedContent) })).sort((a, b) => b.similarity - a.similarity);
  const closest = matches[0];
  if (closest?.similarity >= MEMORY_RULES.similarityThreshold) return { outcome: "REINFORCEMENT", normalizedContent, existing: closest.memory, similarity: closest.similarity };
  const pathwayIds = pathways.filter(pathway => {
    const pathwayTokens = tokensFor(typeof pathway === "string" ? pathway : pathway.name);
    return pathwayTokens.some(token => tokens.includes(token));
  }).map(pathway => typeof pathway === "string" ? pathway : pathway.id);
  const quality = inputQuality(tokens, normalizedContent);
  const novelty = closest ? 1 - closest.similarity : 1;
  const potential = Math.min(1,
    (mode === "TEACH" ? MEMORY_RULES.weights.teaching : 0) +
    quality * MEMORY_RULES.weights.quality + novelty * MEMORY_RULES.weights.novelty +
    (pathwayIds.length ? MEMORY_RULES.weights.pathway : 0)
  );
  return { outcome: potential >= MEMORY_RULES.formationThreshold ? "MEMORY_FORMATION" : "STIMULATION", normalizedContent, pathwayIds, potential };
}

export function reinforcedStrength(current) {
  return Math.min(MEMORY_RULES.maximumStrength, current + (MEMORY_RULES.maximumStrength - current) * MEMORY_RULES.reinforcementRate);
}
