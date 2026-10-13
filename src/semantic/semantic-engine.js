import { loadEquivalenceCandidate, loadPropositionCandidate, loadSemanticModels, SEMANTIC_MODELS } from "./semantic-model.js";
import { evaluateShadowIdentity } from "./canonical-identity.js";

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
  #loader; #equivalenceLoader; #propositionLoader; #models; #readyPromise; #equivalencePromise; #propositionPromise; #status = "idle";
  constructor(loader = loadSemanticModels, equivalenceLoader = loadEquivalenceCandidate, propositionLoader = loadPropositionCandidate) { this.#loader = loader; this.#equivalenceLoader = equivalenceLoader; this.#propositionLoader = propositionLoader; }
  get status() { return this.#status; }
  get modelInfo() { return SEMANTIC_MODELS; }
  initialize() {
    if (!this.#readyPromise) { this.#status = "loading"; this.#readyPromise = this.#loader().then(models => { this.#models = models; this.#status = "ready"; return this; }).catch(error => { this.#status = "unavailable"; throw error; }); }
    return this.#readyPromise;
  }
  async encode(text) { await this.initialize(); return this.#models.encode(text); }
  retrieveCandidates(embedding, memories, limit = SEMANTIC_RULES.candidateLimit) { return memories.filter(memory => memory.embedding?.length === embedding.length).map(memory => ({ memory, similarity: cosineSimilarity(embedding, memory.embedding) })).filter(candidate => candidate.similarity >= SEMANTIC_RULES.retrievalFloor).sort((a,b) => b.similarity-a.similarity).slice(0,limit); }
  async diagnosePair(left, right) { const [a,b] = await Promise.all([this.encode(left),this.encode(right)]); const similarity=cosineSimilarity(a,b); const [forward,reverse]=await Promise.all([this.#models.classify(left,right),this.#models.classify(right,left)]); return { left,right,...decidePair(similarity,forward,reverse),forward,reverse }; }
  async inspectEquivalence(left,right) { this.#equivalencePromise ||= this.#equivalenceLoader(); const encode=await this.#equivalencePromise; const [a,b]=await Promise.all([encode(left),encode(right)]); return { score:cosineSimilarity(a,b) }; }
  async inspectPropositionEquivalence(left,right) { this.#propositionPromise ||= this.#propositionLoader(); return (await this.#propositionPromise)(left,right); }
  async inspectSemanticIdentity(left,right,canonicalAuthority=false) { const [base,paraphrase,stsb]=await Promise.all([this.diagnosePair(left,right),this.inspectEquivalence(left,right),this.inspectPropositionEquivalence(left,right)]); const evidence={left,right,retrieval:{cosine:base.similarity,eligible:base.similarity>=SEMANTIC_RULES.retrievalFloor},nli:{forward:base.forward,reverse:base.reverse,mutualEntailment:base.mutualEntailment,mutualMargin:base.mutualMargin,maximumNeutral:base.maximumNeutral,maximumContradiction:Math.max(base.forward.contradiction,base.reverse.contradiction)},paraphrase:{score:paraphrase.score},stsb:{score:stsb.score},currentCanonicalRelation:base.relation,currentDecisionReason:base.reason,canonicalAuthority}; return {...evidence,shadow:{...evaluateShadowIdentity(evidence),canonicalAuthority}}; }
  async evaluate(content, memories) {
    const embedding = await this.encode(content);
    const exact = memories.find(memory => normalizedExact(memory.content) === normalizedExact(content));
    if (exact) {
      return { embedding, match: exact, relation: "SAME_MEANING", confidence: 1, related: [] };
    }
    // Legacy records are embedded lazily on the first comparison. Startup stays
    // responsive, while the first decision still considers every prior memory.
    for (const memory of memories) if (!memory.embedding) memory.embedding = await this.encode(memory.content);
    const candidates = this.retrieveCandidates(embedding, memories);
    const decisions = [];
    for (const candidate of candidates) {
      const representatives = [candidate.memory.content, ...(candidate.memory.matchedVariants || []).slice(-1)];
      const evidence = [];
      for (const representative of [...new Set(representatives)]) evidence.push(await this.inspectSemanticIdentity(content, representative, true));
      const sameCluster = evidence.length && evidence.every(item => item.shadow.identity === "SAME");
      const strongest = [...evidence].sort((left, right) => right.shadow.evidence.mutualEntailment - left.shadow.evidence.mutualEntailment)[0];
      decisions.push({ relation: sameCluster ? "SAME_MEANING" : "RELATED", reason: sameCluster ? "shadow identity agrees across bounded representatives" : "identity uncertain or not same",
        confidence: strongest?.shadow.evidence.mutualEntailment || 0, similarity: candidate.similarity, memory: candidate.memory, identityEvidence: evidence });
    }
    const match = decisions.filter(decision => decision.relation === "SAME_MEANING").sort((left, right) => right.confidence - left.confidence || right.similarity - left.similarity)[0];
    return { embedding, match: match?.memory || null, relation: match ? "SAME_MEANING" : decisions[0]?.relation || "DISTINCT", confidence: match?.confidence || decisions[0]?.confidence || 0, related: decisions.filter(decision => decision.relation === "RELATED") };
  }
}
