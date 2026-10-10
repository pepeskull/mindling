import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationFor, PRESETS } from '../src/preview/dashboard-presentation.js';
import { PreviewTimeline, Morphology, STAGES } from '../src/preview/evolution-model.js';
import { conditionFor } from '../src/life/life-system.js';

test('all stage presentation values derive from the active geometry and existing life rules', () => {
  const timeline = new PreviewTimeline(), morph = new Morphology(); let memories = -1, edges = 0;
  for (const stage of STAGES) {
    timeline.select(stage.number); morph.select(stage.number);
    const state = presentationFor(timeline, morph);
    assert.equal(state.stage, stage); assert.equal(state.neurons, morph.target.nodes.length);
    assert.equal(state.synapses, morph.target.edges.length); assert.ok(state.synapses > edges); edges = state.synapses;
    assert.ok(state.memories > memories); memories = state.memories;
    assert.deepEqual(state.life.attributes, PRESETS[stage.number - 1].attributes);
    assert.equal(state.life.condition, conditionFor(state.life.attributes));
    for (const value of Object.values(state.life.attributes)) assert.ok(value >= 0 && value <= 100);
    assert.equal(state.social, 'Not Connected'); assert.equal(state.transition, morph.progress);
  }
  assert.equal(PRESETS[0].memories, 0);
});

test('social counts require acknowledgement AND fully established visual connections', () => {
  const timeline = new PreviewTimeline(), morph = new Morphology(); timeline.select(7); morph.select(7);
  const state = () => presentationFor(timeline, morph);
  timeline.network.start(); assert.equal(state().social, 'Discovering');
  timeline.network.tick(1.5); assert.equal(state().social, 'Connecting');
  timeline.network.tick(2); assert.equal(state().connected, 0);
  timeline.network.tick(.8); assert.equal(state().connected, 1);
  timeline.network.tick(4.5); assert.equal(state().connected, 2);
  timeline.network.tick(4.5); assert.equal(state().connected, 3);
  timeline.network.tick(1); assert.equal(state().social, 'Connected · 3 Mindlings · Active');
  assert.deepEqual(state().peers.map(p => p.name), ['Nova','Echo','Atlas']);
  timeline.network.stop(); timeline.network.tick(2); assert.equal(state().social, 'Not Connected');
  assert.ok(state().peers.every(p => p.visibility === 0));
});
