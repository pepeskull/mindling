# M4.2.5: UI cleanup and Replay counters

This presentation update supersedes M4.2.4's visible evolution-status, canonical-inspection and morphology-explanation UI. Automatic evolution and the separate saved learning network are unchanged.

## Interface changes

- Dashboard removes the evolution progress container, morphology note and canonical selection paragraph, their display subscriptions and exclusive styles. There are no empty replacement wrappers.
- Development removes camera buttons, neuron dropdown, selection paragraph, morphology caption and separate brain-statistics block. Pointer/touch rotation, wheel zoom, keyboard camera interaction and renderer selection/highlighting remain available.
- Development restores the pre-M4.2.4 native `<progress>` implementation and existing `.development-xp` styling. It shows only “Stage XP”, current/required XP and the bar; no milestone/duration/pending explanation. Its data still comes from `developmentData` and the unchanged progression `RULES`. Final stage uses the prior final-stage text and has no impossible next target.
- Cognitive Training panels, entry points, result/history rendering and their exclusive CSS are removed. No hidden form is mounted; the now-unrelated evaluation disclaimer is also removed from the pathways presentation. UI-only `TrainingPanel`, evolution text rendering and selection-description modules are removed. Existing test imports/assertions for the removed presentation helpers are removed as source maintenance; tests were not executed.

## Main counters

`stageMorphologyCounts(stage)` reads `visualMorphologyFor(stage).nodes.length` and `.edges.length`, using the existing cached `generateStage` source shared with Replay. There is no second counter table. Stage 2 has five foundation nodes plus nineteen generated nodes, and four foundation edges plus two edges for each generated node: **24 Neurons / 42 Synapses**.

Dashboard uses this read-only helper for all seven stages. Preview stops overriding Replay counts with its smaller saved topology. Replay and gameplay use the same plain “Neurons” / “Synapses” labels; memories remain actual saved memory counts. No duplicate Development stats card is created. The old Preview diagnostic morphology-count explanation is removed too.

Only presentation reads changed. Canonical IDs, positions, associations, growth records and IndexedDB records are not rewritten to match displayed stage complexity. The shared renderer, full stage models, deterministic projection, Canvas fallback, reduced-motion handling and animation lifecycle are unchanged.

## Cognition remains available internally

Each interactive app now owns a headless `CognitiveEngine` bound to the same EventBus and isolated store callbacks previously passed into `TrainingPanel`. Rendering synchronizes the active identity; teardown destroys the engine and releases its subscription. Creating the engine or setting its identity does not load history, write records, evaluate problems or call a model.

The engine, reasoning client, evaluation contracts, retrieval, metrics and storage modules are unchanged. Explicitly requested internal operations still support saved-history access, metrics, retained-result caching and evaluation through the existing methods. Removing the visible interface introduces no automatic training trigger, background evaluation, retry or extra provider call. Production and Preview retain their separate repositories and external-visit write guards.

## Branding and compatibility

A case-insensitive repository search found the unwanted legacy names only in two historical provider-compatibility documents. Their descriptions/examples are now neutral. No application UI/code reference or required protocol identifier needed renaming. Existing `SERVICE_API`, `SERVICE_MODEL`, API fields, endpoint behavior and provider-specific protocol compatibility are preserved.

No learning, XP, Energy, evolution, life, memory, pathway, identity or persistence rules changed. No data reset, migration, dependency or deployment configuration change is required. Existing tabs should reload after the normal deployment to use the updated presentation.

## Validation scope

**Tests were not run, as requested.** No browser automation, screenshots, image generation, builds, dependency installation or external AI model calls were performed. Work was limited to source/history inspection, repository searches and diff review. The UI has not been browser-verified.
