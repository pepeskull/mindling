# Autonomous learning: hosted web research

Mindling uses its existing inference configuration for planning and evidence
analysis, OpenAI's hosted `web_search` tool for information access, and its
existing canonical memory reducers and IndexedDB transactions for persistence.
There is no second model, separate agent, scraping proxy, additional database,
package installation, or client-side credential.

## Deployment configuration

On the existing Vercel project, configure:

- `SERVICE_API`: an OpenAI API credential, stored server-side only.
- `SERVICE_MODEL`: the existing model ID. The model/account must support both
  the existing structured Chat Completions requests and Responses `web_search`.
  A successful model lookup alone does **not** establish tool compatibility.
- `MINDLING_WEB_SEARCH=enabled`: explicit deployment opt-in to the billable tool.

The existing `/api/mindling/reason` function serves planning, capability checks,
and research acquisition. No new route or backend application is required.
Outbound requests go only to `api.openai.com`. No citation URL becomes a local
server fetch target. Hosted-tool network access is managed by OpenAI.
Unsupported model/account access, incomplete responses and rate limits are
reported as failures, without silently choosing a different provider/model.
Configure provider/project spend limits and the deployment's traffic controls;
application counters and per-instance rate limits are not an account-wide
billing firewall.

The request shape was checked against the official generated API definitions:
[web search](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/web_search_tool.py),
[tool actions](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_function_web_search.py),
[response parameters](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_create_params.py),
and [URL annotations](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_output_text.py).
These are reference documents; this project installs no SDK.

## One global control and scope

Settings provides **Enable autonomous learning**. Its new capability-specific
record does not inherit earlier planning or information grants. Existing grants
and historical research/source records are preserved. Enabling discloses model
and search charges and authorizes public-topic research, analysis and memory
integration while the app is active. It does not authorize publishing, purchases,
account changes or other external actions. Disabling aborts local work and fences
memory writes with the current permission revision inside the same IndexedDB
transaction. An already submitted remote operation may still be billed.

Only a short public topic, bounded search queries, explicit comparison scope and
retrieved research report are used by the research transport. Private memory
bodies, identity keys and wallet data are not sent to search. Only recognized taxonomy labels from canonical
categories/origin interests can suggest public learning orientations; arbitrary
private category labels are not exported by automatic scheduling. Conservative
local screening rejects obvious identifiers and private-topic patterns, but is
not a complete PII detector. Sensitive user requests need a sanitized public topic;
this is not approval of each search/source/memory.

## Execution

The existing learning engine owns all work:

1. Check local canonical knowledge and request scope.
2. Plan with the existing model; ask a conversational question only for material
   ambiguity, such as the criterion/league for a football comparison.
3. Invoke Responses with `tools: [{type: "web_search", external_web_access: true}]`,
   `tool_choice: "required"`, `max_tool_calls`, `store: false`, and the tool's actual
   source list included.
4. Require a completed hosted search and safe URL annotations bound to actual
   tool sources. A generic model response with invented links cannot qualify.
5. Analyze supported report passages using the same model, selecting bounded,
   exact report quotations and rejecting inadequate/conflicting evidence.
6. Hash and persist pending evidence before canonical integration.
7. Commit accepted claims using native memory validation, category assignment,
   existing neural-growth rules and pathway evidence hooks.
8. Expose retained knowledge to the existing conversation retrieval and provide
   clickable sources. Highlight stored neural associations after success.
9. Use a useful public follow-up question from the evidence analysis for the next
   bounded opportunity. With no follow-up, choose an unresearched current category
   or origin interest using the existing canonical graph distribution. The model
   plans the specific questions; orientation counts are not skill/gap proofs.

The engine's visible lifecycle is `IDLE → PLANNING → RESEARCHING → ANALYZING →
LEARNING → IDLE`, with `PAUSED`, `RATE_LIMITED`, `ERROR` and `OFFLINE`. Existing
persisted task states map onto those phases. Gray circles retain their existing
layout/colors and progress only from completed operations. Timer callbacks wake
eligible work; they never increment task progress.

## Evidence semantics

Hosted search exposes cited **model-generated reports**, not a raw full-text
archive or independent factual verification. Stored records explicitly carry
`web-search-supported-synthesis` / `tool-cited-unverified-synthesis`, uncertainty,
source URL/title/domain, retrieval time, response identifier, report hash, claim
hash, evidence text and category/topic. A quotation is an exact passage of that
report, not a purported verbatim quotation of the cited website. Only safe HTTPS
citations also present in tool actions are retained. Publication date remains
unknown unless actually available; retrieval time is never a publication date.

Current facts require an explicit valid as-of date in the same cited paragraph
as the accepted claim and freshness checks. The date may sit outside the selected
claim substring; dates from another paragraph, publication metadata or retrieval
time cannot supply that support. A report date is source-supported model interpretation, not an
independent freshness certificate. No table, price or answer is fabricated when
that evidence is absent. The same-model analysis is not independent cross-checking.

Exact claim hashes prevent repeated research results from creating extra
canonical memories. Native duplicate/conflict/quality/capacity rules reject other
unsafe candidates. Pending evidence, run ID and authorization must still match at
commit. Unsupported/conflicting claims are not automatically adopted as
corrections to current knowledge.

In the Memory learning-task inspector, retained research knowledge can be removed
or corrected explicitly. Removing prevents automatic reintroduction of that exact
claim hash and excludes it from current retrieval; historical source/task records
remain. A correction uses the existing Teach reducer and costs, marks the old
claim historical, and creates a user-provided replacement without falsely
attaching the original source's verification. Failed corrections roll back.

## Budgets, interruption and storage compatibility

- One local active task; two bounded workflow attempts.
- At most three automatically initiated tasks per UTC day, at least ten minutes
  apart. The daily counter/cooldown live in the existing Mindling record.
- At most two hosted tool calls, four inference requests and three accepted
  memories per task. Search reports use a low context budget and bounded output.
- Response streaming enforces a 192 KiB byte limit. Server requests have a
  45-second deadline; browser transport 55 seconds; workflow 120 seconds.
- Existing same-origin checks, per-instance/IP rate limits and two concurrent
  information operations remain. No arbitrary source proxy, cookies or source
  credentials are introduced.
- Reservations are persisted **before** requests. Interrupted/unknown remote
  work is not refunded or retried beyond its budget. Backoff is persisted and
  bounded; interrupted pending evidence integrates without new remote calls.
- Visibility/page exit/offline events cancel active work. Reload resumes eligible
  work only with a live matching identity and current authorization. Closed
  browsers do not execute research. Tasks that exhaust remote budgets without
  pending evidence remain honestly blocked.
- Automatic research awards **0 XP** and costs **0 Energy**. User-requested
  Talk/Teach/Deep Training preserve their existing one-time activity costs.
  Continuations, search, clarification and retries add no separate activity cost.
- Existing database versions/stores, identity keys, Origin DNA, categories,
  knowledge, pathway evidence and retained task/source history are preserved.
  Old tasks remain inspectable; submit their topic again for the new capability.

## Verification and limits

Local Node tests exercise the real request/validation code with synthetic
upstreams: API shape, source binding, failed/incomplete/oversized responses,
cancellation, unsafe citations, permission revisions and scheduling budgets.
Chromium integration exercises the actual HTTP handler, browser transport,
canonical reducers and real primary and preview IndexedDB stores, with an explicitly synthetic upstream and
external network blocked. It checks automatic initiation, persistence/reopen,
retrieval, deduplication, interrupted evidence recovery, cancellation/revocation,
research Energy/XP, and explicit corrections/removal. A shell smoke check covers
onboarding, view navigation and the single global control with the existing
Canvas fallback when the external 3D library is unavailable.

**No paid/live search or inference request was made.** No API credential is present
in the execution workspace and the user explicitly requested local verification
only. Deployment configuration, model/account compatibility, live source quality,
latency and a successful real hosted-search demonstration remain unverified.
This implementation must not be described as live-verified until that separate
check has actually succeeded. No build or dependency installation is needed.

For the production observations after PR #110, confirmed defects, bounded fixes
and remaining uncertainty, see [Live research diagnostics](live-research-diagnostics.md).
