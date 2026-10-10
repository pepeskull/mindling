# Neural evolution development preview

Open the application with `?stage-preview=1`. This is an in-memory visualization,
not a gameplay evolution mechanism. The normal dashboard, storage initialization,
Life System and semantic inference do not start until Exit Preview. The query
parameter is removed on exit and the normal application starts once.

## Implementation

- `src/preview/evolution-model.js`: the seven immutable definitions, original
  seeded morphology provider, continuous morph buffers, playback clock and
  network protocol simulation. No DOM, database, gameplay or network writes.
- `src/preview/evolution-scene.js`: shared bounded scene buffers and Three.js / Canvas
  backends. Instanced somas, batched dendritic fibers, cortical contours, curved
  pathways and a fixed impulse pool. Stable neuron indices interpolate positions
  and radii; newborn visual neurons grow from an existing parent. Interrupted
  transitions start from the current interpolated frame. Links and branches extend
  during growth. None of these temporary objects are canonical neurons.
- `src/preview/evolution-preview.js`: compact glass controls, isolated lifecycle,
  visibility handling, reduced motion and one animation scheduler. The existing
  ThreeSeedScene / CanvasSeedScene renders Stage 1, crossfading into the growing
  scene across 1.6 seconds. Both scenes share the existing SceneInteraction.
- `js/bootstrap.js`: preview is selected before constructing MindlingApp. Exit
  disposes preview resources before starting production. The canonical
  BrainRenderer validator remains unchanged and receives no synthetic stages.
- `css/evolution-preview.css`, `index.html`: scoped presentation and stylesheet.
  Existing navigation and dashboard layout are unchanged.
- Existing seed renderers accept an optional shared interaction, expose a reduced
  motion setter and remove their canvas during cleanup. Seed background particles
  are deterministic. SceneInteraction releases pointer capture when disconnected.

## The seven stages

| Stage | Name | Temporary visible neurons | Development |
| --- | --- | ---: | --- |
| 1 | Neural Seed | 5 | Existing soma, dendrite and four-synapse foundation |
| 2 | Neural Cluster | 24 | Branching growth around the original five positions |
| 3 | Primitive Mind | 64 | Emerging paired regions and original cortical contours |
| 4 | Learning Mind | 104 | Increasing regional organization and distant pathways |
| 5 | Cognitive Mind | 148 | Six visual regions, deeper branching, coordinated impulses |
| 6 | Autonomous Mind | 196 | Elaborate internal structure; no claim of autonomous AI |
| 7 | Agent Mind | 240 | Complete original structure and optional network demonstration |

The default seed is 17. The same stage and seed reproduce the same arrangement.
Stage selection is direct; Previous/Next pause automatic advancement. Play advances
at five seconds of visible-tab time per stage and stops at Stage 7. Pause affects
stage playback; ambient activity and an explicitly started network demonstration
continue. Restart starts playback from Stage 1 and clears the network. Reduced
motion starts paused, snaps stage changes and disables traveling impulses,
discovery rings and breathing. The user may explicitly Play even with reduced
motion enabled. Hidden tabs stop the scheduler and do not accumulate playback time.

## Simulated external network

The central brain stays at Stage 7. Three deterministic small neural graphs appear
around it. Each has 36 temporary neurons, internal paths and subtle activity.
No identity records, API calls, sockets or peer discovery are created.

For each peer, staggered by 4.5 seconds:

1. DISCOVERING: a central discovery ring and peer emergence.
2. CONNECTING: one outgoing pulse, then an incoming acknowledgement; the peer reacts.
3. CONNECTED: the acknowledged curved connection grows into place.
4. EXCHANGING: outgoing and incoming impulses travel in opposite directions.
5. Stop enters DISCONNECTING, retracts links and fades peers over 1.2 seconds, then
   DISCONNECTED clears all temporary peer state.

The UI always says `NETWORK SIMULATION — NO LIVE CONNECTIONS`. Per-peer states
are shown separately from the currently active overall phase. Production Social
Status is untouched. Real AI-to-AI networking still requires a separate protocol,
authenticated identities, consent, privacy rules and an actual transport milestone.

## Budgets and limitations

- Central graph: at most 240 neurons and 960 graph edges (actual generated count
  is lower), plus bounded decorative branches and original cortical contours.
- Three remote graphs: 36 neurons each; at most 348 instanced somas in total.
- At most 30 traveling impulses, three external curves, eight samples per internal
  curve and 32 per external curve. No per-frame geometry or material construction.
- Fixed typed-array capacity: 14,048 line segments; 96 external-link segments.
- Main renderer: one instanced soma draw, two batched line draws, one impulse draw,
  and an optional discovery ring. The existing seed renderer remains separately
  allocated for reversible crossfades, but is rendered only while visible.
- Three.js DPR is capped at 1.75; Canvas at 1.5. No bloom/postprocessing dependencies.
- Geometry/materials, WebGL contexts, canvases, listeners, observers, pointer capture
  and scheduled frames are released on exit. No preview intervals are installed.
- The cloud browser uses software WebGL; these checks are functional verification,
  not a claim of 60 FPS on all hardware. Desktop hardware profiling and wider
  mobile-device coverage remain worthwhile. Canvas is deliberately simpler.
- The morphology is an original stylized neural visualization, not anatomical data
  and not Amelia-derived. Stage labels do not change the production Life System.

## Amelia source and reuse audit

User-supplied archive: `3dbrain-master.zip` (Sediment attachment). The attachment
transfer tool rejected it because it exceeds its 32 MiB transfer limit. **No ZIP
contents were extracted or verified.** Its exact commit and equality to upstream
remain unknown. A smaller source-only archive is needed to audit that exact copy.

A single fallback HTTPS Git probe and clone succeeded using the platform's existing
authentication/proxy. Inspected upstream:

- Repository: https://github.com/victors1681/3dbrain
- Commit: `ab26234f5e7553b59aeb766da6d3c46653b11dca`
- Local audit checkout: `/tmp/mindling-amelia-audit` (not part of this repository)

Files inspected at that commit:

- `README.md`, `package.json`, `src/app.js`, `src/js/MainBrain.js` and
  `src/js/views/AbstractApplication.js` (controller, scene and camera ownership).
- `src/js/Loaders/Loaders.js`, `services/particlesSystem.js`, `animations.js`,
  `bezierAnimation.js`, `bubblesAnimation.js`, `thinkingAnimation.js`.
- The shader inventory (`custom`, `flashing`, `glow`, `light`, `noise`, `xRay`)
  and `chunks/noise.raw.xml`, `random.raw.xml`, `rotate.raw.xml`.
- OBJ inventory and headers, including `static/models/BrainUVs.obj`,
  `brain_vertex_low.obj`, `brain-parts-big.obj`, `brain-andre.obj`, standing models,
  and the associated MTL; texture and skybox inventory in `static` / `public/static`.
- Embedded license metadata in `static/fonts/Roboto_Regular.json`.

Exact findings:

- `package.json` declares `license: "MIT"` and author `Victor Santos`. This is a
  project-level MIT declaration; it must not be described as an entirely unlicensed
  repository. MIT reuse requires retaining the applicable copyright and permission
  notice in copies or substantial portions.
- No LICENSE, COPYING or NOTICE file was found in the checkout. No separate
  source copyright/permission notices were found in the inspected source files.
- Brain OBJ headers identify export tools (3ds Max/guruware, SketchUp/Trimble,
  Blender, ZBrush, Meshlab). Tool/exporter copyrights do **not** establish who owns
  the brain geometry or grant permission to redistribute it. Separate provenance
  and license coverage for models, textures and skyboxes were not established.
- Roboto's embedded metadata says `Font data copyright Google 2012` and
  `Licensed under the Apache License, Version 2.0`, with the Apache license URL.
  This font is unnecessary here and was not copied.
- The dependency manifest uses Three.js 0.91, Three BAS, GSAP 1.20, WAGNER,
  postprocessing, GLSL transforms, webpack, lodash and socket.io-client. Their
  package declarations are not an audit of every distributed dependency/asset.
  None were installed or imported into Mindling.

**Integrated Amelia components: none.** The package-level declaration is recorded,
but the source/asset notices and provenance needed for the intended model-based
integration remain unresolved. The preview says **PENDING AUTHORIZATION**; this
refers to the intended Amelia integration, not a claim that the MIT declaration
is absent. No Amelia source, shaders, meshes, textures, fonts or direct adaptations
are included in this implementation.

`EvolutionScene` accepts a morphology `provider(stage, seed)` via its constructor;
`Morphology` caches that provider's seven detached visual snapshots. A future
verified provider must preserve the Stage 1 foundation, stable node indices and
budgets, return `nodes`, `edges`, and optional original/authorized `contours`, and
remain independent of gameplay. Authorized rendering adapters can implement the
same mount/select/resize/render/destroy lifecycle. This is the Stage 3–7 integration
boundary; there is no placeholder claimed as an imported Amelia component.

Before importing Amelia material, verify the exact archive/commit, resolve the
source notice and asset provenance separately, retain required notices, and audit
only the specific dependencies actually needed. Do not import its application,
old build pipeline, camera/RAF ownership or simulated memory data.

## Validation and baseline

Available local HEAD and fetched `origin/main` both resolved to
`a09e396d52bcbd28e67049d01de2ad286d960f70`. The request's reported baseline
`56ae7bc64664bf6364a10b39b7de5cbd927b5317` was not available in the checkout.
Implementation was based on the actual files and available main, without assuming
that the reported baseline was present.

Run `node --test tests/*.test.mjs` from the repository root. New tests exercise exact
stage order, deterministic/distinct morphology, canonical foundation isolation,
interrupted morphs, playback controls/timing, all network states, acknowledgement,
bidirectional pulses, three peers, disconnect, geometry/impulse budgets and camera
limits/pointer-capture cleanup.

Optional real-browser regression: start `python3 -m http.server 8000 --bind
127.0.0.1`, then run `python3 tests/evolution-browser.py` with Python Playwright and
Chromium installed. No npm build system is required. The test downloads the existing
pinned Three.js 0.180.0 modules using curl with TLS verification, then serves those
unchanged files to the browser through request routing because this cloud
Chromium's trust store lacks the proxy CA. This is not a mocked rendering library;
no certificate verification is disabled. Both WebGL and deliberately blocked-CDN
Canvas fallback are exercised. Screenshots are written under `/tmp`.

The browser suite creates a real local Mindling, performs Talk, snapshots all
IndexedDB stores, enters preview, checks zero database opens/writes by the preview,
compares stored records, visits all stages, runs the network, checks controls,
restores the production renderer and tests repeated teardown. This covers identity,
personality, neural state, memory/knowledge stores, Life, energy and activity records.

The original suite has four pre-existing failures: three legacy memory-matching
expectations call the current semantic-authority implementation without the
required semantic evidence; one project invariant expects experimental files to
be absent although they remain tracked. These tests were retained unchanged.

Verified results for this change:

- Node: 59 tests executed, 55 passed, the same 4 baseline failures; no skipped tests.
  All 11 new evolution tests passed.
- Chromium/Three.js: all seven stages rendered; real stored-player isolation,
  all controls, ordinary-motion network exchange, reduced-motion stages, return to
  production and one application scheduler passed.
- Chromium/Canvas: all seven stages and animated network exchange passed; mobile
  controls at 390 × 844 remained visible; no database access occurred in preview.
- Repeated preview start/destroy, hidden-tab pause/resume and duplicate visibility
  events left zero preview frames/listeners after teardown.
- Screenshots of every stage and the network were visually inspected. The final
  layout reserves space for the toolbar rather than overlapping the brain.

- A rendered Three.js scene reported 4 allocated geometries before teardown and
  0 geometries / 0 textures afterward.
