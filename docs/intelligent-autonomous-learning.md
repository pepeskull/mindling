# Interactive Clarifications and Autonomous Source Discovery

Production and isolated Preview share the existing Input Understanding Engine,
Autonomous Learning Engine, canonical memory reducer and Memory graph. This
extends M4.2.12–13 without a backend, dependency, model configuration change,
new database/store or schema migration.

## Clarification and continuation

Ambiguity produces a bounded structured question with native option buttons or a
300-character free-text field in the existing Talk response panel. Teach and
Deep Training use the same panel without changing their selected activity.
Swedish/English labels cover comparison criteria, football ranking measures,
geographic combinations, time periods and the distinction between research and
factual teaching. Unclear instructions and constraints request free text.
Unresolved complex negation remains a clarification rather than being discarded.

The response renderer handles clarification before generic missing-knowledge
copy. The question appears once; it is not concatenated from reasoning and task
messages. Free-text fields use a separate short label.

An ephemeral per-application pending record retains the original input, Mindling,
activity, request ID and validated answers. One-use continuation capabilities
resume that original request through input understanding. The selected label is
not submitted as a new question. Original entities, quantities and constraints
remain in the request; selected interpretations also enter retrieval context.
No separate conversation archive is persisted. Reload intentionally discards an
unsubmitted clarification; saved legacy blocked tasks can reopen theirs.

Repeated clicks, identity changes, dismissal, task cancellation, superseding
requests and stale callbacks are fenced. Failed acceptance leaves choices
available for retry. Native buttons/forms provide keyboard access, existing
focus outlines and wrapping; no animation or shadows are added.

## Activity costs and canonical safety

Clarification is intercepted before normal activity acceptance: displaying,
choosing and correcting it cost no Energy and award no XP. Continuation retains
the original request ID; transactional guards and existing processed-event IDs
prevent double acceptance. An already charged legacy Talk clarification reuses
its task and receipt instead of accepting another Talk.

FOUNDATION/DEEP retain the existing Teach/Deep cost (2/3), charged once atomically
only when research forms new canonical knowledge. TALK_RESEARCH inherits the
accepted Talk's 1-Energy receipt. Discovery, source reads, evaluation, retries
and blocking have no separate charge. Autonomous memories continue through the
existing native classification/duplicate/conflict/quality checks with **0 XP**;
no new model operation is added. Normal direct teaching keeps its existing path.

Discovery candidates are task metadata, never factual memories. Only accepted
source excerpts enter canonical storage, retaining source URL, content/quote
hashes, observation date and an explicit fact-validity date when available.
Existing knowledge, correction/supersession rules, identity, keys, Origin DNA,
progression and pathway evidence are preserved. Knowledge Network and Live
Pathways refresh through existing canonical state updates, not search results.

## Implemented discovery providers

Two fixed-host adapters use the public MediaWiki Action API:

| Provider | Coverage | Not supported |
| --- | --- | --- |
| `wikipedia-en` | English general, scientific, historical and sports reference material | Live standings/prices; primary research search |
| `wikipedia-sv` | Swedish reference material in the same categories | Live standings/prices; primary research search |

Discovery uses `generator=search`, article namespace, four candidates and
`prop=info` canonical URLs. Retrieval uses the discovered page ID,
`prop=extracts|info|revisions`, `explaintext=1`, introductory text and the API's
1,200-character extract limit. Actual returned URLs, article IDs, titles,
provider identity, local discovery time and lexical title overlap are validated.
Revision time is retained only when returned. It is not a publication date or
proof that an individual fact is current. Ellipsis-truncated excerpts are rejected.

Approved providers are ordered by request language. An explicit retry can select
the other approved language edition. Both are Wikipedia: they are not described
as independent corroborating sources. Source links provide article attribution
and author/history access; the inspector links the Wikipedia text license
(CC BY-SA 4.0; source-specific exceptions remain applicable). Search ranking and lexical overlap are
selection hints, not truth verification. Unreadable candidates are skipped
within the same fixed budget. FOUNDATION/Talk collect at most one readable
source per attempt; DEEP can collect two. Broad objectives receive partial
extractive coverage, never a claim of mastery or advanced synthesis.

### API contract inspection

Official upstream source was inspected, including:

- [MediaWiki CORS handling](https://github.com/wikimedia/mediawiki/blob/master/includes/Api/ApiMain.php): `origin=*` allows anonymous cross-origin responses without credentials.
- [Search module](https://github.com/wikimedia/mediawiki/blob/master/includes/Api/ApiQuerySearch.php): search generator, namespace and limits.
- [Page info](https://github.com/wikimedia/mediawiki/blob/master/includes/Api/ApiQueryInfo.php): full/canonical article URLs.
- [TextExtracts](https://github.com/wikimedia/mediawiki-extensions-TextExtracts/blob/master/includes/ApiQueryExtracts.php): plain-text extraction, introductory text and the 1,200-character maximum.

This verifies the provider contract in source, not deployment availability.
Direct documentation access was blocked by this environment's network proxy;
no live discovery query, source-retrieval run or browser CORS validation was
performed. Browser, provider, network and deployment policies can still block
requests; failures stay unavailable rather than synthesizing results.

## Authorization and privacy

Research defaults to disabled for every Mindling, including returning users.
The task inspector offers disabled, ask before a new provider, and automatic
research with approved providers. Each provider requires an explicit checkbox
and Save. Ask mode contacts only providers already approved; unapproved sources
remain blocked until the user changes permissions. Saving consent alone does
not start a task. A subsequent learning request or explicit Start/Retry can run
under the saved policy. Manual public document reading remains an advanced,
explicitly authorized option and also requires enabled research access.

Policies are stored per Mindling in existing production `settings` records or
an isolated Preview `sandbox` key, with a monotonically increasing revision.
Revocation aborts this page's active run. Permissions are re-read before source
reads and integration. The final canonical write checks the policy revision and
provider approval in the **same IndexedDB transaction** as the memory commit.
A concurrent revocation cannot authorize a later commit with an old grant.
Already committed knowledge and requests already sent cannot be undone.

Discovery derives a short public topic (at most 120 characters), never a memory
bundle, conversation history, identity/key object or wallet state. Potential
personal topics, URLs, identifiers, sensitive keywords and possible proper names
are conservatively gated for explicit review of a minimal public query. This is
local pattern screening, not a comprehensive personal-data classifier. The user
must omit private details from the reviewed public query. Providers receive the
query and ordinary network metadata, including IP/browser information.
Requests omit credentials and referrers; no secret keys or proxy are used.

## Retrieval, freshness and budgets

The shared retrieval boundary enforces HTTPS public hostnames, no URL credentials
or signed-token parameters, no literal IP/local host targets, no redirects,
CORS, bounded streaming, safe text and cancellation. Manual imports remain
plain text/Markdown. Only the fixed discovery adapters request JSON; returned
webpage HTML is never fetched or parsed. Canonical article identity is checked
again during extraction. Untrusted source text is never executed.

Current/latest questions, explicit standings/form selections and recognized
league-leader questions require dated evidence. Neither adapter declares live
data support, so automatic research reports **Current data unavailable** without
querying an unsuitable encyclopedia. Manual dated evidence still passes existing
freshness checks: fetch time and page revision time cannot substitute for an
explicit recent observation/as-of date in a claim. No current table is invented.

Per-task bounds remain conservative: 24 retained tasks, eight unfinished, one
active run per page, two attempts, two discovery queries, four candidates per
query, three total document reads and three accepted knowledge units. Search
reserves 16 KiB; each document reserves up to 64 KiB within a cumulative 192 KiB
body reservation. Actual retained bytes and reservations are tracked separately;
network buffers can deliver a final over-limit chunk, which is discarded.
Each request has an 18-second timeout and each run a 45-second deadline (at most
two runs). There is no recursive search, timed progress, polling or additional
inference. DEEP excerpt collection does not implement model synthesis,
independent corroboration, live official sports data or unrestricted web search.

## Tasks, inspector and lifecycle

The same seven work units are retained. The inspector separately shows
preparation (first three units), task work out of seven, successfully retrieved
sources and new retained canonical memories actually attributed to this task.
Discovery query/candidate counters are actual recorded work. Percentages measure
task steps, never knowledge mastery. Friendly labels distinguish discovering,
reading, evaluating, integrating, waiting, paused, unavailable and completed.

Start/Retry, Pause, Cancel, source references and research permissions replace the
default URL requirement. A sensitive query gets a public-topic confirmation
control. Advanced document selection preserves the previous safe manual path.
Source details distinguish retrieval and page revision dates. Saved read-only
snapshots have no execution controls.

Existing blocked tasks keep IDs, counters, source/knowledge references and Energy
receipts. Start/Retry uses newly saved permissions within remaining limits.
Legacy CLARIFICATION tasks reopen an actionable question and update the same
task when resolved. The optional query key supports deduplication after that
update. Failed/superseded runs cannot commit using an old run token.

TALK_RESEARCH retains one gray root per unfinished question; FOUNDATION/DEEP
retain bounded work-group nodes. Search candidates do not create gray knowledge
nodes. Completed tasks resolve out of the active layer; accepted memories appear
normally. The latest initiating Talk receives an attributed result or an
unavailable explanation; an unrelated later response cannot be overwritten.

Hiding or closing the page aborts work; destruction removes listeners. Saved
in-flight tasks render as interrupted after reload. Nothing restarts on
hydration. Explicit resumption uses current permissions and remaining budgets;
there is no background execution after browser closure or new animation loop.
The existing run fencing prevents stale commits; concurrency remains one task
per page, not a new cross-tab global worker lock.

## Validation boundary

Only focused source inspection, diff review, `git diff --check` and native
JavaScript syntax-only checks were performed. At the user's explicit request,
**no tests, test suites, browser automation, screenshots, builds, npm commands,
dependency installations or paid model calls were executed**. Browser layout,
end-to-end continuation, provider availability, CORS and real IndexedDB races
remain unvalidated at runtime. No merge or direct deployment is performed.
