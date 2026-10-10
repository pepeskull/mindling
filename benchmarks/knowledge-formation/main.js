import { createGeneratedDataset, validateImportedCase } from "../../src/benchmark/knowledge-formation-dataset.js";
import { KnowledgeFormationBenchmarkDatabase } from "../../src/benchmark/knowledge-formation-database.js";
import { benchmarkReportCsv, KnowledgeFormationBenchmarkRunner } from "../../src/benchmark/knowledge-formation-runner.js";

const byId = id => document.getElementById(id); const database = await new KnowledgeFormationBenchmarkDatabase().open();
let controller = null; let report = null; let importedDataset = null;
const formatNumber = value => Number.isFinite(value) ? new Intl.NumberFormat().format(Math.round(value)) : "not available";
const download = (name, type, content) => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); };
const metric = (label, value) => { const item = document.createElement("div"); item.className = "metric"; const name = document.createElement("span"); name.textContent = label; const strong = document.createElement("strong"); strong.textContent = value; item.append(name, strong); return item; };

const render = value => {
  report = value; byId("status").textContent = value.status; byId("progress").value = value.progress.ratio;
  byId("metrics").replaceChildren(metric("Memories", formatNumber(value.counts.memoriesProcessed)), metric("Provisional areas", formatNumber(value.counts.knowledgeAreasCreated)),
    metric("Verified reference pairs", formatNumber(value.counts.evaluatedReferencePairs)), metric("Unverified reference pairs", formatNumber(value.counts.unverifiedReferencePairs)),
    metric("Semantic comparisons", formatNumber(value.counts.semanticComparisons)),
    metric("Provisional assignments", formatNumber(value.counts.provisionalAssignments)),
    metric("Same / Different / Uncertain", `${value.counts.sameAreaDecisions} / ${value.counts.differentAreaDecisions} / ${formatNumber(value.counts.uncertainDecisions)}`),
    metric("Missed same-topic refs", formatNumber(value.counts.missedTopicRelationships)), metric("Incorrect merges", formatNumber(value.counts.incorrectMerges)),
    metric("Throughput", value.performance.casesPerSecond ? `${formatNumber(value.performance.casesPerSecond)}/s` : "not available"),
    metric("Peak JS heap", value.performance.peakHeapBytes ? `${(value.performance.peakHeapBytes / 1048576).toFixed(1)} MB` : "not exposed"),
    metric("Origin storage growth", Number.isFinite(value.performance.storageGrowthBytes) ? `${(value.performance.storageGrowthBytes / 1048576).toFixed(1)} MB` : "not exposed"),
    metric("Throughput change", Number.isFinite(value.performance.throughputChangeRatio) ? `${(value.performance.throughputChangeRatio * 100).toFixed(0)}% of first sample` : "collecting"),
    metric("Failures", formatNumber(value.counts.failures)));
  byId("interpretation").textContent = value.interpretation.note;
  byId("export-json").disabled = false; byId("export-csv").disabled = false;
};

const runDataset = async (dataset, runId) => {
  const existing = await database.getRun(runId); if (!existing) await database.createRun({ runId, dataset: dataset.metadata, status: "READY", checkpoint: null });
  controller = new AbortController(); byId("start").disabled = true; byId("run-imported").disabled = true; byId("pause").disabled = false; byId("errors").textContent = "";
  try {
    const runner = new KnowledgeFormationBenchmarkRunner({ store: database, dataset, batchSize: Number(byId("batch-size").value), onProgress: render });
    render(await runner.run(runId, { signal: controller.signal }));
  } catch (error) { byId("errors").textContent = String(error?.stack || error); }
  finally { byId("start").disabled = false; byId("run-imported").disabled = !importedDataset; byId("pause").disabled = true; controller = null; }
};
byId("start").addEventListener("click", async () => {
  const config = { size: Number(byId("size").value), seed: byId("seed").value, topicCount: Number(byId("topics").value), orderSeed: Number(byId("order-seed").value) };
  const dataset = createGeneratedDataset(config); const runId = `${dataset.id}-order-${config.orderSeed}`;
  await runDataset(dataset, runId);
});
byId("run-imported").addEventListener("click", () => importedDataset && runDataset(importedDataset, `run-${importedDataset.id}`));
byId("pause").addEventListener("click", () => controller?.abort());
byId("export-json").addEventListener("click", () => report && download(`${report.runId}.json`, "application/json", JSON.stringify(report, null, 2)));
byId("export-csv").addEventListener("click", () => report && download(`${report.runId}.csv`, "text/csv", benchmarkReportCsv(report)));

const importFile = async (file, datasetId) => {
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed)) throw new TypeError("JSON imports must contain an array");
    for (let offset = 0; offset < parsed.length; offset += 500) await database.putImportedCases(datasetId,
      parsed.slice(offset, offset + 500).map((record, index) => validateImportedCase(record, offset + index)));
    return parsed.length;
  }
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader(); let buffered = ""; let batch = []; let position = 0;
  while (true) { const { value, done } = await reader.read(); buffered += value || ""; const lines = buffered.split(/\r?\n/u); buffered = lines.pop() || "";
    for (const line of lines) if (line.trim()) { batch.push(validateImportedCase(JSON.parse(line), position)); position += 1;
      if (batch.length === 500) { await database.putImportedCases(datasetId, batch); batch = []; } } if (done) break; }
  if (buffered.trim()) { batch.push(validateImportedCase(JSON.parse(buffered), position)); position += 1; }
  if (batch.length) await database.putImportedCases(datasetId, batch); return position;
};
byId("import").addEventListener("click", async () => {
  const file = byId("dataset-file").files[0]; if (!file) return;
  try {
    const datasetId = `import-${Date.now().toString(36)}`; const size = await importFile(file, datasetId);
    const metadata = { datasetId, id: datasetId, size, kind: "EXTERNAL", independentlyVerified: false, importedAt: new Date().toISOString(), sourceFile: file.name };
    await database.saveDataset(metadata); importedDataset = { id: datasetId, size, metadata,
      getCase: position => database.getImportedCase(datasetId, position) };
    byId("run-imported").disabled = false; byId("import-status").textContent = `Imported ${size} cases into isolated dataset ${datasetId}.`;
  } catch (error) { byId("import-status").textContent = `Import failed: ${error?.message || error}`; }
});

window.addEventListener("pagehide", () => database.close());
