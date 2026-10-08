# FLAN-T5 empty-generation diagnostic

**Scope:** Knowledge Area 2.0 shadow provider only

**Diagnosis:** `UNDETERMINED_GENERATION_FAILURE`

**Semantic candidate quality:** still unproven

## Observed browser evidence

The pinned `onnx-community/flan-t5-small-ONNX` q8 model initialized successfully on WebGPU and three discovery calls each completed in about three seconds. In every call the Transformers.js pipeline returned an empty `generated_text`, producing `rawOutput: ""` and `subject: null`.

That establishes successful session execution but not successful text generation.

## Transformers.js 3.8.1 pipeline contract

The audited `Text2TextGenerationPipeline` implementation:

1. converts scalar input to an array;
2. applies any configured prefix;
3. tokenizes with padding and truncation;
4. calls `model.generate({ ...inputs, ...generate_kwargs })`;
5. decodes generated token IDs with `skip_special_tokens: true`;
6. returns an array of `{ generated_text: decodedText }` objects.

Source: [Transformers.js 3.8.1 `Text2TextGenerationPipeline`](https://github.com/huggingface/transformers.js/blob/3.8.1/src/pipelines.js#L3394-L3511).

Mindling already read `output[0].generated_text`, which is the documented and implemented response location. The prior extractor was therefore not responsible for converting nonempty generated text to an empty string.

## Root-cause boundary

The original generation call allowed immediate EOS. FLAN-T5 uses decoder start/pad token `0` and EOS token `1`, so a special-token-only sequence would decode to the observed empty `generated_text`.

The pipeline does not expose token IDs in its normal response, so the historical call cannot prove the exact `[decoder-start, EOS]` sequence after the fact. However:

- the response field was correct;
- its value was genuinely empty;
- inference completed rather than throwing;
- decoded special-token-only output is the pipeline behavior consistent with those observations;
- the old configuration permitted immediate EOS.

This confirms that the empty string originated in generation/decoding rather than incorrect response extraction, but it did not confirm the generated token IDs or prove premature EOS. Real-browser evidence subsequently showed that `min_new_tokens: 1` still returned empty output on WebGPU. The exact generation failure therefore remains undetermined pending raw-token inspection and a controlled WebGPU/WASM comparison.

## Smallest justified shadow correction

All shadow generation now adds:

```js
min_new_tokens: 1
```

alongside the existing bounded `max_new_tokens`, `do_sample: false`, and `num_beams: 1`. This was a justified guard against zero-token generation, but real-browser evidence shows it was not sufficient. It remains bounded and does not change prompts, topic decisions, semantic evaluation criteria, or production behavior.

The response extractor is also strict: it accepts only a pipeline object containing a string `generated_text`. Unexpected shapes now reject explicitly instead of being silently converted to empty output.

## Debug-only sanity check

The provider exposes a bounded sanity prompt:

```text
Translate English to German: The house is wonderful.
```

Run:

```js
const debug = window.__MINDLING_SEMANTIC_DEBUG__;
await debug.loadKnowledgeArea2Candidate();
const sanity = await debug.auditKnowledgeArea2Generation();
console.log(sanity);
```

The returned object includes:

- exact model and revision;
- backend;
- prompt;
- actual copied pipeline response;
- response container, length, keys, value type, and text length;
- extracted generated text;
- generation parameters;
- decoder-start, EOS, and pad IDs exposed by runtime configuration;
- inference time;
- `NONEMPTY_GENERATION_OBSERVED` or `EMPTY_GENERATION_OBSERVED`.

The debug panel also provides **Run Generation Sanity** and displays its result.

## Browser validation sequence

1. Hard-refresh `?semantic-debug=1` so the corrected JavaScript is active.
2. Open **Knowledge Area 2.0 Debug**.
3. Select **Load semantic candidate**.
4. Select **Run Generation Sanity**.
5. Inspect the full console result from `auditKnowledgeArea2Generation()`.
6. Only if `NONEMPTY_GENERATION_OBSERVED`, run **Run Topic Discovery** and inspect each retained `rawOutput`.
7. If WebGPU still returns empty output, record the audit and force/test WASM only as a separate backend-isolation step; do not alter prompts or evaluation rules.

Expected sanity content is a nonempty German translation, but wording is not asserted. A nonempty sanity result proves generation plumbing, not topic semantic quality.

## Verdict boundary

Automated tests verify response parsing, strict malformed-shape failure, parameter propagation, audit structure, and shadow-only invariants using mocks. They do not demonstrate that the real model now generates nonempty text.

The candidate must remain semantically unproven until a real browser reports `NONEMPTY_GENERATION_OBSERVED` and the subsequent frozen evaluations are run. No production Knowledge Area, canonical memory, Teach decision, route, specialization, development value, or IndexedDB record is modified by this diagnostic.
