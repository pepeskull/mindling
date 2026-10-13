import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalScenarios, simulateSurvival } from './support/survival-scenarios.js';

test('Life 2.0 100 deterministic scenarios require both care and meaningful activity', () => {
  const results = survivalScenarios();
  assert.equal(results.length, 100);
  for (const result of results) {
    if (result.kind === 'balanced') {
      assert.equal(result.alive, true, JSON.stringify(result));
      assert.equal(result.simulatedHours, 120 * 24);
    } else {
      assert.equal(result.alive, false, JSON.stringify(result));
      if (result.kind === 'neglect') assert.ok(result.deathHours >= 48 && result.deathHours <= 96);
      assert.equal(Math.min(result.attributes.health, result.attributes.neuralStability), 0);
    }
  }
});

test('Life 2.0 a repeated balanced routine sustains ten years without growing hidden stress', () => {
  const result = simulateSurvival({ kind: 'balanced', hours: 365 * 10 * 24 });
  assert.equal(result.alive, true);
  assert.equal(result.attributes.neuralStability, 100);
  assert.ok(result.attributes.nutrition >= 80 && result.attributes.rest >= 80);
});
