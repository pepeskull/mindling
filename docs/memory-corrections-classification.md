# Memory corrections and shared knowledge classification

## Confirmed causes

Inspected against main `904c228` (merged PR #117). No production data or live
model responses were accessed.

1. `AutonomousLearningEngine.manageKnowledge()` marked the research memory
   historical before calling the older `learn()` path without a service
   assessment. There was no comparison with the original editable claim.
2. Canonical research content includes a generated `Source observation (...) from
   URL: ` prefix. The current inspector normally used `research.evidenceText`,
   which omits that prefix. Native exact matching compared the submitted claim
   with the prefixed canonical content, after the original had already been
   excluded from current knowledge. This missed an unchanged claim.
3. Native fallback classification constructed `Notes: <lexical keyword>` and a
   topic from the first four extracted terms. These were persisted labels, not
   merely UI formatting. Excluding the original from active category retrieval
   also deprived the replacement of its original classification context.

A local reproduction using the **unmodified baseline reducer**, a synthetic
source-attributed genre claim and its identical editable text produced two
canonical records, made the original historical, assigned `Notes: common` /
`common video game genres`, spent 2 Energy and awarded 5 XP. The particular
lexical suffix depends on the claim and surrounding knowledge.

The report that the production textarea included the prefix cannot be proved
from the current modern-record initialization: it already prefers
`research.evidenceText`. Its legacy fallback did expose full canonical content
when that field was absent. Both prefixed and bare unchanged submissions are
covered; no assumptions about the user's unseen record are required.

## Comparison with Stage Preview

The service-backed classification was introduced in `5ecc914`, extended with
the atomic decision contract in `81d5c9b`, and shared with the main application's
Teach/Deep flow in `35d6186` (PR #113). That fix remains present. **Correction
handling bypassed it.** Autonomous acquisition already uses structured
classification from validated source evaluation; it is not the origin of the
`Notes:` labels in this reproduction.

Corrections now reuse `learningContext()`, `requestLearningAssessment()`,
`decisionSchema()`, `validateDecision()`, `recordMemory()` and `assignCategory()`.
There is no second classifier, provider, memory store, search request or model.
The existing learning endpoint accepts an optional bounded correction context.
For that purpose only, its strict model envelope includes a v2 decision and an
explicit `subjectChanged` boolean; the endpoint still returns the established
normalized v2 assessment. Ordinary Teach/Deep retain the existing v3 contract.

## Correction policy

- Compare before inference, version transitions, journal writes or costs. The
  server is never called for a no-op. Plain prose layout whitespace is ignored;
  case, punctuation, quoted literals, code, lists and tables are compared
  conservatively. This is a presentation comparison, not an attempt to prove
  semantic equivalence of different wording.
- Strip a generated prefix only when its exact timestamp and URL are
  corroborated by the same stored record. The inspector separates the editable
  claim from read-only source metadata. Ambiguous source-looking text stays text.
- An explicit correction receives one semantic assessment through the existing
  learning service. Preserve meaningful category/topic metadata when that
  assessment confirms the subject is unchanged; classify a changed subject
  afresh. Ambiguous, unsafe, low-confidence, duplicate or failed assessments
  leave canonical knowledge and counters unchanged.
- A genuine replacement uses the existing correction reward (3 XP) and Teach
  cost (2 Energy), once. It is explicitly user-provided, unverified knowledge.
  It inherits no `research` metadata or source verification. The original keeps
  its content, timestamps, hashes, citations and research provenance, with only
  historical status and version links added.
- Reuse the original neural associations; retain related memory IDs and add
  reciprocal links without duplication. No artificial neurons or synapses are
  created. Original unrelated knowledge stays intact.
- Recheck identity, current target, relevant context and budgets in the storage
  transaction. A concurrent identical correction aborts the second transaction
  and journal write. Repeated submission via an old ID is a free no-op only if
  it matches the current descendant; a different stale edit is rejected.
- New assignments reject `Notes:` at the shared validator/category boundary.
  The old native fallback uses honest `Unclassified claims` / `Unclassified
  claim` labels where no safe existing subject metadata is available. Its old
  lexical progression concept is retained to avoid changing growth/XP rules.
  This fallback is not used to replace failed service assessments.

## Existing data

No IndexedDB schema migration, reset, re-onboarding, deletion or memory merging
is needed. Both existing startup transactions run a bounded metadata repair
over at most 1,000 saved records, without network access.

Repair requires all of the following: a current `Notes:` replacement, explicit
bidirectional correction lineage, a parent with structured source-evaluation
classification and stored evidence text/hash metadata, an identical editable
claim, meaningful parent labels, and a compatible category registry. It copies
only that known classification and records the previous labels in a versioned
audit field. IDs, text, source authority, historical/current status, associations,
evidence records, Energy and XP are preserved. A second run makes no changes.

Changed claims, missing structured provenance, conflicting category labels,
unlinked records and independent `Notes:` memories are deliberately skipped.
The repair does not retroactively claim a model evaluation of the corrected
text, undo prior costs/rewards, upgrade verification or invent specialization
evidence. Such ambiguous legacy records require an explicit future correction.

## Local verification

All upstream responses and cited genre reports in these checks are **authored
synthetic fixtures**, not retrieved extracts from the supplied source URLs.
The browser permits only the local test server. No paid or live model call,
production-data mutation, dependency installation or deployment was performed.

- New correction Node coverage: 18/18 pass.
- Focused Node checks including shared Teach/Deep, learning HTTP route, native
  matching and HTTP-502 regression coverage: 67/67 pass.
- Full `node --test tests/*.test.mjs`: 340 pass / 22 fail (362 total).
- The same full command on unmodified `904c228` in a separate worktree:
  322 pass / 22 fail (344 total). The 22 failing test names are identical;
  no new failures. They include older XP expectations, decision fixtures,
  evolution timing, evidence migration and read-only-view assertions.
- Chromium: new correction inspector tests in primary and Preview IndexedDB,
  real `/` and `?stage-preview=1` startup repair and reload, semantic label
  preservation, no-op feedback, source history, user provenance, version links,
  counters and store isolation.
- Existing Chromium: actual-URL Teach classification parity, automatic research
  integration/recovery, independent source validation, limitation recovery,
  analysis-502 recovery, successful-receipt recovery and Teach/Deep rollback.

Tests use the real local handlers, orchestration, inspector and storage adapters
with mocked upstream inference. They establish contract and persistence
behavior, not the quality of a live model's semantic classification.

## Production verification after deployment

1. Record a completed research task's sources, current claims, category/topic,
   Energy, XP and version IDs. Do not reset the identity.
2. In both normal and isolated Preview, open Manage retained knowledge. Confirm
   only the claim is editable, with URL/time outside the textarea.
3. Save unchanged text, then prose whitespace-only edits: expect clear no-change
   feedback, no learning request, no versions/history/evidence/counter changes.
4. With authorized inference, make one genuine correction: expect one learning
   assessment, one user-provided replacement, the old version/source history
   intact, unchanged neural structure, and one ordinary correction cost/reward.
   Confirm same-subject labels are retained and changed-subject labels are
   meaningfully assessed. No hosted search is needed for correction.
5. Repeat the submission and reload: expect no duplicate version or reward.
   Confirm legitimate associations and historical source details remain visible.
6. Confirm a provable old no-op pair repairs its metadata once; independent or
   ambiguous old `Notes:` records stay untouched. Check primary/Preview isolation.
7. Check a new authorized Gaming research task still integrates supported claims
   with its original evidence safeguards, signed receipts/checkpoints and budget.

Production success and exact live model labels remain unverified until these
checks are performed after deployment. No new configuration is required beyond
the existing learning-service configuration.
