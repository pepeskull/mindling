# Mindling AI Model Lab

The lab at `/ai-lab/` compares browser-local semantic models without loading the Play Mindling application. It uses pinned ONNX model revisions through Transformers.js 3.8.1, runs candidates one at a time in disposable Web Workers, and keeps model files in the isolated `mindling-ai-lab-assets-v1` CacheStorage cache.

The lab never opens Mindling's IndexedDB databases, saves entered text as player memory, or changes the production model-installation policy. Model files come from Hugging Face and runtime files come from the pinned jsDelivr package. Inference text is not sent to either host.

## Running the lab

Serve the repository root over HTTP and open `/ai-lab/`. Pick an example or enter synthetic English or Swedish text, select candidates, and choose **Run selected models**. Downloads begin only after that action. Models run sequentially and failures remain visible.

For the finance relationship example, open **Memory Relationship Test**, keep these four lines, select an embedding candidate, and run the analysis:

```text
Become a trader in finance about stocks
learn trading and stocks
learn finance and crypto
The Earth rotates around its axis
```

The similarity matrix is exploratory. A high cosine similarity is not a calibrated probability and does not prove identical intent or information type.

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

All ten have Transformers.js ONNX artifacts and a WASM path; WebGPU is attempted when an adapter is available. Runtime support does not establish semantic quality. LaMini Flan-T5 has a CC-BY-NC-4.0 license and must not be treated as a production candidate without a licensing review. Swedish is only claimed where the upstream model documentation lists it. BGE-M3 and TinyLlama are intentionally retained as resource-heavy comparison points and may fail on constrained browsers.

Generated classifications are model observations, not factual verification. Embedding candidates return vector diagnostics and relationship measurements rather than invented domain or type labels. The hybrid candidate identifies its deterministic postprocessing separately from model output.
