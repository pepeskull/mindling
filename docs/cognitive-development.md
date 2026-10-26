# M4.2 — Cognitive Development & Autonomous Reasoning Foundation

> Historical implementation description. M4.2.5 removes training and inspector UI, restores the compact XP bar, and uses Replay stage counts in the main interface. The cognitive engine and saved records remain intact. See [the current UI cleanup](ui-cleanup-replay-counts.md).

This milestone makes cognition reusable and observable. It does **not** activate autonomous reasoning. Run Evaluation remains the only application entrypoint that requests provider work. There are no gameplay triggers, background schedules, polling, recursive reasoning or retries.

## Architecture

`src/cognition/cognitive-engine.js` coordinates the existing stages rather than implementing a second provider pipeline:

1. Accept an explicit structured user problem scoped to the active Mindling.
2. Read fresh canonical state through the existing scoped training repository.
3. Retrieve candidates with the unchanged M4.1.1 version-2 `trainingContext`, including capture/excerpt integrity, stored relationships and recorded conflicts.
4. Reuse retained identical problem/context results when available.
5. Call the extracted `reasoning-client.js`, which transports a single request to the unchanged `/api/mindling/reason`. The server still separates semantic selection, reasoning and evaluation into its existing validated provider phases.
6. Reread/revalidate the context, then ask the existing repository to save the exact original six-field evaluation record. Its atomic identity/context checks and duplicate protection remain authoritative.
7. Return the actual persisted record, its history, descriptive metrics, fresh source snapshot and whether the provider was skipped by a cache hit. Returning the stored record also avoids presenting a racing tab's unsaved duplicate timestamp as a new observation.

`TrainingPanel` now handles only explicit form submission, presentation, local candidate preview and lifecycle delegation. It no longer owns provider fetch, timeout, fingerprinting, Web Locks or persistence orchestration. Dashboard passes its existing EventBus through Development, so production and Stage Preview each use their own app instance, scoped repositories and event bus. Read-only snapshots still have no provider-capable repository.

### Event interface and authorization

The existing `EVENTS` catalog adds:

| Event | Meaning |
| --- | --- |
| `COGNITIVE_PROBLEM_RECEIVED` | A valid, explicit user problem was dispatched to the engine. Includes Mindling ID, request UUID, problem, trigger and timestamp. |
| `COGNITIVE_REASONING_STARTED` | Processing this scoped request started, including retrieval/cache lookup. It is not evidence that a provider request was billed. |
| `COGNITIVE_REASONING_COMPLETED` | Processing completed from a validated persisted record. Includes evaluation ID, cached flag, descriptive per-record metrics, structured reasoning/evaluation result and actual referenced IDs. |
| `COGNITIVE_REASONING_FAILED` | Processing failed or was cancelled. Includes readable message, cancellation flag and original scope; no fake result or success counter is written. |

Every lifecycle event carries `mindlingId`, `requestId`, `trigger: explicit-user` and a real browser-clock event timestamp. These transient request timestamps do not replace the record's saved timestamp. Consumers must filter identity and request ID, especially after a scope switch or cancellation. Completion payloads are cloned so observers cannot change the engine's returned persisted snapshot.

`requestUserProblem({ mindlingId, problem })` is the explicit M4.2 command. It validates scope/input and mints a frozen, one-use problem event. A private WeakMap associates that exact event object with its pending Promise. The engine's problem-event listener processes only a minted event; arbitrary serialized/cloned/raw events on the bus cannot authorize provider work. Replaying a consumed event is ignored. Reentrant user commands during dispatch/lifecycle notification or an active run are rejected, preventing immediate event-recursive reasoning.

The application calls `requestUserProblem` only from the existing Run Evaluation submit handler, never from state updates, navigation, metrics, learning events, scene animation, history inspection or page load. This is a trusted-code command boundary, not protection from arbitrary malicious same-origin JavaScript calling public methods. Future M4.3 gameplay triggers require an explicit new authorization/cost policy; merely emitting a problem event does not activate them.

## Descriptive metrics

`src/cognition/metrics.js` is a pure read-only projection of validated existing records. No second metric store or duplicated record fields are needed: the exact measurements already persist in the snapshots/results used to derive them.

| Measurement | Definition |
| --- | --- |
| Completed evaluations | Existing persisted lifetime `totals.completed`; a cached reopening is not another observation. |
| Outcome distribution | Existing lifetime supported / partially_supported / unsupported / inconclusive counters. |
| Candidate memories | Number of actual candidates in the saved request context. |
| Retrieved memories | Number selected semantically by `result.selection.memoryIds`. This is distinct from the larger candidate pool. |
| Directly referenced memories | Number in the validated reasoning citation union. Selected-but-uncited records are not counted as used premises. |
| Memory coverage | Directly referenced / semantically retrieved for that evaluation. Fraction is null with zero retrieved memories; the UI shows counts, not an intelligence percentage. It is not coverage of all knowledge. |
| Applicable criteria | Six existing evaluation criteria, excluding only `not_applicable`; unclear and failed criteria stay in the denominator. |
| Criteria passed | Number marked `met`; also expose `not_met` and `unclear` counts. These are provider judgments, not objective independent verification. |
| Uncertainty | Actual low / moderate / high reasoning classification, separate from the evaluator's uncertainty-awareness criterion. |
| Timestamp | The original evaluation record's real saved `at` value, not the current viewing time or preview simulation clock. |

Per-record measurements include Mindling/evaluation identity, outcome, context version, model and insufficient-information flag. The compact Cognitive Progress section shows lifetime totals, latest retained memory/criterion usage, retained uncertainty distribution, and a chronological comparison of the last two retained observations. History entries and individual result details expose the measurements for that record. With fewer than two records it states insufficient comparison history. Unloaded/unavailable history shows unavailable values rather than fabricated zero totals.

Counts for outcomes/completions are lifetime counters. Other summaries use only the latest 20 retained full records. We cannot reconstruct retrieval/criterion/uncertainty aggregates for older evicted records and do not invent them. Comparisons explicitly warn that different problems, contexts and models are not a controlled measure of improvement. No IQ, synthetic intelligence/proficiency percentage, skill level or claim of independent verification is introduced.

## Persistence and compatibility

The existing repository and record format are unchanged. Production continues to use `events/cognitive-training:<mindlingId>` and Preview a separate `sandbox` key in `mindling-preview-m4`. Retention remains 20 full records plus existing lifetime outcome counters. Metrics are derived on load/completion from actual stored fields, so they survive navigation and reload without a migration, backfill or new write on page open.

M4.1.1 canonical capture metadata, full input handling, excerpt length/status rules, actual missing-link descriptors, exact quotations, direct-versus-selected evidence validation and support for older v1 history remain unchanged. No old record, timestamp, outcome, counter or canonical memory is rewritten by this milestone. Existing learning history is not used as a substitute for real evaluation results.

## Lifecycle, errors and cost controls

One engine per TrainingPanel subscribes to problem commands and releases that subscription on destruction. Scope change, view hiding and teardown cancel/ignore in-flight work. An old run cannot finish into a new identity or clear a newer run's active state. Existing Web Locks and transactional deduplication remain; retained cache hits skip the provider and do not replay completion highlights. The existing visualization callback runs only for an explicitly completed, non-cached attempt and remains presentation-only.

The existing 55-second browser request deadline moved into the transport helper; the server's 45-second limit is unchanged. The existing local input-preview debounce is unchanged. Neither timer schedules cognitive problems or repeats provider work. No new autonomous timer, polling interval or rendering loop is introduced. A request already authorized by a user can finish while the browser tab is hidden, as before; it is not a recurring hidden evaluation. Navigation cancellation is best effort and cannot undo provider billing already incurred or a save already committed.

Missing provider configuration, unavailable provider, no usable knowledge, stale/deleted references, invalid output, identity drift, duplicate in-flight requests, timeout and storage failure use existing validation/safeguards and a scoped failed event. No successful history record or metrics observation is fabricated. If a save commits just before cancellation, its truthful completed record will be visible on the next history read even if that cancelled UI continuation was ignored.

The configured provider, server-only SERVICE_API/SERVICE_MODEL, same-origin endpoint, maximum 24 candidates/10 selected records, 56 KB context budget, 64 KiB request cap, limits and instance-local rate controls remain unchanged. The existing disclosure stays before Run Evaluation: up to three model requests may incur provider costs. There is no automatic retry, alternate model, recursive call, new credential exposure or new backend service.

## UI and gameplay preservation

Cognitive Progress is compact content inside the existing scrollable Development cognition panel, using the existing neutral theme, borders and typography. No fullscreen page, shared theme change, shadow, dependency, global overflow rule or mobile layout is added. Neural Evolution, existing progression statistics, memory inspector and training evidence/history remain available.

No changes to XP, Energy, neuron/synapse records, identity, life stage, learning rewards, canonical classification or stored associations. Training persistence remains isolated from canonical gameplay writes. Existing independent life/energy timers continue their prior behavior.

## Manual verification checklist (not executed)

1. Open/reload Dashboard, Memory and Development. Observe no `/api/mindling/reason` calls from navigation, metrics or history. Inspect existing scoped history; v1/v2 records, integrity labels, result timestamps and counters must be preserved.
2. Subscribe read-only observers to the four events on the app EventBus before an explicit Run Evaluation. Check matching Mindling ID/request ID and received → started → completed (or failed) order. A completion contains the actual persisted evaluation identity/result/references. Do not wire an observer to request another evaluation.
3. Emit an ordinary `COGNITIVE_PROBLEM_RECEIVED` object without using the engine's explicit command; verify no model request occurs. Replaying a consumed event must also do nothing. Reentrant requests during lifecycle emission must fail busy rather than recurse.
4. Only if choosing to incur disclosed provider costs, submit an explicit problem. Compare the record's candidate pool, semantic selection, exact reasoning references, statuses and uncertainty with the displayed counts/coverage. Ensure selected-but-uncited memories are not counted as cited. For zero semantic retrieval, coverage fraction must be unavailable rather than an invented percentage.
5. Repeat a retained identical problem/context: the saved result should be returned with cached=true and no new provider call, counter increment or visual completion replay. Inspect a failure/unavailable provider: failed event, no new successful metrics observation.
6. With two or more real records, compare each history row's actual timestamp, outcome, retrieved/cited counts, applicable criteria and uncertainty against the displayed last-two comparison. Problems/models can differ; the UI must not call this intelligence improvement.
7. Navigate away or switch identity during an attempt; stale events retain their original scope and cannot populate the new identity's UI. Return/reload and verify persisted results and metrics. Confirm listener cleanup and no automatic restart on reopening.
8. Check production and Stage Preview separately: histories/metrics belong to the correct Mindling in the correct existing database. Read-only/demo snapshots cannot submit. Compare canonical memories, relationships, XP/Energy journals, stage and neural records before/after, accounting separately for existing independent gameplay timers.

## Validation and limitations

Focused source review, JavaScript static syntax checks, relative-import checks and `git diff --check` only. Automated tests, browser validation, screenshots, production builds, model API calls and dependency installations were intentionally not run at the user's request. No application modules were executed for validation. Provider compatibility, runtime event order, rendering and persistence interactions remain unverified in a browser.

No autonomous gameplay integration ships in M4.2. The event/cost boundary and modular engine are the foundation for a separately authorized M4.3. Model evaluations remain fallible and use the same provider; bounded retrieval may miss knowledge. Historical metric summaries cannot extend beyond retained snapshots except for the pre-existing exact lifetime outcome totals. Cross-tab provider duplication can still occur where Web Locks are unavailable, though persisted IDs/counters deduplicate.
