# Intelligent Input Understanding and Autonomous Learning

This milestone connects existing browser gameplay, canonical learning, retrieval,
persistence and the Memory graph. It adds no backend, provider, database, schema,
package or rendering dependency. No model calls were made during implementation.

## Input interpretation

`understandInput` is a bounded, versioned, read-only interpretation service used
by production and isolated Preview Teach/Deep Training/Talk. Selected UI mode
remains authoritative. Explicit fact teaching keeps its existing native or Preview
service path; recognized topic instructions create tasks instead of factual
memories. Talk does not switch into teaching.

Normalization preserves Unicode text, entities, numbers, dates, negations and
technical terminology. It corrects whitespace, terminal question punctuation and
very narrow English command-prefix spelling/capitalization. Uncertain grammar
and sentence structure are retained. English/Swedish and a limited set of other
explicit request patterns are recognized; Unicode pass-through is not a claim
of universal multilingual semantic understanding. Full grammar correction,
translation and semantic restructuring are unavailable in this deterministic
fallback. No additional inference operation is silently billed to obtain them.

The structured result contains intent, normalized objective, explicit scope
where recognized, depth, freshness needs and clarification. Negated learning
requests and recognized ambiguous instructions stop for clarification. “Best”
football questions ask for the ranking measure rather than inventing one.
Original/corrected strings are not stored as separate facts or a correction
archive. Direct teaching/conversation retains existing history behavior.

## One shared task engine

FOUNDATION, DEEP and TALK_RESEARCH use `AutonomousLearningEngine`. Before a task
is prepared, existing `trainingContext` retrieves current canonical knowledge.
Gap detection inspects lexical relevance, incomplete context, recorded conflicts,
requested depth, dates and the actual reasoning response's uncertainty where
available. Candidate count alone never establishes sufficiency. A suitable
freshly dated source record can satisfy the freshness screen; generation and
reference validation still constrain the answer.

Task identity hashes the Mindling, mode, normalized objective, explicit scope
and, for freshness-sensitive requests, UTC date. Case, names, quantities,
comparisons and negation remain significant; terminal punctuation is ignored.
This is conservative request deduplication, not semantic equivalence inference.
Concurrent repeated questions reuse one unfinished task. A latest-conversation
association allows completion to update that same Talk response without
repeating the question or overwriting a later unrelated conversation.

Tasks contain minimal objective/plan/status/work metadata, source references,
knowledge IDs, timestamps, bounded attempt counters and a run/session fence.
They never contain copies of canonical memory records or entire source bodies.
At most 24 tasks are retained, eight unfinished; older terminal history can be
pruned. One source-reading task runs per page. Runs are fenced transactionally
across interactions/tabs so superseded work cannot commit. Already terminal
tasks cannot be restarted by a stale callback.

## Actual source access and evidence

There is no search provider or automatic discovery endpoint. A task starts
BLOCKED when no source is authorized. The Memory task inspector allows the user
to explicitly authorize a public HTTPS document, with one source for FOUNDATION
or TALK_RESEARCH and up to two in a DEEP attempt. Native browser fetch uses CORS,
no credentials or referrer, no redirects and bounded streaming. Supported types
are plain text and Markdown; HTML, authenticated sites, literal IP/local-host targets
and unreadable or CORS-restricted sources are blocked. Browser/network policy
can further restrict access. No private memories or question text are sent to a
document host; only the exact user-authorized URL is requested.

Each task allows two explicit attempts, at most three total document requests,
64 KiB per document, three accepted knowledge units, and no additional model
inference calls. Requests have an 18-second deadline; deadlines do not simulate
progress. There are no automatic retries, recursive tasks or background loops.

Evidence selection is extractive and conservative: bounded source sentences
must match query features and any supported explicit geographic restriction.
Recognized instructions/questions are excluded. Source text stays untrusted and
is never executed. Time-sensitive extracts need a fresh ISO date explicitly
introduced as an observation/update/as-of date; retrieval time alone does not
establish freshness. This is not independent fact verification or complete
semantic entailment analysis. Deep work can collect bounded observations from
two authorized documents, preserving each source independently; it does not
invent agreement, advanced comparisons or demonstrated understanding.

## Canonical integration and costs

Validated excerpts go through the existing synchronous `learn` reducer and
native classification/duplicate/conflict/quality rules in the existing gameplay
transaction. The guarded autonomous option requires a matching COMMITTING task,
current run, authorized observed source and accepted quote hash. Exact excerpt
hashes also prevent duplicating the same observation across document hosts.

Accepted content is explicitly attributed: source URL, observation timestamp
and the source excerpt. Research metadata retains source/content hashes and any
explicit validity date. An excerpt is a source-attributed claim, not timeless or
independently verified truth. Failed native checks preserve existing knowledge;
correction/supersession rules are not weakened to force research acceptance.
No research plan or user learning instruction becomes a memory.

All autonomous acceptance writes `xp: 0`; no Stage XP, lifetime XP or concept
milestone reward is added. Direct user-fact teaching preserves its existing
reward/cap rules. Existing canonical growth and pathway-evidence recording apply
only to genuinely accepted new memories under their existing rules. Origin DNA,
identity/keys, existing records and classification policy are not overwritten.

Preparing, reading, evaluating, retrying or blocking a task adds no Energy cost.
FOUNDATION/DEEP spend the existing Teach/Deep Training cost (2/3) once, atomically
when new knowledge is accepted; production uses the existing Energy journal.
TALK_RESEARCH inherits the accepted Talk's existing 1-Energy receipt and never
spends it again. Reusing an unfinished question's status spends no additional
Energy. Existing low-Energy/life restrictions still govern input availability.
A failure in the final transaction rolls back knowledge and its charge together.

## Progress, presentation and continuation

Progress counts seven real work units: interpretation, retrieval, planning,
source retrieval, evidence evaluation, canonical integration and answer
preparation. A set of completed units prevents double-counting on retries.
Blocked/cancelled work stops. Completed units survive reload; 100% describes
only a bounded task, never topic mastery.

The gray research layer is projected after canonical `graphData` and is never
included in its counts, distribution, Live Pathways or knowledge relationships.
TALK_RESEARCH contributes one root node per unfinished question, even without an
existing category. FOUNDATION/DEEP can show three gray work-group children.
These children describe work, not fabricated topics or acquired knowledge.
Gray edges connect an actual retrieved knowledge area when one exists; there is
no invented permanent category. Source reads/evaluations have no animated fake
progress. Canvas selection, zoom and pan are reused, plus a keyboard task list
and inspector. No new animation loop, shadow or WebGL engine is introduced.

Completed gray nodes leave the active layer; bounded history remains inspectable.
Only accepted canonical records appear through the normal colored graph. The
latest initiating Talk response receives source-attributed observations with
explicit uncertainty; no second model response is fabricated or automatically
billed. If a newer conversation owns the response panel, old completion cannot
overwrite it. History provides links to retained source excerpts.

## Persistence and browser lifecycle

Optional `mind.learningTasks` metadata is persisted through existing production
`changeGameplay` and isolated Preview `change`, using the existing atomic state
records. No IndexedDB upgrade, new object store, reset or migration is necessary.
Returning-user hydration already carries these fields. Read-only snapshots
inspect tasks without exposing source-execution controls.

Hidden pages abort active fetches; page exit/destruction cancels listeners and
requests. No work runs after browser closure. A session mismatch renders saved
in-flight work as interrupted/blocked. Resumption requires explicit document
authorization and remaining task limits; it never silently resumes paid work.
Run tokens prevent old completions from mutating a cancelled/replaced task.

## Validation boundary

Only source inspection, text searches, `git diff --check` and native JavaScript
syntax-only checks were performed. No tests, test suites, browser automation,
screenshots, builds, npm commands, dependency installations, research fetches or
paid model calls were executed. Browser layout, CORS behavior, runtime integration
and real IndexedDB races remain unvalidated.
