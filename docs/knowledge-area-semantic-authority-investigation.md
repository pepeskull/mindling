# Knowledge Area semantic authority investigation

**Status:** research only; no implementation or production change  
**Date:** 2026-10-08  
**Final verdict:** `TEST_CANDIDATE`  
**Primary candidate:** `jinaai/jina-reranker-v1-tiny-en`  
**Disposition:** `ADD` for one lazy, shadow-only experiment; not production authority

## Executive conclusion

Mindling should stop using embedding cosine as the **final** Knowledge Area authority. Embeddings remain appropriate for cheap candidate discovery, but the measured MiniLM and correctly implemented multilingual E5 results prove that a cosine geometry can rank syntactically analogous but topically unrelated facts above genuinely co-domain facts.

The missing capability is best named **symmetric broad-topic relatedness classification**: a pairwise, context-aware estimate that two distinct factual memories are relevant to the same coherent subject domain. This is not a widely standardized off-the-shelf label. The closest mature pretrained task is **cross-encoder query–document relevance reranking**, not paraphrase, STS, NLI, or another bi-encoder cosine.

The smallest justified next experiment is exactly `jinaai/jina-reranker-v1-tiny-en`. It is a 33-million-parameter English cross-encoder, Apache-2.0 licensed, explicitly documented for Transformers.js, and has a verified approximately 33.4 MB int8 ONNX graph. It consumes both texts jointly and produces one sigmoid relevance score.[^jina-tiny-card][^jina-tiny-onnx]

This recommendation is deliberately limited:

- it is **English-first**, not the final multilingual solution;
- relevance ranking is a closer proxy, not proof of Mindling's relation;
- because its training interface is asymmetric, a shadow experiment must measure both directions rather than assume symmetry;
- MiniLM remains the bounded retrieval layer;
- complete-link/representative cluster safety remains necessary;
- no threshold, loader, model, or production path is added by this investigation.

## 1. Precise task definition

### Technical name

**Mindling relation:** symmetric broad-topic relatedness (`SAME_AREA`, `DIFFERENT_AREA`, `UNCERTAIN`).

**Closest established model task:** pairwise cross-encoder relevance scoring/reranking.

“Symmetric broad-topic relatedness” is a precise product/task name, not a claim that a standard benchmark with that exact title exists.

### Formal definition

For two distinct canonical factual memories `A` and `B`, `SAME_AREA(A, B)` means:

> A and B concern a sufficiently coherent shared subject domain that presenting them as parts of one developing body of knowledge is meaningful, while preserving both as distinct propositions.

The relation required by Mindling is:

- **symmetric at the product level:** swapping `A` and `B` must not change area membership;
- **broader than equivalence or entailment:** two independent facts can share an area;
- **narrower than generic semantic similarity:** analogous grammar or broad “importance/use/need” semantics is insufficient;
- **conservative:** unresolved evidence returns `UNCERTAIN`, which preserves singleton memories;
- **cluster-conditioned:** pair support is necessary but not enough to permit unrestricted transitive merging;
- **derived and noncanonical:** reorganizing areas never rewrites the underlying memories.

It does **not** mean same proposition, paraphrase, entailment, contradiction, lexical overlap, shared named entity, shared grammar, shared word, shared pathway, or inference in either direction.

### Why the task is difficult

The desired positives often have low proposition similarity:

- aperture/light and shutter-speed/motion-blur;
- chord progression/harmony and tempo/speed;
- buying/selling shares and trading risk management.

The hard negatives deliberately share syntax:

- dogs needing exercise and computers needing maintenance;
- developers using code and chefs using knives;
- trading risk being important and sleep being important.

A useful authority must model the **relation between the subjects of both statements**, not merely their sentence-level semantic resemblance.

## 2. Lessons from completed evidence

| Existing evidence | Keep for | Why it is not area authority |
| --- | --- | --- |
| `Xenova/all-MiniLM-L6-v2` | bounded retrieval | cosine ranks structural analogies and unrelated facts too highly |
| `Xenova/nli-deberta-v3-xsmall` | canonical proposition evidence | same-domain facts need not entail one another and can appear neutral/contradictory |
| `Xenova/paraphrase-MiniLM-L3-v2` | proposition-similarity support | distinct facts in one topic are not paraphrases |
| `cross-encoder/stsb-TinyBERT-L4` | STS diagnostics | graded textual similarity is not co-domain classification |
| `Xenova/multilingual-e5-small` | rejected experiment only | audited implementation was correct, but hard negatives scored higher on average than positives |

The E5 result closes the “just use a better retrieval embedding” path for now. It does not show that every conceivable embedding model must fail; it shows that adding or thresholding another cosine model lacks sufficient task justification.

## 3. Model-family analysis

### A. Bi-encoder embedding similarity

**Training target:** place independently encoded queries/texts near relevant or semantically similar texts.

**Fit:** useful for high-recall candidate retrieval and reusable area centroids.

**Failure mode:** independent encoders compress each sentence before comparison. Cosine can overvalue common semantic/syntactic form and cannot jointly attend to “traders” versus “dogs” while comparing the statements. MiniLM and multilingual E5 already demonstrate this failure directly.

**Browser cost:** best family for throughput: one encode per new memory, cached vectors, cheap cosine thereafter.

**Conclusion:** retain for retrieval; stop using cosine as final authority.

### B. Cross-encoder pair relevance/classification

**Training target:** jointly encode `(query, document)` and predict relevance or a pair label. Every token in one input can attend to every token in the other before the score is produced.

**Fit:** closest available objective. Relevance training with hard negatives can distinguish a document that answers/concerns the query from a merely analogous sentence. Joint attention is the principal architectural difference from failed cosine approaches.

**Failure mode:** retrieval relevance is normally asymmetric and query-oriented; two short declarative facts are out of distribution. A model may reward entailment/answerability rather than broad co-domain membership, or lexical overlap. Raw scores are not calibrated `SAME_AREA` probabilities.

**Browser cost:** one forward pass per pair, so it must run only after bounded retrieval and against bounded representatives.

**Conclusion:** strongest family for one shadow experiment.

### C. Sequence-pair topic classification

**Training target:** ideally a supervised binary/ternary label for same domain across sentence pairs, with hard negatives sharing syntax.

**Fit:** this would align most directly if a general, taxonomy-free, multilingual, compact, browser-ready model and suitable training data existed.

**Failure mode:** the investigation found no verified compact pretrained candidate whose documented label is symmetric broad-topic membership. Conventional topic classifiers predict fixed classes, violating Mindling's emergent-taxonomy requirement. Fine-tuning a bespoke classifier would require a curated dataset and is a separate architecture/data project.

**Browser cost:** potentially similar to a small cross-encoder, but no suitable artifact is currently verified.

**Conclusion:** ideal task formulation, unavailable as a ready candidate.

### D. Zero-shot/NLI classification

**Training target:** entailment between a premise and a label hypothesis or another proposition.

**Fit:** could classify against named topics if topic labels existed.

**Failure mode:** dynamic areas have no trusted labels; generating prompts such as “these are about the same topic” does not change the NLI training objective. Existing NLI evidence already shows same-domain statements are often neutral or contradictory. Prompt wording would become an unvalidated authority.

**Browser cost:** pair inference is already available but would add repeated NLI calls without task alignment.

**Conclusion:** do not repurpose current NLI as area authority.

### E. Lightweight rerankers

**Training target:** distilled cross-encoder relevance, generally query–passage ranking.

**Fit:** preserves joint attention while reducing download, RAM, and latency enough for occasional browser-local pair checks.

**Failure mode:** distillation can remove precisely the nuanced subject distinction needed; small MS MARCO models are English-only and trained for answer retrieval, not symmetric fact co-domain classification.

**Browser cost:** the best practical class. Verified int8 graphs range from approximately 4.5 MB to 33.4 MB among shortlisted English candidates.[^tinybert-onnx][^jina-tiny-onnx]

**Conclusion:** test a compact reranker before accepting a hundreds-of-megabytes multilingual model.

### F. Latent topic modeling / clustering language models

Classical LDA-like methods need enough documents and recurring vocabulary; a young Mindling has very few short facts. BERTopic-style systems still depend on an embedding geometry and clustering, so they do not supply the missing authority. Generative topic labeling would add a much larger model and does not itself validate membership.

**Conclusion:** not the next step.

## 4. Serious candidate shortlist

Only five candidates are retained. “Latency” is a qualitative expectation from architecture/size; exact browser pair latency is **UNKNOWN** until measured on named devices. WebGPU/WASM feasibility means the artifact/runtime path appears realistic, not that Mindling has tested it.

| Rank | Exact model | Family / parameters | Quantized or verified download | Language / license | Browser feasibility | Expected pair latency | Assessment |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `jinaai/jina-reranker-v1-tiny-en` | distilled JinaBERT cross-encoder reranker; 33M | int8 ONNX 33.4 MB; fp32 132 MB | English; Apache-2.0 | official Transformers.js pair example; ONNX; WebGPU/WASM exact behavior **UNKNOWN** | low–medium | **Primary shadow candidate** |
| 2 | `cross-encoder/ms-marco-MiniLM-L6-v2` | MiniLM relevance cross-encoder; 22.7M | CPU-targeted qint8 ONNX 23.2 MB; fp32 91 MB | English; Apache-2.0 | standard sequence-classification ONNX; Transformers.js artifact selection/provider behavior **UNKNOWN** | low–medium | **Fallback** with stronger MS MARCO quality than tiny variants |
| 3 | `cross-encoder/ms-marco-TinyBERT-L2-v2` | two-layer TinyBERT relevance cross-encoder; 4.39M | CPU-targeted qint8 ONNX 4.52 MB; fp32 17.6 MB | English; Apache-2.0 | standard ONNX; direct Transformers.js packaging/provider behavior **UNKNOWN** | very low | browser floor/control; semantic capacity is the risk |
| 4 | `onnx-community/gte-multilingual-reranker-base` | multilingual encoder-only cross-encoder; upstream 306M | int8/quantized ONNX 341 MB; fp16 629 MB | 75 languages upstream; Apache-2.0 upstream | explicit Transformers.js conversion; WebGPU/WASM memory viability **UNKNOWN** | high | best multilingual/task fit, but too large for first browser test |
| 5 | `jinaai/jina-reranker-v2-base-multilingual` | multilingual cross-encoder reranker; parameter count **UNKNOWN in verified source** | int8/quantized ONNX 280 MB; fp16 557 MB | multilingual; CC-BY-NC-4.0 | official Transformers.js/ONNX; provider viability **UNKNOWN** | high | rejected for product licensing and mobile cost |

### 4.1 Primary — `jinaai/jina-reranker-v1-tiny-en`

- **Training/objective:** a relevance reranker distilled from Jina's larger English reranker; joint query/document input and one relevance logit transformed with sigmoid. The model card describes a four-layer, hidden-size-384, 33M-parameter student and evaluates retrieval ranking on BEIR/LoCo/RAG benchmarks.[^jina-tiny-card]
- **Input:** tokenizer receives one text plus `text_pair`; Mindling would evaluate both `(A,B)` and `(B,A)` because its desired relation is symmetric.
- **Output:** one relevance score, not a calibrated topic-membership label.
- **Artifact:** official repository includes Transformers.js usage and ONNX; verified int8/quantized graph is 33.4 MB.[^jina-tiny-card][^jina-tiny-onnx]
- **Why it fits:** joint attention, relevance/hard-negative behavior, small download, permissive license, and the clearest direct browser path.
- **Main risk:** English-only query/document relevance may still confuse analogous statements or reject distinct co-domain facts. It is a proxy and must earn authority on the frozen corpus.

### 4.2 Fallback — `cross-encoder/ms-marco-MiniLM-L6-v2`

- **Training/objective:** MS MARCO passage-ranking cross-encoder; joint query/passages, single relevance logit.[^minilm-card]
- **Parameters/license:** 22.7M; Apache-2.0.[^minilm-card]
- **Artifacts:** verified fp32 ONNX 91 MB and CPU-specific qint8 graphs of 23.2 MB.[^minilm-onnx]
- **Why it fits:** mature compact relevance baseline with better published MS MARCO ranking metrics than the two-layer variant.
- **Main risk:** English-only, asymmetric answer relevance, and the available quantized files are named for CPU instruction targets; the exact portable Transformers.js selection and browser provider behavior must be verified before implementation.

### 4.3 Size floor — `cross-encoder/ms-marco-TinyBERT-L2-v2`

- **Training/objective:** same MS MARCO passage-ranking family.
- **Parameters/license:** 4.39M; Apache-2.0.[^tinybert-card]
- **Artifacts:** fp32 ONNX 17.6 MB and architecture-specific qint8 graphs 4.52 MB.[^tinybert-onnx]
- **Why it fits:** exceptionally small and fast, useful to learn whether joint relevance solves the structural false positives at all.
- **Main risk:** lower retrieval quality and only 128 hidden dimensions/two layers may underfit broad subject relations. It is not preferred merely because it is smallest.

### 4.4 Multilingual semantic fit — `onnx-community/gte-multilingual-reranker-base`

- **Training/objective:** upstream `Alibaba-NLP/gte-multilingual-reranker-base`, an encoder-only relevance reranker trained/evaluated for multilingual retrieval.
- **Parameters/language/license:** 306M, more than 70 languages (75 repository tags), Apache-2.0 upstream.[^gte-card]
- **Artifacts:** the ONNX Community conversion explicitly supports Transformers.js, but the int8 graph is 341 MB and fp16 is 629 MB.[^gte-onnx]
- **Why it fits:** best verified combination of multilingual coverage and relevant cross-encoder objective.
- **Main risk:** large-for-browser download and decoded memory, likely poor mobile first-load experience, custom-code heritage, and still query/document relevance rather than symmetric topic labels.

### 4.5 Multilingual rejected reference — `jinaai/jina-reranker-v2-base-multilingual`

- **Objective/input/output:** multilingual cross-encoder text ranking with Transformers.js support and one pair score.
- **Artifacts:** verified quantized/int8 ONNX is 280 MB; fp32 is 1.11 GB.[^jina-multi-onnx]
- **License:** CC-BY-NC-4.0.[^jina-multi-onnx]
- **Reason not selected:** noncommercial licensing is unsuitable for an unrestricted product recommendation, and its browser cost is too high for a first experiment.

## 5. Qualitative comparison

| Candidate | Semantic task fit | Browser fit | Multilingual fit | Size | Expected latency | Implementation risk | Likelihood of addressing current failure |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jina tiny EN | high proxy | high | low | small | low–medium | low–medium | **highest practical next test** |
| MS MARCO MiniLM-L6 | high proxy | high if portable q8 works | low | small | low–medium | medium | medium–high |
| MS MARCO TinyBERT-L2 | medium proxy | very high | low | very small | very low | medium | medium–low |
| GTE multilingual reranker | high proxy | low | high | large-for-browser | high | high | high semantic potential, low product feasibility |
| Jina reranker v2 multilingual | high proxy | low | high | large-for-browser | high | high + license | not product-eligible as researched |

No candidate is known to solve the frozen benchmark. The ranking identifies which candidate is justified for **one experiment**, not a production selection.

## 6. Multilingual conclusion

### Best semantic/multilingual fit

`Alibaba-NLP/gte-multilingual-reranker-base` is the strongest verified multilingual task match in the shortlist: joint pair scoring, 306M parameters, more than 70 languages, Apache-2.0, and a Transformers.js ONNX conversion. Its 341 MB int8 graph makes it a poor first browser experiment, especially on mobile.[^gte-card][^gte-onnx]

### Best practical next test

`jinaai/jina-reranker-v1-tiny-en` is English-only but tests the more important architectural hypothesis—joint relevance classification—at roughly one tenth of GTE's quantized download. If an English relevance cross-encoder cannot meet the frozen English criteria, paying 341 MB for multilingual capability is not justified.

### Product direction

Use an English-first shadow experiment, not English-only production authority. Swedish, Spanish, and cross-lingual pairs remain held-out evidence. If the English architecture succeeds, a later investigation can decide whether a compact permissively licensed multilingual reranker exists, whether a larger model is acceptable as an optional lazy capability, or whether task-specific distillation is required. No cloud translation or normalization layer is recommended.

## 7. Recommended bounded architecture

The proposed pipeline is justified with one change: embeddings discover candidates but never decide membership.

```text
new canonical memory
  -> existing MiniLM embedding (cheap retrieval only)
  -> top K candidate areas (bounded)
  -> bounded representative selection per area
  -> bidirectional cross-encoder relevance evidence
  -> SAME_AREA / DIFFERENT_AREA / UNCERTAIN
  -> complete-link representative/cluster safety
  -> derived Knowledge Area or singleton
```

### Area retrieval

Retrieve a small fixed number of candidate areas using the new memory against area centroids and representative embeddings. Retrieval should favor recall; failure to retrieve leaves a singleton rather than scanning every area.

### Area representation

Do not classify only against a centroid: a centroid is not text and cannot enter a cross-encoder. Do not rely on one central exemplar: it can hide a heterogeneous boundary. Use at most a small, deterministic representative set:

1. **central exemplar** — the member most representative of the area;
2. **boundary/diverse exemplar(s)** — members least redundant with the central exemplar;
3. **original stable representative** where needed to resist semantic drift.

Existing complete-link reasoning should select representatives deterministically and preserve the original canonical texts.

### Pair authority

Because pretrained rerankers are asymmetric, score `(new, representative)` and `(representative, new)` during the experiment. Do not assume averaging is correct before raw distributions are observed. A future conservative decision could require agreement across directions and across representatives, with a margin reserved for `UNCERTAIN`; exact mapping must be predefined using a separate calibration corpus.

### Cluster safety

A single high-scoring representative cannot authorize a merge. Every required representative boundary must support membership, and any explicit negative or unresolved boundary produces `UNCERTAIN`/singleton. This preserves the complete-link principle without running the model against every historical memory.

### Complexity

Let `K` be candidate areas and `R` representatives per area. Model inference is bounded to at most `2 × K × R` directional pair calls per new canonical memory, not `O(N²)` over all memories. Sessions load lazily outside renderer startup; scores can be cached by `(model revision, canonical memory IDs, direction)` as derived evidence. Canonical text changes or model revision invalidate the cache. No E5 or reranker evidence belongs in canonical memory truth.

## 8. Browser/runtime budget

- **Normal startup:** zero additional download. The authority must load only when a new canonical memory reaches bounded area classification, or in a shadow diagnostic.
- **Initial experiment:** approximately 33.4 MB int8 graph plus tokenizer/config for Jina tiny; actual network bytes, decoded RAM, WASM heap, WebGPU allocation, cold load, and warm latency are **UNKNOWN** until measured.[^jina-tiny-onnx]
- **Inference cadence:** occasional Teach-time classification, never render-loop inference.
- **Session safety:** initialize once, serialize calls if the provider/session requires it, and copy session-owned outputs.
- **WebGPU:** desirable on desktop; exact operator support for the candidate is **UNKNOWN**.
- **WASM:** required fallback for broad compatibility; exact candidate performance is **UNKNOWN**.
- **Mobile:** the 33.4 MB candidate is plausible but still material alongside existing assets. The 280–341 MB multilingual rerankers are not reasonable defaults without exceptional evidence and device measurements.
- **Failure:** unavailable authority must fail to `UNCERTAIN`/singleton, never silently fall back to embedding cosine as final authority.

## 9. Frozen evaluation plan

### Phase 1 — raw model evidence

For all unchanged 70 pairs, collect both directional raw logits and documented transforms. Report separate distributions for `SAME_AREA`, `DIFFERENT_AREA`, five hard negatives, and same-topic/different-structure cases. Do not select a threshold from individual failures. Confirm label/output semantics from model metadata/documentation.

### Phase 2 — frozen decision protocol

If raw relevance shows meaningful separation, define a simple conservative ternary rule using a separate calibration corpus, freeze it, then score the 70-pair evaluation. `UNCERTAIN` is reported separately and never counted as correct.

### Phase 3 — cluster simulation

Run the real ten-memory corpus:

- trading memories 1–3;
- programming memories 4–6;
- music, Earth, dogs, and plants as independent singleton expectations.

Use bounded retrieval and representative complete-link checks. Repeat with shuffled input order. No test label or topic name may enter runtime logic.

### Phase 4 — generalization and multilingual holdout

Retain unseen subjects and structural hard negatives. Run Swedish, Spanish, and cross-lingual cases as held-out evidence, but do not fail the English-only primary for languages it does not claim. Multilingual behavior is required before any eventual multilingual production authority.

### Predeclared success criteria

- 5/5 critical hard negatives rejected;
- at least 95% `DIFFERENT_AREA` rejection on the frozen evaluation;
- at least 80% `SAME_AREA` recall;
- no incoherent cluster in the ten-memory simulation;
- legitimate singleton preservation;
- complete-link cluster safety;
- order resistance;
- `UNCERTAIN` remains available;
- held-out subject generalization;
- reasonable multilingual behavior only if claimed;
- no benchmark-specific vocabulary, prompt, rule, or exception.

False merges remain more harmful than false splits. Criteria must not be weakened after results are observed.

## 10. Final recommendation

### Verdict: `TEST_CANDIDATE`

Run one future shadow experiment with:

> **`jinaai/jina-reranker-v1-tiny-en`**

Optional fallback if its semantic capacity is inadequate but the relevance architecture is promising:

> **`cross-encoder/ms-marco-MiniLM-L6-v2`**

### Disposition: `ADD`

For the experiment, Jina tiny must coexist with MiniLM because their responsibilities differ:

- MiniLM: cheap candidate discovery;
- Jina tiny: bounded joint relevance evidence;
- complete-link representatives: cluster safety.

`ADD` is an experimental architecture disposition, not approval to add a production model. Replacement is not justified: the reranker cannot efficiently replace reusable retrieval embeddings, and no existing production model should be removed before evidence exists.

If the primary cannot separate the frozen English hard negatives and positives, stop. Do not cascade through models or engineer benchmark-specific rules. Reconsider task-specific training/data under a future `ARCHITECTURE_CHANGE_FIRST` investigation.

## 11. Explicit preservation statement

This document changes no code. It installs/downloads no model and changes no dependency, import map, model loader, threshold, clustering rule, canonical identity rule, memory, database, neural route, specialization, UI, renderer, or mobile behavior.

E5 remains rejected and noncanonical. IndexedDB remains `mindling-db` version 1; the Neural Seed remains five canonical neurons and four canonical synapses; `tokenPaymentsEnabled` remains false. No Stage Preview, M4, Structural Growth, backend, `/api`, cloud inference, fixed taxonomy, or manual language rule was introduced.

## Sources

[^jina-tiny-card]: [Jina AI — `jina-reranker-v1-tiny-en` model card](https://huggingface.co/jinaai/jina-reranker-v1-tiny-en) — architecture, 33M parameters, distillation, pair input/output, English scope, Apache-2.0, Transformers.js usage, and ranking evaluation.
[^jina-tiny-onnx]: [Jina AI — tiny reranker int8 ONNX artifact](https://huggingface.co/jinaai/jina-reranker-v1-tiny-en/blob/main/onnx/model_int8.onnx) — verified 33.4 MB artifact.
[^minilm-card]: [Sentence Transformers — `cross-encoder/ms-marco-MiniLM-L6-v2`](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2) — 22.7M parameters, MS MARCO objective, English scope, Apache-2.0, inputs, outputs, and ranking metrics.
[^minilm-onnx]: [MiniLM-L6 ONNX directory](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2/tree/main/onnx) — verified 91 MB fp32 and 23.2 MB qint8 artifacts.
[^tinybert-card]: [Sentence Transformers — `cross-encoder/ms-marco-TinyBERT-L2-v2`](https://huggingface.co/cross-encoder/ms-marco-TinyBERT-L2-v2) — 4.39M parameters, MS MARCO objective, English scope, Apache-2.0, and ranking metrics.
[^tinybert-onnx]: [TinyBERT-L2 ONNX directory](https://huggingface.co/cross-encoder/ms-marco-TinyBERT-L2-v2/tree/main/onnx) — verified 17.6 MB fp32 and 4.52 MB qint8 artifacts.
[^gte-card]: [Alibaba NLP — `gte-multilingual-reranker-base`](https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base) — 306M parameters, multilingual scope, reranking objective, input/output, and Apache-2.0.
[^gte-onnx]: [ONNX Community — GTE multilingual reranker artifacts](https://huggingface.co/onnx-community/gte-multilingual-reranker-base/tree/main/onnx) — Transformers.js conversion and verified graph sizes.
[^jina-multi-onnx]: [Jina AI — multilingual v2 quantized ONNX artifact](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual/blob/main/onnx/model_quantized.onnx) — verified 280 MB artifact, Transformers.js metadata, and CC-BY-NC-4.0 license.
