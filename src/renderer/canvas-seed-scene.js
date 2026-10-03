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

  mount(host, model) {
    this.#host = host;
    this.#model = model;
    this.#canvas = document.createElement("canvas");
    this.#canvas.className = "webgl-fallback";
    this.#canvas.setAttribute("aria-hidden", "true");
    this.#context = this.#canvas.getContext("2d");
    host.append(this.#canvas);
    this.#interaction.connect(host);
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

    for (const synapse of this.#model.synapses) {
      const start = points.get(synapse.from);
      const end = points.get(synapse.to);
      if (start && end) this.#drawSynapse(start, end);
    }
    this.#drawActivationPulse(points, elapsed);
    for (const point of points.values()) this.#drawNeuron(point);
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
          index,
          x: centerX + (x * Math.cos(angle) + z * Math.sin(angle)) * scale,
          y: centerY - y * scale,
          radius: 14 * node.size * (1 + breath)
        }];
      })
    );
  }

  #drawSynapse(start, end) {
    const gradient = this.#context.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, "rgba(174,218,209,.12)");
    gradient.addColorStop(0.5, "rgba(199,236,229,.55)");
    gradient.addColorStop(1, "rgba(174,218,209,.12)");
    this.#context.strokeStyle = gradient;
    this.#context.lineWidth = 0.7;
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
    const glow = this.#context.createRadialGradient(
      point.x - point.radius * 0.2,
      point.y - point.radius * 0.25,
      1,
      point.x,
      point.y,
      point.radius * 2.8
    );
    glow.addColorStop(0, "#f7fffd");
    glow.addColorStop(0.18, "rgba(174,218,209,.8)");
    glow.addColorStop(0.48, "rgba(103,160,150,.16)");
    glow.addColorStop(1, "rgba(80,140,130,0)");
    this.#context.fillStyle = glow;
    this.#context.beginPath();
    this.#context.arc(point.x, point.y, point.radius * 2.8, 0, Math.PI * 2);
    this.#context.fill();

    const context = this.#context;
    context.beginPath();
    for (let vertex = 0; vertex < 12; vertex += 1) {
      const angle = (vertex / 12) * Math.PI * 2;
      const irregularity = 0.84 + seededValue(point.index * 101 + vertex) * 0.24;
      const radius = point.radius * irregularity;
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
    if (this.#reducedMotion || !this.#model.synapses.length) return;
    const sequence = elapsed % 8;
    const synapse = this.#model.synapses[Math.floor(sequence / 2)];
    const start = points.get(synapse.from);
    const end = points.get(synapse.to);
    const progress = Math.min((sequence % 2) / 1.35, 1);
    const x = start.x + (end.x - start.x) * progress;
    const y = start.y + (end.y - start.y) * progress;
    const alpha = Math.sin(progress * Math.PI) * 0.55;
    const glow = this.#context.createRadialGradient(x, y, 0, x, y, 11);
    glow.addColorStop(0, `rgba(225,255,249,${alpha})`);
    glow.addColorStop(1, "rgba(225,255,249,0)");
    this.#context.fillStyle = glow;
    this.#context.fillRect(x - 11, y - 11, 22, 22);
  }

  destroy() {
    this.#interaction.disconnect();
  }
}
