# Sandbox Life System 2.0 and scene framing

> Historical delivery record. External learning and model configuration described below have been superseded by [native browser learning](semantic-models.md). Recorded test results apply to that historical revision, not the native migration.

Life 2.0 runs only at `/?stage-preview=1`. The production Life System 1.0 formulas, eligibility rules, daily allowance and database schema are unchanged. Shared presentation formatting and the requested typography apply to all modes; the Neural Stability row is mounted only by the sandbox controller.

The camera/framing solution recorded below is superseded by the [sandbox original-size restoration](sandbox-size-restoration.md) and the [automatic demo restoration](demo-framing-restoration.md). Both previews now use the original fixed framing, including during network discovery. Life 2.0 and its typography remain current.

## Survival rules

Every virtual hour Nutrition decreases by 1.4, Rest by 1.1, Wellbeing by 1 and the stimulation reserve by 2 percentage points. Basic Care uses the existing free gains and 6/8/12-hour cooldowns. Sandbox care can be preventive below 100%; production retains its 85% Nutrition, 80% Rest and 90% Health eligibility thresholds. Care never replenishes stimulation or immediately changes Neural Stability.

Talk costs 1 Energy, Teach 2, Deep Training 3. They add 12/20/28 stimulation and the existing 5/10/15 Wellbeing. All sandbox activities share a two-hour virtual cooldown. Talk requires a substantive local thought of at least four words and rejects repeated normalized input within a virtual day; it awards no learning XP or canonical memory. Teach and Deep Training require successful native validation and duplicate checks. Rejected input spends no Energy and grants no benefit. The labelled learning fixture remains explicit and non-repeatable.

Ten free Energy resets on the virtual UTC day. Wallet top-ups do not bypass cooldowns, duplicate checks, time gates or permanent death.

The hourly stress terms are:

- Physical stress: `max(0, 50 - Nutrition) + max(0, 50 - Rest)`.
- Emotional stress: `max(0, 40 - Wellbeing)`.
- Stimulation stress: `max(0, 60 - stimulation)`.

Without stress, Neural Stability recovers by 0.7 points/hour, capped at 100. With stress it loses `0.35 + 0.025 × physical + 0.025 × emotional + 0.06 × stimulation stress` points/hour. Health recovers by 0.4 points/hour while physical needs and neural stability are adequate; otherwise it loses `0.5 + 0.04 × physical + 0.04 × max(0, 30 - Neural Stability)`.

Collapse occurs only when visible Health or Neural Stability reaches zero. Values below 50 warn of strain; Health or Neural Stability at or below 20 marks critical risk. The warning names the care or stimulation needed. There is no age deadline or hidden fixed-time death trigger. A single action cannot restore Neural Stability; a severely depleted reserve needs multiple activities and hours of recovery.

The fixed hourly grid yields identical results across split advances, serialization/reload and offset resets. Life records carry local version 2. Existing sandbox records receive an additive upgrade that maps legacy strain to a visible stability value, preserves timestamps and tombstones, and never revives a deceased identity. The production database is neither opened nor migrated.

## Calibration

100 deterministic scenarios vary starting vital signs from 90–100%, action type/frequency, preventive care every 6 or 12 hours, and care/activity timing phase. Each balanced scenario runs 120 days. The separate ten-year repeated-routine test checks that no hidden stress accumulates.

| Routine | Scenarios | Alive at end | Collapse range |
| --- | ---: | ---: | --- |
| Neglect | 20 | 0 | 55–57 hours |
| Basic Care only | 20 | 0 | 59 hours |
| Activity only | 20 | 0 | 72–80 hours |
| Balanced | 20 | 20 | All alive after 120 days |
| Sparse care/activity | 20 | 0 | 59–84 hours |

Balanced activity schedules are Talk every 4–6 hours, Teach every 6–8 hours, or Deep Training every 8–12 hours, with preventive care. They fit the daily free Energy budget. A six-hour Talk/twelve-hour care routine remains healthy after ten years, with Neural Stability at 100. These physiology scenarios assume successful meaningful activities; separate engine and transaction tests verify their validation, Energy and atomicity boundary. They are deterministic calibration, not a proof about every possible player schedule.

Stage requirements remain 38 minimum days. The complete meaningful-learning trajectory still reaches Agent Mind at exactly 38 virtual days with free Energy and a balanced care/activity routine.

## Typography and formatting

Existing declarations are updated directly: life labels/percentages 9px; warning 9px with line-height 1.35; compact neural stats 8px; control hint 9px; Energy footer 9px; top-up label 8px; activity names 9px; activity/care secondary labels 8px. `formatLifePercentage` renders whole-number percentages in production, demo and sandbox, while simulation values and progress bars retain precision.

## Scene investigation and solution

Production uses a perspective seed camera with FOV 36°, z=5.8 and group scale 1.28. Preview used that camera inside a smaller panel-free container, additionally halved the entire seed layer with CSS `transform: scale(.5)`, and rendered into a backing viewport 44px shorter than the host. Growth used a different perspective distance (z=9), portrait root scaling and a Canvas-specific projection. These differences compounded the visual shrink and made screen-space matching fragile.

The preview seed CSS transform is removed; renderer and host dimensions now match. Preview Three.js uses orthographic projection with the same pixel-per-world-unit calculation as Canvas. Production retains its original projection and rendering behavior. `scene-framing.js` starts from the production reference pixel scale and bounds it to the available panel-free scene. It reserves zoom headroom and caps displayed scale at the safe geometry envelope; wheel/pinch still retain their input range of 0.72–1.48.

Growth uses one conservative geometry envelope across all seven stages, preserving framing through morphs instead of jumping to a new camera preset. Network discovery expands that envelope smoothly over its initial 1.2 seconds to include peers. Selection and peer labels use the same projection as rendering. Canvas soma size now follows world units in preview instead of remaining a fixed 14px while the geometry changes size. No UI transform or canonical count change is used.

Before/after captures use the same 1440×1000 desktop and 390×844 mobile viewports, identity, reduced-motion mode and backend. The visual-stage harness injects stage numbers only to inspect all seven shapes; engine and integration suites independently verify real progression and storage isolation.

| View | Before | After |
| --- | --- | --- |
| Main desktop | Screenshot (image removed) | Screenshot (image removed) |
| Sandbox desktop | Screenshot (image removed) | Screenshot (image removed) |
| Main mobile | Screenshot (image removed) | Screenshot (image removed) |
| Sandbox mobile | Screenshot (image removed) | Screenshot (image removed) |

Canvas after: desktop (image removed), mobile (image removed). All 28 stage/backend/viewport captures are generated by the reproducible browser harness under `/tmp/mindling-life-v2/`; only the comparison evidence is committed.

## Verification

Run `node --test tests/*.test.mjs`. With a local static server, run `tests/evolution-browser.py`, `tests/sandbox-browser.py` and `tests/life-v2-browser.py` using `MINDLING_TEST_URL`. The last suite checks computed typography, all stage frames, both backends, resizing, rotation, selection, zoom limits, reload, whole-number percentages and the absence of Neural Stability in production.

Browser regression tests require learning to remain local and issue no inference requests. Real Solana payments remain disabled.

Final Node result: **85 tests, 82 passing, 3 historical failures**. Those failures are the missing semantic matcher for legacy memory metadata and the two `REINFORCEMENT`/`STIMULATION` expectations in `memory-matching.test.mjs`. No new Node failure is classified as historical. All three Chromium suites pass; computed typography is checked at desktop/mobile sizes, the production route has no Neural Stability row, and sandbox database instrumentation rejects every attempt to open production storage.
