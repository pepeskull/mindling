# Live research diagnosis after PR #110

## Evidence available

The inspected main commit is `e70447f` (PR #110). GitHub records its Production
deployment as successful. The reported manual request reached one completed
hosted tool call, one cited LaLiga source, the five evidence-stage work units,
and zero integrated memories. That establishes that information access ran;
it does not establish a dated fact or independently compared sources.

No production runtime logs, original response payload, initial autonomous task
code or private IndexedDB records were available. The additional message supplied
by the user was the generic paused reply. Consequently the exact original
candidate rejection and the initial pause reason cannot be recovered from these
observations alone. No paid API request or production data change was made.

## Confirmed defects and fixes

### Planning → paused, then no more autonomous work

The planner could ask a preference/focus question even for an automatically
selected broad orientation such as Technology. `MODEL_CLARIFICATION` paused that
task, while its conversational question was deliberately not displayed as a Talk
interruption for automatic work. The scheduler then rejected *every* new
opportunity if *any* task was nonterminal, including dormant clarifications and
insufficient-evidence outcomes. A handled pause could therefore deadlock the
learning loop without a console exception.

Automatic planning now explicitly identifies its context and asks the model to
select a bounded foundational question, rather than asking the user to choose an
optional learning focus. Genuine ambiguity in user requests still uses the
existing clarification flow. If a model still requests clarification, the saved
question remains inspectable and the task remains paused; it is not guessed or
marked learned. Settled outcomes do not prevent the next distinct opportunity
once the existing daily budget/cooldown allow it. Active work, pending integration,
retryable work within its budget, and missing provider configuration still gate
new work. No grant, counter or historical outcome is reset.

This is a confirmed reachable defect, not proof that the user's first task had
`MODEL_CLARIFICATION`. The new Settings reason and task inspector distinguish it
from interruption, access/configuration failures and other pauses.

### Settings: ERROR after manual insufficient evidence

The global status selected the newest task of any kind, then mapped `NO_EVIDENCE`
to `ERROR`. Thus a manual Talk research outcome could overwrite the apparent
state of an earlier paused automatic task. This was a status-selection defect,
not evidence that the original autonomous task crashed.

Active shared work still reports its actual phase. When idle, the automatic
status/reason comes from automatic tasks only. `NO_EVIDENCE` is a pause outcome;
service/protocol failures remain errors. The inspector retains the independent
manual result and all evidence limitations.

### Time-sensitive evidence and zero retained memories

Previously the evaluator could nominate only an exact report quote of 40–700
characters, and the ISO as-of date had to occur inside that same quote. A correctly
dated claim could be lost if the date was outside the selected substring or used
an unambiguous written month. The adapter also discarded every later paragraph
citing an already-seen URL. If the first paragraph was a general season
introduction, a later dated standings paragraph was unavailable to the evaluator.

The adapter now retains bounded distinct paragraphs for each retained citation
URL, with updated hashes. A selected quote must belong to one cited paragraph.
Its explicit as-of date can occur elsewhere in **that same paragraph**, including
an unambiguous ISO/English/Swedish calendar-date form. No date can be borrowed
from a neighbouring paragraph, a separate source, publication metadata, a season,
URL or retrieval time. Invalid, future and stale dates fail the existing current
fact checks; the two-day freshness window is unchanged.

For the original 5/7 result, `NO_EVIDENCE` could also mean no model candidate,
scope/type rejection, or a native conflict/duplicate/quality rejection. The old
code silently dropped these distinctions and hid saved evaluator limitations.
New tasks persist bounded rejection reasons, extraction counters, limitations,
and canonical rejection categories. A missing date is reported as such; absence
of a new memory is never converted into fabricated learning.

Older completed/blocked task records are preserved. Their missing diagnostic
information is not retroactively invented, and spent/unknown remote budgets are
not reset to rerun them automatically.

### One source despite a comparison plan

A saved plan was displayed but never supplied to the hosted-search request or
source assessment. Only topic/scope/queries were sent. The provider could finish
one search with one cited page; a comparison sentence in the displayed plan did
not force another query/source or prove that comparison occurred. Citation
validation, size caps and the first-paragraph-per-URL defect could additionally
limit retention. The observed source count alone cannot establish which uncited
or rejected sources were returned.

The bounded plan now reaches search and analysis. Search is instructed to seek
independent corroboration when requested and to report limitations honestly.
It still cannot guarantee a second usable source. Extraction diagnostics expose
actual tool source URLs, annotations, retained paragraphs and filter counts.
Uncited catalog URLs are never promoted to evidence. One authoritative source
can support a narrow dated fact; neither an independent comparison nor objective
"best team" is claimed without adequate evidence/criteria. Single-source claims
retain their uncertainty and tool-synthesis provenance.

### Two reserved units, one completed call

This is intentional. The browser durably reserves the allowed two-call ceiling
before sending a remote operation whose eventual cost may be unknown after
interruption. `max_tool_calls=2` is a ceiling, not an instruction to execute two
calls. One completed search can cite multiple pages. Completed actions are
recorded separately. Reservations are not displayed as actual charges and are
not refunded/reused automatically. All existing model/tool budgets, permission
revision checks, cancellation and billing protections remain.

## Verification

The regression fixtures contain invented club statements explicitly marked as
synthetic. They are not current standings or production source responses.

Node regressions cover automatic/manual status isolation, real error states,
nonblocking settled outcomes with unchanged budgets, all active phases, valid
single-source retention eligibility, date placement/formats, missing/stale/
publication/retrieval/season dates, cross-paragraph date rejection, repeated URL
paragraphs, two sources in one tool call, forwarded plans and content hashes.

Chromium uses the actual local server handler and real IndexedDB with synthetic
upstreams. It reproduces PLANNING → PAUSED followed by a manual 5/7 result,
missing-date diagnostics, one completed/two reserved, no false autonomous ERROR,
a dated single-source memory, later autonomous continuation, persisted inspector
reasons and unchanged identity/Origin DNA/permission/XP with no extra Talk charge.
The existing research, primary-storage and application-shell regressions also run.

No production source payload was replayed and no live/paid model or search call
was made. Source availability, factual accuracy, successful second-source
comparison and the exact original initial pause remain unverified. These fixes
do not waive those limits or classify model synthesis as independent fact checking.
