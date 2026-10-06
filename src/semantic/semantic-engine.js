import { loadEquivalenceCandidate, loadPropositionCandidate, loadSemanticModels, SEMANTIC_MODELS } from "./semantic-model.js";
import { evaluateShadowIdentity, selectShadowCandidate } from "./canonical-identity.js";

export const SEMANTIC_RULES = Object.freeze({
  candidateLimit: 3,
  retrievalFloor: 0.42,
  sameMeaningSimilarity: 0.68,
  sameMeaningEntailment: 0.92,
  sameMeaningMargin: 0.72,
  sameMeaningMaximumNeutral: 0.12,
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
const vectorNorm = vector => Math.sqrt([...vector].reduce((sum, value) => sum + value * value, 0));
const identicalVectors = (left, right) => {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  return leftBytes.every((value, index) => value === rightBytes[index]);
};

const probability = (scores, name) => scores[name] ?? scores[`label_${name}`] ?? 0;

function decidePair(similarity, forward, reverse) {
  const forwardEntailment = probability(forward, "entailment");
  const reverseEntailment = probability(reverse, "entailment");
  const entailment = Math.min(forwardEntailment, reverseEntailment);
  const contradiction = Math.max(probability(forward, "contradiction"), probability(reverse, "contradiction"));
  const neutral = Math.max(probability(forward, "neutral"), probability(reverse, "neutral"));
  const forwardMargin = forwardEntailment - Math.max(probability(forward, "neutral"), probability(forward, "contradiction"));
  const reverseMargin = reverseEntailment - Math.max(probability(reverse, "neutral"), probability(reverse, "contradiction"));
  const mutualMargin = Math.min(forwardMargin, reverseMargin);
  let relation = "DISTINCT";
  if (contradiction >= SEMANTIC_RULES.conflictProbability) relation = "CONFLICTING";
  else if (similarity >= SEMANTIC_RULES.sameMeaningSimilarity && entailment >= SEMANTIC_RULES.sameMeaningEntailment &&
    mutualMargin >= SEMANTIC_RULES.sameMeaningMargin && neutral <= SEMANTIC_RULES.sameMeaningMaximumNeutral) relation = "SAME_MEANING";
  else if (similarity >= SEMANTIC_RULES.relatedSimilarity || entailment >= SEMANTIC_RULES.relatedEntailment) relation = "RELATED";
  const reason = relation === "CONFLICTING" ? "bidirectional NLI contradiction evidence" :
    relation === "SAME_MEANING" ? "high semantic proximity with decisive mutual entailment" :
      relation === "RELATED" ? "semantic proximity without sufficient equivalence evidence" : "insufficient semantic proximity";
  return { relation, reason, confidence: relation === "CONFLICTING" ? contradiction : relation === "SAME_MEANING" ? Math.min(similarity, entailment, mutualMargin) : relation === "RELATED" ? Math.max(similarity, entailment) : 1 - Math.max(similarity, entailment), similarity, mutualEntailment: entailment, mutualMargin, maximumNeutral: neutral };
}

export class SemanticEngine {
  #loader; #equivalenceLoader; #propositionLoader; #models; #readyPromise; #equivalencePromise; #propositionPromise; #status = "idle"; #diagnosticTracing = false; #lastProductionTrace = null;
  constructor(loader = loadSemanticModels, equivalenceLoader = loadEquivalenceCandidate, propositionLoader = loadPropositionCandidate) { this.#loader = loader; this.#equivalenceLoader = equivalenceLoader; this.#propositionLoader = propositionLoader; }
  get status() { return this.#status; }
  get modelInfo() { return SEMANTIC_MODELS; }
  get runtimeInfo() { return this.#models ? { backend: this.#models.backend, encoder: SEMANTIC_MODELS.encoder, pairClassifier: SEMANTIC_MODELS.pairClassifier } : null; }
  enableDiagnosticTracing() { this.#diagnosticTracing = true; }
  get lastProductionTrace() { return this.#lastProductionTrace ? structuredClone(this.#lastProductionTrace) : null; }
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
    return decidePair(similarity, forward, reverse);
  }
  async diagnosePair(left, right) {
    const [leftEmbedding, rightEmbedding] = await Promise.all([this.encode(left), this.encode(right)]);
    const cosine = cosineSimilarity(leftEmbedding, rightEmbedding);
    const [forward, reverse] = await Promise.all([this.#models.classify(left, right), this.#models.classify(right, left)]);
    return { left, right, cosine, forward, reverse, ...decidePair(cosine, forward, reverse) };
  }
  async inspectEmbeddings(left, right, previewLength = 12) {
    const [leftEmbedding, rightEmbedding] = await Promise.all([this.encode(left), this.encode(right)]);
    return {
      left: { dimensions: leftEmbedding.length, norm: vectorNorm(leftEmbedding), preview: [...leftEmbedding.slice(0, previewLength)] },
      right: { dimensions: rightEmbedding.length, norm: vectorNorm(rightEmbedding), preview: [...rightEmbedding.slice(0, previewLength)] },
      identical: identicalVectors(leftEmbedding, rightEmbedding),
      sameBuffer: leftEmbedding.buffer === rightEmbedding.buffer,
      cosine: cosineSimilarity(leftEmbedding, rightEmbedding)
    };
  }
  async inspectEquivalence(left, right) {
    this.#equivalencePromise ||= this.#equivalenceLoader();
    const encode = await this.#equivalencePromise;
    const leftEmbedding = await encode(left);
    const rightEmbedding = await encode(right);
    return { model: SEMANTIC_MODELS.equivalenceCandidate, score: cosineSimilarity(leftEmbedding, rightEmbedding), dimensions: leftEmbedding.length, label: "CANDIDATE_SCORE_ONLY", canonicalAuthority: false };
  }
  async diagnoseWithEquivalence(left, right) {
    const semantic = await this.diagnosePair(left, right);
    const equivalence = await this.inspectEquivalence(left, right);
    const proposition = await this.inspectPropositionEquivalence(left, right);
    return { ...semantic, retrievalEligible: semantic.cosine >= SEMANTIC_RULES.retrievalFloor, nli: { forward: semantic.forward, reverse: semantic.reverse }, equivalence, proposition };
  }
  async inspectPropositionEquivalence(left, right) {
    this.#propositionPromise ||= this.#propositionLoader();
    const compare = await this.#propositionPromise;
    const output = await compare(left, right);
    return { model: SEMANTIC_MODELS.propositionCandidate, label: "STS_SIMILARITY_REGRESSION", rawLogit: output.rawLogit, score: output.score, stsbScore: output.score * 5, canonicalAuthority: false };
  }
  async inspectSemanticIdentity(left, right) {
    const evidence = await this.diagnoseWithEquivalence(left, right);
    const identityEvidence = {
      left, right,
      retrieval: { cosine: evidence.cosine, eligible: evidence.retrievalEligible, floor: SEMANTIC_RULES.retrievalFloor },
      nli: {
        forward: evidence.forward,
        reverse: evidence.reverse,
        mutualEntailment: evidence.mutualEntailment,
        mutualMargin: evidence.mutualMargin,
        maximumNeutral: evidence.maximumNeutral,
        maximumContradiction: Math.max(evidence.forward.contradiction, evidence.reverse.contradiction)
      },
      paraphrase: evidence.equivalence,
      stsb: evidence.proposition,
      currentCanonicalRelation: evidence.relation,
      currentDecisionReason: evidence.reason,
      canonicalAuthority: false
    };
    return { ...identityEvidence, shadow: evaluateShadowIdentity(identityEvidence) };
  }
  async inspectCandidateIdentities(input, memories) {
    const embedding = await this.encode(input);
    const candidates = this.retrieveCandidates(embedding, memories);
    const evaluated = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const evidence = await this.inspectSemanticIdentity(input, candidate.memory.content);
      evaluated.push({ rank: index + 1, memoryId: candidate.memory.id, canonicalContent: candidate.memory.content,
        retrieval: { cosine: candidate.similarity, eligible: true }, productionDecision: evidence.currentCanonicalRelation,
        productionDecisionReason: evidence.currentDecisionReason, shadow: evidence.shadow, canonicalAuthority: false });
    }
    const selected = selectShadowCandidate(evaluated);
    return { input, candidates: evaluated, shadowSelection: selected ? { memoryId: selected.memoryId, rank: selected.rank } : null, canonicalAuthority: false };
  }
  async evaluate(content, memories) {
    const embedding = await this.encode(content);
    const exact = memories.find(memory => normalizedExact(memory.content) === normalizedExact(content));
    if (exact) {
      if (this.#diagnosticTracing) this.#lastProductionTrace = { input: content, selectedMemoryId: exact.id, selectedCanonicalContent: exact.content, productionDecision: "SAME_MEANING", productionDecisionReason: "exact normalized duplicate", candidates: [], canonicalAuthority: false };
      return { embedding, match: exact, relation: "SAME_MEANING", confidence: 1, related: [] };
    }
    // Legacy records are embedded lazily on the first comparison. Startup stays
    // responsive, while the first decision still considers every prior memory.
    for (const memory of memories) if (!memory.embedding) memory.embedding = await this.encode(memory.content);
    const candidates = this.retrieveCandidates(embedding, memories);
    const decisions = [];
    for (const candidate of candidates) decisions.push({ ...await this.comparePair(content, candidate.memory, candidate.similarity), memory: candidate.memory });
    const match = decisions.find(decision => decision.relation === "SAME_MEANING");
    if (this.#diagnosticTracing) this.#lastProductionTrace = {
      input: content, selectedMemoryId: match?.memory.id || null, selectedCanonicalContent: match?.memory.content || null,
      productionDecision: match ? "SAME_MEANING" : decisions[0]?.relation || "DISTINCT",
      productionDecisionReason: match?.reason || decisions[0]?.reason || "no retrieved candidate",
      candidates: decisions.map((decision, index) => ({ rank: index + 1, memoryId: decision.memory.id, canonicalContent: decision.memory.content, retrievalScore: decision.similarity, productionDecision: decision.relation, productionDecisionReason: decision.reason })),
      canonicalAuthority: false
    };
    return { embedding, match: match?.memory || null, relation: match ? "SAME_MEANING" : decisions[0]?.relation || "DISTINCT", confidence: match?.confidence || decisions[0]?.confidence || 0, related: decisions.filter(decision => ["RELATED", "CONFLICTING"].includes(decision.relation)) };
  }
}
