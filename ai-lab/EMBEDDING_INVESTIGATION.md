# Embedding similarity investigation

## Result

The unexpected matrices were reproduced with the pinned q8 files in real Chromium 141 using Transformers.js 3.8.1 and its WebGPU device. The same token IDs, attention masks, model revisions, pooling, normalization, and cosine implementation produced normal semantic separation through Transformers.js WASM and an independent Python ONNX Runtime CPU reference.

The failure is localized to q8 ONNX execution on the tested Transformers.js/WebGPU path for these BERT/XLM-R-style encoders. MiniLM's WebGPU matrix differed from the reference by as much as `0.968775`. E5 differed by as much as `0.269016` and returned bitwise-identical vectors for several different inputs. This evidence does not identify whether the lower-level defect belongs to ONNX Runtime WebGPU, a q8 operator, or its integration in Transformers.js.

The lab now runs MiniLM, E5, BGE-M3, and the MiniLM hybrid on WASM. An explicit WebGPU selection returns `WEBGPU_UNSUPPORTED_FOR_MODEL`; it never silently presents the known-invalid vectors. BGE-M3 WebGPU is disabled conservatively because it has not been independently qualified. This change affects only `/ai-lab/`.

## Inputs and model conventions

The reproduction used the eight requested sentences in their specified order. The pinned revisions were:

- `Xenova/paraphrase-multilingual-MiniLM-L12-v2@2c4055b12046f11709e9df2c122e59ffbdc2f900`, q8, 384 dimensions.
- `Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78`, q8, 384 dimensions.

Transformers.js 3.8.1 `FeatureExtractionPipeline` tokenizes with padding and truncation, performs attention-mask-aware mean pooling, and then L2-normalizes. MiniLM's upstream model card specifies the same mask-aware mean pooling. E5's upstream FAQ specifies `query: ` for every input in symmetric similarity and clustering tasks; `query:` versus `passage:` denotes the two sides of asymmetric retrieval. A passage-prefix comparison changed the E5 values slightly but did not correct WebGPU collapse, so the documented symmetric convention remains in use.

Sources:

- [Transformers.js 3.8.1 package](https://www.npmjs.com/package/@huggingface/transformers/v/3.8.1)
- [MiniLM model card](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- [Multilingual E5 model card and FAQ](https://huggingface.co/intfloat/multilingual-e5-small)

The eight browser token counts were `11, 12, 9, 9, 11, 14, 10, 10` for MiniLM and `14, 15, 12, 12, 14, 17, 13, 13` for E5 with the query prefix. Browser and reference token IDs and masks matched. Raw model output shapes were `[1, token count, 384]`; pooled shapes were `[1, 384]`. Norms were approximately one. Repeated runs had maximum component difference zero. Each browser result copies `tensor.data` into a new array, ruling out later tensor reuse as the cause. An independent cosine calculation reproduced every displayed matrix value.

## Before: Chromium WebGPU q8

MiniLM:

```text
1.000000 0.884893 0.960842 0.884181 0.912102 0.864848 0.930636 0.921342
0.884893 1.000000 0.925779 0.972518 0.959589 0.967872 0.943175 0.927826
0.960842 0.925779 1.000000 0.931554 0.946071 0.907280 0.959272 0.953511
0.884181 0.972518 0.931554 1.000000 0.972238 0.982135 0.962837 0.944318
0.912102 0.959589 0.946071 0.972238 1.000000 0.964894 0.973862 0.958490
0.864848 0.967872 0.907280 0.982135 0.964894 1.000000 0.944899 0.923326
0.930636 0.943175 0.959272 0.962837 0.973862 0.944899 1.000000 0.989111
0.921342 0.927826 0.953511 0.944318 0.958490 0.923326 0.989111 1.000000
```

E5 with `query: `:

```text
1.000000 0.991105 0.986152 0.986152 1.000000 0.975110 0.997355 0.997355
0.991105 1.000000 0.969501 0.969501 0.991105 0.969801 0.986450 0.986450
0.986152 0.969501 1.000000 1.000000 0.986152 0.965729 0.988541 0.988541
0.986152 0.969501 1.000000 1.000000 0.986152 0.965729 0.988541 0.988541
1.000000 0.991105 0.986152 0.986152 1.000000 0.975110 0.997355 0.997355
0.975110 0.969801 0.965729 0.965729 0.975110 1.000000 0.979089 0.979089
0.997355 0.986450 0.988541 0.988541 0.997355 0.979089 1.000000 1.000000
0.997355 0.986450 0.988541 0.988541 0.997355 0.979089 1.000000 1.000000
```

## After: Chromium WASM q8

MiniLM:

```text
1.000000 0.593664 0.186124 0.514946 -0.007530 0.309128 0.316502 0.560964
0.593664 1.000000 0.196924 0.594415 0.040522 0.162300 0.363141 0.596458
0.186124 0.196924 1.000000 0.086910 -0.000694 -0.029518 0.411760 0.124156
0.514946 0.594415 0.086910 1.000000 0.128313 0.244707 0.097176 0.644621
-0.007530 0.040522 -0.000694 0.128313 1.000000 0.007695 0.010329 0.001731
0.309128 0.162300 -0.029518 0.244707 0.007695 1.000000 0.044787 0.317984
0.316502 0.363141 0.411760 0.097176 0.010329 0.044787 1.000000 0.123171
0.560964 0.596458 0.124156 0.644621 0.001731 0.317984 0.123171 1.000000
```

E5 with `query: `:

```text
1.000000 0.898399 0.811266 0.848278 0.757803 0.851891 0.803378 0.817736
0.898399 1.000000 0.799121 0.861996 0.776333 0.822385 0.781248 0.793026
0.811266 0.799121 1.000000 0.781391 0.789238 0.780335 0.859145 0.774965
0.848278 0.861996 0.781391 1.000000 0.799245 0.803229 0.755725 0.788309
0.757803 0.776333 0.789238 0.799245 1.000000 0.761158 0.741423 0.723118
0.851891 0.822385 0.780335 0.803229 0.761158 1.000000 0.790108 0.838556
0.803378 0.781248 0.859145 0.755725 0.741423 0.790108 1.000000 0.857652
0.817736 0.793026 0.774965 0.788309 0.723118 0.838556 0.857652 1.000000
```

E5's absolute cosine scale remains high. Its model card explains that the training temperature compresses scores into roughly `0.7–1.0`; relative ordering is more meaningful than treating a raw value as a probability.

## Trusted reference comparison

The trusted reference used Python ONNX Runtime 1.23.2 CPU, Tokenizers 0.22.1, the same q8 ONNX files and tokenizer files, mask-aware mean pooling, and L2 normalization. It used no browser code and no gameplay data.

| Model | Max absolute pair-cosine difference, WASM vs reference | Mean absolute difference | Spearman pair-ranking correlation | WebGPU max difference |
| --- | ---: | ---: | ---: | ---: |
| MiniLM | 0.036750 | 0.011017 | 0.993979 | 0.968775 |
| E5 query | 0.012117 | 0.004706 | 0.983032 | 0.269016 |

The WASM differences are compatible with implementation and quantized-kernel variation for this evaluation: pair rankings are almost unchanged, different inputs remain distinct, and repeated inputs are exact. The WebGPU differences are far outside that observed range and destroy semantic ranking.

To reproduce the independent reference after placing the exact revision assets under the two named folders:

```bash
python3 -m venv /tmp/mindling-embedding-reference
/tmp/mindling-embedding-reference/bin/pip install numpy==2.3.4 onnxruntime==1.23.2 tokenizers==0.22.1
MINDLING_AI_LAB_REFERENCE_ROOT=/tmp/mindling-embedding-models \
  /tmp/mindling-embedding-reference/bin/python tests/ai-lab-embedding-reference.py
```

No TLS verification was disabled while obtaining model artifacts.

For the browser side, place the exact Transformers.js 3.8.1 distribution files and the two pinned model snapshots in the layout described by `tests/ai-lab-local-artifacts.py`, serve that directory locally, and run:

```bash
MINDLING_AI_LAB_FIXTURE_URL=http://127.0.0.1:8002 \
MINDLING_AI_LAB_BACKEND=wasm python3 tests/ai-lab-local-artifacts.py
```

Set the backend to `webgpu` to reproduce the original q8 behavior on a WebGPU-capable Chromium installation. The script executes the real runtime and model files and omits full vectors from its output.

## Broad benchmark

The lab benchmark contains 21 fixed synthetic inputs across finance, programming, astronomy, cooking, and animals. It includes English and Swedish, six information types, negative controls, and an exact repeat. Expected labels remain in the evaluator and are not sent to a model.

Real Chromium WASM q8 results:

| Metric | MiniLM | E5 query |
| --- | ---: | ---: |
| Expected-related mean | 0.308234 | 0.811551 |
| Expected-unrelated mean | 0.047776 | 0.757511 |
| Separation | 0.260457 | 0.054040 |
| Pairwise ranking accuracy | 0.862603 | 0.811811 |
| Exploratory false-positive rate | 0.113636 | 0.142045 |
| Exploratory false-negative rate | 0.272727 | 0.303030 |
| Exact-repeat cosine | 1.000000 | 1.000000 |
| Exact-repeat max component difference | 0 | 0 |

False-positive and false-negative rates use each model's best descriptive, in-sample balanced-error split (`0.158439` for MiniLM and `0.791194` for E5). These thresholds are diagnostic values only. They are not qualified for new data and are not used for automatic clustering.

## Clustering policy

The former universal `0.62` threshold and connected-component grouping made the embedding defect look worse by allowing a single bridge to merge otherwise separate topics. Automatic grouping is now disabled by default. The lab always exposes pairwise values. An optional complete-link mode merges groups only when every cross-pair reaches its explicitly displayed threshold. Relationships near an exploratory threshold remain available as uncertain measurements; no production Knowledge Area behavior changed.

## Tests and limitations

- `node --test tests/ai-lab.test.mjs` checks diagnostics, exact vector equality, default pairwise-only behavior, complete-link bridge prevention, broad metrics, model policy, and worker sequencing.
- `python3 tests/ai-lab-browser.py` checks UI orchestration, on-demand loading behavior, module isolation, and that a gameplay IndexedDB sentinel remains untouched. Its worker is a documented orchestration fixture, not model-quality evidence.
- `MINDLING_AI_LAB_REAL=1 python3 tests/ai-lab-real-embeddings.py` runs the exact eight inputs through the real lab worker and exports local diagnostics. It uses normal TLS verification.
- Selecting WebGPU for MiniLM in that real UI harness returned `WEBGPU_UNSUPPORTED_FOR_MODEL` before any runtime or model request, confirming the backend policy is visible rather than a silent fallback.

The WebGPU reproduction used Chromium's available SwiftShader software adapter because this environment had no hardware WebGPU adapter. q4f16 failed with a runtime numeric error and fp16 was unsupported on that adapter, so neither is presented as a qualified alternative. MiniLM and E5 were qualified on WASM. BGE-M3 was not run through the full trusted-reference comparison. The broad threshold statistics are based on a small synthetic set and cannot establish production-quality clustering.

The current UI's remote jsDelivr import could not be completed in this execution environment: Chromium returned `net::ERR_FAILED`, and the lab correctly exposed `RUNTIME_IMPORT`. Exact real inference therefore used locally served copies of artifacts that had been fetched with normal TLS verification. This transport failure is not model evidence and does not verify the deployed CDN path.
