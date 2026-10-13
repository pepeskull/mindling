# Active semantic models

Normal gameplay performs browser-local inference using Transformers.js 3.8.1 (Apache-2.0), loaded from the pinned jsDelivr URL in `src/semantic/semantic-model.js`. Model assets are acquired from Hugging Face and cached by the runtime. Model revisions currently use `main`; the model weights are not revision-pinned. No service worker or guaranteed offline availability is provided.

| Model | Active responsibility |
| --- | --- |
| `Xenova/all-MiniLM-L6-v2` | Normalized 384-dimensional retrieval embeddings; WebGPU with WASM fallback |
| `Xenova/nli-deberta-v3-xsmall` | Bidirectional entailment/contradiction evidence, WASM |
| `Xenova/paraphrase-MiniLM-L3-v2` | Supporting paraphrase similarity, lazily loaded WASM |
| `cross-encoder/stsb-TinyBERT-L4` | Joint-input STS supporting evidence, lazily loaded WASM |

These models have Apache-2.0 upstream licensing. Queues serialize each inference session and copy output buffers. Stored embeddings are `Float32Array` values in the existing memories store, 1,536 bytes per 384-dimensional vector before record overhead.

Despite legacy names such as `Candidate`, `inspectSemanticIdentity`, and `evaluateShadowIdentity`, all four models participate in the current production canonical decision path. `SemanticEngine.evaluate` retrieves up to three candidates and requires identity agreement across bounded representatives. The cleanup retains these adapters and decision rules unchanged. Supporting similarity models alone are not canonical authority. The old diagnostic globals, model experiments, debug panel, and browser evaluation applications have been removed.

Knowledge-area rendering derives grouping and neural participation from stored canonical records; it does not acquire additional models. Historical boundary and annotation corpora now live exclusively in `tests/support/`, with no production imports.

The separate M4 preview sandbox can explicitly submit text to a protected Gemini server endpoint. This is distinct from normal gameplay's local semantic path. Configuration, authentication, rate limiting, and the pending live-provider verification are documented in [M4 deployment](milestone-4/deployment.md).
