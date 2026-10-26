# M4.2.1 + M4.2.2 — Unified Neural Renderer & Adaptive Pathways

## Confirmed causes of the different brains

Dashboard used ThreeSeedScene (CanvasSeedScene fallback) for Neural Seed, with the existing faceted soma, dendrites, internal core/halo, tube connections, lights and signals. Development instead implemented an independent 2D polygon/line/glow renderer in NeuralDevelopmentScene. Its geometry, materials, neuron size, projection and signal curves were different; this was not simply stale data or a camera setting.

There were two additional canonical-state problems: Dashboard updated only `nodes.slice(0,5)` and `synapses.slice(0,4)`, and later stages crossfaded to EvolutionScene's generated stage morphology. Those generated 24/64/etc. visual objects were not the actual canonical learning-growth records. ThreeSeedScene.update only adjusted strengths, so passing more nodes alone would not have added their geometry.

## Shared renderer ownership

Reuse and extend the existing BrainRenderer, with `dashboard` / `development` presentation modes. Both modes use the same ThreeSeedScene or CanvasSeedScene implementation. Development's separate geometry/drawing loop is removed; NeuralDevelopmentScene is now only a thin camera/selection controller.

The Dashboard Neural Seed soma/deformation, dendrite generation, core/halo, materials, palette, lighting, dimensions, particle background, signal curves, reference camera constants and existing Dashboard CSS are not redesigned. Development may use bounded orthographic framing rather than Dashboard's original perspective/half-scale presentation; camera/zoom differences are intentional and do not define independent neural objects. Existing tiny noninteractive depth particles remain decorative background, not counted or presented as canonical neurons.

`canonicalBrain` is the shared read-only projection of saved IDs/positions/sizes/endpoints/strengths. It creates no neuron, synapse or position and supports arbitrary valid topology, not just 5/4. Dashboard and Development use all actual canonical objects. Invalid positions/dangling endpoints are excluded from drawing and reported by the existing Development diagnostics; counts use unique identified canonical records. Neither renderer writes state. Coincident saved positions remain coincident and may overlap; the renderer does not invent a layout to disguise that existing data limitation.

ThreeSeedScene rebuilds its seed objects when IDs, positions, sizes or endpoints actually change, and updates strengths without a structural rebuild otherwise. Rebuild/disposal deduplicates shared geometries/materials/textures and retains renderer-level lighting/background. Empty networks do not attempt an ambient impulse on a nonexistent connection. Canvas uses the same evolving canonical model and gains safe dangling/empty handling plus selection/hover integration.

### Lifecycle and interaction

- Dashboard's existing EvolutionPreview scheduler drives BrainRenderer externally, with the existing shared SceneInteraction and pointer framing. No second scheduler is introduced for Dashboard.
- Development initializes the shared renderer lazily on first opening. Its BrainRenderer owns one RAF scheduler and ResizeObserver, pauses when hidden/document-hidden, respects live reduced motion/deceased state and cleans up frames, listeners, pointer interaction and GPU resources. A late Three import cannot mount after disposal.
- Both backends retain their existing DPR caps (Three 1.75, Canvas 1.5). Drag, wheel, neuron/synapse picking, hover, neural signals and actual referenced-neuron completion highlighting reuse their backend implementations. Development's accessible neuron selector and keyboard controls remain; a selected synapse is shown in its existing diagnostic line.
- Navigating to Memory or Development pauses the Dashboard render loop. Demo network visit controls are hidden away from Dashboard so an overlay cannot start a camera trip while its scene scheduler is paused. No application-wide overflow workaround or new page is introduced.

### Explicit demos and Stage Preview

Real production gameplay and the interactive Stage Preview now render the canonical Seed morphology at every life stage; stage remains a progression label rather than a license to manufacture neural records. The explicitly selected automatic `preview-mode=demo` retains its labelled generated evolutionary demonstration.

Existing Stage-7 simulated remote brains, public read-only visits, camera trips and network effects remain in EvolutionScene. While showing the local canonical brain, its generated central geometry/segments/pulses are suppressed; only labelled simulated network content is overlaid when needed. During a read-only remote visit the external demo scene is intentionally separate from the player's brain. Its remote geometry is never copied into local state or used as canonical counts. Scene morph bookkeeping still advances without requiring an expensive hidden draw, preserving network readiness/countdown behavior.

## Pathway identity and origin persistence

Centralize the existing nine onboarding names in PATHWAY_DEFINITIONS; no unrelated Trading identifier is invented. Markets is the actual supported identifier for the task's trading example.

| Existing pathway | Priority orientation / exact structured category examples |
| --- | --- |
| Developer | Programming, software development, coding, computer science |
| Social | Communication, collaboration, social skills |
| Markets | Markets, trading, stocks, finance |
| Gaming | Gaming, game design, game strategy |
| Researcher | Research, scientific method, evidence gathering |
| Creator | Creative writing, writing, art, design |
| Analyst | Data analysis, statistics |
| Assistant | Planning, task management, organization |
| General Intelligence | General/interdisciplinary reasoning, problem solving |

The original code provided the names, not a separate domain taxonomy. The centralized version-1 mapping now documents their deterministic domain interpretation, including a small explicit set of Swedish equivalents. It is not a model or fuzzy body-text classifier.

New normal onboarding and interactive Preview creation persist `originPathways` alongside the unchanged compatibility `pathways` array, with at least three distinct supported choices. Preview replaces its old single-pathway selector with nine checkboxes and defaults to Researcher/Social/Developer; an undersized selection is rejected before a new identity is committed. Existing explicit legacy single-`pathway` constructor calls remain accepted for compatibility, and previously created single-pathway Mindlings are not replaced or padded with invented origin choices.

Previously saved Mindlings retain their original `pathways`. The projection uses them as preserved legacy selections without a write on opening/hydration. The first real new evidence record snapshots those selections to `originPathways` if that field is absent. Unsupported legacy labels are preserved and shown as unmapped rather than silently renamed. No later specialization overwrites either origin array. Personality/traits and cryptographic identity are unchanged.

## Durable pathway evidence

Evidence is appended only during **actual new canonical-memory formation** in the existing transaction:

- Native learning: after saving the original full claim and assigned category/native metadata.
- Service CREATE_NEW/LINK_TO_EXISTING: after the actual extracted claim is saved and category assignment is applied.

One unit means one distinct newly recorded normalized claim with a supported structured domain attribution. This is evidence of recorded knowledge, not evidence the claim is true or a task was mastered. A batch can produce several distinct claims under one submission ID; XP/Energy still use their existing per-submission rules. Repeated identical claims, reinforcement, conflict flags, preference/goal updates and legacy decomposition do not append progress. Opening, navigation, hydration, clock changes, viewing evaluation history and completion of a Cognitive Training evaluation do not create pathway evidence.

Each evidence record has a stable record ID, Mindling ID, original learning event ID, memory ID, normalized content key, activity, learning timestamp, real browser-clock recordedAt, policy version, attributed pathway or null, units and exact attribution provenance. The source is explicitly `stored-knowledge`. The associated memory must exist before evidence can be appended. Duplicate normalized claims in the retained ledger add nothing; existing processed-event/canonical-duplicate guards continue to reject replayed learning submissions. Pure projections also deduplicate without modifying records.

Retain at most 1,000 evidence records on the existing Mindling object, with no schema upgrade, extra counter store or independently mutable strength. The existing production/Preview state transactions persist it naturally. The profile measures this retained evidence window, not unverifiable lifetime proficiency. Eviction happens only on a new formation event, never due to elapsed time. Replay of an already processed learning event remains rejected even after window eviction; a genuinely new creation of a previously evicted/removed claim can be a new observation under the bounded-window policy.

### Classification and uncertainty

Classification prefers exact category/area labels, then exact topic/concept when no category exists. All nine pathway IDs and their explicit discipline aliases are supported. An unknown explicit category is not overridden by cherry-picking a convenient word from content or another label. Preferences, goals, intentions and historical claims remain unassigned. No body-text keyword guessing or provider call is used.

Exact native `Notes: <known-domain>` labels are supported and explicitly marked `exact-native-category-label`; these are weaker lexical category attribution from the existing native classifier, not an independent semantic assessment. Ambiguous names such as Java, unmapped mixed categories and missing metadata remain unassigned. Malformed, duplicate, wrong-identity or unsupported-policy evidence is excluded transparently rather than guessed into a pathway.

No historical memory is retrospectively classified as development evidence. Existing memories can participate in present-day relevance tie-breaking using their structured labels without being assigned historical progress. Provider-assessed Cognitive Training remains in its separate existing history and metrics; it is not counted as independently demonstrated ability or added to pathway units. No independently verifiable task-outcome source exists yet. A future versioned policy can add such a source explicitly rather than equating it with knowledge or AI-generated responses.

## Deterministic specialization and actual learning priority

For each supported pathway:

- Evidence strength: count of unique valid attributed claim records, in units.
- Relative specialization share (available in the local adapter, not shown as an intelligence percentage): pathway units / all assigned units. Null when there are no units.
- Initial orientation preference: 0.25 for each recorded origin, otherwise 0.
- Evidence preference: pathway units / all assigned units, or 0 when no assigned evidence exists.
- Total priority = origin preference + evidence preference.

Developed ordering depends on evidence units, not origin choice. A non-origin pathway can overtake origin pathways; origin history stays intact. Relative share can decline when other pathways accumulate evidence. No passive decay, skill levels, XP, rewards or neuron mapping is added.

This is not UI-only configuration. Production native `retrieveMemories` receives a priority callback from analyzeNative. Preview learningContext's actual eight-memory preselection passes the Mindling to retrievePreviewMemories. Both retain positive-relevance thresholds and primary relevance scores; priority is only an equal-score tie-break. Recorded conflict context wins a tie before orientation (conflict preference 2, greater than any domain preference of at most 1.25). Unsupported/unfavored domains are never hard-filtered and stronger relevance always wins. Native's existing full-memory contradiction/duplicate safety comparisons remain intact. Formation classification thresholds, service schemas and accounting policies are unchanged.

Cognitive Training's version-2 retrieval, evaluation contract, provider body and fingerprint calculation are deliberately unchanged, so a pathway view/context read does not invalidate cached evaluations. `CognitiveEngine.pathwayContext()` exposes a bounded read-only local interface for M4.3: preserved origins, nine priorities/developed entries, counts/uncertainty, and at most 12 recent provenance references (IDs/category attribution, not full memory content). Explicit cognitive completions also return this local context to their caller. It is **not** automatically sent to a provider and does not add a model call.

## Development UI

Adaptive Pathways sits inside the existing internally scrollable Pathways & Learning panel. It separates immutable origins from developed evidence-unit rows, displays unassigned/excluded records and the last real evidence update, explains the priority policy, and offers a 20-item paginated evidence ledger covering the retained records. It states that provider assessments and independent ability are separate. An empty/legacy profile has an honest insufficient-evidence state rather than retroactive progress bars.

The existing neutral glass theme, typography, outlines, borders and viewport layout remain. No box shadows, drop shadows, new dependencies, full-screen page or global scrolling workaround. Existing acquired-knowledge area totals and real learning history remain below Adaptive Pathways. No arbitrary intelligence percentages are displayed.

## Isolation, events and M4.3 boundary

Production and Preview still use their existing separate databases. New fields are persisted only with a real creation/learning transaction for that Mindling, not by adapters or scene updates. No reset/migration is introduced; existing records, training histories, counters and memory relationships remain intact. A legacy read-only snapshot's `mindlingId` is used for scope even when its document key is `primary`.

No new provider-triggering event is introduced. Existing state presentation and explicit cognitive events are reused; a view refresh is not counted or emitted as new pathway learning. There is no automatic reasoning integration, background AI loop, recursive cognition, passive reward or model-based pathway classification. M4.3 must separately authorize and define gameplay triggers/costs before using the local context interface.

## Validation performed

- Source review of Dashboard/Development/Three/Canvas/model/camera/selection/visibility/GPU disposal, origin onboarding/persistence, native/service learning, canonical relationships, cognitive cache and cost boundaries.
- Syntax checks and relative-import existence checks for changed JavaScript; `git diff --check`.
- Focused in-memory deterministic checks only: all nine pathway mappings, creation of real native knowledge evidence, no reinforcement/replay progress, preserved origins, legacy snapshot scope, unassigned attribution, non-origin dominance, projection idempotency, actual learning relevance tie-breaks and conflict precedence, three-choice creation validation, unchanged native 50 XP / 2 Energy accounting and full-text capture, and non-mutating 8-neuron/12-synapse canonical projection.

No full automated test suite, browser automation, screenshots, production build, model API calls or dependency installation was run. The focused checks use disposable in-memory objects only, with no fixture files, IndexedDB access or production data changes. Visual parity, WebGL/Canvas behavior, GPU disposal and end-to-end persistence remain unverified in a browser.

## Manual verification checklist (not executed)

### Renderer

1. Compare the initial real Dashboard Neural Seed against the existing appearance: unchanged soma facets, dendrites, colors, core, opacity and connections. Open Development and compare the same underlying objects while allowing different camera/zoom.
2. Verify drag/wheel, neuron and synapse selection, Development keyboard/index controls, hover and neural signals. Confirm the previously removed Dashboard popup is not reintroduced; Development retains its diagnostic integration.
3. Confirm the same actual canonical neuron/synapse counts in both views, including a legitimate later grown topology rather than generated stage counts. Missing saved positions/endpoints must be reported, not replaced with dummy objects.
4. Switch views, hide/show the document, toggle reduced motion, resize and reload. Confirm only the visible view schedules central-brain drawing and resources/listeners are released on teardown. Force Canvas fallback for a manual comparison if desired.
5. Exercise the explicitly labelled automatic demo and Stage-7 demo connections/remote read-only visits. The normal local brain must stay canonical; the foreign/demo brain must remain explicitly separate. Network controls must not overlay the paused Memory/Development workspace.

### Pathways

1. In interactive Stage Preview select at least three origins, create a new Mindling and inspect originPathways/pathways in its own state. Verify fewer than three is rejected without replacing identity. Open an existing single-origin/legacy Mindling and confirm its saved choices are preserved, not padded.
2. Inspect equal-relevance learning candidates with different structured pathway labels. Origin/evidence preferences should change only tie ordering; an actually stronger outside-domain match or recorded conflict context must not be displaced by orientation.
3. Perform an eligible real new learning action whose actual saved category has a documented exact mapping. Inspect one scoped evidence record per unique new claim with event/memory IDs, attribution and real recorded timestamp. Ambiguous/unmapped categories must be unassigned.
4. Reload/navigate repeatedly: no duplicate evidence or progress. Repeat/reinforce the identical claim and replay a processed submission: no additional units. Check body text, capture integrity, rewards and canonical neural rules remain unchanged.
5. Accumulate genuinely distinct claims in a non-origin pathway (e.g. Markets). Its raw units can exceed origin pathways without changing origin history. No passage of time alone should change any evidence units.
6. Inspect evidence units/source/provenance, last update, pagination and uncertainty/legacy state. Compare production separately: preview creation/learning must not read/write production data.

### Cognition and costs

1. Open Cognitive Training and inspect previous v1/v2 history and cached results. A pathway panel/read, render, reload or local `pathwayContext()` call must send no model request.
2. Run a model evaluation only if explicitly choosing its disclosed provider costs. The existing validated contract, evidence/uncertainty rules and per-Mindling history/cache must remain intact; no XP, Energy, canonical knowledge or pathway evidence is awarded by evaluation alone.
3. Verify no automated M4.3 trigger, polling or hidden provider request exists. Independently verified abilities must remain unavailable rather than inferred from recorded claims or same-provider outcomes.
