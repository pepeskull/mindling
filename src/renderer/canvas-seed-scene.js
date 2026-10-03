import { SceneInteraction } from "./scene-interaction.js";

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

  render(elapsed) {
    const context = this.#context;
    context.clearRect(0, 0, this.#width, this.#height);
    const points = this.#projectNodes(elapsed);

    for (const synapse of this.#model.synapses) {
      const start = points.get(synapse.from);
      const end = points.get(synapse.to);
      if (start && end) this.#drawSynapse(start, end);
    }
    this.#drawActivationPulse(points, elapsed);
    for (const point of points.values()) this.#drawNode(point);
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

  #drawNode(point) {
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
