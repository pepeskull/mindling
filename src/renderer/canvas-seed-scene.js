import { SceneInteraction } from "./scene-interaction.js";
import { NEURAL_SEED_MORPHOLOGY as MORPHOLOGY, seededValue } from "./neural-morphology.js";

export class CanvasSeedScene {
  #host;
  #canvas;
  #context;
  #model;
  #width = 0;
  #height = 0;
  #interaction = new SceneInteraction();
  #reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  #points = new Map();
  #selected = null;
  #onSelection;
  #signal = null;
  #nextAmbient = 7;
  #ambientIndex = 0;
  #routeHighlight = { neuronIds: [], synapseIds: [] };

  constructor(onSelection) { this.#onSelection = onSelection; }

  mount(host, model) {
    this.#host = host;
    this.#model = model;
    this.#canvas = document.createElement("canvas");
    this.#canvas.className = "webgl-fallback";
    this.#canvas.setAttribute("aria-hidden", "true");
    this.#context = this.#canvas.getContext("2d");
    host.append(this.#canvas);
    this.#interaction.connect(host, { onTap: event => this.#pick(event) });
  }

  update(model) {
    this.#model = model;
  }

  resize(width, height) {
    if (!width || !height) return;
    const density = Math.min(devicePixelRatio, 1.5);
    this.#width = width;
    this.#height = height;
    this.#canvas.width = width * density;
    this.#canvas.height = height * density;
    this.#context.setTransform(density, 0, 0, density, 0, 0);
  }

  render(elapsed, delta) {
    this.#interaction.update(delta);
    const context = this.#context;
    context.clearRect(0, 0, this.#width, this.#height);
    const points = this.#projectNodes(elapsed);
    this.#points = points;

    for (const synapse of this.#model.synapses) {
      const start = points.get(synapse.from);
      const end = points.get(synapse.to);
      if (start && end) this.#drawSynapse(start, end, synapse);
    }
    this.#drawActivationPulse(points, elapsed);
    for (const point of points.values()) this.#drawNeuron(point);
  }

  highlightRoute(route) { this.#routeHighlight = route || { neuronIds: [], synapseIds: [] }; }

  #pick(event) {
    const bounds = this.#host.getBoundingClientRect();
    const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
    let hit = null;
    for (const [id, point] of this.#points) if (Math.hypot(x - point.x, y - point.y) <= point.radius * 1.6) hit = { type: "neuron", id };
    if (!hit) {
      for (const synapse of this.#model.synapses) {
        const a = this.#points.get(synapse.from); const b = this.#points.get(synapse.to);
        const lengthSquared = (b.x-a.x) ** 2 + (b.y-a.y) ** 2;
        const t = Math.max(0, Math.min(1, ((x-a.x)*(b.x-a.x)+(y-a.y)*(b.y-a.y))/lengthSquared));
        if (Math.hypot(x-(a.x+t*(b.x-a.x)), y-(a.y+t*(b.y-a.y))) < 8) hit = { type: "synapse", id: synapse.id };
      }
    }
    this.#selected = hit; this.#onSelection?.(hit);
  }

  #projectNodes(elapsed) {
    const centerX = this.#width / 2;
    const centerY = this.#height * 0.52;
    const scale = Math.min(this.#width, this.#height) * 0.18 * this.#interaction.zoom;
    const angle = this.#interaction.rotation.y;

    return new Map(
      this.#model.nodes.map((node, index) => {
        const [x, y, z] = node.position;
        const breath = this.#reducedMotion ? 0 : Math.sin(elapsed + index) * 0.04;
        return [node.id, {
          id: node.id,
          index,
          x: centerX + (x * Math.cos(angle) + z * Math.sin(angle)) * scale,
          y: centerY - y * scale,
          radius: 14 * node.size * (1 + breath)
        }];
      })
    );
  }

  #drawSynapse(start, end, synapse) {
    const gradient = this.#context.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, "rgba(174,218,209,.12)");
    gradient.addColorStop(0.5, "rgba(199,236,229,.55)");
    gradient.addColorStop(1, "rgba(174,218,209,.12)");
    this.#context.strokeStyle = gradient;
    this.#context.lineWidth = 0.55 + (synapse.strength ?? .2) * 1.2 + (this.#routeHighlight.synapseIds.includes(synapse.id) ? 0.8 : 0);
    this.#context.beginPath();
    this.#context.moveTo(start.x, start.y);
    this.#context.quadraticCurveTo(
      (start.x + end.x) / 2,
      Math.min(start.y, end.y) - 8,
      end.x,
      end.y
    );
    this.#context.stroke();
  }

  #drawNeuron(point) {
    this.#drawDendrites(point);
    const activity = this.#activityFor(point.id);
    const glow = this.#context.createRadialGradient(
      point.x - point.radius * 0.2,
      point.y - point.radius * 0.25,
      1,
      point.x,
      point.y,
      point.radius * (2.8 + activity)
    );
    glow.addColorStop(0, "#f7fffd");
    glow.addColorStop(0.18, "rgba(174,218,209,.8)");
    glow.addColorStop(0.48, "rgba(103,160,150,.16)");
    glow.addColorStop(1, "rgba(80,140,130,0)");
    this.#context.fillStyle = glow;
    this.#context.beginPath();
    this.#context.arc(point.x, point.y, point.radius * (2.8 + activity), 0, Math.PI * 2);
    this.#context.fill();

    const context = this.#context;
    context.beginPath();
    for (let vertex = 0; vertex < 12; vertex += 1) {
      const angle = (vertex / 12) * Math.PI * 2;
      const irregularity = 0.84 + seededValue(point.index * 101 + vertex) * 0.24;
      const highlighted = this.#selected?.type === "neuron" && this.#selected.id === point.id || this.#routeHighlight.neuronIds.includes(point.id);
      const radius = point.radius * irregularity * (highlighted ? 1.08 : 1);
      const x = point.x + Math.cos(angle) * radius;
      const y = point.y + Math.sin(angle) * radius * 0.9;
      if (vertex === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = "rgba(187,224,217,.58)";
    context.strokeStyle = "rgba(222,247,242,.42)";
    context.lineWidth = 0.65;
    context.fill(); context.stroke();
  }

  #drawDendrites(point) {
    const context = this.#context;
    context.strokeStyle = "rgba(139,190,181,.3)";
    context.lineWidth = 0.65;
    context.lineCap = "round";
    for (let branch = 0; branch < MORPHOLOGY.primaryDendrites; branch += 1) {
      const seed = point.index * 31 + branch;
      const angle = (branch / MORPHOLOGY.primaryDendrites) * Math.PI * 2 + seededValue(seed) * 0.55;
      const length = point.radius * (1.6 + seededValue(seed + 7) * 0.75);
      const startX = point.x + Math.cos(angle) * point.radius * 0.72;
      const startY = point.y + Math.sin(angle) * point.radius * 0.65;
      const endX = point.x + Math.cos(angle) * length;
      const endY = point.y + Math.sin(angle) * length;
      const bend = (seededValue(seed + 11) - 0.5) * length * 0.45;
      const controlX = (startX + endX) / 2 - Math.sin(angle) * bend;
      const controlY = (startY + endY) / 2 + Math.cos(angle) * bend;
      context.beginPath(); context.moveTo(startX, startY); context.quadraticCurveTo(controlX, controlY, endX, endY); context.stroke();
      if (branch % 2 === 0) {
        context.beginPath(); context.moveTo(controlX, controlY);
        context.lineTo(endX - Math.sin(angle) * length * 0.28, endY + Math.cos(angle) * length * 0.28); context.stroke();
      }
    }
  }

  #drawActivationPulse(points, elapsed) {
    if (!this.#signal && !this.#reducedMotion && elapsed >= this.#nextAmbient) {
      const synapse = this.#model.synapses[this.#ambientIndex % this.#model.synapses.length];
      this.#ambientIndex += 1; this.signal({ source: synapse.from, synapse: synapse.id, destination: synapse.to }, true);
      this.#signal.startedAt = elapsed; this.#nextAmbient = elapsed + 7 + (this.#ambientIndex % 3) * 1.7;
    }
    if (!this.#signal) return;
    const synapse = this.#model.synapses.find(item => item.id === this.#signal.route.synapse);
    const start = points.get(synapse.from);
    const end = points.get(synapse.to);
    const progress = Math.min((elapsed - this.#signal.startedAt) / this.#signal.duration, 1);
    if (!this.#signal.ambient && progress < .2) {
      const arrival = this.#reducedMotion ? 1 : progress / .2;
      const entryX = this.#width / 2 + (start.x - this.#width / 2) * arrival;
      const entryY = this.#height * .9 + (start.y - this.#height * .9) * arrival;
      this.#context.fillStyle = `rgba(218,255,247,${Math.sin(arrival * Math.PI) * .55})`;
      this.#context.beginPath(); this.#context.arc(entryX, entryY, 4, 0, Math.PI * 2); this.#context.fill();
    }
    const travel = this.#reducedMotion ? 1 : Math.max(0, Math.min(1, (progress - .2) / .55));
    const oneMinus = 1 - travel;
    const controlX = (start.x + end.x) / 2; const controlY = Math.min(start.y, end.y) - 8;
    const x = oneMinus * oneMinus * start.x + 2 * oneMinus * travel * controlX + travel * travel * end.x;
    const y = oneMinus * oneMinus * start.y + 2 * oneMinus * travel * controlY + travel * travel * end.y;
    const consolidation = this.#signal.route.outcome === "MEMORY_FORMATION" ? Math.max(0, Math.sin(progress * Math.PI * 2) * .18) : 0;
    const alpha = Math.sin(travel * Math.PI) * (this.#signal.ambient ? .3 : .65) + consolidation;
    const glow = this.#context.createRadialGradient(x, y, 0, x, y, 11);
    glow.addColorStop(0, `rgba(225,255,249,${alpha})`);
    glow.addColorStop(1, "rgba(225,255,249,0)");
    this.#context.fillStyle = glow;
    this.#context.fillRect(x - 11, y - 11, 22, 22);
    if (progress >= 1) this.#signal = null;
  }

  #activityFor(id) {
    if (!this.#signal) return 0;
    const elapsed = performance.now() / 1000 - this.#signal.startedAt;
    const progress = elapsed / this.#signal.duration;
    if (id === this.#signal.route.source) return Math.max(0, 1 - progress * 4) * .8;
    if (id === this.#signal.route.destination) return Math.max(0, 1 - Math.abs(progress - .82) * 7);
    return 0;
  }

  signal(route, ambient = false) {
    const duration = ambient ? 1.8 : route.outcome === "MEMORY_FORMATION" ? 3.2 : route.outcome === "REINFORCEMENT" ? 2.8 : 2.5;
    this.#signal = { route, ambient, startedAt: performance.now() / 1000, duration };
  }

  signal(route, ambient = false) { this.#signal = { route, ambient, startedAt: performance.now() / 1000, duration: ambient ? 1.8 : 2.5 }; }

  destroy() {
    this.#interaction.disconnect();
  }
}
