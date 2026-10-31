# Teach / Deep learning 502 investigation

## Incident and limits of the diagnosis

The reported Production request on 2026-10-31 returned 502 after 5.99 seconds,
after a model-resource lookup and a Chat Completions request. That duration does
not establish a function timeout. The original upstream HTTP status, completion
envelope and assessment were not available in this workspace. No Vercel log
connector or authenticated Vercel CLI was available. No paid inference was run.

**Confirmed code defect:** on main `b975368`, `validateAssessment()` reserved each
referenced target exclusively, including read/reinforcement and new association
operations. A valid Deep assessment containing `REINFORCE_EXISTING(known)` and
`LINK_TO_EXISTING(known)` for two distinct statements failed this reservation
check. The learning handler converted that validation error to 502
`ANALYSIS_INVALID`. A direct comparison reproduces rejection on unchanged main
and acceptance of the identical assessment with this patch.

This explains a concrete failure of the supplied Deep scenario. It does **not**
prove what assessment or upstream error occurred in the reported incident, or
establish the exact cause of its Teach failure. Those require Production metadata.
The original handler hid HTTP rejection, unreadable JSON and assessment-validation
details behind generic errors. It also did not inspect completion finish reasons
or model refusals, so a truncated/refused answer looked like an ordinary invalid
assessment. These diagnostic and response-contract defects are addressed here.

## Shared request path and fix

Both normal `MindlingApp.submitInput()` and Stage Preview's controller use
`teachMemory()` → `requestLearningAssessment()` → `/api/mindling/learn` →
`mindling-learning.cjs`. Both validate before calling the existing canonical
transactional reducer. Each caller still owns its separate storage and lifecycle.

The assessment schema, provider configuration, model ID, strict structured-output
request, 2,600 completion-token budget, 12-second application deadline and request
rate limit are unchanged. A successful model-resource lookup confirms that ID
exists for the credential; it does not prove Chat Completions / strict-schema
capabilities. An unsupported schema or parameter is now distinguishable from a
post-response validation failure. There is no alternate model, lexical fallback,
automatic inference retry or additional chargeable call.

The batch validator permits distinct new links to the same current memory and
one reinforcement of that anchor, in either order. It still rejects repeated
reinforcement within a batch, conflicting writes, duplicate normalized new
claims, unknown IDs, inappropriate updates, insufficient confidence and unsafe
mixed batches. Preference updates to distinct legacy parts keep their existing
behavior. The prompt explains the compatible operations and treats ordinary
“remember” / “connect” directives as non-retained instructions, while retaining
the rejection of actual safeguard-bypass attempts.

Teach can create the supplied definition. Deep can preserve that definition,
reinforce it and create a reciprocal association to the distinct crystal-energy
claim. Repeated knowledge reinforces rather than creating duplicates. A failure
returns before the existing learning transaction: no canonical writes, processing
marker, Energy cost or XP award. The same event can be explicitly retried after
failure; successful events remain replay-protected.

No IndexedDB migration, reset or rewrite is required. Existing identities,
memories, provenance and confidence metadata remain intact. There are no changes
to pathways, specializations, research, rendering or onboarding.

## Response handling and privacy

The learn-only response reader bounds the upstream body, rejects unreadable
JSON, refusals, truncated / unexpected completion endings, missing content and
invalid assessment JSON. String content and supported text-part arrays remain
compatible. The full existing assessment validation then runs on server and
client before mutation; no required fields or confidence safeguards are removed.

Failure responses preserve existing `error.code` values and add a validated,
correlated diagnostic. Vercel receives a JSON `mindling.learning` event with:

- Correlation UUID, phase, endpoint kind, upstream HTTP status and elapsed time.
- Fixed error category and validation / parsing reason; safe finish reason.
- Whether the configured model resource was confirmed.
- A format-checked upstream request reference, when available.
- Allowlisted upstream error codes and parameter roots for configuration failures.

Logs never include prompts, candidate memories, model output, refusal text,
provider error messages, configured model identifiers or API keys. Client errors
use a neutral explanation and request reference, not provider content. Aborts
cancel upstream work and listener/timer cleanup runs in `finally`.

The Talk research `VALIDATION_FAILED` route uses a separate parser and research
contract. No shared implementation-level cause was established; that route and
its transport are unchanged.

## Verification

The new Node suite uses real Fetch `Response` envelopes, v3 statement batches,
`finish_reason`, refusal cases and the actual exported handler through the
shared Teach/Deep service. Earlier synthetic fixtures commonly returned complete
v2 JSON without finish metadata and did not cover reinforcement plus a link to
the same anchor.

Run:

```sh
node --test tests/teach-deep-502.test.mjs
node --test tests/*.test.mjs
node tests/support/teach-deep-502-server.cjs
# In another terminal:
python3 tests/teach-deep-502-browser.py
```

The local server refuses all external network targets and uses synthetic
credentials and explicitly authored assessments. Chromium drives the real `/`
and `/?stage-preview=1` controllers, HTTP handler and isolated IndexedDB stores.
It checks Teach creation, Deep extension/reinforcement, failure rollback,
explicit retry, repeated Deep without duplicate memories/cost/rewards, reload
persistence and Stage Preview isolation. Node additionally covers concurrent
event replay, missing fields, invalid targets, conflicting operations, HTTP
errors, parsing limits, truncation/refusal, model lookup and serialization errors.

The existing Stage Preview assertion is updated to permit the explicitly requested
safe upstream HTTP status, while continuing to forbid the raw provider message.
No XP, Energy or historical-test expectations are changed to make tests pass.

Recorded local results:

- New incident suite: **19/19 pass**.
- Focused incident/shared-learning/API-routing/native-memory/Energy/event suite:
  **60/60 pass**.
- Full Node suite: **248 pass, 22 fail** (270 total). Unchanged main `b975368`
  in a separate worktree: **229 pass, the same 22 fail** (251 total).
  Comparing failing test names gives no new failures or baseline-only failures.
- Chromium: the single integration script passes both actual application URLs
  with synthetic upstream responses and real, ephemeral IndexedDB.
- Changed JavaScript/Python syntax and `git diff --check`: pass.

Existing main failures remain in `auto-evolution-morphology` (2), `growth-balance`
(1), `memory-intelligence-v2` (6), `network-energy` (3),
`preview-energy-atomic` (4), `project-invariants` (1), `sandbox-engine` (4), and
`stage-preview-learning-service` (1). They cover older XP/progression assertions,
taxonomy mapping and a removed inspector's markup. They are outside this patch;
the six memory-decision cases and the Stage Preview case still fail their older
XP assertions on both branches.

## Production verification still required

After deploying this branch through the normal review/release process, an
authorized operator should repeat Teach and Deep using the supplied Veloria
inputs. This involves paid inference and was **not** performed here.

1. Capture the learning error's request reference and matching
   `mindling.learning` log event. Correlate it with the Vercel request ID.
2. Inspect `phase`, `upstreamStatus`, `reason`, `finishReason` and the allowlisted
   upstream code/parameter. `MODEL_CHECK` failures differ from Chat HTTP rejection;
   `OUTPUT_TRUNCATED` differs from JSON errors and assessment-validation reasons.
   Do not copy private prompts or raw output into issue reports.
3. If the upstream rejects a model/parameter/schema, verify the existing configured
   model's documented capabilities; do not silently switch providers, loosen the
   schema or increase budgets. The resource lookup alone cannot verify support.
4. Confirm one supported definition is retained; Deep preserves it and links only
   the new claim. Check repeated inputs do not duplicate memories or rewards.
5. Confirm failures leave canonical knowledge, Energy and XP unchanged, and an
   explicit successful retry writes once. Confirm Preview remains isolated.

Mocked success demonstrates the repaired path and failure protections, not live
Production availability or the original upstream response contract.
