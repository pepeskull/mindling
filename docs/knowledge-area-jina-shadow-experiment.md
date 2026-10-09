# Jina Knowledge Area shadow experiment

**Status:** `READY_FOR_BROWSER_VALIDATION`  
**Authority:** `SHADOW_ONLY`  
**Persistence:** `NONE`  
**Candidate:** `jinaai/jina-reranker-v1-tiny-en`  
**Semantic success:** not established

## Purpose

This diagnostic tests whether a compact joint-input relevance reranker provides useful evidence for Mindling's **symmetric broad-topic relatedness** relation. It does not classify canonical identity, change Teach, or alter production Knowledge Areas.

The candidate is a relevance reranker, not a trained `SAME_AREA` classifier. Every result therefore preserves raw directional evidence and remains uncalibrated. No threshold is selected from the frozen benchmark.

## Exact model integration

| Property | Value |
| --- | --- |
| Model ID | `jinaai/jina-reranker-v1-tiny-en` |
| Revision | `main` |
| Parameters | approximately 33 million |
| License | Apache-2.0 |
| Runtime | pinned Transformers.js 3.8.1 native ES module |
| Tokenizer | `AutoTokenizer.from_pretrained(modelId)` |
| Model class | `AutoModelForSequenceClassification` |
| Pair input | `tokenizer(query, { text_pair: document, padding: true, truncation: true })` |
| Selected output | one scalar from `logits` |
| Raw meaning | relevance-ranking logit |
| Documented transform | `sigmoid(rawLogit)` for a ranking score; not treated as calibrated probability |
| Quantization | `q8` |
| Expected artifact | `onnx/model_quantized.onnx`, approximately 33.4 MB |
| Provider policy | try WebGPU, record failure, then try WASM |
| Session safety | one independent serialized inference queue |

The model and tokenizer load only after an explicit Jina debug call. Model output is copied immediately into a JavaScript number before temporary tensors are disposed where the runtime exposes `dispose()`. Load and inference errors reject explicitly; there is no cloud or production-model fallback.

The exact artifact selected by Transformers.js, provider operator compatibility, transferred bytes, and runtime output shapes remain subject to real-browser verification through `auditJinaImplementation()`.

## Debug gating

The methods are exposed only by the existing diagnostic gate:

- `localhost`; or
- a URL containing `?semantic-debug=1`.

Normal startup constructs no Jina session and downloads no Jina assets. Jina is absent from Brain Engine, memory evaluation, production knowledge derivation, routes, UI, and renderer logic.

## Scoring contract

The pretrained interface is asymmetric. Mindling's desired relation is symmetric, so each inspection executes sequentially:

```text
forward = model(A as query, B as document)
reverse = model(B as query, A as document)
```

The diagnostic returns:

- forward and reverse raw logits;
- minimum, maximum, and arithmetic mean raw logit;
- absolute directional raw-logit asymmetry;
- the same aggregates for the model-card-documented sigmoid ranking transform;
- separate forward/reverse and total timing.

The mean and minimum are diagnostic aggregates only. None is authoritative, and a positive logit does not imply `SAME_AREA`.

## Diagnostic APIs

### `jinaStatus()`

Returns the exact model and revision, `idle`/`loading`/`ready`/`unavailable` status, selected backend, q8 quantization, load time, provider attempts, artifact metadata, last error, `SHADOW_ONLY`, and `NONE` persistence. Calling status does not initialize the model.

### `inspectKnowledgeTopicJina(left, right)`

Returns both texts, forward/reverse raw logits and sigmoid ranking scores, minimum/maximum/mean/asymmetry aggregates, backend, forward/reverse/total inference timing, raw-score interpretation, `canonicalAuthority: false`, `authority: "SHADOW_ONLY"`, and `persistence: "NONE"`.

### `runKnowledgeTopicJinaMatrix()`

Reuses `KNOWLEDGE_RELATION_MATRIX` directly—the unchanged 70-pair fixture. It does not reconstruct or edit sentences or expected labels. The result contains:

- `rows`: all successful bidirectional pair results;
- `failures`: bounded per-pair errors without silent replacement;
- `expectedPairCount: 70`;
- `summary.distributions`: raw minimum-direction score distributions;
- `summary.relevanceDistributions`: the documented sigmoid transform distributions;
- `summary.asymmetry`: raw directional-asymmetry distributions;
- group counts for `SAME_TOPIC`, `DIFFERENT_TOPIC`, `HARD_NEGATIVE`, and `SAME_TOPIC_DIFFERENT_STRUCTURE`;
- count, minimum, maximum, median, mean, p10, p25, p75, and p90;
- rank-separation probability (the fraction of positive/negative comparisons in the expected order, with ties split);
- raw global range overlap;
- total elapsed time and model metadata;
- `thresholdSelected: false` and `classificationEvaluated: false`.

### `runKnowledgeTopicJinaMultilingual()`

Reuses the existing six Swedish, Spanish, and cross-lingual fixtures. It returns full bidirectional evidence and the same raw summaries while explicitly reporting:

```text
modelLanguageClaim: ENGLISH_FOCUSED
multilingualAuthorityClaimed: false
thresholdTuningAllowed: false
```

Isolated results cannot establish multilingual support.

### `simulateKnowledgeAreasJina()`

Uses the existing nine-memory fixture plus `Plants need sunlight to grow`, creating exactly 45 pair comparisons for ten isolated in-memory records. It does not inspect or mutate live IndexedDB records.

No independently calibrated policy exists, so the simulation intentionally returns:

```text
status: INSUFFICIENT_CALIBRATION
clusteringPolicy: NOT_RUN_WITHOUT_INDEPENDENT_CALIBRATION
completeLinkSafety: PRESERVED_BY_NOT_MERGING
```

It includes every bidirectional pair result and a clearly non-authoritative singleton diagnostic view. Those ten singletons are **not** claimed as a solution. A representative-only approximation is also not claimed to be equivalent to all-member complete-link safety.

### `auditJinaImplementation()`

Runs three identical forward calls and one reverse call, then returns:

- exact ID/revision, tokenizer, model class, runtime, artifact, q8 selection, and backend;
- input keys/shapes, output keys/shapes, selected scalar logit, label metadata, truncation, and padding behavior observed at runtime;
- raw-logit extraction and documented sigmoid transform;
- repeated raw scores and maximum difference;
- forward/reverse asymmetry;
- model-load, first-inference, later-inference, and bidirectional pair timing;
- provider failures and runtime compatibility;
- explicit error, buffer, and temporary-resource handling;
- semantic quality as `NOT_EVALUATED_BY_IMPLEMENTATION_AUDIT`.

Static/mock tests can only yield `IMPLEMENTATION_UNCERTAIN`. In a real browser the method returns `IMPLEMENTATION_CORRECT` only when a single finite logit is observed and repeated inference is deterministic within `1e-5`; otherwise it remains uncertain or throws an explicit malformed-output error.

## Frozen evaluation criteria

No criterion was weakened or encoded as a runtime threshold:

- all five critical hard negatives rejected;
- at least 95% `DIFFERENT_AREA` rejection;
- at least 80% `SAME_AREA` recall;
- no incoherent ten-memory cluster;
- singleton preservation;
- complete-link safety;
- order resistance;
- uncertainty support;
- held-out generalization;
- reasonable browser performance.

This experiment first measures raw ranking/separation. Classification accuracy cannot be reported until a defensible rule is calibrated on separate data and evaluated on the frozen corpus.

## Bounded future architecture under investigation

```text
new canonical memory
  -> MiniLM candidate retrieval
  -> top-K candidate Knowledge Areas
  -> bounded representative memories
  -> bidirectional Jina relevance
  -> SAME_AREA / DIFFERENT_AREA / UNCERTAIN
  -> complete-link cluster safety
```

This is not implemented. Representative checks reduce pair cost but are not mathematically equivalent to comparing every cross-cluster member. A future design must preserve conservative boundary/diversity representatives or retain all-member checks for small clusters; uncertain evidence must keep the memory separate.

## Browser commands

Open localhost or add `?semantic-debug=1`.

### Status before loading

```js
window.__MINDLING_SEMANTIC_DEBUG__.jinaStatus()
```

Expected initial shape includes `status: "idle"`, a null backend/error, q8, `SHADOW_ONLY`, and `NONE`.

### Implementation audit

```js
const audit =
  await window.__MINDLING_SEMANTIC_DEBUG__.auditJinaImplementation();

console.log(audit);
window.__MINDLING_SEMANTIC_DEBUG__.jinaStatus();
```

Capture the audit object, network artifact, selected backend, provider attempts, console warnings, and any exception. Do not infer semantic success from `IMPLEMENTATION_CORRECT`.

### One pair

```js
const pair =
  await window.__MINDLING_SEMANTIC_DEBUG__.inspectKnowledgeTopicJina(
    "Stock trading involves buying and selling shares",
    "Risk management is important when trading"
  );

console.table([pair]);
```

### Frozen matrix

```js
const matrix =
  await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicJinaMatrix();

console.table(matrix.summary.distributions);
console.table(matrix.summary.asymmetry);
console.table(matrix.rows.map(({
  group, expected, left, right,
  forwardRawScore, reverseRawScore,
  minimumRawScore, meanRawScore, rawScoreAsymmetry
}) => ({
  group, expected, left, right,
  forwardRawScore, reverseRawScore,
  minimumRawScore, meanRawScore, rawScoreAsymmetry
})));
matrix.failures;
```

### Multilingual diagnostics

```js
const multilingual =
  await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicJinaMultilingual();

console.table(multilingual.rows);
multilingual.summary;
```

### Ten-memory simulation

```js
const simulation =
  await window.__MINDLING_SEMANTIC_DEBUG__.simulateKnowledgeAreasJina();

console.log(simulation);
console.table(simulation.pairEvidence);
```

## Performance measurements to record

- actual model request and transferred/cached bytes;
- `audit.loadMilliseconds`/`audit.performance.modelLoadMilliseconds`;
- first and later inference milliseconds;
- forward/reverse pair cost;
- matrix `elapsedMilliseconds`;
- simulation `elapsedMilliseconds`;
- selected WebGPU or WASM backend;
- provider fallback errors;
- approximate browser-process memory before and after load where observable.

No measurements are fabricated in this document. Until run, they are `NOT_TESTED`.

## Known limitations

- The model is English-focused.
- Query/document relevance is only a proxy for symmetric broad-topic membership.
- Sigmoid output is a ranking transform, not calibrated area-membership confidence.
- Both directions double pair inference cost.
- q8 WebGPU and WASM compatibility must be verified in the deployed browser.
- The expected 33.4 MB graph excludes tokenizer/config overhead and decoded runtime memory.
- The fixed ten-memory simulation is quadratic but bounded to 45 pairs; it is diagnostic only and not a future full-store design.
- No classification threshold or representative merge policy has been validated.

## Nonproduction confirmation

Jina has no production authority. It is not loaded during normal startup, does not send text to an inference API, and cannot write IndexedDB or mutate Brain Engine state. Production MiniLM, canonical identity, Teach, complete-link grouping, Knowledge Area progress/labels, routes, specialization, UI, renderer, DB v1, five neurons, four synapses, and disabled token payments are unchanged. No backend, `/api`, Stage Preview, M4, taxonomy, keyword rule, synonym list, or benchmark exception was introduced.
