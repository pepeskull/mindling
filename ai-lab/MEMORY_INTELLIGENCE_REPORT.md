# Memory Intelligence Lab investigation

## Result

The isolated lab implements the full technical path from input through local embedding retrieval, local structured-analysis generation, strict validation, explicit review, and an atomic memory-graph update. Multilingual MiniLM L12 q8 on WASM remains qualified for candidate retrieval. The evaluated Qwen3 0.6B q8 generation model is **not qualified** for autonomous topic, information-type, category, or relationship decisions.

Because the semantic model failed the predefined acceptance gate, every generated decision is forced to `NEEDS_REVIEW`. The lab does not silently merge memories, create categories, or accept model labels. This is a deliberate safety boundary supported by the real-model results below, rather than a claim that the requested autonomous intelligence is complete.

No production gameplay code, player database, memory schema, energy, XP, identity, or neural system is imported or modified. The lab uses the dedicated `mindling-ai-memory-lab-v1` IndexedDB database.

## Pipeline and provenance

1. The lab preserves the exact input as an observation.
2. `Xenova/paraphrase-multilingual-MiniLM-L12-v2` retrieves up to six candidate canonical memories and four related categories with cosine similarity. Similarity is shown as retrieval evidence only.
3. `onnx-community/Qwen3-0.6B-ONNX` receives the input as untrusted JSON plus only the retrieved candidate IDs. It proposes language, domain, topic, primary and secondary information types, category handling, and a memory relationship.
4. Strict code validates the output shape, Unicode labels, confidence ranges, exact source quotes, and exact candidate IDs. Invalid output becomes an unqualified neutral result.
5. The final action is always `NEEDS_REVIEW`. A developer explicitly chooses `CREATE_NEW`, `LINK_EXISTING`, `RELATED_BUT_DISTINCT`, or `CONTRADICTS_OR_UPDATES`, along with the reviewed labels and type.
6. One atomic IndexedDB transaction records the review. Each submission is a separate immutable observation. Linking updates a normalized embedding centroid while preserving all observations. Related or contradictory inputs create separate canonical nodes and reversible relationships.

The explicit undo control reverses the latest accepted decision in a new transaction. It marks the decision's observation and any newly created graph objects as undone instead of deleting their audit history, and recomputes a linked memory centroid when needed. A newly created canonical memory cannot be undone while later active observations or relationships still depend on it; those later decisions must be undone first.

The primary information type is the main communicative act. Secondary types are allowed only when another act is independently expressed, never merely implied by the subject. The model's primary and secondary proposals are visible but unqualified; the reviewer owns the stored classification.

## Models

| Role | Exact model | dtype/backend | Size | Qualification |
| --- | --- | --- | ---: | --- |
| Candidate retrieval | `Xenova/paraphrase-multilingual-MiniLM-L12-v2@2c4055b12046f11709e9df2c122e59ffbdc2f900` | q8/WASM | 135 MB | Qualified for retrieval only by the PR #76 reference comparison |
| Structured analysis | `onnx-community/Qwen3-0.6B-ONNX@58ca03a5e7b354b480b1a82b34bde8dc7b854cc0` | q8/WASM | 627 MB | Unqualified for every semantic decision |
| Browser runtime | `@huggingface/transformers@3.8.1` | WASM, one thread | shared | Runtime only |

Both model repositories are pinned to immutable revisions. The underlying Qwen3 model and the ONNX repository identify the model as Apache-2.0. Downloads start only after **Download and enable pipeline** is selected. The worker sets WASM explicitly and never silently switches backend.

## Predefined evaluation

Thresholds were committed before the real gate:

- Topic: domain accuracy 0.85, topic accuracy 0.80, category reuse 0.90, duplication at most 0.05.
- Information type: accuracy 0.80, macro-F1 0.75, every class recall at least 0.65, abstention at most 0.30.
- Relationship: link precision 0.95, macro-F1 0.75, false merges at most 0.02, contradiction recall 0.80.
- End to end: decision accuracy 0.80, preservation 1.00, idempotency 1.00.

The benchmark source contains:

- 100 topic cases from 25 concepts in English and Swedish. The first 10 concepts are development data and the remaining 15 are held out, so held-out topics are unseen.
- 108 information-type cases: nine classes across 12 independent English and Swedish subjects. It includes negation, goals, advice, questions, experience, instructions, and deliberately uncertain fragments.
- 120 relationship pairs from 20 base memories. They cover cross-language paraphrases, same-topic distinctions, negation, changed details, unrelated text, and ambiguity.

Prompt examples from the task are excluded. Expected labels are never passed to the model. The complete specification and thresholds are exported with the lab state.

## Real browser inference

All measurements below used headless Chromium, Transformers.js 3.8.1, the exact pinned q8 files, normal browser WASM, one CPU thread, and synthetic inputs. No mocked output or external inference API was used.

### Qwen2.5 baseline

The previous `Qwen2.5-0.5B-Instruct` candidate generated no accepted JSON for 10 unseen English and Swedish inputs. It often answered the sentence or hallucinated a new scenario. Ten generations took 431.37 seconds. Examples:

- Input: `The Moon takes about 27 days to orbit Earth.`
- Output began: `Based on the information provided, there appears to be a mix-up between "Moon" and "Mars".`
- Input: `Kanske havet senare.`
- Output: `I'm sorry, but I don't understand what you're asking about "Kanske"...`

This model was rejected for the memory pipeline.

### Qwen3 exploratory analysis

With its official chat template and thinking disabled, Qwen3 produced extractable JSON for five of five unseen inputs, but only two of five information types were correct. Both Swedish examples were labelled English; two outputs fabricated or altered evidence; most confidence values were zero. Five generations took 200.19 seconds. Examples:

- `I hope to design affordable medical devices one day.` → `AMBITION`, but with confidence `0` and topic `design`.
- `You should compare the fees before choosing an index fund.` → `AMBITION` instead of `ADVICE`.
- `Jag tycker att stadens nya bibliotek är vackert.` → `FACT_CLAIM`, language `en`, and an evidence quote that changed capitalization.
- `Why do leaves change colour in autumn?` → `FACT_CLAIM` with fabricated explanatory evidence.

### Full-schema gate

A real-browser gate then exercised the committed full prompt and validator on one development topic, one information-type case, and one cross-language relationship pair. This bounded run took 386.996 seconds after 11.061 seconds of initialization. Peak JavaScript heap reported by Chromium was approximately 1.75 GB.

Structural acceptance was **0/3**:

- Topic input `Replanting reeds can help a drained marsh recover.` produced plausible fields but returned `categoryDecision` as a string and omitted the required structured memory decision.
- Fact input `The observatory lens bends incoming light` repeated incomplete fields until it hit the generation limit, leaving invalid JSON.
- Cross-language sailboat paraphrases scored 0.933320 in MiniLM retrieval, but Qwen3 quoted the English candidate as evidence for the Swedish input and returned invalid decision structures. The high similarity therefore did not become a merge.

The same resident model instances successfully performed an embedding and generated `READY.` after the browser context was placed offline. This verifies resident offline inference, not cold-cache offline installation. The first download still requires network access; model assets are then handled by the isolated lab cache.

The bounded three-case result is sufficient to reject qualification, but it is not a statistically meaningful quality estimate. A full evaluation would require 328 slow Qwen generations and was not represented as completed. The harness supports all cases by setting `MINDLING_MEMORY_CASE_LIMIT=0`.

The complete raw bounded result is committed as [`memory-intelligence-real-baseline.json`](./memory-intelligence-real-baseline.json). It contains only synthetic benchmark text, model output, metrics, and performance measurements.

## Reproduction

Prepare a same-origin fixture containing the exact pinned runtime and model artifacts described at the top of `tests/ai-lab-memory-intelligence-real.py`, then run:

```sh
MINDLING_MEMORY_LAB_REAL=1 \
MINDLING_MEMORY_FIXTURE_ROOT=/tmp/mindling-memory-fixture \
python3 tests/ai-lab-memory-intelligence-real.py
```

Set `MINDLING_MEMORY_CASE_LIMIT=0` for all development and held-out cases. The script emits raw outputs, validation errors, timings, confusion data, and false-merge measurements as JSON. The normal unit and browser tests verify the graph, review boundary, storage isolation, persistence, and reset behavior; those tests do not count as model-quality evidence.

## What is deterministic

Strict JSON parsing, output validation, exact evidence checks, ID allowlists, cosine candidate ranking, final review gating, embedding centroid updates, IndexedDB transactions, idempotency, and category reconciliation are deterministic code. Topic names, information types, and relationship proposals come from the local generation model; they are not keyword mappings. Human review supplies the stored semantic decision because the model is unqualified.

## Limitations

- The pipeline cannot yet autonomously organize memories with demonstrated reliability. Topic discovery, type classification, category reuse, equivalence, and contradiction detection remain unqualified.
- Qwen3 q8/WASM is slow and memory intensive on CPU. A single generation took roughly 67 to 198 seconds in the full-schema gate.
- The browser reports model confidence values, but they are model-authored estimates rather than calibrated probabilities.
- A warm offline inference works while model objects remain resident. A cold offline reload depends on every required artifact already being present in CacheStorage and was not independently proven by the real-model gate.
- Category reuse and memory decisions never execute automatically. This prevents false merges but requires developer review.
- Production integration is intentionally absent. A different qualified model, fine-tuned classifier, or separately approved architecture is needed before any player-facing use.
