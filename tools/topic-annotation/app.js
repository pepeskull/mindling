import { addAnnotation, adjudicationCsv, analyzeAgreement, annotationRunCsv, ANNOTATION_SCHEMA_VERSION,
  createAnnotationRun, deterministicPresentation, JUDGMENTS, validateAdjudications, validateAnnotationRun,
  validateDataset, validatePseudonym } from "./annotation-core.js";

const $ = selector => document.querySelector(selector);
const state = { dataset: null, run: null, presentation: [], runA: null, runB: null, adjudication: null };
const storagePrefix = "mindling-topic-annotation:";
const setText = (selector, value) => { $(selector).textContent = value; };
const readJsonFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => {
  try { resolve(JSON.parse(reader.result)); } catch (error) { reject(new TypeError(`Invalid JSON: ${error.message}`)); }
}; reader.onerror = () => reject(reader.error); reader.readAsText(file); });
const download = (filename, content, type) => { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); };
const percent = value => value === null ? "—" : `${Math.round(value * 100)}%`;

function judgments(hostSelector, group) {
  const host = $(hostSelector); host.replaceChildren();
  for (const judgment of JUDGMENTS) { const label = document.createElement("label"); const input = document.createElement("input");
    input.type = "radio"; input.name = group; input.value = judgment; label.append(input, document.createTextNode(judgment)); host.append(label); }
}

function renderDataset() {
  const meta = $("#dataset-meta"); meta.replaceChildren();
  for (const [label, value] of [["Dataset", state.dataset.title], ["Version", state.dataset.version], ["Pairs", state.dataset.pairs.length]]) {
    const row = document.createElement("div"); const term = document.createElement("dt"); const detail = document.createElement("dd");
    term.textContent = label; detail.textContent = value; row.append(term, detail); meta.append(row);
  }
}

const runStorageKey = run => `${storagePrefix}${run.datasetId}:${run.datasetVersion}:${run.seed}:${run.annotatorPseudonym}`;
const saveRun = () => localStorage.setItem(runStorageKey(state.run), JSON.stringify(state.run));
const currentPair = () => state.presentation.find(pair => !state.run.annotations.some(item => item.pairId === pair.id));

function renderAnnotation() {
  const pair = currentPair(); const completed = state.run.annotations.length;
  setText("#annotation-progress", `${state.run.annotatorPseudonym} · seed ${state.run.seed} · ${completed}/${state.dataset.pairs.length}`);
  if (!pair) { setText("#annotation-title", "Annotation run complete"); setText("#left-memory", "All pairs have been judged.");
    setText("#right-memory", "Export JSON for independent agreement analysis."); $("#annotation-form").querySelector("button[type=submit]").disabled = true; return; }
  setText("#annotation-title", `Pair ${completed + 1} of ${state.dataset.pairs.length}`); setText("#left-memory", pair.presentedLeft); setText("#right-memory", pair.presentedRight);
  $("#annotation-form").reset(); $("#annotation-form").querySelector("button[type=submit]").disabled = false;
}

function startAnnotation(run = null) {
  const candidate = run || createAnnotationRun(state.dataset, { annotatorPseudonym: $("#pseudonym").value, seed: $("#seed").value });
  const stored = run ? null : localStorage.getItem(runStorageKey(candidate));
  state.run = stored ? validateAnnotationRun(JSON.parse(stored), state.dataset) : candidate;
  state.presentation = deterministicPresentation(state.dataset, state.run.seed); saveRun();
  $("#setup").hidden = true; $("#annotation").hidden = false; renderAnnotation();
}

function analysisElements(analysis) {
  const host = $("#analysis"); host.replaceChildren();
  for (const [label, value] of [["Compared pairs", analysis.comparedPairs], ["Raw agreement", percent(analysis.rawAgreement)],
    ["Cohen's kappa", analysis.cohenKappa === null ? "—" : analysis.cohenKappa.toFixed(3)], ["UNCERTAIN frequency", percent(analysis.uncertainFrequency)],
    ["Disagreements", analysis.disagreementCount], ["Adjudicated", analysis.adjudicationCount], ["Unresolved", analysis.unresolvedDisagreementCount]]) {
    const item = document.createElement("article"); const small = document.createElement("span"); const strong = document.createElement("strong");
    small.textContent = label; strong.textContent = value; item.append(small, document.createElement("br"), strong); host.append(item);
  }
  const table = document.createElement("table"); table.className = "matrix"; const head = document.createElement("tr");
  head.append(document.createElement("th")); for (const value of JUDGMENTS) { const th = document.createElement("th"); th.textContent = `B: ${value}`; head.append(th); } table.append(head);
  for (const left of JUDGMENTS) { const row = document.createElement("tr"); const th = document.createElement("th"); th.textContent = `A: ${left}`; row.append(th);
    for (const right of JUDGMENTS) { const cell = document.createElement("td"); cell.textContent = analysis.confusionMatrix[left][right]; row.append(cell); } table.append(row); } host.append(table);
  const categories = document.createElement("div"); categories.className = "category-table";
  for (const [category, result] of Object.entries(analysis.agreementByCategory)) { const row = document.createElement("p"); row.textContent = `${category}: ${result.agreements}/${result.compared} (${percent(result.rawAgreement)})`; categories.append(row); } host.append(categories);
  const caveat = document.createElement("p"); caveat.className = "category-table instruction"; caveat.textContent = "Agreement measures consistency, not semantic correctness. Pre-adjudication metrics never change when adjudications are added."; host.append(caveat);
}

const currentDisagreement = analysis => analysis.disagreements.find(row => !state.adjudication.adjudications.some(item => item.pairId === row.pair.id));
function renderAdjudication() {
  const analysis = analyzeAgreement(state.dataset, state.runA, state.runB, state.adjudication); analysisElements(analysis);
  const row = currentDisagreement(analysis); setText("#adjudication-progress", `${state.adjudication.adjudicatorPseudonym} · ${analysis.adjudicationCount}/${analysis.disagreementCount} disagreements adjudicated`);
  if (!row) { $("#adjudication-task").hidden = true; return; } $("#adjudication-task").hidden = false;
  setText("#adjudication-left", row.pair.left); setText("#adjudication-right", row.pair.right);
  setText("#source-a-title", state.runA.annotatorPseudonym); setText("#source-a-judgment", row.annotationA.judgment); setText("#source-a-rationale", row.annotationA.rationale);
  setText("#source-b-title", state.runB.annotatorPseudonym); setText("#source-b-judgment", row.annotationB.judgment); setText("#source-b-rationale", row.annotationB.rationale);
  $("#adjudication-form").dataset.pairId = row.pair.id; $("#adjudication-form").reset();
}

async function startAdjudication() {
  const [fileA, fileB] = [$("#run-a-file").files[0], $("#run-b-file").files[0]]; if (!fileA || !fileB) throw new TypeError("Select two independent annotation JSON files");
  state.runA = validateAnnotationRun(await readJsonFile(fileA), state.dataset); state.runB = validateAnnotationRun(await readJsonFile(fileB), state.dataset);
  if (state.runA.seed !== state.runB.seed) throw new TypeError("Independent runs must use the same seed");
  const adjudicatorPseudonym = validatePseudonym($("#pseudonym").value);
  state.adjudication = { kind: "mindling-topic-adjudication", schemaVersion: ANNOTATION_SCHEMA_VERSION,
    datasetId: state.dataset.datasetId, datasetVersion: state.dataset.version, seed: state.runA.seed, adjudicatorPseudonym,
    createdAt: new Date().toISOString(), adjudications: [] };
  state.adjudication = validateAdjudications(state.adjudication, state.dataset, state.runA, state.runB);
  $("#setup").hidden = true; $("#adjudication").hidden = false; renderAdjudication();
}

$("#mode").addEventListener("change", event => { const adjudicate = event.target.value === "adjudicate";
  $("#adjudication-imports").hidden = !adjudicate; $("#seed").closest("label").hidden = adjudicate; $("#resume-label").hidden = adjudicate;
  $("#start").textContent = adjudicate ? "Analyze and adjudicate" : "Start workspace"; });
$("#start").addEventListener("click", async () => { setText("#setup-error", ""); try {
  if ($("#mode").value === "adjudicate") await startAdjudication(); else startAnnotation();
} catch (error) { setText("#setup-error", error.message); } });
$("#dataset-file").addEventListener("change", async event => { try { state.dataset = validateDataset(await readJsonFile(event.target.files[0])); renderDataset(); }
  catch (error) { setText("#setup-error", error.message); } });
$("#resume-file").addEventListener("change", async event => { try { startAnnotation(validateAnnotationRun(await readJsonFile(event.target.files[0]), state.dataset)); }
  catch (error) { setText("#setup-error", error.message); } });
$("#annotation-form").addEventListener("submit", event => { event.preventDefault(); setText("#annotation-error", ""); try { const pair = currentPair();
  const judgment = new FormData(event.currentTarget).get("annotation-judgment"); state.run = addAnnotation(state.run, state.dataset,
    { pairId: pair.id, judgment, rationale: $("#annotation-rationale").value }); saveRun(); renderAnnotation();
} catch (error) { setText("#annotation-error", error.message); } });
$("#adjudication-form").addEventListener("submit", event => { event.preventDefault(); setText("#adjudication-error", ""); try {
  const judgment = new FormData(event.currentTarget).get("adjudication-judgment"); if (!JUDGMENTS.includes(judgment)) throw new TypeError("Select a judgment");
  const next = { ...state.adjudication, adjudications: [...state.adjudication.adjudications, { pairId: event.currentTarget.dataset.pairId, judgment,
    rationale: $("#adjudication-rationale").value.trim(), timestamp: new Date().toISOString() }] };
  state.adjudication = validateAdjudications(next, state.dataset, state.runA, state.runB); renderAdjudication();
} catch (error) { setText("#adjudication-error", error.message); } });
$("#export-run-json").addEventListener("click", () => download(`${state.run.annotatorPseudonym}-${state.dataset.version}.json`, JSON.stringify(validateAnnotationRun(state.run, state.dataset), null, 2), "application/json"));
$("#export-run-csv").addEventListener("click", () => download(`${state.run.annotatorPseudonym}-${state.dataset.version}.csv`, annotationRunCsv(state.dataset, state.run), "text/csv"));
$("#export-adjudication-json").addEventListener("click", () => download(`adjudicated-${state.dataset.version}.json`, JSON.stringify({ ...state.adjudication,
  annotationRuns: [state.runA, state.runB], analysis: analyzeAgreement(state.dataset, state.runA, state.runB, state.adjudication) }, null, 2), "application/json"));
$("#export-adjudication-csv").addEventListener("click", () => download(`adjudicated-${state.dataset.version}.csv`, adjudicationCsv(state.dataset, state.runA, state.runB, state.adjudication), "text/csv"));
document.querySelectorAll("[data-reset]").forEach(button => button.addEventListener("click", () => location.reload()));

judgments("#annotation-judgments", "annotation-judgment"); judgments("#adjudication-judgments", "adjudication-judgment");
try { state.dataset = validateDataset(await fetch("./pilot-dataset.json").then(response => { if (!response.ok) throw new Error(`Dataset request failed: ${response.status}`); return response.json(); })); renderDataset(); }
catch (error) { setText("#setup-error", `Could not load pilot dataset: ${error.message}`); $("#start").disabled = true; }
