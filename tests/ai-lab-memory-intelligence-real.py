"""Opt-in real Chromium/WASM qualification for Memory Intelligence Lab.

Prepare a same-origin fixture containing exact pinned artifacts:
  runtime/transformers.min.js and ONNX Runtime WASM files
  models/minilm/{config,tokenizer*,onnx/model_quantized.onnx}
  models/qwen3/{config,tokenizer*,generation_config,onnx/model_quantized.onnx}

Run a bounded gate (default five development cases per stage):
  MINDLING_MEMORY_LAB_REAL=1 \
  MINDLING_MEMORY_FIXTURE_ROOT=/tmp/mindling-memory-fixture \
    python3 tests/ai-lab-memory-intelligence-real.py

Set MINDLING_MEMORY_CASE_LIMIT=0 to run every development and held-out case.
The script uses real model inference, synthetic benchmark text and no player data.
"""
import json
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

if os.environ.get("MINDLING_MEMORY_LAB_REAL") != "1":
    raise SystemExit("Not run: set MINDLING_MEMORY_LAB_REAL=1 to consent to real local-model inference.")

REPOSITORY = Path(__file__).resolve().parents[1]
FIXTURE = Path(os.environ.get("MINDLING_MEMORY_FIXTURE_ROOT", ""))
if not FIXTURE.is_dir():
    raise SystemExit("Set MINDLING_MEMORY_FIXTURE_ROOT to the prepared exact model fixture.")
LIMIT = int(os.environ.get("MINDLING_MEMORY_CASE_LIMIT", "5"))
PORT = int(os.environ.get("MINDLING_MEMORY_TEST_PORT", "8011"))


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = unquote(urlparse(path).path)
        if clean.startswith("/fixture/"):
            return str(FIXTURE / clean.removeprefix("/fixture/"))
        return str(REPOSITORY / clean.lstrip("/"))

    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        context = browser.new_context()
        page = context.new_page()
        page.goto(f"http://127.0.0.1:{PORT}/ai-lab/", wait_until="networkidle")
        started = time.monotonic()
        result = page.evaluate("""async limit => {
          const runtime = await import('/fixture/runtime/transformers.min.js');
          const { buildAnalysisPrompt, extractModelJson, validateModelAnalysis } = await import('/ai-lab/memory-intelligence-schema.js');
          const { MEMORY_BENCHMARK, topicMetrics, classificationMetrics, relationshipMetrics } = await import('/ai-lab/memory-intelligence-benchmark.js');
          runtime.env.allowLocalModels = true; runtime.env.allowRemoteModels = false; runtime.env.localModelPath = ''; runtime.env.useBrowserCache = false;
          runtime.env.backends.onnx.wasm.numThreads = 1; runtime.env.backends.onnx.wasm.wasmPaths = '/fixture/runtime/';
          const initStarted = performance.now();
          const encoder = await runtime.pipeline('feature-extraction', '/fixture/models/minilm', { dtype: 'q8', device: 'wasm' });
          const generator = await runtime.pipeline('text-generation', '/fixture/models/qwen3', { dtype: 'q8', device: 'wasm' });
          const initializationMs = performance.now() - initStarted;
          const take = cases => limit === 0 ? cases : cases.filter(item => item.split === 'development').slice(0, limit);
          const infer = async (text, candidateText = null) => {
            const started = performance.now();
            const embedding = Array.from((await encoder(text, { pooling: 'mean', normalize: true })).data);
            let similarity = null; let context = { categories: [], memories: [] };
            if (candidateText) {
              const other = Array.from((await encoder(candidateText, { pooling: 'mean', normalize: true })).data);
              similarity = embedding.reduce((sum, value, index) => sum + value * other[index], 0);
              context = { categories: [{ id: 'category-1', domain: 'Candidate domain', name: 'Candidate topic', similarity }], memories: [{ id: 'memory-1', canonicalText: candidateText, categoryId: 'category-1', informationType: 'UNCERTAIN', similarity }] };
            }
            const messages = buildAnalysisPrompt(text, context);
            const prompt = generator.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
            const output = await generator(prompt, { max_new_tokens: 360, do_sample: false, return_full_text: false, add_special_tokens: false });
            let raw = output?.[0]?.generated_text; if (Array.isArray(raw)) raw = raw.at(-1)?.content;
            const parsed = extractModelJson(raw); const validation = parsed.value ? validateModelAnalysis(parsed.value, text, context) : { valid: false, errors: [parsed.error], value: null };
            return { raw, parseMethod: parsed.method, validation: { valid: validation.valid, errors: validation.errors }, value: validation.value, similarity, ms: performance.now() - started };
          };
          const topicCases = take(MEMORY_BENCHMARK.topic);
          const typeCases = take(MEMORY_BENCHMARK.informationType);
          const relationCases = take(MEMORY_BENCHMARK.relationship);
          const topicRows = []; for (const item of topicCases) topicRows.push({ item, result: await infer(item.text) });
          const typeRows = []; for (const item of typeCases) typeRows.push({ item, result: await infer(item.text) });
          const relationRows = []; for (const item of relationCases) relationRows.push({ item, result: await infer(item.right, item.left) });
          const topic = topicMetrics(topicCases, topicRows.map(row => ({ domain: row.result.value?.domain, topic: row.result.value?.topic })));
          const informationType = classificationMetrics(typeCases, typeRows.map(row => row.result.value?.informationType?.primary || 'UNCERTAIN'));
          const relationship = relationshipMetrics(relationCases, relationRows.map(row => row.result.value?.memoryDecision?.modelProposedAction || 'NEEDS_REVIEW'));
          const allRows = [...topicRows, ...typeRows, ...relationRows];
          const structuralAcceptance = allRows.length ? allRows.filter(row => row.result.validation.valid).length / allRows.length : 0;
          globalThis.__memoryRealModels = { encoder, generator };
          return {
            models: { embedding: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2@2c4055b12046f11709e9df2c122e59ffbdc2f900:q8/wasm', analysis: 'onnx-community/Qwen3-0.6B-ONNX@58ca03a5e7b354b480b1a82b34bde8dc7b854cc0:q8/wasm' },
            initializationMs, requestedLimit: limit, counts: { topic: topicCases.length, informationType: typeCases.length, relationship: relationCases.length },
            structuralAcceptance, metrics: { topic, informationType, relationship }, rows: allRows,
            memory: Number.isFinite(performance?.memory?.usedJSHeapSize) ? { usedJSHeapBytes: performance.memory.usedJSHeapSize, source: 'performance.memory' } : null,
          };
        }""", LIMIT)
        result["wallSeconds"] = time.monotonic() - started
        context.set_offline(True)
        try:
            result["offlineResidentInference"] = page.evaluate("""async()=>{
              const {encoder,generator}=globalThis.__memoryRealModels;
              const embedding=await encoder('Offline synthetic probe.',{pooling:'mean',normalize:true});
              const prompt=generator.tokenizer.apply_chat_template([{role:'user',content:'Return only the word READY.'}],{tokenize:false,add_generation_prompt:true,enable_thinking:false});
              const output=await generator(prompt,{max_new_tokens:8,do_sample:false,return_full_text:false,add_special_tokens:false});
              return {embeddingDimensions:embedding.data.length,generated:output?.[0]?.generated_text};
            }""")
        finally:
            context.set_offline(False)
        page.evaluate("""async()=>{await globalThis.__memoryRealModels.encoder.dispose();await globalThis.__memoryRealModels.generator.dispose();delete globalThis.__memoryRealModels}""")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
