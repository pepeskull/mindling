# FLAN-T5 WebGPU versus WASM diagnostic

**Status:** `BACKEND_COMPARISON_READY`

**Root cause:** unconfirmed; current evidence isolates generation/decoding, not response extraction

## Purpose

The pinned FLAN-T5 candidate returned `[{ generated_text: "" }]` on WebGPU both before and after `min_new_tokens: 1`. This diagnostic runs the same revision, prompt, q8 request, and generation settings in two explicitly selected independent sessions:

- requested `webgpu`, no fallback;
- requested `wasm`, no fallback.

Sessions are initialized and disposed sequentially to avoid holding both model copies in memory. Initialization and generation failures are reported separately.

## Controlled contract

Both sessions use:

```text
model: onnx-community/flan-t5-small-ONNX
revision: 76988c16f73cadb2c2e13e2d7d85608944223105
dtype: q8
prompt: Translate English to German: The house is wonderful.
max_new_tokens: 32
min_new_tokens: 1
do_sample: false
num_beams: 1
```

Transformers.js selects artifacts from `dtype: q8`. Progress events are retained so the exact file names and byte totals can be compared. If events show different files, the result is a backend-plus-artifact comparison and must not be described as backend-only isolation.

## Generation inspection

For an empty pipeline result, the audit repeats the identical deterministic generation through the pipeline's exposed tokenizer/model and records at most 64 generated token IDs plus decoding with and without special-token removal. No logits or full tensors are retained.

This can distinguish a special-token-only output from a case where ordinary token IDs decode unexpectedly. Because it is a second inference, any mismatch between the pipeline call and direct call must be reported rather than silently reconciled.

The Transformers.js 3.8.1 pipeline itself tokenizes with padding/truncation, runs `model.generate`, decodes with `skip_special_tokens: true`, and returns `{ generated_text }`: [source](https://github.com/huggingface/transformers.js/blob/3.8.1/src/pipelines.js#L3394-L3511).

## Browser command

Open `?semantic-debug=1`, then select **Compare WebGPU / WASM**, or run:

```js
const comparison =
  await window.__MINDLING_SEMANTIC_DEBUG__.compareKnowledgeArea2Backends();

console.log(comparison);
console.log(comparison.webgpu);
console.log(comparison.wasm);
console.table(comparison.webgpu.artifactRequestEvents || []);
console.table(comparison.wasm.artifactRequestEvents || []);
```

Record requested/actual backend, load status and duration, artifact events, pipeline response, generated text, token audit, inference duration, and errors.

## Interpretation

- `WEBGPU_SPECIFIC_GENERATION_FAILURE`: WASM is nonempty while WebGPU is empty. Investigate WebGPU operator/artifact compatibility; a WASM-only shadow workaround may then be justified, but is not applied here.
- `BOTH_BACKENDS_EMPTY`: investigate pinned ONNX decoder artifacts, generation configuration, and Transformers.js compatibility. Do not tune topic prompts or switch models.
- `WASM_UNAVAILABLE_OR_FAILED`: preserve its initialization/generation error. This is not evidence of empty WASM generation.
- `BOTH_BACKENDS_NONEMPTY`: generation plumbing works on both in this run; semantic topic quality remains unvalidated.
- `WASM_SPECIFIC_GENERATION_FAILURE` or `INCONCLUSIVE`: report the evidence without promotion.

## Artifact limitation

The repository expects q8 selection to use quantized artifacts, but the comparison reports actual runtime progress events rather than assuming exact files. Browser cache may eliminate transfer events; clear/cache-control observations should be recorded when exact download comparison matters.

## Safety

The comparison is explicit, debug-only, local, nonpersistent, and has no fallback. It does not access or modify canonical memories, production areas, Teach decisions, routing, specialization, development, or IndexedDB. Mocked tests establish orchestration and reporting only; they are not evidence about either real backend.
