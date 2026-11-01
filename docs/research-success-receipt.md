# Server COMPLETED versus browser interruption

## Confirmed defect and incident limits

Main `4ca80e0` includes PR #115 and #116. Its production path was:

1. Hosted search and source evaluation complete; server validates the acquisition.
2. Server logs `COMPLETED` and serializes HTTP 200.
3. Browser reads/parses the body and validates acquisition and request correlation.
4. Engine calls `assertLive()` and checks its AbortController.
5. Only afterward does the engine save the execution receipt, source references
   and pending evidence in IndexedDB.

An abort between steps 3 and 5 discarded a **received and validated success**.
The catch handler had no success receipt attached, marked hosted work unknown
and recorded `REQUEST_INTERRUPTED / RESEARCHING` with zero sources. Successful
responses also omitted the source checkpoint that the server had already signed;
only error responses exported that recovery boundary.

This is reproduced with the unchanged main engine/client and a mocked
23,087-ms success: HTTP 200, `COMPLETED`, three accepted claims, then an abort
after body receipt yields zero registered sources/memories and `outcomeUnknown`.
The patch saves the same result before later activity checks and pauses only its
integration. A separate reproduction drops the response after server completion:
that correctly remains an unknown client outcome.

**The exact Production sequence is not proven.** The supplied server event
(`117525ff3742ac8aeb1ad943c83ec396bda3b0ae070c61760c8469898002ba91`)
does not establish browser receipt. Visibility/pagehide/offline aborts, client
deadline, connection loss or document destruction could occur before receipt.
The server takes 23 seconds, below its 45-second application deadline and the
browser's 55-second request deadline, but those durations exclude delivery delay.
No live inference or Production browser trace was available.

## Focused fix

The same handler, transport, engine and IndexedDB stores remain in use.

- Successful source-bearing responses include the **existing** signed,
  pre-evaluation source checkpoint. Its HMAC format, scope, expiry and remote
  verification requirements are unchanged.
- The browser requires the execution receipt and validates correlation,
  operation, counters, acquisition, limitations and checkpoint/source/scope
  correspondence. A stale or malformed envelope cannot supply knowledge.
- A small receipt transaction saves that signed evidence, accepted evaluation,
  received/authorized timestamps and actual execution counters **before**
  visibility/abort checks, asynchronous evidence checks or integration. It is
  fenced by identity, run, request ID, terminal state and the existing consent
  revision check. Cancelled or changed owners cannot be revived by late results.
- Received evaluation metadata is a local continuation of an already accepted
  same-origin result, not a claim of independent verification. Stored evaluation
  and sources are validated again during recovery. Browser source hashing,
  scope/date checks and canonical authorization still precede memory creation.
- A paused received result resumes **locally**, without another search or model
  completion. A source-only checkpoint from a server evaluation failure still
  uses the existing bounded `research-evaluate` path and server HMAC verification.
- After checks, pending canonical evidence replaces the compact receipt in one
  transaction. Full report passages remain available; a second identical
  concatenated excerpt is not added alongside those passages. Existing storage
  size limits and source/text limits are unchanged.
- Source freshness is checked against the current browser time on continuation;
  provenance timestamps, exact quotes, dates, URLs and hashes remain unchanged.

Task fields are optional additions to existing records; no DB version change,
migration, reset, canonical-memory rewrite or new persistence subsystem.
Existing pending evidence can resume without spending another remote attempt.
Model/provider configuration, tokens, consent and hosted/inference ceilings are
unchanged. No onboarding, Origin DNA or neural-rendering changes.

## Precise diagnostics

Server diagnostics remain separate from browser diagnostics. A server
`COMPLETED` event describes server work, not client acknowledgement. Serialization
failures now identify `RESPONSE_SERIALIZATION_ERROR / RESPONSE_SERIALIZATION_FAILED`.

| Browser code | Boundary |
|---|---|
| `TRANSPORT_INTERRUPTED` / `TRANSPORT_TIMEOUT` / `TRANSPORT_FAILED` | No complete response confirmed by the client operation |
| `RESPONSE_PARSE_FAILED` | Complete body is unreadable or exceeds the response bound |
| `RECEIPT_VALIDATION_FAILED` | Envelope, source contract, request correlation or counters fail |
| `CHECKPOINT_VALIDATION_FAILED` | Signed checkpoint shape, scope or source correspondence fails |
| `CHECKPOINT_PERSISTENCE_FAILED` | Received evidence transaction cannot commit |
| `EVIDENCE_VALIDATION_FAILED` | Source integrity check fails |
| `EVIDENCE_PERSISTENCE_FAILED` | Later evidence transaction fails; prior received evidence remains |
| `INTEGRATION_PAUSED` / `INTEGRATION_FAILED` | Received work is known; canonical integration is paused or failed |
| `STALE_RESEARCH_RESPONSE` | The response no longer owns this identity/run/task |

The bounded browser record contains correlation ID, operation, fixed phase/code,
HTTP status, body-confirmed/receipt-validated flags and an allowlisted abort reason.
“Validated receipt” means the envelope/source contract matched, not verified truth;
later integrity and canonical checks remain mandatory. No source text, private
memory, prompt, arbitrary exception message, provider identity or key is logged.
The inspector displays server and browser records separately and labels earlier
request diagnostics as previous records.

On navigation/reload without a durable receipt, recovery cannot infer that a body
arrived before document destruction. It records a conservative unconfirmed
transport outcome, preserves reservations and cannot repeat search. A fully
received success is never converted to unknown merely because integration paused.

If evidence storage fails but minimal diagnostic storage still works, completed
remote work stays known while the task reports the persistence failure. If all
writes fail, a privacy-safe console event and matching in-memory status expose the
failure. Durable recovery cannot be promised when no evidence transaction commits;
no replacement receipt or extra paid call is fabricated.

## Verification

- New Node suite: **25/25 pass**. All scenarios use a mocked server clock spanning
  23,087 ms, three cited sources and three accepted claims.
- Focused Node suites: **102/102 pass**, including previous source-evaluation,
  limitation, hosted-search and checkpoint regressions.
- Full Node: **322 pass, 22 fail** (344 total). Unchanged main `4ca80e0`:
  **297 pass, identical 22 fail** (319 total); failing names match exactly.
  Existing failures concern earlier XP/progression assertions, taxonomy mapping
  and removed inspector markup; none are changed to make this patch pass.
- New Chromium script: **34 scenarios pass** (17 each with real primary and
  Preview IndexedDB). The first normal-store success includes a real **23.087-second
  local fixture delay**. Tests use the actual local handler/client/engine and
  explicit synthetic upstream only.
- Five existing Chromium scripts pass: source evaluation, limitation recovery,
  Production-502 recovery, live diagnostics and autonomous web search. Existing
  assertions are updated to distinguish missing-response transport interruption
  from an injected integration failure with known received evidence.
- Changed JS/Python syntax inspection and `git diff --check` pass.

Coverage includes successful receipt, abort after receipt, hidden/offline events,
missing or interrupted bodies, deadline, parsing, stale IDs, malformed checkpoints,
receipt/evidence/integration transaction failures, fully unavailable storage,
cancelled/changed owners, revocation and actual document navigation/reopen.
Recovery makes no repeated hosted call; existing canonical records, identity,
Energy and XP remain unchanged on failures. No paid calls, installs, builds,
screenshots or Production data changes were performed.

Run the local fixture server before browser scripts. It rejects external fetch
targets; `MINDLING_TEST_PORT` and `MINDLING_TEST_URL` allow isolated fixture processes.
Run browser suites sequentially when sharing one fixture server's controls.

## Production verification

Deploy the handler and browser modules together through normal review/release.
Separately authorize a bounded real Gaming task in an isolated/new profile.
Correlate the server event with the persisted execution ID and browser diagnostic;
do not copy private bodies into incident reports.

Confirm three stages separately: server completion; local saved source/evaluation
receipt; canonical integration. Hide/restore the page after receiving evidence and
confirm local continuation without another `research-acquire` or inference call.
A response lost before receipt must remain unknown with its original reservation.
If a client failure occurs, its new phase determines whether transport, parsing,
correlation, persistence or integration failed. Verify exact source provenance,
unchanged limits and no failure costs/rewards or duplicate memories.

Mocked success and the baseline reproduction do not prove live Production recovery.
