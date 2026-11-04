# Knowledge intelligence, corrections, rewards, graph and research accounting

## Scope and evidence

Base: `6b447d5` (merged PR #120, including #119). All reproduction uses authored claims, mocked upstream responses and isolated local IndexedDB. No historical production request was replayed, no paid inference was used, and no production data was read or modified. No new provider, credential, dependency, schema migration or deployment setting is required.

The supplied screenshot and diagnostic identify symptoms, not their complete production cause. In particular, neither the exact Video games → Definition edge nor the raw Responses payload for `9a735e…` was available. Findings below distinguish reproduced code defects from those unresolved production details.

## 1. Missing semantic relationships

The formation, transaction and hydration hooks introduced in #120 are present in both applications. The failure reproduced locally was analysis coverage: a small verb vocabulary, whole-phrase comparisons, no local pronoun resolution, and rejection of single-noun connections across different labels. The supplied transaction claim, validation, consensus, blocks, token operations and player-feedback claims exercise those gaps.

`claim-structure.js` now supplies a shared, bounded proposition reader: explicit definitions, generic operations, actor/object roles, explicit contextual scopes, possessives and conservative local `it` resolution after a definition **within the same canonical record**. It is not a truth classifier or general natural-language inference engine. The connector uses actual propositions and shared explicit context to justify scoped actor functions, operations on a defined object and provided dependencies. Matching words or classification titles alone do not authorize a link. Candidate labels affect priority only.

The existing commit paths save reciprocal `relatedMemoryIds` and auditable `semanticAssociations`; hydration reconciles existing eligible memories in the same storage transaction. Explicit model targets are retained and newly recorded as `modelAssociations`. Existing IDs, content, source evidence, strength, activations, category/topic metadata and historical records are not rewritten. Existing supported submission links can gain semantic audit metadata; unsupported grouping links remain grouping links in the projection.

Work remains capped at 1,000 records, 12 candidates per evaluated record, eight sentences and four automatic **current eligible** neighbors. Historical links are preserved without exhausting the successor's current-neighbor budget. Ties are deterministic; repeated reconciliation and reload are idempotent. This intentionally does not promise identical selected edges across every possible learning order once a degree limit is full.

Limitations: local English proposition patterns cover a subset of language. Negation, uncertainty, fiction, incomplete captures, unresolved contradictions and ambiguous references remain unresolved. There are no extra model calls, domain-specific blockchain rules, transitive closure or all-to-all links.

## 2. Save correction

Basic atomic saving was already implemented; the production report alone did not prove a lost write. Two defects were reproduced:

- Maintenance resolved only original `task.knowledgeIds` with research provenance. After a user correction superseded that source record, reopening no longer exposed its current user version; rebuilding the dialog also lost feedback.
- Semantic analysis ran before the original became historical, then inherited automatic associations without reevaluating the new claim. Historical neighbors could also consume the current degree cap.

Corrections now defer connection analysis until the old version is historical. Automatic associations are reevaluated from the replacement text; unknown/manual links are preserved. Parent text and research evidence stay historical and unchanged. The successor is explicitly player-provided, with no inherited research authority. Source-task IDs still reference their original evidence; maintenance follows only reciprocal correction lineage to the active editable descendant. The actual graph selects the saved current version and updates after the committed change. Dialog reopening preserves expansion context and success feedback.

The existing policy remains: changed correction costs normal Teach Energy (2), earns 3 XP once, and creates one canonical version. No-op and whitespace-only prose submissions perform no inference, writes, costs or rewards. Validation, stale context, capacity, insufficient Energy, inference and storage failures leave canonical knowledge and accounting unchanged. Current corrected knowledge can be corrected again; the source-record removal action is not misrepresented as removing a user-owned successor.

## 3. Teach / Deep XP

Direct supplied Teach/Deep facts already used the shared concept reward (5 XP). Their committed rewards were not missing in the reproduced direct path. However, source-backed research used the autonomous formation authorization for **both** background research and user-requested Teach/Deep research; all its history events received 0 XP.

Qualifying manually requested Teach/Deep research now uses the existing `learningReward('concept')` once per activity after new canonical formation. The reward, matching history event, milestone, Energy and canonical records commit atomically. Task/request guards prevent a second reward; duplicate/support-only results earn no new formation reward. The shared daily XP limit still applies and failure rolls the entire integration back. Corrections retain 3 XP. Background research and Talk remain 0 XP. There is no retroactive reward rewrite: without the actual historical task origin flags, the supplied zero-XP events cannot all be classified as erroneous.

Browser checks cover actual Teach/Deep form submissions, failed requests and retry, Deep extension/reinforcement, no duplicate reward, Development totals, `BrainEngine.hydrate()` parity with persisted gameplay, history totals and reload. Separate real-handler/store checks cover manual research Teach/Deep, three accepted claims with only one reward, daily-limit rollback and background XP0.

## 4. Controls

The Memory footer and visible maintenance button are removed, including obsolete handlers/selectors/styles. Focus selected is removed from Memory and Development controls and its obsolete action wiring. Zoom, Fit, Reset, drag, keyboard selection and inspectors remain.

The internal evidence/history/export/correction surface remains accessible with **Alt+Shift+M while Memory is visible**. There is no replacement visible maintenance control. Its listener uses the view's existing abort lifecycle; dialogs close on teardown.

## 5. Graph meaning and geometry

Two confirmed sources of misleading edges/counts were found:

- Same-submission atoms were automatically inserted into `relatedMemoryIds`, even when no semantic decision connected them.
- The counter accumulated every nonhierarchy pair, including history, components and submission provenance.

New atoms retain `coSubmittedMemoryIds` instead of gaining automatic semantic links. For older records, projection recognizes proven mutual same-submission grouping and explicit version lineage. It does not delete stored references. Audited structural/model decisions override that grouping classification. Unknown legacy/manual associations remain associations.

**Stored associations** means unique undirected persisted memory association pairs, including retained historical memory associations where present. Reciprocal records count once. Hierarchy, version links, parts, submission groups, self/dangling references and task/work-group edges do not count. The statistic's tooltip states this meaning.

Each projected edge exposes its endpoints, source memory IDs, origin field and persisted/derived flag; semantic edges also expose the stored rule/entity/scope when available. Research edges expose task identity and whether they derive from a task reference or work group. Organization is faint/dotted; semantic associations are solid accent lines with bounded signals; version/part links are dashed violet; submission grouping is faint/dotted; research keeps its gray identity. Selection emphasizes connections without converting their types. Animation signals run only along persisted association edges, on the existing lightweight overlay, respecting reduced motion and visibility.

Labels are read-only. Generic topic labels can use a real explicit claim subject; single-topic generic areas use existing topic context, and multi-topic definition areas identify their topic count. Repeated memory titles gain a short actual-claim context line in the index. Source wrappers/URLs are not used as titles or context. Incomplete or ambiguous metadata gets a safe fallback. Group IDs, stored labels, distribution counts and pathway inputs do not change.

Compact deterministic cluster packing replaces oversized radial padding; node radii are 7/8/11 (historical memories 5.5). Curves have bounded bend. Labels retain screen-space font sizes and use measured rectangle collision checks. No semantic calculation runs per animation frame. Chromium checks the actual renderer at 1600×1050 and 1180×820: all primary area labels visible, no primary-label overlap, useful Fit, visible cross-topic persisted edges, correct counter, no page overflow, zoom/reset/drag/selection and reload. Larger graphs retain the existing bounded overview/zoom behavior; this is not a promise that every label is visible simultaneously for thousands of records.

The screenshot's specific Video games → Definition edge remains unclassified without its actual saved IDs. Regressions demonstrate the difference between hierarchy, known submission grouping, reviewed semantic links and unrelated Gaming/blockchain claims instead of declaring that unseen edge invalid.

## 6. Responses tool budget

Confirmed: `max_tool_calls` already uses the validated remaining ceiling (1–2). The parser previously threw `TOOL_BUDGET_EXCEEDED` **before** registering observed tool results. Thus an HTTP200 over-ceiling payload reproduced the diagnostic's misleading completed0/unknown pattern, regardless of whether those events represented distinct calls. The raw incident payload is unavailable, so an upstream overrun, duplicate event or incomplete response cannot be selected as the production cause.

`research-tool-accounting.cjs` now accounts before classification:

- One/two completed tool events remain compatible with existing payloads.
- Identical repeated events with the same explicit ID count once. Conflicting entries under that ID fail safely, without counting the conflicted call as confirmed.
- More distinct explicit IDs than authorized fail as `TOOL_BUDGET_EXCEEDED`, retaining actual confirmed counters.
- Over-ceiling anonymous events fail as `TOOL_ACCOUNTING_AMBIGUOUS`; distinct billable calls cannot be inferred from them.
- Incomplete/missing/null output and unfinished events retain uncertainty. An excessive accounting payload fails with a bounded diagnostic.

`observedToolEvents` reports the raw event count without IDs, text or prompts. Observation-only counters can represent a rejected overrun (bounded at 64); **dispatch reservations remain at two and model calls at four**. These counters are provider-reported operations, not billing statements. No sources are extracted or accepted from an invalid overrun/ambiguous response. No signed receipt is invented. Existing reservations survive reload and prohibit another search. Previously signed valid evidence can still use the remaining evaluation-only request; checkpoints and evidence validation are unchanged.

No new Responses options, fallback model, token increase, billing permission or search retry was added. A provider ignoring its request ceiling cannot be repaired locally; the application rejects and diagnoses its response conservatively.

## Verification

- Focused Node: **112/112 pass** (new realistic knowledge/accounting cases plus existing semantic, correction, graph, evolution, source-validation and 502 recovery regressions).
- Unchanged main: **395 tests, 373 pass, 22 fail**.
- Branch: **407 tests, 385 pass, the same 22 failures**. Compare exact failure names, not test ordinal numbers (new tests shift them).
- Nine Chromium suites: `knowledge-intelligence-browser`, `teach-deep-502-browser`, `research-semantic-connections-browser`, `memory-corrections-browser`, `minimal-neural-evolution-browser`, `production-research-502-browser`, `source-evaluation-browser`, `research-success-receipt-browser` (34 transport/receipt/persistence/lifecycle cases), and `limitation-recovery-browser`. Mock upstream only; normal and Preview storage isolation, strict attribution and signed recovery preserved. Stateful fixture suites run against independent server state when required.
- JavaScript syntax and whitespace checks pass. No screenshots, paid calls or live production verification.

Reproduce focused Node with:

```sh
node --test tests/knowledge-intelligence.test.mjs tests/research-tool-accounting.test.mjs tests/research-envelope-semantic.test.mjs tests/memory-corrections.test.mjs tests/neural-memory-graph.test.mjs tests/neural-memory-evolution.test.mjs tests/production-research-502.test.mjs tests/source-evaluation.test.mjs
```

Run browser suites against the included local fixture servers, using `MINDLING_TEST_PORT` and matching `MINDLING_TEST_URL`. The Teach/Deep 502 suite uses its separate learning fixture server. These servers refuse external model requests.

## Production verification after review/deployment

1. Refresh both `/` and `/?stage-preview=1` so current client modules match the deployed diagnostic contract. Existing memories reconcile on hydration; no reset or data migration is needed.
2. Inspect known independently acquired claims and exported records. Confirm unchanged IDs/text/evidence and justified reciprocal links; compare the graph's audited edge types and unique-pair counter. Do not judge an edge from its screen position alone.
3. Teach a new supported fact and extend it through Deep. Check canonical state, intended XP/history and Energy. Repeat and force a failure: no duplicate writes/rewards or failed-operation charges.
4. Through internal maintenance, save a changed source-backed claim. Confirm a current player-provided successor, unchanged historical sources, appropriate connections, free no-op and correct reload behavior.
5. Check Fit/Reset/zoom/drag/selection, absence of removed controls, and labels at ordinary desktop sizes.
6. If a live research run is separately authorized, verify correlation IDs, requested ceiling, observed/completed counters, signed evidence, truthful limitations and source-backed integration. If overrun recurs, use its exact safe diagnostic to distinguish distinct-ID excess from ambiguous accounting. Never reset its reservation or replay the old production request.

Live inference/provider behavior and the unseen screenshot edge remain unverified. No merge or direct production deployment is part of this change.

## Changed file groups

| Files | Purpose |
|---|---|
| `src/semantic/claim-structure.js`, `src/semantic/memory-connections.js` | Shared claim structure, scoped associations and bounded reconciliation. |
| `src/preview/sandbox/memory-records.js`, `src/preview/sandbox/memory-mutation.js` | Defer correction connection analysis; separate submission provenance; record explicit model association origin. |
| `src/learning/correction-content.js`, `src/learning/memory-corrections.js` | Current-version navigation, correct ordering, user attribution and meaningful correction history. |
| `src/autonomous/learning-engine.js`, `src/autonomous/tasks.js` | Atomic manual-research rewards; persist reward guard and rejected-response observation counters. |
| `src/autonomous/task-inspector.js`, `src/memory/maintenance-view.js` | Active correction editing and preserved feedback/history/export. |
| `src/memory/graph-data.js`, `src/memory/memory-label.js`, `src/memory/neural-memory-view.js`, `src/autonomous/research-graph.js`, `css/neural-memory.css` | Read-only edge audit/typing/counter, contextual labels, compact packing and collision-aware rendering; remove footer/focus. |
| `src/development/development-view.js`, `src/development/neural-development-scene.js` | Remove Focus selected and its obsolete action wiring. |
| `src/server/research-tool-accounting.cjs`, `src/server/research-information.cjs`, `src/server/research-http.cjs`, `src/autonomous/service-diagnostics.js` | Distinct-ID accounting, precise safe diagnostics and conservative budget states. |
| `src/app/app.js`, `src/preview/sandbox/controller.js` | Stop promising zero XP before user-directed research has committed. |
| `tests/knowledge-intelligence.test.mjs`, `tests/research-tool-accounting.test.mjs`, `tests/knowledge-intelligence-browser.py`, `tests/support/knowledge-intelligence-fixture.cjs` | Incident-text, semantic, correction, reward, geometry and budget regressions. |
| `tests/neural-memory-graph.test.mjs`, `tests/preview-energy-atomic.test.mjs` | Update intentional counter/submission semantics, preserving explicit provenance. |
| `tests/teach-deep-502-browser.py`, `tests/research-semantic-connections-browser.py`, `tests/minimal-neural-evolution-browser.py`, `tests/support/autonomous-web-search-server.cjs` | Extend real UI/store checks and mock-only server; use internal maintenance shortcut and intended manual reward. |
| This document | Diagnosis, exact limits, verification and deployment checklist. |

## Existing full-suite failures

The same 22 names fail on unchanged main and this branch. They include historical 50/500-XP expectations, old duration/progression expectations, older specialization/decision expectations and an existing read-only-source assertion. They are outside this repair and are not claimed as passing.

- DEEP_TRAINING charges exactly 3 for committed new learning; XP stays 50
- M4.1 a free cared-for Mindling can reach Agent Mind at exactly 38 virtual days
- M4.1 learning is atomic, idempotent, duplicates rejected, growth detached
- M4.1 spam, repetition, meaningless input and daily XP farming fail atomically
- M4.1 stage durations total 38 days and require time, XP, learning and life
- TEACH charges exactly 2 for committed new learning; XP stays 50
- a valid stored correction can supply the final XP without creating neural structure
- final legitimate learning, elapsed time, offline life and Preview virtual time reconcile
- five consecutive Teach actions spend ten Energy at the same instant, preserve XP and memories
- memory visualization stays a read-only projection of canonical records
- nine-domain mapping, fractional evidence and retained migration are idempotent
- real case 3 also succeeds as a strictly validated v3 preamble plus targeted operation
- replays and duplicate XP farming remain rejected; continuous regeneration and care cooldowns remain
- synthetic decision: changed goal
- synthetic decision: changed preference
- synthetic decision: historical information
- synthetic decision: related knowledge
- synthetic decision: uncertainty
- synthetic decision: unverified claim
- ten Stage Preview messages need no elapsed time when Energy is sufficient
- three Deep Training actions and one Talk require no wait and consume ten Energy
- two independent preference updates on one legacy compound are one transaction and one correction reward
