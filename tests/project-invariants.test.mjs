import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createNeuralSeedState } from "../src/brain/neural-seed-state.js";
import { databaseConfig } from "../src/storage/database.js";
import { economyConfig } from "../src/economy/economy.js";

test("product-facing brand is Mindling and Socaiety is absent", () => {
  const productFiles = ["index.html", "css/layout.css", "css/dashboard.css", "src/ui/dashboard.js"];
  const content = productFiles.map(path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")).join("\n");
  assert.match(content, /Mindling/); assert.doesNotMatch(content, /Socaiety|SocAIety/);
});

test("storage, economy, topology, and static deployment invariants remain intact", () => {
  assert.equal(databaseConfig.name, "mindling-db"); assert.equal(databaseConfig.version, 1);
  assert.equal(economyConfig.tokenPaymentsEnabled, false); assert.equal(existsSync(new URL("../api", import.meta.url)), false);
  const seed = createNeuralSeedState(); assert.equal(seed.nodes.length, 5); assert.equal(seed.synapses.length, 4); assert.equal(seed.memories.length, 0);
});

test("semantic matching has no manual dictionary authority", () => {
  assert.equal(existsSync(new URL("../src/brain/concept-extractor.js", import.meta.url)), false);
  const evaluator = readFileSync(new URL("../src/brain/memory-evaluator.js", import.meta.url), "utf8");
  assert.doesNotMatch(evaluator, /Jaccard|compareConcepts|FUNCTION_WORDS|synonyms/i);
  const knowledge = readFileSync(new URL("../src/brain/knowledge-development.js", import.meta.url), "utf8");
  assert.doesNotMatch(knowledge, /stopwords?|keywordMap|topicMap|pathwayMap|synonym|\bTrading\b|\bProgramming\b|\bMusic\b/);
});

test("Memory is a reversible main view and keeps the renderer mounted", () => {
  const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/ui/dashboard.js", import.meta.url), "utf8");
  assert.match(markup, /data-view="dashboard"/); assert.match(markup, /Memory Development/);
  assert.match(dashboard, /#setPrimaryView\("dashboard"\)/); assert.match(dashboard, /classList\.toggle\("memory-mode"/);
  assert.doesNotMatch(dashboard, /renderer\.(destroy|initialize)/);
});

test("E5 topic experiment is debug-gated and absent from normal startup", () => {
  const app = readFileSync(new URL("../src/app/app.js", import.meta.url), "utf8");
  const model = readFileSync(new URL("../src/semantic/semantic-model.js", import.meta.url), "utf8");
  assert.match(app, /location\.hostname === "localhost"/); assert.match(app, /semantic-debug/);
  assert.match(app, /runKnowledgeTopicE5Matrix/); assert.match(app, /simulateKnowledgeAreasE5/);
  assert.match(app, /auditE5Implementation/);
  assert.doesNotMatch(app.split("#installSemanticDiagnostics")[0], /inspectKnowledgeTopicE5|runKnowledgeTopicE5Matrix|simulateKnowledgeAreasE5|auditE5Implementation/);
  assert.match(model, /knowledgeTopicCandidate: "Xenova\/multilingual-e5-small"/);
  assert.match(model, /`\$\{prefix\}: \$\{text\}`/); assert.match(model, /new Float32Array\(embedding\)/);
});
