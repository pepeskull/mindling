# Dashboard and Memory Regression Fix

## Root causes

The Life System cleanup removed the former `.today-state` block from `index.html`, but `Dashboard.render()` still assigned to `.today-state p`. `BrainEngine.create()` emits `STATE_READY` synchronously, so the stale selector was reached during onboarding immediately after creation and threw before the remaining dashboard state—including Knowledge Area derivation and Memory rendering—could update.

The Memory navigation and IndexedDB hydration were intact. Its primary regression was downstream of that exception. A second usability gap was confirmed: Knowledge Area cards reported counts and cohesion but did not render their associated canonical memory records, so the page could not actually inspect memory content or metadata.

## Corrections

- Removed the obsolete Today renderer instead of masking the missing element.
- Kept `STATE_READY` rendering connected to actual hydrated and newly created brain state.
- Rendered every derived Knowledge Area as an expandable region containing its actual canonical memories, IDs, strength, activation count, neuron participation count, and stored relationship count.
- Isolated EventBus listeners so one failing view cannot prevent later subscribers. A sanitized `EVENT_HANDLER_FAILED` event gives the dashboard a player-safe error surface while `reportError` retains browser-level developer visibility where supported.
- Moved Neural Cycle age beside the stage chip, placed Life Status in a standalone glass panel below the left controls, and reduced the right panel to compact Energy, Activities, Basic Care, Social Status, and profile controls.
- Replaced emoji with consistent stroke SVG icons and retained existing design tokens and glass styles.

No persistence schema, life balance, canonical memory, semantic debug, token, or neural rules changed.
