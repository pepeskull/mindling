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
