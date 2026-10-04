# Amelia / 3DBrain rendering notes

Source reviewed: [victors1681/3dbrain](https://github.com/victors1681/3dbrain), with emphasis on
`src/app.js`, `src/js/MainBrain.js`, loaders, views, services, shaders, chunks, data, models,
textures, and the original dependency manifest.

## What Amelia does

- `MainBrain` extends an application-level Three.js scene/controller. It owns camera movement,
  lighting, the model-loader result, particle systems, memory animations, the update loop, GUI,
  and post-processing.
- Loaded meshes and line segments are classified by names. Brain geometries are merged, while
  geometry positions are recorded against memory categories from JSON data.
- `ParticleSystem` transforms a loading-ring point cloud into points sampled from the merged brain
  geometry. Custom attributes and shader chunks drive position, color, delay, point shape, and the
  x-ray material.
- `BubblesAnimation` and `ThinkingAnimation` are separate visual subsystems updated by the main
  loop. Memory selection changes their visual state; it is not a persistence model.
- GSAP sequences the introductory camera move, particle transformation, x-ray transition, and
  timed memory demonstrations.
- The original renderer depends on an older Three.js, Three BAS, GSAP, WAGNER/post-processing,
  webpack loaders, GLSL transforms, model files, textures, and JSON data. It is not directly
  portable to a no-build native-module application.

## Milestone 1 decisions

Socaiety does not adopt Amelia's monolithic application controller. `BrainEngine` owns the
canonical neural graph and emits snapshots. `BrainRenderer` only validates and presents those
snapshots. A scene view implements a small lifecycle (`mount`, `update`, `resize`, `render`, and
`destroy`) so the current Neural Seed can later be replaced by an Amelia-derived view without
changing the engine, persistence, or dashboard.

The current renderer intentionally uses only five node records and four synapse records from the
engine. It borrows Amelia's useful visual principles—geometry-derived particles, layered glow,
calm camera framing, and independently updated visual systems—without rendering its adult brain,
memory taxonomy, x-ray system, models, shaders, textures, or scripted demo.

## Later migration boundary

When a later milestone reaches the appropriate evolution stage:

1. Port only required models/textures and document their provenance.
2. Rewrite relevant GLSL as browser-loadable shader modules or plain shader strings; do not add
   webpack/glslify.
3. Replace old `Geometry`, `BufferGeometryUtils`, Three BAS, and WAGNER usage with current Three.js
   APIs and a deliberately selected native-module post-processing path.
4. Feed vertex groups, neural activity, and memory pulses from a renderer snapshot derived from
   `BrainEngine`; never infer canonical neurons or memories from loaded geometry.
5. Keep animation timelines inside the visualization adapter. Animation completion may publish an
   event, but it must not mutate economic, entitlement, or canonical brain state.
6. Preserve the renderer lifecycle so models, materials, textures, listeners, and animation frames
   are disposed when the view changes.

No Amelia source code or assets are copied into Milestone 1.
