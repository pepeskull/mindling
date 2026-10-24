# Stage Preview memory intelligence, version 2

> Historical version 2 implementation report. Current duplicate Energy rules, atomic-memory storage and contract version 3 are described in [the Energy and atomic-memory update](preview-energy-atomic-memories.md).

## Audit and boundaries

Audited from `main` at `e4cd02313f517bfee40f16fc3600703588ccf534`.

The existing path was: player Teach/Deep Training input → in-memory sandbox snapshot loaded from IndexedDB → bounded lexical retrieval → local exact-match shortcut or `/api/mindling/learn` → server-side structured model assessment → client revalidation → `learn` inside `PreviewStore.change` → atomic whole-sandbox IndexedDB write → dashboard render. Talk is local stimulation/recall and does not invoke the service. The database is `mindling-preview-m4`, store `sandbox`, key `state`; production uses a different database. No database schema/version change is needed.

Differences from the requested expected flow: retrieval runs on the snapshot already read from IndexedDB, rather than issuing separate per-candidate database queries; exact duplicates can avoid the network; the old service only supported new/related/repeated/reject, with no preference/goal history or contradiction operations. Normal production learning remains native. The old service hardcoded a model and sent provider-specific temperature/token options. Energy already regenerates one point per 12 minutes with a normal capacity of 10. Teach costs 2, Deep Training 3; existing paid/legacy bonus accounting is preserved. Concept creation awards 50 XP; corrections award 60; the daily cap remains 500. Repetition earns zero XP. Stage duration/XP gates, renderer, onboarding and wallet are unchanged.

## Server-only configuration and compatibility

Set both variables in the Vercel server environment, never in browser configuration:

- `SERVICE_API`: credential authorized for the existing HTTPS API endpoint.
- `SERVICE_MODEL`: exact API identifier supplied by the provider. There is no default or fallback.

The existing provider remains OpenAI, using `https://api.openai.com/v1/chat/completions` with strict JSON-schema output and `max_completion_tokens`. These details are confined to the server and technical documentation. An unauthenticated, missing, malformed or unavailable configuration returns a neutral error. Every inference request first performs an authenticated, read-only `/v1/models/{identifier}` lookup and checks the returned identifier. This is an availability gate, not proof of Chat Completions or structured-output support: the inference endpoint must also accept the request and return the validated contract. Unsupported endpoint/options, authentication errors, refusals, truncated output and malformed JSON fail safely, without fallback. The model lookup and inference share a 12-second abort deadline. This adds a provider metadata request per inference; no additional SDK or infrastructure is introduced.

**Luna compatibility remains unverified.** No exact public Luna identifier was established, and `gpt-6-luna` must not be assumed valid. The provider documentation website was denied by the environment's egress proxy during this task. The official [Chat Completions SDK contract](https://github.com/openai/openai-node/blob/d8931e7facfd0b453cc1683c31c60be8cc1ae37e/src/resources/chat/completions/completions.ts) was retrieved from the provider-owned repository and confirms `max_completion_tokens` and `response_format: json_schema` as API request fields; this does not confirm support by any Luna identifier. No live model lookup or paid inference was performed. Synthetic identifiers in tests deliberately do not assert provider support. Deployment requires checking the exact configured identifier against authoritative provider documentation and a separately authorized smoke test for this endpoint, token parameter and strict schema. Never replace an unsupported identifier with another model silently.

Request payloads are bounded by their actual serialized byte size (16 KiB), input (2,000 characters), eight candidate memories and twelve categories. Unknown fields, duplicate candidate/category IDs, invalid metadata and unknown references are rejected. Upstream bodies, credentials, model configuration and provider errors are never returned to players. Player/model strings are untrusted data, never executable database commands. Labels are rendered with `textContent`; model decisions cannot supply replacement content, arbitrary mutations or a verified status. The server also rejects labels that echo configuration values or provider details.

## Retrieval and decisions

Preview-only retrieval reuses existing lexical ranking with bounded ranking aids for UI wording, preferences/goals and historical context. It sends at most eight candidates, stable IDs, existing category labels, current/historical status, kind, certainty, existing verification metadata and up to two previous values per candidate. Older untyped records receive conservative preference/goal/historical and uncertainty hints from explicit wording; these hints never establish verification. Historical records are available as context but cannot be mutation targets. Ranking and similarity are not relationship decisions, and lexical recall is not a general semantic-search guarantee. Elliptical, multilingual or lexically unrelated inputs can miss relevant memories. No vector database, embedding service or new backend storage was added.

The active server contract is version 2. Relationships: `NEW_MEMORY`, `SAME_MEMORY`, `RELATED_MEMORY`, `UPDATED_MEMORY`, `CONTRADICTION`. Operations: `CREATE_NEW`, `REINFORCE_EXISTING`, `LINK_TO_EXISTING`, `UPDATE_EXISTING`, `FLAG_CONTRADICTION`, `VERIFY_BEFORE_STORAGE`, `REJECT_UNSAFE_INSTRUCTION`, `ASK_FOR_CLARIFICATION`, `NO_MEMORY_CHANGE`. `responseAction` is separately validated (`ACKNOWLEDGE`, `EXPLAIN`, `CLARIFY`, `DECLINE`); it cannot execute a memory operation or emit arbitrary model prose.

Kinds distinguish claims, preferences, goals, skills, historical information and temporary intentions. Certainty distinguishes asserted from uncertain statements; all new service memories remain unverified player claims. Obvious uncertainty markers cannot be upgraded to asserted certainty. Intentions cannot become lasting memories. Explicit category/memory IDs are checked against the candidate set on both server and client. Operation/relationship conflicts, low-confidence mutation, exact duplicate creation, updates to facts/verified knowledge, historical targets and changes across preference/goal kinds are rejected deterministically. Semantic correctness and instruction recognition still depend on the configured model; mocked tests do not measure that model's intelligence or guarantee prompt-injection resistance.

The browser retains the strictly validated legacy response contract for existing fixtures/deployed clients, but the active server emits and accepts only version 2 model output. Deterministic local exact matches now emit version 2. Historical native fixture behavior is preserved; active version 2 reinforcement has no time-based text cooldown and earns no XP.

## Storage, history and failure behavior

A model response is revalidated inside the synchronous reducer against current state. The controller additionally compares the submitted candidate context with transaction-time context, rejecting stale assessments after another tab changes relevant memories. No network await occurs inside an IndexedDB transaction.

- New memories reuse existing formation, growth and XP rules. Related memories add validated bidirectional links.
- Reinforcement keeps the existing ID, spends the normal activity Energy, and awards no XP or milestone. Distinct event IDs can repeat immediately while Energy remains.
- Updates apply only to current preferences/goals, preserve the stable ID and append previous content, labels, metadata and time to `valueHistory`. They award the established correction XP, without a new concept milestone. Facts and verified knowledge cannot be overwritten through this operation.
- Contradictions append bounded unverified conflicting claims to the existing memory, without changing its content, Energy or XP. They do not claim the original statement has been independently verified.
- Verification, clarification, unsafe-instruction rejection and no-change decisions store no new memory and spend no Energy/XP. A processed-event/history entry records the decision, preventing replay.

All memory/history/links, processed IDs, Energy and XP are written in the existing single `PreviewStore.change` readwrite transaction. Failed requests, invalid decisions, stale context, insufficient resources, reducer exceptions, aborted transactions and failed writes cannot partially commit. Replayed event IDs are rejected. Safe retries after an uncommitted network/write failure can proceed; committed updates change candidate context, and committed exact inputs reinforce rather than create duplicates. This is client-owned gameplay state, not an authoritative anti-cheat backend.

The existing Memory panel is enriched only from the sandbox controller to show type, uncertainty, previous values and conflicting claims using its existing layout. Production rendering files and gameplay modules are unchanged. The sandbox disclosure explicitly states that input and relevant sandbox memories are sent to an external service; production records are not included.

## Regression evidence and Test 4

The repository was searched for Test 4, `M001`–`M050`, `N01`–`N20` and the historical score. The original fixtures/expected results were not found. The previous approximately 92/100 score is not reproduced or claimed here.

`tests/memory-intelligence-v2.test.mjs` is a **new synthetic** regression suite with 24 decision scenarios, independently tested retrieval, no-cooldown reinforcement and mocked provider failures. It tests contracts and mutations using predetermined decisions, not live model reasoning. `tests/memory-transactions-browser.py` exercises real Chromium IndexedDB for transport failures, reducer rollback, failed writes, concurrent duplicate delivery, atomic Energy/XP, stale contexts, persistence and isolation. Existing server tests now mock model metadata and version 2 responses. Existing sandbox/network browser fixtures use version 2; production/demo tests remain separate.

Commands from `/workspace/mindling`:

```sh
node --test tests/*.test.mjs
python3 -m http.server 8000 --bind 127.0.0.1
# In another command session:
python3 tests/memory-transactions-browser.py
python3 tests/sandbox-browser.py
python3 tests/network-energy-browser.py
python3 tests/evolution-browser.py
```

All inference responses in automated tests are mocked; no paid API calls are made. Browser fixtures download pinned Three.js assets using verified TLS. Results and any publication limitations are recorded in the PR delivery report.

Validated in the current cloud instance: 147/147 Node tests passed (zero failed/skipped), including all pre-existing scenarios with server fixtures adapted to the required new configuration; real IndexedDB/controller tests passed; sandbox Canvas/Three.js and lifecycle tests passed; network/Energy/concurrency/rollback/isolation browser tests passed; production/demo Canvas/Three.js, desktop/mobile, lifecycle and framing tests passed. `git diff --check` passed. No build step exists. These results do not establish Vercel deployment or live model quality/compatibility.
