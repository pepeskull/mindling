# Mindling Life System 1.0

## Persistent simulation

Life records use schema version 1 inside IndexedDB schema version 2. Existing identity, neural, pathway, and memory stores are not cleared during upgrade; returning Mindlings receive a life record derived from their original `createdAt`. Neural Cycles are `floor(elapsed UTC milliseconds / 24 hours) + 1`. Age has no mortality rule.

Offline progression is elapsed-time based and processes at most 48 hours per application step. This bound protects against corrupt clocks and unexpectedly long absence; subsequent sessions continue from the bounded checkpoint. Nutrition decays 0.72/hour, rest 0.48/hour, and wellbeing 0.34/hour. Physical health deteriorates only when physical needs are severely low. Death requires health at or below 5, at least two other attributes at or below 5, and 96 continuous hours in critical condition. Nonterminal states can recover.

## Energy and care

Free energy resets at the first UTC midnight after the current day: Talk costs 1 and restores 5 wellbeing, Teach costs 2 and restores 10, and Deep Training costs 3 and restores 15. Activity state and any accepted learning record commit in one IndexedDB transaction. Opening or rejecting an activity does not charge energy.

Nourish, Rest, and Care cost no energy. Their 6, 8, and 12 hour cooldowns prevent repeated refill abuse. Autonomous networking is not implemented and the UI says **Not Connected**; no conversation or social reward is fabricated. Token top-up remains disabled and marked **Coming Soon**.

## Death and browser security

A deceased Mindling is read-only for ordinary activities. Starting again deliberately copies identity, life history, and memories into the `memorials` store before clearing active records. Browser-only IndexedDB cannot make death tamper-proof against a user who edits their local browser data; this is not server-authoritative permanence.

## Production boundary

Vercel returns 404 for `/benchmarks`, `/tools`, `/tests`, and `/docs`. Historical benchmark sources live under `tests/support` and are not application imports. Rejected FLAN, E5, and Jina diagnostic adapters and all semantic debug globals/panels were removed. The current production canonical identity models remain because Teach depends on them.

## Delivery audit

The tracked application/source asset footprint measured from the preceding commit was 301,609 bytes across `src/`, `css/`, `js/`, `benchmarks/`, and `index.html`. After this change the equivalent working-tree footprint is 169,921 bytes, a reduction of 131,688 bytes (43.7%). This excludes documentation and test-only benchmark support.

The browser benchmark page, semantic diagnostic panel, debug URL activation, debug global, and rejected E5/Jina/FLAN adapters were removed. Benchmark dataset/runner code was retained under `tests/support/benchmark` solely for reproducible automated tests. Production canonical identity inference remains because removing it would break valid memory identity behavior.

Local static-server checks establish that the normal URL and the obsolete diagnostic query return identical application HTML. The Vercel deny routes are covered by static tests but have not been verified against a deployed production URL in this environment. No real social networking, Gemini integration, token purchase, or server-authoritative death is claimed. A full browser screenshot could not be captured because the environment contains no browser executable.
