# NLI information-type investigation

## Result

The pinned `onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX` snapshot is not reliable enough to classify the lab's nine information types. The observed `QUESTION` bias is real model behavior for the current hypotheses, rather than a reversed NLI label mapping or an incorrect Transformers.js score calculation.

AI Model Lab now exposes the model identity, backend, candidate labels, hypothesis, mapped raw logits, normalized scores, score margin, and entropy. NLI and hybrid information-type results are marked `NLI_INFORMATION_TYPE_UNQUALIFIED`; structurally valid output is no longer presented as an accepted memory classification. Domain and topic remain explicitly identified as deterministic placeholders in the hybrid.

No production learning, gameplay, IndexedDB, or memory code is involved in this investigation.

## Verified pipeline behavior

The exact evaluated snapshot is:

```text
onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX
revision ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e
onnx/model_quantized.onnx
dtype q8
Transformers.js 3.8.1
WASM
```

Its `config.json` declares `entailment=0`, `neutral=1`, and `contradiction=2`. Transformers.js 3.8.1 reads that mapping and, with `multi_label: false`, applies a softmax across the entailment logit for each candidate. Direct computation from the raw browser logits matched every pipeline score in the five-case reproduction with a maximum absolute difference of `0`.

An independent ONNX Runtime CPU path used the same pinned model, tokenizer, premise/hypothesis pairs, and config-provided label mapping. It reproduced the same dominant `QUESTION` behavior and nearly identical scores. Small numeric differences between ONNX Runtime CPU and browser WASM did not change that conclusion.

For the first diagnostic input, the browser produced these representative raw values:

| Candidate | Entailment | Neutral | Contradiction | Final score |
| --- | ---: | ---: | ---: | ---: |
| factual claim | -0.508339 | 0.916135 | -0.423427 | 0.121734 |
| ambition | -0.525473 | 1.102560 | -0.596718 | 0.119666 |
| question | -0.123503 | 0.943176 | -0.847253 | 0.178873 |
| uncertain | -1.647716 | 0.969660 | 0.688765 | 0.038957 |

The model gives the `question` hypothesis the highest entailment logit even though the premise is an ambition. This is candidate wording bias in a generic multilingual NLI model applied to fine-grained communicative functions.

## Exact browser reproduction

Real Chromium/WASM inference reproduced the reported five cases:

| Input type | Expected | Predicted | Score |
| --- | --- | --- | ---: |
| personal aspiration | AMBITION | QUESTION | 0.178873 |
| trading recommendation | ADVICE | QUESTION | 0.202589 |
| market question | QUESTION | QUESTION | 0.315490 |
| cryptocurrency judgment | OPINION | QUESTION | 0.273110 |
| past share purchase | EXPERIENCE | QUESTION | 0.213826 |

Accuracy was `1/5` (`20.00%`). These five inputs are retained only as an exact reproduction set and were not used to select the proposed behavior.

## Evaluation design

[`nli-benchmark.json`](./nli-benchmark.json) defines the labeling policy and three separate sets:

- 5 exact diagnostic cases for browser-result reproduction.
- 27 tuning cases, three per category.
- 36 held-out cases, four per category: 20 English and 16 Swedish.

The benchmark includes all nine categories, shared-topic examples with different information types, paraphrases, negation, short inputs, and deliberately ambiguous cases. Expected labels are never included in model prompts. This is a small internally labeled qualification set, not an external gold-standard corpus.

Six general hypothesis formulations were compared without tailoring them to the five known sentences:

- Original: `This text is {candidate}.`
- Intent: `The intent of this sentence is {candidate}.`
- Purpose: `The sentence is written to {candidate action}.`
- Communicative function descriptions.
- Full direct hypotheses.
- Short direct hypotheses.

Four NLI scoring interpretations were also measured: standard entailment-logit softmax, normalized per-pair entailment probability, entailment minus contradiction, and entailment minus the stronger non-entailment logit. Only the tuning split was used to choose an experiment for held-out comparison.

## Before and after metrics

| Configuration | Diagnostic | Tuning | Held-out | English held-out | Swedish held-out |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original template and Transformers.js scoring | 20.00% | 14.81% | 13.89% | 15.00% | 12.50% |
| Tuning-selected intent template and normalized entailment probability | 40.00% | 29.63% | 22.22% | 25.00% | 18.75% |

The experiment improves aggregate accuracy but remains unusable: five categories have zero held-out recall, and its score is near chance for nine balanced classes (`11.11%`). It is therefore not installed as a semantic fix. The lab retains the original pipeline for transparent reproduction and marks its result unqualified.

### Original held-out per-category results

| Category | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| FACT_CLAIM | 0.000 | 0.000 | 0.000 | 4 |
| AMBITION | 0.000 | 0.000 | 0.000 | 4 |
| GOAL | 0.000 | 0.000 | 0.000 | 4 |
| ADVICE | 0.500 | 0.250 | 0.333 | 4 |
| INSTRUCTION | 0.000 | 0.000 | 0.000 | 4 |
| OPINION | 0.000 | 0.000 | 0.000 | 4 |
| QUESTION | 0.118 | 1.000 | 0.211 | 4 |
| EXPERIENCE | 0.000 | 0.000 | 0.000 | 4 |
| UNCERTAIN | 0.000 | 0.000 | 0.000 | 4 |

Rows are expected categories and columns are predictions in this order:

```text
FACT_CLAIM AMBITION GOAL ADVICE INSTRUCTION OPINION QUESTION EXPERIENCE UNCERTAIN
```

```text
FACT_CLAIM  0 0 0 0 0 0 4 0 0
AMBITION    0 0 0 0 0 0 4 0 0
GOAL        0 0 0 1 0 0 3 0 0
ADVICE      0 0 0 1 0 0 3 0 0
INSTRUCTION 0 0 0 0 0 0 4 0 0
OPINION     0 0 0 0 0 0 4 0 0
QUESTION    0 0 0 0 0 0 4 0 0
EXPERIENCE  0 0 0 0 0 0 4 0 0
UNCERTAIN   0 0 0 0 0 0 4 0 0
```

### Tuning-selected experiment held-out results

| Category | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| FACT_CLAIM | 0.200 | 1.000 | 0.333 | 4 |
| AMBITION | 0.000 | 0.000 | 0.000 | 4 |
| GOAL | 0.500 | 0.250 | 0.333 | 4 |
| ADVICE | 0.000 | 0.000 | 0.000 | 4 |
| INSTRUCTION | 0.167 | 0.250 | 0.200 | 4 |
| OPINION | 0.000 | 0.000 | 0.000 | 4 |
| QUESTION | 0.333 | 0.500 | 0.400 | 4 |
| EXPERIENCE | 0.000 | 0.000 | 0.000 | 4 |
| UNCERTAIN | 0.000 | 0.000 | 0.000 | 4 |

```text
FACT_CLAIM  4 0 0 0 0 0 0 0 0
AMBITION    2 0 1 0 0 1 0 0 0
GOAL        2 0 1 0 0 0 1 0 0
ADVICE      0 0 0 0 3 0 1 0 0
INSTRUCTION 1 0 0 0 1 0 1 0 1
OPINION     3 0 0 0 0 0 1 0 0
QUESTION    2 0 0 0 0 0 2 0 0
EXPERIENCE  3 0 0 0 1 0 0 0 0
UNCERTAIN   3 0 0 0 1 0 0 0 0
```

## Alternative model check

The larger `onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX@cdc8277b4682665e2f2e87cd83da7da07b153d75` q8 snapshot was evaluated with the same data and experiment grid. Its original configuration reached `40.74%` on tuning and `19.44%` on held-out data. Its tuning-selected intent template reached `44.44%` on tuning and still only `19.44%` held out. This rules out a simple swap to that general-purpose NLI checkpoint as a reliable solution.

A suitable replacement should be a multilingual encoder specifically fine-tuned and independently qualified for these nine definitions, or a browser-local instruction model that meets the same held-out criteria. Model size, valid JSON, or successful inference cannot substitute for category-level precision and recall.

## Reproduction

The independent reference runner requires `numpy`, `onnxruntime`, and `tokenizers` in a disposable test environment. Point it at a directory containing the exact snapshot's `config.json`, `tokenizer.json`, `tokenizer_config.json`, and `onnx/model_quantized.onnx`:

```bash
MINDLING_NLI_MODEL_ROOT=/tmp/mindling-nli-model \
  python3 tests/ai-lab-nli-reference.py > /tmp/nli-reference.json
```

For browser inference, serve Transformers.js 3.8.1 at `/runtime/`, the exact model snapshot at `/models/nli/`, and run:

```bash
MINDLING_NLI_FIXTURE_URL=http://127.0.0.1:8002 \
  python3 tests/ai-lab-nli-browser.py > /tmp/nli-browser.json
```

The browser script runs real q8 WASM inference, records token IDs, attention masks, every raw logit and score, and compares the direct computation with the Transformers.js pipeline. The separate AI Lab browser test verifies the UI/worker orchestration with an explicit fixture; that test is not model-quality evidence.

## Limitations

- The benchmark is intentionally broad but small and internally labeled. A production qualification should use independent annotators and substantially more held-out data.
- Swedish is evaluated because it is required by the product, although the MiniLMv2 checkpoint documentation does not list Swedish among its 15 languages.
- Real model quality was verified in an exact standalone Chromium/WASM harness and an independent ONNX Runtime path. An additional attempt to route the complete AI Lab worker through locally served 103 MB artifacts timed out in the test harness, so it is not counted as successful end-to-end real-model evidence.
- The change does not create a reliable nine-type classifier. It prevents an unreliable observation from being represented as accepted classification and makes the evidence inspectable.
