import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addAnnotation, adjudicationCsv, analyzeAgreement, annotationRunCsv, createAnnotationRun,
  deterministicPresentation, validateAdjudications, validateAnnotationRun, validateDataset } from "../tools/topic-annotation/annotation-core.js";
import { KNOWLEDGE_RELATION_MATRIX } from "../src/semantic/knowledge-relation.js";

const dataset = validateDataset(JSON.parse(readFileSync(new URL("../tools/topic-annotation/pilot-dataset.json", import.meta.url), "utf8")));
const small = validateDataset({ schemaVersion: 1, datasetId: "test", version: "1", title: "Test data", pairs: [
  { id: "one", category: "same", left: "Alpha concerns a subject.", right: "Beta concerns that subject." },
  { id: "two", category: "different", left: "Gamma is one fact.", right: "Delta is another fact." },
  { id: "three", category: "ambiguous", left: "It changed there.", right: "A complete independent fact." }
] });

const completedRun = (pseudonym, judgments) => judgments.reduce((run, judgment, index) => addAnnotation(run, small, {
  pairId: small.pairs[index].id, judgment, rationale: `Reason number ${index + 1} is recorded.`, timestamp: `2026-01-0${index + 1}T00:00:00.000Z`
}), createAnnotationRun(small, { annotatorPseudonym: pseudonym, seed: "fixed-seed" }));

test("pilot dataset is separate, unlabeled, versioned, and supports the required strata", () => {
  assert.equal(dataset.schemaVersion, 1); assert.equal(dataset.pairs.length, 28); assert.equal(dataset.version, "0.1.0");
  assert.ok(dataset.pairs.every(pair => !Object.hasOwn(pair, "expected") && !Object.hasOwn(pair, "judgment")));
  const categories = new Set(dataset.pairs.map(pair => pair.category));
  for (const required of ["same-topic-different-fact", "related-distinct", "lexically-similar-different", "broad-narrow", "ambiguous", "multiple-subjects", "multilingual-unseen"])
    assert.ok(categories.has(required));
  const frozenPairs = new Set(KNOWLEDGE_RELATION_MATRIX.map(pair => [pair.left, pair.right].sort().join("\u0000")));
  assert.ok(dataset.pairs.every(pair => !frozenPairs.has([pair.left, pair.right].sort().join("\u0000"))));
  assert.throws(() => validateDataset({ ...dataset, pairs: Array.from({ length: 501 }, (_, index) => ({
    id: `large-${index}`, category: "test", left: `Left statement ${index}.`, right: `Right statement ${index}.`
  })) }), /1-500/);
});

test("presentation shuffle and side order are deterministic from dataset version and seed", () => {
  const first = deterministicPresentation(dataset, "pilot-seed"); const second = deterministicPresentation(dataset, "pilot-seed");
  assert.deepEqual(first, second); assert.notDeepEqual(first.map(item => item.id), deterministicPresentation(dataset, "other-seed").map(item => item.id));
  assert.deepEqual(new Set(first.map(item => item.id)), new Set(dataset.pairs.map(item => item.id)));
  assert.ok(first.every((item, index) => item.presentationIndex === index));
});

test("annotation validation requires rationale and prevents duplicate judgments", () => {
  const empty = createAnnotationRun(small, { annotatorPseudonym: "reviewer-a", seed: "fixed-seed" });
  assert.throws(() => addAnnotation(empty, small, { pairId: "one", judgment: "SAME_AREA", rationale: "short" }), /rationale/);
  const once = addAnnotation(empty, small, { pairId: "one", judgment: "SAME_AREA", rationale: "A sufficiently clear reason." });
  assert.throws(() => addAnnotation(once, small, { pairId: "one", judgment: "DIFFERENT_AREA", rationale: "Another sufficiently clear reason." }), /already has/);
  assert.equal(validateAnnotationRun(once, small).annotations.length, 1);
});

test("agreement reports pre-adjudication metrics, confusion, categories, and uncertainty", () => {
  const a = completedRun("reviewer-a", ["SAME_AREA", "DIFFERENT_AREA", "UNCERTAIN"]);
  const b = completedRun("reviewer-b", ["SAME_AREA", "UNCERTAIN", "UNCERTAIN"]);
  const result = analyzeAgreement(small, a, b);
  assert.equal(result.comparedPairs, 3); assert.equal(result.rawAgreement, 2 / 3); assert.ok(Number.isFinite(result.cohenKappa));
  assert.equal(result.confusionMatrix.DIFFERENT_AREA.UNCERTAIN, 1); assert.equal(result.agreementByCategory.same.rawAgreement, 1);
  assert.equal(result.uncertainFrequency, 3 / 6); assert.equal(result.disagreementCount, 1); assert.equal(result.adjudicationCount, 0);
  assert.equal(result.semanticCorrectnessEstablished, false);
});

test("third adjudicator resolves only disagreements without changing agreement metrics", () => {
  const a = completedRun("reviewer-a", ["SAME_AREA", "DIFFERENT_AREA", "UNCERTAIN"]);
  const b = completedRun("reviewer-b", ["SAME_AREA", "UNCERTAIN", "UNCERTAIN"]);
  const adjudication = validateAdjudications({ kind: "mindling-topic-adjudication", schemaVersion: 1, datasetId: "test", datasetVersion: "1",
    seed: "fixed-seed", adjudicatorPseudonym: "reviewer-c", createdAt: "2026-01-04T00:00:00.000Z",
    adjudications: [{ pairId: "two", judgment: "DIFFERENT_AREA", rationale: "The subjects require separate knowledge areas.", timestamp: "2026-01-05T00:00:00.000Z" }] }, small, a, b);
  const result = analyzeAgreement(small, a, b, adjudication);
  assert.equal(result.rawAgreement, 2 / 3); assert.equal(result.adjudicationCount, 1); assert.equal(result.unresolvedDisagreementCount, 0);
  assert.equal(result.adjudicatedResults.find(item => item.pairId === "two").source, "ADJUDICATED");
  assert.throws(() => validateAdjudications({ ...adjudication, adjudicatorPseudonym: "reviewer-a" }, small, a, b), /independent/);
});

test("JSON validation rejects mismatches and CSV exports preserve original sentences", () => {
  const a = completedRun("reviewer-a", ["SAME_AREA", "DIFFERENT_AREA", "UNCERTAIN"]);
  const b = completedRun("reviewer-b", ["SAME_AREA", "UNCERTAIN", "UNCERTAIN"]);
  assert.throws(() => validateAnnotationRun({ ...a, datasetVersion: "wrong" }, small), /mismatch/);
  assert.throws(() => validateAnnotationRun({ ...a, createdAt: "not-a-date" }, small), /ISO UTC/);
  const annotationCsv = annotationRunCsv(small, a); assert.match(annotationCsv, /"Alpha concerns a subject\."/); assert.match(annotationCsv, /"reviewer-a"/);
  const adjudication = { kind: "mindling-topic-adjudication", schemaVersion: 1, datasetId: "test", datasetVersion: "1", seed: "fixed-seed",
    adjudicatorPseudonym: "reviewer-c", createdAt: "2026-01-04T00:00:00.000Z", adjudications: [
      { pairId: "two", judgment: "DIFFERENT_AREA", rationale: "The subjects require separate knowledge areas.", timestamp: "2026-01-05T00:00:00.000Z" }
    ] };
  assert.match(adjudicationCsv(small, a, b, adjudication), /"ADJUDICATED"/);
});

test("standalone tool remains isolated from Mindling production and AI inference", () => {
  const productionApp = readFileSync(new URL("../src/app/app.js", import.meta.url), "utf8");
  const tool = readFileSync(new URL("../tools/topic-annotation/app.js", import.meta.url), "utf8");
  const core = readFileSync(new URL("../tools/topic-annotation/annotation-core.js", import.meta.url), "utf8");
  assert.doesNotMatch(productionApp, /topic-annotation|annotation-core/);
  assert.doesNotMatch(tool + core, /indexedDB|SemanticEngine|transformers|pipeline\(|fetch\([^)]*model/iu);
  assert.match(tool, /localStorage/); assert.match(tool, /pilot-dataset\.json/);
});
