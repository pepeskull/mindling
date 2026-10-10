import { SceneInteraction } from "../renderer/scene-interaction.js";
import { NEURAL_SEED_MORPHOLOGY, seededValue } from "../renderer/neural-morphology.js";
import { BUDGET, generateStage, Morphology, smooth } from "./evolution-model.js";

const COLORS = [0x9bd5c5, 0x7daebe, 0xb7c9de, 0x9abfcb, 0xc0b3d2, 0x9bd1ba];
const REMOTE_CENTERS = [[-3.05, .45, 0], [2.85, 1.15, -.4], [2.65, -1.4, .2]];
const MAX_SEGMENTS = BUDGET.edges * BUDGET.curveSteps + BUDGET.neurons * 18 + 2048;
const MAX_NODES = BUDGET.neurons + BUDGET.remoteBrains * BUDGET.remoteNeurons;

function curve(out, offset, ax, ay, az, bx, by, bz, t, bend) {
  const arc = 4 * t * (1 - t);
  out[offset] = ax + (bx - ax) * t;
  out[offset + 1] = ay + (by - ay) * t + arc * bend;
  out[offset + 2] = az + (bz - az) * t + arc * bend * .5;
}

// Bounded shared render buffers: both backends display the same morphology and protocol.
class RenderBuffers {
  positions = new Float32Array(MAX_NODES * 3);
  radii = new Float32Array(MAX_NODES);
  regions = new Uint8Array(MAX_NODES);
  lines = new Float32Array(MAX_SEGMENTS * 6);
  networkLines = new Float32Array(3 * 32 * 6);
  pulses = new Float32Array(BUDGET.impulses * 3);
  pulseCount = 0; segmentCount = 0; networkCount = 0;
  remote = REMOTE_CENTERS.map((center, i) => ({ center, shape: generateStage(7, 107 + i * 83) }));
  scratch = new Float32Array(6);

  rebuild(morph) {
    this.positions.set(morph.positions); this.radii.set(morph.radii);
    this.segmentCount = 0;
    const nodes = morph.target.nodes;
    for (let i = 0; i < morph.count; i++) {
      this.regions[i] = nodes[i]?.region || 0;
      const x = this.positions[i * 3], y = this.positions[i * 3 + 1], z = this.positions[i * 3 + 2];
      const length = this.radii[i] * (3 + morph.stage * .17);
      for (let branch = 0; branch < NEURAL_SEED_MORPHOLOGY.primaryDendrites; branch++) {
        const angle = branch / 6 * Math.PI * 2 + seededValue(i * 31 + branch);
        const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length, dz = (seededValue(i + branch * 7) - .5) * length;
        this.segment(x, y, z, x + dx, y + dy, z + dz);
        if (morph.stage >= 3) {
          this.segment(x + dx * .6, y + dy * .6, z + dz * .6, x + dx - dy * .35, y + dy + dx * .35, z + dz);
          if (morph.stage >= 5) this.segment(x + dx * .75, y + dy * .75, z + dz * .75, x + dx + dy * .25, y + dy - dx * .25, z + dz * 1.3);
        }
      }
    }
    for (const contour of morph.target.contours || []) {
      const growth = smooth(morph.progress);
      for (let i = 1; i < contour.length; i++) {
        const a = contour[i - 1], b = contour[i];
        this.segment(a[0], a[1], a[2], a[0] + (b[0] - a[0]) * growth, a[1] + (b[1] - a[1]) * growth, a[2] + (b[2] - a[2]) * growth);
      }
    }
    for (const [a, b] of morph.target.edges) {
      const k = a * 3, j = b * 3;
      const grow = morph.progress === 1 ? 1 : smooth(morph.progress * 1.8 - .3);
      this.path(this.positions[k], this.positions[k + 1], this.positions[k + 2], this.positions[j], this.positions[j + 1], this.positions[j + 2], .13 + (a % 4) * .055, grow);
    }
  }
  segment(ax, ay, az, bx, by, bz) {
    const k = this.segmentCount++ * 6;
    this.lines[k] = ax; this.lines[k + 1] = ay; this.lines[k + 2] = az; this.lines[k + 3] = bx; this.lines[k + 4] = by; this.lines[k + 5] = bz;
  }
  path(ax, ay, az, bx, by, bz, bend, grow = 1) {
    for (let j = 0; j < BUDGET.curveSteps; j++) {
      curve(this.scratch, 0, ax, ay, az, bx, by, bz, j / BUDGET.curveSteps * grow, bend);
      curve(this.scratch, 3, ax, ay, az, bx, by, bz, (j + 1) / BUDGET.curveSteps * grow, bend);
      this.segment(...this.scratch);
    }
  }
  animate(morph, network, elapsed, reduced) {
    this.pulseCount = 0; this.networkCount = 0;
    const edges = morph.target.edges;
    if (!reduced) for (let i = 0; i < Math.min(24, morph.stage * 3); i++) {
      const [a, b] = edges[(Math.floor(elapsed / 3) * 13 + i * 17) % edges.length];
      const k = a * 3, j = b * 3;
      curve(this.pulses, this.pulseCount++ * 3, this.positions[k], this.positions[k + 1], this.positions[k + 2], this.positions[j], this.positions[j + 1], this.positions[j + 2], (elapsed / 3 + i / 7) % 1, .13 + (a % 4) * .055);
    }
    this.remote.forEach(({ center, shape }, index) => {
      const peer = network.peers[index], visibility = peer.visibility * network.fade;
      const start = BUDGET.neurons + index * BUDGET.remoteNeurons;
      for (let i = 0; i < BUDGET.remoteNeurons; i++) {
        const node = shape.nodes[Math.floor(i / 2) * 12 + i % 2], k = (start + i) * 3;
        for (let a = 0; a < 3; a++) this.positions[k + a] = center[a] + node.position[a] * .32;
        const activity = reduced ? 1 : 1 + .12 * Math.sin(elapsed * 2 + i * .4) + peer.reaction * .35;
        this.radii[start + i] = .025 * visibility * activity; this.regions[start + i] = (index * 2 + 1) % 6;
      }
      if (!visibility) return;
      // All remote circuits are bounded, deterministic, and entirely temporary.
      for (let i = 1; i < BUDGET.remoteNeurons; i++) {
        const a = (start + i) * 3, b = (start + Math.floor((i - 1) / 2)) * 3;
        this.path(this.positions[a], this.positions[a + 1], this.positions[a + 2], this.positions[b], this.positions[b + 1], this.positions[b + 2], .02, visibility);
      }
      const length = peer.link * network.fade;
      for (let s = 0; s < 32 && length > 0; s++) {
        const k = this.networkCount++ * 6;
        curve(this.networkLines, k, 0, 0, 0, ...center, s / 32 * length, .7);
        curve(this.networkLines, k + 3, 0, 0, 0, ...center, (s + 1) / 32 * length, .7);
      }
      if (!reduced) for (const progress of [peer.outgoing, peer.incoming]) if (progress >= 0 && this.pulseCount < BUDGET.impulses) curve(this.pulses, this.pulseCount++ * 3, 0, 0, 0, ...center, progress, .7);
    });
  }
}

export class EvolutionScene {
  constructor({ three = null, interaction = new SceneInteraction(), reduced = false, provider = generateStage } = {}) {
    this.three = three; this.interaction = interaction; this.reduced = reduced;
    this.morph = new Morphology(17, provider); this.buffers = new RenderBuffers(); this.centralSegments = 0;
  }
  mount(host) {
    this.host = host;
    if (this.three) this.mountThree();
    else { this.canvas = document.createElement('canvas'); this.context = this.canvas.getContext('2d'); if (!this.context) throw new Error('Canvas unavailable'); host.append(this.canvas); }
    this.canvas.dataset.previewBackend = this.three ? 'three' : 'canvas';
    this.canvas.setAttribute('aria-hidden', 'true'); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount;
  }
  mountThree() {
    const T = this.three;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.canvas = this.renderer.domElement; this.host.append(this.canvas);
    this.scene = new T.Scene(); this.root = new T.Group(); this.scene.add(this.root);
    this.camera = new T.PerspectiveCamera(36, 1, .1, 40); this.camera.position.z = 9;
    this.scene.add(new T.AmbientLight(0xd5eee8, 2)); const light = new T.DirectionalLight(0xffffff, 2.5); light.position.set(-2, 3, 5); this.scene.add(light);
    this.soma = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .1, emissive: 0x29423c, emissiveIntensity: .5 }), MAX_NODES);
    this.soma.instanceMatrix.setUsage(T.DynamicDrawUsage); this.soma.frustumCulled = false; this.root.add(this.soma);
    this.matrix = new T.Object3D(); this.color = new T.Color();
    this.fibers = this.lineObject(this.buffers.lines, 0x8fc9bb, .26);
    this.links = this.lineObject(this.buffers.networkLines, 0x91c7df, .7);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(this.buffers.pulses, 3).setUsage(T.DynamicDrawUsage));
    this.pulses = new T.Points(geometry, new T.PointsMaterial({ color: 0xe1fff4, size: .075, transparent: true, opacity: .9, depthWrite: false })); this.pulses.frustumCulled = false; this.root.add(this.pulses);
    this.discovery = new T.Mesh(new T.RingGeometry(.98, 1, 80), new T.MeshBasicMaterial({ color: 0x8ccbbd, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); this.root.add(this.discovery);
  }
  lineObject(array, color, opacity) {
    const T = this.three, geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(array, 3).setUsage(T.DynamicDrawUsage));
    const object = new T.LineSegments(geometry, new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); object.frustumCulled = false; this.root.add(object); return object;
  }
  select(stage) { this.morph.select(stage, this.reduced); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount; }
  resize(width, height) {
    if (!width || !height) return; this.width = width; this.height = height;
    if (this.three) { this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
    else { const dpr = Math.min(devicePixelRatio, 1.5); this.canvas.width = width * dpr; this.canvas.height = height * dpr; this.context.setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  render(elapsed, delta, network) {
    if (this.morph.progress < 1) { this.morph.tick(delta); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount; }
    this.buffers.segmentCount = this.centralSegments; this.buffers.animate(this.morph, network, elapsed, this.reduced);
    if (this.three) this.renderThree(elapsed, network); else this.renderCanvas(elapsed, network);
  }
  renderThree(elapsed, network) {
    const b = this.buffers;
    this.root.rotation.set(this.interaction.rotation.x, this.interaction.rotation.y, 0);
    const framing = this.width < this.height ? Math.min(1, this.width / this.height * 1.3) : 1;
    this.root.scale.setScalar(this.interaction.zoom * framing * (this.reduced ? 1 : 1 + .008 * Math.sin(elapsed)));
    for (let i = 0; i < MAX_NODES; i++) {
      this.matrix.position.fromArray(b.positions, i * 3); this.matrix.scale.setScalar(b.radii[i]); this.matrix.updateMatrix(); this.soma.setMatrixAt(i, this.matrix.matrix);
      this.color.setHex(COLORS[b.regions[i]]); this.soma.setColorAt(i, this.color);
    }
    this.soma.instanceMatrix.needsUpdate = true; this.soma.instanceColor.needsUpdate = true;
    for (const [object, count] of [[this.fibers, b.segmentCount * 2], [this.links, b.networkCount * 2], [this.pulses, b.pulseCount]]) { object.geometry.setDrawRange(0, count); object.geometry.attributes.position.needsUpdate = true; }
    this.discovery.visible = network.state === 'DISCOVERING' && !this.reduced;
    this.discovery.scale.setScalar(1 + network.elapsed * 1.6); this.discovery.material.opacity = Math.max(0, .35 - network.elapsed * .16);
    this.renderer.render(this.scene, this.camera);
  }
  project(array, k, out, offset = 0) {
    const ry = this.interaction.rotation.y, rx = this.interaction.rotation.x;
    const x = array[k] * Math.cos(ry) + array[k + 2] * Math.sin(ry), z = -array[k] * Math.sin(ry) + array[k + 2] * Math.cos(ry);
    const y = array[k + 1] * Math.cos(rx) - z * Math.sin(rx);
    const scale = Math.min(this.width / 7.8, this.height / 5.3) * this.interaction.zoom;
    out[offset] = this.width / 2 + x * scale; out[offset + 1] = this.height / 2 - y * scale;
    return scale;
  }
  projected = new Float32Array(4);
  renderCanvas(elapsed, network) {
    const c = this.context, b = this.buffers, p = this.projected;
    c.clearRect(0, 0, this.width, this.height); c.lineWidth = .7;
    for (const [array, count, color] of [[b.lines, b.segmentCount, 'rgba(143,201,187,.34)'], [b.networkLines, b.networkCount, 'rgba(145,199,223,.75)']]) {
      c.strokeStyle = color; c.beginPath();
      for (let i = 0; i < count; i++) { this.project(array, i * 6, p); this.project(array, i * 6 + 3, p, 2); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); } c.stroke();
    }
    for (let i = 0; i < MAX_NODES; i++) if (b.radii[i] > .001) {
      const scale = this.project(b.positions, i * 3, p); c.fillStyle = `#${COLORS[b.regions[i]].toString(16)}`;
      const breath = this.reduced ? 1 : 1 + .04 * Math.sin(elapsed + i);
      c.beginPath(); c.arc(p[0], p[1], Math.max(.5, b.radii[i] * scale * breath), 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(170,225,210,.15)'; c.beginPath(); c.arc(p[0], p[1], b.radii[i] * scale * 1.7, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#e1fff4'; for (let i = 0; i < b.pulseCount; i++) { this.project(b.pulses, i * 3, p); c.beginPath(); c.arc(p[0], p[1], 2.2, 0, Math.PI * 2); c.fill(); }
    if (network.state === 'DISCOVERING' && !this.reduced) { c.strokeStyle = `rgba(145,199,223,${Math.max(0,.4-network.elapsed*.2)})`; c.beginPath(); c.arc(this.width / 2, this.height / 2, (1 + network.elapsed) * Math.min(this.width, this.height) * .18, 0, Math.PI * 2); c.stroke(); }
  }
  destroy() {
    if (this.scene) { this.scene.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); }); this.renderer?.dispose(); this.renderer?.forceContextLoss(); }
    this.canvas?.remove();
  }
}
