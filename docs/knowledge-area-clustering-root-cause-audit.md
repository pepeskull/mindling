# Knowledge Area clustering root-cause audit

**Result:** `MODEL_LIMITATION`  
**Scope:** audit only; no production code, threshold, model, database, route, specialization, or UI change  
**Audited production implementation:** `src/brain/knowledge-development.js`

## Executive conclusion

The reported `7 / 3` result is not evidence that complete-link is bypassed. In the current implementation, a multi-memory area can exist only when every pair crossing each accepted merge is at least `0.62`. Because previously merged clusters are tested across their entire boundary, the final cluster is a clique under that predicate: all 21 pairs in the seven-memory area and all three pairs in the three-memory area must have met the production cosine floor when the reported state was derived.

The implementation uses ordinary cosine correctly and applies complete-link correctly. Centroids and representatives do **not** authorize membership. The failure is that `all-MiniLM-L6-v2` sentence cosine is being used as broad-topic authority even though browser evidence already shows its ordering is unsuitable for that task: an incoherent trader/dog pair scored about `0.8145`, while a legitimate trading pair scored about `0.4628`. Complete-link faithfully enforces those bad pair judgements; it cannot repair them.

The new bicycle/bee run supplies the observed membership and cohesion, but its 45 raw pair cosines were not preserved in the repository. This audit therefore does not invent exact values or claim a locally rerun pretrained-model result. The final membership provides a strict, verifiable constraint on those values under the audited code. The console procedure below captures the missing values from the live Mindling.

## 1. Exact flow: Teach to Knowledge Area

1. `Dashboard` submits Teach text through `MindlingApp.#queueInput()` and the serialized `#processInput()` path.
2. `SemanticEngine.evaluate()` creates the production MiniLM embedding, retrieves candidates, and runs the frozen canonical-identity decision. This determines reinforcement versus a new canonical memory; it is separate from Knowledge Area membership.
3. `BrainEngine.evaluateInput()` creates a canonical memory when appropriate. The memory stores the copied embedding and the chosen `neuronIds`/`synapseIds`. For a new memory, `semanticRoute()` temporarily derives areas with a probe and may reuse the most represented synapse in the probe's derived area.
4. `MindlingDatabase.commitLearning()` atomically writes the memory and synapse. `BrainEngine.commitLearning()` then updates in-memory canonical state.
5. The resulting state event makes `Dashboard.render()` call `deriveKnowledgeDevelopment(state.memories)`. Areas are derived anew; no area membership is persisted.
6. The Memory view renders those derived areas. `knowledgeAreaAudit()` calls the same function against a cloned Brain Engine state, so it is read-only and does not use a separate clustering implementation.

## 2. Production clustering, exactly

`deriveKnowledgeDevelopment()` performs these steps:

1. Sort memories by ID, then creation time. This makes input order irrelevant.
2. Compute and cache standard cosine for every pair:

   `dot(left, right) / (norm(left) * norm(right))`.

   Missing or dimension-mismatched embeddings return `-1` and therefore cannot cause a false merge.
3. Keep pair edges at or above `KNOWLEDGE_RULES.clusterSimilarity` (`0.62`).
4. Sort eligible edges by descending cosine, with a stable pair-ID tie-breaker.
5. Start with one cluster per memory.
6. For each edge connecting different clusters, calculate **every** cross-cluster pair similarity. Merge only if their minimum is at least `0.62` and the result has at most 12 memories.
7. Derive centroid, cohesion, representatives, label, progress, participating neural IDs, assignments, and deterministic area ID only after clustering is complete.

This is agglomerative complete-link clustering over a fixed cosine predicate. It is not centroid assignment, nearest-neighbour assignment, connected components, or representative-authorized assignment.

### What does not control membership

- **Centroid:** calculated after all merges; used for cohesion metadata only.
- **Representatives:** selected after all merges; exposed as audit metadata only.
- **Cohesion:** calculated after all merges; affects progress and label eligibility, not membership.
- **Labels:** calculated after all merges; never feed clustering.
- **Neurons, synapses, pathways, strengths, and activations:** do not authorize a merge.

## 3. Reported ten-memory reproduction

The real browser produced ten canonical memories and these final production areas:

| Area | Members |
| --- | --- |
| 1 (7) | bicycle/two wheels; bicycle gears; honeybee dances; Moon/tides; chocolate/cocoa; airplane/lift; rainbow/water droplets |
| 2 (3) | cyclist helmets; bee nectar; bee pollination |

The expected evaluation structure is cycling `1–3`, bees `4–6`, plus four singletons. This expectation is evaluation evidence only and is absent from runtime logic.

### Complete-link result implied by production code

Provided the displayed result came from the current unmodified `deriveKnowledgeDevelopment()`:

- Area 1 contains 7 memories and therefore 21 within-area pairs. Every one must be `>= 0.62`.
- Area 2 contains 3 memories and therefore 3 within-area pairs. Every one must be `>= 0.62`.
- A single bridge cannot explain either area. Each cluster merge recomputes the full cross-boundary minimum.
- The merge sequence can affect which competing valid clique is selected, but it cannot create a final cluster containing a below-floor pair.
- Stable memory ordering and stable edge tie-breaking make the result deterministic for the same IDs and embeddings.

This verifies the complete-link property, not the semantic correctness of the pair scores. The exact eligible edges, merge order, minima, and medians require the missing browser matrix.

### Read-only browser capture for exact verification

On the affected Mindling, open localhost or `?semantic-debug=1` and run:

```js
const debug = window.__MINDLING_SEMANTIC_DEBUG__;
const memories = debug.canonicalMemories();
const development = debug.knowledgeAreaAudit();

const pairs = [];
for (let i = 0; i < memories.length; i += 1) {
  for (let j = i + 1; j < memories.length; j += 1) {
    const evidence = await debug.inspectEmbeddings(
      memories[i].content,
      memories[j].content
    );
    pairs.push({
      leftId: memories[i].id,
      rightId: memories[j].id,
      left: memories[i].content,
      right: memories[j].content,
      cosine: evidence.cosine,
      eligible: evidence.cosine >= 0.62
    });
  }
}

console.table(pairs);
console.log(development);
for (const area of development.areas) {
  const memberSet = new Set(area.memoryIds);
  const within = pairs.filter(pair =>
    memberSet.has(pair.leftId) && memberSet.has(pair.rightId)
  );
  console.log(area.id, {
    members: area.memoryIds,
    allPairsEligible: within.every(pair => pair.eligible),
    minimum: within.length ? Math.min(...within.map(pair => pair.cosine)) : 1,
    medianInputs: within.map(pair => pair.cosine).sort((a, b) => a - b)
  });
}
```

This runs the existing local production encoder and read-only derivation. It does not Teach, write IndexedDB, or invoke E5/Jina. Export the resulting 45 rows to preserve exact browser evidence. Re-encoding should match persisted embeddings within deterministic backend tolerance; if it does not, inspect persisted vector dimensions/norms and backend determinism before drawing further conclusions.

## 4. Embedding and cosine audit

### Implementation findings

- The production encoder returns a copied, normalized `Float32Array`; the clustering function does not mutate it.
- Cosine iterates every matching dimension, accumulates dot product and both squared magnitudes, and divides by their product of norms.
- Self-pairs are handled as `1` by the cache accessor but are never used as a merge boundary.
- A dimension mismatch or absent vector becomes `-1`, which blocks rather than permits grouping.
- Pair scores are calculated once per derivation and cached under a symmetric stable key.

No indexing, normalization-axis, buffer-sharing, asymmetric-key, or cosine-formula defect was found in the audited path.

### Semantic limitation

The encoder was selected for sentence-level semantic retrieval, not the symmetric relation “these distinct facts belong to the same broad subject.” Existing real-browser evidence establishes an inversion that no single cosine floor can fix:

- unrelated `Traders study market prices` / `Dogs need regular exercise`: approximately `0.8145`;
- legitimate `Risk management is important when trading` / `Traders study market prices`: approximately `0.4628`.

Complete-link prevents chain drift, but when every incorrect pair is scored above the floor it must accept the incoherent cluster. Raising or lowering `0.62` cannot repair the demonstrated ordering and was not attempted.

## 5. Why 88% and 91% cohesion are possible

For a cluster, production cohesion is:

```text
mean(max(0, cosine(memberEmbedding, arithmeticCentroid)))
```

It is **not**:

- pairwise minimum;
- pairwise mean or median;
- topic-classification confidence;
- probability that the area is human-coherent.

The arithmetic centroid contains the shared directions in the sentence embeddings. If unrelated declarative sentences occupy a narrow anisotropic region, each can be close to that centroid even when their real-world subjects differ. Thus `88%` and `91%` can be mathematically correct centroid cohesion values while being poor measures of topical cohesion.

The displayed percentages are rounded `cohesion * 100`. The audit exposes the more safety-relevant `clusterMinimumSimilarity` and `clusterMedianSimilarity` separately, but the UI currently displays centroid cohesion. No arithmetic defect is required to explain the observed values.

## 6. Downstream effects

| Derived value | Dependency and effect of a false area |
| --- | --- |
| Area Development | Uses 45% average strength, 25% bounded activation, 20% bounded member density, and 10% centroid cohesion. False grouping can raise the density term and changes the cohesion term. |
| Overall Development | Memory-count-weighted mean of area progress. Regrouping changes area density/cohesion contributions and therefore can change the overall value even though canonical memories are unchanged. |
| Area label | Uses the central memory of the false cluster when cohesion is at least `0.75`; an incoherent cluster can therefore receive a misleading excerpt. |
| Area ID | Hashes sorted member IDs; false membership produces a different derived ID. |
| Neuron participation | Counts a neuron's canonical memories per derived area. False grouping collapses otherwise distinct participation buckets. |
| Dominant share | Uses the largest derived-area share among a neuron's participating memories; false grouping can inflate it. |
| Emerging specialization | Requires at least three local memories and dominant share `>= 0.60`; false grouping can create or redirect an apparent specialization. |
| Primary area | Points to the inflated dominant derived area when specialization passes. |
| Semantic routing of new memories | Before a new route is persisted, a probe is clustered with existing memories. A false area can cause reuse of the most common synapse in that area. Existing persisted routes are not rewritten by later regrouping. |

Canonical contents, IDs, strengths, activations, variants, and existing routes are not changed merely by rendering or auditing derived areas.

## 7. Confirmed implementation bugs

**None found in clustering mechanics.** Specifically:

- complete-link checks all cross-cluster pairs;
- centroids and representatives do not authorize merges;
- cosine is the standard formula;
- missing or malformed embeddings fail closed;
- order and tie-breaking are deterministic;
- cohesion matches its documented centroid-based definition.

The term `COMPLETE_LINK_COHERENT` in assignment diagnostics can be misread as human topical coherence; it means only “all production cosine pairs met the configured floor.” That wording is an interpretability weakness, not the cause of membership.

## 8. Confirmed semantic limitation

Production treats MiniLM cosine as final Knowledge Area membership evidence. Real-browser results demonstrate that this representation overvalues generic sentence structure and can undervalue distinct facts within one broad subject. The clustering layer is therefore receiving semantically invalid authority signals for its intended relation.

Root cause classification: **`MODEL_LIMITATION`**.

## 9. Remaining uncertainties

1. The exact 45 MiniLM scores and merge sequence for the bicycle/bee corpus were not supplied or stored, so they must be captured with the read-only procedure above.
2. The reported `88%`/`91%` values are consistent with the formula, but exact recomputation requires the persisted vectors.
3. If the captured final areas differ, verify that the deployed commit, memory IDs, embeddings, and displayed state match the audited repository revision.
4. Browser backend numerical differences should be small, but pairs extremely close to `0.62` should be recorded with full precision.

These uncertainties do not undermine the established architectural failure: earlier preserved browser evidence already proves incorrect pairs can rank above correct broad-topic pairs.

## 10. Recommended minimum correction — not implemented

Do not alter complete-link, cohesion, routing, specialization, or the threshold in isolation. The minimum justified correction is to stop granting generic MiniLM cosine final Knowledge Area authority:

1. retain MiniLM only for bounded candidate discovery;
2. require a separately validated broad-topic pair authority before permitting a merge;
3. keep `UNCERTAIN` as singleton/separate;
4. apply the validated authority across the complete cluster boundary (or conservative boundary representatives whose loss of safety is explicitly measured);
5. recalibrate/evaluate on separate data, then run the frozen corpus and order-resistance checks before promotion.

Until such evidence exists, the safest behavioral fallback would be conservative splitting rather than false grouping. This audit does **not** implement that fallback, select a new authority, test a model, or change any threshold.

## Preservation confirmation

This audit adds documentation only. Canonical identity, Teach, memory records, production clustering, complete-link, neural specialization, semantic routing, Brain Engine, UI, renderer, IndexedDB v1, five canonical neurons, four canonical synapses, and disabled token payments remain unchanged. No dependency, backend, `/api`, model, taxonomy, keyword rule, or special case was added.
