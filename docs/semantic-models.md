# Local semantic model attribution

Mindling runs semantic inference in the browser with Transformers.js 3.8.1 (Apache-2.0). The runtime is loaded as a pinned native module from jsDelivr; model files are fetched from Hugging Face only on first acquisition and cached by Transformers.js in the browser Cache API. User text is passed only to local model sessions and is never sent to an inference API.

* **Embedding:** `Xenova/all-MiniLM-L6-v2` (`main`), a Transformers.js ONNX conversion of `sentence-transformers/all-MiniLM-L6-v2`, Apache-2.0. It produces normalized 384-dimensional sentence embeddings. The quantized weights are approximately 23 MB, plus tokenizer/configuration files.
* **Pair decision:** `Xenova/nli-deberta-v3-xsmall` (`main`), a Transformers.js ONNX conversion of `cross-encoder/nli-deberta-v3-xsmall`, Apache-2.0. It produces contradiction, entailment, and neutral evidence for a sentence pair. The selected int8 graph is approximately 90.4 MB, plus tokenizer/configuration files.

The first semantic operation requires network access to acquire uncached runtime/model assets. Cached operation can work offline when the browser retains HTTP/Cache API entries, but this application does not install a service worker and therefore does not promise offline availability before or after cache eviction. The embedding model attempts WebGPU when exposed by the browser and falls back to WASM if initialization fails; the pair classifier uses WASM for broad compatibility. No server inference is used.

Embeddings are stored per memory as structured-cloneable `Float32Array` values in the existing IndexedDB `memories` store. At 384 float32 values, the vector payload is 1,536 bytes per memory before record overhead.
