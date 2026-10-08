# Knowledge Area 2.0 architecture

**Status:** `FOUNDATION_READY`

**Implemented phases:** Phase 1 (architecture) and Phase 2 (noncanonical contracts)

**Production authority:** none

**Semantic capability:** unselected and unproven

## 1. Product goal

Knowledge Areas should be a living, derived explanation of what one Mindling has learned. They should appear with the first canonical memory, grow only through verified topic membership, preserve uncertainty, allow inspection of their real canonical memories, and provide trustworthy input to later neural specialization.

Knowledge Area 2.0 keeps four decisions separate:

1. **Canonical identity:** whether input expresses an existing proposition. The current production decision remains frozen.
2. **Topic discovery:** a non-authoritative hypothesis about the subject of a canonical memory or coherent memory set.
3. **Topic verification:** independent evidence that a memory belongs—or does not belong—to a topic hypothesis.
4. **Derived organization:** reconciliation of verified, provisional, and uncertain assignments into inspectable areas.

A label is presentation, not evidence. A centroid or high cosine is retrieval evidence, not membership authority.

## 2. Confirmed root cause

The root-cause audit classified the current failure as `MODEL_LIMITATION`. Production complete-link correctly requires every cross-cluster MiniLM cosine to meet `0.62`, but MiniLM cosine does not order broad-topic relations reliably. Real-browser evidence includes an unrelated pair near `0.8145` and a legitimate same-topic pair near `0.4628`. No threshold adjustment can correct that inversion.

Complete-link remains useful for preventing weak-bridge transitivity. Knowledge Area 2.0 replaces neither its safety principle nor canonical identity. It changes no production code in this phase.

## 3. Topic discovery contract

### Semantic question

> What explicit subject hypothesis best describes what this canonical memory is about?

### Proposed mechanism

The minimum plausible capability is **constrained local subject abstraction**, not another sentence-vector cosine. A future browser model must accept canonical memory text (and, when updating an area, a bounded set of representative memories) and emit a structured hypothesis:

```js
{
  subject: string | null,
  facets: string[],
  displayLabel: string | null,
  evidence: modelSpecificEvidence,
  provider: { model, revision, runtime },
  status: "PROVISIONAL"
}
```

The output vocabulary is open: it must be generated or extracted from the memories, never selected from an application taxonomy. The likely model family is a compact instruction-capable or constrained sequence-to-sequence model able to perform subject abstraction. That capability, an acceptable model, output grounding, browser compatibility, and multilingual behavior are **not yet proven**. No model is selected or installed here.

If discovery cannot produce a grounded subject, `subject` is `null` and the UI uses a neutral deterministic `Emerging Knowledge …` label. A plausible label never verifies membership.

### Creation and update

- First memory: create a singleton provisional hypothesis referencing its canonical ID.
- Additional memory: verify membership independently before adding it to the hypothesis source set.
- Verified growth: rerun discovery over bounded, diverse representatives and record a new derived hypothesis revision.
- Label improvement: presentation may change when grounded evidence improves; membership does not change because a label changed.
- Invalidation: if verification later rejects part of an area, discard the derived hypothesis and rediscover over the reconciled components. Canonical memories remain untouched.

## 4. Topic verification contract

### Semantic question

> Does this distinct canonical memory concern the coherent subject represented by this topic, strongly enough to join it?

### Proposed mechanism

Verification must be a separately validated **topic co-membership classifier**, not generic similarity, NLI, STS, E5 cosine, or reranker score. The future verifier receives:

- the candidate memory;
- the discovered subject hypothesis as context, never as authority;
- up to three deterministic, diverse canonical representatives;
- optional explicit facets and provenance.

It returns calibrated evidence for exactly:

```text
SAME_AREA | DIFFERENT_AREA | UNCERTAIN
```

The future model must be trained or demonstrably aligned to broad-topic co-membership. Scores must be calibrated on data separate from the frozen evaluation. Bidirectional checks are required if its input contract is asymmetric. A label-only comparison is forbidden.

### Cluster safety

Candidate retrieval is bounded to four areas. Verification checks at most three diverse representatives per area and at most twelve boundary pairs per decision. `SAME_AREA` is only a shadow hypothesis until a separately approved authority exists. Any missing or `UNCERTAIN` boundary stays separate. Any `DIFFERENT_AREA` boundary blocks the merge.

Representative checks are not mathematically identical to full complete-link. Before production, validation must compare their false-merge rate with all-member boundaries and retain all-member checks for small areas or boundary/diversity representatives for larger areas.

## 5. Topic representation

A derived topic representation contains:

- deterministic derived ID;
- lifecycle status;
- optional open-vocabulary subject and facets;
- display label and label provenance;
- sorted canonical source-memory IDs;
- bounded representative-memory IDs;
- discovery evidence/provider provenance;
- independent verification records for membership boundaries;
- no canonical or production authority during validation.

It deliberately contains no embedding as truth, fixed category ID, pathway mapping, or persisted mutation of a canonical memory. A future semantic prototype may be cached for retrieval only, provided its role is explicitly non-authoritative.

The Phase 2 module implements frozen contracts for neutral provisional topics, discovery hypotheses, verification records, bounded boundary assessment, read-only inspection, and evaluation fixtures. It performs no language inference.

## 6. Provisional, verified, and uncertain states

### Area lifecycle

- `PROVISIONAL`: one or more memories represented without validated topic authority. The current foundation creates only this state.
- `VERIFIED`: reserved for future promotion after independently validated verification evidence. Phase 2 cannot produce production-verified state.
- `INVALIDATED`: a derived hypothesis whose membership was rejected during reconciliation; it is recomputed, never used to delete memory.

### Membership lifecycle

- `PROVISIONAL`: seed memory or assignment awaiting verification.
- `SAME_AREA`: shadow verifier evidence supports membership across the required boundary.
- `DIFFERENT_AREA`: explicit evidence blocks membership.
- `UNCERTAIN`: missing, conflicting, weak, uncalibrated, or bounded-out evidence. It cannot authorize a merge.

The foundation records `mergeAuthorized: false` and `productionAuthority: false` even when all supplied shadow decisions say `SAME_AREA`. This prevents contract tests or mock evidence from masquerading as semantic success.

## 7. Area identity and reconciliation

### Identity

Phase 2 IDs are deterministic hashes of sorted canonical memory IDs, prefixed `topic-shadow-`. Caller ordering cannot alter them. They are diagnostic identities, not persisted production IDs.

Future reconciliation should use:

1. exact retained verified membership set;
2. maximum overlap with the prior derived area;
3. verified topic compatibility;
4. stable lexical ID tie-breakers.

An unchanged verified membership set retains identity. A split gives the prior identity to the deterministically selected maximum-overlap component; other components receive new derived identities. A merge receives a new identity unless one prior area is wholly preserved and policy explicitly permits retention. These rules must be tested before persistence is considered.

### Reconciliation

- Build candidate links from cheap retrieval only.
- Verify complete/bounded boundaries conservatively.
- Construct components only from accepted boundaries; do not use unrestricted connected components.
- Preserve provisional singletons and uncertain assignments.
- Rediscover topic hypotheses after membership changes.
- Never rewrite/delete canonical memories or their routes.

Knowledge Areas remain rebuildable derived state. Safe verification caches may eventually persist without becoming canonical truth, but that would require a separately approved schema strategy; Phase 2 writes nothing.

## 8. Neural integration boundaries

Current production specialization and semantic routing remain unchanged. Knowledge Area 2.0 must eventually expose confidence-aware inputs:

- **Verified area:** eligible for specialization shares, primary-area selection, and semantic route continuity.
- **Provisional singleton:** visible as emerging knowledge but cannot independently establish specialization.
- **Uncertain assignment:** remains separate and contributes only to local canonical memory counts, not verified topic concentration.

Development must not be inflated by unverified density or cohesion. A future formula should keep strength and activation as factual state, but gate area-density, topic cohesion, specialization share, and route reuse on verified membership. That formula is not implemented or tuned here.

No neuron/synapse growth, rerouting, route rewriting, or M4 behavior belongs to this architecture phase.

## 9. UI data contract

The read-only inspection contract is designed for a later accessible expandable area control:

```js
{
  id,
  displayLabel,
  status,
  provisional,
  canonicalMemoryCount,
  development,             // null until defensibly defined
  participatingNeuronIds,
  memories: [{
    memoryId,
    content,
    strength,
    activations,
    membershipStatus
  }],
  productionAuthority: false,
  persistence: "NONE"
}
```

It uses actual canonical memory content and metrics. It does not expose embeddings or model internals. The eventual UI should use a real `<button>` with `aria-expanded`/`aria-controls`, a keyboard-operable disclosure region, and the existing dark monochrome glass styling on desktop/mobile. No UI is changed in Phase 2.

## 10. Browser runtime strategy

Future runtime shape:

```text
canonical memory
  -> existing cheap MiniLM top-K discovery (retrieval only)
  -> at most 4 candidate areas
  -> at most 3 diverse representatives per area
  -> local discovery/verifier inference in serialized queues
  -> SAME_AREA / DIFFERENT_AREA / UNCERTAIN shadow evidence
  -> conservative boundary validation
  -> derived shadow organization
```

Requirements before any model experiment:

- explicit model/task justification and license verification;
- Transformers.js/ONNX operator and tokenizer compatibility;
- lazy debug-only loading;
- WebGPU with measured WASM feasibility;
- copied outputs and serialized session calls;
- bounded text/token lengths and temporary-resource disposal;
- browser cache reuse;
- measured download, initialization, warm latency, peak memory, and mobile behavior;
- no user text sent to inference services.

No candidate meets these requirements yet. Normal startup remains unaffected.

## 11. Frozen and held-out evaluation

Preserve, without changing labels after observing results:

- the existing frozen 70-pair matrix;
- trading/programming ten-memory simulation;
- bicycle/bee ten-memory regression fixture;
- five critical hard negatives;
- multilingual Swedish, Spanish, and cross-lingual cases.

Add a separately reviewed, held-out set before calibration covering unseen subjects, shared vocabulary/different subjects, same subject/different vocabulary, different structures, ambiguous multi-facet memories, splits, merges, and order permutations.

Evaluate discovery separately from verification:

- **Discovery:** subject grounding, unsupported-label rate, label stability, facet coverage, and human review—never membership accuracy by label alone.
- **Verification:** same-topic recall, different-topic rejection, hard-negative rejection, calibration/abstention, directional asymmetry, and held-out generalization.
- **Clustering:** singleton preservation, no incoherent areas, complete-boundary safety, order resistance, split/merge reconciliation, and no canonical mutation.
- **Runtime:** first load, warm pair cost, full diagnostic duration, provider, memory, and mobile failure behavior.

Mocked contract tests prove mechanics only. Real pretrained browser inference is mandatory for semantic claims.

## 12. Promotion criteria

Phase 3 must meet all predeclared gates:

- 5/5 critical hard negatives rejected;
- at least 95% different-topic rejection;
- at least 80% same-topic recall;
- coherent bicycle/bee and trading/programming organization;
- four unrelated singletons preserved in each ten-memory corpus;
- no forced grouping under uncertainty;
- no transitive drift;
- stable input-order behavior;
- held-out unseen-topic generalization;
- reasonable multilingual behavior if claimed;
- acceptable browser and mobile performance;
- zero canonical mutation.

Calibration and frozen evaluation must use separate data. Passing discovery alone is insufficient. Production promotion requires a later, separately approved Phase 4.

## 13. Known unresolved technical questions

1. Which small local model can perform grounded open-vocabulary subject abstraction accurately enough in supported browsers?
2. Does an available compact model directly classify broad-topic co-membership, or is task-specific training/conversion required?
3. Can one model perform both tasks without conflating plausible labeling and verified membership?
4. How should discovery grounding be scored without a cloud evaluator or fixed taxonomy?
5. What calibration corpus is sufficiently broad, multilingual, and separate from frozen evaluation?
6. How many boundary representatives preserve acceptable false-merge safety as areas grow?
7. What device/model-size budget is acceptable on mobile WebGPU and WASM?
8. Should safe verification evidence be cached, and how can it be invalidated on model revision without changing DB v1?
9. How should multi-facet memories participate without duplicating or rewriting canonical truth?
10. What reconciliation identity behavior is least confusing when a derived area splits or merges?

## Phase 2 implementation inventory

`src/semantic/knowledge-area-foundation.js` is intentionally not imported by production application code. It provides:

- frozen state/relation enums and browser-work bounds;
- neutral deterministic first-memory provisional topics;
- non-authoritative open-vocabulary hypothesis contracts;
- immutable verification evidence records;
- bounded complete-boundary diagnostics where uncertainty cannot merge;
- read-only inspection data built from canonical records;
- the bicycle/bee evaluation fixture marked `runtimeAuthority: false`.

No semantic classifier, arbitrary score, similarity threshold, model loader, persistence, production grouping, or UI behavior was added.

## Preservation statement

Canonical identity, canonical memories, Teach, production Knowledge Areas and `0.62` threshold, complete-link, neural specialization, semantic routing, five neurons, four synapses, IndexedDB v1, UI, renderer, onboarding, static deployment, and disabled token payments are unchanged. No model, dependency, backend, `/api`, wallet, Stage Preview, M4, taxonomy, dictionary, or benchmark-specific runtime rule was introduced.

## Debug panel

Open the application with `?semantic-debug=1` and select **Knowledge Area 2.0 Debug**. The read-only panel compares current canonical memories and production-derived areas with one neutral provisional shadow area per canonical memory. It exposes actual memory IDs, content, strength, activations, production membership, participating neurons, and `UNCERTAIN` shadow verification state. It refreshes from the existing `STATE_READY` event while open or from its explicit refresh button.

The corresponding copied, serializable snapshot is available after semantic diagnostics initialize:

```js
window.__MINDLING_SEMANTIC_DEBUG__.knowledgeArea2Audit()
```

Normal URLs do not construct the panel. The panel performs no IndexedDB operation, semantic inference, merge, canonical mutation, or production-area mutation. Its singleton count is explicitly a provisional diagnostic structure—not a claim of semantic accuracy.
