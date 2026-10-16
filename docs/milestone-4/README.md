# Milestone 4 — preview-first gameplay

> Historical delivery record. External learning and model configuration described below have been superseded by [native browser learning](../semantic-models.md). Recorded test results apply to that historical revision, not the native migration.

Base: `5b7b017` (PR #49 merged). This milestone does **not** activate production progression, Gemini learning, new life/death rules, or payments.

The sandbox survival calibration and camera framing described below are the historical M4 baseline. They are superseded by [sandbox Life System 2.0](../life-system-2-preview.md); production Life 1.0 remains unchanged.

## Architecture assessment

Production is native HTML/CSS/ES modules with a `MindlingApp`, event-driven Dashboard, canonical five-neuron seed, semantic memory engine, existing conservative Knowledge Area clustering, and IndexedDB `mindling-db` version 2. Production identity uses P-256, not Solana Ed25519; its identity record must never be repurposed as a wallet. The current Life System runs from wall time and resets ten free Energy each UTC day. Vercel previously served static files only and blocks tests/docs/benchmark paths.

The seven-stage preview already has deterministic morphology, a shared Three/Canvas renderer, an independent animation clock, a read-only snapshot loader, and three fictitious peers. Those components are reused. The sandbox injects an empty snapshot provider, so it does not even open production storage. It uses the existing Dashboard and Memory UI with sandbox records. New modules do not enter `MindlingApp`. Shared seed renderers only gain an additive `selectAt()` wrapper for sandbox selection.

## Four reviewable phases

1. **M4.1** — isolated state/store, progression and injected virtual clock; controller inside the dashboard; diagnostics and canonical-to-visual mapping.
2. **M4.2** — gated Vercel endpoint, strict Gemini assessment, semantic embedding and local duplicate checks; failure isolation.
3. **M4.3** — slower physiology, explicit calibrated neural stability, irreversible collapse and tombstones.
4. **M4.4** — test wallet modal/QR, integer quotes and simulated exactly-once credits; security architecture.

These phases are separate implementation commits in one PR because the controller, state schema and review deployment depend on each other. Each phase has an independent Node test file. Integration fixes and this report follow them.

## Using the preview

- `/?stage-preview=1`: interactive sandbox. Open the developer details, select a name/pathway and confirm creation of an isolated test Mindling.
- `/?stage-preview=1&preview-mode=demo`: the original automatic seven-stage replay, including dashboard presets, Nova/Echo/Atlas and the automatic persistent network. It never writes sandbox storage. Links switch between the modes.
- `/`: unchanged production entry point, storage, Life formulas, energy and activities.

The sandbox has +1 hour, +12 hours, +1 day and +7 days controls. No OS clock changes, hidden-tab aging, or wall-time catch-up occur. Reset simulated time **resets the displayed offset**, not physiological timestamps, stage duration, cooldowns or daily awards. Reset preview gameplay creates a fresh confirmed test identity, preserves tombstones and the player-level test wallet. These semantics avoid reset farming and accidental resurrection.

“Run labelled learning fixture” teaches a fixed photosynthesis fact. It makes no API request, is recorded as DETERMINISTIC FIXTURE, and cannot be repeated for XP. Arbitrary input requires an explicitly submitted Gemini analysis; no offline response is fabricated. This fixture is deliberately not a shortcut to unlock all stages.

Diagnostics show stage XP, lifetime XP, entry time, elapsed/required days, learning milestones, eligibility, virtual time, canonical vs visual neuron counts and recent award history. Selection is available by tapping visible neurons or choosing a canonical neuron in diagnostics; mapped representations highlight together. Orbit/zoom and impulses remain available.

## Progression and XP

| Stage | Minimum consecutive days | Stage XP | Distinct accepted learning milestones |
|---|---:|---:|---:|
| Neural Seed | 1 | 100 | 2 |
| Neural Cluster | 2 | 300 | 4 |
| Primitive Mind | 4 | 700 | 8 |
| Learning Mind | 7 | 1,400 | 12 |
| Cognitive Mind | 10 | 2,400 | 16 |
| Autonomous Mind | 14 | 3,800 | 20 |
| Agent Mind | Final | — | — |

Rules are centralized in `engine.js`. A stage transition requires all three gates and ALIVE. Entry time is set to the actual transition time, with no backdating or skipped stages. Stage XP and milestones reset on transition; lifetime XP/history remain. Minimum cumulative time is 38 days.

Validated new concepts award 50 XP, demonstrated understanding 75, correction 60. Daily XP cap is 500, with a virtual-minute cooldown. Each accepted learning event costs two Energy, gives the existing +10 Wellbeing, and is atomically committed with the memory, graph, XP, energy and processed event ID. The next virtual UTC day restores ten free Energy. Paid test Energy cannot change timestamps, gates or life state.

The engine rejects empty/short/low-quality assessments, unknown response fields, repeated event IDs, normalized duplicate input, repeated concepts and embedding cosine similarity >= .88. Related memories require similarity >= .62. Exact and concept duplicate checks also work across fixture/Gemini embeddings. Semantic comparisons require equal vector dimensions; the fixture's 8D vector is deliberately not represented as a real Gemini embedding. Assessments are fallible, and .88 is a conservative configurable-in-code prototype threshold, not a guarantee against adversarial paraphrases. New production anti-cheat authority will require server-side awards.

## Neural growth and Knowledge Areas

Sandbox canonical graphs start with five real test neurons and four connections. An accepted memory creates at most one neuron up to a 64-neuron cap; later learning strengthens existing connections. Foundation synapses also strengthen and drive the existing seed renderer. Memory records include participating neurons, synapses, semantic embeddings, related memories and assessment provenance.

Visual stage counts stay 5/24/64/104/148/196/240. Each visual index maps deterministically to a canonical neuron (`index % canonicalCount`). Existing stage shapes are not replaced by hundreds of invented canonical records. Canonical connection strengths influence soma radii and selection highlights mapped instances. The UI displays actual canonical counts, not the demo's illustrative numbers.

The Memory UI reuses existing conservative embedding clustering (`deriveKnowledgeDevelopment`). Gemini area labels are suggestions only; they cannot authorize cluster membership. Pathways remain the test individual's selected pathways. No production Knowledge Areas or memories are sent to Gemini or modified.

## Life calibration — explicit conflict and resolution

The old rates per hour are Nutrition .72, Rest .48, Wellbeing .34, with conditional Health loss `.28 × physicalRisk × (1 + abandonmentRisk)`. Preview multiplies each time-based rate by **.25**. Positive care gains and cooldown durations are retained; preview allows useful restorative care whenever an attribute is below 100 or neural strain exists, rather than waiting for the old care thresholds. Care is always free.

**The old rates / 4 alone cannot produce the requested 4–6 day collapse from a healthy starting point.** They leave nutrition around 78% after five days and do not yet damage Health. To meet both explicit requirements, preview adds a separately disclosed neural-stability reserve. Each virtual hour adds `(100 - nutrition + 100 - rest + 100 - wellbeing) / 100` to neural strain. Collapse occurs at strain 28; critical starts at 21, strained at 12. Nourish, Rest and Care reduce strain by 3, 4 and 6 respectively, in addition to normal positive attribute gains.

This is an accumulated deficiency model, not an unconditional age/death timer. Free regular care prevents collapse. Health remains a separate physiological measure; it can still be high when the neural reserve is exhausted. The Life warning displays neural stability explicitly, including this distinction at collapse.

Deterministic results:

- One hour: Nutrition 99.82, Rest 99.88, Wellbeing 99.915, Health 100 — exactly one quarter of old applicable deterioration.
- Healthy start, no care: permanent neural collapse at **121 hours / 5.0417 days**; strain 28.41685; nutrition 78.22, rest 85.48, wellbeing 89.715, health 100.
- Daily free Care, Nourish and Rest: alive after 40 days.
- Hourly vs daily advancement and serialize/reload: identical life state; no duplicate deterioration.
- Complete meaningful-learning fixture trajectory with free energy and care: Agent Mind at exactly 38 days; canonical neuron cap respected.

Death records the precise virtual hour and a permanent tombstone. Learning, care, evolution and simulated purchases reject that identity. Creation requires explicit confirmation and a new ID; the player wallet and receipts survive. Rendering or Gemini failures cannot advance life. The schema never treats a stored deceased identity as living on reload.

## Gemini status

Implemented endpoint and client, strict schema checks, real API protocol requests, privacy boundary and persistent limiter. **No live Gemini request has been tested.** User chose to configure Vercel later. Deterministic upstream fixtures verify the contract, not Gemini availability or assessment quality. See [configuration and activation](deployment.md).

## Wallet status

No Solana keys, real addresses, RPC calls, token mint, signatures, deposits or actual burns are created. The modal explicitly says no public deposit address is allocated. Its QR and copy control encode `mindling-preview:simulation:<player-id>`, never a fabricated deposit destination. This intentionally keeps the address placeholder disabled until a usable recovery system exists.

Fixed test price USD .10, six decimals, USD 1.99 cost, 60 virtual-second expiry, minimum simulated liquidity, price-change rejection, simulated SOL fee checks and confirmation are exercised with BigInt arithmetic. Only an explicitly confirmed simulated purchase deducts test units and credits ten Energy. Replays fail; receipts have `chainSignature: null`. See [Solana and wallet security](solana-security.md).

## Storage, migration and limitations

`mindling-preview-m4` v1 has a single atomic sandbox aggregate: version/revision, virtual clock/origin, stable player/wallet, active Mindling (stage/timestamps/XP/milestones/history/graph/memories/life/energy) and tombstones. IndexedDB readwrite transactions serialize changes across tabs. Async learning revalidates the target identity against the latest transaction state. The aggregate is capped at 1,000 memories; this is a prototype, not a production-scale database.

Future production migration: first audit/export v2 data and get separate activation approval; add versioned progression and player wallet stores in an additive upgrade; preserve existing identity/memory/graph records verbatim; initialize stage timestamps without backdating; import no preview data; retain migration markers for idempotency and rollback-compatible reads. Never place player vaults in stores cleared when a Mindling dies. Block incompatible schemas safely and test failure/restore paths before shipping.

Local preview state is intentionally developer-controlled and is not anti-cheat or financial authority. Concurrent tabs serialize writes but do not live-broadcast updates; reload to refresh another tab. Real Gemini availability, semantic quality and production wallet custody remain unverified/disabled. Browser testing uses Chromium/SwiftShader, not a GPU performance certification.

## Changed files and verification

- `js/bootstrap.js`, `src/preview/evolution-preview.js`: explicit preview routing, snapshot injection, demo/sandbox navigation.
- `src/preview/sandbox/{engine,storage,controller,life,gemini,wallet,wallet-ui}.js`: four implementation phases.
- `api/preview-learning.js`, `src/server/learning.cjs`: gated server endpoint.
- `src/preview/evolution-scene.js`, seed renderers: canonical visual mapping, highlighting and picking.
- `css/evolution-preview.css`: scoped diagnostics, conditions, wallet modal.
- `src/preview/vendor/qrcode.js`, license: QR Code Generator 1.4.4, Kazuhiko Arase, MIT. Only modification is the ESM default export. Source: jsDelivr npm distribution; license from upstream repository.
- `tests/sandbox-*.test.mjs`, `tests/sandbox-browser.py`: deterministic and integration regressions.
- `tests/evolution-browser.py`: uses explicit demo URL; existing demo assertions retained.

Run `node --test tests/*.test.mjs`, then serve locally and run `MINDLING_TEST_URL=http://127.0.0.1:8000 python3 tests/sandbox-browser.py` and the same for `tests/evolution-browser.py`. Browser tests require Chromium, Python Playwright and pinned Three assets; see the browser script setup. Fixtures do not count as a live Gemini test.

### Recorded test results

- Historical M4 delivery results (before the [repository cleanup](../repository-cleanup.md)): **79 tests, 74 passing, 5 failing**. All 14 new M4 tests pass.
- At that historical point, four pre-existing failures remained: missing semantic matcher in legacy memory evaluation; two REINFORCEMENT-versus-STIMULATION expectations; and the old experimental-loader/public-benchmark removal invariant.
- At that historical point, one legacy assertion also prohibited the required serverless Gemini API. The later cleanup resolves both repository invariants: obsolete experiments are absent, and the API directory has an exact allowlist for the protected entrypoint. Canonical topology, schema-version and disabled-payment checks remain unchanged.
- Chromium Canvas and real Three.js: test identity creation, accepted local fixture, semantic client fixture response, XP/actual graph counts, interactive stage 1→2, Memory UI, quote/QR/simulated purchase, collapse, reload without revival, new identity with wallet preservation, Gemini 503 failure with no mutation, mobile navigation. Production database opens are instrumented to throw throughout sandbox sessions, and none occur.
- Automatic demo regression: all seven synchronized stages, three named peers, rotation/zoom label anchoring, disconnect, mobile/reduced motion, hidden-tab countdown, repeated start/destroy and normal gameplay resumption pass. Its production database before/after snapshot comparison remains unchanged.

No live Gemini test, real wallet recovery test, deposit, RPC transaction or on-chain burn verification was performed. These are explicitly outstanding, as requested for later configuration and activation.
- Additional sandbox lifecycle checks pass for hidden virtual time, repeated idempotent teardown, and destruction during asynchronous startup.
