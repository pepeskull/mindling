# Intelligence reliability and Network

## Verified defects

Research authorization and topic review shared the same popup and `consent` action. Even with saved Settings permission, a privacy-sensitive query entered `QUERY_REVIEW` and displayed “Enable autonomous learning?”. After approval, the action called `startIfAuthorized()` without clearing `QUERY_REVIEW`; that method explicitly excludes this code. The approved task therefore remained paused. This is reproducible offline. It does not establish the cause of every historical production pause.

Settings now exclusively changes permission. Disabled requests remain blocked with a Settings instruction. An enabled but potentially private request asks only for a short public topic; validated clarification changes its task to QUEUED before dispatch. It does not modify permission. Existing model/intent clarifications and transaction-level grant revision checks remain in place. Routine autonomous status does not open the Talk response popup.

`recover`, the queue, and the existing timer retain uncertain dispatch reservations. Known-safe continuations still use existing retry checks. Enabling Settings initiates an immediate scheduler check. Cooldown, cost-safety and Energy readiness have specific pause reasons. The public-topic review fix, rather than a relabelled PAUSED state, allows affected operations to continue.

## Cost policy and Energy

The fixed three-task check is replaced with a per-Mindling configurable UTC-day **inference reservation ceiling**, saved with existing research permissions. Default 12 preserves the previous worst-case automatic exposure; Settings offers 4, 8, 12, 20 or 40. Raising it is an explicit user choice and is not applied to other identities. Each automatic task conservatively reserves four requests at creation, with no refund for uncertain or unused work. Old daily `started` counters are read as four reservations per task, preventing a same-day reset during deployment. No database migration.

There is still a financial ceiling: this is not unlimited Energy-funded inference. Automatic research previously bypassed Energy charging, so Energy alone cannot bound its API spending. Its existing zero additional Energy charge is preserved; a two-Energy readiness gate now prevents automatic starts when depleted. Manual activity costs are unchanged. Automatic tasks remain at least ten minutes apart. Per-task maxima remain two hosted tool calls, four inference requests and three retained claims. Semantic scheduling remains independently capped at three calls per UTC day, with the existing explicit supplemental allowance and task ceilings. Existing XP calculations are untouched.

## Knowledge orientations and evidence

The exact-label registry had no mapping for Distributed ledger technology, Healthcare or Association football. Those records could populate Knowledge Network categories but have no supported evidence domain. The shared registry now recognizes these aliases, with a conservative Distributed Systems Explorer broad orientation. Existing claim, topic, submission, provenance, contradiction and narrow-specialization thresholds are unchanged.

The existing deterministic `reclassifyPathwayEvidence()` is reused with taxonomy version 2. Matching stored records gain auditable classification history, once; their content, source provenance, event IDs and Origin DNA are preserved. Unknown metadata remains unassigned. Repeated source-wrapped copies of the same exact claim are deduplicated using the existing provenance-aware text utility. This is not general paraphrase equivalence or independent factual verification.

Development displays missing breadth and unassigned reasons. Dashboard and Development still use the same selector. Origin fallbacks now use the shared family mapping to avoid equivalent developed/origin titles.

The 17-memory test reproduces the supplied category counts using explicitly synthetic distinct claims, topics and submissions. It establishes eligibility behavior, **not** that the user's unavailable full 17-record export qualifies. Six records from one submission or one topic do not qualify merely by count.

## Semantic worker

The separate worker retains the merged compact sentence-range contract, two-pair batches, exact supporting text validation, reciprocal persistence and uncertain-dispatch protections. Focused mocked handler/worker tests prove these paths independently of Teach. No live model-quality claim is made.

Network and Settings expose current scheduling/accounting. Network additionally shows examined pairs, accepted/rejected proposals, last successful analysis and sanitized failure diagnostics, including finish reason/token usage where recorded. Teach model associations, model-assessed semantic associations and co-submitted pairs are counted separately. Successful abstention is completed with zero accepted relationships, not a failure. Counts are bounded by retained task history; they are not a lifetime billing ledger.

## Network architecture

`src/network/network-view.js` implements the existing Network destination; `css/network.css` reuses Dashboard/Memory glass, typography, border and color tokens without shadows. Desktop has a signal panel above the communication and agent panels; mobile stacks internally scrollable panels. Hash navigation supports direct entry and back/forward. The underlying brain animation is suspended in Network.

Canvas 2D draws twelve layered left-to-right oscillating strands at at most 30 redraws/second, capped device pixel ratio 1.5. Status changes affect amplitude and flow; committed completion events can pulse briefly. Idle motion is explicitly ambient. Reduced motion draws a static field. Hidden/inactive views cancel animation; resize and media listeners are destroyed with the view. No network/model work originates from rendering.

`src/app/activity-journal.js` appends safe transition codes inside existing task transactions, bounded to sixteen per task. Failed transactions do not publish completion. `activity-data.js` combines this journal with existing learning history, deduplicates and limits projection to eighty events (forty visible). Legacy tasks expose their recorded current state without fabricated intermediate history. UTF-8 binary is a deterministic encoding of event codes; decoded mode displays those codes in readable form. No prompts, claims, credentials or private model reasoning enter the log. Reload reuses existing IndexedDB records; there is no second database or polling loop.

## Agent boundary

The existing `public-network.js` contains explicit illustration/demo nodes, not an authenticated peer transport. Network does not import them. The public adapter accepts authorized, bounded public connection records and supports connected/connecting/pending/offline/disconnected/error states. No adapter is connected in production: the page honestly shows no connected agents and no external communication available. Existing public Mindling identity is displayed, private keys are never accessed. Real discovery, authentication, signaling, messaging and peer consent remain future integration work; autonomous research consent does not authorize them.

## Validation and limitations

All development verification uses deterministic fixtures/mocked inference, with external browser requests blocked. New tests cover authorization, privacy review continuation, automatic scheduling/cooldown, reservation limits, domain attribution/reconciliation, duplicate claims, privacy-safe event encoding, adapter states, navigation, reduced motion, mobile bounds and real isolated normal/Preview storage.

No paid AI calls, hosted web search, external agent communication, production data changes or screenshots were performed. Full-suite failures are compared with unchanged main; exact counts are reported in the PR. Existing unrelated failing tests are not silently treated as passing.

Deploy as ordinary frontend changes; no credentials or new service are required. Inspect Settings' saved ceiling, enable only with intended authorization, and observe Network/task diagnostics. Live hosted research and real semantic output still require a separately authorized production run. Do not reset uncertain tasks or their reservation journals to force a successful demonstration.

## Recorded verification results

- Focused Node run: 36 passed, 0 failed. A subsequent targeted run after duplicate-evidence hardening passed all 31 checks.
- Full Node suite: 372 passed, 49 failed (421 total). Unchanged main `f37d03d`: 367 passed, the same 49 failures (416 total). No new failing test names.
- `intelligence-network-browser.py`: normal and Stage Preview pass, including actual application boot into `#network`, history navigation, Settings persistence, real IndexedDB, mobile-sized layout, reduced motion, teardown and zero learning API requests.
- `bounded-semantic-browser.py`: both modes pass reciprocal persistence/reload and no duplicate inference with mocked upstream.
- `git diff --check` and focused syntax checks pass.

The new page is responsive at desktop and narrow viewport widths. The application's existing desktop-device startup policy is unchanged: this work does not enable gameplay on phones/tablets blocked by that policy.

## Changed files

- `css/network.css`
- `docs/intelligence-reliability-network.md`
- `index.html`
- `src/app/activity-journal.js`
- `src/autonomous/autonomous-schedule.js`
- `src/autonomous/learning-engine.js`
- `src/autonomous/research-permissions.js`
- `src/network/activity-data.js`
- `src/network/network-view.js`
- `src/pathways/knowledge-attribution.js`
- `src/pathways/knowledge-evidence.js`
- `src/pathways/live-pathways.js`
- `src/pathways/pathway-view.js`
- `src/pathways/pathways.js`
- `src/pathways/specialization-taxonomy.js`
- `src/preview/evolution-preview.js`
- `src/semantic/model-worker.js`
- `src/semantic/scheduling.js`
- `src/ui/dashboard.js`
- `tests/autonomous-web-search.test.mjs`
- `tests/intelligence-network-browser.py`
- `tests/intelligence-network.test.mjs`

<details><summary>Existing failing test names, reproduced on unchanged main</summary>

- DEEP_TRAINING charges exactly 3 for committed new learning; XP stays 50
- Deep reinforces the known definition and links a distinct claim to that same target without 502 or overwrite
- M4.1 a free cared-for Mindling can reach Agent Mind at exactly 38 virtual days
- M4.1 learning is atomic, idempotent, duplicates rejected, growth detached
- M4.1 spam, repetition, meaningless input and daily XP farming fail atomically
- M4.1 stage durations total 38 days and require time, XP, learning and life
- TEACH charges exactly 2 for committed new learning; XP stays 50
- Teach and Deep formation independently connect real multi-sentence claims through the shared commit path
- a competing canonical paraphrase still blocks a proposed numeric successor
- a valid stored correction can supply the final XP without creating neural structure
- annotation test support remains isolated and obsolete browser application is absent
- anonymous over-ceiling output cannot prove distinct billable calls; incomplete and conflicting events preserve uncertainty
- automatic replacement refuses different-topic
- automatic replacement refuses limitations
- automatic replacement refuses same-publisher
- automatic replacement refuses third-value
- automatic replacement refuses time-sensitive
- automatic replacement refuses verified
- corroborated same-frame correction creates one source-attributed successor with intact history
- display labels use actual subjects for generic topics without rewriting knowledge or leaking provenance
- exact repeat and independently cited support reuse one memory and cannot farm strength
- experimental AI systems and public benchmark UI are removed
- final legitimate learning, elapsed time, offline life and Preview virtual time reconcile
- five consecutive Teach actions spend ten Energy at the same instant, preserve XP and memories
- identical text with a different as-of date remains an unresolved temporal context
- large valid single passages compact losslessly within the original checkpoint limit and recover without search
- material limitations remain attached to support without increasing strength or verification
- memory visualization stays a read-only projection of canonical records
- new complementary knowledge stays distinct and creates real associations
- new rewards and anti-farming preserve old history
- nine-domain mapping, fractional evidence and retained migration are idempotent
- one contradictory report preserves incumbent and records unresolved evidence
- real Responses request shape, mandatory hosted search, same configured model and cited synthesis validation
- real case 3 also succeeds as a strictly validated v3 preamble plus targeted operation
- real case 3: legacy claim compound update preserves Alex, JavaScript history and original ID
- replacing a user claim never upgrades the original provenance or claims independent verification
- replays and duplicate XP farming remain rejected; continuous regeneration and care cooldowns remain
- separate Teach/Deep formation uses the shared connector and validates existing inference targets without duplicate edges
- similar prompt labels, negation, fictional names, incomplete data and speculation do not establish connections
- synthetic decision: changed goal
- synthetic decision: changed preference
- synthetic decision: historical information
- synthetic decision: related knowledge
- synthetic decision: uncertainty
- synthetic decision: unverified claim
- ten Stage Preview messages need no elapsed time when Energy is sufficient
- the shared Deep Training branch retains Stage Preview metadata and existing activity cost
- three Deep Training actions and one Talk require no wait and consume ten Energy
- two independent preference updates on one legacy compound are one transaction and one correction reward

</details>
