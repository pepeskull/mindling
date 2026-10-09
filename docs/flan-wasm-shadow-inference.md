# FLAN-T5 WASM shadow inference

## Status

`WASM_SHADOW_READY` for real-browser semantic evaluation. This does **not** mean that the candidate has passed the frozen semantic quality gates or is suitable for production.

## Confirmed evidence and resulting change

The controlled browser comparison for `onnx-community/flan-t5-small-ONNX` at revision `76988c16f73cadb2c2e13e2d7d85608944223105` produced an empty WebGPU generation but generated `Das Haus ist sehr schön.` through WASM. Therefore ordinary Knowledge Area 2.0 shadow discovery, verification, and grouping now request `wasm` explicitly with fallback disabled.

The model remains q8, lazy, debug-only, noncanonical, and nonpersistent. The provider is created only after an explicit semantic-debug action. One cached provider is reused by discovery, verification, grouping, and the generation sanity check, and its existing inference queue serializes calls. The controlled WebGPU/WASM comparison remains separate and creates independent sessions.

No prompt, decision parser, bidirectional-verification rule, complete-boundary rule, production threshold, canonical-memory behavior, route, specialization calculation, or database schema changed.

## Browser validation

1. Open `https://playmindling.com/?semantic-debug=1` with the three canonical bicycle memories present.
2. Open **Knowledge Area 2.0 Debug**.
3. Run, in order: **Load semantic candidate**, **Run Topic Discovery**, **Run Topic Verification**, and **Run Shadow Knowledge Areas**.
4. Confirm the provider line reports `requested wasm`, `actual wasm`, and `fallback disabled`.
5. Record every discovery subject and raw output, every pair's forward/reverse raw outputs and final decision, the shadow assignments, timings, and errors shown in the panel.

The same operations are available from the console:

```js
const debug = window.__MINDLING_SEMANTIC_DEBUG__;
console.log(await debug.loadKnowledgeArea2Candidate());
console.table(await debug.runKnowledgeArea2Discovery());
console.table(await debug.runKnowledgeArea2Verification());
console.log(await debug.runKnowledgeArea2Shadow());
```

The expected evaluation outcome is one cycling-related shadow area, but no runtime rule encodes that expectation. A result is not semantic validation until the frozen 70-pair matrix, both regression corpora, hard negatives, order checks, uncertainty behavior, and browser-performance gates pass.

## Safety boundary

Generated labels have `membershipAuthority: false`. Only bidirectionally parsed verification evidence is offered to the complete-boundary shadow simulation; malformed or directionally inconsistent generations become `UNCERTAIN`. Every result continues to declare no canonical or production authority and no persistence.
