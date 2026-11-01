# SOURCE_EVALUATION contract repair

## What the incident establishes

The reported 2026-10-31 request reached source evaluation with upstream HTTP 200,
one completed hosted tool call and two retained cited sources. Its
`RESPONSE_PARSE_ERROR / VALIDATION_FAILED` is distinct from failure to search or
an upstream HTTP rejection. The original evaluation instructions requested a
follow-up question while the application required a restricted search-query
string. The structured schema also omitted several limits enforced afterward.

The code path is `research-acquire` → `research-information.search()` → seal
retrieved evidence → Chat Completions `SOURCE_EVALUATION` →
`validateSourceEvaluation()` → `validateAcquisition()` → browser validation →
evidence/freshness/scope checks → canonical memory transaction.

In the original completion parser, invalid JSON had a separate
`COMPLETION_JSON_INVALID` detail. A generic application-validation exception
instead became `VALIDATION_FAILED`, hiding the rejecting predicate. The incident
therefore points to post-JSON application validation, not a failed search. Its
exact rejected field is **not recoverable from that diagnostic alone**; no raw
Production assessment was available, and no paid inference was performed here.

## Confirmed contract defects

The schema previously accepted arbitrary strings for source IDs, quotes,
category, topic, reason, date and follow-up. Application rules were stricter:

- `nextQuestion === null || validQuery(nextQuestion)` rejects ordinary question
  punctuation such as `?`, URLs, unsafe terms and strings over 120 characters.
  One invalid optional question rejected every otherwise supported claim.
- `citedPassages(source).some(passage => passage.includes(claim.quote))`
  requires a contiguous exact quote in the specified source, not a paraphrase,
  another source's quote or a quotation spanning separately cited passages.
- Quotes must contain 40–700 characters. Category, topic, reason and each
  limitation have limits of 80, 100, 240 and 240 characters respectively, with
  nonempty trimmed text and no control/format characters.
- Non-null `validAt` must round-trip as a real ISO calendar date, occur as an
  explicit as-of date in the same passage containing the quote and not exceed
  retrieval time. Previously `observedAt` was not supplied to the evaluator.

The old validator aborted the whole assessment on the first failed predicate.
Thus structurally valid model JSON could discard independent valid evidence.
Reproductions cover punctuated questions, paraphrased/misattributed quotations,
unsupported dates and overlong metadata. These demonstrate code defects, not
which particular field occurred in the original Production response.

## Repair and exact rules

The source-evaluation schema now carries the existing field-length bounds, an
ISO date format pattern and an enum of the actual retrieved source IDs. The
instructions explicitly require an unchanged substring of one supplied passage,
exact source ID, all metadata bounds, and a public follow-up **search query** or
null. Retrieval time is supplied as context, never used to fabricate validity.

Server-side `selectSourceEvaluation()` independently applies the same evidence
predicates used by strict `validateSourceEvaluation()`. It drops an invalid claim
as a whole and retains other fully valid proposals without changing their
quotes, source IDs, dates or classification metadata. It never guesses a source,
normalizes a quotation or supplies missing support.

| Rule | Rejected condition |
|---|---|
| `CLAIM_FIELDS_INVALID` | Claim lacks exactly the required fields |
| `SOURCE_ID_UNKNOWN` | Referenced ID is not in retrieved sources |
| `QUOTE_FORMAT_INVALID` | Quote fails length, trimming or control-character checks |
| `QUOTE_NOT_IN_CITED_PASSAGE` | Exact quote is absent from every passage of that source |
| `CATEGORY_INVALID` | Category fails its existing text/length rules |
| `TOPIC_INVALID` | Topic fails its existing text/length rules |
| `REASON_INVALID` | Evidence assessment fails its existing text/length rules |
| `DATE_FORMAT_INVALID` | Date is not a real `YYYY-MM-DD` calendar date |
| `DATE_UNSUPPORTED` | Same containing cited passage lacks that explicit as-of date |
| `DATE_AFTER_RETRIEVAL` | Supported date exceeds source retrieval time |
| `FOLLOWUP_INVALID` | Optional follow-up cannot pass the existing query policy |
| `LIMITATION_INVALID` | Limitations fail existing text/length rules |
| `EVALUATION_FIELDS_INVALID` | Envelope shape, fields or array ceilings are invalid |

An invalid optional follow-up becomes null with a `FOLLOWUP_INVALID` diagnostic;
it is never rewritten into a different research request. Limitations may qualify
the whole assessment: invalid limitations still stop evaluation, rather than
silently erasing uncertainty. Invalid envelope shape or more than three claims
also remains a failure with a signed checkpoint when available.

If no claims survive, the HTTP operation returns a valid empty acquisition with
`execution.detail = INSUFFICIENT_EVIDENCE`. The browser retains the original
candidate/rejection counts and records `BLOCKED / NO_EVIDENCE`; autonomous status
is `PAUSED`. No model claim becomes canonical knowledge merely to complete a task.

## Attribution, diagnostics and recovery

Retained sources are still hosted-search-cited report summaries, **not raw page
quotations or independent factual verification**. Retained claims keep their
exact source reference and text; browser source hashing, quote hashing, current
fact freshness/scope checks and canonical transaction authorization are unchanged.
Research memory source URL, hash and unverified-synthesis provenance remain intact.

The existing correlated `mindling.research` event gains optional bounded
`validation` metadata: candidate/accepted counts, rejected claim indices and
allowlisted rule names, plus an optional follow-up rejection. It contains no
quotes, source IDs, URLs, dates, prompts, user content, raw model output or keys.
Structural failures carry the precise fixed rule in `detail`. The browser
validates this diagnostic shape and persists it with the task. Existing inspector
explanations use the rejection codes; no visual redesign is needed.

Signed evidence is still sealed **before** evaluation. Upstream interruption or
invalid whole-envelope metadata preserves the original checkpoint. Recovery
verifies the same HMAC, request scope and expiry and performs evaluation only;
it cannot dispatch another search. Diagnostics do not enter or mutate the signed
evidence. Older sources without separate passage metadata supply their existing
exact `text` as the single evaluator passage; saved data and signatures are not
rewritten. Forged/modified checkpoints remain rejected before model dispatch.

No search budgets, token limits, model/provider configuration, consent, Energy,
XP, schema versions, identities or existing memories are changed. No IndexedDB
migration is required. Normal and Stage Preview persistence remain isolated.

## Verification

- New Node suite: **25/25 pass**.
- Focused source-evaluation, hosted-search, live-diagnostic and checkpoint suites:
  **53/53 pass**.
- Full Node suite: **273 pass, 22 fail** (295 total). Unchanged main `c74aeeb` in a
  separate worktree: **248 pass, the same 22 fail** (270 total). Failing test names
  match exactly; no new failures. The existing failures cover older XP/progression
  assertions, taxonomy mapping and removed inspector markup.
- Three Chromium scripts pass: the new source-evaluation regression plus existing
  Production-502 recovery and live-research diagnostics regressions. All use the
  real local handler/client/engine and ephemeral IndexedDB with synthetic
  upstream only. The new script covers both primary and Preview stores,
  per-claim rejection, exact provenance, no acceptable claims, checkpoint reload,
  evaluation-only retry, no duplicate writes and unchanged Energy/XP on failure.
- Changed-source syntax inspection and `git diff --check` pass.

```sh
node --test tests/source-evaluation.test.mjs tests/production-research-502.test.mjs tests/autonomous-web-search.test.mjs tests/live-research-diagnostics.test.mjs
node --test tests/*.test.mjs
node tests/support/autonomous-web-search-server.cjs
# In another terminal:
python3 tests/source-evaluation-browser.py
python3 tests/production-research-502-browser.py
python3 tests/live-research-diagnostics-browser.py
```

The synthetic upstream refuses external targets. No paid model calls, dependency
installations, builds, screenshots or production-data changes were performed.

## Remaining Production verification

After normal review and deployment, separately authorize a bounded real research
run. Inspect its correlated `mindling.research` event: `validation.rejections`
identifies exact failed claim predicates; `metadataRejections` identifies an
unusable follow-up. An empty accepted set must produce insufficient evidence,
while mixed results may integrate only supported claims. Verify source references,
canonical deduplication, unchanged failure costs/rewards and analysis-only recovery
within existing budgets. Do not collect private raw output to diagnose a rule.

Mocked tests establish contract behavior and safeguards, not Production success.
