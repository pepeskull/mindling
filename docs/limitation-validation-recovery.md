# LIMITATION_INVALID: representation and failure recovery

## Confirmed diagnosis

The reported request (`028f4bcd052c5335385648a4b65d3be2cd21ecb1bb71dd91271a02834cfa80c3`)
completed two hosted tool calls, retained two sources and received HTTP 200 from
source evaluation. `selectSourceEvaluation()` then rejected a limitation through
`text(item, 240)`. Search and model availability were not the failing phase.

That helper combined several rules: nonempty string, no surrounding whitespace,
no Unicode control/format characters, and at most 240 **UTF-16 code units**.
The schema specified only string length, measured in **Unicode code points**.
Consequently schema-conforming material qualifications could fail the application
because of formatting or supplementary Unicode characters. Direct comparisons
against unchanged main reproduce these failures.

The incident does not identify the original rejected string or subrule. It does
not prove that the provider ignored `minLength`/`maxLength`: valid-length whitespace
or formatting alone could trigger this failure. No raw Production evaluation or
authorized live inference was available, so actual endpoint enforcement remains
unverified. Mocked tests check the outgoing strict schema and independently
exercise its boundaries; they do not establish provider reliability.

## Representation policy

`research-limitations.js` defines one server/browser limitation policy. Accepted
strings remain **exactly unchanged**. There is no trimming, whitespace collapse,
truncation, Unicode removal, classification fallback or dropped qualification.

| Value | Result |
|---|---|
| Meaningful text with surrounding spaces, NBSP, CR/LF or tabs | Retain verbatim |
| 1–240 Unicode code points | Within the declared character bound |
| Supplementary Unicode characters | Count as code points, consistent with JSON Schema |
| Empty or whitespace-only string | Reject: `BLANK`; schema/prompt require `[]` for no limitations |
| Non-string | Reject: `NOT_A_STRING` |
| More than 240 code points | Reject: `TOO_LONG` |
| Other controls, hidden format characters or unpaired surrogates | Reject: `UNSAFE_CHARACTERS` |

The schema keeps its 1–240 character limit and adds a simple non-whitespace
pattern. Instructions clarify `[]` versus empty placeholders, permissible layout
whitespace, Unicode character bounds and preservation of every material
qualification. The application still checks unsafe Unicode independently. No
increase to model tokens, search calls, inference calls or activity budgets.

An unrepresentable limitation still stops the entire assessment. Because it may
qualify all claims, it is never silently erased to permit storage. The response
retains `RESPONSE_PARSE_ERROR / LIMITATION_INVALID` and includes a bounded
`limitationFailure` with only index, fixed subrule and code-point count (or null
for non-string). No text, code-point values, source content, keys or prompts are
logged. The original pre-evaluation signed source checkpoint remains available.

PR #115's independent claim validation is unchanged. After valid limitations,
each claim still needs its exact source ID, contiguous cited quotation, metadata
and supported dates. Unsupported claims are rejected separately; retained
memories remain unverified, source-attributed syntheses.

## Browser discrepancy

The exact delivery/lifecycle sequence behind the original
`REQUEST_INTERRUPTED · RESEARCHING` display cannot be established from a server
log alone. A server may finish after the browser aborts without receiving its
body. The browser must not manufacture a known server category in that case.

The investigation found concrete error-loss paths:

- A connectivity change could override an already received, correlated server
  error with the browser's offline state.
- If source-checkpoint shape validation threw while processing an error response,
  the received server error/diagnostic was discarded too.
- Recovery and inspector presentation could rely on generic interruption fields
  instead of an existing matching source-evaluation receipt.

The received diagnostic now takes precedence over local interruption/offline
classification. An invalid checkpoint is refused without discarding the original
server cause; recovery is marked `CHECKPOINT_INVALID`. Reload recovery restores
the server category/phase only when its validated correlation ID and operation
match the saved request receipt. A stale response from another run cannot
diagnose the new run. The task inspector displays category, source-evaluation
phase and rule together. Identity/run/cancellation guards remain in place.

If no valid server diagnostic was received, real interruptions remain unknown
and reserved work is not refunded or repeated. This patch cannot recover a
response body the browser never obtained.

## Recovery and compatibility

The existing HMAC, scope, expiry and source-checkpoint format are unchanged.
Within the original remaining inference budget, recovery performs
`research-evaluate` against the signed sources, never a second web search.
The Gaming fixture reaches two completed / two reserved tool calls and three
reserved inference calls at failure; recovery uses the fourth inference call.
No automatic retry is allowed beyond the existing ceiling.

Failure saves no canonical knowledge and changes no Energy/XP. A successful retry
retains only supported claims, preserves the complete accepted limitations and
uses existing canonical deduplication. Existing identities, consent, records and
normal/Preview isolation remain unchanged. No IndexedDB migration or reset.

## Verification

- New mocked Node suite: **24/24 pass**.
- Focused limitation/source-evaluation/checkpoint/hosted-search/live-diagnostic
  suites: **77/77 pass**.
- Full Node suite: **297 pass, 22 fail** (319 total). Unchanged main `bef5965`:
  **273 pass, the identical 22 fail** (295 total). Failing names match; no new
  failures. Existing failures concern older XP/progression expectations, taxonomy
  mapping and removed inspector markup.
- Four Chromium regression scripts pass with synthetic upstream only. The new
  Gaming script exercises the actual local handler/client/engine/inspector with
  primary and Preview IndexedDB: empty initial knowledge, autonomous Gaming
  selection, two calls/two sources, accurate error propagation despite an offline
  signal, matching-receipt recovery, checkpoint reopen, evaluation-only retry,
  verbatim qualifications, mixed-claim validation, unchanged failure costs/rewards,
  no duplicate knowledge and sandbox isolation.
- Changed-source syntax inspection and `git diff --check` pass.

```sh
node --test tests/limitation-recovery.test.mjs tests/source-evaluation.test.mjs tests/production-research-502.test.mjs tests/autonomous-web-search.test.mjs tests/live-research-diagnostics.test.mjs
node --test tests/*.test.mjs
node tests/support/autonomous-web-search-server.cjs
# In another terminal:
python3 tests/limitation-recovery-browser.py
python3 tests/source-evaluation-browser.py
python3 tests/production-research-502-browser.py
python3 tests/live-research-diagnostics-browser.py
```

No paid calls, dependencies, builds, screenshots or Production data changes.

## Production Gaming verification still required

After review/deployment, separately authorize a bounded real run. With a fresh
empty Mindling whose selected interests include Gaming, enable autonomous learning
and wait for its normal eligible opportunity. Confirm that the public research
topic is Gaming; inspect the correlated request and persisted task receipt.

A successful task must retain actual cited evidence, only fully accepted claims,
complete meaningful limitations and unverified source provenance, with 0 XP from
research. Failure must display `RESPONSE_PARSE_ERROR · SOURCE_EVALUATION ·
LIMITATION_INVALID`, plus a safe subrule/count, preserve the signed checkpoint and
leave knowledge/Energy/XP unchanged. Allow the existing bounded recovery when
authorized and confirm it uses `research-evaluate`, no further search and no
additional reservation. If bounds are still violated by real model output, use
the new metadata to establish which rule failed; do not loosen limits or discard
qualifications to force success. A task can correctly remain blocked when safe
evidence or representation is unavailable.

Mocked success is not live Production verification.
