import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, BUDGET, generateStage, Morphology, NetworkSimulation, NETWORK_STATES, PreviewTimeline } from '../src/preview/evolution-model.js';
import { EvolutionScene } from '../src/preview/evolution-scene.js';
import { createNeuralSeedState } from '../src/brain/neural-seed-state.js';
import { SceneInteraction } from '../src/renderer/scene-interaction.js';

test('the seven stages use the exact requested names and order', () => {
  assert.deepEqual(STAGES.map(s => s.name), ['Neural Seed','Neural Cluster','Primitive Mind','Learning Mind','Cognitive Mind','Autonomous Mind','Agent Mind']);
  assert.deepEqual(STAGES.map(s => s.number), [1,2,3,4,5,6,7]);
});
test('seed foundation is a detached copy of the canonical five neurons and four synapses', () => {
  const canonical = structuredClone(createNeuralSeedState()), stage = generateStage(1);
  assert.equal(stage.nodes.length, 5); assert.equal(stage.edges.length, 4);
  assert.deepEqual(stage.nodes.map(n => n.position), canonical.nodes.map(n => n.position));
  stage.nodes[0].position[0] = 99;
  assert.deepEqual(createNeuralSeedState(), canonical);
});
test('all stages are deterministic, distinct and within morphology budgets', () => {
  let previous = 0;
  for (const s of STAGES) {
    const a = generateStage(s.number, 19), b = generateStage(s.number, 19);
    assert.deepEqual(a, b); assert.ok(a.nodes.length > previous); previous = a.nodes.length;
    assert.ok(a.nodes.length <= BUDGET.neurons); assert.ok(a.edges.length <= BUDGET.edges);
    assert.ok(a.nodes.every(n => n.position.every(Number.isFinite)));
    assert.ok(a.edges.every(([i,j]) => i !== j && a.nodes[i] && a.nodes[j]));
    if (s.number > 1) assert.notDeepEqual(a.nodes, generateStage(s.number, 27).nodes);
  }
  assert.throws(() => generateStage(0), RangeError); assert.throws(() => generateStage(8), RangeError);
});
test('advanced organization has separated hemispheres and bounded elongated brain form', () => {
  const nodes = generateStage(7).nodes;
  assert.ok(nodes.filter(n => n.position[0] < 0).length >= 100);
  assert.ok(nodes.filter(n => n.position[0] > 0).length >= 100);
  assert.equal(new Set(nodes.map(n => n.region)).size, 6);
  assert.ok(nodes.every(n => Math.abs(n.position[0]) > .1));
});
test('interrupted forward and backward morphs remain continuous and converge exactly', () => {
  const m = new Morphology();
  for (const stage of [7,3,5,1,6,2,7]) {
    const before = m.positions.slice(0,15); m.select(stage); assert.deepEqual(m.positions.slice(0,15), before);
    m.tick(.4); assert.ok(m.positions.every(Number.isFinite)); assert.ok(m.radii.every(x => x >= 0));
  }
  m.tick(2); assert.equal(m.progress,1); assert.equal(m.count,240);
  const target = generateStage(7); target.nodes.forEach((n,i) => n.position.forEach((v,a) => assert.ok(Math.abs(m.positions[i*3+a]-v)<1e-6)));
  m.select(1); m.tick(2); assert.equal(m.count,5); assert.ok(m.radii.slice(5).every(x => x===0));
});
test('reduced-motion morph snaps to target without animated migration', () => {
  const m = new Morphology(); m.select(7,true); assert.equal(m.progress,1); assert.equal(m.count,240);
});
test('previous, next, play, pause, restart, direct selection and five-second playback', () => {
  const p = new PreviewTimeline(); p.previous(); assert.equal(p.stage,1);
  p.next(); assert.equal(p.stage,2); p.previous(); assert.equal(p.stage,1);
  p.play(); p.tick(4.99); assert.equal(p.stage,1); p.tick(.01); assert.equal(p.stage,2);
  p.pause(); p.tick(100); assert.equal(p.stage,2);
  p.select(6); p.play(); p.tick(5); assert.equal(p.stage,7); assert.equal(p.playing,false);
  p.next(); p.play(); p.tick(100); assert.equal(p.stage,7); assert.equal(p.playing,false);
  p.restart(); assert.equal(p.stage,1); assert.equal(p.playing,true); p.tick(30); assert.equal(p.stage,7);
  assert.throws(() => p.select(NaN),RangeError);
});
test('network discovery, outgoing handshake, acknowledgement, connection and bidirectional exchange', () => {
  const n = new NetworkSimulation(), states = new Set([n.state]); n.start(); states.add(n.state);
  n.tick(1.6); states.add(n.state); assert.equal(n.peers[0].state,'CONNECTING'); assert.ok(n.peers[0].outgoing>0); assert.equal(n.peers[0].incoming,-1); assert.equal(n.peers[0].link,0);
  n.tick(1); assert.ok(n.peers[0].incoming>0); assert.equal(n.peers[0].outgoing,-1); assert.ok(n.peers[0].reaction>0); assert.equal(n.peers[0].link,0);
  n.tick(1); states.add(n.state); assert.equal(n.peers[0].state,'CONNECTED'); assert.ok(n.peers[0].link>0);
  n.tick(10); states.add(n.state); assert.equal(n.state,'EXCHANGING');
  assert.equal(n.peers.length,3); for (const p of n.peers) { assert.equal(p.state,'EXCHANGING'); assert.equal(p.link,1); assert.ok(p.outgoing>=0 && p.incoming>=0); }
  const outgoing = n.peers[0].outgoing, incoming = n.peers[0].incoming; n.tick(.1); assert.ok(n.peers[0].outgoing > outgoing); assert.ok(n.peers[0].incoming < incoming);
  n.stop(); states.add(n.state); n.tick(.6); assert.ok(n.fade>0 && n.fade<1); n.tick(.7);
  assert.equal(n.state,'DISCONNECTED'); assert.ok(n.peers.every(p => p.link===0 && p.visibility===0 && p.incoming===-1));
  assert.deepEqual(states,new Set(NETWORK_STATES));
});
test('leaving Agent Mind removes all temporary peers and links', () => {
  const p = new PreviewTimeline(); p.select(7); p.network.start(); p.tick(15); p.previous();
  assert.equal(p.network.state,'DISCONNECTED'); assert.ok(p.network.peers.every(x => x.visibility===0));
});
test('both render backends share bounded buffers and deterministic distinct remote brains', () => {
  const view = new EvolutionScene(); const { buffers:b, morph:m } = view;
  m.select(7,true); b.rebuild(m); const central = b.segmentCount;
  const n = new NetworkSimulation(); n.start(); n.tick(15);
  for (let i=0;i<100;i++) { b.segmentCount=central; b.animate(m,n,i/10,false); assert.ok(b.segmentCount*6 <= b.lines.length); assert.ok(b.networkCount*6<=b.networkLines.length); assert.ok(b.pulseCount<=BUDGET.impulses); }
  assert.equal(b.remote.length,3); assert.notDeepEqual(b.remote[0].shape.nodes,b.remote[1].shape.nodes);
  b.segmentCount=central; b.animate(m,n,1,true); assert.equal(b.pulseCount,0);
  n.reset(); b.segmentCount=central; b.animate(m,n,1,false); assert.equal(b.networkCount,0); assert.ok(b.radii.slice(BUDGET.neurons).every(r=>r===0));
});
test('shared camera preserves zoom limits, drag rotation and releases pointer capture', () => {
  const host = new EventTarget(); const captured = new Set(); host.classList={add(){},remove(){}};
  host.setPointerCapture=id=>captured.add(id); host.hasPointerCapture=id=>captured.has(id); host.releasePointerCapture=id=>captured.delete(id);
  const interaction = new SceneInteraction(); interaction.connect(host);
  const dispatch=(type,values)=>{const event=new Event(type,{cancelable:true});Object.assign(event,values);host.dispatchEvent(event);};
  dispatch('pointerdown',{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,clientX:0,clientY:0});
  dispatch('pointermove',{pointerId:1,clientX:100,clientY:100}); assert.ok(interaction.rotation.y>-.2); assert.ok(interaction.rotation.x<=.35);
  dispatch('wheel',{deltaY:-100000,deltaMode:0}); for(let i=0;i<100;i++)interaction.update(.1); assert.ok(interaction.zoom<=1.48 && interaction.zoom>1.47);
  dispatch('wheel',{deltaY:100000,deltaMode:0});for(let i=0;i<100;i++)interaction.update(.1);assert.ok(interaction.zoom>=.72 && interaction.zoom<.73);
  interaction.disconnect();assert.equal(captured.size,0);const previous=interaction.rotation.y;
  dispatch('pointermove',{pointerId:1,clientX:200,clientY:100});assert.equal(interaction.rotation.y,previous);
});
