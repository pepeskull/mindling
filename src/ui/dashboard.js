import { EVENTS } from "../app/events.js";

export class Dashboard {
  #unsubscribe;
  #messageTimer;
  #form;
  #handleSubmit;

  constructor(events) {
    this.#unsubscribe = events.on(EVENTS.STATE_READY, (state) => this.render(state));
    this.#form = document.querySelector("#interaction-form");
    this.#handleSubmit = (event) => this.#submitInteraction(event);
    this.#form.addEventListener("submit", this.#handleSubmit);
  }

  render(state) {
    const stats = {
      neurons: state.nodes.length,
      synapses: state.synapses.length,
      memories: state.memories.length
    };

    for (const [key, value] of Object.entries(stats)) {
      document.querySelector(`[data-stat="${key}"]`).textContent = value;
    }
    if (!state.name) return;
    document.querySelector(".today-state p").innerHTML = `${this.#escape(state.name)} is awake.<small>The Neural Seed is listening.</small>`;
    document.querySelector(".hero-copy h1").textContent = `${state.name} is awake.`;
    document.querySelector(".hero-copy span").textContent = "It starts with a few neurons. What it becomes is up to you.";
    document.querySelector(".pathways-copy").textContent = state.pathways.join(" · ");
    document.querySelector(".mindling-id").textContent = state.mindlingId;
  }

  #escape(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
  show() { document.querySelector(".dashboard-chrome").classList.remove("is-hidden"); }
  hide() { document.querySelector(".dashboard-chrome").classList.add("is-hidden"); }

  setStorageStatus(available) {
    const status = document.querySelector(".storage-status");
    status.textContent = available ? "Local-first · Ready" : "Local storage unavailable";
  }

  #submitInteraction(event) {
    event.preventDefault();
    const input = document.querySelector("#mindling-input");
    const status = this.#form.querySelector(".interaction-status");
    input.value = "";
    status.textContent = "Conversation will awaken in a future milestone.";
    status.classList.add("visible");
    clearTimeout(this.#messageTimer);
    this.#messageTimer = setTimeout(() => status.classList.remove("visible"), 2800);
    input.focus();
  }

  destroy() {
    this.#unsubscribe?.();
    this.#form?.removeEventListener("submit", this.#handleSubmit);
    clearTimeout(this.#messageTimer);
  }
}
