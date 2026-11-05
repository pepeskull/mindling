# Semantic intelligence architecture audit

## Finding and scope

The first export confirms a **model visibility** bottleneck, not a lack of budget alone. The later three-record export confirms a separate response failure after all pairs were submitted; the visibility fix does not explain or claim to resolve that failure.
`eligibleSemanticMemory()` previously required `source === 'AUTONOMOUS'` and
research hashes. Four of the six current blockchain memories in the authorized
export are `SERVICE` corrections without research provenance. Their superseded
parents are correctly historical. The result was that **only two current
blockchain passages could reach the semantic model**. The original task IDs also
still pointed at the superseded parents.

Two further discovery defects compounded this: `semanticCandidates()` required
lexical overlap or matching topic/category, then kept only four highest-ranked
pairs. Completed abstentions/rejections recorded only a batch fingerprint, not
which pairs had been analyzed. An unchanged leading batch could prevent remaining
pairs from ever being examined. Increasing a daily allowance alone cannot fix any
of these defects.

The patch admits captured, current service-classified claims with explicitly
**unverified stored-claim provenance**; follows the existing reciprocal correction
lineage when selecting task memories; removes lexical admission/ranking; and
records bounded per-pair analysis receipts to advance subsequent batches. Model
reasoning, relationship definitions, strict quote validation and cost ceilings
remain in place. No existing content, source attribution or historical links are
rewritten, and no graph UI changes are made.

## Evidence supplied and limits

The attached export contains **12 complete records**: four historical parents,
six current blockchain records and two newer Gaming records. The screenshot
shows six records/five areas; it is not a snapshot of this entire later export.
`tests/support/semantic-audit-export.json` preserves the supplied records, without
inventing a sixth passage. Tests select the six current blockchain records by
explicit export indices 2, 3, 6, 7, 10 and 11. All have five areas collectively.
The old five-passage fixture remains a separate, older dataset.

The pasted service diagnostics establish:

| Stage | Observed production evidence |
| --- | --- |
| Possible pairs among the pictured six | 15 |
| Submitted pair occurrences | 3 + 4 + 4 = 11; unique pairs unknown |
| Successfully parsed proposals | 2 across two completed calls |
| Accepted / persisted | 1 / 1 |
| Rejected proposal | 1, `EVIDENCE_NOT_FOUND` |
| Other failed call | `INVALID_SCHEMA`, 4 submitted pairs, `OUTCOME_UNKNOWN` |
| Reserved / completed daily calls | 3 / 2, supplemental 0 |
| Deferred task | `TASK_WINDOW_LIMIT` after a completed analysis |
| Exact historical exclusions / unique pending pairs | Not recoverable from aggregate counters |

The memory export contains no learning-task objects. Their IDs, receipts and
original model outputs cannot be reconstructed from the separate indexed
counters. `EVIDENCE_NOT_FOUND` means verbatim text at the proposed UTF-16 offsets
was unequal; the missing raw response prevents distinguishing wrong offsets from
paraphrasing. `INVALID_SCHEMA` likewise does not identify a specific malformed
field. Neither is asserted to be the cause of all missing links.

The local grammar diagnostics are a **different pipeline**, not model-response
rejections. `UNSUPPORTED_GRAMMAR` and `UNSUPPORTED_ROLES` are not the semantic
service's acceptance predicate.

## Complete path and remaining gates

1. **Canonical state:** the worker reads hydrated `mind.memories`, never performs
   research or creates knowledge. `runSemantic()` requires a completed research
   task with knowledge IDs. Permission, identity, connectivity, visibility and
   disposal checks remain. Standalone service memories are available as candidates
   against task-linked records; this patch does not introduce new task creation.
2. **Eligibility:** [`model-contract.js`](../src/semantic/model-contract.js),
   `semanticEligibilityIssue()` reports invalid/duplicate IDs, historical or
   superseded records, unresolved contradictions, incomplete capture,
   unrecognized wrappers, suspected truncation and the 2,000-character text limit.
   Research records still require source/quote hashes, URL and observation time.
   Current captured `SERVICE` claims require the existing learning-service and
   unverified-player-claim markers. Other provenance remains unsupported; it is
   not silently converted into research evidence.
3. **Candidate delivery:** `semanticCandidateReport()` resolves task IDs with
   `currentMemoryVersion()`, prioritizes those records within the existing 1,000
   record ceiling, then uses stable ID order. One endpoint must belong to that
   task's current lineage. Cross-category/zero-overlap pairs are allowed.
   Existing links on either endpoint, degree-four saturation, completed exact
   evidence receipts and unresolved dispatched receipts are excluded with named
   reasons. Four pairs are delivered; remaining pairs report `BATCH_LIMIT`.
   There is no model-independent decision that these pairs are semantically related.
4. **Input:** full canonical passages are supplied for each selected pair, with
   only a corroborated generated source prefix removed. Markdown, conditions,
   negation and qualifiers remain. The model sees both old and newly acquired
   current records, but not every memory in one request. No retrieval summary
   replaces the passages. Multi-hop reasoning that needs a third, absent passage
   is not supported by a two-endpoint evidence contract; it cannot import an
   unstated premise to force a link. Category labels are not semantic proof.
5. **Prompt/ontology:** [`mindling-reasoning.cjs`](../src/server/mindling-reasoning.cjs)
   uses the existing configured model, one strict structured completion, unchanged
   2,600 output-token limit. It requests evidence-backed interpretation and
   self-checks of polarity, modality, scope and sufficiency. Memory text is
   untrusted data. Stored-claim snapshots explicitly have no external URL/hash or
   observation timestamp; the prompt forbids borrowing historical source support.
6. **Validation:** `validateSemanticResult()` checks exact shape, supplied pair
   IDs, one relation per pair, supported type/direction, exact UTF-16 spans,
   complete sentence boundaries, assessment fields and qualification limits
   (three at most). It rejects `INVALID_SCHEMA`, `UNKNOWN_MEMORY`,
   `DUPLICATE_RELATION`, `UNSUPPORTED_RELATION`, `INVALID_DIRECTION`,
   `EVIDENCE_NOT_FOUND`, `QUALIFICATION_MISMATCH`, `SEMANTIC_CONTRADICTION` or
   `INSUFFICIENT_SUPPORT`. Empty output is valid abstention. It does not use the
   local grammar parser to approve meaning. Self-assessment is not independent
   verification of factual truth.
7. **Persistence:** [`model-worker.js`](../src/semantic/model-worker.js) retains
   correlated response checks and the existing authorized atomic transaction.
   `persistSemantic()` checks current eligibility and exact current snapshot,
   duplicates and degree limits again, then writes reciprocal IDs and evidence.
   Research hashes remain unchanged; unverified stored claims retain their own
   provenance and null external hashes. Changing a passage/provenance in flight
   cannot validate against its old snapshot. Permissions are rechecked before
   dispatch and commit. XP and Energy are untouched.
8. **Coverage receipt:** dispatched attempts record at most four evidence-version
   receipts; only completed attempts suppress already evaluated pairs as analyzed.
   Unknown outcomes suppress those exact pairs without claiming completion.
   Research receipts use existing hashes; stored-claim receipts include their
   exact canonical text because no external quote hash exists. These are bounded
   local task data (at most four attempts/task), never logs or extra memories.
   Exact corrected content changes invalidate the receipt. A rejected proposal is
   recorded as an attempted analysis, not as proof that no relation exists; it
   is not repeatedly paid for without changed evidence. Result diagnostics
   retain pair index, abstention/persistence outcome and rejection codes, not raw
   model responses. Legacy attempts without receipts remain explicitly incomplete.
9. **Projection:** [`graph-data.js`](../src/memory/graph-data.js) projects persisted
   `relatedMemoryIds` and identifies semantic metadata on either endpoint.
   Reciprocal pairs count once. Category/topic hierarchy is organizational;
   correction/submission/component links are separate history/parts. Learning-task
   links are not evidence of semantic relationships. The supplied export's one
   semantic pair projects correctly: **zero persisted semantic pairs missing**.
   It links Ethereum to the historical Bitcoin parent. It is not silently moved
   to the corrected Bitcoin claim, which needs a fresh model assessment.

## Before/after coverage (offline)

| Corpus / test | Before | After |
| --- | --- | --- |
| Six actual current blockchain records visible | 2/6 | 6/6 |
| Their eligible distinct pairs, before batching | 1/15 | 15/15 |
| Four corrected records excluded by origin requirement | 4 | 0 |
| Four historical parents eligible | 0 | 0 |
| Actual original task IDs, mocked worker delivery | Only eligible original endpoints | All 15 pairs across four calls / multiple days |
| Direct-contract vs worker mock | Intended example could not reach production | Same exact example-of proposal accepted/persisted |
| Existing semantic pairs absent from projection | 0 | 0 |
| Zero-overlap synthetic six-record fixture | 0/15 | 15/15 over four daily windows |
| Older five real passages, reconstructed metadata, abstention | Repeated top four / ten | All ten across three batches |

The mock comparison deliberately proposes just one new `example-of` association
between the actual Ethereum and general blockchain passages; all other pairs
abstain. It verifies delivery, validation and persistence, **not model quality**.
The actual worker fixture ends with the original historical link plus one new
reciprocal link. Existing text/provenance is byte-for-byte unchanged.

## Ontology assessment

The seven types already cover the required general/concrete comparisons:
`example-of` (instance to general concept), `application-of`, `part-of`,
`qualifies`, `complements`, `contrasts-with`, `process-related`.
Bitcoin and Ethereum can be related to a general consensus description when the
passages themselves support it. No special blockchain rules are necessary.
There is no explicit causal type, equivalence relation or broad "related-to"
catch-all. A causal assertion cannot be saved as causal with this ontology;
`process-related` must not be used to disguise causation. One relation per pair
and degree four remain expressiveness/density limits, documented rather than
expanded without evidence. No arbitrary edges were added to make the graph dense.

## Scheduling, isolation and finite coverage

No budgets increase: four research calls/task, at most one semantic call/task/UTC
day, three semantic calls/Mindling/day (including shared research remainder), at
most the explicit 0–3 supplemental allowance, one topic/window and four semantic
attempts/task lifetime. Recovery remains event-driven (hydration, completion,
permissions, online/visibility); there is no midnight timer or closed-browser work.
A subsequent recovery in a new UTC window can choose the next unexamined batch.
The same-day `TASK_WINDOW_LIMIT` remains accurate, not a fatal error.

**Coverage is finite, not guaranteed:** a single task can examine at most 16 pairs
in four calls. Existing spent attempts are not reset. More than 16 pairs, degree
saturation, unsupported provenance, exhausted tasks, or legacy unknown dispatches
can leave pairs unevaluated. The observed unknown task remains blocked; it is not
replayed just because the selector changed. Legacy completed attempts without
pair receipts cannot be retroactively reconstructed. A memory-only export cannot
prove which of the user's remaining attempts will be available after deployment.

New receipts are scoped to the current Mindling's existing task state, normal and
preview stores retain their existing isolation, and unrelated users receive no
allowance. No migration or database schema change is required. Mocked normal and
preview identity copies test selector/worker isolation; no real browser/IndexedDB
validation was performed for this PR.

## Reproducible local audit and live comparison boundary

Run `node tools/semantic-coverage.mjs /authorized/local/export.json`. A full
`{mind}` export includes task receipts; a memory-only array or `{memories}` export
reports `historyIncomplete: true`. Output includes current possible pairs,
excluded IDs/reasons, batch selections, recorded submissions/results, pending
candidates and persisted pairs missing from projection. It emits no passage text,
source URLs or raw model responses and performs no writes/network calls.

A live direct comparison has **not** been authorized or performed. The unchanged
contract accepts at most four pairs/request, so an unpruned 15-pair comparison
requires four batches rather than an invalid all-pairs payload. A bounded later
experiment would use the exact six exported passages, four direct batches and up
to four production-selected batches, no retries, existing model/2,600 output-token
cap, spread across existing allowed windows. Maximum is eight completions and
20,800 output tokens; no search. Input size must be counted from the exact eight
payloads before approval. Monetary ceiling is input-token-bound × configured
input rate + 20,800 × configured output rate. The configured model's billable
rates are not available in this repository, so **no dollar estimate or approval
request is invented**. Obtain those rates and present the actual capped cost
before any paid experiment. Offline mocks cannot establish the model's real
proposal rate, quote accuracy or semantic precision.

## Verification

Passed focused offline scripts:
- `node tests/semantic-diagnostics.test.mjs`
- `node tests/semantic-coverage.test.mjs`
- `node tests/model-semantic.test.mjs`
- `node tests/semantic-scheduling.test.mjs`
- `node tests/semantic-allowance-settings.test.mjs`
- `node tests/semantic-isolation.test.mjs`

Includes exact authorized records, correction lineage, service provenance, direct
vs production mocked contract, cross-category/no-overlap discovery, stale evidence,
reciprocal persistence, reload progression after abstention, permission/isolation
checks, unchanged budgets, unknown-outcome protection and graph projection.
Syntax and diff checks also run. No paid model calls, browser automation, builds,
production writes or automatic merge. No claim of deployed/live semantic success.

## Pair-level current six-record delivery audit

This is static candidate eligibility, not an inferred relation list. Later batches
advance after completed assessments; cost windows can still defer dispatch.

| Pair (topics) | Before: eligibility | After: initial batch |
| --- | --- | --- |
| Bitcoin proof of work ↔ How PoW and PoS propose blocks | Excluded: SERVICE provenance | SELECTED |
| Bitcoin proof of work ↔ Security and decentralization depend on implementation | Excluded: SERVICE provenance | SELECTED |
| Bitcoin proof of work ↔ Transactions, blocks, and consensus | Excluded: SERVICE provenance | SELECTED |
| Bitcoin proof of work ↔ Energy, security assumptions, and rewards | Excluded: SERVICE provenance | SELECTED |
| Bitcoin proof of work ↔ Ethereum proof of stake | Excluded: SERVICE provenance | BATCH_LIMIT |
| How PoW and PoS propose blocks ↔ Security and decentralization depend on implementation | Excluded: SERVICE provenance | BATCH_LIMIT |
| How PoW and PoS propose blocks ↔ Transactions, blocks, and consensus | Excluded: SERVICE provenance | BATCH_LIMIT |
| How PoW and PoS propose blocks ↔ Energy, security assumptions, and rewards | Excluded: SERVICE provenance | BATCH_LIMIT |
| How PoW and PoS propose blocks ↔ Ethereum proof of stake | Eligible | BATCH_LIMIT |
| Security and decentralization depend on implementation ↔ Transactions, blocks, and consensus | Excluded: SERVICE provenance | BATCH_LIMIT |
| Security and decentralization depend on implementation ↔ Energy, security assumptions, and rewards | Excluded: SERVICE provenance | BATCH_LIMIT |
| Security and decentralization depend on implementation ↔ Ethereum proof of stake | Excluded: SERVICE provenance | BATCH_LIMIT |
| Transactions, blocks, and consensus ↔ Energy, security assumptions, and rewards | Excluded: SERVICE provenance | BATCH_LIMIT |
| Transactions, blocks, and consensus ↔ Ethereum proof of stake | Excluded: SERVICE provenance | BATCH_LIMIT |
| Energy, security assumptions, and rewards ↔ Ethereum proof of stake | Excluded: SERVICE provenance | BATCH_LIMIT |


## Later three-memory export and 08:36 incident

The later authorized export (`semantic-audit-three-export.json`) has three
AUTONOMOUS memories: blockchain ledgers, smart contracts and consensus mechanisms.
All three possible pairs were submitted according to the supplied service
counters, and static selection reproduces all three. The worker retained
`INVALID_SCHEMA`, `OUTCOME_UNKNOWN`, one supplemental reservation, zero completed
analyses. **Candidate exclusion is not the cause of this snapshot's failure.**
The local grammar abstentions are still separate from model validation.

Confirmed diagnostic defect: the semantic endpoint collapsed incomplete
completions, JSON parse failures and invalid result envelopes into the same code
and did not log their details. The patch preserves the fixed, allowlisted detail,
phase, endpoint and upstream HTTP status through server response, browser task
state and the existing maintenance diagnostic export. Offline cases distinguish
`COMPLETION_INCOMPLETE`, `COMPLETION_JSON_INVALID` and `RESULT_ENVELOPE_INVALID`.
It does not infer which happened in production from the old generic code. No
raw response, user text, provider name or credentials are logged. Budgets and
unknown-outcome replay protection remain unchanged.

Two other failures in the same attachment are separate operations:

- `d02fa2…`: research acquisition returned three distinct hosted tool IDs under a
  two-call authorization: two completed, one incomplete. The information parser
  rejected it as `TOOL_BUDGET_EXCEEDED` before retained source extraction. The
  supplied log is consistent with retaining the reservation and uncertainty.
  It does not show that the semantic model rejected any memory pair. Increasing
  the budget or ignoring the third event is not justified by this audit.
- Blockchain wallets: a correlated received research response was validated, then
  local checkpoint persistence failed. This is not a missing-response claim or
  a semantic rejection. The attachment does not expose the failed transaction's
  underlying exception, so quota, serialization or stale-state explanations are
  hypotheses. No new search, checkpoint bypass or database reset is introduced.

After deployment, inspect the **semantic** event/maintenance detail for a newly
permitted run and compare proposed/accepted/persisted counters and pair outcomes.
Do not manually replay an unknown dispatched attempt. The exact live failure
requires this new diagnostic or the original safe server trace; it has not been
reproduced by making paid calls. This PR fixes the proven delivery barriers and
the missing diagnostic distinction, not an unobserved model response.
