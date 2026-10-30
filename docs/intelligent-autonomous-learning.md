# Autonomous knowledge acquisition and specialization evidence

## What changed

Mindling uses one shared taxonomy for current knowledge, recorded claim evidence,
Live Pathways and narrow specialization eligibility. The existing Autonomous
Learning Engine now coordinates actual, bounded biomedical information access
through the existing reasoning endpoint. Onboarding, identity creation and the
Knowledge Network rendering remain unchanged.

## Specialization root cause

The previous Live Pathways selector understood scientific families such as
Biology. Recorded evidence used a separate exact-match registry for the nine
onboarding choices. Biology was not an onboarding-domain alias, and an unknown
explicit category returned early as unassigned. A valid Biology memory could
therefore support Biologist while its learning evidence contributed zero units.
The repair routine only processed policy-version-1 records; version-2 unassigned
records were never reconsidered.

Canonical creation already stores category/category ID, topic, claim text,
provenance and a recorded claim-evidence entry. Preview service decisions create
atomic statements; native learning stores its accepted claim. Category IDs refer
to the saved category registry, while topic strings can be natural-language
labels. The repair resolves registry labels consistently with `graphData`; it
does not mistake UUIDs, origin IDs, topic labels and specialization IDs for the
same identifier.

## One attribution and eligibility mechanism

`classifyKnowledge` uses the shared specialization taxonomy over saved category,
area and topic/concept metadata. Known broad domains can support controlled
subtopics; unknown explicit categories are not overridden by mining claim prose.
Native Notes labels are weaker attribution. No example sentence is hardcoded.

Controlled biology facets include DNA/replication, genes/expression, mutations,
inheritance, meiosis/recombination, cells, organelles, membranes/division,
evolution/selection, photosynthesis/botany, ecology, microbiology and zoology.
Canonical family IDs (for example `biology`) and specialization IDs (for example
`biology:geneticist`) are shared across recording, presentation and selection.
Facet IDs describe coverage, not extra claim units. More aliases/facets can be
added to the registry without modifying either UI.

`knowledgeEvidence` is the common read-only selector over canonical `graphData`
records. It deduplicates normalized claim text, excludes superseded, historical,
incomplete and non-knowledge records, and checks actual learning-record identity
and content-key matches. Contested claims do not support eligibility. A claim
contributes at most one domain evidence unit even when several facets match.
Parent/child evidence counts overlap intentionally and are never summed as new
units. Reinforcement and repeated statements add no claim units.

Live Pathways and Developed Specializations consume that same selector. Origin
DNA remains historical, including Developer, Social and Researcher. Actual origin
names fill unformed directions; pending research and proposed knowledge do not
influence current titles.

Broad orientation still requires three distinct claims, two saved canonical topics, two
submissions and adequate recorded attribution/provenance. Weaker native labels
need four claims and a real relationship. Narrow orientation requires five
claims, three facets, three submissions, at least 65% family coverage, three
stronger attribution records and two actual in-group relationships. The broad gates preserve the existing saved-topic requirement; narrow
coverage now uses meaningful controlled facets rather than varied wording alone.
One DNA claim cannot produce Geneticist. Five genetics-related claims among eight
mixed biology claims do not alone satisfy 65% coverage, and recorded relationships
and quality gates still apply. Titles describe orientation, not qualifications,
verified expertise or demonstrated cognitive ability.

## Existing evidence and corrections

Normal hydration/advancement invokes deterministic, idempotent policy-3 repair.
A record is reconsidered only against the same saved canonical memory and
normalized content key. Supported category/topic metadata can attribute a prior
unassigned record. The original attribution, units, allocation and policy are
retained in classification history with an explicit deterministic-repair method.
Original learning IDs/times and memory provenance are not replaced with a claim
that a model classified them historically. Repeated hydration adds no duplicate
history or units when the result is unchanged.

Insufficient metadata remains unassigned. Missing/nonmatching historical events
are not fabricated. The selector can describe current canonical metadata while
separately reporting that a matching recorded learning event is absent. Invalid,
duplicate, stale and historical evidence stays stored but is excluded from current
counts. Corrections preserve old claim history and record attribution for the
actual updated canonical value in the existing transaction. No memory contents,
keys, XP, Energy or Origin DNA are rewritten by attribution repair.

The eight reported claims can be attributed if their actual saved Biology
category/topic metadata and content-key/event matches are present. This work
inspected the production pipeline, not the user's IndexedDB; it does not claim
to have inspected or modified those personal records. Geneticist progression is
structurally possible as distinct, related genetics evidence meets every gate.

## Actual information access

The configured AI integration remains the existing model and strict structured
completion transport. Its request protocol does not expose a native web-search
or retrieval tool. Changing its prompt would not add internet access.

A fixed-host server-side adapter extends the existing handler, without a new
application, endpoint, function, database, model or runtime dependency. It uses
the public Europe PMC REST API at EMBL-EBI for **open biomedical publication
abstracts**. This covers literature about the human brain, neurons, genetics and
related life sciences. It is not general web search, full-text research, clinical
verification or a live sports/price/news service.

The coordinator proposes at most two short public queries. Discovery requests
`resulttype=lite` and actual publication metadata. Search snippets are never
accepted as evidence. Returned MED identifiers receive five-minute, topic-bound
HMAC tickets signed with an existing server-side secret. Retrieval accepts only
these tickets and performs a separate `EXT_ID`/source lookup with `resulttype=core`
for the actual abstract. Neither model-generated URLs nor client-selected hosts
can become fetch targets.

Only suitable open, non-retracted/non-preprint records with a complete abstract
within the text bound are returned. Structured abstract formatting is converted
to plain text without executing HTML; unknown markup/invalid text is rejected.
Each source preserves actual title, stable record URL, record ID, source domain,
journal and publisher where supplied, retrieval time, publication date where
valid, retrieval status, type and SHA-256 content hash. Missing metadata remains
null. Publication/retrieval time is not a fact-validity date.

The API contract was inspected through the public rOpenSci Europe PMC client:
[base API](https://github.com/ropensci/europepmc/blob/main/R/utils.r),
[search](https://github.com/ropensci/europepmc/blob/main/R/epmc_search.r),
[record details/abstracts](https://github.com/ropensci/europepmc/blob/main/R/epmc_details.r).
The environment proxy blocked direct access to the official documentation page.
No live search, source fetch, model probe or end-to-end request was executed;
production availability and compatibility remain runtime-unverified.

## Required deployment configuration

Set **`MINDLING_RESEARCH_SOURCE=europe-pmc`** on the existing Vercel project to
explicitly enable this information integration. The default is disabled. Keep
the existing server-only `SERVICE_API` and `SERVICE_MODEL` with strict structured
output support. Europe PMC needs no new secret or paid search account. Outbound
DNS/HTTPS access to `www.ebi.ac.uk` must be permitted. Deploy the updated existing
handler with the frontend; no new route, function or duration setting is added.

Without this flag or usable service configuration, tasks report BLOCKED and
source access is not advertised as operational. A same-origin capability check
can refresh configuration availability without making an inference or source
query. Runtime deployment configuration was not read or changed by this work.

## Permissions and privacy

Existing AI-planning consent remains limited to two planning attempts per task.
A **separate per-Mindling Europe PMC information grant** is required before new
queries or abstract retrieval. It also discloses up to two evidence-evaluation
requests through the existing model, which may incur the existing provider's
charges. Previous planning or historical source permissions do not authorize it.

First use offers the new grant in the active workflow and continues automatically
after approval. Settings exposes separate planning/information controls and
revocation. No Memory visit, URL entry, Start Research or per-document approval
is required. Preferences use existing settings/sandbox records, without a schema
upgrade. Source-backed writes check both permission revisions in the same
IndexedDB transaction as memory acceptance. Revocation aborts active work and
rejects stale grants; it cannot undo an already sent request or provider billing.

Only the reviewed public topic, bounded public scope and generated queries leave
for research. Private memories, identity keys, wallet information and complete
conversations are not sent to the public source or added to model evaluation.
Potential sensitive topics require review; local pattern screening is not a
comprehensive personal-data detector. Existing Talk's separately authorized
knowledge-context behavior is unchanged.

## Retrieval security and budgets

The source host/path and HTTPS port are fixed. DNS results must all be publicly
routable, and the HTTPS connection uses the checked address with the correct TLS
hostname. IP literals, user-controlled hosts, private/reserved addresses, URL
credentials and redirects are not followed. Public-source requests receive no
AI credentials, cookies or referrer. Search fields are constructed from bounded
plain-text queries, not arbitrary source URLs or query parameters.

The existing origin/IP rate controls remain. At most two information requests
run concurrently per handler instance; public API starts are paced to two per
second per instance. There is no new distributed coordination service.
Requests have eight-second source deadlines and the existing handler's overall
45-second cancellation fence. The browser caps a whole research run at two
minutes and pauses/aborts when hidden or closed.

Per-task limits are two workflow attempts, two planning and two evidence
inferences, two search queries, three source candidates, three document reads
and three candidate memories. Search bodies are bounded to 16 KiB, record bodies
to 48 KiB, within a conservative cumulative body reservation below 192 KiB.
Decoded abstracts are at most 6,000 characters; each retained quote is 40–700.
No unbounded retries, scraping, recursive research or extra model is introduced.

## Evidence evaluation and canonical integration

The same model compares only the retrieved abstracts against the public objective
and scope. It must reject unsupported/contradictory/generalized conclusions and
return bounded exact contiguous quotes with source IDs and conservative topic
metadata. Both server and browser validate source identity, quote membership,
structure and bounds; the browser verifies content hashes. Local checks retain
explicit exclusions/geography and reject non-factual instruction/question input.

The existing canonical `learn` reducer receives a guarded autonomous
source-quote authorization. Its duplicate, conflict, quality, correction and
capacity checks remain authoritative. Classification proposals are bound to the
saved accepted quote/source and are explicitly source-evaluated metadata, not
independent verification. Source URL/hash, exact quote hash, publication metadata,
observation time and source type survive on accepted memory.

Stable quote-derived IDs and current-memory quote hashes prevent duplicate
acceptance across retries/tasks. A commit, its original activity receipt and
canonical changes are atomic. Teach/Deep spend only the existing 2/3 Energy once
when genuinely new knowledge is formed; Talk reuses the already accepted
one-Energy receipt. Planning/search/retrieval/clarification/recovery have no
additional Energy fee. Autonomous acceptance remains **0 XP**, without concept
milestone rewards. Normal direct teaching is unchanged.

An abstract is partial, attributed publication evidence, not verified universal
truth. Native contradiction checks and model cross-source review are conservative
rather than a proof of entailment. No paper-derived claim is silently presented
as current clinical advice, live standings or independently fact-checked truth.
Unsupported current questions stop with an honest natural response.

## Progress, response and recovery

Knowledge Network geometry, colors, edges, layout, zoom, inspection and animation
are preserved. Existing gray research circles now follow real planning, SEARCHING,
RETRIEVING, EVALUATING, INTEGRATING, completion or explicit blocked states.
Seven work units remain; new tasks version their work interpretation so source
search is completed only after an actual provider response. Proposed steps do
not complete source/knowledge units. Historical completed work is preserved.
The inspector distinguishes work, completed query count, budget usage, successful
sources and actually new canonical memories. BLOCKED is labeled Research paused.

Talk uses natural success/uncertainty messages and accessible source links;
configuration/error details stay in the inspector. Only accepted memories become
blue knowledge nodes and affect Live Pathways. One gray Talk root remains per
unfinished question. Broad research remains bounded partial coverage, not mastery.

Task IDs, source/counter history, original request/activity, pending clarification,
run/session fences and existing Energy receipts are preserved. Bounded evaluated
quotes can be persisted before atomic integration, allowing reload recovery
without repeating retrieval or inference. Source tickets expire; rediscovery
requires remaining query budget. Reads with an unknown outcome consume their
reservation rather than being assumed free. No background execution after browser
closure is claimed. Exhausted budgets or unavailable sources remain paused.

## Validation boundary

Only static source, syntax, import and diff inspection were performed. No automated
tests/test suites, browser automation, screenshots, builds, npm commands,
dependency installations or paid AI requests were executed, at the user's request.
No live information-tool or inference verification was performed. This is a real
implemented retrieval path behind explicit configuration/consent, not a claim
that the deployed environment has already enabled or runtime-verified it.
