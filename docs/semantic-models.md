# Local semantic model attribution

Mindling runs semantic inference in the browser with Transformers.js 3.8.1 (Apache-2.0). The runtime is loaded as a pinned native module from jsDelivr; model files are fetched from Hugging Face only on first acquisition and cached by Transformers.js in the browser Cache API. User text is passed only to local model sessions and is never sent to an inference API.

* **Embedding:** `Xenova/all-MiniLM-L6-v2` (`main`), a Transformers.js ONNX conversion of `sentence-transformers/all-MiniLM-L6-v2`, Apache-2.0. It produces normalized 384-dimensional sentence embeddings. The quantized weights are approximately 23 MB, plus tokenizer/configuration files.
* **Pair decision:** `Xenova/nli-deberta-v3-xsmall` (`main`), a Transformers.js ONNX conversion of `cross-encoder/nli-deberta-v3-xsmall`, Apache-2.0. It produces contradiction, entailment, and neutral evidence for a sentence pair. The selected int8 graph is approximately 90.4 MB, plus tokenizer/configuration files.

The first semantic operation requires network access to acquire uncached runtime/model assets. Cached operation can work offline when the browser retains HTTP/Cache API entries, but this application does not install a service worker and therefore does not promise offline availability before or after cache eviction. The embedding model attempts WebGPU when exposed by the browser and falls back to WASM if initialization fails; the pair classifier uses WASM for broad compatibility. No server inference is used.

Embeddings are stored per memory as structured-cloneable `Float32Array` values in the existing IndexedDB `memories` store. At 384 float32 values, the vector payload is 1,536 bytes per memory before record overhead.

## Development calibration

On `localhost`, or when the page is opened with `?semantic-debug=1`, a read-only diagnostic is available as `window.__MINDLING_SEMANTIC_DEBUG__`. `compare(left, right)` returns cosine similarity, both directional NLI probability sets, mutual-entailment evidence, a decision reason, and the final classification. `runMatrix()` runs the complete 19-pair acceptance matrix against the production models; `runGeneralization()` covers reordered clauses, polarity, quantity, entities, time, causality, preferences, capability, obligation, uncertainty, conditionals, and role reversal. These examples are diagnostics only and are never consulted by runtime decisions. None of the methods mutate Mindling state or send text to an inference service.

`inspectEmbeddings(left, right)` reports dimensions, L2 norms, the first 12 values, byte-value identity, backing-buffer identity, and cosine similarity. Encoder and NLI calls are serialized independently because browser ONNX execution providers may reuse session output buffers. Every 384-value embedding is copied before the next encoder invocation begins.

The pair model's checked configuration maps output index `0` to `contradiction`, `1` to `entailment`, and `2` to `neutral`. Runtime initialization validates these names and fails truthfully instead of guessing an order. The embedding pipeline uses the complete input, tokenizer-provided attention mask, model-specific mean pooling, and post-pooling normalization through the Transformers.js feature-extraction pipeline. Mindling has no separate text-to-vector cache: persisted embeddings belong to complete canonical memory records in IndexedDB.

## Equivalence model investigation

`Xenova/paraphrase-MiniLM-L3-v2` is available through `inspectEquivalence(left, right)` as a lazy, diagnostic-only candidate. Its Apache-2.0 upstream model has 17.4 million parameters, produces 384-dimensional vectors, and its int8 ONNX graph is approximately 17.4 MB. It uses serialized WASM inference and browser caching. It is not canonical authority because it is still a bi-encoder similarity model rather than a joint sentence-pair classifier, and it has not yet been measured against Mindling's 19-pair matrix in a real browser.

Two joint-input alternatives were rejected for production pending measurements: `cross-encoder/stsb-distilroberta-base` is Apache-2.0 and predicts continuous sentence-pair similarity, but its available full ONNX graph is approximately 329 MB; `cross-encoder/quora-distilroberta-base` is Apache-2.0 and predicts duplicate-question similarity, but its portable full graph is likewise approximately 329 MB and its 82.8 MB quantizations are architecture-specific. Both impose an unjustified mobile download/memory cost and neither has demonstrated the required proposition-equivalence distinction on the Mindling matrix.

The Chromium `powerPreference` warning on Windows and ONNX Runtime messages about shape nodes being assigned to CPU are expected execution-provider performance notices, not semantic failures. `runtimeInfo()` reports the encoder backend selected by Mindling. References to `inpage.js` do not occur in this repository and normally identify an injected browser-extension script; Mindling does not suppress them.
