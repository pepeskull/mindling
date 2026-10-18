"""Real Chromium/WASM NLI comparison using locally served exact artifacts.

Serve a fixture with Transformers.js 3.8.1 under `/runtime/` and the pinned
NLI snapshot under `/models/nli/`, then run:

  MINDLING_NLI_FIXTURE_URL=http://127.0.0.1:8002 \
    python3 tests/ai-lab-nli-browser.py

No model response is mocked. The fixture must be obtained with normal TLS
verification; this script does not alter certificate handling.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

REPOSITORY = Path(__file__).resolve().parents[1]
DATA = json.loads((REPOSITORY / "ai-lab/nli-benchmark.json").read_text())
BASE = os.environ.get("MINDLING_NLI_FIXTURE_URL", "http://127.0.0.1:8002")
LABELS = [
    "a factual claim", "a personal ambition or desire", "a planned goal",
    "a direct instruction or command", "advice or recommendation", "a personal opinion",
    "a question", "a past personal experience", "ambiguous or uncertain intent",
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(BASE)
    result = page.evaluate("""async ({ cases, labels }) => {
      const runtime = await import('/runtime/transformers.min.js');
      runtime.env.allowLocalModels = true;
      runtime.env.allowRemoteModels = false;
      runtime.env.localModelPath = '';
      runtime.env.useBrowserCache = false;
      runtime.env.backends.onnx.wasm.numThreads = 1;
      runtime.env.backends.onnx.wasm.wasmPaths = '/runtime/';
      const classifier = await runtime.pipeline('zero-shot-classification', 'models/nli', { dtype: 'q8', device: 'wasm' });
      const softmax = values => {
        const maximum = Math.max(...values);
        const exponentials = values.map(value => Math.exp(value - maximum));
        const total = exponentials.reduce((sum, value) => sum + value, 0);
        return exponentials.map(value => value / total);
      };
      const rows = [];
      for (const item of cases) {
        const pipelineOutput = await classifier(item.text, labels, { multi_label: false, hypothesis_template: 'This text is {}.' });
        const candidates = [];
        for (const label of labels) {
          const hypothesis = `This text is ${label}.`;
          const tokens = classifier.tokenizer(item.text, { text_pair: hypothesis, padding: true, truncation: true });
          const output = await classifier.model(tokens);
          candidates.push({
            label, hypothesis,
            tokenIds: Array.from(tokens.input_ids.data, Number),
            attentionMask: Array.from(tokens.attention_mask.data, Number),
            logits: Array.from(output.logits.data),
          });
        }
        const directScores = softmax(candidates.map(candidate => candidate.logits[classifier.entailment_id]));
        const byLabel = Object.fromEntries(pipelineOutput.labels.map((label, index) => [label, pipelineOutput.scores[index]]));
        rows.push({
          id: item.id,
          expected: item.expected,
          predicted: pipelineOutput.labels[0],
          score: pipelineOutput.scores[0],
          candidates: candidates.map((candidate, index) => ({ ...candidate, directScore: directScores[index] })),
          maxPipelineVsRawScoreDifference: Math.max(...labels.map((label, index) => Math.abs(byLabel[label] - directScores[index]))),
        });
      }
      const metadata = {
        backend: 'wasm', dtype: 'q8',
        label2id: classifier.label2id,
        entailmentId: classifier.entailment_id,
        contradictionId: classifier.contradiction_id,
        candidateLabels: labels,
        hypothesisTemplate: 'This text is {}.',
      };
      await classifier.dispose();
      return { metadata, rows };
    }""", {"cases": DATA["diagnostic"], "labels": LABELS})
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
