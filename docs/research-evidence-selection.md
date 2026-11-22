# Research evidence selection and partial refinement

The Solar System task retained one of three candidates. Two failed
`QUOTE_NOT_IN_CITED_PASSAGE` because their proposed quotations did not occur
verbatim within a single paragraph of the named source. The diagnostics did
not retain the rejected text, so the cause of each mismatch remains unknown.

## Quotation selection

The evaluator receives source IDs, paragraph IDs scoped to each source, and
zero-based sentence numbers. It selects the first and last sentences of one
contiguous range and assesses whether that range fully supports a claim
relevant to the request. The server reconstructs the exact quote from the
retained text. Invalid references, incomplete support, and quotes that fail
the existing attribution, boundary, or date checks are rejected individually.
The browser and canonical memory pipeline receive the existing quote and
provenance fields. [Research contract](../src/autonomous/research-contract.js)

## Partial refinement

When the first assessment has both accepted and rejected candidates, Research
can reserve one more evaluation within the existing four-model-call ceiling.
It keeps the original accepted candidates and reuses the signed source
checkpoint. No additional web search is sent. New candidates go through the
same validation, duplicate filtering and canonical integration, with a limit
of three retained memories per task. If refinement fails, expires, or has no
budget, the task completes with the original candidates when local integration
is authorized. An interrupted dispatch keeps its reservation and is never
resent. [Learning engine](../src/autonomous/learning-engine.js) ·
[Refinement guards](../src/autonomous/evidence-refinement.js)

## Verification and limits

Eight targeted Node tests passed with mocked provider responses. They covered
exact reconstruction, invalid or unsupported selections, replay after reload,
duplicate filtering, lost responses, exhausted budgets, expired checkpoints,
and unresolved hosted-search work. The new request schema still needs live
provider verification. The excerpts are from cited hosted-search summaries.
Completed tasks are not reopened for refinement.
[Selection and refinement tests](../tests/research-evidence-selection.test.mjs)
