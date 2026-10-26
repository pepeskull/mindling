# M4.2.3 — Adaptive learning, canonical evolution and Energy

## Confirmed causes

The prior shared renderer already reads actual saved nodes/edges and rebuilds Three geometry when structure changes. Stage evolution alone only changed stage/XP metadata; it did not create learned structures (correct). Expansion only occurred on later learning, was globally capped at 64 rather than stage capacity, and every added neuron had [0,0,0]. Thus stage changes could leave actual counts at 5/4; later new records overlapped rather than visibly growing. Displaying the demo's 24-node stage model would conceal rather than fix the problem.

Pathway policy v1 recognized only a small exact-label taxonomy and one domain. Energy had one global maximum of 10. XP 50/75/60 with daily 500 and XP gates 100–3800 were disproportionate to short Teach actions.

## Pathway policy 2

Centralized exact structured category aliases now include Research methodology, Scientific research, Experiments, Academic research; Web development, Algorithms; Investing, Economics; and analogous communication/teamwork, game mechanics, creative practice, quantitative analysis, productivity/scheduling and cross-domain reasoning labels across all nine existing IDs.

An explicit structured label can combine up to three fully recognized domains using `and`, `&`, `/` or `;`. Split one unit equally among distinct supported IDs: Programming and Research methodology gives Developer 0.5 + Researcher 0.5, never two full units. Unknown components make the entire attribution Unassigned. No scanning or guessing from free-form body text. Existing origin selections, relevance-first retrieval and conflict precedence remain intact; multi-domain learning preference averages the attributable priorities rather than multiplying them. UI displays fractional units and the allocation policy.

An explicit transaction-time migration reclassifies only retained v1 stored-knowledge evidence with existing structured attribution field/value and matching Mindling scope. Each record retains ID, event, memory reference, timestamps and original provenance in classificationHistory (previous/new policy and classification). It advances that record to v2 once; repeated hydration is idempotent. Unknown/insufficient old evidence is not inferred from unrelated historical memory bodies. Read-only renderers do not perform migration. The ledger exposes classification changes. Original canonical memory content/classification, origins and cognition history are not rewritten.

## XP and achievable progression

New awards: concept 5, independently demonstrated understanding 12, valid correction 3, reinforcement 0; daily maximum 100. No XP from time, rendering or Cognitive Training. Existing native “understanding” is only a co-occurrence heuristic, so it earns concept XP (5) and is recorded as such with its assessmentKind preserved. The exported reward policy reserves 12 for independently verified understanding; no such producer exists today and this PR does not manufacture one. Service correction uses the existing valid mutable-update operation and now awards 3.

| Current stage → next | Minimum days | Stage XP | Unique milestones | Example using only new concepts | Teach Energy total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 → 2 | 1 | 30 | 6 | 6 × 5 XP | 12 |
| 2 → 3 | 2 | 50 | 10 | 10 × 5 XP | 20 |
| 3 → 4 | 3 | 75 | 15 | 15 × 5 XP | 30 |
| 4 → 5 | 4 | 100 | 20 | 20 × 5 XP | 40 |
| 5 → 6 | 5 | 125 | 25 | 25 × 5 XP | 50 |
| 6 → 7 | 7 | 150 | 30 | 30 × 5 XP | 60 |
| 7 | final | no next gate | no next gate | no further evolution | — |

These are distinct reusable concepts, not repeated submissions. Milestones count distinct stored concept labels; repetition cannot increase them. Corrections can supplement XP but do not replace the unique-learning gate. Teach costs 2 and Deep Training 3 as before; the same concept award is not multiplied for Deep Training. With 12-minute regeneration (120 points/day), the examples fit existing activity availability over each stage duration without hundreds of repetitive actions. Existing care/survival rules still apply.

Old XP, stage history and journals are untouched. Existing stage XP remains available against the new gate, but unique milestones and duration still apply. New events use new rewards. If old awards already meet/exceed today's new 100 cap, new rewarding activities wait until the UTC day changes; old rewards are not clawed back. Stage names and seven-stage structure remain unchanged. Production and Preview share these pure rules without sharing data.

## Canonical growth and position repair

Stage capacities: [5,12,20,30,42,54,64] canonical neurons. Stage 1 remains 5/4 and strengthens existing circuits. Beyond Seed, one meaningful new-formation step can add at most one node; cadence by stage is [Seed none, every 1,2,3,4,5,6 formations], starting with the first formation of a new stage. A service batch runs one formation step, not one per extracted atom. At capacity, no node is added. Reinforcement strengthens connections without structural growth. Processed event IDs and growth-event tracking prevent replay.

New persisted positions are deterministic parent-relative offsets using a golden-angle search with collision clearance. Each added node records parentId and growthEventId. New synapses connect the actual parent plus one nearest existing node (two from stage 4), using saved endpoint IDs, existing strengths and the same event provenance. Growth never creates a memory or claims ability. Shared memory associations reference these actual IDs. Evolution alone unlocks capacity but does not create nodes.

On the next existing gameplay transaction, a versioned repair moves only recognized legacy `learned-*` nodes at exactly [0,0,0] with a real parent edge. It records original/replacement positions, parent and migration time, preserves other valid positions, IDs, endpoints and memory references, and stamps neuralPositionPolicy=1. No reset or renderer-only jitter. Subsequent hydration does not move them again. Unsupported malformed records are not guessed into a replacement brain.

The shared renderer remains authoritative for appearance and counts. Canonical structure changes rebuild backend geometry; no independent demo topology is substituted. Grown networks use bounded shared framing; the original five-node Dashboard perspective remains unchanged, including when returning to a fresh Seed. Both views receive the same persisted model and existing GPU/listener/visibility lifecycle. Rendering/GPU behavior still needs manual verification.

## Stage-aware Energy

Exact normal capacities: [10,12,15,18,22,26,32]. Central energyCapacityForStage is the only table. Existing version-2 Energy gains a capacity field; pure rules default older records to 10. All subsequent projection, credit, spending, regeneration, validation and labels use the record's effective capacity. Stage-aware hydration/evolution synchronizes it centrally; both UI bars and Development use that capacity. ENERGY_RULES exposes the central capacity function alongside its Seed compatibility default.

Evolution first settles regeneration under the old cap at the existing timestamp, then changes only capacity. No refill, no bonus grant, no retroactive regeneration above the old cap. 7/10 becomes 7/12 at the same instant; full 10/10 becomes 10/12. Partial regeneration clock remainder is retained, full old capacity starts the new headroom clock now. The interval stays exactly 12 minutes. Bonuses remain bonus: never converted into normal capacity, lost or duplicated.

On first upgrade of an existing higher-stage record, settle its old-cap clock, preserve its real balance/bonus, then install the stage cap. Legacy excess beyond the original 10 remains credited bonus under the existing legacy rule. Offline regeneration thereafter reaches the new cap. Clock rollback does not earn points or rewind updatedAt. Old journals/receipts are untouched. Existing wallet credits use the same central creditEnergy function. Preview and production remain separate databases; no IndexedDB schema version change is needed.

## Verification

Targeted test: `node --test tests/growth-balance.test.mjs` passed. It covers exact capacities, zero/depleted/full values, bonus/legacy/offline/rollback accounting, no refill across six evolution transitions, rewards/daily cap/repetition/history preservation, deterministic bounded growth/endpoints/JSON hydration, position-repair idempotency, nine-domain mapping, fractional total≤1 and classification migration/origin preservation. Additional in-memory focused checks passed. Syntax/import and diff checks passed.

No full suites, browser automation, screenshots, production build, dependencies or model API calls. No production or existing Preview data was modified by verification. Browser rendering, persistence transactions and provider-dependent classification still require manual review. Provider classification may yield an unmapped label; that remains Unassigned. There is no objective understanding producer, so 12-XP understanding is reserved rather than faked.

## Manual Preview checklist (without resetting)

1. Reload the deployed Stage Preview with the existing Mindling. Inspect stage, stage XP, Energy/bonus, actual node/edge counts, origins and saved memories. Transaction-time repairs/reclassification must preserve identity, event IDs and journals; inspect audit fields.
2. Teach distinct Programming, Research methodology and Finance claims. Confirm actual creation rather than reinforcement, corresponding fractional/domain evidence and 5 XP per new concept; repeat a claim and confirm no XP/milestone/evidence inflation. Check unknown and interdisciplinary labels.
3. Reach the 30-XP/six-unique-milestone/one-day Stage 1 gate with real recorded activities. Use Preview's existing explicit clock controls only if desired, accounting for care needs. Evolve: maximum changes to 12 while the projected current balance and bonus remain unchanged.
4. Submit a genuinely new claim in Stage 2: inspect canonical parent/new position/endpoints, count increase up to stage capacity, full claim integrity and consistent Dashboard/Development rendering. No stage-demo nodes should appear as canonical progress.
5. Navigate and reload: topology, timestamps, XP, balances, fractional allocations and immutable origins must survive. Repeated hydration must not append migration logs or awards. Check offline ticks and later capacities, including Stage 7=32, with no regeneration-speed change.
6. Confirm old Cognitive Training histories/cached results still open and evaluation alone grants no XP/knowledge/neural growth. No automatic model calls or M4.3 gameplay trigger is added. Production remains isolated.
