// Knowledge Area 2.0 contracts are shadow-only. Nothing in the production
// Teach, clustering, routing, or rendering paths imports this module.
export const TOPIC_HYPOTHESIS_STATUS = Object.freeze({
  PROVISIONAL: "PROVISIONAL",
  VERIFIED: "VERIFIED",
  INVALIDATED: "INVALIDATED"
});

export const TOPIC_RELATION = Object.freeze({
  SAME_AREA: "SAME_AREA",
  DIFFERENT_AREA: "DIFFERENT_AREA",
  UNCERTAIN: "UNCERTAIN"
});

export const KNOWLEDGE_AREA_2_LIMITS = Object.freeze({
  maximumCandidateAreas: 4,
  maximumRepresentativesPerArea: 3,
  maximumBoundaryChecks: 12
});

const stableHash = values => values.reduce((hash, value) => [...String(value)].reduce(
  (current, character) => (current * 31 + character.codePointAt(0)) >>> 0,
  hash
), 2166136261).toString(16).padStart(8, "0");

const orderedIds = values => [...new Set(values.map(String))].sort();
const pairKey = (left, right) => orderedIds([left, right]).join("\u0000");

export function createProvisionalTopic(memory) {
  if (!memory?.id) throw new TypeError("A canonical memory ID is required");
  const memoryIds = [String(memory.id)];
  const id = `topic-shadow-${stableHash(memoryIds)}`;
  return Object.freeze({
    id,
    status: TOPIC_HYPOTHESIS_STATUS.PROVISIONAL,
    displayLabel: `Emerging Knowledge ${id.slice(-4).toUpperCase()}`,
    labelSource: "NEUTRAL_PROVISIONAL",
    subject: null,
    facets: Object.freeze([]),
    representativeMemoryIds: Object.freeze(memoryIds),
    sourceMemoryIds: Object.freeze(memoryIds),
    discoveryEvidence: null,
    discoveryAuthority: false,
    canonicalAuthority: false
  });
}

export function createTopicHypothesis({ memoryIds, subject = null, facets = [], label = null, evidence = null, provider = null }) {
  const sourceMemoryIds = orderedIds(memoryIds || []);
  if (!sourceMemoryIds.length) throw new TypeError("A topic hypothesis requires canonical memory IDs");
  const id = `topic-shadow-${stableHash(sourceMemoryIds)}`;
  return Object.freeze({
    id,
    status: TOPIC_HYPOTHESIS_STATUS.PROVISIONAL,
    displayLabel: label || `Emerging Knowledge ${id.slice(-4).toUpperCase()}`,
    labelSource: label ? "UNVERIFIED_DISCOVERY_HYPOTHESIS" : "NEUTRAL_PROVISIONAL",
    subject,
    facets: Object.freeze([...facets]),
    representativeMemoryIds: Object.freeze(sourceMemoryIds.slice(0, KNOWLEDGE_AREA_2_LIMITS.maximumRepresentativesPerArea)),
    sourceMemoryIds: Object.freeze(sourceMemoryIds),
    discoveryEvidence: evidence ? structuredClone(evidence) : null,
    discoveryProvider: provider,
    discoveryAuthority: false,
    canonicalAuthority: false
  });
}

export function createTopicVerification({ leftId, rightId, decision, evidence = null, verifier = null }) {
  if (!Object.values(TOPIC_RELATION).includes(decision)) throw new TypeError(`Unknown topic relation: ${decision}`);
  if (!leftId || !rightId || String(leftId) === String(rightId)) throw new TypeError("Two distinct IDs are required");
  return Object.freeze({
    pairId: pairKey(leftId, rightId),
    leftId: String(leftId),
    rightId: String(rightId),
    decision,
    status: decision === TOPIC_RELATION.UNCERTAIN ? "UNCERTAIN" : "SHADOW_EVIDENCE",
    evidence: evidence ? structuredClone(evidence) : null,
    verifier,
    labelUsedAsEvidence: false,
    mergeAuthorized: false,
    productionAuthority: false,
    canonicalAuthority: false
  });
}

export function evaluateShadowBoundary(leftMemoryIds, rightMemoryIds, verifications) {
  const index = new Map(verifications.map(item => [item.pairId, item]));
  const checks = [];
  for (const leftId of orderedIds(leftMemoryIds)) {
    for (const rightId of orderedIds(rightMemoryIds)) {
      if (checks.length >= KNOWLEDGE_AREA_2_LIMITS.maximumBoundaryChecks) return Object.freeze({
        decision: TOPIC_RELATION.UNCERTAIN,
        reason: "BOUND_EXCEEDED",
        checks: Object.freeze(checks),
        mergeAuthorized: false,
        productionAuthority: false
      });
      const assessment = index.get(pairKey(leftId, rightId));
      checks.push(Object.freeze({ leftId, rightId, decision: assessment?.decision || TOPIC_RELATION.UNCERTAIN }));
    }
  }
  const decisions = checks.map(item => item.decision);
  const decision = decisions.length && decisions.every(item => item === TOPIC_RELATION.SAME_AREA)
    ? TOPIC_RELATION.SAME_AREA
    : decisions.some(item => item === TOPIC_RELATION.DIFFERENT_AREA)
      ? TOPIC_RELATION.DIFFERENT_AREA
      : TOPIC_RELATION.UNCERTAIN;
  return Object.freeze({
    decision,
    reason: decision === TOPIC_RELATION.SAME_AREA ? "COMPLETE_SHADOW_BOUNDARY_AGREEMENT"
      : decision === TOPIC_RELATION.DIFFERENT_AREA ? "EXPLICIT_DIFFERENT_AREA_EVIDENCE" : "MISSING_OR_UNCERTAIN_EVIDENCE",
    checks: Object.freeze(checks),
    mergeAuthorized: false,
    productionAuthority: false
  });
}

export function buildKnowledgeAreaInspection({ topic, memories, memberships = [] }) {
  const memoryById = new Map(memories.map(memory => [String(memory.id), memory]));
  const membershipById = new Map(memberships.map(item => [String(item.memoryId), item]));
  const sourceMemoryIds = orderedIds(topic.sourceMemoryIds || []);
  return Object.freeze({
    id: topic.id,
    displayLabel: topic.displayLabel,
    status: topic.status,
    provisional: topic.status !== TOPIC_HYPOTHESIS_STATUS.VERIFIED,
    canonicalMemoryCount: sourceMemoryIds.length,
    memories: Object.freeze(sourceMemoryIds.map(memoryId => {
      const memory = memoryById.get(memoryId);
      if (!memory) return Object.freeze({ memoryId, missing: true, membershipStatus: "UNRESOLVED" });
      const membership = membershipById.get(memoryId);
      return Object.freeze({
        memoryId,
        content: memory.content,
        strength: memory.strength ?? 0,
        activations: memory.activations ?? 0,
        membershipStatus: membership?.status || "PROVISIONAL"
      });
    })),
    participatingNeuronIds: Object.freeze(orderedIds(sourceMemoryIds.flatMap(id => memoryById.get(id)?.neuronIds || []))),
    development: null,
    productionAuthority: false,
    persistence: "NONE"
  });
}

export function buildKnowledgeArea2AuditSnapshot(state, productionDevelopment, semanticDiagnostics = null) {
  const canonicalMemories = (state?.memories || []).map(memory => ({
    id: String(memory.id), content: String(memory.content || ""),
    strength: Number.isFinite(memory.strength) ? memory.strength : null,
    activations: Number.isFinite(memory.activations) ? memory.activations : null,
    neuronIds: [...(memory.neuronIds || [])].map(String).sort()
  }));
  const memoryById = new Map(canonicalMemories.map(memory => [memory.id, memory]));
  const productionAreas = (productionDevelopment?.areas || []).map(area => ({
    id: String(area.id), label: String(area.label || ""),
    memoryCount: area.memoryCount ?? (area.memoryIds || []).length,
    cohesion: Number.isFinite(area.cohesion) ? area.cohesion : null,
    memoryIds: [...(area.memoryIds || [])].map(String).sort(),
    memories: [...(area.memoryIds || [])].map(String).sort().map(id => memoryById.get(id)).filter(Boolean).map(memory => ({ ...memory }))
  }));
  const productionAreaByMemory = new Map(productionAreas.flatMap(area => area.memoryIds.map(memoryId => [memoryId, area.id])));
  const canonical = canonicalMemories.map(memory => ({ ...memory, productionAreaId: productionAreaByMemory.get(memory.id) || null }));
  const shadowAreas = canonicalMemories.map(memory => {
    const topic = createProvisionalTopic(memory);
    return {
      ...buildKnowledgeAreaInspection({ topic, memories: canonicalMemories }),
      topicHypothesis: null,
      verification: { decision: TOPIC_RELATION.UNCERTAIN, evidence: null, reason: "NO_VALIDATED_TOPIC_VERIFIER" }
    };
  });
  return structuredClone({
    generatedAt: new Date().toISOString(),
    canonicalMemoryCount: canonical.length,
    canonicalMemories: canonical,
    productionAreas,
    shadowAreas,
    summary: { canonicalMemoryCount: canonical.length, productionAreaCount: productionAreas.length,
      shadowProvisionalAreaCount: shadowAreas.length, verifiedShadowAssignments: 0, uncertainShadowAssignments: shadowAreas.length },
    verificationStatus: semanticDiagnostics?.providerStatus || { providerAvailable: false, provider: null, message: "No validated topic verifier connected.",
      allowedDecisions: Object.values(TOPIC_RELATION) },
    semanticDiagnostics: semanticDiagnostics ? structuredClone(semanticDiagnostics.results || {}) : null,
    errors: []
  });
}

export const KNOWLEDGE_AREA_2_EVALUATION = Object.freeze({
  bicycleBee: Object.freeze([
    "A bicycle has two wheels and is powered by pedaling.",
    "Cyclists wear helmets to protect their heads.",
    "Bicycle gears make climbing hills easier.",
    "Bees collect nectar from flowers.",
    "Honeybees communicate through special dances.",
    "Bees help plants reproduce through pollination.",
    "The Moon influences ocean tides.",
    "Chocolate is made from cocoa beans.",
    "Airplanes use wings to generate lift.",
    "Rainbows appear when sunlight passes through water droplets."
  ]),
  expectedStructure: Object.freeze({ groupedSizes: Object.freeze([3, 3]), singletonCount: 4 }),
  runtimeAuthority: false
});
