# Knowledge topic model investigation

**Status:** research only; not an M3.3.4 milestone  
**Baseline:** `569383585e83276a8e59e532025cf30d41b5a0cd`  
**Decision date:** 2026-10-07

## Executive decision

Mindling is missing **broad-subject relevance evidence**, not another proposition-equivalence score. The closest established task is dense information retrieval/document representation: encode short canonical facts so that facts relevant to the same subject are nearer than sentences which merely share syntax. It is still only a proxy for knowledge-domain membership, so the safe architecture remains:

1. cheap embedding candidate discovery;
2. bounded, conservative subject evidence;
3. complete-link cluster validation;
4. singleton or `UNCERTAIN` when evidence is not coherent.

The smallest reasonable next experiment is **`Xenova/multilingual-e5-small`**, used only in a future shadow diagnostic. Its retrieval-oriented, multilingual training is closer to the missing capability than STS, paraphrase classification, or NLI. Its verified q8 ONNX graph is about **118 MB**, before tokenizer/config files, so it is a medium browser model rather than a trivial addition.[^e5-onnx]

The fallback is **`Xenova/bge-small-en-v1.5`**. Its verified q8 ONNX graph is about **34 MB** and its Transformers.js conversion is documented, making it the best small-browser control, but it is English-only.[^bge-onnx]

**Fifth-model verdict: `UNKNOWN`.** A dedicated area encoder is justified for a shadow experiment, but not yet for production. If multilingual E5 passes the subject and hard-negative tests while preserving canonical retrieval behavior, it could eventually **replace** the current retrieval encoder. If it cannot safely replace that encoder but uniquely solves area evidence, retaining it would create a fifth model. Neither outcome is justified without real-browser results.

Nothing in this investigation was promoted to production.

## 1. Problem definition

Knowledge-area membership asks:

> Do these distinct canonical memories concern the same coherent broad subject/domain?

That is different from:

| Capability | Question | Existing authority |
| --- | --- | --- |
| Canonical identity | Do two statements express effectively the same proposition? | Current M3.3 identity architecture; unchanged |
| Semantic retrieval | Which memories are close enough to inspect? | `Xenova/all-MiniLM-L6-v2` |
| Knowledge-area membership | Do distinct facts belong to one broad subject? | Missing |

The real-browser result demonstrates a representation failure rather than a clustering failure. Complete-link correctly accepted every pair according to the supplied cosine evidence, yet grouped `Traders study market prices`, `Anna enjoys classical music`, and `Dogs need regular exercise`. The false trader/dog pair scored about `0.8145`, while the legitimate risk-management/trader pair scored only about `0.4628`. No scalar cosine threshold can order those examples correctly.

False merges are more damaging than false splits. A future authority must therefore allow singleton areas and `UNCERTAIN`, and must not force all memories into clusters.

## 2. Why the four existing models are insufficient

### all-MiniLM-L6-v2

The current 384-dimensional bi-encoder remains useful for cheap retrieval. The 70-pair browser matrix shows that its geometry also rewards shared sentence shape, however, and does not reliably isolate broad subject. Complete-link prevents chain drift but cannot repair incorrect pair evidence.

### nli-deberta-v3-xsmall

NLI answers entailment, neutrality, and contradiction. Distinct facts in one domain commonly do not entail each other, and can even appear contradictory to an NLI model. Photography facts about aperture and ISO can share a subject without sharing a proposition. NLI therefore remains valuable for canonical identity, but its labels cannot safely define area membership.

### paraphrase-MiniLM-L3-v2

Paraphrase similarity asks whether expressions convey similar meaning. Members of a broad area are intentionally distinct facts, so weak paraphrase evidence does not imply different subjects. It may expose some false similarities but cannot serve as area authority.

### stsb-TinyBERT-L4

STS measures graded textual semantic similarity. It does not directly model domain membership, and legitimate same-domain facts can have low STS scores. Prior role-reversal and modality results also show why a generic similarity scalar is unsafe as canonical authority.

## 3. Correct ML/NLP task framing

There is no standard taxonomy-free label called “Mindling knowledge area.” The closest reusable tasks are:

1. **Dense retrieval / document embeddings** — best first proxy. Retrieval training rewards query-document relevance and often includes hard negatives, which is closer to subject relevance than generic sentence similarity.
2. **Pairwise relevance reranking** — useful second-stage proxy. A joint encoder can judge whether one text is relevant to another, but common rerankers are asymmetric query/passage models and are not trained to return symmetric topic identity.
3. **Conservative clustering over a topic-aware representation** — still required. Even a better encoder does not make a pair threshold transitive; complete-link remains the correct protection against chain drift.

Approaches not recommended as the first experiment:

- **Zero-shot topic classification** requires candidate labels and therefore reintroduces a taxonomy.
- **NLI with invented topic prompts** would require generated or authored labels and changes the task without validated supervision.
- **Classical latent-topic models** are unstable on a tiny, evolving collection of one-sentence documents, rely heavily on lexical co-occurrence, and do not naturally provide cross-lingual semantic continuity.
- **Another generic STS/paraphrase model** repeats the mismatch already measured.
- **A larger sentence embedding model by size alone** offers no task-level justification.

### Architectural choice

The likely long-term shape is **Option C, hybrid**, but the next experiment should begin with Option A:

```text
canonical memories
  -> topic/retrieval-oriented embeddings
  -> bounded nearest-neighbor subject candidates
  -> complete-link cluster consistency
  -> SAME_AREA / DIFFERENT_AREA / UNCERTAIN
```

Only if the embedding candidate cannot reject hard negatives should a bounded joint reranker be tested. Full-store cross-encoder comparison would be an unnecessary `O(N²)` inference cost.

## 4. Candidate comparison

Facts marked **UNVERIFIED** must be checked before implementation. Download sizes below describe model graphs, not tokenizer/config overhead or decoded runtime memory.

| Rank | Candidate | Family / task | Parameters | Dimensions | Language | Browser artifact | License | Assessment |
| ---: | --- | --- | ---: | ---: | --- | --- | --- | --- |
| 1 | `Xenova/multilingual-e5-small` | XLM-R-derived E5 dense retrieval; contrastive weak supervision plus supervised retrieval/NLI/Quora mixtures | approximately 118M; exact count **UNVERIFIED** | 384 | model card reports 100 languages | Transformers.js + ONNX verified; q8 118 MB, fp16 235 MB, fp32 470 MB | MIT | **Primary experiment** |
| 2 | `Xenova/bge-small-en-v1.5` | BERT BGE dense retrieval; contrastive learning/hard-negative retrieval | exact count **UNVERIFIED** | 384 **UNVERIFIED from conversion config** | English | Transformers.js + ONNX verified; q8 33.8–34 MB, fp16 66.7 MB, fp32 133 MB | MIT | **Fallback / small control** |
| 3 | `Snowflake/snowflake-arctic-embed-xs` | BERT retrieval embedding; query/document contrastive stages and hard-negative mining | 22M | 384 | English; multilingual support not claimed for this version | Transformers.js and ONNX tags/usage verified; quantized graph size **UNVERIFIED** | license **UNVERIFIED** | Strong small retrieval comparison, but weaker product-language fit |
| 4 | `cross-encoder/ms-marco-MiniLM-L6-v2` | MiniLM joint query/passage relevance ranker trained on MS MARCO | 22.7M | not applicable | English | Upstream ONNX verified; direct Transformers.js conversion, q8 size, WASM/WebGPU behavior **UNVERIFIED** | Apache-2.0 | Hybrid reference only; task is asymmetric passage ranking |

### Candidate 1 — multilingual E5 small

- **Exact identifier:** `Xenova/multilingual-e5-small` (conversion of `intfloat/multilingual-e5-small`).
- **Architecture/objective:** multilingual MiniLM/XLM-R-family bi-encoder trained with contrastive weak supervision, then supervised mixtures. The upstream card documents sources including multilingual web/title-content, translation, Wikipedia, Reddit, scientific, StackExchange, retrieval, NLI, and Quora-style data.[^e5-card]
- **ONNX/Transformers.js:** verified. The official conversion shows a feature-extraction pipeline and q8/int8 files.[^e5-onnx]
- **WASM/WebGPU:** architectural feasibility is plausible through Transformers.js, but successful execution-provider initialization for this exact graph is **UNVERIFIED**. It must be measured in the target browsers.
- **Memory/inference:** q8 download is 118 MB plus a large multilingual tokenizer. Peak WASM heap, WebGPU allocation, initialization time, and warm latency are **UNVERIFIED**; decoded memory will exceed download size.
- **Why it may help:** retrieval supervision and diverse hard negatives are closer to subject relevance; multilingual support aligns with the product direction.
- **Limitations:** still a bi-encoder, still not trained on Mindling's symmetric broad-topic label, and the q8 payload is significant for mobile. Its upstream card warns that low-resource languages may degrade.[^e5-card]

### Candidate 2 — BGE small English v1.5

- **Exact identifier:** `Xenova/bge-small-en-v1.5` (conversion of `BAAI/bge-small-en-v1.5`).
- **Architecture/objective:** compact BERT retrieval embedding model. The model family documents contrastive training, hard-negative mining, and a v1.5 similarity-distribution adjustment.[^bge-card]
- **ONNX/Transformers.js:** verified. The conversion documents feature extraction and provides a 34 MB quantized graph.[^bge-onnx]
- **WASM/WebGPU:** exact target-browser behavior remains **UNVERIFIED**.
- **Memory/inference:** small browser class; q8 weights are ~34 MB plus tokenizer/config. Peak heap and measured latency remain **UNVERIFIED**.
- **Why it may help:** inexpensive retrieval-focused control with hard-negative training.
- **Limitations:** English-only and still a relevance embedding rather than a topic classifier. The model card explicitly warns that absolute cosine values are not intrinsically meaningful, so it cannot justify another magic threshold.[^bge-card]

### Candidate 3 — Arctic Embed XS

- **Exact identifier:** `Snowflake/snowflake-arctic-embed-xs`.
- **Architecture/objective:** 22M-parameter, 384-dimensional BERT embedding model trained for retrieval using large query-document batches followed by hard-negative triplets.[^arctic-card]
- **ONNX/Transformers.js:** model page documents both; exact q8 graph size is **UNVERIFIED**.
- **WASM/WebGPU, peak memory, latency, offline cache size:** **UNVERIFIED**.
- **Why it may help:** compact model with an explicitly retrieval-focused, hard-negative objective.
- **Limitations:** this XS generation is not documented as multilingual, and retrieval benchmarks do not prove short-fact topic clustering.

### Candidate 4 — MS MARCO MiniLM cross-encoder

- **Exact identifier:** `cross-encoder/ms-marco-MiniLM-L6-v2`.
- **Architecture/objective:** 22.7M-parameter six-layer MiniLM sequence classifier trained for MS MARCO passage ranking; it jointly processes a query and passage and returns an unbounded relevance logit.[^msmarco-card]
- **ONNX:** verified upstream. A stable browser-ready q8 conversion, exact download, and Transformers.js/WASM/WebGPU execution are **UNVERIFIED**.
- **Why it may help:** it tests whether bounded joint relevance evidence rejects structurally similar hard negatives better than a bi-encoder.
- **Limitations:** English-only, asymmetric query/passage objective, inference per pair, and no calibrated symmetric `SAME_AREA` label. It is not the first experiment.

## 5. Browser and multilingual trade-offs

| Model | Browser class | Cold-download implication | Expected mobile implication | Multilingual verdict |
| --- | --- | --- | --- | --- |
| multilingual E5 small q8 | medium (50–150 MB) | ~118 MB graph plus large tokenizer/config; cache pressure is material | viable only as lazy, cached diagnostic until RAM/latency measurements pass | preferred; 100-language claim, quality varies |
| BGE small EN q8 | small (≤50 MB) | ~34 MB graph plus small tokenizer/config | most plausible mobile control | unacceptable as final multilingual authority |
| Arctic Embed XS | likely small/medium, exact quantized size **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | English generation |
| MS MARCO MiniLM cross-encoder | exact browser payload **UNVERIFIED** | lazy bounded pair inference required | repeated pair inference is costlier than one embedding per memory | English only |

The multilingual requirement changes the recommendation. BGE is the smallest verified artifact, but adopting it as the final authority would bake an English-only limitation into derived knowledge. Multilingual E5 is the smallest serious multilingual candidate found with a verified Transformers.js ONNX conversion. Larger multilingual models may improve quality, but their browser cost is not justified before this medium candidate is measured.

Model assets may be fetched and cached by the existing browser runtime, but no user text should leave local inference. Offline reliability after cache eviction remains dependent on the existing asset/cache design.

## 6. Ranked shortlist

1. **`Xenova/multilingual-e5-small` — primary.** Best balance of task alignment, multilingual coverage, verified browser artifact, and still-bounded size.
2. **`Xenova/bge-small-en-v1.5` — fallback.** Smallest verified next experiment and useful English control, but not an acceptable multilingual end state.
3. **`Snowflake/snowflake-arctic-embed-xs`.** Excellent compact retrieval-training story; held back by English scope and unverified quantized browser cost.
4. **`cross-encoder/ms-marco-MiniLM-L6-v2`.** A later bounded reranking experiment if embeddings fail; not a symmetric topic classifier and not yet browser-verified.

No candidate is approved as production authority. No purpose-built compact, multilingual, browser-ready classifier with verified labels for symmetric broad-topic membership was found.

## 7. Proposed shadow experiment (not implemented)

### Protocol fixed before scores are viewed

1. Add exactly one lazy diagnostic adapter for multilingual E5; never load it during normal application startup.
2. Preserve current production areas, UI, routing, specialization, and canonical identity.
3. Encode each canonical fact once, copy the output buffer, normalize it, and cache only in diagnostic memory. Use the upstream-required input convention consistently; do not try multiple prefixes and select whichever makes individual examples pass.
4. Run the existing **70-pair M3.3.3 matrix** unchanged.
5. Run the exact nine-memory corpus through a shadow complete-link simulation.
6. Run the same facts in at least three non-English languages, including cross-lingual same-topic and different-topic pairs. Translations must be reviewed by fluent speakers or sourced from a controlled evaluation set.
7. Measure q8 WASM and WebGPU separately: download bytes, initialization, first inference, warm single/batch inference, peak memory where observable, cache reuse, and failure fallback.
8. Repeat all clustering across multiple input orders and verify identical membership.
9. Report `UNCERTAIN` separately; never count it as correct.

The matrix must retain all trading/programming pairs, five stated hard negatives, and four same-topic/different-structure pairs. Expected labels are evaluation metadata only. The nine-memory corpus must remain approximately `3 / 3 / 1 / 1 / 1` as a target, not as a production special case.

### Evaluation architecture

Start by comparing embedding separability and complete-link output. Do **not** add a pair classifier in the same experiment. If E5 improves recall but still admits hard negatives, a second, separately approved experiment may use MiniLM/E5 for top-`k` discovery and a bounded reranker. This isolates which capability contributes the improvement.

### Predefined success criteria

These criteria are fixed before candidate scores or thresholds are inspected:

- **Hard-negative precision:** reject 100% of the five critical parallel-structure hard negatives.
- **Different-topic precision:** at least 95% rejection over the full different-topic matrix.
- **Same-topic recall:** at least 80% over the full same-topic matrix; `UNCERTAIN` is not correct.
- **Nine-memory safety:** no area mixes trading, programming, music, astronomy, or dog exercise; all three unrelated facts remain singleton areas.
- **Nine-memory usefulness:** each intended three-memory subject retains at least two members; the target is both complete three-member groups.
- **Cluster safety:** every multi-memory shadow area passes complete-link evidence; no connected-component or transitive shortcut.
- **Order resistance:** identical membership for every tested input permutation.
- **Generalization:** the same frozen protocol passes held-out subjects and multilingual cases; no benchmark-specific threshold or vocabulary.
- **Browser budget:** q8 assets stay within the medium class, initialization does not crash target mobile browsers, and warm encoding does not visibly block UI. Numeric latency/RAM acceptance limits must be set against a named target-device matrix before implementation because no device budget is currently specified.

Threshold calibration, if needed, must use a newly designated development corpus. The 70-pair matrix and nine-memory corpus remain evaluation sets and must not be mined for per-example fixes.

## 8. Performance and scaling design

An embedding encoder incurs one model forward pass per new/changed canonical memory, not per render. Persisted or derived candidate vectors can then support cheap cosine lookup. For `N` memories, a naive audit is `O(N²)` cosine work but no `O(N²)` model inference; production should use bounded nearest-neighbor candidates as `N` grows. Complete-link checks operate only on candidate cluster merges and retain the existing maximum area bound.

A future reranker, if required, must run only on a fixed top-`k` candidate set, with a separate serialized session and copied outputs. It must never scan every stored pair or run inside a renderer loop.

## 9. Risks and unresolved checks

- Retrieval relevance may still not equal symmetric domain membership; real scores can reproduce the current failure.
- Multilingual E5's 118 MB graph plus tokenizer may exceed practical mobile cache/RAM budgets.
- Quantization may alter the narrow score separation needed by clustering.
- Short standalone facts differ from typical query/passage training distributions.
- A single global threshold may remain inappropriate across languages or subjects.
- Exact parameter count for multilingual E5 and BGE, BGE conversion embedding dimension, and Arctic license/quantized size require direct artifact/config verification.
- Exact WASM and WebGPU operator coverage, initialization success, peak memory, and latency for every candidate are **UNVERIFIED** until real-browser execution.
- MS MARCO MiniLM needs a verified Transformers.js-compatible ONNX artifact and explicit symmetric-use protocol before it can be considered.
- Cache behavior and offline restoration must be tested under eviction, private browsing, and mobile storage pressure.

## 10. Invariant confirmation

This investigation adds documentation only:

- no model was installed or downloaded into the repository;
- no production semantic behavior or threshold changed;
- canonical identity, Teach behavior, memories, variants, and persistence are unchanged;
- production knowledge clustering is unchanged;
- neural routes and neuron specialization are unchanged;
- no fixed taxonomy, keyword classifier, topic vocabulary, or cloud inference was introduced;
- IndexedDB remains `mindling-db`, version `1`;
- the canonical topology remains five neurons and four synapses;
- `tokenPaymentsEnabled` remains `false`;
- no Stage Preview, M4, Structural Growth, backend, `/api`, framework, or production model was added.

## Sources

[^e5-card]: [intfloat/multilingual-e5-small model card](https://huggingface.co/intfloat/multilingual-e5-small) — upstream objective, datasets, language coverage, license, and limitations.
[^e5-onnx]: [Xenova/multilingual-e5-small ONNX files and Transformers.js usage](https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx) — browser conversion and graph sizes.
[^bge-card]: [BAAI/bge-small-en-v1.5 model card](https://huggingface.co/BAAI/bge-small-en-v1.5) — objective, English scope, MIT license, usage, hard-negative guidance, and similarity caveat.
[^bge-onnx]: [Xenova/bge-small-en-v1.5 ONNX files and Transformers.js usage](https://huggingface.co/Xenova/bge-small-en-v1.5/tree/main/onnx) — browser conversion and graph sizes.
[^arctic-card]: [Snowflake/snowflake-arctic-embed-xs model card](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs) — 22M parameters, 384 dimensions, retrieval training, ONNX and Transformers.js availability.
[^msmarco-card]: [cross-encoder/ms-marco-MiniLM-L6-v2 model card](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2) — 22.7M parameters, MS MARCO ranking objective, English scope, ONNX tag, license, and relevance-logit behavior.
