# FLAN-T5 final candidate diagnostic

## Status

`INCONCLUSIVE` until the bounded diagnostic is run with real WASM inference in a browser. The already observed three-memory run is negative evidence, but the two permitted alternative instruction formats have not yet been measured. Mock tests are software-contract tests only.

## Existing evidence and implementation inspection

The provider remains `onnx-community/flan-t5-small-ONNX` revision `76988c16f73cadb2c2e13e2d7d85608944223105`, q8, explicitly using WASM without fallback. Generation is deterministic (`do_sample: false`, one beam), serialized, and extracted correctly from `output[0].generated_text`.

The current discovery prompt requests a short noun phrase and allows 12 new tokens. It retains the raw output and converts only its first line into a non-authoritative hypothesis. The current verification prompt requests exactly `SAME_AREA`, `DIFFERENT_AREA`, or `UNCERTAIN`, allows six new tokens, runs in both directions, and accepts only an exact decision token. Malformed output or directional disagreement becomes `UNCERTAIN`.

No output-extraction, backend-selection, or decision-parser defect explains the reported browser outputs. The generated strings were received correctly. The six-token verification limit can truncate free-form noncompliant answers, but that is not the cause of failing exact-token compliance: a compliant answer needs only one generated token. Discovery accepting copied or malformed text as a *hypothesis* is intentional and grants no membership authority.

Confirmed current-format browser evidence:

- all three bicycle discovery outputs were unacceptable, including a copied statement and malformed text;
- all three bicycle pairs produced malformed free-form verification output and therefore correctly failed closed to `UNCERTAIN`;
- three separate shadow areas were consequently the correct safety outcome.

This establishes prompt-format noncompliance for the current instructions, not yet a final verdict across the bounded alternatives.

## Bounded diagnostic design

The diagnostic evaluates exactly three discovery formats (the current format plus two alternatives) over the existing ten-memory bicycle/bee fixture. It evaluates exactly three verification formats (current three-token, `YES`/`NO`, and `SAME`/`DIFFERENT`) over 15 reviewed pairs: all bicycle-with-bicycle pairs, all bee-with-bee pairs, bicycle-versus-bee, trading-versus-programming, two unrelated-singleton comparisons, and all five frozen critical hard negatives.

Expected labels are returned in diagnostic rows but never enter prompts or parsing. There is no taxonomy, keyword matcher, fuzzy substring parser, score threshold, or benchmark exception. Each verification format is executed bidirectionally and must produce exact allowed output in both directions.

Subject format checks report empty output, copying, excessive length, fragmented single-character tokens, and absence of alphanumeric content. They deliberately report semantic correctness as `REVIEW_REQUIRED`; these generic checks cannot establish whether a plausible phrase is actually grounded. Thus `formatValidSubjectLabelRate` and `semanticallyValidSubjectLabelRate` are separate, with the latter remaining `null` pending review.

The diagnostic reports nonempty generation, subject format validity, exact decision-format compliance, same-topic recall, different-topic rejection, five-hard-negative rejection, coverage, abstention, generated token counts, raw directional outputs, and latency. If every verification format misses any preliminary gate (80% same-topic recall, 95% different-topic rejection, or 5/5 hard negatives), it returns `CANDIDATE_REJECTED`. Otherwise it returns `INCONCLUSIVE`, because full frozen, multilingual, corpus grouping, order, performance, and human subject-grounding review remain required. It cannot return `CANDIDATE_VIABLE` from this preliminary diagnostic alone.

## Browser validation

Open `https://playmindling.com/?semantic-debug=1`, open **Knowledge Area 2.0 Debug**, and select **Run Final Candidate Diagnostic**. The action reuses the lazy cached WASM provider and does not write to IndexedDB.

Console equivalent:

```js
const result = await window.__MINDLING_SEMANTIC_DEBUG__
  .runKnowledgeArea2FinalCandidateDiagnostic();

console.log(result.status, result.reason, result.backend);
console.table(result.discovery.summaries);
console.table(result.discovery.rows);
console.table(result.verification.summaries);
console.table(result.verification.rows);
```

Review every discovery row's exact output against its expected grounded subject. A format-valid phrase is not automatically semantically correct. If the result is `CANDIDATE_REJECTED`, stop; do not run or tune a larger evaluation. If it is `INCONCLUSIVE`, the frozen 70-pair and multilingual APIs may be run separately, but promotion still requires all previously declared regression, grouping, order, and performance gates.

## Safety

The diagnostic is debug-only, read-only, nonpersistent, and bounded. It does not alter the existing prompts used by shadow grouping, the decision rules, canonical memories, Teach, production Knowledge Areas, MiniLM threshold, routes, specialization, development, or IndexedDB.
