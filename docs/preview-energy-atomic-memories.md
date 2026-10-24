# Stage Preview: operation-aware Energy and atomic memories

This report supersedes the version 2 Energy/whole-input storage behavior in the earlier memory-intelligence report. Production gameplay, native production Talk/learning, UI styling, onboarding, wallet, identity, renderers, API routing and model selection are unchanged.

## Confirmed causes

Audited from main `2cc58c8` (the API entrypoint routing repair is already merged).

1. Service duplicates used `applyMemoryDecision` → the shared `reinforce` rule, which always checked and spent the activity's Energy cost. The preview controller also blocked all submissions before assessment when Energy was below the mode cost. Consequently duplicates were both charged and unavailable at zero Energy. This was transaction logic, not an automatic deduction merely because HTTP returned 200.
2. A valid version 2 update with confidence .99 was replayed against the exact supplied legacy ID/content/kind. Main's validator rejects it because `target.kind !== raw.kind` (`claim` versus `preference`). The server maps that validator exception to `ANALYSIS_INVALID`. The old storage path would also replace the full compound content if that check were simply bypassed. The captured raw model output for the live Test 3 was not supplied, so other invalid fields in that particular response cannot be ruled out; the strict-kind defect itself is reproduced independently.
3. The old contract allowed one decision per submission, and storage used the complete original text as that decision's memory content. Independent name and preference facts therefore became one record, without a safe target for changing only the preference.

## Energy and XP

For Stage Preview service assessments, settlement occurs after decision validation and mutation computation, inside the existing single IndexedDB readwrite transaction. The reducer works on a private clone; only transaction completion exposes the result to the controller/UI.

| Operation | Energy |
| --- | --- |
| Newly committed `CREATE_NEW`, `LINK_TO_EXISTING`, `UPDATE_EXISTING` | Talk 1, Teach 2, Deep Training 3, once per submission |
| `FLAG_CONTRADICTION` adding a new persistent conflict | Mode cost once; repeating the same recorded claim is free |
| Duplicate `REINFORCE_EXISTING` | 0 in every mode |
| `NO_MEMORY_CHANGE`, clarification, unsafe-instruction rejection | 0 |
| `VERIFY_BEFORE_STORAGE` | 0: this implementation requests verification but does not create a verification record |
| Invalid/failed/stale/replayed requests or failed writes | 0; no learning mutation/reward commits |

The normal Energy capacity remains 10 and regeneration remains one point per 12 minutes; existing bonus/wallet accounting is preserved. No shared Energy rule, regeneration constant or XP constant changes. Free operations remain available at zero Energy. The UI no longer decides affordability before knowing the operation: a chargeable operation lacking Energy fails in the transaction, while a duplicate can succeed for free. There is no new time-based submission cooldown. Existing server request-rate protection remains unchanged.

Preview Talk now uses the same assessment/settlement path, so semantic duplicates and meaningful memory actions can obey the approved Talk rules. Conversational no-change is free. **Production Talk is untouched.** Preview messages disclose that all three modes may send input and relevant sandbox memories for external analysis. No provider/model configuration appears in player-facing text.

XP uses the existing constants and daily cap: concept/new learning 50, correction 60, cap 500; Talk and reinforcement remain 0. A batch is one learning event, not one reward per atom: any update uses the existing correction reward; otherwise new/link learning uses the existing concept reward. A mixed batch never sums multiple awards. At most one new-concept milestone and one original formation/growth step occur per submission. Decomposing old data itself earns nothing and does not stimulate neurons. Free duplicates do not provide unlimited free physiological stimulation.

## Duplicate reinforcement

A duplicate reuses the existing ID, creates no memory, spends no Energy and earns no XP. The first submission of a normalized variant may increase strength by .05, activation count by one and reinforce associated synapses. Only three distinct variants per saved memory value can do so. Repeating a variant only refreshes its usage timestamp and records the processed event; after the budget is exhausted, submissions remain accepted without more strength/activation growth. This is a deterministic per-value budget, not a clock or text-submission cooldown. Existing strength/activation history is not reduced. An actual value change establishes a new revision for future bounded reinforcement.

A same-value update of an explicit favorite attribute is also recognized deterministically, preventing a cosmetic “now” change from earning correction XP or unnecessarily decomposing a legacy compound. Exact local matches avoid the API; semantic duplicate recognition still depends on the service's decision.

## Contract version 3

The model returns:

```text
{ version: 3, operations: [
  { statement: <input statement index>, targetPart: -1 or <legacy part index>,
    decision: <the existing strict version 2 relationship/operation decision> }
] }
```

The five relationships and nine operations are unchanged. A bounded, extractive partition supplies up to eight input statements and candidate-memory parts. The response must contain exactly one decision per supplied statement; no generated replacement content or arbitrary database commands are accepted. Memory contents come from those user-provided fragments. Pronoun-dependent sentences are kept together, and conjunctions are split conservatively only when each side has an explicit supported subject and its own predicate. The supplied Swedish name/preference example becomes two independent fragments; “neurons and synapses form a neural network” stays unified.

Server and client validate every decision, statement/part index, candidate/category ID, confidence, certainty and operation/relationship pair. Cross-operation validation rejects missing/duplicate statement indices, duplicate new fragments, overlapping writes to one target and unsafe-instruction rejection mixed with mutations. Disjoint explicitly indexed parts of one compound can be updated together. Invalid operations reject the complete assessment before any committed change. Current version 2 decisions remain supported for rollout, with conservative extractive decomposition of legacy compound creates; validated older single-decision responses are routed through the same operation-aware policy. Malformed responses cannot be hidden by an exact-match shortcut.

The server derives the statement/part context itself. Its bounded response budget increases to accommodate multiple decisions; `SERVICE_API`, `SERVICE_MODEL`, endpoint, model lookup, timeout, credential handling and model selection are unchanged. Older open clients that do not understand version 3 must reload after deployment; they fail closed rather than apply an unknown contract. Saved records need no rewrite to remain readable.

## Safe legacy handling and history

No broad migration, new store or IndexedDB version bump is performed. Decomposition happens only during a validated relevant update:

- A `claim` may be treated as a mutable preference/goal only when the selected source fragment explicitly expresses that type in supported wording. Factual claims, verified knowledge, unrelated name fragments, mismatched explicit favorite attributes and ambiguous/truncated targets cannot be overwritten. Existing confidence checks remain enforced; there is no confidence boost or blanket `claim` → `preference` conversion.
- The original compound keeps its ID, content, strength, activations, neural associations and history. It becomes historical provenance and links to its components.
- Components receive stable linked IDs and copy relevant existing associations/strength/activation data. Normal IDs derive from the parent plus part index; unusually long parent IDs use generated IDs persisted in the component mapping rather than truncating identities. Conflicts abort instead of overwriting another record.
- Only the selected preference/goal component changes. Previous content, labels, metadata, provenance and timestamp are appended to its value history. The unrelated Alex/name component remains current. Subsequent changes address the same component ID.

For the supplied legacy example, the result is the unchanged historical compound plus current `Jag heter Alex` and a current Python preference whose value history contains JavaScript. A new compound submission creates separate atoms directly, linked by submission provenance and descriptive co-submitted relationships. Such links do not assert factual implication. Original input is retained as event provenance when useful; ignored or rejected personal fragments are excluded from that provenance. No independently verified status is generated by model output.

The complete batch, history, reference links, processed event ID, neural changes, Energy and XP are saved in the existing `PreviewStore.change` transaction. Repeated event IDs cannot reapply a success. The controller compares submitted context with transaction-time context to reject stale responses. Two database connections/tabs serialize writes; resource checks use the currently persisted state, never a stale displayed balance.

## Verification and limitations

New deterministic tests reproduce all four supplied cases and cover all modes, zero Energy, typed/misclassified preferences, legacy decomposition, stable IDs/history, unrelated/verified data, unknown references, conflicting operations, replay, insufficient Energy, reinforcement budgets, privacy and mocked version 3 server responses. Tests assert the existing XP values rather than changing them.

`tests/preview-energy-atomic-browser.py` uses real Chromium, DOM submission handlers, displayed/persisted Energy checks and real IndexedDB. It covers rollback after a forced write failure, invalid/failed/stale assessments, independent connections, two actual tabs released together via BroadcastChannel, and an unchanged production database. Existing memory, sandbox, network/Energy, evolution and life/framing browser suites also run. A stale life/framing assertion expecting no production Neural Stability row was corrected: main already creates that row. Production code was not changed to satisfy that test.

Commands from the checkout root (with the existing static server running on port 8000):

```sh
node --test tests/*.test.mjs
python3 tests/preview-energy-atomic-browser.py
python3 tests/memory-transactions-browser.py
python3 tests/sandbox-browser.py
python3 tests/network-energy-browser.py
python3 tests/evolution-browser.py
python3 tests/life-v2-browser.py
VERCEL_TOOLING_ROOT=/tmp/mindling-vercel-tooling node tests/vercel-learning-route.mjs
```

The optional Vercel tooling is installed externally as described in the routing report; it is not a project dependency. All automated model responses are mocked; **no paid model calls are made**. Tests demonstrate contract/transaction correctness, not the live model's reasoning quality. Extractive boundaries and legacy type repair are deliberately conservative, particularly outside the supported English/Swedish patterns; complex or truncated ambiguous legacy records can require clarification rather than an unsafe rewrite. No claim of universal semantic splitting or verified model compatibility is made.

Final validation in this instance: **184/184 Node tests passed** (26 new cases; zero failed/skipped); all six Chromium suites above passed; both actual-tab races passed (same event replay and distinct funded requests); the official Vercel discovery, Lambda build and compiled version 3 POST/method tests passed; `git diff --check` passed. The production application, Energy constants, Life rules, renderer, styles and HTML are unchanged from main.
