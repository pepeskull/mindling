import { EVENTS } from "../app/events.js";

export class Dashboard {
  #unsubscribe;
  #messageTimer;
  #form;
  #handleSubmit;
  #selectionUnsubscribe;
  #state;
  #events;
  #onInput;

  constructor(events, onInput) {
    this.#events = events;
    this.#onInput = onInput;
    this.#unsubscribe = events.on(EVENTS.STATE_READY, (state) => this.render(state));
    this.#selectionUnsubscribe = events.on(EVENTS.SCENE_SELECTION, selection => this.#showSelection(selection));
    this.#form = document.querySelector("#interaction-form");
    this.#handleSubmit = (event) => this.#submitInteraction(event);
    this.#form.addEventListener("submit", this.#handleSubmit);
  }

  render(state) {
    this.#state = state;
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

  #showSelection(selection) {
    const inspector = document.querySelector("#neural-inspector");
    if (!selection) { inspector.hidden = true; return; }
    if (selection.type === "neuron") {
      const index = this.#state.nodes.findIndex(node => node.id === selection.id);
      const connections = this.#state.synapses.filter(item => item.from === selection.id || item.to === selection.id).length;
      inspector.innerHTML = `<button type="button" aria-label="Close inspector">×</button><p>Neuron ${String(index + 1).padStart(2, "0")}</p><dl><div><dt>State</dt><dd>Quiet</dd></div><div><dt>Connections</dt><dd>${connections}</dd></div><div><dt>Memories</dt><dd>${this.#state.memories.length}</dd></div><div><dt>Development</dt><dd>Unspecialized</dd></div></dl>`;
    } else {
      const index = this.#state.synapses.findIndex(item => item.id === selection.id);
      const synapse = this.#state.synapses[index];
      const from = this.#state.nodes.findIndex(node => node.id === synapse.from) + 1;
      const to = this.#state.nodes.findIndex(node => node.id === synapse.to) + 1;
      inspector.innerHTML = `<button type="button" aria-label="Close inspector">×</button><p>Synapse ${String(index + 1).padStart(2, "0")}</p><dl><div><dt>Connection</dt><dd>Neuron ${String(from).padStart(2, "0")} → ${String(to).padStart(2, "0")}</dd></div><div><dt>State</dt><dd>Quiet</dd></div><div><dt>Strength</dt><dd>Baseline</dd></div></dl>`;
    }
    inspector.hidden = false;
    inspector.querySelector("button").addEventListener("click", () => { inspector.hidden = true; });
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
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    this.#onInput(text);
    status.textContent = "Neural input received";
    status.classList.add("visible");
    clearTimeout(this.#messageTimer);
    this.#messageTimer = setTimeout(() => status.classList.remove("visible"), 2800);
    input.focus();
  }

  destroy() {
    this.#unsubscribe?.();
    this.#selectionUnsubscribe?.();
    this.#form?.removeEventListener("submit", this.#handleSubmit);
    clearTimeout(this.#messageTimer);
  }
}
