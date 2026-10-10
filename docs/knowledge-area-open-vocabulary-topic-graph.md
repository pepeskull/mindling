# Knowledge Area 2.0 architecture decision: open-vocabulary Topic Graph

**Decision status:** architecture proposed; semantic authority missing  
**Implementation recommendation:** `NO_GO_PRODUCTION`; permit only a separately reviewed, falsifiable shadow proof of concept after an appropriate evidence source is identified  
**Scope:** documentation and feasibility only; no model, runtime, production, persistence, or UI change

## 1. Decision and task definition

Knowledge Area membership is **open-vocabulary broad-subject co-membership**:

> Given two distinct factual memories, decide whether placing both in one evolving body of knowledge would describe a coherent broad subject.

This relation is symmetric and intentionally broader than proposition identity, paraphrase, entailment, and textual similarity. It is narrower than generic relevance or association. It allows `UNCERTAIN`; false merging is more harmful than conservative splitting.

The proposed representation is a **signed, evidence-bearing Topic Graph**:

- each canonical memory is an immutable node referenced by canonical ID;
- a `SAME_AREA` edge is admitted only by an independently validated topic-relation authority;
- a `DIFFERENT_AREA` assessment is retained as a merge-blocking boundary fact;
- `UNCERTAIN`, missing, stale, or invalid evidence creates no positive edge and cannot merge nodes;
- Knowledge Areas are derived graph partitions, not canonical records;
- topic names are derived annotations and have no membership authority.

The graph is open-vocabulary because its relation authority compares memory meaning directly. It never selects from a product taxonomy.

## 2. Current implementation inventory

### Production Knowledge Areas 1.0

`deriveKnowledgeDevelopment()` sorts canonical memories, calculates every pair's MiniLM cosine, creates candidate edges at `0.62`, and deterministically merges clusters only when every cross-cluster cosine meets that threshold. It caps areas at 12 memories. Area IDs hash sorted member IDs. Representatives, centroid cohesion, progress, conservative labels, assignments, and participating neurons are derived afterward.

This provides useful order resistance, singleton preservation, complete-link protection against transitive chain drift, deterministic derived IDs, and downstream participation calculations. It does **not** provide trustworthy topic evidence.

### Knowledge Area 2.0 foundation

The shadow foundation already separates `PROVISIONAL`, `VERIFIED`, and `INVALIDATED` topic hypotheses; `SAME_AREA`, `DIFFERENT_AREA`, and `UNCERTAIN` relations; non-authoritative discovery labels; and bounded complete-boundary checks. A missing relation becomes `UNCERTAIN`. The debug panel copies canonical state and compares current production areas with provisional singleton areas without persistence.

### Existing semantic capabilities and evaluation

- MiniLM remains useful for candidate retrieval, but its cosine is not topic authority.
- NLI, paraphrase, and STS address proposition relations or textual similarity rather than broad-subject membership.
- Audited multilingual E5 cosine did not separate same-topic from different-topic pairs.
- The Jina relevance experiment did not establish calibrated topic co-membership authority.
- FLAN-T5 Small generated text under WASM but failed the bounded topic-discovery and instruction-compliance evaluation; it is rejected and must not be repaired or replaced in this decision.
- The frozen 70-pair relation matrix, five critical hard negatives, trading/programming corpus, bicycle/bee corpus, structural hard cases, and multilingual cases remain evaluation evidence. They are never runtime rules.

No current subsystem supplies the independent edge evidence required by the graph.

## 3. Root cause of previous failures

The clustering mechanism and semantic authority are separate concerns. Complete-link correctly enforces the evidence it receives, but it cannot make an unreliable relation meaningful.

1. **Embedding cosine is a geometry, not a topic judgment.** MiniLM and E5 can reward shared syntax, generic semantic association, or representation artifacts. Observed inversions place unrelated pairs above legitimate same-topic pairs, so threshold movement cannot recover a reliable ordering.
2. **Task mismatch persists across support models.** Entailment, contradiction, paraphrase, STS, and search relevance are not labels for broad-subject co-membership. Two photography facts may be same-topic while mutually neutral; two structurally parallel sentences may be different-topic while highly similar.
3. **A graph or clustering algorithm adds no missing semantics.** Connected components would amplify one false edge. Complete-link limits that drift but still produces incoherent cliques when every supplied pair score is wrong.
4. **Naming cannot repair membership.** A plausible generated label neither proves its own grounding nor authorizes memories to join it. FLAN additionally failed discovery grounding and constrained relation output in real inference.
5. **The present high cohesion values are internally valid embedding cohesion only.** They do not measure real subject coherence and therefore cannot validate the clusters they summarize.

The confirmed root cause remains a missing, task-aligned semantic authority—not a defect in cosine arithmetic, deterministic ordering, or complete-link mechanics.

## 4. Approaches evaluated

| Approach | Actual evidence | Independent of cosine? | Unseen-subject behavior | Browser profile | Main failure mode | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Bi-encoder embeddings plus clustering | vector proximity learned from a retrieval/similarity objective | No, if cosine decides membership | potentially broad vocabulary, but unreliable relation boundary | cheapest; embeddings cache well; retrieval can be bounded | structural false positives, low same-topic scores, threshold inversion | Retrieval only |
| Embedding retrieval plus task-specific pair classifier | cheap top-K retrieval followed by a sequence-pair decision trained for broad-topic co-membership | Yes, if classifier consumes text/token pairs and has its own task-aligned head | potentially open-vocabulary when evaluation topics are held out from training | one small encoder session plus bounded pair calls; lazy loading required | training-label mismatch, calibration drift, multilingual gaps | Preferred evidence architecture, but capability absent |
| Generic cross-encoder relevance/reranker | query-document relevance score | Computationally yes; semantically not necessarily | often broad, depending on training | bounded calls are feasible; slower than retrieval | relevance is directional and can reward association rather than same topic | Insufficient unless specifically trained/validated for this relation |
| Zero-shot NLI or instruction generation | entailment labels or generated instructions | Yes | nominally broad | encoder pair inference or autoregressive generation; generation is costlier | task mismatch, prompt sensitivity, malformed output, poor calibration | Rejected as current authority |
| Topic Graph plus strict boundary clustering | independently supplied signed pair decisions | Graph itself uses no cosine | inherits the scorer's generalization | sparse graph storage; boundary calls dominate | false positive edges if authority is weak; graph cannot create evidence | Adopt as organization layer only |

The architectural conclusion is explicit: **Mindling should stop using embedding cosine as final Knowledge Area authority.** It may remain a recall-oriented candidate generator.

## 5. Proposed pipeline

```text
new canonical memory
  -> provisional singleton node
  -> MiniLM retrieval of top-K candidate areas (recall only)
  -> deterministic representative selection per candidate area
  -> independent topic-relation scorer over raw text pairs
  -> calibrated SAME_AREA / DIFFERENT_AREA / UNCERTAIN evidence
  -> complete-boundary validation
  -> deterministic graph partition update
  -> optional, separate topic-name derivation
  -> shadow inspection and evaluation
```

### 5.1 Candidate retrieval

Retrieval proposes at most `K` areas and never rejects a singleton permanently. It may use the current embedding index, area representatives, and centroid only to reduce work. Its output must expose ranks and scores as retrieval diagnostics, not membership evidence.

Before relying on bounded retrieval, evaluation must measure whether every valid existing area appears within top K. A missed valid area produces a conservative singleton, not a forced assignment. Candidate-retrieval recall is scored separately from relation quality.

### 5.2 Independent semantic evidence

The missing component is a **selective open-vocabulary topic co-membership classifier**: a local sequence-pair model whose supervised objective explicitly distinguishes `SAME_BROAD_SUBJECT` from `DIFFERENT_BROAD_SUBJECT`, including structurally similar hard negatives and same-topic/different-proposition positives.

It must consume the two raw memory texts jointly. It must not receive a product category, generated topic name, pathway, embedding cosine, benchmark expectation, or keyword feature. Its output contract is calibrated evidence, for example logits for same/different plus provenance. Two thresholds, fixed on a separate calibration split, create selective decisions:

- `SAME_AREA` only above the predeclared high-precision same threshold;
- `DIFFERENT_AREA` only below the predeclared different threshold;
- the interval between them is `UNCERTAIN`.

The score is evaluated in both input orders. Directional disagreement becomes `UNCERTAIN`. Calibration must use held-out subjects and languages; random pair splits are insufficient because topic leakage would exaggerate generalization.

This model/capability does not currently exist in Mindling, and this decision does not select, download, train, or install one. A model advertised as relevance, NLI, STS, or reranking is not accepted without direct evidence on this exact relation.

### 5.3 Graph and cluster formation

Maintain three logical edge states in a derived snapshot:

```js
TopicRelationEvidence {
  pairId: string,
  leftMemoryId: string,
  rightMemoryId: string,
  decision: "SAME_AREA" | "DIFFERENT_AREA" | "UNCERTAIN",
  sameScore: number | null,
  differentScore: number | null,
  calibrationRevision: string,
  modelId: string,
  modelRevision: string,
  evaluatedAt: string,
  inputOrderAgreement: boolean,
  authority: "SHADOW" | "VALIDATED"
}
```

Start every node as a singleton. Sort proposed positive edges by stable pair ID (not score) and consider merges deterministically. A merge is permitted only when every required cross-boundary pair has current `SAME_AREA` evidence. Any `DIFFERENT_AREA`, `UNCERTAIN`, missing, stale, or bound-exceeded pair blocks the merge. For small clusters, validate all members. For larger clusters, representative-only checks are an optimization hypothesis—not equivalent safety—and cannot be promoted until their false-merge rate matches the accepted bound.

This is conservative clique-style agglomeration, not ordinary connected components. A single positive bridge never joins two areas. Reversing memory input order produces the same pair set, edge ordering, and partition.

### 5.4 Topic representation and naming

An area snapshot contains member IDs, evidence revision, diverse representative IDs, lifecycle status, and optional naming evidence. Centroids may support retrieval but carry no authority. A topic name is generated/extracted only after membership exists and is checked for grounding against member text. If naming is absent or uncertain, use the neutral `Emerging Knowledge NN` form.

Names may change without changing membership or canonical memories. Equal names never merge areas; different names never split them. Naming quality and membership quality have separate metrics and promotion gates.

### 5.5 Derived identity and reconciliation

For a pure recomputation, the area content identity is a hash of sorted member IDs and evidence-policy revision. A future presentation identity may reconcile old and new derived areas by deterministic maximum member overlap with one-to-one tie-breaking. Splits and merges create explicit lineage rather than pretending an arbitrary old ID remained semantically identical. None of this changes canonical memory IDs.

## 6. Exact proposed interfaces

```js
retrieveTopicCandidates(memory, areaSnapshots, {
  maximumAreas: 4
}) -> {
  candidates: [{ areaId, representativeMemoryIds, retrievalRank, retrievalScore }],
  retrievalAuthority: false
}

scoreTopicRelation(leftMemory, rightMemory, {
  modelRevision,
  calibrationRevision
}) -> Promise<{
  sameScore,
  differentScore,
  forwardDecision,
  reverseDecision,
  decision: "SAME_AREA" | "DIFFERENT_AREA" | "UNCERTAIN",
  reason,
  inferenceMilliseconds,
  canonicalAuthority: false
}>

validateTopicBoundary(leftMemoryIds, rightMemoryIds, evidenceIndex, {
  maximumChecks: 12,
  requireCompleteBoundary: true
}) -> {
  decision,
  checks,
  missingPairIds,
  mergeAllowed,
  reason
}

deriveTopicGraph(memories, relationEvidence, policyRevision) -> {
  nodes,
  edges,
  blockedBoundaries,
  uncertainBoundaries,
  areas,
  orderDeterministic: true,
  persistence: "NONE"
}

nameTopicArea(area, representativeMemories) -> {
  label,
  groundingEvidence,
  namingAuthority: false
}
```

The relation scorer is the only prospective membership authority. Retrieval, labels, centroids, pathways, neural routes, and graph adjacency cannot substitute for it.

## 7. Performance and storage bounds

For `N` memories, full all-pairs authority costs `O(N²)` pair inference and is rejected for steady-state use. On each new memory:

1. embedding retrieval is `O(Nd)` with the current linear store (an ANN index is optional only if later justified);
2. top-K areas times R representatives gives at most `O(KR)` initial scorer calls;
3. a proposed merge performs bounded boundary completion, retaining the existing 12-check ceiling;
4. cached evidence is reusable only when both canonical texts, model revision, calibration revision, and policy revision match.

The graph snapshot and evidence cache are derived data. A shadow proof of concept remains in memory. Any future IndexedDB storage needs a separate schema decision; schema v1 is unchanged here.

The target browser budget for a proof of concept must be declared before candidate selection: preferably no more than 150 MB downloaded model assets, under 512 MB measured peak working memory, desktop WASM warm bidirectional-pair latency under 500 ms, and representative mobile latency under 1.5 seconds. Failure is reported rather than hidden by reducing semantic checks. WebGPU and WASM behavior must be measured independently.

## 8. Minimal falsifiable proof-of-concept plan

No implementation should begin until an evidence candidate documents its training objective, license, immutable revision, ONNX graph, tokenizer contract, quantization, supported languages, and Transformers.js operator compatibility.

1. **Freeze the relation specification.** Independently annotate broad-subject co-membership, ambiguity, and rationale. Resolve label disagreements without using model output.
2. **Separate data by subject.** Use topic-disjoint training (if training is needed), calibration, development, and held-out test partitions. Keep the existing frozen corpora untouched and outside threshold selection.
3. **Preflight offline.** Test the raw scorer against same-topic/different-proposition positives, structural hard negatives, unrelated subjects, ambiguous cases, English, Swedish, Spanish, and cross-lingual pairs. Reject it before browser integration if separation is absent.
4. **Calibrate abstention once.** Select same/different thresholds only on the calibration split and seal them with a calibration revision before opening frozen results.
5. **Build one shadow adapter.** Lazy-load only under semantic debug, serialize inference, copy outputs, expose provenance and raw logits, and perform no writes or production imports.
6. **Measure retrieval separately.** Report candidate-area recall@K; retrieval misses remain singletons and do not count as scorer errors.
7. **Run pair gates.** Evaluate the frozen 70 pairs, five hard negatives, unseen topics, multilingual cases, symmetry, calibration, coverage, and abstention.
8. **Run graph gates.** Reproduce bicycle/bee and trading/programming partitions, singleton preservation, complete boundaries, shuffled-order equivalence, and deliberately adversarial bridge cases.
9. **Measure browser cost.** Record artifact bytes, initialization, first/warm pair inference, complete simulation time, backend, peak memory where available, and mobile results.
10. **Stop and decide.** Do not prompt-tune, relabel, or adjust thresholds after viewing frozen failures. A failed scorer is rejected; graph rules are not weakened.

## 9. Go/no-go criteria

### Semantic evidence gates

- 5/5 critical hard negatives are `DIFFERENT_AREA` (not `UNCERTAIN`);
- at least 95% different-topic rejection;
- at least 80% same-topic recall;
- thresholds fixed on separate calibration topics before frozen evaluation;
- symmetry failures become `UNCERTAIN` and are included in abstention;
- coverage and abstention are reported, with no forced decisions;
- held-out subjects demonstrate open-vocabulary generalization;
- Swedish, Spanish, and cross-lingual claims pass separately or are explicitly unsupported.

### Retrieval and graph gates

- at least 95% recall@K for valid candidate areas on held-out same-topic additions, with 100% on the two regression corpora;
- exact cycling and bee triples, exact trading and programming triples, and all expected unrelated singletons;
- no incoherent area, no single-edge chain merge, and no merge across missing/uncertain evidence;
- identical partitions, evidence IDs, and derived content IDs under input permutation;
- all-member complete boundaries for small evaluation clusters;
- canonical memories remain byte-for-byte unchanged and no shadow write occurs.

### Runtime gates

- model/artifact license and immutable provenance verified;
- supported Transformers.js WebGPU/WASM path verified without cloud inference;
- declared download, memory, startup, warm-pair, full-corpus, and mobile measurements meet the predeclared budget;
- ordinary startup performs no new model initialization or download.

Every gate is conjunctive. Passing clustering fixtures cannot compensate for failing pair evidence, and abstention cannot be counted as different-topic rejection.

## 10. Risks and unresolved questions

1. No verified small browser model is currently known to have the required topic co-membership training objective.
2. Constructing representative topic-disjoint multilingual training and calibration data may be the dominant cost and source of bias.
3. “Broad subject” has legitimate granularity ambiguity (for example, bicycles versus transportation); annotation policy must be explicit and tested for agreement.
4. Pairwise local consistency does not guarantee a unique global partition when positive/negative evidence conflicts. The conservative deterministic policy can split valid areas; it must never resolve conflict by unsafe merging.
5. Bounded representatives reduce cost but are not complete-link. Large-area safety needs adversarial validation or periodic all-boundary audit.
6. Model updates invalidate calibration and cached edges; revision migration and graph re-derivation require explicit lifecycle handling.
7. Multilingual and cross-lingual calibration may require a model or data budget incompatible with mobile browsers.
8. Naming remains a separate unsolved grounded-generation/extraction problem, but neutral labels allow membership research to proceed without it.

## 11. Recommendation

**Do not implement or promote Knowledge Area 2.0 semantic authority now.** The Topic Graph, selective three-way relation contract, and conservative boundary policy are technically defensible organization layers, but they cannot operate honestly without the missing task-aligned pair evidence.

The next permissible step is not another speculative model integration. It is a separately reviewed evidence phase that identifies either (a) an existing compact sequence-pair model demonstrably trained for topical co-membership, or (b) a feasible plan to train and calibrate such a classifier with topic-disjoint multilingual data, then rejects it offline unless it clears preliminary separation gates. Only one qualified artifact should proceed to the minimal browser shadow proof of concept.

Production remains on Knowledge Areas 1.0 until that proof of concept passes every semantic, graph, retrieval, and runtime gate. Canonical identity, Teach, current clustering, routes, specialization, five neurons, four synapses, IndexedDB v1, token payments, UI, renderer, and static local-first operation remain unchanged.
