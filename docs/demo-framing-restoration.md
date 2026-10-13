# Restore the automatic demo's fixed framing

When Agent Mind connected to Nova, Echo and Atlas, the Life 2.0 framing introduced in `e7db801` expanded its geometry envelope to radius 4.2 over 1.2 seconds. This automatically shrank the central brain. The sandbox restoration in PR #53 retained that behavior in the automatic demo.

`EvolutionPreview` now defaults to the same original framing already used by `SandboxPreview`: perspective FOV 36°, the original responsive camera distance and portrait scale, the original Canvas projection, 22px layer margins, and the seed layer's `transform: scale(.5)`. The framing class follows the option and is removed on destruction. Network discovery does not change this camera or model scale. Manual drag and zoom still work.

The reference is `1a06abc`, before Life 2.0. Production renderers, Life 2.0, Neural Stability, progression, learning and typography are unchanged.

## Matched screenshots

The comparison uses Agent Mind, reduced motion, identical rotation and zoom, and a read-only empty snapshot. Desktop is 1440×1000; mobile is 390×844. “Before” uses the unmodified preview JavaScript/CSS from `7f4d35b`; “after” uses this branch. The connected network is captured at 14 seconds in both cases.

| Backend / viewport | Before, connected | Restored, disconnected | Restored, connected |
| --- | --- | --- | --- |
| Three.js desktop | [Before](images/demo-restoration/before-connected-three-desktop.png) | [Disconnected](images/demo-restoration/after-disconnected-three-desktop.png) | [Connected](images/demo-restoration/after-connected-three-desktop.png) |
| Three.js mobile | [Before](images/demo-restoration/before-connected-three-mobile.png) | [Disconnected](images/demo-restoration/after-disconnected-three-mobile.png) | [Connected](images/demo-restoration/after-connected-three-mobile.png) |
| Canvas desktop | [Before](images/demo-restoration/before-connected-canvas-desktop.png) | [Disconnected](images/demo-restoration/after-disconnected-canvas-desktop.png) | [Connected](images/demo-restoration/after-connected-canvas-desktop.png) |
| Canvas mobile | [Before](images/demo-restoration/before-connected-canvas-mobile.png) | [Disconnected](images/demo-restoration/after-disconnected-canvas-mobile.png) | [Connected](images/demo-restoration/after-connected-canvas-mobile.png) |

Measured pixels per projected model unit before/after connecting are exactly equal with restored framing: Three.js desktop 95.9037 → 95.9037, mobile 44.2374 → 44.2374; Canvas desktop 101.0394 → 101.0394, mobile 46.9991 → 46.9991. The previous shared framing changed desktop scale from 97.4557 to 54.7132 and mobile from 59.5974 to 33.4589 in both backends.

## Verification

The existing evolution browser suite checks that Three.js camera projection, camera distance and model scale, or Canvas projection scale and position, remain identical throughout network discovery and connection. It covers both backends at desktop/mobile sizes, peer-label anchoring, manual rotation/zoom, disconnect and class cleanup. The sandbox rendering suite covers all seven stages, selection and responsive resizing.

The newly captured sandbox seed scene crops still match the pre-Life-2 screenshots pixel-for-pixel on desktop `(580,450,870,720)` and mobile `(70,220,320,600)`. These are the same comparison regions used in PR #53; the framing-class change preserves that restoration.

Results: all three existing Chromium suites (`evolution-browser.py`, `sandbox-browser.py`, `life-v2-browser.py`) pass, including all 28 sandbox stage/backend/viewport combinations. `node --test tests/*.test.mjs` reports 85 tests: 82 pass and the same three historical memory-matching failures remain (legacy semantic metadata and two REINFORCEMENT/STIMULATION expectations). The first evolution run crossed the existing five-second stage-1 timing boundary; a complete isolated rerun passed with every assertion intact.
