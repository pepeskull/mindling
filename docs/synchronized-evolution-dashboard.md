# Milestone 3.2 — synchronized evolution dashboard

The existing dashboard now follows the preview timeline's stage and network simulation. No second timer, application engine, Life ticks, AI calls, or persistence writes were introduced. The normal entry point is unchanged.

## Presentation

`src/preview/dashboard-presentation.js` derives one presentation state from the timeline, renderer morphology, deterministic presets and peer identities. Targeted DOM updates run only when the stage or social text changes; label projection follows the existing render loop. During a morph, the UI identifies the target stage being displayed, matching the renderer's target geometry.

Development marks earlier stages Completed, the active stage Current (including `aria-current=step`), and future stages Locked. The hero stage text and header stage chip follow the same state. The saved Mindling name remains unchanged. Saved energy, Neural Cycles, memories in the Memory interface, profile downloads and Knowledge Areas remain saved snapshot data; illustrative memory statistics do not create records.

| Stage | Neurons | Graph synapses | Illustrative memories | Health | Nutrition | Rest | Wellbeing | Condition |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Neural Seed | 5 | 4 | 0 | 78 | 72 | 82 | 64 | NEEDS ATTENTION |
| Neural Cluster | 24 | 42 | 3 | 82 | 76 | 70 | 73 | STABLE |
| Primitive Mind | 64 | 122 | 12 | 85 | 68 | 62 | 78 | STABLE |
| Learning Mind | 104 | 321 | 28 | 88 | 74 | 42 | 82 | NEEDS ATTENTION |
| Cognitive Mind | 148 | 462 | 56 | 90 | 80 | 76 | 86 | STABLE |
| Autonomous Mind | 196 | 616 | 96 | 87 | 72 | 68 | 89 | STABLE |
| Agent Mind | 240 | 756 | 160 | 92 | 84 | 79 | 91 | STABLE |

Neuron counts come from STAGES; synapse counts come from the renderer's actual target edges, excluding decorative fibers and remote circuits. Existing `conditionFor` and `warningFor` rules determine the badge and warning. Values need not increase monotonically with maturity. Existing attribute colors and bars remain; bars transition and numbers fade when motion is allowed.

Social Status stays Not Connected through stages 1–6 and the final countdown, then follows discovery and connection. A peer counts only in CONNECTED/EXCHANGING with its visual link fully established (`link === 1`), after acknowledgement. Counts increase to three and the final text is `Connected · 3 Mindlings · Active`. A compact Simulated indicator appears during network activity. The old stage/network captions and hero subtitle are removed.

Nova, Echo and Atlas are temporary labels attached to the projected bounds of their respective remote brains. Three.js uses the actual root matrix and perspective camera; Canvas uses the same projection as its geometry. Labels follow rotation, zoom, viewport changes and visibility/fade. Small collision offsets separate close labels; labels outside the viewport are hidden. Labels never intercept pointers and are removed on teardown.

## Files

- `src/preview/dashboard-presentation.js`: derived state, presets, targeted dashboard presentation.
- `src/preview/evolution-preview.js`: presentation integration into the existing lifecycle.
- `src/preview/evolution-scene.js`: shared remote label projection and cleanup.
- `src/ui/dashboard.js`: removal of obsolete read-only hero subtitle assignment.
- `css/evolution-preview.css`: minimal labels, completed-stage styling and motion treatment.
- `tests/dashboard-presentation.test.mjs`: stage/geometry/life and network establishment regressions.
- `tests/evolution-browser.py`: dashboard stage assertions and renderer label regression coverage.

## Validation

Node suite: 65 tests, 61 passing, four unchanged baseline failures:

1. `legacy memories derive missing concept metadata at evaluation time`: missing semantic matcher (`undefined.match`).
2. `modal phrasing reinforces the same trade memory`: STIMULATION rather than expected REINFORCEMENT.
3. `reinforcement preserves original text, increments activation, and bounds variants`: same semantic expectation mismatch.
4. `rejected experimental model loaders and public benchmark UI are removed`: tracked legacy files still exist.

Browser verification uses Chromium with real Three.js modules served unchanged from a TLS-verified download, plus forced native Canvas fallback. GPU rendering here uses SwiftShader, not a hardware performance benchmark. Existing browser assertions for the former static preview were updated to the new requested behavior; baseline Node tests were not weakened or removed.

No live AI connections or third-party brain assets are introduced. Mobile navigation uses the existing panel sheets. The snapshot reader retains its previous limitation: browsers without `indexedDB.databases()` show unavailable saved data. Preview presets and stage statistics still display without a saved player, while identity and energy remain absent.
