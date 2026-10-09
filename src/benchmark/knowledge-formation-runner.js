import { createProvisionalTopic } from "../semantic/knowledge-area-foundation.js";

const now = () => globalThis.performance?.now?.() ?? Date.now();
const hashStep = (hash, value) => [...String(value)].reduce((state, character) => Math.imul(state ^ character.codePointAt(0), 16777619) >>> 0, hash);
const initialMetrics = () => ({ memoriesProcessed: 0, knowledgeAreasCreated: 0, confirmedRelationships: 0,
  sameAreaDecisions: 0, differentAreaDecisions: 0, uncertainDecisions: 0, evaluatedReferencePairs: 0,
  unverifiedReferencePairs: 0, provisionalAssignments: 0,
  semanticComparisons: 0, actualKnowledgeFormationOperations: 0, incorrectMerges: 0, missedTopicRelationships: 0,
  canonicalMutationCount: 0, failures: 0, totalProcessingMilliseconds: 0, maximumCaseMilliseconds: 0,
  rollingHash: 2166136261, partitionFingerprint: 0, lastMemoryId: null });

export class KnowledgeFormationBenchmarkRunner {
  constructor({ store, dataset, batchSize = 250, onProgress = () => {}, memoryUsage = () => globalThis.performance?.memory?.usedJSHeapSize ?? null,
    storageUsage = async () => (await globalThis.navigator?.storage?.estimate?.())?.usage ?? null }) {
    if (!store || !dataset) throw new TypeError("A benchmark store and dataset are required");
    this.store = store; this.dataset = dataset; this.batchSize = Math.max(1, Math.min(2_000, batchSize));
    this.onProgress = onProgress; this.memoryUsage = memoryUsage; this.storageUsage = storageUsage;
  }

  async run(runId, { signal } = {}) {
    const saved = await this.store.getRun(runId);
    const checkpoint = saved?.checkpoint || { nextPosition: 0, metrics: initialMetrics(), startedAt: new Date().toISOString(), peakHeapBytes: null,
      initialStorageBytes: await this.storageUsage() };
    const metrics = { ...initialMetrics(), ...checkpoint.metrics };
    let nextPosition = checkpoint.nextPosition; let peakHeapBytes = checkpoint.peakHeapBytes; let samples = [...(checkpoint.samples || [])];
    while (nextPosition < this.dataset.size) {
      if (signal?.aborted) return this.#result(runId, "PAUSED", nextPosition, metrics, checkpoint.startedAt, peakHeapBytes,
        checkpoint.initialStorageBytes, null, samples);
      const memories = []; const operations = []; const batchEnd = Math.min(this.dataset.size, nextPosition + this.batchSize);
      const batchStartedAt = now(); const batchStartPosition = nextPosition;
      for (; nextPosition < batchEnd; nextPosition += 1) {
        if (signal?.aborted) break;
        const caseStartedAt = now();
        try {
          const testCase = await this.dataset.getCase(nextPosition);
          const canonical = Object.freeze({ id: String(testCase.memory.id), content: String(testCase.memory.content),
            ...(testCase.memory.language ? { language: String(testCase.memory.language) } : {}) });
          const before = JSON.stringify(canonical); const area = createProvisionalTopic(canonical); const after = JSON.stringify(canonical);
          if (before !== after) metrics.canonicalMutationCount += 1;
          const allReferencePairs = testCase.reference?.expectedPairs || [];
          const referencePairs = testCase.reference?.independentlyVerified ? allReferencePairs : [];
          metrics.evaluatedReferencePairs += referencePairs.length;
          metrics.unverifiedReferencePairs += allReferencePairs.length - referencePairs.length;
          metrics.missedTopicRelationships += referencePairs.filter(pair => pair.expected === "SAME_AREA").length;
          const elapsed = now() - caseStartedAt;
          metrics.memoriesProcessed += 1; metrics.knowledgeAreasCreated += 1; metrics.provisionalAssignments += 1; metrics.actualKnowledgeFormationOperations += 1;
          metrics.totalProcessingMilliseconds += elapsed; metrics.maximumCaseMilliseconds = Math.max(metrics.maximumCaseMilliseconds, elapsed);
          metrics.lastMemoryId = canonical.id; metrics.rollingHash = hashStep(hashStep(metrics.rollingHash, canonical.id), area.id);
          metrics.partitionFingerprint = (metrics.partitionFingerprint ^ hashStep(hashStep(2166136261, canonical.id), area.id)) >>> 0;
          memories.push({ ...canonical, runId, caseId: testCase.caseId, provisionalAreaId: area.id, canonicalSnapshot: before });
          operations.push({ runId, caseId: testCase.caseId, memoryId: canonical.id, areaId: area.id,
            decision: "PROVISIONAL_SINGLETON", relationshipStatus: "UNCERTAIN_NO_RELATION_EVIDENCE",
            reason: "NO_VALIDATED_TOPIC_RELATION_AUTHORITY", candidateCount: 0,
            semanticEvidence: null, verifiedReferencePairCount: referencePairs.length, unverifiedReferencePairCount: allReferencePairs.length - referencePairs.length,
            persistence: "BENCHMARK_ONLY" });
        } catch (error) {
          metrics.failures += 1;
          operations.push({ runId, caseId: `failed-${nextPosition}`, decision: "FAILED", reason: String(error?.message || error), persistence: "BENCHMARK_ONLY" });
        }
      }
      const heap = this.memoryUsage(); if (Number.isFinite(heap)) peakHeapBytes = Math.max(peakHeapBytes || 0, heap);
      const batchMilliseconds = now() - batchStartedAt; samples.push({ position: nextPosition, cases: nextPosition - batchStartPosition,
        milliseconds: batchMilliseconds, casesPerSecond: batchMilliseconds ? (nextPosition - batchStartPosition) / (batchMilliseconds / 1_000) : null });
      if (samples.length > 200) samples = samples.filter((_, index) => index % 2 === 0);
      await this.store.commitBatch({ runId, memories, operations, checkpoint: { nextPosition, metrics: { ...metrics },
        targetSize: this.dataset.size, startedAt: checkpoint.startedAt, updatedAt: new Date().toISOString(), peakHeapBytes,
        initialStorageBytes: checkpoint.initialStorageBytes, samples } });
      this.onProgress(this.#result(runId, nextPosition >= this.dataset.size ? "COMPLETE" : "RUNNING", nextPosition, metrics,
        checkpoint.startedAt, peakHeapBytes, checkpoint.initialStorageBytes, null, samples));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const result = this.#result(runId, "COMPLETE", nextPosition, metrics, checkpoint.startedAt, peakHeapBytes, checkpoint.initialStorageBytes,
      await this.storageUsage(), samples);
    await this.store.saveReport?.(result); return result;
  }

  #result(runId, status, nextPosition, metrics, startedAt, peakHeapBytes, initialStorageBytes = null, finalStorageBytes = null, samples = []) {
    const elapsed = metrics.totalProcessingMilliseconds;
    return structuredClone({ schema: "mindling-knowledge-benchmark-report-v1", runId, status, startedAt,
      completedAt: status === "COMPLETE" ? new Date().toISOString() : null, dataset: this.dataset.metadata,
      progress: { nextPosition, totalCases: this.dataset.size, ratio: nextPosition / this.dataset.size },
      counts: { ...metrics }, performance: { processingMilliseconds: elapsed,
        casesPerSecond: elapsed ? metrics.memoriesProcessed / (elapsed / 1_000) : null,
        meanCaseMilliseconds: metrics.memoriesProcessed ? elapsed / metrics.memoriesProcessed : null,
        maximumCaseMilliseconds: metrics.maximumCaseMilliseconds, peakHeapBytes, initialStorageBytes, finalStorageBytes,
        storageGrowthBytes: Number.isFinite(initialStorageBytes) && Number.isFinite(finalStorageBytes) ? finalStorageBytes - initialStorageBytes : null,
        storageMeasurementScope: "ORIGIN_ESTIMATE_NOT_DATABASE_EXCLUSIVE", samples,
        throughputChangeRatio: samples.length > 1 && samples[0].casesPerSecond ? samples.at(-1).casesPerSecond / samples[0].casesPerSecond : null },
      interpretation: { semanticAuthorityAvailable: false, actualLearningClaimed: false,
        groupingPerformed: "PROVISIONAL_SINGLETON_ONLY", semanticAccuracyClaimed: false,
        note: "Execution success measures infrastructure, not semantic correctness. Reference labels never enter knowledge formation." },
      isolation: { database: "mindling-knowledge-benchmark", productionDatabaseTouched: false, canonicalMutationCount: metrics.canonicalMutationCount } });
  }
}

export function benchmarkReportCsv(report) {
  const rows = [["metric", "value"], ["runId", report.runId], ["status", report.status],
    ["datasetKind", report.dataset.kind], ["totalCases", report.progress.totalCases], ["memoriesProcessed", report.counts.memoriesProcessed],
    ["knowledgeAreasCreated", report.counts.knowledgeAreasCreated], ["sameAreaDecisions", report.counts.sameAreaDecisions],
    ["differentAreaDecisions", report.counts.differentAreaDecisions], ["uncertainDecisions", report.counts.uncertainDecisions],
    ["evaluatedReferencePairs", report.counts.evaluatedReferencePairs], ["unverifiedReferencePairs", report.counts.unverifiedReferencePairs],
    ["semanticComparisons", report.counts.semanticComparisons],
    ["incorrectMerges", report.counts.incorrectMerges], ["missedTopicRelationships", report.counts.missedTopicRelationships],
    ["casesPerSecond", report.performance.casesPerSecond ?? ""], ["peakHeapBytes", report.performance.peakHeapBytes ?? ""],
    ["storageGrowthBytes", report.performance.storageGrowthBytes ?? ""],
    ["throughputChangeRatio", report.performance.throughputChangeRatio ?? ""], ["partitionFingerprint", report.counts.partitionFingerprint],
    ["semanticAccuracyClaimed", false], ["productionDatabaseTouched", false]];
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}
