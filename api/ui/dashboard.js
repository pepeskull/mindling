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
  }

  setStorageStatus(available) {
    const status = document.querySelector(".storage-status");
    status.textContent = available ? "Local-first · Ready" : "Local storage unavailable";
  }

  #submitInteraction(event) {
    event.preventDefault();
    const input = document.querySelector("#mindling-input");
    const status = this.#form.querySelector(".interaction-status");
    input.value = "";
    status.textContent = "Your Mindling has not awakened yet.";
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
