import { neuralSeedRecords } from "../brain/neural-seed-state.js";
import { seededValue } from "../renderer/neural-morphology.js";

export const STAGES = Object.freeze([
  ["Neural Seed", 5, "Five neurons. The first living circuit."],
  ["Neural Cluster", 24, "New branches reach beyond the original seed."],
  ["Primitive Mind", 64, "Two emerging hemispheres begin to communicate."],
  ["Learning Mind", 104, "Regional circuits find their place."],
  ["Cognitive Mind", 148, "Distant regions coordinate through curved pathways."],
  ["Autonomous Mind", 196, "An intricate, connected internal architecture."],
  ["Agent Mind", 240, "A developed mind. Explore simulated neural exchange."]
].map(([name, count, description], index) => Object.freeze({ number: index + 1, name, count, description })));
export const BUDGET = Object.freeze({ neurons: 240, edges: 960, remoteBrains: 3, remoteNeurons: 36, impulses: 30, curveSteps: 8 });
export const AMELIA_STATUS = "PENDING AUTHORIZATION";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function cortexPoint(side, theta, latitude, stage) {
  const size = .82 + stage * .095;
  const ridge = 1 + .045 * Math.sin(theta * 7 + latitude * 5);
  const ring = Math.sin(latitude);
  return [side * (.15 + ring * (.58 + .5 * Math.cos(theta))) * size,
    (Math.cos(latitude) * .94 + .12 - .10 * Math.sin(theta) * ring) * size,
    Math.sin(theta) * ring * 1.12 * size * ridge];
}

// Original mathematical morphology; this provider is the boundary for future licensed assets.
// Stable indices preserve neuron identity across stages. No canonical objects leave this module.
export function generateStage(stage, seed = 17) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 7) throw new RangeError("Stage must be 1–7");
  const foundation = neuralSeedRecords();
  if (stage === 1) return { stage, nodes: foundation.neurons.map(n => ({ ...n, radius: .105 * n.size, region: 0 })), edges: foundation.synapses.map(e => [foundation.neurons.findIndex(n => n.id === e.from), foundation.neurons.findIndex(n => n.id === e.to)]) };
  const nodes = [];
  for (let i = 0; i < STAGES[stage - 1].count; i++) {
    const side = i % 2 ? 1 : -1;
    const u = seededValue(seed + i * 7), v = seededValue(seed + i * 7 + 1);
    const theta = u * Math.PI * 2, latitude = Math.acos(2 * v - 1);
    const shell = .65 + .35 * seededValue(seed + i * 7 + 2);
    const fold = 1 + .065 * Math.sin(theta * 9 + latitude * 7);
    const brain = cortexPoint(side, theta, latitude, stage);
    const organization = smooth((stage - 2) / 3);
    const seedPosition = foundation.neurons[i % 5].position;
    const spread = [seedPosition[0] + (u - .5) * .95, seedPosition[1] + (v - .5) * .9, seedPosition[2] + (shell - .8) * 3];
    const position = brain.map((x, axis) => spread[axis] * (1 - organization) + x * shell * fold * organization);
    nodes.push({ id: i < 5 ? foundation.neurons[i].id : `visual-${i}`, position, radius: i < 5 ? .09 - stage * .006 : .035 + seededValue(i + seed) * .022, region: (side > 0 ? 3 : 0) + Math.min(2, Math.floor(v * 3)) });
  }
  const edges = [[0, 1], [0, 2], [0, 3], [0, 4]], keys = new Set(edges.map(e => e.join(':')));
  for (let i = 5; i < nodes.length; i++) {
    const nearest = nodes.slice(0, i).map((n, j) => ({ j, distance: n.position.reduce((s, x, axis) => s + (x - nodes[i].position[axis]) ** 2, 0) })).sort((a, b) => a.distance - b.distance);
    for (const { j } of nearest.slice(0, stage < 4 ? 2 : 3)) { const key = `${j}:${i}`; if (!keys.has(key)) { edges.push([j, i]); keys.add(key); } }
    if (stage >= 4 && i % 5 === 0) edges.push([i, (i + 31) % nodes.length]);
  }
  const contours = [];
  if (stage >= 3) for (const side of [-1, 1]) for (let band = 0; band < stage + 1; band++) {
    const latitude = .3 + band / stage * 2.5;
    const points = [];
    for (let j = 0; j <= 40; j++) {
      const theta = j / 40 * Math.PI * 2;
      points.push(cortexPoint(side, theta, latitude + .065 * Math.sin(theta * 5 + band), stage));
    }
    contours.push(points);
  }
  return { stage, nodes, edges, contours };
}

export const NETWORK_STATES = Object.freeze(["DISCONNECTED", "DISCOVERING", "CONNECTING", "CONNECTED", "EXCHANGING", "DISCONNECTING"]);
export class NetworkSimulation {
  state = "DISCONNECTED"; elapsed = 0; fade = 0; stopping = false;
  peers = Array.from({ length: 3 }, () => ({ state: "DISCONNECTED", visibility: 0, link: 0, outgoing: -1, incoming: -1, reaction: 0 }));
  start() { if (this.state !== "DISCONNECTED") return; this.elapsed = 0; this.fade = 1; this.state = "DISCOVERING"; }
  stop() { if (this.state === "DISCONNECTED" || this.stopping) return; this.stopping = true; this.state = "DISCONNECTING"; }
  reset() { this.state = "DISCONNECTED"; this.elapsed = 0; this.fade = 0; this.stopping = false; for (const p of this.peers) Object.assign(p, { state: "DISCONNECTED", visibility: 0, link: 0, outgoing: -1, incoming: -1, reaction: 0 }); }
  tick(delta) {
    if (this.state === "DISCONNECTED") return;
    if (this.stopping) { this.fade = Math.max(0, this.fade - delta / 1.2); if (!this.fade) this.reset(); return; }
    this.elapsed += delta;
    let activeState = "EXCHANGING";
    this.peers.forEach((p, index) => {
      const t = this.elapsed - index * 4.5;
      p.visibility = smooth(t / 1.2); p.link = smooth((t - 3.5) / .8); p.outgoing = -1; p.incoming = -1; p.reaction = 0;
      if (t < 0) p.state = "DISCONNECTED";
      else if (t < 1.5) p.state = "DISCOVERING";
      else if (t < 3.5) { p.state = "CONNECTING"; if (t < 2.5) p.outgoing = t - 1.5; else { p.incoming = 1 - (t - 2.5); p.reaction = 1 - (t - 2.5); } }
      else if (t < 4.5) p.state = "CONNECTED";
      else { p.state = "EXCHANGING"; p.outgoing = ((t - 4.5) % 2) / 2; p.incoming = 1 - ((t - 4.5 + 1) % 2) / 2; p.reaction = Math.max(0, 1 - p.outgoing * 5); }
      if (t >= 0 && p.state !== "EXCHANGING") activeState = p.state;
    });
    this.state = activeState;
  }
}

export class PreviewTimeline {
  stage = 1; playing = false; age = 0; network = new NetworkSimulation();
  select(stage) { if (!Number.isInteger(stage) || stage < 1 || stage > 7) throw new RangeError("Invalid stage"); this.stage = stage; this.age = 0; this.network.reset(); if (stage === 7) this.playing = false; }
  previous() { this.select(Math.max(1, this.stage - 1)); }
  next() { this.select(Math.min(7, this.stage + 1)); }
  play() { this.playing = this.stage < 7; }
  pause() { this.playing = false; }
  restart() { this.select(1); this.playing = true; }
  tick(delta) {
    if (!Number.isFinite(delta) || delta < 0) return;
    if (this.playing) {
      this.age += delta;
      while (this.age >= 5 && this.playing) { const remaining = this.age - 5; this.select(this.stage + 1); this.age = remaining; }
    }
    if (this.stage === 7) this.network.tick(delta);
  }
}

// Fixed storage reused by both rendering backends. Growth starts at an existing parent.
export class Morphology {
  constructor(seed = 17, provider = generateStage) {
    this.stages = STAGES.map(s => provider(s.number, seed));
    this.positions = new Float32Array(BUDGET.neurons * 3); this.radii = new Float32Array(BUDGET.neurons);
    this.fromPositions = new Float32Array(this.positions.length); this.fromRadii = new Float32Array(this.radii.length);
    this.stage = 1; this.progress = 1; this.target = this.stages[0]; this.count = 5;
    this.target.nodes.forEach((n, i) => { this.positions.set(n.position, i * 3); this.radii[i] = n.radius; });
  }
  select(stage, immediate = false) {
    this.fromPositions.set(this.positions); this.fromRadii.set(this.radii);
    const previousCount = this.target.nodes.length; this.stage = stage; this.target = this.stages[stage - 1];
    this.count = Math.max(this.count, this.target.nodes.length);
    for (let i = previousCount; i < this.target.nodes.length; i++) if (!this.radii[i]) this.fromPositions.set(this.positions.subarray((i % previousCount) * 3, (i % previousCount) * 3 + 3), i * 3);
    this.progress = immediate ? 1 : 0; this.tick(0);
  }
  tick(delta) {
    this.progress = Math.min(1, this.progress + delta / 1.6); const t = smooth(this.progress);
    for (let i = 0; i < this.count; i++) {
      const node = this.target.nodes[i]; this.radii[i] = this.fromRadii[i] * (1 - t) + (node?.radius || 0) * t;
      for (let a = 0; a < 3; a++) { const k = i * 3 + a; this.positions[k] = this.fromPositions[k] * (1 - t) + (node ? node.position[a] : this.fromPositions[k]) * t; }
    }
    if (this.progress === 1) this.count = this.target.nodes.length;
  }
}
