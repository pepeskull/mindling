# Autonomous Knowledge Formation — large-scale benchmark

## Status and GO / NO-GO assessment

**Infrastructure:** `GO` for isolated browser stress testing and externally sourced evaluation imports.  
**Autonomous semantic Knowledge Areas:** `NO-GO`. Mindling currently has no validated open-vocabulary topic-relation authority. The benchmark therefore creates honest provisional singleton areas and records `NO_VALIDATED_TOPIC_RELATION_AUTHORITY`; it does not manufacture same-topic edges or claim that grouping is learning.

This milestone does not modify the production engine. It adds a standalone development application at `/benchmarks/knowledge-formation/` and imports only the existing read-only `createProvisionalTopic()` Knowledge Area 2.0 contract.

## Repository audit

| Capability | State | Benchmark interpretation |
| --- | --- | --- |
| Canonical identity and Teach | Production, frozen | Not invoked or modified by the benchmark |
| Knowledge Areas 1.0 | Production MiniLM cosine plus deterministic complete-link | Not suitable for 100k all-pairs execution and not treated as topic truth |
| Knowledge Area 2.0 contracts | Implemented, shadow-only | Used to create deterministic provisional singleton areas |
| Topic Graph | Architecture decision only | No graph edge is invented without an independent relation authority |
| MiniLM | Production retrieval/embedding | Not invoked by the scale runner; cosine is not topic authority |
| NLI/paraphrase/STS | Implemented for other semantic questions | Not repurposed as broad-topic evidence |
| E5/Jina/FLAN | Rejected or diagnostic-only experiments | Not loaded by the benchmark |
| Frozen evaluation corpora | Implemented | Remain small semantic gates; not expanded by synthetic labels |
| Large-scale execution | Added here | Measures ingestion, provisional formation, isolation, resumption, storage, and throughput |
| Independent semantic evidence | Missing | Reported explicitly; semantic comparisons remain zero |

Production `deriveKnowledgeDevelopment()` is quadratic because it computes all memory-pair cosines. Running it over 100,000 or 1,000,000 memories would violate the explicit no-all-pairs constraint. The benchmark does not disguise a replacement algorithm as production behavior: it exercises the only safe large-scale Knowledge Area 2.0 operation currently supported—provisional singleton formation—and reports that actual limitation.

## Dataset framework

### Deterministic generated stress data

`createGeneratedDataset()` is stateless by position and reproducible from:

- total size;
- deterministic seed;
- reference-topic count;
- order seed.

It supports the declared 1k, 10k, 100k, and 1m sizes. Topic keys and text are generated independently of Mindling output. English, Swedish, and Spanish templates cover short, long, ambiguous, paraphrastic, contradictory, incomplete, and polysemous structural forms. A shared lexeme is deliberately reused across many reference topics.

Generated labels have provenance `SYNTHETIC_STRUCTURE`, `humanVerified: false`, and `semanticAccuracyAuthority: false`. They can measure deterministic mechanics, fragmentation against generator structure, and infrastructure scale, but not human-level semantic accuracy.

Order permutations use an affine bijection selected from the order seed, so the generator does not materialize a million-element shuffle. Cases are generated on demand and batches remain bounded.

### External datasets

The UI imports NDJSON incrementally in 500-record chunks or accepts a JSON array. NDJSON is recommended for large files because JSON arrays must be parsed in memory. Imported records support this shape:

```json
{
  "caseId": "external-1",
  "memory": { "id": "memory-1", "content": "...", "language": "sv" },
  "reference": {
    "topicKey": "review-topic-1",
    "independentlyVerified": true,
    "expectedPairs": [{ "otherCaseId": "external-0", "expected": "SAME_AREA" }]
  },
  "provenance": {
    "kind": "HUMAN_REVIEWED",
    "source": "dataset citation or release ID",
    "humanVerified": true,
    "aiLabeled": false
  }
}
```

Only a record that is both independently verified and marked human-reviewed receives `semanticAccuracyAuthority: true`. AI-labeled and unverified references remain visible provenance but are excluded from semantic-accuracy counts. Expected labels never enter provisional formation.

## Execution and checkpointing

For each case the runner:

1. obtains one record by position;
2. constructs and freezes a canonical-shaped memory copy;
3. snapshots that copy before processing;
4. calls the actual `createProvisionalTopic()` foundation contract;
5. verifies that the canonical snapshot did not change;
6. records one provisional assignment and an explicit no-authority operation;
7. commits memories, operations, metrics, and the next position atomically after a bounded batch;
8. yields to the browser event loop.

Abort pauses at an item boundary. Starting the same deterministic run ID resumes from the stored `nextPosition`. The rolling result hash covers memory and provisional-area IDs, allowing identical runs to be compared without retaining all results in JavaScript memory.

The benchmark distinguishes:

- memory count;
- independently evaluated reference-pair count;
- unverified synthetic/AI reference-pair count;
- actual knowledge-formation operations;
- actual semantic model comparisons (currently zero);
- provisional assignments;
- same, different, and uncertain relation decisions;
- missed relationships and incorrect merges only where independently verified reference evidence permits those claims.

## IndexedDB isolation and bounded memory

The standalone page opens only:

```text
mindling-knowledge-benchmark (version 1)
```

It never imports `MindlingDatabase`, never opens `mindling-db`, and never reads or writes a user's identity, wallet, memories, neurons, synapses, pathways, or Mindling state. Benchmark stores are `runs`, `memories`, `operations`, `datasets`, `importedCases`, and `reports`.

The default checkpoint batch is 250 and is configurable up to 2,000. Dataset generation is stateless; NDJSON import and writes are chunked. IndexedDB retains detailed memory and decision records, while live JavaScript memory holds only the current batch and aggregate report. Browser quota remains an external limit, especially at one million records; quota failures are surfaced as failed/interrupted operations rather than semantic results.

`performance.memory` is recorded when the browser exposes it. `navigator.storage.estimate()` supplies before/after origin usage; the report labels this as an origin-wide estimate, not database-exclusive precision.

## Metrics and reports

The dashboard displays processed memories, provisional areas, verified and unverified reference pairs, semantic comparisons, decision counts, missed relationships, incorrect merges, throughput, peak exposed heap, origin storage growth, and failures.

Reports use schema `mindling-knowledge-benchmark-report-v1` and export as JSON or aggregate CSV. Every report includes:

- dataset provenance and deterministic configuration;
- checkpoint/progress counts;
- a deterministic rolling hash;
- processing latency and throughput;
- optional memory/storage observations;
- canonical mutation count;
- database isolation declaration;
- `semanticAuthorityAvailable: false`;
- `actualLearningClaimed: false`;
- `semanticAccuracyClaimed: false`.

The detailed decisions remain in the isolated IndexedDB stores rather than being embedded in the aggregate export, keeping report size bounded.

## Running the benchmark

Serve the repository as static files and open:

```text
http://localhost:<port>/benchmarks/knowledge-formation/
```

1. Choose 1,000 for smoke, 10,000 for functional, 100,000 for the primary benchmark, or 1,000,000 for extended stress.
2. Set the dataset seed, topic count, order seed, and checkpoint batch.
3. Select **Start / resume generated run**.
4. Use **Pause after current item** to test checkpoint recovery, then start the identical configuration to resume.
5. Export the aggregate JSON and CSV reports.
6. Repeat with another order seed to compare deterministic outcomes and performance.
7. For an external dataset, import NDJSON/JSON and select **Run imported dataset**.

The test suite also executes an in-memory 100,000-case run twice and asserts identical rolling hashes, 100,000 operations, zero canonical mutations, zero semantic comparisons, no production database access, and no learning claim. This demonstrates scalable deterministic runner mechanics—not browser quota, browser inference, or semantic quality. The 1,000,000 browser stress tier remains dependent on the target browser's available quota and memory and must be measured there.

## Current result and next decision

The infrastructure can execute autonomous, resumable provisional formation without manual interaction. It cannot demonstrate autonomous topic understanding because the independent Topic Graph edge authority identified in the architecture decision remains missing.

Further semantic development is `NO-GO` until a task-aligned evidence source is independently justified and passes the existing frozen quality gates. This benchmark should then accept that source only through a separately reviewed shadow adapter; it must continue to keep expected labels outside execution and report uncertainty honestly.

No production clustering, canonical identity, Teach behavior, MiniLM threshold, neural routing, specialization, development formula, IndexedDB v1 schema, topology, UI, renderer, token economy, or model inventory changed.
