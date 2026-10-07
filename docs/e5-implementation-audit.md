# Multilingual E5 implementation audit

**Scope:** diagnostic-only implementation audit  
**Model:** `Xenova/multilingual-e5-small` (`main`, q8)  
**Final pre-browser verdict:** `IMPLEMENTATION_UNCERTAIN`  
**Validation:** `REAL_BROWSER_VALIDATION_REQUIRED`

## Audit question

This audit asks only whether Mindling obtains and compares the intended multilingual E5 sentence embeddings correctly. It does not evaluate or change canonical identity, production MiniLM, Knowledge Area membership, complete-link clustering, thresholds, routes, specialization, or persistence.

The prior shadow experiment successfully initialized through WebGPU, but its pipeline-level cosine output was compressed near one. The previous use of the Transformers.js feature-extraction pipeline requested `pooling: "mean"` and `normalize: true`; that abstraction returned only the final vector and did not expose enough evidence to independently verify tokenizer tensors, output tensor selection, attention-mask application, pooling axes, or normalization axes.

That lack of observable contract is not proof that the pipeline was wrong. It is the precise implementation uncertainty addressed here.

## Shadow-only implementation change

The E5 diagnostic loader now uses the same pinned Transformers.js runtime with `AutoTokenizer` and `AutoModel` directly. It remains lazy, debug-only, q8, WebGPU-first with recorded WASM fallback, serialized per session, and nonpersistent.

For every diagnostic encode it now:

1. formats the memory as `passage: <text>`;
2. tokenizes with truncation;
3. records input keys and shapes, including `input_ids`, `attention_mask`, and `token_type_ids` when present;
4. executes the model and records every output key/tensor shape;
5. requires `last_hidden_state` and verifies a three-dimensional `[batch, sequence_length, hidden_size]` tensor with batch size one;
6. performs an explicit attention-mask-aware mean over the sequence dimension;
7. records the pooled vector's pre-normalization norm;
8. performs L2 normalization once across the final hidden dimension;
9. records bounded component statistics and the post-normalization norm;
10. returns another independent `Float32Array` copy.

The loader fails rather than guessing if `last_hidden_state` or `attention_mask` is absent or tensor shapes do not align.

## Pooling and normalization contract

The intended calculation for a batch of one is:

```text
pooled[h] = sum(token[t, h] * attention_mask[t]) / sum(attention_mask)
embedding = pooled / L2_norm(pooled)
```

Padding tokens therefore cannot affect the pooled embedding. Normalization is not performed per token, per scalar, across the sequence dimension, or across a flattened tensor. Automated synthetic tests verify masked padding exclusion and the final unit norm, but only the real browser can confirm the exact model's observed keys and shapes.

## Prefix conclusion

The candidate's documented contract requires task prefixes. Canonical memories are peer corpus records rather than asymmetric user queries, so both sides remain encoded as passages. The audit reports pairwise differences between raw, `passage:`, and `query:` representations without selecting whichever scores best.

Current architectural conclusion: **`CORRECT` for symmetric corpus/passages**, subject to confirmation that the exact browser model contract matches the recorded runtime assumptions. No benchmark result influenced this choice.

## Audit output

`auditE5Implementation()` returns bounded data:

- model, provider, and symmetric input strategy;
- tokenizer keys and tensor shapes;
- model output keys and tensor shapes;
- selected tensor and shape semantics;
- pooling and normalization methods;
- dimension, pre/post norms, component min/max/mean/standard deviation;
- self-cosine and dot-product/cosine agreement;
- numerical vector independence and retained-buffer checks;
- three sequential repeated-input checks plus a post-intervening-input check;
- raw/passage/query prefix comparisons;
- token metadata for four short sentences;
- seven raw-cosine sanity pairs;
- backend comparison status;
- `canonicalAuthority: false` and `persistence: "NONE"`.

The implementation reports `IMPLEMENTATION_CORRECT` only when the observed tensor contract is correct, post-normalization norms are unit length, cosine and dot product agree, independent sentences produce numerical differences and separate buffers, saved vectors survive later inference unchanged, and repeated inputs remain deterministic within `1e-5`. Otherwise it reports `IMPLEMENTATION_UNCERTAIN`.

## Buffer and concurrency safety

The direct model session is protected by the existing inference queue. Manual pooling writes into a new array, normalization writes into another new array, and the returned embedding is copied again. The audit snapshots three embeddings, runs additional inference, and numerically compares every retained component afterward. It also reports pairwise maximum/mean absolute differences and identical-component counts.

## Cosine audit

For normalized vectors the audit independently calculates dot product and the existing cosine implementation. It reports both values and their absolute difference, plus self-cosine. A difference greater than `1e-5` prevents a correct verdict.

## Token-level sanity set

Bounded metadata—not token tensors—is returned for:

- `Stock trading involves buying and selling shares`
- `Risk management is important when trading`
- `Dogs need regular exercise`
- `The Earth orbits the Sun`

Each row reports token count, non-padding count, sequence length, embedding dimension, final norm, and whether token-type IDs exist.

## Pair sanity matrix

The audit returns raw E5 cosine, with no threshold or semantic decision, for exactly these seven comparisons:

1. trading statement versus risk-management statement;
2. trading statement versus dog exercise;
3. JavaScript/web development versus developers/software;
4. JavaScript/web development versus Earth orbit;
5. dogs/exercise versus computers/maintenance;
6. trading risk management versus sleep/recovery;
7. English trading risk management versus its Swedish counterpart.

## Backend comparison

The automated audit does not initialize a second approximately 118 MB session merely to force another provider. It reports:

```text
NOT_TESTED
```

The selected provider and failed provider attempts remain visible through `e5Status()`. A WebGPU/WASM comparison can be considered later only if it can reuse normal provider lifecycle safely; it is not required to complete this bounded audit.

## Real-browser commands

Open localhost or use `?semantic-debug=1`, then run:

```js
window.__MINDLING_SEMANTIC_DEBUG__.e5Status()

const audit =
  await window.__MINDLING_SEMANTIC_DEBUG__.auditE5Implementation();

console.log(audit);
console.table(audit.pairSanity);

audit.modelContract
audit.normalization
audit.cosineValidation
audit.bufferIndependence
audit.repeatedInput
audit.prefixAudit
audit.tokenSanity
audit.backendComparison
audit.conclusion
```

Because the shadow extraction path changed from opaque pipeline pooling to directly observed masked pooling, rerun the existing frozen diagnostics after the audit even if the audit concludes correct:

```js
const matrix =
  await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicE5Matrix();
console.table(matrix.summary.distributions);

const multilingual =
  await window.__MINDLING_SEMANTIC_DEBUG__.runKnowledgeTopicE5Multilingual();
console.table(multilingual.rows);

const simulation =
  await window.__MINDLING_SEMANTIC_DEBUG__.simulateKnowledgeAreasE5();
console.table(simulation.pairEvidence);
```

Record the full audit object, selected backend, failed provider attempts, console warnings/exceptions, and whether repeated calls preserve values. Do not infer semantic suitability merely from an `IMPLEMENTATION_CORRECT` result; that verdict means extraction/comparison mechanics are correct, not that E5 is a useful Knowledge Area authority.

## Current verdict

**`IMPLEMENTATION_UNCERTAIN`** until the direct adapter runs against the actual `Xenova/multilingual-e5-small` browser model and returns its observed tokenizer/model contract.

No specific defect in the previous Transformers.js pipeline has been proven. The shadow implementation was made auditable and fail-safe; production code remains frozen. If real-browser output yields `IMPLEMENTATION_CORRECT` while the suspicious distribution persists, E5 should remain rejected for Knowledge Area authority in this tested architecture rather than being threshold-tuned.

## Preserved invariants

- E5 is debug-only and lazy; normal users do not initialize or download it.
- No IndexedDB write or canonical-memory mutation occurs.
- Production semantic behavior and thresholds are unchanged.
- Production Knowledge Areas and complete-link clustering are unchanged.
- Neural routes, specialization, neurons, and synapses are unchanged.
- Database remains `mindling-db`, version 1.
- Canonical topology remains five neurons and four synapses.
- `tokenPaymentsEnabled` remains `false`.
- No new model, backend, `/api`, cloud inference, Stage Preview, or M4 was added.
