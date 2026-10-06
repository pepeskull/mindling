import { loadSemanticModels, SEMANTIC_MODELS } from "./semantic-model.js";

export const SEMANTIC_RULES = Object.freeze({
  candidateLimit: 3,
  retrievalFloor: 0.42,
  sameMeaningSimilarity: 0.62,
  sameMeaningEntailment: 0.78,
  relatedSimilarity: 0.52,
  relatedEntailment: 0.42,
  conflictProbability: 0.62,
  maximumVariants: 5,
  maximumRelations: 5
});

const normalizedExact = value => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
export const cosineSimilarity = (left, right) => {
  if (!left?.length || left.length !== right?.length) return -1;
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2; }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
};

const probability = (scores, name) => scores[name] ?? scores[`label_${name}`] ?? 0;

export class SemanticEngine {
  #loader; #models; #readyPromise; #status = "idle";
  constructor(loader = loadSemanticModels) { this.#loader = loader; }
  get status() { return this.#status; }
  get modelInfo() { return SEMANTIC_MODELS; }
  initialize() {
    if (!this.#readyPromise) {
      this.#status = "loading";
      this.#readyPromise = this.#loader().then(models => { this.#models = models; this.#status = "ready"; return this; })
        .catch(error => { this.#status = "unavailable"; throw error; });
    }
    return this.#readyPromise;
  }
  async encode(text) { await this.initialize(); return this.#models.encode(text); }
  retrieveCandidates(embedding, memories, limit = SEMANTIC_RULES.candidateLimit) {
    return memories.filter(memory => memory.embedding?.length === embedding.length)
      .map(memory => ({ memory, similarity: cosineSimilarity(embedding, memory.embedding) }))
      .filter(candidate => candidate.similarity >= SEMANTIC_RULES.retrievalFloor)
      .sort((left, right) => right.similarity - left.similarity).slice(0, limit);
  }
  async comparePair(input, memory, similarity) {
    if (normalizedExact(input) === normalizedExact(memory.content)) return { relation: "SAME_MEANING", confidence: 1, similarity };
    const [forward, reverse] = await Promise.all([this.#models.classify(input, memory.content), this.#models.classify(memory.content, input)]);
    const entailment = Math.min(probability(forward, "entailment"), probability(reverse, "entailment"));
    const contradiction = Math.max(probability(forward, "contradiction"), probability(reverse, "contradiction"));
    if (contradiction >= SEMANTIC_RULES.conflictProbability) return { relation: "CONFLICTING", confidence: contradiction, similarity };
    if (similarity >= SEMANTIC_RULES.sameMeaningSimilarity && entailment >= SEMANTIC_RULES.sameMeaningEntailment) return { relation: "SAME_MEANING", confidence: Math.min(similarity, entailment), similarity };
    if (similarity >= SEMANTIC_RULES.relatedSimilarity || entailment >= SEMANTIC_RULES.relatedEntailment) return { relation: "RELATED", confidence: Math.max(similarity, entailment), similarity };
    return { relation: "DISTINCT", confidence: 1 - Math.max(similarity, entailment), similarity };
  }
  async evaluate(content, memories) {
    const embedding = await this.encode(content);
    const exact = memories.find(memory => normalizedExact(memory.content) === normalizedExact(content));
    if (exact) return { embedding, match: exact, relation: "SAME_MEANING", confidence: 1, related: [] };
    // Legacy records are embedded lazily on the first comparison. Startup stays
    // responsive, while the first decision still considers every prior memory.
    for (const memory of memories) if (!memory.embedding) memory.embedding = await this.encode(memory.content);
    const candidates = this.retrieveCandidates(embedding, memories);
    const decisions = [];
    for (const candidate of candidates) decisions.push({ ...await this.comparePair(content, candidate.memory, candidate.similarity), memory: candidate.memory });
    const match = decisions.find(decision => decision.relation === "SAME_MEANING");
    return { embedding, match: match?.memory || null, relation: match ? "SAME_MEANING" : decisions[0]?.relation || "DISTINCT", confidence: match?.confidence || decisions[0]?.confidence || 0, related: decisions.filter(decision => ["RELATED", "CONFLICTING"].includes(decision.relation)) };
  }
}
