import { EVENTS } from "../app/events.js";
import { downloadMindlingProfile, safeProfileFilename } from "../profile/mindling-profile.js";

export class Dashboard {
  #unsubscribe;
  #messageTimer;
  #form;
  #handleSubmit;
  #selectionUnsubscribe;
  #state;
  #events;
  #onInput;
  #mode = "TALK";
  #eventUnsubscribes = [];

  constructor(events, onInput) {
    this.#events = events;
    this.#onInput = onInput;
    this.#unsubscribe = events.on(EVENTS.STATE_READY, (state) => this.render(state));
    this.#selectionUnsubscribe = events.on(EVENTS.SCENE_SELECTION, selection => this.#showSelection(selection));
    this.#eventUnsubscribes = [
      events.on(EVENTS.MEMORY_CREATED, () => this.#showStatus("Memory formed")),
      events.on(EVENTS.MEMORY_REINFORCED, () => this.#showStatus("Memory reinforced")),
      events.on(EVENTS.LEARNING_FAILED, () => this.#showStatus("Learning could not be saved")),
      events.on(EVENTS.SEMANTIC_STATUS, ({ status }) => {
        if (status === "loading") this.#showStatus("Semantic engine loading");
        if (status === "ready") this.#showStatus("Semantic engine ready");
        if (status === "unavailable") this.#showStatus("Semantic engine unavailable");
      })
    ];
    this.#form = document.querySelector("#interaction-form");
    this.#handleSubmit = (event) => this.#submitInteraction(event);
    this.#form.addEventListener("submit", this.#handleSubmit);
    document.querySelectorAll("[data-input-mode]").forEach(button => button.addEventListener("click", () => this.#setMode(button.dataset.inputMode)));
    document.querySelector("[data-view='memories']").addEventListener("click", () => { document.querySelector("#memory-view").hidden = false; });
    document.querySelector("[data-close-memory]").addEventListener("click", () => { document.querySelector("#memory-view").hidden = true; });
    document.querySelector("[data-close-network]").addEventListener("click", () => { document.querySelector("#network-view").hidden = true; });
    document.querySelectorAll("[data-mobile-view]").forEach(button => button.addEventListener("click", () => this.#openMobileView(button.dataset.mobileView)));
    document.querySelector("[data-download-profile]").addEventListener("click", () => downloadMindlingProfile(this.#state));
    document.querySelector("#mindling-input").addEventListener("focus", () => document.documentElement.classList.add("input-active"));
    document.querySelector("#mindling-input").addEventListener("blur", () => document.documentElement.classList.remove("input-active"));
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
    document.querySelector("[data-profile-filename]").textContent = safeProfileFilename(state.name);
    this.#renderMemories();
  }

  #setMode(mode) {
    this.#mode = mode;
    document.querySelectorAll("[data-input-mode]").forEach(button => { const selected = button.dataset.inputMode === mode; button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected)); });
    document.querySelector("#mindling-input").placeholder = mode === "TEACH" ? "Teach your Mindling something..." : "Talk to your Mindling...";
    document.querySelector("#mindling-input").focus();
  }

  #renderMemories() {
    const list = document.querySelector(".memory-list");
    if (!this.#state.memories.length) { list.innerHTML = `<p class="memory-empty">No memories formed yet.</p>`; return; }
    list.innerHTML = this.#state.memories.map(memory => `<button type="button" data-memory-id="${memory.id}"><span>${this.#escape(memory.content)}</span><small><time datetime="${memory.createdAt}">${new Date(memory.createdAt).toLocaleDateString()}</time><span>${Math.round(memory.strength * 100)}% strength · ${memory.activations} activation${memory.activations === 1 ? "" : "s"}</span></small></button>`).join("");
    list.querySelectorAll("[data-memory-id]").forEach(button => button.addEventListener("click", () => {
      const memory = this.#state.memories.find(item => item.id === button.dataset.memoryId);
      this.#events.emit(EVENTS.MEMORY_SELECTED, { id: memory.id, neuronIds: [...memory.neuronIds], synapseIds: [...memory.synapseIds] });
      list.querySelectorAll("button").forEach(item => item.classList.toggle("selected", item === button));
      if (matchMedia("(max-width: 800px)").matches) {
        document.querySelector("#memory-view").hidden = true;
        document.querySelectorAll("[data-mobile-view]").forEach(item => item.classList.toggle("active", item.dataset.mobileView === "dashboard"));
      }
    }));
  }

  #openMobileView(view) {
    const left = document.querySelector(".left-panel"); const right = document.querySelector(".right-panel");
    left.classList.toggle("mobile-open", view === "development"); right.classList.toggle("mobile-open", view === "dashboard");
    document.querySelector("#memory-view").hidden = view !== "memories";
    document.querySelector("#network-view").hidden = view !== "network";
    document.querySelectorAll("[data-mobile-view]").forEach(button => button.classList.toggle("active", button.dataset.mobileView === view));
  }

  #showStatus(message) {
    const status = this.#form.querySelector(".interaction-status");
    status.textContent = message; status.classList.add("visible"); clearTimeout(this.#messageTimer);
    this.#messageTimer = setTimeout(() => status.classList.remove("visible"), 2800);
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
      inspector.innerHTML = `<button type="button" aria-label="Close inspector">×</button><p>Synapse ${String(index + 1).padStart(2, "0")}</p><dl><div><dt>Connection</dt><dd>Neuron ${String(from).padStart(2, "0")} → ${String(to).padStart(2, "0")}</dd></div><div><dt>State</dt><dd>Quiet</dd></div><div><dt>Strength</dt><dd>${Math.round((synapse.strength ?? .2) * 100)}%</dd></div></dl>`;
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
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    this.#onInput(text, this.#mode).catch(() => {});
    this.#showStatus("Processing signal");
    input.focus();
  }

  destroy() {
    this.#unsubscribe?.();
    this.#selectionUnsubscribe?.();
    this.#eventUnsubscribes.forEach(unsubscribe => unsubscribe());
    this.#form?.removeEventListener("submit", this.#handleSubmit);
    clearTimeout(this.#messageTimer);
  }
}
