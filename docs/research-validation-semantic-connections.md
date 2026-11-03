# Research envelope validation and persistent semantic connections

Base: main `8055be1`, including merged PR #119. No production data or paid/live
model requests were used. All research responses in verification are explicit
authored fixtures, not reconstructed historical responses.

## Research incident: confirmed defect and limits of the evidence

The reported request had three accepted candidates but failed later with
`RESPONSE_PARSE_ERROR / VALIDATION_FAILED`. In the baseline handler,
`selectSourceEvaluation()` validates proposed claims against cited passages; it
does **not** establish that every acquisition/checkpoint field is valid. After
that selection, `validateAcquisition(result)` and
`validateResearchCheckpoint(recoverable)` could both throw the same unclassified
error. The trace still said `SOURCE_EVALUATION`, obscuring the actual failing
layer. Response serialization happens later and has a separate diagnostic.

One concrete mismatch is confirmed and reproduced:

- Citation extraction accepted a title if it was a nonempty trimmed string under
  the length limit. It did not forbid embedded line breaks or hidden controls.
- Final acquisition validation required `text(source.title, 240)`, which forbids
  all Unicode control/format characters, including an ordinary title newline.
- The title is not a claim field, so all three claims can pass source evaluation
  while final acquisition validation rejects that title.

Running the unchanged main handler with a synthetic three-source response and
title `Crypto Market\nRisks` produced **HTTP 502, phase SOURCE_EVALUATION,
upstream 200, two completed hosted calls, sourceCount 3, candidates 3, accepted 3,
empty rejections/metadataRejections and detail VALIDATION_FAILED**. This matches
the reported diagnostic pattern without replaying the production request.

**The original production response is unavailable.** The provided log cannot
prove which title/field or final checkpoint invariant failed in that particular
request. No connected Vercel log tool is available. The reproduced contract
defect is confirmed; attributing the historical incident specifically to a
newline title would be a hypothesis. New rule-specific diagnostics distinguish
the remaining cases rather than treating accepted candidates as blanket proof.

## Validation repair

1. Normalize only display-title layout spaces/tabs/CR/LF to a single space, before
   source evaluation or signing. Do not modify source passages, quotes, source
   IDs, hashes, validity dates or claim metadata. Unsafe control/format characters
   are not stripped into acceptable data: the citation is dropped with the
   existing `INVALID_TITLE` extraction diagnostic. Other valid sources survive.
2. Validate acquisition metadata before spending the evidence-evaluation call.
   Invalid fields receive fixed codes such as `RESPONSE_ID_INVALID`,
   `SOURCE_TITLE_INVALID`, `SOURCE_PASSAGES_INVALID`, `SOURCE_HASH_INVALID` and
   `SOURCE_METADATA_INVALID`, without logging field values or private text.
3. Validate signed evidence before publishing it as a recoverable checkpoint.
   Checkpoint errors identify fields, request, plan, unexpected evaluation data
   or `CHECKPOINT_SIZE_LIMIT`. New trace phases distinguish acquisition,
   checkpoint and final response validation. Existing success diagnostics retain
   their established phase and counters.
4. A second confirmed boundary problem is JSON-escaped evidence exceeding the
   existing 24,000-character checkpoint ceiling. If necessary, remove only a
   redundant **single** `passages` entry that is byte-for-byte the same string
   as `source.text`. The already-supported single-text representation preserves
   the exact passage and its boundary, hashes and source ID. Both the acquisition
   and signed checkpoint use this same representation. No ceiling is increased.
   Multiple passages are never flattened, truncated or discarded to fit; an
   unrepresentable checkpoint fails precisely before assessment, without emitting
   an invalid recovery receipt or repeating hosted search.

Final acquisition/checkpoint checks remain mandatory. HMAC verification, expiry,
source/date/quote validation, byte limits, request correlation and browser receipt
matching remain intact. A tampered normalized title still invalidates its signed
proof. Evaluation-only recovery continues to use the same signed public evidence
without a new search.

Old failed tasks whose evidence never reached the browser in a valid signed
checkpoint cannot be reconstructed from counters or logs. Their reserved budgets
are not reset. This patch does not invent recovery evidence or replay the old
production request. Existing canonical memories require no reset or re-teaching.

## Why independently acquired memories were disconnected

The graph already projects `relatedMemoryIds` correctly and its Connected
Memories list navigates both endpoints. The primary gap was **creation of durable
relationships**, not graph rendering or IndexedDB loss.

Teach/Deep can retain an explicit validated `LINK_TO_EXISTING` decision, but the
bounded candidate selection is lexical and may omit a relevant, differently
worded claim. Native/research relationships also promoted lexical retrieval IDs
to stored associations. Those scores examine words and co-occurrence, often
including a generated provenance prefix, and cannot establish a semantic role.
No local mechanism reconciled already retained, independently acquired records.

## Shared claim-grounded connector

`src/semantic/memory-connections.js` now runs during canonical formation for both
service-backed Teach/Deep and native/source-backed retention. It also runs in
both existing startup transactions, after hydration and the existing safe label
repair. No separate database, provider, model call or background loop is added.

The connector reads the **actual editable canonical claim** and meaningful
category/topic metadata. It strips a generated prefix only when corroborated by
that record's stored URL/time, as PR #118 requires. Prompt text, source URLs,
Origin DNA and model confidence are not relationship evidence.

Its conservative English grammar recognizes explicit asserted propositions with
subjects, predicates and objects: definitions, use/dependency, containment,
recording/support and explicit descriptions of a named parent's parts. Whole
noun phrases can align across two claims after limited grammatical number
normalization. Existing metadata must ground the proposition; metadata alone
cannot establish a link. Indexed phrase roles provide bounded candidate sets.

Supported structural bases include:

- An explicit definition whose object is described as another claim's subject.
- A dependency/application whose object is described by another claim.
- Two distinct applications explicitly using the same named dependency.
- Complementary predicates describing the same subject.
- An explicit containment statement and a description of that parent's part.

The tests' crypto-market claim explicitly says cryptoassets use blockchain
ledgers; the Solana claim explicitly describes cryptoassets and ledger use; the
technical claim describes ledger consensus. Their connections therefore follow
stored propositions, not the earlier `Learn ...` prompts. Cross-area links use a
compound entity such as **blockchain ledgers**; a shared single noun with different
metadata remains ambiguous (e.g. planet/element **Mercury**).

The persistent graph type remains the existing generic **association** in
reciprocal, deduplicated `relatedMemoryIds`. Small optional `semanticAssociations`
audit entries record policy version, target ID, rule and grounded entity. They do
not claim equivalence, causality, independent verification or a new capability.
No new database schema or visual edge taxonomy is required.

The autonomous source-evaluation response contains category/topic metadata, not
existing-memory relationship IDs. Its authorized context contains public source
evidence rather than private saved memories. A general model-based comparison
would require a changed context/privacy contract; it is not silently added within
an unrelated request. Teach/Deep already supplies bounded memory context and its
validated explicit relationship decisions remain usable.

Validated explicit inference targets remain supported and are deduplicated even
if the local connector already found that target. Lexical retrieval stays useful
for candidate selection and native safety checks, but no longer independently
authorizes new durable edges. Existing associations are never removed. Correction
successors retain newly justified and inherited links; the PR #119 evolution
guards, historical versions, sources, strength rules and accounting remain.

## Existing-record reconciliation and limits

- At most 1,000 records (the existing normal capacity), eight clauses per record,
  twelve evaluated candidates per record and four new automatic neighbors per
  record. Indexes are disposable; no polling or per-frame database reads.
- A store above the normal record ceiling is left untouched, avoiding unbounded
  work or ambiguous identity handling. Duplicate IDs, malformed arrays, incomplete
  content and missing meaningful metadata are skipped.
- Historical, mutable preference/goal, intention, explicitly uncertain or
  unresolved-conflict records are not used to invent new semantic links.
- Negation, uncertain/conditional language, fictional names, quoted titles and
  unsupported grammar remain unlinked. Speculation with matching topic words is
  insufficient. Existing valid/manual/history associations survive.
- Repeated startup is idempotent. Only missing related IDs and their bounded audit
  entries are added; IDs, claims, labels, sources, timestamps, strength,
  activations, evidence units, XP, Energy and keys are not rewritten.

This is not universal language understanding, embedding retrieval or a new
classifier. Unsupported languages, aliases, implicit relationships, ambiguous
homonyms and facts beyond the bounds may remain disconnected. Their original
claims are preserved for future evaluation. Additional inference is not silently
introduced to resolve them. The particular unseen production memories cannot be
promised new links from prompt titles alone; their retained claims must support
one of the explicit relationships.

## Verification

Local Node/browser fixtures cover the reproduced accepted-three/final-failure
contract, valid three-claim completion, strict malformed-field rejection, safe
title normalization, signed receipt tampering, single-passage checkpoint
compaction, oversized multipart rejection, evaluation-only recovery, structural
connections, Teach/Deep/research formation, cross-area/old-record repair, false
positives, homonyms, historical records, reciprocal uniqueness and bounded work.

The new Chromium script runs real local handlers, receipt checks, engine and
separate primary/Preview IndexedDB stores. It confirms **three retained claims,
three sources, two completed hosted calls, 7/7 completion**, then reload/retry
without another request. It seeds missing edges in isolated saved fixtures and
opens the actual `/` and `?stage-preview=1` startup paths. Connected Memories
shows compact semantic titles with keyboard navigation; raw source evidence
remains intact in Memory maintenance. Reconciliation makes no API request and
reload adds no duplicate edges. No live source content is claimed by these tests.

Results: **15 new Node tests pass; focused coverage 85/85**. Full
`node --test tests/*.test.mjs`: **373 pass / 22 fail (395 total)**. The same
command on unchanged `8055be1` in a separate worktree: **358 pass / 22 fail
(380 total)**. All 22 failing test names are identical; there are no new failures.
Existing failures include stale XP expectations, older decision/evidence fixtures,
evolution timing and a read-only projection assertion.

**Eleven Chromium scripts pass**: the new research/semantic integration script,
PR #119 minimal/evolution behavior, autonomous integration, source evaluation,
limitation recovery, administrative corrections, analysis-502 recovery,
live-research diagnostics, successful-receipt recovery, shared Teach parity and
Teach/Deep rollback/retry. Changed-source syntax and Git whitespace checks pass.
Administrative removal also clears the new association audit references.

The standalone old M3 browser script has pre-existing obsolete controls and is
not claimed as validated. No paid API call, screenshot, dependency installation,
production-data mutation or deployment was performed.

## Production verification after deployment

1. Deploy frontend and existing serverless handlers together; reload stale tabs.
   No new provider setting, credential, dependency or IndexedDB migration is needed.
2. Preserve the existing identity. Open Memory and compare eligible old claims'
   IDs, text, labels, provenance and counters. Only justified missing links/audit
   metadata should appear; no re-teaching or brain reset is required.
3. Select the ledger/consensus memory. Confirm supported crypto/Solana neighbors
   appear as compact titles and reciprocal navigation survives reload. Ambiguous
   speculation should not gain an invented link.
4. With separately authorized real inference, inspect a **new** valid bounded
   research task. Confirm accepted candidate count, final envelope validation,
   retained source/claim counts, completion and unchanged budgets/accounting.
   Do not replay the missing historical response or reset its spent reservation.
5. If it fails, use the exact new layer/rule diagnostic and correlation ID in
   maintenance/server logs. Preserve any valid signed checkpoint for its existing
   bounded evaluation-only retry. Never infer browser receipt from HTTP 200 alone.
6. Confirm PR #119 minimal UI and administrative tools, independent source
   attribution, safe automatic evolution, historical lineage and sandbox isolation.

Local mocked end-to-end success is verified. The exact original incident payload
and successful live production research/relationships remain unverified.
