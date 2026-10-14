# Restore original sandbox model sizing

This report records PR #53. The subsequent [automatic demo restoration](demo-framing-restoration.md) also enables original framing in the demo and scopes the shared CSS to `.original-preview-framing`.

Reference: `1a06abc`, before Life System 2.0. The sizing change came from `e7db801` (PR #52), which removed the half-size seed transform, removed the 22px layer margins, changed preview backing dimensions, and introduced shared orthographic/pixel framing.

This change restores that earlier configuration specifically for the interactive sandbox at `/?stage-preview=1`. It does not revert any Life 2.0, typography, Neural Stability, progression, learning, wallet or storage code. Main-app renderers are unchanged. The automatic demo keeps its current shared framing.

## Restored rendering configuration

| Component | Restored sandbox behavior |
| --- | --- |
| Seed layer | `transform: scale(.5)` |
| Seed/growth layer inset | 22px top and bottom |
| Renderer height | Host height minus 44px, matching the layers |
| Three.js seed | Original perspective FOV 36°, camera z=5.8, group scale `1.28 × zoom` |
| Three.js growth, stages 2–7 | Perspective FOV 36°, camera z=`max(9, 4.2 × portraitFit / (tan(18°) × aspect))` |
| Portrait growth scale | `min(1, aspect × 1.3)` when width is less than height; otherwise 1 |
| Canvas seed | Original `min(width,height) × .18 × zoom` projection and 14px base soma radius, inside the half-size layer |
| Canvas growth, stages 2–7 | Original `min(width/7.8,height/5.3) × zoom` projection |

`SandboxPreview` explicitly selects `originalFraming`. The shared preview class passes it to the growth renderer and leaves the seed renderer's framing option empty, reusing its unchanged production defaults. CSS overrides are scoped to `.sandbox-mode`; neither the main app nor automatic demo receives the half-size transform.

Rotation, wheel/pinch zoom, pulses, canonical mapping and inspection callbacks are retained. The browser harness projects click coordinates through the transformed seed layer and the inset growth layer, testing actual selection instead of merely checking that the callback exists.

## Visual comparison

Capture sizes are 1440×1000 desktop and 390×844 mobile, with the same “Scale Comparison” identity, backend and reduced-motion setting. “Before” means the enlarged Life 2.0 version from `a4fa6b2`; “Restored” means this change. The pre-Life-2 images are the original reference.

| View | Enlarged before this change | Restored | Pre-Life-2 reference |
| --- | --- | --- | --- |
| Sandbox desktop | Before (image removed) | Restored (image removed) | Original (image removed) |
| Sandbox mobile | Before (image removed) | Restored (image removed) | Original (image removed) |

Canvas restoration: desktop (image removed), mobile (image removed). The screenshot harness also captures the main app and all 28 combinations of stage, backend and viewport under `/tmp/mindling-sizing-restoration/`.

Life 2.0 and larger typography remain visible in the restored screenshots; only the brain geometry returns to the older size and framing. WebGL captures briefly keep the real render loop active so Chromium composites the CSS-transformed canvas correctly.

The desktop seed silhouette matches the original screenshot's pixel bounds `(619, 502, 826, 667)` and the same 6,490 colored neuron pixels in the comparison region. This independently confirms the returned visual size rather than relying only on configuration values.

The central scene crops also match the original screenshots pixel-for-pixel on desktop and mobile. UI differences outside those crops are the retained Life 2.0 and typography improvements.

## Verification

Run `node --test tests/*.test.mjs`, and run the existing `evolution-browser.py`, `sandbox-browser.py` and `life-v2-browser.py` suites against a local server. The latter now verifies the restored perspective camera, portrait scale, Canvas projection, layer margins and click coordinates for all seven sandbox stages, along with retained Life 2.0 and typography checks.

Results: 85 Node tests, 82 passing, with the same three historical memory-matching failures (missing legacy semantic matcher and two REINFORCEMENT/STIMULATION expectations). All three Chromium suites pass. The automatic demo suite passes in isolation; an initial concurrent software-GPU run crossed its stage-1 wall-clock boundary. No gameplay assertion was removed or relaxed.
