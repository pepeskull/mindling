# Cognitive Training & Reasoning Evaluation (M4.1)

> Historical implementation description. M4.2.5 removes training and inspector UI, restores the compact XP bar, and uses Replay stage counts in the main interface. The cognitive engine and saved records remain intact. See [the current UI cleanup](ui-cleanup-replay-counts.md).

Cognitive Training lives in Development and is separate from Teach/Talk/Deep Training. It evaluates support from stored claims, not objective truth or a general intelligence score. There is no automatic learning, XP, Energy change, life-stage change or canonical growth.

## Architecture and data flow

1. `TrainingPanel` reads the current Mindling from the existing open IndexedDB connection through `trainingSource`. Production reads `gameplay/primary`; Stage Preview reads `sandbox/state`. It never mixes these databases. Read-only snapshot/demo mode has no training repository and cannot submit.
2. `trainingContext` deterministically prepares at most 24 current canonical memories. It reuses Memory's `graphData` identity/historical/relationship projection and the native lexical feature utilities. Only actually stored content and saved ID relationships enter the context. The panel states exactly how many usable candidate records may be sent before submission.
3. `POST /api/mindling/reason` validates the entire bounded context and uses the existing configured provider in three separate calls: semantic selection, reasoning, evaluation. It first checks the configured model's availability, as the existing learning endpoint does. There are no retries or alternative/fallback models.
4. Semantic selection reviews content, topic/category/concept, real saved links, exceptions and conflicts, selecting up to 10 supplied IDs. Reasoning returns an answer, concise explanation, exact quoted stored claims/conflicts, separately cited inferences, uncertainty and missing information. No private chain-of-thought is requested.
5. A separate evaluation prompt receives the selected memories, problem and answer. It reviews six criteria and cites context IDs. Both phases use the same provider/model, so the UI explicitly says this is not independent verification.
6. The client validates the complete response again, rereads current state, then saves in a transaction which rechecks identity and context. Only a complete, validated reasoning-plus-evaluation result can become a successful history record.
7. The panel updates completed/outcome counts and renders the actual answer, explanation, quotes, references, criteria, missing information and retrieval audit. A completion highlights only canonical neurons associated with actually referenced saved memories, through the existing Development scheduler. Highlighting does not mutate brain records, imply growth, or invent neural activity evidence.

## What relationships really exist

`applyMemoryDecision` creates a separate canonical record for CREATE_NEW/LINK_TO_EXISTING, appending the target's ID to `relatedMemoryIds` and adding the new ID to the target. Co-submitted siblings have separate stored `coSubmittedMemoryIds`. Decomposition/history use stored parent/component/supersession IDs. `FLAG_CONTRADICTION` appends a contested claim to the target's `contradictions`; it does not automatically establish a new accepted rule or exception.

Retrieval reads these stored fields via `graphData` and excludes its organization/hierarchy edges. Assessment labels in learning history are never treated as proof of an existing link. Dangling IDs and historical targets do not become invented records. A stored association or co-submission is not a logical implication.

## Bounded, explainable retrieval

Native features rank overlaps in content, concept/topic/category, recorded conflicts and phrase pairs. Up to 10 positive-overlap seeds leave room for persisted neighbors, category diversity and deterministic fallback candidates. The provider then performs semantic selection; lexical overlap alone is not declared relevance. With no existing embeddings or semantic index, semantic retrieval is limited to this candidate pool. It can miss paraphrases or exceptions elsewhere in a large database.

Per candidate: at most 900 content characters, two 300-character conflict excerpts and 12 actual links. `complete`, `conflictsComplete` and `omittedLinks` expose omissions. Kind, certainty, verification labels and actual available analysis confidence are passed as metadata, not evidence of truth. Historical records are excluded. Embedded parts remain inside their canonical record.

The UTF-8 context budget is approximately 56 KB; trailing candidates are dropped if needed, with link context flags recomputed. Request bodies are capped at 64 KiB; problems at 2,000 characters. Model outputs and every response field are bounded. Candidate scope, ranking explanations and semantic selection are inspectable in the result. No vector database, dependencies or silent whole-database upload is introduced; small databases may fit entirely within the explicitly disclosed candidate limit.

## Transparent evaluation

Criteria: relevant memory usage, logical consistency, handling of contradictions, application of exceptions, uncertainty awareness, explanation quality. Each is `met`, `not_met`, `unclear` or (only for contradictions/exceptions when absent) `not_applicable`, with an explanation and allowed evidence IDs. Stored conflict context cannot be skipped as not applicable.

The service—not the model—derives the outcome:

- Insufficient information or no references: **inconclusive**.
- Failed relevant-memory usage or logical consistency: **unsupported**.
- Other failed criteria: **partially supported**.
- Any unclear criterion: **inconclusive**.
- Otherwise: **supported** within the supplied context.

No numeric proficiency/intelligence score exists. All citations must identify supplied selected memories. Quotes must be exact substrings of the appropriate stored content/conflict excerpt. Every inference references quoted premises. The reasoning reference list must exactly match the union of cited premises. Structural and citation validation cannot prove a model's logical judgment correct; same-provider evaluation remains fallible.

## Persistence and identity

Use existing stores, with no version bump or forward migration:

- Production `events`: one `COGNITIVE_TRAINING` aggregate keyed `cognitive-training:<mindlingId>`.
- Stage Preview `sandbox`: a separate key of the same form; the existing gameplay `state` value is not modified.

Each record includes a SHA-256 evaluation ID, Mindling ID, actual browser-clock timestamp, problem, exact candidate snapshot/ranking/links, semantic selection, answer, concise explanation, exact quotes, referenced IDs, uncertainty, criterion judgments, outcome and service/model metadata. Retain the most recent 20 full records per Mindling, with lifetime completed/outcome counters. Metadata and records are validated on read and write. Historical result references are snapshots; missing/superseded/changed current memories are labelled.

Saving reads current identity and knowledge in the same transaction that writes only training history. Identity mismatch or context drift aborts. This includes deletion, content/link/metadata changes, and newly changed candidate scope. No gameplay object, memory, neuron, synapse or existing learning-history entry is written. Opening or inspecting Development performs only reads for training; unrelated existing gameplay timers retain their behavior.

Identical problem/knowledge context reuses a retained saved result without an API call. A pending flag blocks double clicks; Web Locks prevent same-context submissions across cooperating tabs where supported. The server rejects concurrent duplicate IDs per IP on an instance. Transactions prevent duplicate history/counter increments. After eviction from the 20-record window, an old problem can be evaluated again. Without Web Locks, concurrent tabs may still incur duplicate provider requests even though persistence deduplicates; there is no distributed billing/idempotency service.

## Lifecycle and failures

Navigation away, identity change and teardown abort the pending browser request and ignore stale continuations. Input is restored on cancellation. Document hiding pauses visualization; a request already explicitly started may complete. The server has a 45-second overall timeout and best-effort request-abort handling; the browser aborts after 55 seconds. Cancellation cannot guarantee that provider work already begun is not billed, nor undo a history transaction already committed.

No usable current memories produces an actionable local message without an inference request. Semantically empty or genuinely insufficient retrieved context can produce a real, completed inconclusive evaluation. Missing configuration, unsupported methods, cross-origin requests, oversized inputs, rate limits, invalid output, upstream failures, timeouts and storage failures never manufacture successful results. The panel displays readable errors, not provider JSON. Existing saved results remain accessible through history.

Training reuses Development's animation lifecycle and reduced-motion behavior, and adds no RAF loop, WebGL renderer, new shadow, global overflow rule or mobile layout. The form/results/history stay inside the existing scrollable cognition panel.

## Provider configuration and security

`SERVICE_API` and `SERVICE_MODEL` remain server-only and retain their existing meanings. The provider is the existing OpenAI-compatible OpenAI endpoint, using strict structured output. The configured model must be available and support that format. New Vercel entrypoint: `api/mindling/reason.js` (CommonJS handler export). Existing filesystem routing discovers it before the SPA fallback. `vercel.json` allows this function 60 seconds; the deployment must permit that duration. No learning route/export/semantics changed.

Same-origin checks follow the learning service convention, with a separate per-instance 6-request/minute/IP limiter and a cap on active requests. These are best-effort instance-local controls, not authenticated user quotas or a distributed spending cap. Like existing gameplay, memories are local to the browser: the server can validate IDs/quotes against supplied context but cannot independently authenticate the contents of a user's IndexedDB. Privacy disclosure appears before Run Evaluation. One evaluation makes up to three billable model calls; it is never described as free.

Credentials and raw provider errors are never returned, and prompts/responses are not logged. All model/history output is rendered using textContent. Stored memories and model answers are explicitly untrusted prompt data. Local snapshots/results remain in the player's scoped existing database; no new backend storage/service exists.

## Manual verification instructions (not executed)

1. Use a Vercel preview with valid SERVICE_API/SERVICE_MODEL and the new function. Open interactive gameplay or explicit `?stage-preview=1`; read-only/demo snapshots cannot run evaluations. Opening Development should not send reasoning/learning requests.
2. Confirm the currently persisted memories in Memory. Do not infer persistence from a past RELATED_MEMORY/LINK_TO_EXISTING assessment. Use an identity where the charging rule is saved but no emergency exception is stored. Ask: “A robot has 15% battery, but a person needs immediate help. Should it charge first or respond to the emergency? Explain why.” The result must flag missing applicable priority/exception knowledge, rather than pretend to remember it.
3. On an identity with both the actually persisted charging rule and emergency exception, ask the same problem. Inspect exact quotes and IDs for both, a cited inference applying the exception, the evaluator's six criteria and its explanation of uncertainty. A conflict-only record must remain explicitly contested, not silently promoted to an adopted exception. If Teach did not persist the exception, an insufficient-information result is appropriate.
4. Inspect supplied conflicting claims and linkage in the retrieval audit. Try unfamiliar paraphrases and unrelated/no-memory problems; acknowledge bounded-retrieval misses rather than requiring a fabricated answer.
5. Inspect completed/outcome totals and retained history, reload, and switch Mindling identity. Confirm separation between production and preview history and real save dates. Repeating a retained identical context should open its previous result without a new request.
6. Try blank/oversized problems, missing configuration, unreachable/invalid service responses and a slow request. Double-click submit, navigate away, change identity or edit/delete a source in another tab during evaluation. No failed/stale request should create a successful result, memory, reward or learning-history entry.
7. Compare canonical memories, nodes/synapses, stage, learning history and XP/Energy journals before/after an evaluation, accounting separately for existing independent life/energy timers. Only training history should be newly written. Confirm completion highlights only existing referenced neuron associations, with pause/reduced-motion behavior intact.

Manual provider verification can incur the disclosed model costs; no provider calls were made during implementation.

## Validation performed

Static syntax checks (`node --check`), relative-import existence checks, focused code review and `git diff --check` only. Automated tests, full Node suites and browser validation were intentionally not run at the user's request. No browser automation, screenshots, images, fixtures, build, deployment or dependency installation was performed. Runtime behavior, end-to-end evaluation quality and provider compatibility remain unverified.

## M4.1.1 integrity clarification

New requests use context version 2 to separate recorded source capture from excerpt shortening and distinguish missing linked records from targets outside context. Original version 1 evaluation snapshots remain valid/readable. The input clipping root cause, full lifecycle audit, exact metadata and manual verification are documented in [memory-integrity-audit.md](./memory-integrity-audit.md). Selected context and directly cited premises are now explicit inputs to evaluation; they are not interchangeable evidence.

## M4.2 engine and descriptive development

The explicit Run Evaluation action now delegates orchestration to `CognitiveEngine`; the existing endpoint, retrieval/evidence contracts and persistence remain unchanged. A compact Cognitive Progress section derives descriptive measurements from saved results and exact lifetime counters, with no automatic gameplay triggers. See [cognitive-development.md](./cognitive-development.md) for the scoped event/cost boundary, metric definitions and manual checklist.
