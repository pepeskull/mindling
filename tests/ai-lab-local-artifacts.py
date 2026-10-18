"""Real Chromium inference against locally served exact runtime/model assets.

Expected URL layout:
  /runtime/transformers.min.js and its WASM files
  /models/minilm/{tokenizer files,config files,onnx/model_quantized.onnx}
  /models/e5/{tokenizer files,config files,onnx/model_quantized.onnx}

Serve that directory with a normal local HTTP server and set
MINDLING_AI_LAB_FIXTURE_URL. This script prints diagnostics and matrices, not
full vectors. No inference is mocked.
"""
import json
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("MINDLING_AI_LAB_FIXTURE_URL", "http://127.0.0.1:8002")
BACKEND = os.environ.get("MINDLING_AI_LAB_BACKEND", "wasm")
DTYPE = os.environ.get("MINDLING_AI_LAB_DTYPE", "q8")
SENTENCES = [
    "I want to become a successful stock trader.",
    "You should learn how to invest in stocks.",
    "I think programming is amazing.",
    "How does the stock market work?",
    "The Earth rotates around its axis.",
    "Yesterday I lost money trading cryptocurrencies.",
    "Jag vill lära mig att programmera.",
    "Jag tycker att aktiehandel är svårt.",
]

arguments = ["--no-sandbox"]
if BACKEND == "webgpu":
    arguments += ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=arguments)
    page = browser.new_page()
    page.goto(BASE)
    result = page.evaluate("""async ({ texts, backend, dtype }) => {
      const runtime = await import('/runtime/transformers.min.js');
      runtime.env.allowLocalModels = true;
      runtime.env.allowRemoteModels = false;
      runtime.env.localModelPath = '';
      runtime.env.useBrowserCache = false;
      runtime.env.backends.onnx.wasm.numThreads = 1;
      runtime.env.backends.onnx.wasm.wasmPaths = '/runtime/';
      const cosine = (left, right) => {
        let dot = 0; let leftSquared = 0; let rightSquared = 0;
        for (let index = 0; index < left.length; index += 1) {
          dot += left[index] * right[index]; leftSquared += left[index] ** 2; rightSquared += right[index] ** 2;
        }
        return dot / Math.sqrt(leftSquared * rightSquared);
      };
      const diagnostics = vector => {
        const norm = Math.hypot(...vector);
        const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
        const variance = vector.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vector.length;
        return { dimensions: vector.length, norm, minimum: Math.min(...vector), maximum: Math.max(...vector), mean, standardDeviation: Math.sqrt(variance), finite: vector.every(Number.isFinite) };
      };
      const run = async (name, path, prefix) => {
        const pipe = await runtime.pipeline('feature-extraction', path, { dtype, device: backend });
        const rows = [];
        for (const original of texts) {
          const text = prefix + original;
          const tokens = pipe.tokenizer(text, { padding: true, truncation: true });
          const raw = await pipe.model(tokens);
          const tensor = await pipe(text, { pooling: 'mean', normalize: true });
          const vector = Array.from(tensor.data);
          rows.push({
            tokenIds: Array.from(tokens.input_ids.data, Number),
            attentionMask: Array.from(tokens.attention_mask.data, Number),
            tokenShape: tokens.input_ids.dims,
            rawOutputShape: (raw.last_hidden_state ?? raw.logits ?? raw.token_embeddings).dims,
            pooledShape: tensor.dims,
            diagnostics: diagnostics(vector),
            vector,
          });
        }
        const repeated = Array.from((await pipe(prefix + texts[0], { pooling: 'mean', normalize: true })).data);
        const matrix = rows.map(left => rows.map(right => cosine(left.vector, right.vector)));
        const repeatMaxAbsoluteDifference = Math.max(...repeated.map((value, index) => Math.abs(value - rows[0].vector[index])));
        rows.forEach(row => { delete row.vector; });
        await pipe.dispose();
        return { name, prefix, backend, dtype, rows, matrix, repeatMaxAbsoluteDifference };
      };
      let adapter = null;
      try { adapter = await navigator.gpu?.requestAdapter(); } catch {}
      return {
        webgpu: { api: Boolean(navigator.gpu), adapter: Boolean(adapter) },
        models: [
          await run('multilingual-minilm', 'models/minilm', ''),
          await run('multilingual-e5-small-query', 'models/e5', 'query: '),
          await run('multilingual-e5-small-passage', 'models/e5', 'passage: '),
        ],
      };
    }""", {"texts": SENTENCES, "backend": BACKEND, "dtype": DTYPE})
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
