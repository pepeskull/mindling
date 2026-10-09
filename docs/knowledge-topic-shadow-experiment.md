# Knowledge topic E5 shadow experiment

**Status:** `REAL_BROWSER_VALIDATION_REQUIRED`  
**Research baseline:** `04070e9f64f8b20264a163b36c5c8e76a3f3c42c`  
**Candidate:** `Xenova/multilingual-e5-small` only  
**Authority:** development-only, observational, nonpersistent

## Purpose and frozen scope

This experiment measures whether multilingual E5 provides better evidence than production `Xenova/all-MiniLM-L6-v2` for the question:

> Do distinct canonical memories concern the same coherent broad knowledge subject?

It does not change canonical identity, Teach, production Knowledge Areas, routes, specialization, UI, renderer, profile export, or IndexedDB. It is not M3.3.4, Stage Preview, or M4. Node/mock tests validate isolation and deterministic mechanics only; they do not establish semantic quality.

## Model configuration

| Property | Value |
| --- | --- |
| Identifier | `Xenova/multilingual-e5-small` |
| Revision | `main` |
| Quantization | `q8` |
| Verified graph size | approximately 118 MB (`model_int8.onnx` / `model_quantized.onnx`) |
| Loader | existing pinned Transformers.js `3.8.1` runtime |
| Cache | existing browser and WASM cache settings |
| Provider policy | try WebGPU when exposed; record failure; fall back to WASM; never fall back to MiniLM as the E5 result |
| Initialization | lazy, only through a debug API call |

The artifact size was verified against the [Xenova ONNX repository](https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx). Actual transferred bytes, tokenizer/config cost, decoded memory, provider compatibility, and cache behavior must be recorded in the real browser.

### Symmetric input format

E5 documents `query:` and `passage:` task prefixes. Knowledge-area membership compares two peer corpus records, not a search query with a document. The diagnostic therefore encodes **both** canonical facts as:

```text
passage: <canonical memory text>
```

It mean-pools and normalizes both outputs, then computes one symmetric cosine. It does not try multiple prompt variants or average query/passage directions after inspecting benchmark results.

Every E5 call is serialized through its own inference queue. Each output is copied into an independent `Float32Array` before the model session is reused.

## Debug gating and failure behavior

The APIs exist only when the existing semantic debug gate is active: `localhost` or `?semantic-debug=1`. Merely starting Mindling never invokes the E5 loader. The first E5 diagnostic call initializes the model exactly once and reuses it thereafter.

If both WebGPU and WASM fail, the promise rejects, `e5Status()` reports `unavailable` with the actual error, and production continues unchanged. The experiment never substitutes MiniLM and calls that an E5 result.

## Frozen diagnostic data

`runKnowledgeTopicE5Matrix()` reuses all 70 M3.3.3 English pairs without rewriting them:

- all 36 pairs from the nine-memory corpus;
- 15 within-subject generalization pairs;
- 10 cross-subject pairs;
- the five predefined parallel-structure hard negatives;
- four same-topic/different-structure pairs.

Each row includes `group`, `expected`, `left`, `right`, `productionMiniLMCosine`, `e5Cosine`, E5 input metadata, dimensions, and observed timing. Unique sentence embeddings are cached only for that matrix run, avoiding duplicate inference without persisting experimental vectors.

The result summarizes raw E5 distributions independently for `SAME_TOPIC`, `DIFFERENT_TOPIC`, hard negatives, and same-topic/different-structure rows. Each summary reports count, minimum, maximum, median, mean, p10, p25, p75, and p90. It reports whether the raw ranges separate; it does not manufacture a classifier when they overlap.

## Multilingual held-out set

`runKnowledgeTopicE5Multilingual()` contains six small held-out comparisons:

- Swedish same-topic and different-topic pairs;
- Spanish same-topic and different-topic pairs;
- English/Swedish same-topic;
- English/Spanish different-topic.

These examples are not used to tune a threshold. Fluent-speaker review should be repeated before treating their semantic labels as evaluation evidence.

## Nonpersistent cluster simulation

`simulateKnowledgeAreasE5()` uses the current active memories only when there are exactly nine; otherwise it uses isolated in-memory copies of the frozen nine-memory corpus. It encodes each fact once, computes raw pair evidence, sorts stable IDs, and applies complete-link merging only when the caller explicitly supplies an experimental threshold.

With no threshold—the required first run—it returns singleton shadow areas, every boundary remains uncertain, and all raw pair evidence is available. This intentionally prevents score inspection from silently promoting a benchmark-fitted cutoff. A later threshold run is permitted only after raw distributions and an independent calibration protocol justify it:

```js
await window.__MINDLING_SEMANTIC_DEBUG__.simulateKnowledgeAreasE5({ threshold: 0.8 })
```

That example is API syntax, **not a recommended threshold**. No result is persisted. Complete-link requires every cross-cluster pair to clear the caller-supplied diagnostic threshold, caps areas at 12 memories, and retains singleton areas.

## Predeclared success criteria

The candidate is promising only if real-browser evidence supports all of the following without weakening them after score inspection:

1. 100% rejection of the five predefined hard negatives.
2. At least 95% `DIFFERENT_TOPIC` rejection on the reviewed benchmark.
3. At least 80% `SAME_TOPIC` recall.
4. No obviously incoherent cluster in the nine-memory simulation.
5. Singleton preservation.
6. Complete-link cluster safety.
7. Order-resistant membership.
8. Reasonable multilingual generalization.
9. `UNCERTAIN` remains available rather than forcing merges.

No decision cutoff is included yet. Raw distributions must first demonstrate a stable separation region; any calibration must use a separate development corpus, not the 70 frozen pairs or nine-memory evaluation corpus.

## Exact browser procedure

Open the deployed application on `localhost` or append `?semantic-debug=1`, then run these commands in order:

```js
// Must say idle before the first E5 call.
window.__MINDLING_SEMANTIC_DEBUG__.e5Status()

// One pair: captures lazy-load/backend information and real pair timing.
await window.__MINDLING_SEMANTIC_DEBUG__.inspectKnowledgeTopicE5(
  "Risk management is important when trading",
  "Traders study market prices"
)

// Must now report ready, backend, loadMilliseconds, provider attempts, and artifact metadata.
window.__MINDLING_SEMANTIC_DEBUG__.e5Status()

// Frozen 70-pair comparison and raw distributions.
const e5Matrix = await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicE5Matrix();
console.table(e5Matrix.rows.map(({ group, expected, left, right, productionMiniLMCosine, e5Cosine }) =>
  ({ group, expected, left, right, productionMiniLMCosine, e5Cosine })));
console.table(e5Matrix.summary.distributions);
e5Matrix;

// Raw, threshold-free nine-memory evidence and singleton/uncertain shadow result.
const e5Nine = await window.__MINDLING_SEMANTIC_DEBUG__.simulateKnowledgeAreasE5();
console.table(e5Nine.pairEvidence);
e5Nine;

// Held-out multilingual evidence; never tune against it.
const e5Multilingual = await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicE5Multilingual();
console.table(e5Multilingual.rows.map(({ group, expected, left, right, productionMiniLMCosine, e5Cosine }) =>
  ({ group, expected, left, right, productionMiniLMCosine, e5Cosine })));
e5Multilingual;
```

Record from Chrome DevTools/Task Manager where feasible:

- network transfer and cache behavior;
- `loadMilliseconds` and selected `backend`;
- first-pair time and subsequent warm pair time;
- `e5Matrix.elapsedMilliseconds`;
- `e5Nine.elapsedMilliseconds`;
- browser-process memory before load, after load, and after the matrix;
- all WebGPU failures and WASM fallback messages.

Browser timing is approximate and includes JS/runtime overhead. Do not imply precision the browser cannot provide.

## Decision outcomes after real validation

The evidence must lead to one of these explicit outcomes:

- `ADD`: E5 uniquely solves topic evidence and must coexist with canonical-retrieval MiniLM.
- `REPLACE_FOR_KNOWLEDGE`: E5 becomes only the Knowledge Area representation; MiniLM remains canonical retrieval.
- `REPLACE`: further identity regressions show E5 can safely replace an existing encoder.
- `REJECT`: E5 does not solve subject evidence or violates browser constraints.
- `UNKNOWN`: evidence remains insufficient.

Current verdict is **`UNKNOWN — REAL_BROWSER_VALIDATION_REQUIRED`**.

## Performance and future bounds

The matrix caches one embedding per unique string. The nine-memory simulation performs nine E5 forwards and 36 cheap cosine calculations. A future production design must encode each new/changed memory once, use bounded nearest-neighbor candidates, and retain complete-link validation; it must not perform model inference over all `O(N²)` pairs or run inference in renderer loops.

## Invariants

- No model is initialized during normal startup.
- No production model, threshold, clustering rule, identity rule, or UI changed.
- No diagnostic method writes IndexedDB or mutates memory/routes.
- Canonical memories, neural routes, and specialization remain unchanged.
- Database remains `mindling-db`, version 1.
- Topology remains five neurons and four synapses.
- `tokenPaymentsEnabled` remains `false`.
- No backend, `/api`, cloud inference, npm runtime workflow, Stage Preview, M4, or Structural Growth was added.
