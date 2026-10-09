# Knowledge Area 2.0 Phase 4A: topic-membership classifier feasibility

**Recommendation:** `GO_OFFLINE_POC`  
**Scope:** feasibility and data design only  
**Production status:** blocked; no model selected, installed, downloaded, or trained

## Executive decision

A compact sequence-pair classifier is a technically plausible way to supply the independent evidence required by the open-vocabulary Topic Graph. The problem is sufficiently well-defined for a **small, falsifiable offline pilot**, but not yet for browser integration or production. There is no verified turnkey dataset for Mindling's exact relation, annotation consistency is unproven, multilingual generalization is unproven, and no candidate architecture has demonstrated that it can retain the required quality after quantization.

`GO_OFFLINE_POC` therefore authorizes only dataset-protocol validation and offline learning-curve experiments. It does not authorize selecting a production model, changing runtime dependencies, adding a browser provider, integrating the Topic Graph, or changing Knowledge Areas 1.0.

## 1. Operational topic-membership specification

### Unit of judgment

Annotators receive two independently understandable canonical-memory statements with no model score, generated topic label, pathway, or application category. They answer:

> Would a careful reader place both facts in one coherent, reasonably specific body of knowledge without relying only on shared wording, analogous grammar, or a very broad umbrella?

The relation is symmetric. It concerns the statements' asserted subjects, not whether one entails the other. The annotation includes a short rationale and optional independently written shared-subject phrase for audit; that phrase is never a classifier input or runtime taxonomy.

### Labels

#### `SAME_AREA`

Use when both memories concern the same reasonably specific subject, even when they state different propositions, use different vocabulary, or have different syntax.

- “A bicycle has two wheels and is powered by pedaling” / “Cyclists wear helmets to protect their heads” → `SAME_AREA` under cycling/bicycles.
- “Aperture affects incoming light” / “Shutter speed changes motion blur” → `SAME_AREA` under photography/camera exposure.
- “Stock trading involves buying and selling shares” / “Risk management is important when trading” → `SAME_AREA` under stock trading.

The shared subject must explain both statements directly. “Things people study,” “facts about the world,” or similarly vacuous umbrellas do not qualify.

#### `DIFFERENT_AREA`

Use when the statements require distinct subject bodies, even if they share vocabulary, sentence shape, an activity, or a loose association.

- “Dogs need regular exercise” / “Computers need regular maintenance” → `DIFFERENT_AREA`; shared syntax is not a subject.
- “Traders study market prices” / “Astronomers study distant stars” → `DIFFERENT_AREA`; shared studying is not a coherent domain.
- “JavaScript is used for web development” / “Steel is used for bridge construction” → `DIFFERENT_AREA`; shared construction is linguistic structure.

#### `UNCERTAIN`

Use when the text is underspecified, genuinely multi-topic, depends on unavailable context, or falls on an unresolved granularity boundary. `UNCERTAIN` is not a convenient replacement for a difficult negative.

- “It improves performance” / “Training requires recovery” → `UNCERTAIN`; the referent of “it” is absent.
- “The bank raised rates near the river restoration site” / a finance memory → `UNCERTAIN`; the first memory has competing senses/topics.
- “Quantum computing may transform drug discovery” / a pharmaceutical regulation memory → potentially `UNCERTAIN` unless the annotation policy establishes a dominant shared subject.

### Granularity policy

Annotators apply a **nearest-useful-shared-subject test**:

1. Independently write the most specific ordinary-language subject that directly covers each memory.
2. Move upward only as far as needed to find a shared subject.
3. Accept `SAME_AREA` only if that shared subject would be a useful inspectable Knowledge Area, rather than a vacuous superclass.
4. Mark `UNCERTAIN` when reasonable annotators could choose materially different useful levels.

Narrow-to-broad pairs can be `SAME_AREA` when the narrow fact is a direct part of the broader subject: bicycle gears and cycling equipment. Merely neighboring subjects remain different: bicycle mechanics and urban transport law should not merge solely under “transportation.” The policy is language-independent and does not enumerate allowed subjects.

### Difficult cases

| Case | Rule |
| --- | --- |
| Different facts, same subject | `SAME_AREA`; entailment is unnecessary. |
| Related but distinct subjects | `DIFFERENT_AREA` unless a non-vacuous direct shared subject passes the nearest-useful test. |
| Broad versus narrow | `SAME_AREA` only for a direct parent/subtopic relation useful as one area; otherwise `UNCERTAIN` during the pilot. |
| Ambiguous or context-dependent sentence | `UNCERTAIN`; do not infer missing referents. |
| Multiple subjects in one memory | Compare the asserted dominant subject; if no dominant subject or only one facet overlaps, `UNCERTAIN`. Do not rewrite the canonical memory. |
| Same named entity | Not sufficient. Two facts about an entity may be same-area only if an entity-centered knowledge body is coherent under the policy. |
| Multilingual pair | Apply the same semantic rule across languages; translation equivalence is neither required nor sufficient. |
| Previously unseen subject | Apply the definition directly; never map it to a known training label. |

## 2. Dataset design

### Pair strata

The dataset is a relation corpus, not a topic-classification table. Each item stores two texts, the three-way label, provenance, language pair, independently proposed subjects, rationale, annotator IDs, disagreement history, and a `topic_family_id` used only for split isolation.

Sampling must deliberately cover:

1. **Same-topic/different-fact positives:** complementary propositions within one subject, with lexical overlap ranging from high to absent.
2. **Same-topic/different-structure positives:** paraphrastic structure is avoided; facts cover different aspects of the same field.
3. **Ordinary negatives:** clearly unrelated subjects.
4. **Structural hard negatives:** parallel syntax and shared verbs but different subjects.
5. **Lexical hard negatives:** shared entity/type words used in different domains or senses.
6. **Related-but-distinct negatives:** neighboring disciplines that generic relevance may conflate.
7. **Granularity ambiguities:** plausible direct-parent, multi-topic, and underspecified cases labeled `UNCERTAIN` when policy cannot resolve them.
8. **Multilingual strata:** English, Swedish, Spanish, same-language non-English, and cross-lingual pairs for every relation label.
9. **Unseen long-tail subjects:** literature, repair, law, science, fictional universes, and user-invented domains sampled without creating a runtime taxonomy.

Topic-family identifiers organize evaluation leakage controls; they are metadata, not classifier targets and never ship as application categories.

### Data sources and legal posture

No currently reviewed public dataset directly licenses and labels Mindling's exact three-way relation. The smallest defensible corpus should combine:

- **Purpose-written statements:** paid/consenting annotators author short factual memories and assign the resulting text and annotations under a project-compatible license, preferably CC0. This is the cleanest pilot source.
- **Wikidata-grounded authoring:** use structured facts and hierarchy only as prompts for humans to write independent memories and choose topic-family split groups. Wikidata structured data is CC0, according to its official licensing page. It must not automatically determine pair labels.
- **Carefully tracked Wikimedia text:** only if required. Wikimedia text generally carries CC BY-SA/GFDL obligations, including attribution and share-alike conditions for modifications. It should be stored separately with page/revision attribution and excluded unless project counsel confirms corpus and trained-weight obligations.
- **Opt-in Mindling-like samples:** only with explicit informed consent, documented reuse rights, de-identification, and a prohibition on silently harvesting user memories.

Official licensing references: [Wikidata licensing (CC0 structured data)](https://www.wikidata.org/wiki/Wikidata:Licensing) and [Wikimedia Foundation Terms of Use](https://foundation.wikimedia.org/wiki/Terms_of_Use). Dataset cards and mirrors are not sufficient evidence of rights; provenance must trace to the original source and license revision.

Synthetic generation may propose a small number of adversarial candidates for human review, but it cannot supply the bulk of the evidence or annotate itself. Automatically pairing sentences by Wikipedia category, embedding proximity, Wikidata hierarchy, or a language model would bake an unverified proxy into the target labels.

### Leakage prevention

Split by entire `topic_family_id`, source document, named entity, near-duplicate cluster, and authored template—not by random pair. A subject family appears in exactly one of train, development, calibration, or held-out test. Related parent/child families are assigned together so “cycling” cannot train while “bicycle maintenance” tests unless that transfer is an explicitly separate challenge set.

Recommended partitions:

- **training:** learn weights only;
- **development:** architecture and training choices only;
- **calibration:** choose the two abstention thresholds once;
- **internal held-out:** topic-disjoint learning-curve estimate;
- **frozen Mindling evaluation:** existing 70 pairs and regression corpora, never used for training, model selection, prompt construction, or calibration;
- **external multilingual/long-tail holdout:** untouched until the final offline decision.

Use exact and fuzzy duplicate detection only for leakage auditing, never as topic-label authority. Publish a manifest of hashes, licenses, family assignments, transformations, and split membership.

### Annotation and quality control

1. Train annotators on the operational definition using examples outside every evaluation set.
2. Require two independent labels and subject/rationale fields per pair.
3. Send all disagreements and every `UNCERTAIN` item to a third adjudicator.
4. Blind annotators to retrieval scores, expected benchmark labels, and other annotators.
5. Insert reviewed attention checks and repeated items; monitor per-annotator confusion and drift.
6. Measure nominal inter-annotator agreement overall and by language/stratum. The pilot stops if agreement remains below 0.80 after one protocol revision or if any major language/stratum is below 0.70.
7. Audit at least 10% of agreed items and 100% of hard negatives, cross-lingual items, and adjudicated items.
8. Keep rejected/ambiguous examples with reason codes; do not silently coerce them into negative labels.

Agreement thresholds are project go/no-go requirements, not claims about current data.

## 3. Classifier and training feasibility

### Architecture requirements—not a model selection

The minimum plausible classifier is a compact multilingual encoder that jointly attends to the concatenated pair, followed by a three-class or two-logit selective classification head. Joint encoding matters because the decision depends on cross-text relations; two independently embedded vectors plus cosine would repeat the failed authority.

Required properties:

- symmetric training augmentation (`A,B` and `B,A`) and an explicit inference agreement check;
- raw logits preserved for calibration and diagnostics;
- `SAME_AREA`, `DIFFERENT_AREA`, and abstention derived from thresholds fixed on a separate calibration split;
- maximum input length suitable for short canonical memories, with truncation recorded;
- multilingual tokenizer coverage for English, Swedish, and Spanish;
- immutable base-model, dataset, training, and calibration revisions;
- exportable encoder and classification head to ONNX without custom unsupported operators;
- post-training int8 feasibility measured against an unquantized reference;
- no category vocabulary, label text, embedding score, generated topic name, or pathway feature in the input.

A 20–100 million parameter encoder is the investigation range, not a selected artifact. At int8, weights alone would be roughly 20–100 MB; tokenizer, graph overhead, activations, and runtime memory add to that. The browser target remains preferably at or below 150 MB transferred and below 512 MB measured peak memory.

### Data-volume and compute estimates

These are planning estimates to be validated by learning curves:

| Stage | Human-reviewed pairs | Purpose | Approximate effort |
| --- | ---: | --- | --- |
| Protocol pilot | 300–500 | test definition and agreement across three languages | 40–80 annotator-hours plus adjudication |
| Minimum learning-curve POC | 5,000–10,000 | compare data-size checkpoints and unseen-family behavior | 250–600 annotator-hours plus QA |
| Possible follow-up | 20,000–50,000 | only if curves and error analysis justify expansion | not authorized in Phase 4A |

Fine-tuning a compact encoder at the POC scale is expected to require roughly 10–50 accelerator-hours across seeds and learning-curve checkpoints, plus CPU preprocessing and evaluation. This is an engineering estimate, not a measured commitment. A single lucky run is insufficient: use at least three seeds for the final POC checkpoint and report variance.

Training may occur offline on controlled compute. User text must not be sent to a hosted inference API. The final artifact, if ever approved, performs inference entirely in the browser.

### Quantization and browser feasibility

Export the best offline checkpoint only after it passes unquantized held-out gates. Compare fp32/fp16 where supported and int8 on identical examples; reject int8 if it reduces same-topic recall or different-topic rejection by more than two absolute percentage points or breaks a critical hard negative.

ONNX Runtime Web documents broad browser support for its WASM execution provider and narrower browser support for WebGPU; it also notes that WASM supports all ONNX operators while GPU providers support subsets. Therefore WASM is the compatibility baseline and WebGPU is a separately verified acceleration path, never a silent fallback assumption. Sources: [ONNX Runtime Web compatibility](https://onnxruntime.ai/docs/get-started/with-javascript/web.html), [web execution-provider overview](https://onnxruntime.ai/docs/tutorials/web/), and [WebGPU provider guidance](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).

Before browser integration, inspect graph operators and run deterministic parity tests. Measure artifact bytes, tokenizer/init time, first and warm bidirectional-pair latency, peak JS/WASM/GPU memory where observable, thermal behavior, and mobile failure modes. The preliminary targets are:

- desktop WASM warm bidirectional pair at or below 500 ms;
- representative mobile warm pair at or below 1.5 seconds;
- peak measured memory below 512 MB;
- model assets preferably at or below 150 MB;
- no download or initialization during ordinary startup;
- no quality-changing silent provider fallback.

## 4. Independent evaluation plan

### Metrics

Report the full three-way confusion matrix and, separately:

- same-topic recall (`SAME_AREA` on gold same);
- different-topic rejection (`DIFFERENT_AREA` on gold different);
- critical hard-negative rejection;
- abstention rate and coverage overall and per gold label;
- precision of non-abstained `SAME_AREA` decisions;
- directional disagreement;
- calibration reliability and threshold provenance;
- per-language, same-language, and cross-lingual results;
- candidate-retrieval recall@K separately from classifier quality;
- graph grouping, singleton preservation, order robustness, and bridge resistance;
- browser latency, memory, and artifact size.

`UNCERTAIN` never counts as a correct different-topic rejection or a correct same-topic decision. Macro results cannot hide a failing language or hard-negative stratum.

### Frozen evaluation

After architecture choice and thresholds are sealed, run the unchanged:

1. 70-pair semantic matrix;
2. five critical hard negatives;
3. bicycle/bee ten-memory graph simulation;
4. trading/programming ten-memory graph simulation;
5. same-topic/different-structure cases;
6. multilingual and cross-lingual cases;
7. shuffled-order repetitions and adversarial single-bridge graphs.

Expected corpus groupings are evaluation-only. No fixture topic name, label, or vocabulary enters the classifier or graph logic. Evaluation code records model/data/calibration revisions so results cannot be combined across incompatible checkpoints.

### Existing gates

- 5/5 hard negatives must be `DIFFERENT_AREA`;
- at least 95% different-topic rejection;
- at least 80% same-topic recall;
- correct cycling and bee triples plus four singletons;
- correct trading and programming triples plus four singletons;
- no forced grouping under uncertainty;
- identical partitions under memory-order permutations;
- multilingual claims supported by their own held-out results;
- browser budgets met without weakening complete-boundary safety.

All gates are conjunctive. Thresholds are locked before frozen results are opened. Failure is not repaired by adding benchmark examples to training or calibration.

## 5. Minimal falsifiable offline experiment

### Stage A — definition feasibility

Annotate 300–500 pairs spanning the required strata and languages. Include no frozen evaluation pair. Stop if agreement requirements fail after one protocol clarification; that would show the target relation is not operationally stable enough for supervised learning.

### Stage B — smallest learning curve

Only after Stage A passes, build 5,000–10,000 human-reviewed, topic-family-disjoint pairs. Train one architecture family at several data checkpoints and at least three final seeds. This is an architecture experiment, not a candidate catalog. Compare against two non-authoritative baselines: majority/stratum priors and frozen MiniLM retrieval scores. The classifier must improve relation discrimination, not merely formatting.

### Stage C — sealed test

Select architecture/hyperparameters on development data, calibrate abstention once on calibration families, freeze hashes/revisions, then evaluate the internal unseen-family and multilingual holdouts. Do not open Mindling's frozen corpus unless preliminary gates are met. If they are met, run the frozen pair and graph gates once.

### Stage D — browser preflight only after offline success

Export and quantize one checkpoint, verify logits and decisions against the offline reference, then measure WASM and WebGPU locally. This later stage needs separate approval and is outside Phase 4A.

## 6. Feasibility assessment

| Question | Assessment |
| --- | --- |
| Is the relation defined well enough? | Plausibly yes, subject to the 300–500-pair agreement pilot. Granularity is the key risk. |
| Does a ready-to-use licensed dataset exist? | No suitable exact dataset has been verified. A purpose-built, provenance-controlled dataset is required. |
| Is compact classification technically realistic? | Plausible: joint encoder classification and int8 browser inference are established forms, but quality on this novel relation is unproven. |
| Can it generalize to unseen topics? | Possible only if topic-family splits and long-tail/multilingual holdouts demonstrate it; currently unknown. |
| Is browser deployment plausible? | Yes in principle with an ONNX-compatible compact encoder; actual operators, memory, latency, and quantized quality are unknown. |
| Is production work justified now? | No. Only the offline POC is justified. |

## 7. Stop conditions

Stop the classifier effort if any of the following occurs:

1. Annotation agreement stays below the declared thresholds after one protocol revision.
2. Granularity disagreements cannot be resolved without creating a fixed taxonomy.
3. Legally reusable text and annotations cannot be assembled with auditable provenance.
4. Learning curves plateau below preliminary same/different gates on topic-disjoint validation.
5. Gains disappear on unseen families, structural hard negatives, or multilingual strata.
6. Useful accuracy requires topic names, keyword tables, embedding thresholds, or benchmark leakage.
7. Calibration produces unusable coverage or systematically abstains on same-topic pairs.
8. Quantization breaches quality limits or the artifact exceeds the declared browser budget.
9. WASM/WebGPU execution requires unsupported operators, cloud inference, or ordinary-startup loading.
10. Frozen evaluation fails; do not add its examples to training and retry under the same experiment.

## 8. Risks and unresolved questions

- “Broad subject” is partly a product policy; agreement may vary by culture, expertise, and language.
- Pair labels can be locally consistent yet create globally conflicting graph evidence.
- Purpose-written data may be stylistically narrower than genuine Mindling memories.
- Wikimedia-derived text introduces attribution/share-alike and trained-artifact questions requiring legal review.
- Wikidata hierarchy is useful for sampling but may encode uneven cultural coverage and cannot be label authority.
- `UNCERTAIN` prevalence may make the classifier safe but too conservative to grow useful areas.
- A small encoder may lack world knowledge for obscure or invented topics; a larger one may violate browser budgets.
- Cross-lingual performance may require more data and capacity than English/Swedish/Spanish same-language classification.
- Confidence calibration can drift after quantization, tokenizer changes, or model updates; each revision requires recalibration.
- Dataset stewardship, annotator privacy, bias review, and deletion/correction procedures need owners before collection.

## 9. Final recommendation

`GO_OFFLINE_POC`

Proceed only with Stage A definition/annotation feasibility and, if it passes, the bounded 5,000–10,000-pair offline learning-curve experiment. This is the smallest experiment capable of falsifying both central assumptions: that humans can consistently label open-vocabulary broad-subject co-membership and that a compact joint encoder can generalize that relation to unseen topic families.

Do not select or integrate a browser model, modify production, or expand beyond the pilot until the offline evidence clears the predeclared gates. Knowledge Areas 1.0, canonical identity, canonical memories, Teach, Topic Graph runtime, IndexedDB v1, neural routing and specialization, UI, renderer, five neurons, four synapses, disabled token payments, and local-only operation remain unchanged.
