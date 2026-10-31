# Shared Teach memory classification

The URL switch in `js/bootstrap.js` starts `SandboxPreview` for
`?stage-preview=1` and `MindlingApp` for `/`. They are application modes of the same
codebase, with separate storage and clocks.

Previously normal Teach called `learn()` without an assessment, selecting
`analyzeNative()` and its conservative lexical category fallback. That is why a
fictional definition could become `Notes: my`. Stage Preview instead requested a
structured assessment from the existing learning endpoint and retained its
meaningful concept, category and topic.

Both controllers now call `src/learning/teach-memory.js`. This is the existing
Stage Preview request/validation/transaction orchestration extracted into one
shared function, not a new classifier or copied sandbox. It reuses:

- `learningContext()` and its existing candidate/topic/category metadata retrieval;
- `requestLearningAssessment()` and the exact-memory shortcut;
- `validateServiceAssessment()` / `validateAssessment()` / `validateDecision()`;
- `learn(..., {assessment})` and `serviceLearningAnalysis()`;
- `applyMemoryDecision()`, `recordMemory()`, `serviceMetadata()` and `assignCategory()`.

These retain atomic statements, canonical IDs/relationships, supported names,
confidence, uncertainty, player-provided provenance and existing learning rules.
Normal and Preview still pass their own `app.change()` and database; normal Teach
also keeps its existing activity journal. No database/clock/wallet fixture is
created or imported by the shared orchestrator. The existing `graphData()` and
`NeuralMemoryView` already display saved category/topic metadata and need no change.

The normal `MindlingApp.submitInput()` Teach/Deep Training branch now uses the same
service assessment as Preview's `submitLearning()`. Talk, autonomous research,
onboarding, identity, rendering, API handlers, Energy/XP policies and database
schemas are unchanged. Replay IDs are rejected before another assessment request;
identity, disposal and relevant-memory changes are rechecked inside the commit.
The existing Stage Preview thresholds remain authoritative: weak/invalid analysis
cannot manufacture a specific category or fact. Service failures do not silently
fall back to generic lexical labels or charge a new learning event.

No migration or reclassification of saved memories is required or performed.
Existing category IDs/labels, contents and historical metadata remain readable.
An old `Notes: my` record is not retrospectively relabelled as though a model had
analyzed it. New supported labels are retained through the existing category
registry and UI. Meaningful Teach/Deep Training creations retain the existing
2/3 Energy costs. Exact duplicates and no-change decisions use the existing
Stage Preview operation-aware behavior without another activity charge; no
Energy or reward constants are changed. User-taught fictional content remains a user-provided claim,
not independently verified real-world knowledge.

Normal Teach now uses the same externally configured learning service as Stage
Preview: the message and bounded relevant memory context may be sent to that
service. The existing server-side `SERVICE_API`/`SERVICE_MODEL` configuration and
`/api/mindling/learn` endpoint are reused. No new credentials, providers or
configuration flags are introduced; no key is present in browser code. This PR
made no paid inference requests.

## Verification

Node regressions exercise fictional worldbuilding (the exact Lumora input),
technical/scientific knowledge, ambiguous input, low confidence, service failure,
closed views, stale context, legacy records, replay/exact reinforcement and the
existing Deep Training cost. They use the real shared modules with synthetic
service responses. Targeted API/learning/economy tests and the updated shared-path
invariants run alongside them.

`tests/shared-teach-memory-browser.py` drives the actual normal and Stage Preview
URLs, real onboarding/test creation, Teach controls, both real IndexedDB stores
and the existing Memory display. It checks matching classification/provenance,
ambiguity without invented memories, unchanged legacy records, unchanged data
on a failed service/stale reply, reload persistence and Preview-to-production
isolation. External network is blocked; classification responses are explicitly
synthetic. It does not run a paid classifier or claim production model accuracy.

```sh
node --test tests/shared-teach-memory.test.mjs tests/learning-api-route.test.mjs tests/native-memory.test.mjs tests/native-learning-energy.test.mjs tests/memory-matching.test.mjs tests/events.test.mjs
node --test --test-name-pattern='both Teach paths|topology, token|native matching' tests/project-invariants.test.mjs
python3 -m http.server 8766 --bind 127.0.0.1
python3 tests/shared-teach-memory-browser.py
```

Deployment and live end-to-end classification remain unverified. After review and
normal deployment, a separately authorized real Teach request can compare the
same input and meaningful saved labels in both modes. The code paths are shared;
the external model's exact wording is not guaranteed by synthetic tests.
