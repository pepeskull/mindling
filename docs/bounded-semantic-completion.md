# Bounded semantic completion

## Confirmed findings and limits

The semantic Chat Completions handler receives `choices[0].finish_reason` and `usage` before checking the completion. Any non-`stop` finish reason produces `COMPLETION_INCOMPLETE` **before JSON parsing, evidence validation or persistence**. Previously the handler discarded these fields and the client called this `INVALID_SCHEMA`.

The supplied production export proves an HTTP 200 incomplete generation, not its exact finish reason. No historical raw upstream response or Vercel log containing usage was available for this investigation. Token exhaustion remains a hypothesis, not an established incident cause. No live model requests were made.

The old contract required up to four pair assessments, eight verbatim quotations, canonical IDs and JavaScript character offsets within 2,600 completion tokens. This is a confirmed avoidable output burden. The correction removes that burden without making JavaScript decide semantic relationships.

## Contract correction

The model receives full passages and indexed sentence tables. It selects a pair, orientation, relation and inclusive supporting sentence ranges. The server materializes precisely those ranges from the original text and passes them through the existing canonical evidence validator. Invalid ranges are rejected, not repaired. Material qualifications, trust and relation-specific validation remain mandatory. Browser and persistence contracts remain version 2.

New requests contain at most two pairs and prioritize incoming-to-existing knowledge over within-task pairs. This changes delivery priority, not semantic eligibility or evidence requirements. The output limit remains 2,600 tokens. A confirmed not-dispatched legacy reservation can retain its original four-pair context. Unknown or possibly billed attempts are not automatically replayed.

No daily, task or supplemental budget increases are introduced. The unchanged four-attempt lifetime ceiling means a new task can examine at most eight pairs rather than sixteen. Remaining coverage is not guaranteed; this change does not silently buy additional calls.

## Privacy-safe diagnostics

Semantic failures log correlation ID, phase/endpoint, upstream HTTP status, allowlisted error/detail, finish reason and bounded numeric token usage (prompt, completion and reasoning tokens). Unknown values become null. No prompt, passage, raw response, key or upstream error text is logged. The browser retains sanitized diagnostics. Incomplete generation now has the distinct `INCOMPLETE_GENERATION` category; billing uncertainty remains reserved.

## Offline verification

Five focused Node test files pass: bounded completion, model semantics, coverage, diagnostics and scheduling. The bounded test exercises the actual server handler and worker with mocked upstream responses: valid, empty, invalid-range, incomplete, malformed JSON and upstream HTTP error paths. Exact Unicode/Markdown evidence, reversed relationships, mixed valid/invalid proposals, reciprocal persistence, reload projection and no duplicate inference are covered.

For four long-evidence mock proposals, serialized output is reduced from 16,567 to 1,643 characters. This measures contract size, not tokens, model quality or production performance.

Chromium tests pass with real isolated IndexedDB stores for normal mode and Stage Preview, including reciprocal reload, graph projection, no repeated inference and unchanged XP, Energy and provenance. Gravity strings come from the user; fixture identities and provenance are explicitly synthetic. These tests do not establish live model reasoning quality.

## Deployment verification

Deploy server and client together; no migration or memory reset is required. Refresh clients to use two-pair batches. Existing canonical version-2 response consumers remain compatible. Previously unknown attempts stay reserved and are not reset.

During a separately authorized normal research run, inspect semantic diagnostics and the persisted pair result. A successful completion should retain exact supporting spans and reciprocal associations after reload. For failures, inspect `finishReason`, `accounting.completionTokens` and `accounting.reasoningTokens` alongside correlation ID and HTTP status. A `length` finish reason supports an output-limit diagnosis; other finish reasons require their own investigation. Do not infer success from HTTP 200 alone or repeat uncertain paid work automatically.
