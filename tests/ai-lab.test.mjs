import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CATALOG, assertCatalog } from '../ai-lab/model-catalog.js';
import {
  extractJson, validateStructuredAnalysis, embeddingDiagnostics, relationshipReport,
  deterministicHybridResult, TYPE_LABELS,
} from '../ai-lab/evaluation.js';
import { ModelSequenceController } from '../ai-lab/model-runner.js';

test('catalog contains ten real pinned candidates with explicit metadata', () => {
  assert.equal(assertCatalog(), true);
  assert.equal(MODEL_CATALOG.length, 10);
  assert.equal(new Set(MODEL_CATALOG.map(model => model.key)).size, 10);
  assert.equal(MODEL_CATALOG.filter(model => model.kind === 'hybrid').length, 1);
  assert.ok(MODEL_CATALOG.every(model => model.bytes > 0 && model.license && model.languages));
  assert.ok(MODEL_CATALOG.flatMap(model => model.components || [model]).every(model => /^[a-f0-9]{40}$/.test(model.revision)));
});

test('structured validation preserves raw failures and exact evidence rules', () => {
  const input = 'Jag tycker att programmering är roligt.';
  const fenced = extractJson('```json\n{"domain":"Computing","topic":"Programming enjoyment","type":"OPINION","confidence":0.8,"evidence":"programmering är roligt"}\n```');
  assert.equal(fenced.method, 'fenced');
  assert.equal(validateStructuredAnalysis(fenced.value, input).valid, true);
  assert.deepEqual(extractJson('not json'), { value: null, method: null, error: 'JSON_PARSE' });
  assert.deepEqual(validateStructuredAnalysis({ ...fenced.value, evidence: 'fabricated quote' }, input).errors, ['EVIDENCE_INVALID']);
  assert.ok(validateStructuredAnalysis({ ...fenced.value, type: 'PROMISE' }, input).errors.includes('TYPE_INVALID'));
});

test('embedding diagnostics and relationship grouping use observed vectors', () => {
  const vectors = [[1, 0], [.95, .05], [0, 1]];
  assert.equal(embeddingDiagnostics([1, 0]).normalized, true);
  const report = relationshipReport(['finance one', 'finance two', 'astronomy'], vectors, .8);
  assert.deepEqual(report.clusters, [[0, 1]]);
  assert.equal(report.suggestions.length, 1);
  assert.match(report.caution, /does not prove/);
});

test('hybrid schema exposes deterministic postprocessing and rejects unusable observations', () => {
  const labels = Object.values(TYPE_LABELS);
  const output = { labels: [TYPE_LABELS.QUESTION, ...labels.filter(value => value !== TYPE_LABELS.QUESTION)], scores: [0.7, ...labels.slice(1).map(() => 0.03)] };
  const result = deterministicHybridResult('How do markets work?', output, [1, 0]);
  assert.equal(result.valid, true);
  assert.equal(result.value.type, 'QUESTION');
  assert.match(result.postprocessing, /deterministic/);
  assert.equal(deterministicHybridResult('x', null, [1]).valid, false);
});

class MockWorker {
  static active = 0;
  static maxActive = 0;
  static log = [];
  constructor({ hang = false } = {}) {
    this.listeners = { message: new Set(), error: new Set() }; this.hang = hang; this.terminated = false;
    MockWorker.active += 1; MockWorker.maxActive = Math.max(MockWorker.maxActive, MockWorker.active);
  }
  addEventListener(type, callback) { this.listeners[type].add(callback); }
  removeEventListener(type, callback) { this.listeners[type].delete(callback); }
  postMessage(message) {
    MockWorker.log.push(message.action);
    if (this.hang) return;
    queueMicrotask(() => {
      const result = message.action === 'dispose' ? { requested: 1, completed: 1 } : { ok: true, validation: { valid: true }, model: message.payload.model.key };
      for (const callback of this.listeners.message) callback({ data: { id: message.id, result } });
    });
  }
  terminate() { if (!this.terminated) { this.terminated = true; MockWorker.active -= 1; } }
}

test('controller executes sequentially and disposes every candidate', async () => {
  MockWorker.active = 0; MockWorker.maxActive = 0; MockWorker.log = [];
  const events = [];
  const controller = new ModelSequenceController({ workerFactory: () => new MockWorker(), onEvent: event => events.push(event.state), timeoutMs: 100 });
  const output = await controller.run(MODEL_CATALOG.slice(0, 3), () => ({ text: 'synthetic' }));
  assert.equal(output.length, 3);
  assert.equal(MockWorker.maxActive, 1);
  assert.equal(MockWorker.active, 0);
  assert.deepEqual(MockWorker.log, ['run', 'dispose', 'run', 'dispose', 'run', 'dispose']);
  assert.equal(events.filter(state => state === 'DISPOSING').length, 3);
  assert.equal(events.at(-1), 'IDLE');
});

test('controller cancellation terminates the worker without starting another model', async () => {
  MockWorker.active = 0; MockWorker.log = [];
  const controller = new ModelSequenceController({ workerFactory: () => new MockWorker({ hang: true }), timeoutMs: 1000 });
  const pending = controller.run(MODEL_CATALOG.slice(0, 2), () => ({ text: 'synthetic' }));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(controller.stop(), true);
  assert.deepEqual(await pending, []);
  assert.equal(MockWorker.active, 0);
  assert.deepEqual(MockWorker.log, ['run']);
});

test('controller reports timeout as a real failed result and cleans up', async () => {
  MockWorker.active = 0;
  const controller = new ModelSequenceController({ workerFactory: () => new MockWorker({ hang: true }), timeoutMs: 10 });
  const [result] = await controller.run(MODEL_CATALOG.slice(0, 1), () => ({ text: 'synthetic' }));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'MODEL_TIMEOUT');
  assert.equal(MockWorker.active, 0);
});
