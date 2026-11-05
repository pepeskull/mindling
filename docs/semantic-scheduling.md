# Semantic scheduling and authorization

Research keeps `LIMITS.inferenceCalls = 4`. Planning/clarification reserve individual calls; acquisition reserves two (hosted research and evidence assessment), or one for evaluation-only checkpoint recovery. These are inference reservations, not hosted search counts or billing receipts. A completed research task can therefore have no capacity for semantics.

## Cost policy

The semantic worker runs after acquisition. It first uses an unspent slot inside the task's original four-call limit. Exhausted tasks may use a **separately, explicitly authorized** semantic allowance. Existing grants upgrade in memory with `semanticCallsPerDay: 0`; ordinary research opt-in does not enable higher cost. No new allowance is activated by this PR.

Bounds per Mindling / existing IndexedDB store:

- Research: unchanged, at most four inference reservations per task.
- All semantic allocations combined: at most three reservations per UTC calendar day, including slots taken from research remainder.
- Supplemental semantic allowance: explicitly selected integer 0–3 per day, default 0.
- Per task: one semantic reservation per day; at most four distinct analysis fingerprints over its retained lifetime.
- Per exact normalized research topic: one new semantic reservation per day. Identical topic hashes cannot consume all three slots.
- Maximum extra calls: three per day globally in this store; at most four extra calls per retained task lifetime. Worst-case lifetime task allowance is 4 research + 4 supplemental = 8. A task can use at most one supplemental semantic call in any one day.
- For three new autonomous research tasks in a day: research remains at most 12 calls; explicit maximum supplemental authorization can increase that to at most 15, including historical semantic work. For N manual/other research tasks, the bound is 4N plus at most three supplemental calls in that day. This is not a platform-wide provider billing cap.

Increasing the allowance requires an explicit configuration action after cost review. The existing engine exposes `setSemanticAllowance(n)`, which uses the existing persisted `saveResearchPermissions(id, {enabled, semanticCallsPerDay:n})` path and bumps the grant revision. It is not invoked by rendering, ordinary research opt-in, migration or this implementation. It adds no user-facing controls or per-document approval. Setting 0 removes future supplemental allocation; disabling research prevents all semantic dispatch/persistence. No exhausted research counter is reset.

## Durable recovery

Each completed eligible task stores `semanticWork`: version, existing knowledge IDs, fingerprint, creation/update times, state, reason, allocation and reservation owner. Full passages are not copied into queue metadata. Small `semanticAttempts` history and a per-day `mind.semanticLedger` preserve ceilings and duplicate protection. Atomic existing gameplay transactions serialize concurrent tabs.

Existing online, visibility, authorization and research-completion opportunities drain the oldest eligible work first (stable task-ID tie-break), bounded by existing task count. Completed/abstained work is rediscovered locally to detect relevant changed candidates; identical fingerprints never dispatch again. No separate polling, midnight timer or closed-browser execution is claimed. Day-window capacity is reconsidered on the next supported lifecycle event.

`RESERVED` can be claimed by a new session before dispatch, without another reservation. Ownership is checked atomically when marking `DISPATCHED`; only that owner can proceed. An interrupted dispatched request becomes `OUTCOME_UNKNOWN`, keeps its reservation and is not replayed. A hard crash can leave `DISPATCHED`: that also blocks replay, since outcome is unknown. Browser bookkeeping cannot guarantee exactly-once external billing across lost receipts, cleared storage or independent devices.

The server may explicitly confirm `MODEL_UNAVAILABLE`, matching request ID, and `inferenceDispatched:false` before any completion request. Only this confirmation makes the existing reservation reusable after readiness recovery. Other failures remain conservative. No uncertain dispatched call is refunded. Permission revocation, identity/life changes, hidden/disposed apps and current candidate snapshots are checked before dispatch; grant revision, content/provenance, degree and identity are rechecked before reciprocal writes.

Diagnostics are local to Alt+Shift+M: waiting for allowance/permission/connectivity, no candidates, limits, reserved/dispatched/completed/unknown state, model readiness, policy and reserved/completed counts. No new Knowledge Network elements or rendering-triggered inference exist. Evidence validation and seven relation types from PR #129 are unchanged. Existing canonical content, provenance, XP and Energy are not rewritten.

## Validation limits

Focused offline tests simulate atomic serialization, reload, authorization, model readiness, unknown outcomes, limits and reciprocal integration. They do not prove real IndexedDB/browser/provider behavior. Default-zero supplemental authorization intentionally means budget-exhausted historical tasks can remain waiting until an allowance is explicitly granted. No production success or exactly-once provider billing is claimed.
