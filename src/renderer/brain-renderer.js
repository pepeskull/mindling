import { CanvasSeedScene } from "./canvas-seed-scene.js";
import { ThreeSeedScene } from "./three-seed-scene.js";

const THREE_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js";

export class BrainRenderer {
  #host;
  #sceneView;
  #frameId = null;
  #resizeObserver;
  #paused = false;
  #lastTime = 0;
  #renderModel; #onSelection;

  constructor(host, onSelection) {
    if (!host) throw new Error("Brain renderer host is required");
    this.#host = host;
    this.#onSelection = onSelection;
  }

  async initialize(renderModel) {
    this.#validateModel(renderModel);
    this.#renderModel = structuredClone(renderModel);
    this.#sceneView = await this.#createSceneView();
    try {
      this.#sceneView.mount(this.#host, this.#renderModel);
    } catch {
      this.#sceneView.destroy?.();
      this.#host.replaceChildren();
      this.#sceneView = new CanvasSeedScene(this.#onSelection);
      this.#sceneView.mount(this.#host, this.#renderModel);
    }

    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(this.#host);
    document.addEventListener("visibilitychange", this.#handleVisibility);
    this.#resize();
    this.#start();
  }

  update(renderModel) {
    this.#validateModel(renderModel);
    this.#renderModel = structuredClone(renderModel);
    this.#sceneView?.update(this.#renderModel);
  }

  signal(route) { this.#sceneView?.signal(route); }
  highlightRoute(route) { this.#sceneView?.highlightRoute(route); }

  async #createSceneView() {
    try {
      const three = await import(THREE_MODULE_URL);
      return new ThreeSeedScene(three, this.#onSelection);
    } catch {
      return new CanvasSeedScene(this.#onSelection);
    }
  }

  #validateModel(model) {
    if (model?.stage !== "NEURAL_SEED") {
      throw new Error(`Unsupported renderer stage: ${model?.stage ?? "unknown"}`);
    }
    if (!Array.isArray(model.nodes) || !Array.isArray(model.synapses)) {
      throw new TypeError("Renderer model must contain nodes and synapses");
    }
  }

  #start() {
    if (!this.#frameId && !this.#paused) {
      this.#frameId = requestAnimationFrame(this.#renderFrame);
    }
  }

  #renderFrame = (time) => {
    this.#frameId = null;
    if (this.#paused) return;

    const delta = Math.min((time - this.#lastTime) / 1000 || 0, 0.1);
    this.#lastTime = time;
    this.#sceneView.render(time / 1000, delta);
    this.#start();
  };

  #resize() {
    this.#sceneView?.resize(this.#host.clientWidth, this.#host.clientHeight);
  }

  #handleVisibility = () => {
    this.#paused = document.hidden;
    if (this.#paused && this.#frameId) {
      cancelAnimationFrame(this.#frameId);
      this.#frameId = null;
    } else {
      this.#lastTime = performance.now();
      this.#start();
    }
  };

  destroy() {
    if (this.#frameId) cancelAnimationFrame(this.#frameId);
    this.#resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.#handleVisibility);
    this.#sceneView?.destroy();
    this.#host.replaceChildren();
  }
}
