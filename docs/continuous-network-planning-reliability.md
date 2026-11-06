# Continuous Network and planning validation reliability

Base: `4d43819` (merged PR #136). No deployment or paid provider calls were made.

## Planning incident: confirmed defect and uncertainty

The supplied production diagnostic places the failure after a successful HTTP 200 Chat Completions response, in PLANNING, before any hosted search. It does not identify the rejected field. Neither the raw response nor provider-side incident logs are available in this workspace; the exact predicate for that historical request is therefore **not proven**.

Static inspection confirms a contract mismatch: `planningSchema` accepted unrestricted string items while `validatePlanningResult()` required trimmed, bounded text, restricted public query characters, safe option identifiers and unique option IDs. The instructions did not state all these requirements. Structurally valid output could consequently fail application validation and become the uninformative `VALIDATION_FAILED`.

The existing flow remains input interpretation → validated planning context → server planning prompt/schema → completion parsing → planning validation → correlated response → browser task persistence. Context validation and raw JSON/completion parsing remain separate from result validation. The normal public topic is not rejected because the model formats its response incorrectly.

The schema now expresses text limits, patterns and option identifier constraints; shared instructions specify the same output contract. Runtime checks still enforce privacy, unique IDs and cross-field requirements. Invalid output is not trimmed, repaired, discarded or accepted. Fixed `PLAN_*` reason codes identify field shape, text, query character/privacy, missing query and clarification/option failures. Existing server diagnostics carry the code through the correlated browser response and persisted task diagnostic without exposing prompts, response text or private memory content.

The offline `sea & oceans` response reproduces a schema/application mismatch and produces `PLAN_QUERY_CHARACTERS_INVALID`. It is a test response, **not a reconstruction of the production response**. Ordinary supported public topics pass with compliant mocked output. Completion token limits, model selection, permissions, search reservations, retry protections and PR #136 tool accounting are unchanged.

## Continuous visualization

`BrainStateModel` projects hydrated canonical neurons/synapses and the existing Memory graph's current readable memories and persisted associations into a deterministic 320-bin surface. IDs place visual features; they do not infer semantic meaning. Historical or incomplete memories and dangling relationships are excluded. No generated knowledge or neural records are stored.

Profile construction is bounded to 128 neuron, 256 memory, 256 synapse and 256 association features; counts retain the actual selected state totals. The profile is rebuilt on state updates, never by reading IndexedDB on animation frames. A logarithmic, capped richness factor and slow bounded breathing distinguish a sparse new brain from a richer saved brain. This is decorative rendering, not measured firing or model computation.

Actual Talk/Teach/Deep events overlay the surface temporarily. Their meters and history remain event-only, including zero values while idle. The About control and accessible descriptions explain that receding cloud rows are not historical brain snapshots. Opening or animating Network creates no API calls, learning events, memory writes, Energy changes or XP.

The existing rendering lifecycle pauses hidden views/documents, freezes on Pause, respects reduced motion, resumes current state and cleans up frames/listeners/GPU resources. WebGL loss/restoration and Canvas/2D fallback remain supported. Geometry is fixed at 320 × 180 points; fallback geometry is bounded separately. No performance benchmark or GPU utilization claim is made.

## Native UI and cleanup

Network uses existing theme tokens, 13px card radii, the native glass gradient/blur, borders, typography and responsive spacing. The cloud uses the native accent; interaction channels use existing life/accent colors. No CSS shadows were introduced.

Removed: custom heading/icon/status, all generic panel titles and their containers, the cloud's Talk/Teach/Deep footer labels, old renderer/event caption, horizon/idle overlay and their unused styles. History, perspective, Pause, accessible panel descriptions and application navigation remain. The small event-history legend identifies actual channel colors.

## Verification

- Focused Node suites: **52 passed, 0 failed** (planning, continuous state model, existing Network, tool accounting and production research recovery).
- Full Node suite: **458 tests, 410 passed, 48 failed**.
- Unchanged base: **432 tests, 384 passed, 48 failed**. The failing test-name sets are identical; no new full-suite failures.
- Chromium `network-v2-browser.py`: normal and Stage Preview pass, including saved-state breathing without events, no writes/API calls, pause, hidden view, reduced motion, fallback, context restoration and teardown.
- Chromium `intelligence-network-browser.py`: normal and Stage Preview pass, including actual navigation/event wiring and desktop/mobile lifecycle.
- Chromium `planning-validation-browser.py`: normal and Stage Preview pass, including correlated planning failure, durable exact rule, no search, no canonical changes and reload retry protection.
- Chromium `tool-accounting-browser.py`: normal and Stage Preview pass; PR #136 reservations/error preservation remain intact.
- `git diff --check`: clean.

Screenshots use explicitly labeled **synthetic persisted test memories** in isolated IndexedDB stores, not production data. They capture the Network component at desktop/mobile widths; existing application navigation is separately covered by the navigation regression.

- [Desktop](screenshots/network-living-desktop.png)
- [Cloud detail](screenshots/network-living-cloud.png)
- [Mobile width](screenshots/network-living-narrow.png)

## Changed implementation and test files

- `src/network/brain-state-model.js`: read-only deterministic brain projection.
- `src/network/network-view.js`: state projection, continuous visible lifecycle, simplified accessible controls and native colors.
- `src/network/spectrum-renderer.js`: baseline plus event rendering and native accent.
- `css/network.css`: shared-theme styling and removed obsolete UI rules.
- `src/autonomous/research-contract.js`: aligned planning schema/instructions and exact validation reasons.
- `src/server/mindling-reasoning.cjs`: includes shared planning output rules.
- `tests/continuous-network.test.mjs`, `tests/planning-validation.test.mjs`, `tests/planning-validation-browser.py`: new offline regressions.
- `tests/network-v2-browser.py`, `tests/intelligence-network-browser.py`: updated behavior/UI regression coverage.
- This report and three screenshots.

## Production verification still required

After an independently authorized deployment, inspect an ordinary public-topic planning request and its correlated task diagnostic. A compliant response should progress normally; any rejected response should identify a `PLAN_*` rule without starting search or losing error context. Confirm provider acceptance of the tightened structured schema; mocked tests cannot establish live model compliance. Do not infer that the historical incident is resolved merely from offline success.

Inspect a new and an established Mindling in Network, including reduced motion and navigation away/back. Verify that idle cloud motion leaves real event meters, persisted memories, Energy and XP unchanged. No reset or migration is required. This implementation was committed locally; it was not pushed, merged or deployed.
