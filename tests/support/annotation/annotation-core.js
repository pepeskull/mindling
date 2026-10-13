export const ANNOTATION_SCHEMA_VERSION = 1;
export const JUDGMENTS = Object.freeze(["SAME_AREA", "DIFFERENT_AREA", "UNCERTAIN"]);

const copy = value => JSON.parse(JSON.stringify(value));
const assert = (condition, message) => { if (!condition) throw new TypeError(message); };
const text = (value, name, minimum = 1, maximum = 2_000) => {
  assert(typeof value === "string", `${name} must be a string`);
  const normalized = value.trim();
  assert(normalized.length >= minimum && normalized.length <= maximum, `${name} must contain ${minimum}-${maximum} characters`);
  return normalized;
};

export function validateDataset(input) {
  const dataset = copy(input);
  assert(dataset?.schemaVersion === ANNOTATION_SCHEMA_VERSION, "Unsupported dataset schema version");
  dataset.datasetId = text(dataset.datasetId, "datasetId", 1, 80);
  dataset.version = text(dataset.version, "version", 1, 80);
  dataset.title = text(dataset.title, "title", 1, 160);
  assert(Array.isArray(dataset.pairs) && dataset.pairs.length >= 1 && dataset.pairs.length <= 500,
    "Dataset must contain 1-500 pairs");
  const ids = new Set();
  dataset.pairs = dataset.pairs.map((pair, index) => {
    const id = text(pair?.id, `pairs[${index}].id`, 1, 80);
    assert(!ids.has(id), `Duplicate pair ID: ${id}`); ids.add(id);
    const left = text(pair.left, `pairs[${index}].left`); const right = text(pair.right, `pairs[${index}].right`);
    assert(left !== right, `Pair ${id} must contain two distinct sentences`);
    return { id, category: text(pair.category, `pairs[${index}].category`, 1, 80), left, right };
  });
  return dataset;
}

const seedHash = value => {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
};
const randomFor = seed => {
  let state = seedHash(seed);
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
};

export function deterministicPresentation(datasetInput, seedInput) {
  const dataset = validateDataset(datasetInput); const seed = text(String(seedInput), "seed", 1, 120);
  const random = randomFor(`${dataset.datasetId}:${dataset.version}:${seed}`);
  const entries = dataset.pairs.map(pair => ({ ...pair, swapped: random() < .5 }));
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1)); [entries[index], entries[target]] = [entries[target], entries[index]];
  }
  return entries.map((pair, presentationIndex) => ({ ...pair,
    presentedLeft: pair.swapped ? pair.right : pair.left, presentedRight: pair.swapped ? pair.left : pair.right,
    presentationIndex }));
}

export const validatePseudonym = value => {
  const pseudonym = text(value, "annotator pseudonym", 2, 32);
  assert(/^[\p{L}\p{N}_.-]+$/u.test(pseudonym), "Pseudonym may contain letters, numbers, dot, underscore, and hyphen only");
  return pseudonym;
};
const isoTimestamp = (value, name) => {
  assert(typeof value === "string", `${name} must be an ISO UTC timestamp`); const timestamp = value.trim();
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) && Number.isFinite(Date.parse(timestamp)), `${name} must be an ISO UTC timestamp`);
  return timestamp;
};

export function createAnnotationRun(datasetInput, { annotatorPseudonym, seed }) {
  const dataset = validateDataset(datasetInput);
  return { kind: "mindling-topic-annotation-run", schemaVersion: ANNOTATION_SCHEMA_VERSION,
    datasetId: dataset.datasetId, datasetVersion: dataset.version, seed: text(String(seed), "seed", 1, 120),
    annotatorPseudonym: validatePseudonym(annotatorPseudonym), createdAt: new Date().toISOString(), annotations: [] };
}

export function addAnnotation(runInput, datasetInput, { pairId, judgment, rationale, timestamp = new Date().toISOString() }) {
  const dataset = validateDataset(datasetInput); const run = validateAnnotationRun(runInput, dataset);
  const id = text(pairId, "pairId", 1, 80); assert(dataset.pairs.some(pair => pair.id === id), `Unknown pair ID: ${id}`);
  assert(JUDGMENTS.includes(judgment), "Unknown judgment");
  assert(!run.annotations.some(item => item.pairId === id), `Pair ${id} already has a judgment`);
  const annotation = { pairId: id, judgment, rationale: text(rationale, "rationale", 8, 500), timestamp: isoTimestamp(timestamp, "timestamp") };
  return { ...run, annotations: [...run.annotations, annotation] };
}

export function validateAnnotationRun(input, datasetInput) {
  const dataset = validateDataset(datasetInput); const run = copy(input);
  assert(run?.kind === "mindling-topic-annotation-run", "Not a Mindling annotation run");
  assert(run.schemaVersion === ANNOTATION_SCHEMA_VERSION, "Unsupported annotation schema version");
  assert(run.datasetId === dataset.datasetId && run.datasetVersion === dataset.version, "Annotation dataset/version mismatch");
  run.seed = text(String(run.seed), "seed", 1, 120); run.annotatorPseudonym = validatePseudonym(run.annotatorPseudonym);
  run.createdAt = isoTimestamp(run.createdAt, "createdAt"); assert(Array.isArray(run.annotations), "Annotations must be an array");
  const pairIds = new Set(dataset.pairs.map(pair => pair.id)); const seen = new Set();
  run.annotations = run.annotations.map((item, index) => {
    const pairId = text(item?.pairId, `annotations[${index}].pairId`, 1, 80);
    assert(pairIds.has(pairId), `Unknown pair ID: ${pairId}`); assert(!seen.has(pairId), `Duplicate judgment for ${pairId}`); seen.add(pairId);
    assert(JUDGMENTS.includes(item.judgment), `Unknown judgment for ${pairId}`);
    return { pairId, judgment: item.judgment, rationale: text(item.rationale, `rationale for ${pairId}`, 8, 500),
      timestamp: isoTimestamp(item.timestamp, `timestamp for ${pairId}`) };
  });
  return run;
}

export function validateAdjudications(input, datasetInput, runAInput, runBInput) {
  const dataset = validateDataset(datasetInput); const runA = validateAnnotationRun(runAInput, dataset); const runB = validateAnnotationRun(runBInput, dataset);
  assert(runA.annotatorPseudonym !== runB.annotatorPseudonym, "Independent runs require distinct pseudonyms");
  const source = copy(input); assert(source?.kind === "mindling-topic-adjudication", "Not a Mindling adjudication file");
  assert(source.schemaVersion === ANNOTATION_SCHEMA_VERSION, "Unsupported adjudication schema version");
  assert(source.datasetId === dataset.datasetId && source.datasetVersion === dataset.version, "Adjudication dataset/version mismatch");
  assert(source.seed === runA.seed && source.seed === runB.seed, "Runs and adjudication must use the same seed");
  source.adjudicatorPseudonym = validatePseudonym(source.adjudicatorPseudonym);
  source.createdAt = isoTimestamp(source.createdAt, "adjudication createdAt");
  assert(![runA.annotatorPseudonym, runB.annotatorPseudonym].includes(source.adjudicatorPseudonym), "Adjudicator must be independent");
  assert(Array.isArray(source.adjudications), "Adjudications must be an array");
  const a = new Map(runA.annotations.map(item => [item.pairId, item])); const b = new Map(runB.annotations.map(item => [item.pairId, item]));
  const disagreements = new Set([...a.keys()].filter(id => b.has(id) && a.get(id).judgment !== b.get(id).judgment)); const seen = new Set();
  source.adjudications = source.adjudications.map(item => {
    const pairId = text(item?.pairId, "adjudication pairId", 1, 80);
    assert(disagreements.has(pairId), `Pair ${pairId} is not a disagreement`); assert(!seen.has(pairId), `Duplicate adjudication for ${pairId}`); seen.add(pairId);
    assert(JUDGMENTS.includes(item.judgment), `Unknown adjudication for ${pairId}`);
    return { pairId, judgment: item.judgment, rationale: text(item.rationale, `adjudication rationale for ${pairId}`, 8, 500),
      timestamp: isoTimestamp(item.timestamp, `adjudication timestamp for ${pairId}`) };
  });
  return source;
}

const blankMatrix = () => Object.fromEntries(JUDGMENTS.map(left => [left, Object.fromEntries(JUDGMENTS.map(right => [right, 0]))]));
export function analyzeAgreement(datasetInput, runAInput, runBInput, adjudicationInput = null) {
  const dataset = validateDataset(datasetInput); const runA = validateAnnotationRun(runAInput, dataset); const runB = validateAnnotationRun(runBInput, dataset);
  assert(runA.annotatorPseudonym !== runB.annotatorPseudonym, "Independent runs require distinct pseudonyms");
  assert(runA.seed === runB.seed, "Independent runs must use the same recorded seed");
  const a = new Map(runA.annotations.map(item => [item.pairId, item])); const b = new Map(runB.annotations.map(item => [item.pairId, item]));
  const common = dataset.pairs.filter(pair => a.has(pair.id) && b.has(pair.id)); const matrix = blankMatrix();
  for (const pair of common) matrix[a.get(pair.id).judgment][b.get(pair.id).judgment] += 1;
  const agreements = common.filter(pair => a.get(pair.id).judgment === b.get(pair.id).judgment).length;
  const rawAgreement = common.length ? agreements / common.length : null;
  const marginalsA = Object.fromEntries(JUDGMENTS.map(label => [label, common.filter(pair => a.get(pair.id).judgment === label).length]));
  const marginalsB = Object.fromEntries(JUDGMENTS.map(label => [label, common.filter(pair => b.get(pair.id).judgment === label).length]));
  const expectedAgreement = common.length ? JUDGMENTS.reduce((sum, label) => sum + marginalsA[label] * marginalsB[label], 0) / common.length ** 2 : null;
  const kappa = rawAgreement === null || expectedAgreement === 1 ? null : (rawAgreement - expectedAgreement) / (1 - expectedAgreement);
  const byCategory = Object.fromEntries([...new Set(dataset.pairs.map(pair => pair.category))].sort().map(category => {
    const rows = common.filter(pair => pair.category === category); const matched = rows.filter(pair => a.get(pair.id).judgment === b.get(pair.id).judgment).length;
    return [category, { compared: rows.length, agreements: matched, rawAgreement: rows.length ? matched / rows.length : null }];
  }));
  const disagreementRows = common.filter(pair => a.get(pair.id).judgment !== b.get(pair.id).judgment).map(pair => ({
    pair: copy(pair), annotationA: copy(a.get(pair.id)), annotationB: copy(b.get(pair.id))
  }));
  let adjudications = [];
  if (adjudicationInput) adjudications = validateAdjudications(adjudicationInput, dataset, runA, runB).adjudications;
  const adjudicationById = new Map(adjudications.map(item => [item.pairId, item]));
  const resolved = common.map(pair => ({ pairId: pair.id,
    judgment: a.get(pair.id).judgment === b.get(pair.id).judgment ? a.get(pair.id).judgment : adjudicationById.get(pair.id)?.judgment || null,
    source: a.get(pair.id).judgment === b.get(pair.id).judgment ? "AGREEMENT" : adjudicationById.has(pair.id) ? "ADJUDICATED" : "UNRESOLVED" }));
  const uncertainCount = common.reduce((sum, pair) => sum + Number(a.get(pair.id).judgment === "UNCERTAIN") + Number(b.get(pair.id).judgment === "UNCERTAIN"), 0);
  return { datasetId: dataset.datasetId, datasetVersion: dataset.version, seed: runA.seed,
    annotators: [runA.annotatorPseudonym, runB.annotatorPseudonym], comparedPairs: common.length, rawAgreement, cohenKappa: kappa,
    confusionMatrix: matrix, agreementByCategory: byCategory,
    uncertainFrequency: common.length ? uncertainCount / (common.length * 2) : null,
    disagreements: disagreementRows, disagreementCount: disagreementRows.length,
    adjudicationCount: adjudications.length, unresolvedDisagreementCount: disagreementRows.length - adjudications.length,
    adjudicatedResults: resolved, semanticCorrectnessEstablished: false };
}

const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function annotationRunCsv(datasetInput, runInput) {
  const dataset = validateDataset(datasetInput); const run = validateAnnotationRun(runInput, dataset); const pairs = new Map(dataset.pairs.map(pair => [pair.id, pair]));
  const header = ["dataset_id", "dataset_version", "seed", "annotator_pseudonym", "pair_id", "category", "left", "right", "judgment", "rationale", "timestamp"];
  const rows = run.annotations.map(item => { const pair = pairs.get(item.pairId); return [dataset.datasetId, dataset.version, run.seed,
    run.annotatorPseudonym, item.pairId, pair.category, pair.left, pair.right, item.judgment, item.rationale, item.timestamp]; });
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}

export function adjudicationCsv(datasetInput, runAInput, runBInput, adjudicationInput) {
  const dataset = validateDataset(datasetInput); const runA = validateAnnotationRun(runAInput, dataset); const runB = validateAnnotationRun(runBInput, dataset);
  const adjudication = validateAdjudications(adjudicationInput, dataset, runA, runB); const analysis = analyzeAgreement(dataset, runA, runB, adjudication);
  const pairs = new Map(dataset.pairs.map(pair => [pair.id, pair])); const a = new Map(runA.annotations.map(item => [item.pairId, item]));
  const b = new Map(runB.annotations.map(item => [item.pairId, item])); const resolved = new Map(analysis.adjudicatedResults.map(item => [item.pairId, item]));
  const header = ["dataset_id", "dataset_version", "seed", "pair_id", "category", "left", "right", "annotator_a", "judgment_a", "rationale_a", "annotator_b", "judgment_b", "rationale_b", "final_judgment", "resolution_source"];
  const rows = dataset.pairs.filter(pair => a.has(pair.id) && b.has(pair.id)).map(pair => [dataset.datasetId, dataset.version, runA.seed,
    pair.id, pair.category, pair.left, pair.right, runA.annotatorPseudonym, a.get(pair.id).judgment, a.get(pair.id).rationale,
    runB.annotatorPseudonym, b.get(pair.id).judgment, b.get(pair.id).rationale, resolved.get(pair.id).judgment, resolved.get(pair.id).source]);
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}
