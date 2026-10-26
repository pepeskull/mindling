# M4.2.6: Memory, Development, public docs and input feedback

## Memory

Browse memories now slices the existing filtered, ordered result set into six records. The existing Previous/Next controls clamp the page after every rebuild; zero results show “No matching memories.” No records, category associations, ordering or IndexedDB contents change.

Cards and the area distribution list use the graph's existing category-ID color map. The mapping still derives from structured area/category associations, not keywords. The primary area supplies each card's subtle accent; unassigned areas share the existing neutral text tone. Graph, coverage list and browser reuse one mapping. Secondary/historical associations remain untouched.

## Development

Neural Evolution incorporates the former Progression metrics and the existing compact Stage XP bar. The standalone progression column is removed; Pathways & Learning becomes section 02. Current name/stage, the full stage morphology, zoom toolbar and compact metrics share one panel. At smaller widths the sections stack with internal scrolling.

The toolbar reuses Memory's `.graph-view-tools` design and shared `VIEW_ZOOM` settings: 1.2× steps, exponential wheel sensitivity .001, and a .015–4 camera range (1.5–400%). Memory retains its additional lower minimum for exceptionally large fitted graphs. Development's Seed and Replay framing opt into that full range; the previous framing cap is not silently applied behind a wider label. Other Dashboard camera limits stay unchanged.

There is one zoom state, in `SceneInteraction`. The percentage is updated from actual camera zoom after wheel easing, touch, keyboard, buttons, fit and reset. Fit uses the current stage's fitted morphology; Reset also restores the default rotation. Focus selected enables only for a real neuron selection and centers that saved element's presentation position in Three.js and Canvas. Identity changes clear stale selection/focus. No inspector text or dropdown returns.

## Hero and Stage chip

Remove the hero markup, CSS, subtitle bookkeeping and all rendering/resize references. Scene framing now begins below the actual header, without reserving a hero's vertical space.

`StageChip` owns one presentation timeout: current stage for 30 seconds, then the exact text “Demo is learning.” for 10 seconds, repeating. Only active visible Dashboard time counts. Navigation/tab hiding pause the clock; a stage change resets it to the new actual name. No-Mindling and deceased states do not display a learning cycle. Fixed chip width limits layout shifts; reduced motion suppresses the text fade. Teardown removes the timer, listener and animation. No gameplay time or persistence is involved.

## Missing neural input animation: root cause and fix

The incoming orb existed in `ThreeSeedScene`/`CanvasSeedScene`. M4.2.4 correctly replaced the visible Seed backend for stages 2–7 with full Replay morphology. `StageBrainScene.signal` then forwarded only a saved-synapse pulse to `EvolutionScene`, which had no incoming-input effect. Activity controllers also signaled chiefly learning formation/reinforcement; Talk had no equivalent entry path. The existing `NEURAL_INPUT` event name was not wired into this common submission/rendering lifecycle.

Dashboard and Preview now emit presentation-only start/accepted/cancel phases for actual submitted Talk, Teach and Deep Training. Production keeps the original submission ID for its authoritative transaction. No model calls, validation, outcomes, locking, costs or input-clearing rules are added or replaced.

`NeuralInputFeedback` creates an ephemeral non-interactive 2D canvas only while an effect exists. The existing Dashboard RAF drives it; there is no second animation loop or WebGL context. It projects the actual visible brain target through the active Seed/Replay backend. The orb moves from the submitted input toward that point, waits short of arrival while processing is unresolved, and completes only after acceptance. Rejection, failure, navigation, hidden tabs, external visits and teardown clear it without a completed absorption pulse. Empty input never starts an orb.

Arrival uses the existing canonical signal/activation path with an `INPUT_RECEIVED` outcome. This means receipt feedback, not learned knowledge. Existing activity messages remain authoritative about learning/no-change/rejection. The Seed's old duplicate incoming sprite is suppressed for these routes while its synapse signal remains available. Reduced motion substitutes a restrained static/fading indicator and activation rather than a moving trail. Nothing in the effect awards XP, spends Energy, creates memories or changes canonical topology.

## Public DOCS and footer

The footer now has DOCS and the exact external X destination `https://x.com/playmindling`, with safe external-link attributes; its repository link/configuration is removed.

`/docs` and `/docs/` are explicitly routed to `public-docs/index.html` before the existing private docs deny rule. Nested internal documentation paths remain denied. Absolute asset URLs make direct navigation and reload independent of the path. The page has no gameplay bootstrap or JavaScript and never opens the player's database. No backend/build/dependency is required.

The public guide uses existing theme tokens and glass treatment, a responsive table of contents, real stage/XP/Energy requirements, local-save guidance, learning and memory explanations, pathways, care, seven stages, capability limits and FAQ. It includes no private API contracts, configuration values or canonical mapping details. Documentation tables are a static snapshot of the current rules and should be updated if gameplay rules change later.

## Scope and validation

Gameplay reducers, automatic evolution, cognition, learning contracts, XP/cost/capacity rules, native memory operations, schemas, identity and Preview isolation are unchanged. No data reset or migration is needed. The added Vercel `/docs` exception is the only deployment routing change; existing server settings remain untouched.

**Tests were not run, as requested.** No browser automation, screenshots, builds, dependency installation or external AI model calls were performed. Work was reviewed through affected-source/history inspection, repository searches and diff review. The UI and Vercel deployment have not been browser-verified.

Manual review after normal deployment should cover 0/1/6/7/12/19-memory pagination, category colors, all-stage Three/Canvas zoom and real-neuron focus, the active 30/10-second chip cycle, direct/reloaded `/docs`, and successful/rejected/failed Talk/Teach/Deep Training with tab/view switches. These checks were not executed in this task.
