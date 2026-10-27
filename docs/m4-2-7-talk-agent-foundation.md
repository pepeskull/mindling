# M4.2.7: Talk, neural reception, technical docs and progression

## Neural input regression

M4.2.6 deliberately capped the pending orb at 70% of its path until the authoritative result arrived. This made travel depend on provider latency, producing the reported midair freeze. Drawing several lagged radial gradients produced separate luminous afterimages rather than a continuous trail.

The effect now uses a presentation-only 850 ms journey plus a 180 ms impact fade. One orb follows a continuous smooth path to the active Seed/Replay target. Its trail is one fading gradient stroke, not a sequence of circular particles. The existing Dashboard RAF remains its only scheduler.

Controllers launch reception after immediate preflight validation. Production learning preflights the existing pure reducer; Preview learning constructs/validates its existing learning context; Talk preflights the shared authoritative Talk reducer. The input form shows a separate restrained processing indicator while unresolved. Arrival activates the existing `INPUT_RECEIVED` route, not the learning-formation route. Successful formation signals still follow actual committed learning only. Errors can cancel an active reception effect; no failed request awards XP, creates a memory or produces a learning-success confirmation. Reduced motion skips travel/trail. Navigation, hidden tabs, external visits and teardown clear the temporary canvas.

## Talk: one accepted activity, one Energy

Production already used the native `talk` reducer and spent 1 Energy. Preview instead sent Talk through the learning-assessment path, where repeated/no-change outcomes could cost zero and new content could become a memory. Both controllers now call the same `knowledgeTalk` orchestration and commit through the existing `talk` reducer. Teach and Deep Training retain their respective learning paths and costs.

The sequence is:

1. Run the existing Talk reducer against a disposable state clone for immediate validation: living identity, input limits, replay ID, repeated-input rules and spendable normal/bonus Energy. Nothing is persisted here.
2. Construct context using existing `trainingContext` retrieval: current memories, labels, saved associations, conflicts and integrity metadata. This retains the existing bounded preselection behavior.
3. If there are no usable current memories, return an explicit local empty-knowledge acknowledgement. This is not represented as a provider inference. Otherwise, request one Talk completion from the existing reasoning service.
4. Validate the returned reasoning structure, actual supplied references, exact quoted claims and inference reference consistency on both server and client. Talk is not an evaluation session and does not receive a fabricated score or independent-verification claim.
5. Before acceptance, use a fresh authoritative write transaction to check the same identity and context, validate Talk again and spend exactly 1 Energy with the existing base-first/bonus policy. Failed writes roll back. No Stage XP, lifetime XP, memory or canonical structural growth is awarded by Talk.
6. Display the reply only after successful acceptance. Stale context, death, insufficient Energy, immediate rejection, provider failure, invalid output or cancellation before commit do not accept/charge the activity.

Production retains the existing Energy journal; Preview retains its isolated state/processed-activity records. Duplicate callbacks with the same identity/request ID share an in-flight/completed promise, with a bounded cache of recent settled requests. Persisted processed IDs and existing transaction serialization prevent repeat charges after reload/cache eviction. There is no automatic inference retry or second charge for retry handling.

Navigation away from Dashboard, entry to external read-only views and application teardown abort an unresolved Talk. A fresh request has its own live cancellation signal. State is rechecked inside the transaction; a transaction that has already accepted/committed remains authoritative.

The existing native Talk validation is retained, including its meaningful-text and repeated-input restrictions. Very short questions may still be rejected. Stored knowledge is bounded; relevant information can be missed, and quoting a real claim does not prove the answer's reasoning or factual truth.

## Existing inference service extension

The existing `/api/mindling/reason` endpoint accepts an additional strict `{ id, context, mode: "talk" }` envelope. Existing two-field evaluation requests and their three phases remain supported with unchanged evaluation instructions/rules.

Talk reuses:

- The configured `SERVICE_API` / `SERVICE_MODEL`, model-availability lookup and strict completion mechanism.
- The existing context/quote/inference schema and validators, with a small separate Talk response envelope.
- Origin checks, body bounds, per-IP rate limits, active-request guard, deadline/abort handling and generic server errors.
- Existing client transport and bounded retrieval rather than a second chat engine or memory store.

One Talk request makes at most **one generation completion** (plus the existing model metadata lookup); it does not run separate retrieval/evaluation completions or save a cognitive evaluation record. No model identifier or credential is added to the Talk browser response. Missing/unavailable configuration produces an explicit failure, not a fabricated generated answer. Provider usage can still be incurred by a user-requested inference whose output is later rejected or becomes stale; product Energy acceptance is separate from provider billing.

Client and handler should deploy together so the server understands Talk mode. No new environment variables, dependencies, endpoints, database stores or schema migrations are required. Existing Vercel routing and function duration configuration remain unchanged.

## Compact response UI

A dismissible latest-response section lives inside Dashboard's existing right panel, with processing, answer and error states. Long answers wrap and scroll internally; the container scrolls within the panel to expose the response. Only the latest reply is held in presentation state, not a new chat history database. Responses use `textContent`, show actual reference count/uncertainty and indicate limited support. Identity changes clear old replies. Development and Memory do not receive a response panel.

The form's processing state is separate from the orb. Normal Talk's existing mode button now explains that selected stored knowledge can be sent to the configured AI service. No hidden/background cognition is started by opening views or docs.

## Higher Stage XP requirements

Only the XP column of shared `RULES` changes:

| Transition | Stage XP | Minimum days (unchanged) | Unique milestones (unchanged) |
|---|---:|---:|---:|
| 1 → 2 | 75 | 1 | 6 |
| 2 → 3 | 125 | 2 | 10 |
| 3 → 4 | 175 | 3 | 15 |
| 4 → 5 | 225 | 4 | 20 |
| 5 → 6 | 300 | 5 | 25 |
| 6 → 7 | 400 | 7 | 30 |

Stage 7 stays final. Existing Stage, Stage XP, lifetime XP, identities and completed history are preserved; no downgrade, reset, backfill or retroactive charge occurs. Future eligibility uses the new thresholds. Development already reads these shared requirements, so its current Stage XP bar adopts them without a second table. Daily learning XP remains capped at 100; rewards and all non-XP gates are unchanged.

## Development and Stage chip

Remove the Learning priorities and evidence disclosure, priorities text, evidence ledger, pagination listeners and exclusive CSS. Underlying pathway classification, weighting, evidence and saved records remain unchanged. Other useful Pathways/Development sections, neural zoom and the XP bar remain.

Keep the 30-second Stage / 10-second “Demo is learning.” cycle. During the latter only, a CSS class pulses text opacity every 1.25 seconds. Returning to the Stage removes the class and restores ordinary opacity immediately. Reduced motion disables the pulse; the existing single timer/visibility/teardown behavior remains.

## Footer clickability: root cause

The absolute footer tagline occupied the full row across the links and appeared after the link navigation in DOM order. Its transparent box could intercept pointer events despite correct anchor destinations. Mobile CSS also explicitly hid the footer; real mobile visits additionally hide the entire game behind the desktop-compatibility screen. External read-only mode made all non-scene root controls inert and intercepted navigation events.

The decorative tagline now ignores pointer input. Footer navigation has an explicit accessible hit layer, focus indicators and sized anchor targets. Responsive layout reserves space above mobile navigation/input instead of hiding/overlapping the links. The compatibility screen clones the real public link navigation without starting mobile gameplay. External-view guards allow only the public footer links while keeping gameplay mutation controls locked. X remains `https://x.com/playmindling` with safe external attributes; DOCS remains `/docs`. No repository footer link returns.

## Technical public documentation

The static `/docs` page now centers on AI architecture, LLM roles, supported algorithms, knowledge persistence, grounded responses, reasoning limits and the planned progression toward a permission-aware personal agent. It uses restrained colored category/status tags, technical cards/process diagrams and responsive navigation. Numeric gameplay tables, internal testing environments and demonstration references are removed from public copy.

Available foundations are separated from in-development quality work and planned tool execution/integrations. The proposed `mindling.md` manifest is explicitly Planned, needs a compatible host/runtime/permissions/services, cannot transfer a whole model/memory database/credentials/runtime by itself, and must not export private data without consent. Existing readable Markdown profile snapshots are accurately distinguished from a runnable agent or complete export. No fake download or new agent runtime is added.

## Validation and limitations

**Tests were not run, as requested.** No browser automation, screenshots, builds, dependency installation or external model calls were performed. Review was limited to affected-source inspection, repository searches and diff review. Browser rendering/clickability, actual IndexedDB races and live inference compatibility remain unverified.

The configured model must support the existing strict structured-output contract. Quote/reference validation does not prove relevance, entailment or objective truth; Talk intentionally does not run the separate multi-phase cognitive evaluation. The new Talk UI needs manual verification for success, no knowledge, unavailable provider, stale context, duplicate callbacks, cancellation and depleted/bonus Energy. Orb timing/trail, mobile/public footer navigation and Stage-chip reduced-motion behavior likewise need manual browser review after normal deployment.
