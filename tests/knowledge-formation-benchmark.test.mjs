import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGeneratedDataset, generateKnowledgeCase, normalizeDatasetConfig, permuteCaseIndex, validateImportedCase } from "../src/benchmark/knowledge-formation-dataset.js";
import { benchmarkReportCsv, KnowledgeFormationBenchmarkRunner } from "../src/benchmark/knowledge-formation-runner.js";
import { knowledgeBenchmarkDatabaseConfig } from "../src/benchmark/knowledge-formation-database.js";

class MemoryBenchmarkStore {
  runs = new Map(); reports = new Map(); memoryCount = 0; operationCount = 0;
  async createRun(run) { this.runs.set(run.runId, structuredClone(run)); }
  async getRun(runId) { return structuredClone(this.runs.get(runId)); }
  async commitBatch({ runId, memories, operations, checkpoint }) {
    this.memoryCount += memories.length; this.operationCount += operations.length;
    this.runs.set(runId, { runId, checkpoint: structuredClone(checkpoint) });
  }
  async saveReport(report) { this.reports.set(report.runId, structuredClone(report)); }
}

test("generated benchmark cases are deterministic, multilingual, and order permutations are complete", async () => {
  const config = normalizeDatasetConfig({ size: 1_000, topicCount: 100, seed: "repeatable", orderSeed: 41 });
  assert.deepEqual(generateKnowledgeCase(33, config), generateKnowledgeCase(33, config));
  const indices = new Set(Array.from({ length: config.size }, (_, index) => permuteCaseIndex(index, config.size, config.orderSeed)));
  assert.equal(indices.size, config.size);
  const dataset = createGeneratedDataset(config); const languages = new Set(); const forms = new Set();
  for (let index = 0; index < 100; index += 1) { const item = await dataset.getCase(index); languages.add(item.memory.language); forms.add(item.provenance.form); }
  assert.deepEqual([...languages].sort(), ["en", "es", "sv"]); assert.ok(forms.size >= 5);
  assert.equal(dataset.metadata.semanticAccuracyAuthority, false);
});

test("external imports keep provenance and only independently verified references can claim evaluation authority", () => {
  const unverified = validateImportedCase({ content: "External memory", reference: { topicKey: "x", expectedPairs: [{ otherCaseId: "a", expected: "SAME_AREA" }] },
    provenance: { kind: "AI_LABELED", aiLabeled: true } });
  assert.equal(unverified.provenance.semanticAccuracyAuthority, false); assert.equal(unverified.provenance.aiLabeled, true);
  const verified = validateImportedCase({ memory: { id: "m", content: "Reviewed memory", language: "sv" },
    reference: { topicKey: "reviewed", independentlyVerified: true }, provenance: { kind: "HUMAN_REVIEWED", humanVerified: true } });
  assert.equal(verified.provenance.semanticAccuracyAuthority, true); assert.equal(verified.memory.language, "sv");
});

test("runner checkpoints and resumes without canonical mutation or manufactured semantic evidence", async () => {
  const dataset = createGeneratedDataset({ size: 1_000, topicCount: 100, seed: "resume", orderSeed: 0 }); const store = new MemoryBenchmarkStore();
  await store.createRun({ runId: "resume-run", checkpoint: null }); const controller = new AbortController(); let updates = 0;
  const firstRunner = new KnowledgeFormationBenchmarkRunner({ store, dataset, batchSize: 40, memoryUsage: () => 10, storageUsage: async () => 100,
    onProgress: () => { updates += 1; if (updates === 2) controller.abort(); } });
  const paused = await firstRunner.run("resume-run", { signal: controller.signal }); assert.equal(paused.status, "PAUSED"); assert.equal(paused.progress.nextPosition, 80);
  const final = await new KnowledgeFormationBenchmarkRunner({ store, dataset, batchSize: 200, memoryUsage: () => 12, storageUsage: async () => 140 }).run("resume-run");
  assert.equal(final.status, "COMPLETE"); assert.equal(final.counts.memoriesProcessed, 1_000); assert.equal(store.memoryCount, 1_000);
  assert.equal(final.counts.canonicalMutationCount, 0); assert.equal(final.counts.semanticComparisons, 0);
  assert.equal(final.counts.sameAreaDecisions, 0); assert.equal(final.counts.differentAreaDecisions, 0);
  assert.equal(final.counts.provisionalAssignments, 1_000); assert.equal(final.interpretation.semanticAccuracyClaimed, false);
});

test("100,000-case primary benchmark executes deterministically with bounded batches", { timeout: 30_000 }, async () => {
  const dataset = createGeneratedDataset({ size: 100_000, topicCount: 5_000, seed: "acceptance-100k", orderSeed: 17 });
  const execute = async (runId, resume = false) => { const store = new MemoryBenchmarkStore(); await store.createRun({ runId, checkpoint: null });
    if (resume) { const controller = new AbortController(); let batches = 0;
      const paused = await new KnowledgeFormationBenchmarkRunner({ store, dataset, batchSize: 2_000, memoryUsage: () => null, storageUsage: async () => null,
        onProgress: () => { batches += 1; if (batches === 10) controller.abort(); } }).run(runId, { signal: controller.signal });
      assert.equal(paused.status, "PAUSED"); assert.equal(paused.progress.nextPosition, 20_000); }
    const report = await new KnowledgeFormationBenchmarkRunner({ store, dataset, batchSize: 2_000, memoryUsage: () => null, storageUsage: async () => null }).run(runId);
    return { report, store }; };
  const first = await execute("primary-a", true); const second = await execute("primary-b");
  assert.equal(first.report.counts.memoriesProcessed, 100_000); assert.equal(first.store.memoryCount, 100_000);
  assert.equal(first.report.counts.actualKnowledgeFormationOperations, 100_000); assert.equal(first.report.counts.semanticComparisons, 0);
  assert.equal(first.report.counts.rollingHash, second.report.counts.rollingHash); assert.equal(first.report.counts.canonicalMutationCount, 0);
  assert.ok(first.report.performance.samples.length <= 200); assert.equal(first.report.counts.partitionFingerprint, second.report.counts.partitionFingerprint);
  assert.equal(first.report.isolation.productionDatabaseTouched, false); assert.equal(first.report.interpretation.actualLearningClaimed, false);
  assert.match(benchmarkReportCsv(first.report), /semanticAccuracyClaimed","false/);
});

test("singleton partition fingerprint is order-resistant while execution order remains measurable", async () => {
  const run = async orderSeed => { const dataset = createGeneratedDataset({ size: 1_000, topicCount: 100, seed: "order", orderSeed });
    const store = new MemoryBenchmarkStore(); const runId = `order-${orderSeed}`; await store.createRun({ runId, checkpoint: null });
    return new KnowledgeFormationBenchmarkRunner({ store, dataset, batchSize: 500, memoryUsage: () => null, storageUsage: async () => null }).run(runId); };
  const first = await run(0); const shuffled = await run(91);
  assert.equal(first.counts.partitionFingerprint, shuffled.counts.partitionFingerprint);
  assert.notEqual(first.counts.rollingHash, shuffled.counts.rollingHash);
});

test("browser benchmark is standalone and uses an isolated IndexedDB namespace", () => {
  const database = readFileSync(new URL("../src/benchmark/knowledge-formation-database.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../benchmarks/knowledge-formation/index.html", import.meta.url), "utf8");
  assert.equal(knowledgeBenchmarkDatabaseConfig.name, "mindling-knowledge-benchmark"); assert.equal(knowledgeBenchmarkDatabaseConfig.version, 1);
  assert.doesNotMatch(database, /mindling-db/); assert.match(page, /Successful execution is not semantic correctness/);
  assert.match(page, /Export JSON/); assert.match(page, /Export CSV/); assert.match(page, /Run imported dataset/);
});
