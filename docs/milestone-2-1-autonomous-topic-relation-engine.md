# Milestone 2.1 decision: Autonomous Topic Relation Engine

**Final status:** `NO_GO_NO_VIABLE_SEMANTIC_AUTHORITY`  
**Production promotion:** prohibited  
**Experimental model integration:** not started  
**Reason:** no verified browser-native candidate currently matches Mindling's broad-topic co-membership task and declared quality gates

## 1. Executive decision

This milestone cannot responsibly deliver an experimental semantic authority from the available components or verified public artifacts. Implementing another embedding threshold, generic reranker, NLI prompt, or instruction model would repeat already falsified task mismatches. Training a new classifier would require a topic-disjoint, multilingual, independently reviewed relation dataset and a calibrated exported artifact; neither exists in the repository or approved inputs.

Therefore:

- no model is installed, downloaded, fine-tuned, or silently substituted;
- no mock output is counted as a semantic decision;
- the 100,000-case benchmark remains honest about performing zero semantic comparisons;
- the Topic Graph remains an architecture contract without positive edges;
- production remains unchanged.

This is a `NO-GO` result with a concrete unblock condition, not an assertion that browser-native topic reasoning is impossible.

## 2. Repository audit

### Reusable, implemented components

1. **Canonical memory identity:** production proposition identity, reinforcement, and Teach behavior are frozen and independent of topic membership.
2. **Knowledge Areas 1.0:** deterministic complete-link clustering, stable derived member hashes, singleton support, representatives, cohesion, development, and neuron participation are implemented. Its MiniLM cosine evidence is not topic authority.
3. **Knowledge Area 2.0 contracts:** provisional topics, `SAME_AREA` / `DIFFERENT_AREA` / `UNCERTAIN`, copied inspection data, and conservative complete-boundary validation are suitable for a future shadow authority.
4. **Topic Graph decision:** canonical memories as nodes, independently verified signed pair evidence, missing/uncertain evidence that cannot merge, and naming isolated from membership are specified.
5. **Browser inference infrastructure:** Transformers.js 3.8.1 loaders, WASM/WebGPU selection, serialized calls, copied outputs, explicit failures, debug gating, and model provenance already exist.
6. **Evaluation:** the frozen 70-pair matrix, five hard negatives, bicycle/bee and trading/programming corpora, multilingual cases, and order tests are reusable and remain outside calibration.
7. **Scale benchmark:** deterministic 1k/10k/100k/1m data tiers, isolated IndexedDB, checkpoints, resume, provenance, imports, performance samples, and JSON/CSV reports are implemented. The automated 100,000-case run proves runner mechanics only.

### Experimental or rejected components

- MiniLM is useful for retrieval but produced real same-topic/different-topic score inversions.
- NLI, paraphrase, and STS support proposition or textual relations, not broad-topic co-membership.
- multilingual E5 was implemented and audited correctly, but hard negatives scored at least as strongly as same-topic cases.
- the Jina tiny reranker did not establish calibrated co-membership evidence.
- FLAN-T5 Small generated locally through WASM but failed topic discovery and every bounded preliminary verification format; it is rejected.

### Missing capability

Mindling still lacks a **calibrated, selective, multilingual sequence-pair classifier trained and evaluated specifically for broad-topic co-membership**. Candidate retrieval, graph clustering, and naming cannot replace this missing evidence source.

## 3. Required authority contract

The semantic authority must consume raw memory text without expected labels, generated topic names, pathways, keywords, or embedding scores:

```js
scoreTopicRelation(memoryA, memoryB) -> Promise<{
  decision: "SAME_AREA" | "DIFFERENT_AREA" | "UNCERTAIN",
  sameScore: number,
  differentScore: number,
  calibrated: boolean,
  calibrationRevision: string,
  modelId: string,
  modelRevision: string,
  forward: { scores, decision },
  reverse: { scores, decision },
  reason: string,
  inferenceMilliseconds: number,
  productionAuthority: false
}>
```

It must be symmetric in meaning. Both input orders are evaluated; disagreement abstains. Separate thresholds fixed on a subject-disjoint calibration set define `SAME_AREA`, `DIFFERENT_AREA`, and the `UNCERTAIN` interval. Confidence without calibration is reported as a raw score, not probability.

No current implementation satisfies this contract semantically. Returning `UNCERTAIN` with `NO_VALIDATED_TOPIC_RELATION_AUTHORITY` is the only truthful current behavior.

## 4. New candidate screening

The screening question was not “can this model run in Transformers.js?” but “was it trained to answer broad-topic co-membership, and is there evidence that it can clear Mindling's gates?”

| Candidate/family | Verified objective and browser facts | Task alignment | Decision |
| --- | --- | --- | --- |
| `sentence-transformers/bert-base-wikipedia-sections-mean-tokens` | Wikipedia-section triplet learning: positives come from the same article section and negatives from another section; its documentation reports 80.42% test accuracy and describes it as useful for fine-grained clustering | Closest discovered public objective, but it remains a bi-encoder metric, English-only in the published model, has no verified project-compatible pinned browser artifact, and reported aggregate accuracy cannot satisfy Mindling's 95% different-topic gate | Do not integrate |
| `Horizon-Labs/multilingual-reranker-small` | 141M multilingual query/passage reranker with Transformers.js instructions; its card lists a 268 MB quantized ONNX graph and one relevance logit | Browser-capable and multilingual, but trained on LLM-written queries and passage relevance/listwise teacher scores—not symmetric memory co-membership; also exceeds the preferred 150 MB artifact budget | Do not repeat the failed generic-reranker experiment |
| `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | multilingual MiniLM cross-encoder trained on machine-translated MS MARCO for information retrieval in 14/15 languages | Query/passage ranking is directional relevance, not same broad subject; no task-aligned calibration evidence | Do not integrate |
| Existing NLI/paraphrase/STS/E5/Jina/FLAN stack | Already measured locally against Mindling fixtures | Empirically insufficient or task-mismatched | Rejected for authority |
| New custom pair classifier | Could target the exact relation and be exported to ONNX | Architecturally correct family, but no independent topic-disjoint multilingual training/calibration corpus or trained artifact exists | Only valid future path; blocked now |

Sources reviewed:

- [Sentence Transformers Wikipedia Sections models](https://www.sbert.net/docs/pretrained-models/wikipedia-sections-models.html)
- [ACL 2018: Learning Thematic Similarity Metric from Article Sections Using Triplet Networks](https://acl2018.org/paper/1584/)
- [Horizon-Labs multilingual-reranker-small model card](https://huggingface.co/Horizon-Labs/multilingual-reranker-small)
- [cross-encoder/mmarco-MiniLM-L12 model card](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1)

These sources provide a useful future training direction, but none provides direct evidence on Mindling's frozen relation, regression corpora, hard negatives, calibration, or false-merge constraints.

## 5. Why an experimental engine was not fabricated

### Another embedding metric

The Wikipedia Sections objective is materially closer than generic STS, but its public result is still below the overall reliability Mindling needs, it is not multilingual, and the supplied interface remains a distance metric. Selecting a threshold on the frozen 70 pairs would leak evaluation evidence and repeat threshold chasing.

### Another reranker

The newly screened multilingual reranker is technically browser-compatible, but relevance is not equivalence of broad subject. A question and a passage can be relevant while discussing different subjects, and two distinct facts can share a subject without satisfying a query. The Jina experiment already demonstrated why a raw reranker score cannot be assumed to be calibrated topic authority.

### Reusing NLI or a generative prompt

The repository has already established that same-topic facts need not entail one another and that FLAN-T5 Small does not reliably follow or solve the relation prompt. Rephrasing the same task again would be prompt search, not new semantic evidence.

### Training from generated benchmark labels

The 100,000-case generator uses synthetic structural topic keys expressly marked `semanticAccuracyAuthority: false`. Training or evaluating against those keys would teach the generator convention, not demonstrate open-vocabulary human subject understanding. The frozen test fixtures also cannot be reused as training or calibration data.

## 6. Benchmark integration status

The benchmark already exposes the truthful integration boundary:

```text
candidate retrieval:          not run
semantic comparisons:         0
SAME_AREA decisions:          0
DIFFERENT_AREA decisions:     0
Topic Graph positive edges:   0
provisional singleton areas:  one per canonical-shaped benchmark memory
reason:                       NO_VALIDATED_TOPIC_RELATION_AUTHORITY
```

No code was added to increment semantic comparisons without actual local inference. No expected pair label is fed to the engine. Consequently, large-scale semantic accuracy, false-merge rate, multilingual consistency, and topic stability under verified edges remain **not measured**, rather than reported as zero-error success.

The existing 100,000-case result remains useful for checkpointing, bounded memory, deterministic recovery, canonical integrity, and storage/throughput mechanics. It is not evidence of autonomous topic formation.

## 7. Minimum evidence package required to unblock implementation

Before one experimental model is integrated, a proposal must provide all of the following:

1. A precise annotation guide for broad-subject co-membership, including granularity and ambiguity.
2. Independently reviewed English, Swedish, Spanish, and cross-lingual pairs.
3. Topic-disjoint training, calibration, development, and held-out test splits.
4. Structural hard negatives, shared-word/different-topic pairs, same-topic/different-proposition pairs, ambiguous and incomplete memories, and unseen subjects.
5. Inter-annotator agreement and adjudication records; AI labels alone cannot be gold authority.
6. A trained compact sequence-pair artifact with immutable revision, license, tokenizer, ONNX graph, quantization, and browser operator compatibility.
7. Raw-logit separation on held-out development data before threshold selection.
8. Calibration performed once on the calibration split, with its revision sealed before opening frozen Mindling results.
9. A projected artifact size at or below 150 MB, or an explicit approved exception, plus measured WASM and WebGPU feasibility.

Only then should one candidate receive a debug-only adapter. Candidate retrieval may reuse MiniLM, but final decisions must come from the pair authority.

## 8. Required evaluation sequence

1. **Preflight:** reject the model offline if raw same/different distributions are not separable on held-out subjects.
2. **Browser contract audit:** verify tokenizer inputs, output logits, copying, serialization, determinism, backend consistency, and calibration application.
3. **Frozen pair evaluation:** run the existing 70 pairs without tuning.
4. **Regression graphs:** derive bicycle/bee and trading/programming areas using complete-boundary evidence.
5. **Multilingual:** evaluate Swedish, Spanish, and cross-lingual pairs separately.
6. **Candidate retrieval:** require valid existing areas to appear within bounded top-K retrieval; report retrieval misses independently.
7. **Scale:** only after semantic gates pass, run 1k and 10k independently verified cases, then 100k; one million remains conditional on browser quota and runtime.
8. **Order and recovery:** compare signed edge sets and partitions across input orders and interruption checkpoints.

At no stage may synthetic or AI-only labels be presented as independent semantic accuracy.

## 9. Unchanged go/no-go gates

- 5/5 critical hard negatives classified `DIFFERENT_AREA`, not `UNCERTAIN`;
- at least 95% different-topic rejection;
- at least 80% same-topic recall;
- coherent bicycle/bee and trading/programming partitions;
- unrelated singletons preserved;
- no weak-edge chain merge;
- order-resistant signed edges and partitions;
- reported coverage and abstention;
- independently measured multilingual behavior;
- acceptable artifact download, initialization, pair latency, memory, storage, and mobile behavior;
- zero canonical mutation and zero production writes.

All gates are conjunctive. A candidate that cannot clear preliminary pair gates is rejected before scale testing. Processing 100,000 memories does not compensate for semantic failure.

## 10. Performance report

No new semantic runtime exists, so no new model latency, memory, artifact size, or comparison-throughput measurement is reported. The only newly screened browser-capable reranker advertises a 268 MB q8 ONNX artifact, above the current preferred budget, and remains task-mismatched regardless of runtime.

The benchmark's existing infrastructure result is unchanged: automated tests execute, interrupt, and resume 100,000 provisional operations deterministically with zero canonical mutations and zero semantic comparisons. Browser IndexedDB quota, real device heap, and the one-million tier remain environment-dependent.

## 11. Failure analysis and recommendation

**Failure:** the requested semantic authority cannot be established from current models, public evidence, or project data without either repeating a disproven task proxy or training a new classifier without valid supervision.

**Evidence missing:** a task-aligned multilingual model artifact, topic-disjoint human-reviewed data, calibrated abstention, held-out separation, and browser measurements.

**Smallest defensible addition:** one compact sequence-pair classifier trained explicitly for open-vocabulary broad-topic co-membership, with a separately reviewed multilingual dataset and calibration protocol. This is a data-and-model research project, not an application threshold or graph change.

**Recommendation:** `NO-GO`. Do not implement another model adapter, do not alter the production engine, and do not claim autonomous Knowledge Area formation. Approve a dataset/annotation and offline-model-development phase first. Resume browser work only when one artifact arrives with the complete evidence package above.

Canonical identity, canonical memories, production Knowledge Areas, Teach, MiniLM threshold, Topic Graph contracts, neurons, synapses, routing, specialization, IndexedDB v1, benchmark isolation, UI, renderer, and local-first operation remain unchanged.
