// Model-evidence confidence bands. They describe confidence, not language.
// Diagnostics keep authority false; production opts in explicitly after retrieval.
export const SHADOW_IDENTITY_BANDS = Object.freeze({
  strongEntailment: 0.90,
  strongMargin: 0.75,
  maximumContradiction: 0.05,
  maximumNeutral: 0.18,
  strongContradiction: 0.90,
  asymmetricGap: 0.20
});

const score = (distribution, label) => distribution?.[label] ?? 0;

export function evaluateShadowIdentity(evidence) {
  const forwardEntailment = score(evidence.nli.forward, "entailment");
  const reverseEntailment = score(evidence.nli.reverse, "entailment");
  const mutualEntailment = Math.min(forwardEntailment, reverseEntailment);
  const asymmetry = Math.abs(forwardEntailment - reverseEntailment);
  const contradiction = Math.max(score(evidence.nli.forward, "contradiction"), score(evidence.nli.reverse, "contradiction"));
  const neutral = Math.max(score(evidence.nli.forward, "neutral"), score(evidence.nli.reverse, "neutral"));
  const forwardMargin = forwardEntailment - Math.max(score(evidence.nli.forward, "neutral"), score(evidence.nli.forward, "contradiction"));
  const reverseMargin = reverseEntailment - Math.max(score(evidence.nli.reverse, "neutral"), score(evidence.nli.reverse, "contradiction"));
  const mutualMargin = Math.min(forwardMargin, reverseMargin);
  const similaritySupport = evidence.paraphrase?.score >= 0.75 || evidence.stsb?.score >= 0.75;
  const reasons = [];
  let identity = "UNCERTAIN";

  if (contradiction >= SHADOW_IDENTITY_BANDS.strongContradiction) {
    identity = "NOT_SAME";
    reasons.push("STRONG_CONTRADICTION");
  } else if (asymmetry >= SHADOW_IDENTITY_BANDS.asymmetricGap) {
    identity = "NOT_SAME";
    reasons.push("ASYMMETRIC_ENTAILMENT");
  } else if (mutualEntailment >= SHADOW_IDENTITY_BANDS.strongEntailment &&
    mutualMargin >= SHADOW_IDENTITY_BANDS.strongMargin &&
    contradiction <= SHADOW_IDENTITY_BANDS.maximumContradiction &&
    neutral <= SHADOW_IDENTITY_BANDS.maximumNeutral && similaritySupport) {
    identity = "SAME";
    reasons.push("STRONG_MUTUAL_ENTAILMENT");
  } else {
    reasons.push(neutral > SHADOW_IDENTITY_BANDS.maximumNeutral ? "HIGH_NEUTRALITY" : "INSUFFICIENT_IDENTITY_EVIDENCE");
  }

  if (similaritySupport) reasons.push("SIMILARITY_SUPPORT");
  else if (mutualEntailment >= SHADOW_IDENTITY_BANDS.strongEntailment) reasons.push("EVIDENCE_DISAGREEMENT");
  if (identity === "SAME" && evidence.currentCanonicalRelation !== "SAME_MEANING") reasons.push("PRODUCTION_DISAGREEMENT");
  return {
    identity,
    evidence: { mutualEntailment, mutualMargin, asymmetry, maximumNeutral: neutral, maximumContradiction: contradiction },
    reasons,
    relationship: { decision: "UNRESOLVED", reason: "IDENTITY_EVIDENCE_DOES_NOT_ASSIGN_RELATIONSHIPS" },
    canonicalAuthority: false
  };
}

export function selectShadowCandidate(candidates) {
  const same = candidates.filter(candidate => candidate.shadow.identity === "SAME");
  if (!same.length) return null;
  return [...same].sort((left, right) =>
    right.shadow.evidence.mutualEntailment - left.shadow.evidence.mutualEntailment ||
    right.retrieval.cosine - left.retrieval.cosine || left.rank - right.rank)[0];
}

export function analyzeIdentityTriangle(edges) {
  const identities = edges.map(edge => edge.shadow.identity);
  const status = identities.every(value => value === "SAME") ? "CONSISTENT_SAME_CLUSTER" :
    identities.every(value => value === "NOT_SAME") ? "CONSISTENT_SEPARATE" :
      identities.includes("UNCERTAIN") ? "UNCERTAIN" : "INCONSISTENT";
  return { status, edges, canonicalAuthority: false };
}
