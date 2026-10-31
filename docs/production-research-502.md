# Production research HTTP 502: diagnosis and verification

## Incident evidence and limits

The baseline is main `e7dd774`, after PR #111. The two incidents reported for
30 October 2026, 22:35:31 and 22:45:02 GMT+1, used the existing reasoning route
in `iad1`, with a 60-second Vercel maximum. Durations were 19.84 and 14.80 seconds.
No original Responses/Chat Completions bodies or additional runtime logs were
available. The workspace has no model credential/configuration, and no paid/live
model call was made. The exact upstream failure therefore remains unproved.

### A: models → responses → completions, then 502

In this repository, the completions POST after Responses is **source evaluation**,
not a fallback. That branch is reached only after the adapter accepts a completed
hosted operation and at least one cited source. A failure here can be an HTTP
error, response-body/network failure, incomplete/invalid JSON, identity redaction,
or a source-evaluation schema/evidence validation failure. Request traces alone
do not prove that any individual HTTP request succeeded, and the exact deployed
code must be checked against the deployment before applying this inference.

The confirmed defect is that all search progress was returned only after source
evaluation succeeded. A later failure discarded successful source counts and
public evidence at the browser boundary. The browser had already reserved the
whole tool ceiling. Its automatic retry eligibility checked remaining **model**
budget but not remaining **search** budget; the second attempt could replace the
original failure with `BUDGET_EXHAUSTED` before issuing another upstream request.

The fix returns safe execution receipts even on errors. When retrieval really
succeeded, its public source evidence is returned in a ten-minute HMAC-signed
checkpoint. The checkpoint survives IndexedDB reload and permits only analysis
through the same handler/model. A retry reserves one remaining model request,
not another search. The server verifies the signature, expiry, request scope,
source hashes/shape and bounded original evidence before model dispatch. It
cannot be used to fabricate source-backed claims, change the objective or expose
the API key. Account-key rotation or expiry invalidates the checkpoint safely.

The inference/tool ceilings stay at four and two. If analysis fails again, there
is no further automatic retry. Unknown remote work is never refunded. A saved
pending canonical integration can still finish locally without another paid call.

### B: models → responses, no completions

`INFORMATION_NO_SEARCH` previously covered missing calls, too many calls, any
noncompleted call, or absence of an action literally named `search`. The old
parser rejected documented `open_page`/`find_in_page` hosted-tool actions even
when they completed and supplied validated citations. That is a confirmed parser
defect. It is fixed without accepting uncited messages or weakening URL/date/
claim validation. A completed hosted web action is required; it need not perform
an artificial second search merely to have the literal `search` action name.

The reported code alone cannot prove which old predicate failed. New diagnostics
distinguish `NO_TOOL_CALLS`, `TOOL_NOT_COMPLETED`, `UNKNOWN_TOOL_ACTION`,
`TOOL_BUDGET_EXCEEDED`, incomplete output and invalid bodies. Confirmed completed,
failed and unknown work remain distinct, including partial responses. There is
no model-knowledge fallback for a failed or uncited hosted operation.

### Timing, HTTP errors and model configuration

The application deadline is 45 seconds, browser transport 55, workflow 120 and
Vercel maximum 60. None was increased. The two observed sub-20-second executions
do not establish a Vercel maximum timeout. A caught deadline now reports
`UPSTREAM_TIMEOUT`; client/disconnect aborts report `REQUEST_INTERRUPTED`.

The reasoning integration's caught 502 paths include upstream HTTP errors,
network/body-stream errors, invalid/incomplete Responses or completion payloads,
unsupported tool/request parameters, no completed hosted action, and validation
errors. Invalid model/configuration is separated as 503; rate limits are 429;
application deadlines 504; a disconnected request is 499 when a reply is possible.
An invalid/expired signed checkpoint is 400 and is rejected before model dispatch.
Ordinary evidence insufficiency still returns a successful bounded research
result with no accepted memories, not a fabricated answer.

`SERVICE_MODEL` is used verbatim as the upstream ID. There is no display-name alias
resolution and no hidden model substitution. A GET request recorded in Vercel
is not evidence of success. For the baseline code path to reach Responses, the
model GET must have returned the configured ID; this proves neither hosted-tool
support nor structured-output support. The new log records only `modelConfirmed`,
not the model identifier. Verify the deployment's intended upstream ID/account
permissions with its owner; do not assume the supplied model string is either
valid or invalid from its spelling. Keep `SERVICE_API` server-side.

## Task identity, status and accounting

Same-task updates are already guarded by identity/run IDs inside the existing
IndexedDB transaction. Those fences are preserved. The local active request is
now shown with its task topic, including the handoff before a persisted phase
update. An older automatic task no longer supplies its phase while another
request is active. Different queued tasks may legitimately show RESEARCHING for
one task and PLANNING for the next; the UI now identifies that boundary. Source
analysis has its own operation on recovery and is labelled ANALYZING. A manual
Talk result still does not diagnose an idle background engine.

Each new tool reservation stores a bounded execution receipt:

- `RESERVED`: durable ceiling, before browser dispatch.
- `DISPATCHED`: browser request submitted; hosted outcome not yet confirmed.
- `COMPLETED`: server confirms hosted work, even if later source analysis failed.
- `FAILED`: server confirms a failed hosted action/rejected operation.
- `OUTCOME_UNKNOWN`: transport/interruption leaves remote work uncertain.

Client dispatch and confirmed upstream dispatch are distinct. Completed/failed
counts are not billing totals. Reservations persist on 502 and interruption;
there is no automatic refund or increase. Retry preflight prevents another search
when its ceiling is already reserved and preserves the original diagnostic rather
than replacing it with a budget error. Old records without receipts remain valid;
missing historic facts are not invented. Existing exhausted tasks are not reset.

## Safe diagnostics

Research failures/log summaries contain only fixed, validated metadata:
correlation ID, operation, phase, endpoint kind, upstream status, optional upstream
request reference, category/detail, duration, model-lookup confirmation, whether
hosted work was requested/dispatched/confirmed, bounded counts, and
`fallbackReason: none`.

Categories include `UPSTREAM_HTTP_ERROR`, `UPSTREAM_NETWORK_ERROR`,
`UPSTREAM_TIMEOUT`, `MODEL_UNAVAILABLE`, `TOOL_UNSUPPORTED`, `INVALID_REQUEST`,
`RESPONSE_PARSE_ERROR`, `NO_SEARCH_EXECUTED`, `NO_CITABLE_EVIDENCE`,
`BUDGET_EXHAUSTED` and `REQUEST_INTERRUPTED`; existing rate-limit conventions remain.
The browser validates correlation/operation before accepting receipts. Raw
upstream error messages, headers, model IDs, keys, prompts, full responses and
conversation contents are never logged. Signed checkpoints contain only the
already authorized public research topic/report, never private memories or keys.
They prove provenance, not independent factual verification or permission for an
external action. Memory integration still requires the current local grant/run.

## Verification performed

Mocks exercise the actual reasoning handler and transport. Tests cover successful
hosted research; both incident paths; failed source analysis; analysis-only
recovery; tampered/expired checkpoints; HTTP, model, tool, JSON, network and
deadline failures; completed open/find actions; no uncited fallback; safe logs;
and budget preflight. Chromium uses the real handler, browser client and IndexedDB
with an explicitly synthetic upstream and external network blocked. It verifies
reload/recovery without a second search/reservation, preserved original errors,
unknown interruptions, and unchanged identity, Origin DNA, Energy and XP. Existing
research/primary-database/onboarding/navigation checks are also exercised.

The complete Node suite was run and compared against an untouched worktree of
main: **242 tests, 220 pass, 22 fail** here; **233 tests, 211 pass, 22 fail** on main.
All 22 failing test names match. They cover older XP/evolution/learning/UI assertions
and were not changed in this scoped fix. The relevant selected suite is **62/62**.
These results must not be represented as a clean full-suite pass.

## Exact Vercel Production verification steps

These steps are a deployment runbook, **not executed here**. Steps that send model
requests require explicit authorization for the resulting billable task(s).

1. Review/merge the PR manually when approved, let the normal deployment finish,
   and record its commit/deployment ID. Confirm it contains these changes; do not
   diagnose a different deployment using this source.
2. In the Vercel project, verify server-side `SERVICE_API`, the intended actual
   upstream `SERVICE_MODEL`, and `MINDLING_WEB_SEARCH=enabled`. Do not copy key
   values into logs/chat/browser. Keep the current duration and research budgets.
3. Open the existing Mindling without resetting IndexedDB. Keep its existing
   autonomous-learning grant. With the app visible, allow its next eligible
   automatic opportunity (respect the daily cap and cooldown). Record the task
   topic and request reference from Memory → Learning tasks.
4. In Vercel Runtime Logs for `/api/mindling/reason`, filter the JSON event
   `mindling.research` by that correlation ID. Confirm `modelConfirmed`, actual
   upstream status/endpoint/phase, and completed/failed/unknown hosted counts.
   A visible models GET alone is insufficient. A successful cited research result
   must include actual hosted completion, accepted source-backed memories and
   later retrieval, with 0 automatic research XP/Energy.
5. Separately authorize a Talk research check, such as the selected current LaLiga
   standings criterion. Record that task's own ID/reference and verify its one-time
   Talk charge is not repeated. A dated supported answer may be retained; if the
   real source lacks the required as-of evidence, the correct result remains
   insufficient evidence. Do not manufacture a league leader to pass the check.
6. If a genuine transient source-analysis failure occurs, confirm the task reports
   the analysis phase/upstream status, the already completed hosted count and its
   signed checkpoint. Reload while still authorized. At most one remaining analysis
   request may run (`research-evaluate`); there must be **no new `/responses` call**
   for that recovery and no tool reservation above 2 or model reservation above 4.
   Forced failures belong in the supplied local/Preview fixtures, not Production.
7. For a no-tool/protocol/configuration failure, capture only the safe diagnostic
   JSON and request reference. Confirm 0 unsupported memories and no automatic
   search retry beyond the reserved ceiling. Do not clear counters/history to force
   success. A new, separately authorized request may be needed after configuration
   repair or checkpoint expiry.
8. Compare identity, Origin DNA, previous memories, Energy/XP and task history.
   Confirm Settings identifies the active task and does not borrow a different
   manual/background task's phase. Revoke access normally when desired.

Still needed to diagnose the original deployment conclusively: correlated actual
upstream HTTP statuses, Responses status/action types/counts, completion finish/
parse/validation category, and deadline/cancellation flags. The new safe logs
provide these distinctions without exposing private payloads. Live API/account
compatibility, source quality and a successful real end-to-end run remain
unverified. No change in this PR declares them operational without that evidence.
