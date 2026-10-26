# M4.2.4: automatic evolution and full Replay morphology

> Historical implementation description. M4.2.5 removes training and inspector UI, restores the compact XP bar, and uses Replay stage counts in the main interface. The cognitive engine and saved records remain intact. See [the current UI cleanup](ui-cleanup-replay-counts.md).

## What was wrong

Production already called `progressGameplay` in controller reducers, while Preview offered an explicit Evolve button and never applied that check automatically. Eligibility was not a final invariant of the two persistence boundaries. A fully eligible Preview identity could therefore stay in Neural Seed indefinitely.

M4.2.1 deliberately displayed only the canonical Seed renderer in real gameplay, hiding the central Replay scene. M4.2.3 correctly increased canonical topology only through genuine learning. Consequently even an evolved identity displayed a small canonical network instead of Replay's full stage silhouette. The unused modulo mapping also assigned one saved neuron ID to multiple decorative points; it could not serve as a truthful canonical overlay.

## Evolution transaction

`reconcileEvolution(state)` in `src/preview/sandbox/engine.js` applies the existing `evolve` transition at most once. Both `MindlingDatabase.changeGameplay` and `PreviewStore.change` call it **after the synchronous activity/reconciliation reducer, before queuing their writes**, inside the existing IndexedDB read/write transaction. No asynchronous provider work runs inside that transaction.

The existing requirements are unchanged:

| Transition | Minimum days | Stage XP | Unique milestones |
|---|---:|---:|---:|
| 1 → 2 | 1 | 30 | 6 |
| 2 → 3 | 2 | 50 | 10 |
| 3 → 4 | 3 | 75 | 15 |
| 4 → 5 | 4 | 100 | 20 |
| 5 → 6 | 5 | 125 | 25 |
| 6 → 7 | 7 | 150 | 30 |

The Mindling must be alive, have positive health/stability, and have no death tombstone. A transition appends one outgoing stage-history row, advances one stage, records its entry time and resets stage XP/milestones. Lifetime XP, activity history, memory content, canonical nodes/edges, identity and wallet are preserved. Reset counters prevent a second transition from the same eligible state. Stage 7 cannot advance.

Native IndexedDB serializes overlapping transactions on the same gameplay stores. Each reducer reads the state within its own transaction, so simultaneous checks observe the preceding commit. Transaction failure aborts the state, projected production stores and stage history together. UI state/animation is updated only from the resolved transaction result. No UI renderer changes the saved stage.

Checks follow successful learning/correction, care/other gameplay reconciliation, hydration, restoration, document visibility return, production's existing minute reconciliation, and Preview virtual-clock advancement. Preview now also reconciles physiological time each minute. The existing second Energy display tick requests a persisted reconciliation when elapsed time completes an eligibility gate, including when normal Energy is already full. It never directly evolves an in-memory timer snapshot.

Offline/virtual time first runs existing life integration and Energy accounting. If that reconciliation finds death, evolution is disallowed; no retroactive living stage is invented. Large offline intervals do not bypass new-stage progression. Preview uses `mindling-preview-m4`; production uses `mindling-db`. Neither reads or writes the other's identity or clock.

Normal Energy capacities remain **10/12/15/18/22/26/32**, with one point per 12 minutes. `evolve` settles the old capacity before increasing the maximum. For example 7/10 becomes 7/12 at the same timestamp, with bonus Energy unchanged. Legitimate elapsed regeneration is still accounted for. No free refill, reward, memory or structural growth is attached to evolution.

The manual Preview Evolve button is removed. Dashboard and Development show the current stage, stage XP, unique milestone count, elapsed/required hours and remaining requirements. A brief completion message/fade follows a newly observed committed transition; initial hydration does not replay an old transition. Progress rendering is read-only.

## One morphology source, two distinct layers

The visual source remains **`generateStage` / `Morphology` / `EvolutionScene`**, exactly the implementation used by Replay Automatic Demonstration. No replacement shapes or copied 3D engine are introduced. `StageBrainScene` is a backend/lifecycle adapter over that scene, and `stagePresentation` caches its read-only visual definitions and separately projects canonical data.

| Stage | Replay visual nodes | Maximum canonical neurons |
|---|---:|---:|
| Neural Seed | 5 | 5 |
| Neural Cluster | 24 | 12 |
| Primitive Mind | 64 | 20 |
| Learning Mind | 104 | 30 |
| Cognitive Mind | 148 | 42 |
| Autonomous Mind | 196 | 54 |
| Agent Mind | 240 | 64 |

Stage 1 reuses the original Seed backend's soma geometry, materials, palette, dendrites and signals. Stage 2–7 draw the complete existing Replay morphology, including branching, contours, curved connections and decorative pulses. Dashboard and Development pass the persisted stage into the same adapter. Views may have different camera framing but resolve the same geometry and canonical topology.

**Visual nodes describe the stage's appearance. They are not learned neurons, memories, ability or XP.** They never enter an IndexedDB write, canonical growth input, memory association, or progression total. Primary UI counters explicitly say “Canonical neurons” and “Canonical synapses”; a separate note gives the visual model count. Replay demonstration counters are labeled visual.

### Canonical projection and interaction

Canonical input is the existing unique-ID `canonicalBrain` projection, preserving saved IDs, endpoints and positions. The original saved positions remain unchanged in storage.

The five foundation IDs map to their original visual indices. A legitimate `learned-N` maps to visual index N when that slot exists. Thus the active canonical set has one distinct slot per known ID; new learning cannot shift existing mappings. Slots remain stable through reload and growth, and follow the corresponding Replay point during a stage morph. All 64 canonical IDs fit their legitimate stage's visual capacity. There is no modulo reuse. An imported nonstandard ID uses a separate bounded projection of its saved position rather than claiming a decorative node.

Stages 2–7 add bright canonical cores and a separate line layer for the **actual saved endpoints**, independent of Replay decorative connections. Three.js and Canvas both use that same projection. Only canonical cores and canonical lines participate in pointer selection; decorative geometry has no canonical IDs or invented memories. Inspection uses the actual saved state to show ID, saved connection count and associated memory count; synapses expose real endpoints, strength and activation counts. Development retains keyboard neuron selection and camera controls. Dashboard shows selection inline, without restoring the obsolete floating inspector.

Only actual topology changes reallocate canonical GPU buffers. New saved synapses produce a short connection signal when an already mounted view observes genuine growth. Initial hydration does not manufacture a growth pulse. Real formation still uses M4.2.3's `growCanonical`, event provenance, capacities and cadence. Reinforcement and evolution do not create structural growth.

## Render lifecycle and resource ownership

`BrainRenderer` remains the shared public renderer boundary. Dashboard's existing owner schedules it; Development has its existing single visible-view RAF. Hidden views and hidden documents pause, reduced motion settles morphs immediately and suppresses decorative/travel animation. Listener/observer cleanup stays with the existing renderer owners. No per-frame morphology generation or topology reconstruction is introduced.

For real gameplay, `shared-webgl.js` reference-counts **one WebGLRenderer/context** across Dashboard and Development. Each view retains its own scene/camera and bounded geometry, but the canvas moves to the active host before drawing. Hidden-view resizing does not resize the active host's drawing buffer. Seed meshes share that renderer too; moving to Stage 2 disposes Seed objects without destroying the shared context. Final release disposes the renderer/context. Explicit Replay keeps its existing demonstration lifecycle and separate Seed/Replay crossfade.

The Replay soma mesh remains instanced and uses its existing fixed budgets. Canonical cores/lines have separate small typed arrays and are rebuilt only when IDs/endpoints change. Their old geometry/materials are disposed on replacement. XP-only updates preserve buffers. Existing replay resources, labels and owned canvases are cleaned up on destruction. Canvas fallback uses the same stage source, canonical projection and selection policy without WebGL. Stage morphing reuses Replay's 1.6-second interpolation after commit; a saved stage is selected immediately on initial mount/reload.

## Focused verification

Executed locally:

- `node tests/auto-evolution-morphology.test.mjs`: **10/10** focused tests pass.
- `node tests/growth-balance.test.mjs`: **5/5** M4.2.3 balance regressions pass.
- Syntax checks of changed JS modules and `git diff --check`.

Coverage includes all six transitions and every missing gate, duplicate milestones, tombstones/death, final stage, legitimate learning and correction, offline/virtual time, unchanged lifetime XP/topology, Energy/bonus preservation, reload/idempotence, and rollback/concurrent checks through the actual production and Preview store methods with a small serialized transaction/request double. It also checks all seven Replay definitions, stable distinct slots through all 64 canonical neurons, canonical/visual count separation, real selection, Canvas draw commands/reduced motion/teardown, morph vs hydration, buffer reuse and shared-context reference counting.

The transaction double is **not browser IndexedDB**. Canvas command checks are **not a browser visual test**. Browser automation, screenshots, full suites, production builds, dependency installation and external/model calls were not run. Actual WebGL output/performance, layout fit, real IndexedDB concurrency/quota behavior and canvas handoff remain manual verification items. Older broad suites include outdated pre-M4.2.3 reward assumptions; only the relevant obsolete modulo-mapping assertions/import were removed in this PR, not unrelated legacy assertions.

## Manual verification (existing Preview identity; do not reset)

1. **Automatic evolution:** open `?stage-preview=1`, inspect current XP/milestones/hours, care for the living identity and legitimately meet the missing requirements. Use only existing Preview time controls to advance duration. Confirm evolution without a button, one history entry, reset stage counters, preserved lifetime XP, correct next Energy maximum and no extra balance/bonus. Reload and confirm no duplicate transition or replay animation.
2. **Stage 2 model:** compare Replay Neural Cluster with Dashboard and Development. Both real views must show the full 24-node morphology while their primary counters show the smaller saved network. Bright cores must be distinct; decorative nodes must not expose fabricated records.
3. **Real growth:** teach a genuinely new concept when Energy is available. Check the legitimate reward and M4.2.3 growth cadence/capacity, new canonical core/connection signal where applicable, intact associations and stable previous highlights. Reload and inspect the same IDs/endpoints.
4. **Later stages:** use existing isolated Preview progression with legitimate learning/care/time; compare stages 3–7 to Replay. Do not grant production XP, edit canonical records, or reset identities to force stages. The explicit Replay link can inspect all silhouettes without altering gameplay.
5. **Lifecycle:** repeatedly switch Dashboard ↔ Development ↔ Memory, rotate/zoom and use keyboard selection. Toggle reduced motion and tab visibility. Click canonical and decorative parts. Confirm correct canvas placement/size, no page scrolling, no duplicate RAFs or additional WebGL contexts, and no obsolete canonical overlay during read-only demo-network visits.

## Compatibility and limitations

No backend, endpoint, environment variable, IndexedDB schema, learning/classification contract, XP reward, Energy regeneration/cost, pathway evidence or canonical growth rule changes. Existing records and the M4.2.3 additive upgrades remain intact. No new deployment configuration is required. Existing tabs must reload after the normal deployment to use the new client behavior; this PR does not deploy or merge itself.

The supported canonical ID family has deterministic distinct slots. Nonstandard imported IDs retain a stable bounded saved-position projection, so pre-existing coincident/malformed imported coordinates can still overlap; they are not rewritten to invent a layout. Points can also occlude in a rotated 3D view; neuron dropdown selection remains available in Development. A hidden/unmounted view shows the correct saved morphology when opened; this is not a second source of stage truth. Cognitive ability continues to depend on real recorded evaluations, not visual complexity.
