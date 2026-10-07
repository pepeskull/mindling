import { EVENTS } from "../app/events.js";
import { downloadMindlingProfile, safeProfileFilename } from "../profile/mindling-profile.js";
import { deriveKnowledgeDevelopment, deriveNeuronParticipation, KNOWLEDGE_RULES } from "../brain/knowledge-development.js";

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
  #knowledgeDevelopment = { overall: 0, areas: [] };

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
    document.querySelector("[data-view='memories']").addEventListener("click", () => this.#setPrimaryView("memories"));
    document.querySelector("[data-view='dashboard']").addEventListener("click", event => { event.preventDefault(); this.#setPrimaryView("dashboard"); });
    document.querySelector("[data-close-memory]").addEventListener("click", () => this.#setPrimaryView("dashboard"));
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
    this.#knowledgeDevelopment = deriveKnowledgeDevelopment(state.memories);
    this.#renderMemoryDevelopment();
  }

  #setMode(mode) {
    this.#mode = mode;
    document.querySelectorAll("[data-input-mode]").forEach(button => { const selected = button.dataset.inputMode === mode; button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected)); });
    document.querySelector("#mindling-input").placeholder = mode === "TEACH" ? "Teach your Mindling something..." : "Talk to your Mindling...";
    document.querySelector("#mindling-input").focus();
  }

  #renderMemoryDevelopment() {
    const overall = document.querySelector(".memory-overall"); const list = document.querySelector(".knowledge-area-list");
    const percent = Math.round(this.#knowledgeDevelopment.overall * 100);
    overall.innerHTML = `<div><span>Overall Development</span><strong>${percent}%</strong></div><progress max="100" value="${percent}">${percent}%</progress><small>Bounded internal development · ${this.#state.memories.length} canonical ${this.#state.memories.length === 1 ? "memory" : "memories"}</small>`;
    if (!this.#knowledgeDevelopment.areas.length) { list.innerHTML = `<p class="memory-empty">Knowledge areas will emerge as canonical memories form.</p>`; return; }
    list.innerHTML = this.#knowledgeDevelopment.areas.slice(0, KNOWLEDGE_RULES.displayedAreas).map(area => { const value = Math.round(area.progress * 100); return `<article><div><span>${this.#escape(area.label)}</span><strong>${value}%</strong></div><progress max="100" value="${value}">${value}%</progress><small>${area.memoryCount} canonical ${area.memoryCount === 1 ? "memory" : "memories"} · ${Math.round(area.cohesion * 100)}% semantic cohesion · ${area.neuronIds.length} participating ${area.neuronIds.length === 1 ? "neuron" : "neurons"}</small></article>`; }).join("");
  }

  #setPrimaryView(view) {
    const memory = view === "memories";
    document.querySelector("#memory-view").hidden = !memory;
    document.querySelector("#app").classList.toggle("memory-mode", memory);
    document.querySelectorAll("[data-view]").forEach(item => { const active = item.dataset.view === view; item.classList.toggle("active", active); if (item.matches("a")) item.toggleAttribute("aria-current", active); });
    document.querySelectorAll("[data-mobile-view]").forEach(item => item.classList.toggle("active", item.dataset.mobileView === (memory ? "memories" : "dashboard")));
  }

  #openMobileView(view) {
    const left = document.querySelector(".left-panel"); const right = document.querySelector(".right-panel");
    left.classList.toggle("mobile-open", view === "development"); right.classList.toggle("mobile-open", view === "dashboard");
    this.#setPrimaryView(view === "memories" ? "memories" : "dashboard");
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
      const participation = deriveNeuronParticipation(this.#state, selection.id, this.#knowledgeDevelopment);
      const dominant = participation.areaParticipation[0];
      const knowledge = participation.areaParticipation.length ? `<div class="neuron-knowledge"><span>Knowledge participation</span>${participation.areaParticipation.slice(0, 3).map(area => `<p><i style="--share:${Math.round(area.share * 100)}%"></i><b>${this.#escape(area.label)}</b><em>${Math.round(area.share * 100)}%</em></p>`).join("")}</div>` : "";
      inspector.innerHTML = `<button type="button" aria-label="Close inspector">×</button><p>Neuron ${String(index + 1).padStart(2, "0")}</p><dl><div><dt>Activity</dt><dd>${participation.activity}</dd></div><div><dt>Connections</dt><dd>${connections}</dd></div><div><dt>Memories</dt><dd>${participation.memoryCount}</dd></div><div><dt>Activations</dt><dd>${participation.activationTotal}</dd></div><div><dt>Reinforcement</dt><dd>${Math.round(participation.reinforcement * 100)}%</dd></div><div><dt>Development</dt><dd>${participation.specialization === "EMERGING_SPECIALIZATION" ? "Emerging specialization" : "Unspecialized"}</dd></div>${participation.primaryAreaId && dominant ? `<div><dt>Primary area</dt><dd>${this.#escape(dominant.label)}</dd></div>` : ""}</dl>${knowledge}`;
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
