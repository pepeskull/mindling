# Branding and repository cleanup

> Historical delivery record. External learning and model configuration described below have been superseded by [native browser learning](semantic-models.md). Recorded test results apply to that historical revision, not the native migration.

This cleanup removes the public benchmark and annotation applications, abandoned semantic experiments, and unused placeholders. Normal gameplay, the M4 sandbox, native browser learning, the simulated Solana wallet, and browser/Node test infrastructure remain active.

## Removed paths

- Public applications: `benchmarks/knowledge-formation/` and `tools/topic-annotation/`.
- Duplicate runtime benchmark modules: `src/benchmark/`.
- Abandoned semantic/debug code: `knowledge-area-flan.js`, `knowledge-topic-e5.js`, `knowledge-topic-jina.js`, `semantic-diagnostics.js`, `knowledge-area-debug-panel.js`, and `knowledge-area-debug.css`.
- Superseded semantic experiment implementations: `knowledge-area-foundation.js` and `knowledge-relation.js`; their tested contracts/corpus were reduced and moved to test support.
- The unused `src/economy/entitlements.js`, empty asset placeholder directories, root `.gitkeep`, and `favicon.svg`.
- Historical reports for the removed FLAN, E5, Jina, annotation, benchmark, topic-classifier, and Knowledge Area 2 experiments. Current architecture, rendering provenance, regression rationale, and M4 operational/security documentation remain.

The exact file list is recorded in the cleanup pull request diff. Both root directories `benchmarks/` and `tools/` are absent after the change.

## Migrated test support

- `annotation-core.js` and `pilot-dataset.json` moved from the old annotation application to `tests/support/annotation/`.
- The relation comparison corpus moved to `tests/support/annotation/relation-matrix.js`; unused runtime classification code was excluded.
- The tested provisional-topic, hypothesis, verification, and shadow-boundary contracts moved to `tests/support/semantic/knowledge-area-foundation.js`; unused inspection UI helpers were excluded.
- The existing deterministic benchmark dataset and runner remain under `tests/support/benchmark/`. The duplicate runtime copy and browser UI were removed. Its database module is now only the namespace/isolation fixture actually asserted by tests.

No production module imports these fixtures.

## Retained code that can look experimental

- This historical delivery predated the native-learning migration. The later browser-model adapters and AI Model Lab have now been removed; current gameplay uses `src/learning/native-learning.js` and does not download pretrained models.
- `src/preview/` is the active M4 isolated sandbox and seven-stage demonstration requested by the product. It deliberately remains separate from production storage.
- `src/preview/vendor/qrcode.js` and its license render the test-only Solana simulation identifier. They do not create a real address or payment.
- `src/economy/economy.js` remains as an explicit invariant that production token payments are disabled.
- `mindling-life-system-1.md`, `dashboard-memory-regression-fix.md`, rendering notes, neural/dashboard evolution reports, and `docs/milestone-4/` document active behavior, provenance, regressions, or deployment/security constraints.

## Branding and links

The header and interaction mark load root `logo.png`; unrelated functional SVG icons remain. The favicon loads root `favicon.png`, and the old SVG has no references. The accessible dashboard name is “Mindling dashboard”. The footer contains GitHub plus X and Docs placeholders driven by `src/config/site-links.js`. No official X or hosted Docs destinations were present in repository configuration or documentation, so those two labels are disabled instead of linking to invented addresses.

## Verification scope

Node tests cover migrations, absence invariants, production gameplay, native learning, sandbox rules, storage isolation, death, progression, neural growth, and wallet simulation. Chromium checks `/`, `/?stage-preview=1`, and `/?stage-preview=1&preview-mode=demo` with Three.js and Canvas, desktop/mobile layouts, all seven demo stages, XP/clock/life/death behavior, local Teach and Deep Training, simulated purchase, persistence, and production IndexedDB isolation.

That persistence check exposed and fixed a pre-existing callback error in `PreviewStore.read()` that previously left direct IndexedDB reads pending. Reload-after-death and player-wallet preservation now complete in both renderer runs.

The learning browser smoke records model and learning-endpoint requests and requires that none occur. No real Solana payment is enabled or attempted.

The current cleanup run contains 97 passing Node tests. Both Chromium suites pass with the real Three.js modules and the Canvas fallback.
