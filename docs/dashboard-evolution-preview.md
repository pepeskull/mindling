> Milestone 3.1 historical report. Dashboard presentation was subsequently synchronized in [Milestone 3.2](synchronized-evolution-dashboard.md); snapshot storage isolation remains in effect.

# Milestone 3.1 — dashboard evolution preview

The preview at `?stage-preview=1` now uses the normal dashboard HTML, glass styling,
header, panels, memory view and interaction field. `EvolutionPreview` mounts its
existing two scene layers inside `#scene`. There is no fullscreen overlay or
preview toolbar. The sole preview annotations are a small stage label and, once
network discovery starts, `NETWORK SIMULATION — NO LIVE CONNECTIONS`.

## Preserved visualization

The seven stage definitions, deterministic morphology generator, cached morph
buffers, network state machine, curves, neurons, materials and animations are
unchanged from PR #47. The production BrainRenderer contract is unchanged.
SceneInteraction still owns mouse/touch rotation, pointer capture, pinch and
wheel zoom. The Three.js adapter adds an opt-in camera fit for the narrower
central dashboard area; Canvas retains its existing aspect-fit projection.

The existing seed scene still renders Stage 1 and shares one scheduler and camera
interaction with the evolution view. Insets are measured from the real header,
hero, side panels and input field. ResizeObserver and viewport resizing keep the
scene between the desktop panels. Mobile reuses the production navigation and
panel sheets; those sheets intentionally overlay the dashboard when opened, just
as in ordinary gameplay. The default closed-sheet view fits the full network.

## Automatic operation

Playback starts immediately, including when reduced motion is preferred. The
existing timeline advances every five seconds and stops permanently at Agent
Mind. Reduced motion snaps morphs and suppresses traveling impulses and breathing,
while retaining visible static connections and accessible simulation labeling.

`AutomaticNetworkCountdown` only coordinates the existing network instance. It
waits until both the crossfade and actual morphology have finished Stage 7,
then counts five seconds of visible-tab time. Discovery starts once. The existing
outgoing handshake, acknowledgement, curved-link formation and bidirectional
exchange run for all three simulated peers, and exchange stays active afterward.
No automatic disconnect, loop, restart or second simulation engine was added.
The scheduler cancels on hidden tabs and clears its previous timestamp on resume,
so neither stage time nor countdown/network time accumulates while hidden.

## Read-only dashboard

`dashboard-snapshot.js` enumerates existing IndexedDB databases before opening
`mindling-db` without a version argument. It reads all required stores in a single
`readonly` transaction and closes the connection. It never calls production
`MindlingDatabase.open()`, creates a Mindling, upgrades schema, ticks Life, refreshes
energy, evaluates semantic models or writes records. A concurrent disappearance
of the database aborts the upgrade transaction. Blocked late connections are closed.

The shared Dashboard accepts an opt-in read-only mode. It renders saved identity,
pathways, canonical neural counts, memory and Life records through its existing
rendering methods. Neural Cycles use the saved Life simulation timestamp rather
than advancing with the preview. Old energy/reset values remain an explicitly
saved snapshot. The header's actual stage and production Social Status are not
changed to match the preview stage or network.

If there is no saved Mindling, saved Life is absent, or safe access is unavailable,
the corresponding values show `—`/unavailable rather than default health/energy or
a fictional identity. The visual seed is still a temporary preview. Browsers
without `indexedDB.databases()` get an unavailable snapshot rather than a risky
create/open fallback.

Talk, Teach, training, care, new-Mindling and input controls are disabled, and their
mutation handlers are not registered in this mode. Memory/navigation remain
functional. A saved profile can still be downloaded. A normal URL constructs the
ordinary MindlingApp and retains normal gameplay, including daily resets.

Dashboard DOM listeners now share an AbortController, so disposal removes all of
them, including navigation listeners. Preview teardown also disposes observers,
media/visibility/resize listeners, pointer capture, GPU resources and its single
animation frame. Closing/reloading is the supported way to leave this automatic
preview; there is deliberately no replacement Exit toolbar.

## Changed files

- `js/bootstrap.js`: remove obsolete toolbar-exit wiring.
- `src/preview/evolution-preview.js`: reuse dashboard, mount in #scene, automatic
  countdown, responsive measured bounds and cleanup.
- `src/preview/automatic-playback.js`: one-shot countdown coordinator.
- `src/preview/dashboard-snapshot.js`: side-effect-free saved-state loading.
- `src/preview/evolution-scene.js`: optional dashboard camera fit only.
- `src/ui/dashboard.js`: shared read-only hydration and abortable DOM listeners.
- `css/evolution-preview.css`: replace standalone shell/toolbar CSS with scoped
  scene-layer and small-label styles.
- `tests/dashboard-preview.test.mjs`: countdown, stage timing and read-only storage.
- `tests/evolution-browser.py`: intentionally update the previous milestone's
  manual-toolbar expectations to the new automatic dashboard contract.
- Documentation: this report and a historical note on the PR #47 report.

## Validation

Run `node --test tests/*.test.mjs`. The previous 59 Node tests are retained without
changes. Four new tests bring the total to 63: 59 pass, and the same four baseline
failures remain (three legacy semantic-memory expectations and one obsolete-file
invariant). No tests are skipped or deleted to hide baseline failures.

Run `python3 tests/evolution-browser.py` with the existing local HTTP server and
Playwright/Chromium. It exercises a real saved Mindling with stale daily energy:
preview must display the old balance and preserve every IndexedDB store exactly;
normal mode must resume real daily-reset behavior. It covers automatic seven-stage
playback, persistent final network, toolbar absence, memory navigation, disabled
mutations, desktop Three.js, mobile/reduced-motion Canvas, a fresh profile with no
DB creation, hidden countdown time, repeated lifecycle cleanup and actual morph
completion gating. Official pinned Three.js files are fetched with TLS verification
and routed unchanged into Chromium because its trust store lacks the cloud proxy CA.

The implementation started from fetched main `dca49f728aaf57164df46d9d81a2a22ee2745f9a`,
including merged PR #47 and the updated page title. The title remains unchanged.

## Limitations

This is still a visualization, not saved gameplay evolution or live AI networking.
Amelia authorization/provenance status remains as recorded in the previous report;
no new Amelia assets are imported. Functional browser checks use software WebGL,
not a performance guarantee for every GPU or mobile browser. Snapshot availability
is intentionally conservative on older browsers without safe DB enumeration.

Verified outcomes: the Three.js saved-player scenario, automatic final exchange,
normal-mode daily reset, Canvas/mobile/reduced-motion scenario, fresh-profile
no-creation check, repeated teardown and hidden-time check all passed in Chromium.
The deterministic browser lifecycle test also steps the real scene through the
1.6-second Stage 7 morph, verifies no early countdown, starts discovery after the
subsequent five seconds and keeps Stage 7 exchanging afterward. Screenshots were
captured for all seven Three.js stages and the final desktop/mobile networks.
