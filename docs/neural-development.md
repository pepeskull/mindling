# Neural Development (M4)

Development is a desktop, read-only view of the same hydrated state used by Dashboard and Memory. It does not open IndexedDB, perform migrations, invoke learning, or award/spend anything.

## Data boundaries

`src/development/development-data.js` projects saved Mindling identity, numeric stage (or legacy NEURAL_SEED), unique identified canonical nodes/synapses, stage/lifetime XP, selected pathways, milestones, learning history and completed-stage history. It reads the existing stage XP requirements from `RULES`; there is no new reward or progression calculation.

Memory identity, current/historical status, categories and current knowledge-area distribution reuse Memory's `graphData` adapter. Canonical memories include actual saved historical records, while current-memory totals and area counts in the acquired-knowledge list use current records. The distribution retains Memory's top-five-plus-Other grouping when more than six current areas exist. The knowledge-area metric counts all saved areas, including those with historical records.

Invalid/missing optional data uses unavailable or empty states. Identified node and synapse totals include records that cannot be drawn; missing positions and dangling endpoints are reported. Only saved finite 3D positions and existing connections are rendered. Embedded memory parts never become extra canonical memories.

The redundant page heading and learning-XP chart have been removed; stage and lifetime XP remain in the progression panel, and the shared header retains the life stage. Recent activity uses actual timestamps from learning and stage-completion history, including zero-XP decisions without claiming new knowledge. No synthetic baselines or growth snapshots are created.

Selected pathways are displayed as directions. Current knowledge areas are shown separately because no stored mapping links them to individual pathways. No proficiency, pathway levels, unlocks or demonstrated cognitive abilities are inferred from memory counts. M4.1 replaces the initial training placeholder with a separate real reasoning/evaluation workflow; see [cognitive-training.md](./cognitive-training.md).

## Rendering and lifecycle

Dashboard's later stages use generated visual morphology and a visual-to-canonical mapping. Development uses a lightweight native Canvas projection of canonical positions instead, avoiding artificial extra neurons/edges and another WebGL engine. It reuses `SceneInteraction` for drag rotation and zoom and `seededValue` for deterministic surface irregularity. Display positions, selection and breathing offsets belong to the view; canonical objects are never modified.

There is one Development RAF scheduler for ambient breathing, local organic motion, node pulses, hover/selection feedback and at most 64 signal points on existing synapses. Pulses are explicitly decorative, not learning or growth evidence. Empty/deceased networks are static. Reduced-motion mode draws on changes only, removes ambient movement, and snaps camera zoom; CSS progress transitions are disabled. Changes to the preference are observed live.

The component pauses on navigation or document hiding, resumes without accumulating hidden elapsed time, disconnects its ResizeObserver/SceneInteraction, aborts listeners and cancels frames on teardown. Dashboard's existing scene scheduler pauses while Development is open and resumes on return; there is no additional active 3D renderer. Memory retains its existing visibility lifecycle.

The development adapter/UI rebuild lazily when opened, then refresh on existing committed state/life notifications. A projected-data signature avoids rebuilding the UI for Energy-only changes. Opening/navigation invokes no application mutation or storage method; the existing independent gameplay timers and document-visibility refresh behavior remain unchanged.

## Theme and layout

The view retains the shared topbar and site footer. New panels copy Dashboard's exact neutral glass gradient, border token, radius, 22px blur/saturation and typography tokens, without importing the shared panel class's shadows. Camera controls reuse `glass-line`. No shared Dashboard/Memory styles change.

An absolute workspace reserves `--top-height` and the existing 30px footer. A shrinking flex/grid layout assigns roughly 56% / 26% / 18% to evolution, cognition and pathways. Zero minimum sizes and internally scrollable panels accommodate smaller desktop heights. Canvas is absolutely contained; SVG is width-bounded. There is no new body overflow rule, fixed viewport-height calculation, desktop minimum width or mobile layout.

## Validation and limitations

Automated tests and browser validation were intentionally not run at the user's request. No screenshots, images, fixtures, new test suites, production builds, dependencies or deployment runs were created. Validation is limited to source inspection and `git diff --check`; visual behavior, interaction and performance have not been browser-verified.

Historical neural/memory/area snapshots are unavailable, so those growth trends are not presented. Cognitive evaluations now have their own explicit, scoped history rather than inferred proficiency scores. Dashboard’s old neuron/synapse popover has been removed in favor of the dedicated Development selection and Memory inspector. The visualization depicts stored canonical positions rather than the Dashboard's generated later-stage brain shape. Existing production and Stage Preview storage boundaries, learning behavior, Energy/XP rules and schema remain unchanged.

## Preview event dates

Stage Preview uses a virtual clock initially set to 1 January 2026. Its original event `at`, stage `leftAt` and stage-entry timestamps remain simulation times used by gameplay. New preview learning/stage-completion history entries receive optional `recordedAt` metadata from the browser clock inside the existing save transaction. Development displays that real save date. This is additive metadata in the existing state record, with no database-version change, migration or extra transaction.

Older preview events without `recordedAt` display **Simulated date**; their real save date cannot be reconstructed reliably and is never replaced with the current date. Simulation stage-entry dates are labelled explicitly. Production continues to display its existing real event timestamps. Event ordering and XP calculations still use the original event clock; changing the preview clock does not rewrite a recorded save date.

## M4.2.1–M4.2.2 renderer and pathway update

The earlier independent Development Canvas projection has been removed. Both canonical views now use BrainRenderer with the Dashboard ThreeSeedScene/CanvasSeedScene morphology, with presentation-specific camera/lifecycle settings. Adaptive Pathways separates preserved origin selections from newly recorded knowledge evidence; it does not infer demonstrated ability. See [unified-renderer-adaptive-pathways.md](./unified-renderer-adaptive-pathways.md) for the confirmed causes, scope, policy, source limitations and manual checks.
