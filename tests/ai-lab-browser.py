"""Browser isolation and UI smoke test.

Start the repository first:
  python3 -m http.server 8000 --bind 127.0.0.1
Then run:
  python3 tests/ai-lab-browser.py

The Worker replacement below tests browser orchestration only. It is not model-quality evidence.
"""
import json
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8000")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    requested = []
    context.on("request", lambda request: requested.append(request.url))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{BASE}/ai-lab/", wait_until="networkidle")

    assert page.title() == "Mindling — AI Model Lab"
    assert page.locator("[data-model-card]").count() == 10
    assert page.locator("[data-current-model]").inner_text() == "No model running"
    assert len(page.locator("[data-relationship-input]").input_value().splitlines()) == 8
    assert page.locator("[data-clustering]").input_value() == "disabled"
    assert not any("/js/bootstrap.js" in url for url in requested)
    assert not any("huggingface.co" in url for url in requested), "models must not download on page load"
    assert not any("/src/" in url for url in requested), "game modules must not load in the lab"
    assert page.evaluate("indexedDB.databases().then(rows => rows.some(row => row.name === 'mindling-db'))") is False

    page.evaluate("""async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('mindling-db', 4);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('meta')) request.result.createObjectStore('meta', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('meta', 'readwrite');
          transaction.objectStore('meta').put({ id: 'ai-lab-sentinel', value: 'untouched' });
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }""")
    page.add_init_script("""(() => {
      const nativeOpen = indexedDB.open.bind(indexedDB);
      globalThis.__labDatabaseOpens = [];
      indexedDB.open = (...args) => { globalThis.__labDatabaseOpens.push(String(args[0])); return nativeOpen(...args); };
      class OrchestrationWorker {
        constructor() { this.listeners = { message: new Set(), error: new Set() }; }
        addEventListener(type, callback) { this.listeners[type].add(callback); }
        removeEventListener(type, callback) { this.listeners[type].delete(callback); }
        postMessage(message) {
          queueMicrotask(() => {
            let result;
            if (message.action === 'dispose') result = { requested: 1, completed: 1, workerMustTerminate: true };
            else if (message.payload.relationshipTexts?.length > 1) {
              const count = message.payload.relationshipTexts.length;
              const pairs = [];
              for (let from = 0; from < count; from += 1) for (let to = from + 1; to < count; to += 1) pairs.push({ from, to, cosine: .1234567, euclideanDistance: 1.234567, exactlyEqual: false, maximumAbsoluteDifference: .2, meanAbsoluteDifference: .1 });
              result = {
                ok: true, model: message.payload.model.key, identity: 'orchestration-fixture', backend: 'wasm',
                validation: { valid: true, errors: [] }, timings: { initializationMs: 1, inferenceMs: 1, totalMs: 2 },
                embeddings: Array.from({ length: count }, (_, index) => ({ valid: true, tokenCount: index + 2, dimensions: 2, norm: 1, minimum: 0, maximum: 1, mean: .5, standardDeviation: .5, fingerprint: `fixture${index}`, finite: true })),
                relationships: { matrix: Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => row === column ? 1 : .1234567)), pairs, clusters: [], clustering: { strategy: 'disabled', threshold: null, qualified: false, explanation: 'Fixture pairwise mode.' }, caution: 'Fixture caution.' },
              };
            } else if (message.payload.model.key === 'multilingual-nli') {
              result = {
                ok: true, model: message.payload.model.key, identity: 'nli-orchestration-fixture', backend: 'wasm',
                nativeOutput: { sequence: message.payload.text, labels: ['a question'], scores: [.2] },
                observed: { typeLabel: 'a question', score: .2, scoreMargin: .01, normalizedEntropy: .99, qualification: 'NLI_INFORMATION_TYPE_UNQUALIFIED' },
                nli: { qualified: false, qualificationReason: 'NLI_INFORMATION_TYPE_UNQUALIFIED', labelMapping: { entailment: 0, neutral: 1, contradiction: 2 }, candidateLabels: ['a question'], hypothesisTemplate: 'This text is {}.' },
                validation: { valid: false, structuralValid: true, errors: ['NLI_INFORMATION_TYPE_UNQUALIFIED'] },
                timings: { initializationMs: 1, inferenceMs: 1, totalMs: 2 },
              };
            } else result = { ok: true, model: message.payload.model.key, identity: 'orchestration-fixture', backend: 'wasm', raw: '{"fixture":true}', parsed: null, observed: null, validation: { valid: false, errors: ['ORCHESTRATION_FIXTURE'] }, timings: { initializationMs: 1, inferenceMs: 1, totalMs: 2 } };
            for (const callback of this.listeners.message) callback({ data: { id: message.id, result } });
          });
        }
        terminate() {}
      }
      globalThis.Worker = OrchestrationWorker;
    })();""")
    page.reload(wait_until="networkidle")
    opened_databases = page.evaluate("globalThis.__labDatabaseOpens")
    assert set(opened_databases) == {"mindling-ai-memory-lab-v1"}, opened_databases
    assert "mindling-db" not in opened_databases

    page.locator("[data-select-all]").click()
    assert page.locator("[data-model-card] input:checked").count() == 10
    page.locator("[data-deselect-all]").click()
    page.locator("[data-model-card]").nth(0).locator("input").check()
    page.locator("[data-model-card]").nth(1).locator("input").check()
    page.locator("[data-run]").click()
    page.locator("[data-run-progress]").filter(has_text="Sequence complete").wait_for(timeout=5000)
    assert page.locator(".result-card").count() == 2
    assert page.locator(".result-card").nth(0).inner_text().find("Invalid output") >= 0
    assert page.locator("[data-comparison] tr").count() == 2

    page.locator("[data-deselect-all]").click()
    page.locator('[data-model-card="multilingual-nli"] input').check()
    page.locator("[data-input]").fill("I want to become a professional stock trader.")
    page.locator("[data-run]").click()
    page.locator(".result-card .status").filter(has_text="Unqualified observation").wait_for(timeout=5000)
    nli_raw = json.loads(page.locator(".result-card pre").inner_text())
    assert nli_raw["nliDiagnostics"]["labelMapping"] == {"entailment": 0, "neutral": 1, "contradiction": 2}

    page.locator("[data-developer-diagnostics]").check()
    page.locator("[data-run-relationships]").click()
    page.locator("[data-relationship-output]").filter(has_text="0.123457").wait_for(timeout=5000)
    relationship_text = page.locator("[data-relationship-output]").inner_text()
    assert "PAIR DIAGNOSTICS" in relationship_text, relationship_text
    assert page.locator("[data-export]").is_enabled()

    sentinel = page.evaluate("""async () => new Promise((resolve, reject) => {
      const request = indexedDB.open('mindling-db', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const get = database.transaction('meta').objectStore('meta').get('ai-lab-sentinel');
        get.onsuccess = () => { database.close(); resolve(get.result); };
        get.onerror = () => reject(get.error);
      };
    })""")
    assert sentinel == {"id": "ai-lab-sentinel", "value": "untouched"}
    assert errors == [], errors
    browser.close()

print("AI lab browser isolation and orchestration checks passed.")
