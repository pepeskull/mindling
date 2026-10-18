# Mindling AI Model Lab

The lab at `/ai-lab/` compares browser-local semantic models without loading the Play Mindling application. It uses pinned ONNX model revisions through Transformers.js 3.8.1, runs candidates one at a time in disposable Web Workers, and keeps model files in the isolated `mindling-ai-lab-assets-v1` CacheStorage cache.

The lab never opens Mindling's IndexedDB databases, saves entered text as player memory, or changes the production model-installation policy. Model files come from Hugging Face and runtime files come from the pinned jsDelivr package. Inference text is not sent to either host.

## Running the lab

Serve the repository root over HTTP and open `/ai-lab/`. Pick an example or enter synthetic English or Swedish text, select candidates, and choose **Run selected models**. Downloads begin only after that action. Models run sequentially and failures remain visible.

For the embedding investigation, open **Memory Relationship Test**, keep the eight supplied English and Swedish lines, select MiniLM or E5, and run the analysis. These q8 embedding candidates use the qualified WASM path. Their WebGPU path is unavailable because real Chromium comparison against ONNX Runtime found corrupted semantic geometry.

The similarity matrix is exploratory. A high cosine similarity is not a calibrated probability and does not prove identical intent or information type. Automatic clustering is disabled by default. The optional complete-link mode and its threshold are visible, exploratory controls rather than a production recommendation. Enable **Developer diagnostics** for token counts, vector statistics, fingerprints, and detailed pair measurements. **Run broad benchmark** evaluates 21 synthetic cases spanning five topics, two languages, multiple intents, negative controls, and an exact repeat.

See [EMBEDDING_INVESTIGATION.md](./EMBEDDING_INVESTIGATION.md) for the root cause, trusted reference comparison, matrices, benchmark results, and reproducible commands.

The multilingual NLI candidate is diagnostic only. Its config-provided label mapping and Transformers.js score calculation are correct, but real q8 WASM and independent ONNX Runtime evaluation found severe candidate bias and only 13.89% held-out accuracy across the nine information types. The lab exposes raw mapped logits, hypotheses, margins, entropy, and the `NLI_INFORMATION_TYPE_UNQUALIFIED` status rather than accepting the top label as a memory classification. See [NLI_INVESTIGATION.md](./NLI_INVESTIGATION.md) for the benchmark, confusion matrices, template experiments, alternative-model check, and reproduction commands.

## Candidate notes

The catalog is pinned as follows. Download figures are approximate required model and tokenizer artifacts and exclude the shared runtime.

| Candidate | Repository and revision | dtype | Approx. download | License |
| --- | --- | --- | ---: | --- |
| Qwen2.5 0.5B | `onnx-community/Qwen2.5-0.5B-Instruct@22942cb7d7ba4cc81bb4673549ca4d4614469b5e` | q8 | 519 MB | Apache-2.0 |
| SmolLM2 360M | `onnx-community/SmolLM2-360M-Instruct-ONNX@fe7c7db4c8921c9e3fa1c65cfd296fb3b1b1a8f9` | q8 | 367 MB | Apache-2.0 |
| LaMini Flan-T5 248M | `Xenova/LaMini-Flan-T5-248M@091769c59d551fed68a9b8baf4f70f7effa69a56` | q8 | 278 MB | CC-BY-NC-4.0 |
| Multilingual MiniLM L12 | `Xenova/paraphrase-multilingual-MiniLM-L12-v2@2c4055b12046f11709e9df2c122e59ffbdc2f900` | q8 | 135 MB | Apache-2.0 |
| Multilingual E5 Small | `Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78` | q8 | 135 MB | MIT |
| BGE-M3 | `Xenova/bge-m3@4de13258303883538bd53b696b452bf8099f0858` | q8 | 587 MB | MIT |
| Multilingual MiniLMv2 NLI | `onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX@ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e` | q8 | 125 MB | MIT |
| Multilingual DistilBERT Sentiment | `Xenova/distilbert-base-multilingual-cased-sentiments-student@9d9ac661fd7b0b48535a1fc99b20ae6947629e65` | q8 | 139 MB | Apache-2.0 |
| TinyLlama 1.1B Chat | `onnx-community/TinyLlama-1.1B-Chat-v1.0-ONNX@cb463df0db21d713728366575b5a71f80de7adb2` | q4 | 912 MB | Apache-2.0 |
| MiniLM + NLI hybrid | The exact MiniLM and NLI revisions above | q8 | 260 MB, shared | Apache-2.0 + MIT |

All ten have Transformers.js ONNX artifacts and a WASM path. WebGPU remains available for candidates where it has not produced a known-invalid result. q8 WebGPU is disabled for the embedding candidates and the MiniLM hybrid; BGE-M3 is also restricted to WASM until separately qualified. Runtime support does not establish semantic quality. LaMini Flan-T5 has a CC-BY-NC-4.0 license and must not be treated as a production candidate without a licensing review. Swedish is only claimed where the upstream model documentation lists it. BGE-M3 and TinyLlama are intentionally retained as resource-heavy comparison points and may fail on constrained browsers.

Generated classifications are model observations, not factual verification. The NLI and hybrid candidates are explicitly unqualified for the nine-type task. Embedding candidates return vector diagnostics and relationship measurements rather than invented domain or type labels. The hybrid candidate identifies its deterministic domain/topic placeholders separately from model output.
