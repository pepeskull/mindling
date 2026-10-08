# Knowledge Area 2.0 Phase 3 shadow candidate

**Status:** `SHADOW_CANDIDATE_READY`

**Production authority:** none

**Real-browser semantic verdict:** `VALIDATION_REQUIRED`

## Candidate selection

The single selected candidate is `onnx-community/flan-t5-small-ONNX` at immutable revision `76988c16f73cadb2c2e13e2d7d85608944223105`, derived from `google/flan-t5-small`.

| Property | Verified/expected value |
| --- | --- |
| Architecture | T5 encoder-decoder, instruction-finetuned text-to-text model |
| Parameters | 77 million |
| Base-model license | Apache-2.0 |
| Runtime | Transformers.js 3.8.1 `text2text-generation` pipeline |
| Browser artifact | ONNX community conversion tagged for Transformers.js |
| Quantization | q8 requested |
| Expected q8 graph transfer | about 94.9 MB for quantized encoder (35.7 MB) plus merged decoder (59.2 MB), excluding tokenizer/config; exact requests must be captured in browser |
| Provider policy | WebGPU first, explicit WASM fallback |
| Language claims | FLAN-T5 model card lists English, Swedish, Spanish, and many other training languages; task quality is unverified |
| Locality | model assets may download from Hugging Face/CDN and cache locally; inference text is processed in browser |

Sources: [base model card](https://huggingface.co/google/flan-t5-small), [pinned ONNX conversion](https://huggingface.co/onnx-community/flan-t5-small-ONNX/tree/76988c16f73cadb2c2e13e2d7d85608944223105), [ONNX artifacts](https://huggingface.co/onnx-community/flan-t5-small-ONNX/tree/main/onnx), and [Transformers.js pipeline documentation](https://huggingface.co/docs/transformers.js/pipelines).

This candidate is justified as the smallest currently verified browser-convertible instruction model capable of producing both open-vocabulary text and constrained categorical text. It was **not** chosen because its semantic quality is known. FLAN-T5 was not trained specifically for Mindling's broad-topic co-membership relation, so failure remains plausible.

## Real inference contracts

### Discovery

The provider sends one bounded instruction asking for a short noun phrase describing the statement's broad subject. Generation is deterministic (`do_sample: false`, one beam, at most 12 new tokens). The exact raw output is retained. The first non-empty line, capped at 80 characters, becomes a model-generated subject hypothesis.

The hypothesis has `membershipAuthority: false`. It is never converted into a merge decision and is not compared as a label shortcut.

### Verification

The provider sends both statements with an instruction to return exactly one of:

```text
SAME_AREA
DIFFERENT_AREA
UNCERTAIN
```

It executes A→B and B→A sequentially. Exact agreement is required. Directional disagreement or any malformed/free-form response fails closed to `UNCERTAIN`. Raw outputs, directional decisions, reason, and timings are preserved; no probability or confidence is fabricated.

### Shadow grouping

Explicit invocation evaluates at most 12 current canonical memories. Every pair is verified, and deterministic complete-boundary checks are required before a shadow merge. Missing, malformed, disagreeing, or uncertain evidence remains separate. Discovery labels do not authorize membership. Results remain in memory only and never update production areas, canonical memories, routes, IndexedDB, specialization, or development.

## Debug panel

Open `?semantic-debug=1`, select **Knowledge Area 2.0 Debug**, then use:

1. **Load semantic candidate** — downloads/initializes the candidate explicitly.
2. **Run Topic Discovery** — generates subject hypotheses for up to 12 current canonical memories.
3. **Run Topic Verification** — generates bidirectional evidence for all pairs among up to 12 current memories.
4. **Run Shadow Knowledge Areas** — reruns discovery and pair verification, then applies complete-boundary shadow grouping.

The panel distinguishes model-generated subject hypotheses, model verification evidence, and deterministic safety grouping. Before explicit inference it retains the Phase 2 neutral-singleton view.

## Console API

```js
const debug = window.__MINDLING_SEMANTIC_DEBUG__;

debug.knowledgeArea2Status();
await debug.loadKnowledgeArea2Candidate();
const discoveries = await debug.runKnowledgeArea2Discovery();
const verifications = await debug.runKnowledgeArea2Verification();
const shadow = await debug.runKnowledgeArea2Shadow();
const frozen = await debug.runKnowledgeArea2FrozenEvaluation();
const multilingual = await debug.runKnowledgeArea2MultilingualEvaluation();
const corpora = await debug.runKnowledgeArea2RegressionCorpora();

console.table(discoveries);
console.table(verifications);
console.log(shadow);
console.table(frozen.rows);
console.log(frozen.summary);
console.table(multilingual.rows);
console.log(corpora);
debug.knowledgeArea2Audit();
```

## Frozen evaluation

`runKnowledgeArea2FrozenEvaluation()` reuses the existing 70-pair fixture without modifying expected labels. It reports same-topic recall, different-topic rejection, coverage, abstention, and hard-negative rejection. There is no calibration threshold: exact generated labels plus bidirectional agreement define the shadow output.

The trading/programming and bicycle/bee ten-memory fixtures must be exercised with isolated canonical-memory data in the browser. The panel operates on the current Mindling, so a clean test Mindling can run either corpus without persistence beyond the user's normal Teach operations. No expected topic is embedded in provider prompts or grouping code.

Promotion gates remain 5/5 hard negatives, ≥95% different-topic rejection, ≥80% same-topic recall, coherent ten-memory structures, singleton preservation, uncertainty, order stability, held-out generalization, acceptable performance, and zero canonical mutation.

## Performance and compatibility record

This implementation records provider backend, load time, per-generation inference time, bidirectional pair time, and frozen-matrix total time. The following require real-browser measurement and are currently `NOT_TESTED`:

- exact model requests/transferred and cached bytes;
- WebGPU operator compatibility;
- WASM fallback success and latency;
- initialization, first-generation, and warm-generation latency;
- 70-pair runtime (140 sequential generations);
- ten-memory shadow runtime (discoveries plus 90 directional generations);
- browser process/GPU memory;
- mobile feasibility.

The workload is intentionally explicit and diagnostic. It is not suitable as a production full-store O(N²) design. Future candidate retrieval may use MiniLM to propose at most four areas, but MiniLM cannot decide membership.

## Known limitations

- FLAN-T5-small is a general instruction model, not a calibrated topic co-membership classifier.
- Prompt compliance may be weak; strict parsing will increase abstention rather than fabricate decisions.
- Generated labels may be plausible but unsupported, and never become membership evidence.
- q8 can reduce generation quality.
- The expected graph size is substantial for mobile browsers.
- WebGPU/WASM behavior is not proven until the actual pinned model runs in-browser.
- Multilingual training coverage does not establish multilingual quality for this task.
- No semantic result from mocked Node tests counts toward the promotion gates.

## Stop boundary

Phase 4 is not implemented. Production canonical identity, Teach, MiniLM retrieval and `0.62` production grouping, Knowledge Areas, routing, specialization, development, DB v1, topology, UI outside debug mode, and token settings remain unchanged.
