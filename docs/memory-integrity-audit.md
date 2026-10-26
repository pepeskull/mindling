# M4.1.1 — Memory Integrity & Retrieval Audit

## Confirmed cause of the reported 140-character example

The shared Dashboard interaction field in `index.html` had `maxlength="140"`. The supplied sentence is 150 UTF-16 code units (all ASCII here):

> During an emergency, a robot should prioritize human safety, assess immediate risks, and avoid dangerous actions when critical information is missing.

Its first 140 characters end **exactly** with the reported inspector text, `when critical information i`. Native input maxlength enforcement can discard the final ten characters during entry/paste, before a submit handler, model or database sees them. This is the confirmed implementation defect matching the observation. It is not the 900-character training excerpt limit or a 140-character inspector formatter.

The user's browser database and original provider response are not accessible in this source audit. Therefore the particular stored object and model response were not independently inspected. Source inspection plus the exact supplied-prefix comparison identifies the responsible input boundary; it does not reconstruct lost content or prove what any historical record originally meant.

## Lifecycle trace

| Layer | Existing behavior and audit finding |
| --- | --- |
| Input | Shared Talk/Teach/Deep Training input was silently capped at 140, despite handlers supporting 2,000. Removed native maxlength clipping. Both production Dashboard and Stage Preview explicitly reject raw input longer than 2,000 with a readable message and retain the draft. Screen-reader guidance states the limit. |
| Production learning | `analyzeNative` validates up to 2,000 and returns trimmed input as canonical text. Active `engine.learn` saves `content:a.memory` without slicing. Classification and accounting stay unchanged. |
| Preview assessment | `learningContext` sends the full new input, with up to eight existing memory candidates excerpted to 500 characters and marked complete/incomplete relative to those candidates. These are assessment excerpts, not canonical replacements. No change to this classification contract or its semantics. |
| Preview persistence | `atomicStatements` extracts input statements without model-authored claim replacement. `recordMemory` saves each original extracted statement as `content:text`. Mutable preference/goal updates remain the same existing operation; they receive capture metadata for the new text. Neither path slices canonical claims. |
| Legacy decomposition | Parent content stays intact; actual children retain extracted statement content. Children inherit recorded capture provenance only if the parent has valid provenance; unproven legacy completeness is not upgraded. No decomposition, new child or rewrite is triggered by this audit. |
| IndexedDB | Preview writes the full existing state at `sandbox/state`; production writes canonical gameplay/memory objects. No canonical content slice was found at the storage boundary. Neither database abstraction is changed by this PR. |
| Memory | `graphData` trims outer whitespace for labels but does not shorten the inspector claim. Canvas/list/related-memory labels intentionally use ellipses; their shorter labels are not storage. The inspector shows full stored content with whitespace preservation, bounded internal scrolling and a capture-status note. |
| Training retrieval | Context retains a maximum 900-character excerpt per candidate, up to 24 candidates and approximately 56 KB UTF-8 total. Previously `complete` only compared the excerpt with the already stored string; it could not detect that an old input had been clipped before storage. Version 2 separates source provenance from excerpt completeness. |
| Reasoning/evaluation | Quoted claims must still be exact substrings of supplied excerpts, IDs must exist in selected context, and inferences require quoted premises. Prompts now explicitly forbid interpreting unknown original capture as proven truncation. Selected-but-uncited memories cannot be retroactively represented as the answer's quoted evidence. |

An old 140-character stored prefix can be transmitted entirely and truthfully have `complete=true` for retrieval. That does **not** establish that the original 150-character user input survived capture. This distinction was absent from the original reasoning prompt. The precise reason the observed model used the word “truncated” cannot be proven without its saved request/result; the prompt and metadata now prevent the application from conflating those meanings.

## New metadata, without retrospective repair

`src/memory/content-integrity.js` provides a shared 2,000-character limit and small presentation/provenance helpers. New canonical native/service claims and legitimate user-driven mutable updates receive:

```json
{"contentIntegrity":{"version":1,"status":"captured","length":150}}
```

This records preservation of the received/extracted statement, not factual truth, independent verification, or exact reproduction of all original input formatting. A valid marker and matching stored length yield `captured`; an explicit incomplete flag or marker-length mismatch yields `incomplete`; absent/unrecognized provenance yields `unknown`. A marker is not a checksum and cannot detect arbitrary same-length edits; it is not tamper-proof evidence.

No marker is backfilled, and no old text is modified, concatenated, inferred from punctuation or regenerated by a model. Reinforcement leaves existing canonical text/provenance untouched. In particular, re-teaching a full sentence may still be classified as a reinforcement of a legacy prefix; this PR does not change classification to force a repair. Historical loss cannot be silently undone.

## Retrieval context version 2

Each candidate keeps `complete` with the narrow meaning **entire stored string supplied**, and adds:

- `integrity.sourceStatus`: `captured`, `incomplete`, or `unknown`.
- `integrity.sourceLength`: stored text length after outer-whitespace trimming.
- `integrity.excerptLength`: actual transmitted content length.
- `integrity.excerptTruncated`: whether the transmitted excerpt is shorter than the stored string; enforced consistently with lengths and `complete`.

A complete excerpt of an explicitly incomplete source is possible and represented without contradiction: the full stored string was provided, but that source is itself marked incomplete. Legacy provenance `unknown` never means confirmed data loss.

Only saved relationships are inspected. Dangling saved IDs previously omitted by graph normalization are now reported as missing targets, with no invented text or new graph nodes. Links distinguish `available`, `historical`, `missing`, `unusable` and whether target content is actually in the context. Existing targets outside the candidate budget remain distinguishable from deleted targets. Up to 12 link descriptors are included per candidate, prioritizing in-context links; `omittedLinks` still reports limits. Invalid/oversized IDs cannot enter the service context. Neither a saved association nor a missing/outside-context target is treated as a logical premise.

The provider still receives only bounded selected excerpts and metadata, never an unbounded database. More than 900 characters is labelled intentional retrieval shortening in the UI and prompt, not canonical data loss. Existing 24-candidate/10-semantic-selection, conflict, byte, problem and API limits are retained.

## Evidence and history compatibility

Reasoning cites only actually supplied selected IDs, quotes exact supplied claim/conflict text, and lists the union of fact/inference references. The separate evaluator receives explicit `directlyCitedMemoryIds` and `selectedButUncitedMemoryIds`. For new v2 results, a `memoryUsage=met` criterion must cite at least one directly cited memory. Any criterion marked `met` may use only directly cited IDs as positive evidence; uncited selected IDs can still expose failures or uncertainty. Other selected memories may demonstrate a missed exception/conflict, but cannot retroactively prove the reasoning used them. The UI labels criterion references accordingly and lists missing/non-supplied link targets.

The context validator accepts both original v1 snapshots and new v2 snapshots with strict per-version fields. The additional direct-citation check is applied only to v2 so it does not invalidate older saved training history. No history record, answer, outcome, counter or timestamp is rewritten. Version 2 changes new request fingerprints naturally; existing evaluations remain accessible, while a user-requested new v2 evaluation is a separate attempt under the existing retention policy. Old model prose remains historical output even if it misdescribed completeness.

## Preview preservation and counts: source findings

Navigation toggles view visibility and schedules read-only adapters. It does not recreate a Mindling or clear IndexedDB. Preview startup uses its existing state when present; `advanceSandbox` clones existing state and advances physiology/time rather than dropping memories. `PreviewStore` reads/writes `sandbox/state` in `mindling-preview-m4`; production uses `mindling-db`. Training continues to use a separate scoped key/store, not the canonical preview state value. Existing explicit New/Reset actions retain their prior behavior; no reset or migration is introduced.

Memory graph counts canonical saved identities, uses saved category/topic data, counts unique existing non-self association pairs, and excludes unresolved target IDs from association counts. Adding a missing-link audit descriptor does not create an association or memory. Capture markers are included in the Memory signature so status notes refresh; the graph/count algorithms are otherwise unchanged. The Development training source rereads the same persisted Mindling content that is hydrated into Memory. Differences are now explicitly labelled retrieval excerpts/provenance, not presented as different canonical claims.

## Manual verification (not executed)

1. In a deployed preview, inspect `#mindling-input`: it must have no 140-character or other silent maxlength clipping. Paste the full 150-character example, confirm the draft still ends `is missing.`, and submit Deep Training. Also try Teach on an appropriate independent/new claim. Review the actual assessment: creation/linking persists full extracted text; reinforcement does not repair an old prefix.
2. Inspect canonical `content` in `sandbox/state` and Memory for that actual record ID. It should retain the full supported claim and new capture metadata when a new record is created. Select via Canvas and the accessible index; the inspector must show full text and distinguish its original capture status.
3. Paste more than 2,000 characters. Submission must show the explicit error, retain the entire draft and send no learning request for that rejected input. Check both production and Stage Preview handlers, accounting separately for existing independent life/energy timers.
4. For a stored claim longer than 900 characters, inspect the reasoning request: canonical content must remain unchanged; only the bounded excerpt is shorter, with matching lengths, `excerptTruncated=true`, `complete=false`. For a legacy short claim, sourceStatus must be unknown while excerptTruncated is false. Do not infer loss solely from a 140-character length.
5. Inspect a known dangling saved link and a valid target omitted from the context. Confirm distinct `missing` versus `available`/outside-context metadata, no invented target text, no extra graph memory/association count and no citation to a non-supplied ID. Do not create a fictitious relationship merely to satisfy the audit.
6. If explicitly choosing to incur provider costs later, evaluate with known stored rules/exceptions and inspect exact quote/ID validation, selected-versus-cited distinction and honest uncertainty. No model call was performed for this PR.
7. Navigate Dashboard → Memory → Development → Memory, reload, and confirm the same identity and canonical memory IDs/text/categories/relations remain in the preview store. Compare production separately; no preview state should be copied there.
8. Open pre-existing v1 training history, including old completeness prose. It must remain readable and unchanged. New v2 attempts must not migrate or overwrite old results automatically.

## Verification performed and limitations

Focused source review of input, assessment, atomic/native persistence, storage, graph/inspector, retrieval, reasoning/evaluation and training history. Static comparison of the user-provided sentence with the HTML limit confirms the exact 150/140-character cutoff. JavaScript syntax/import checks, JSON parsing and `git diff --check` are the only automated static checks.

No test suite, browser automation, screenshots, production build, model API call or dependency installation was run. Browser-specific paste behavior, the user's actual local records, reload behavior and live model output remain unverified at runtime. There is no automatic repair of already lost input. Model prose and reasoning remain fallible even with more precise metadata; source status is not factual verification. The existing intentional extractive atomic boundaries, supported classification semantics, Energy/XP rewards, stage/identity and neural growth rules are unchanged.
