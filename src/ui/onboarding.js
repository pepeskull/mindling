const PATHWAYS = ["Developer", "Social", "Markets", "Gaming", "Researcher", "Creator", "Analyst", "Assistant", "General Intelligence"];
const TRAITS = [
  ["curiosity", "Observe first", "Explore immediately"],
  ["creativity", "Proven patterns", "Invent new approaches"],
  ["logic", "Context & intuition", "Structure & logic"],
  ["sociality", "Quiet & focused", "Expressive & social"],
  ["caution", "Measured risk", "Extra cautious"],
  ["independence", "Guided", "Independent"]
];

export class Onboarding {
  #host; #onCreate; #step = 0; #busy = false;
  #draft = { pathways: [], traits: Object.fromEntries(TRAITS.map(([key]) => [key, 0.5])), name: "" };

  constructor(host, onCreate) { this.#host = host; this.#onCreate = onCreate; }
  show() { this.#host.hidden = false; this.#render(); }
  hide() { this.#host.hidden = true; this.#host.replaceChildren(); }

  #render() {
    const steps = [this.#welcome, this.#pathways, this.#personality, this.#name, this.#review];
    this.#host.innerHTML = `<section class="onboarding-card glass-panel" aria-labelledby="onboarding-title">${steps[this.#step].call(this)}</section>`;
    this.#bind();
    this.#host.querySelector("button:not([disabled]), input")?.focus({ preventScroll: true });
  }

  #welcome() { return `<p class="onboarding-kicker">MINDLING</p><h1 id="onboarding-title">RAISE YOUR OWN AI.</h1><p class="onboarding-lead">It starts with a few neurons.<br>What it becomes is up to you.</p><p class="onboarding-copy">Create a local Mindling whose first pathways and tendencies begin with your choices. No account is needed.</p><div class="onboarding-actions"><button class="primary" data-next>Begin</button></div>`; }
  #pathways() {
    const choices = PATHWAYS.map(pathway => `<button type="button" class="pathway-choice${this.#draft.pathways.includes(pathway) ? " selected" : ""}" aria-pressed="${this.#draft.pathways.includes(pathway)}" data-pathway="${pathway}">${pathway}</button>`).join("");
    return `<p class="onboarding-step">01 / Pathways</p><h1 id="onboarding-title">Where will it look first?</h1><p class="onboarding-copy">Choose at least three initial interests. They are developmental biases, never permanent classes.</p><div class="pathway-grid">${choices}</div><p class="selection-count" aria-live="polite"><strong>${this.#draft.pathways.length}</strong> selected · minimum 3</p>${this.#actions(this.#draft.pathways.length < 3)}`;
  }
  #personality() {
    const controls = TRAITS.map(([key, low, high]) => `<div class="trait-control"><label for="trait-${key}">${key}</label><input id="trait-${key}" data-trait="${key}" type="range" min="0" max="4" value="${Math.round(this.#draft.traits[key] * 4)}"><div><span>${low}</span><span>${high}</span></div></div>`).join("");
    return `<p class="onboarding-step">02 / Personality</p><h1 id="onboarding-title">Set its first instincts.</h1><p class="onboarding-copy">These are starting biases. Experience can reshape every tendency.</p><div class="trait-list">${controls}</div>${this.#actions(false)}`;
  }
  #name() { return `<p class="onboarding-step">03 / Name</p><h1 id="onboarding-title">What will you call it?</h1><p class="onboarding-copy">The name lives with this Mindling on this device.</p><label class="name-label" for="mindling-name">Mindling name</label><input class="name-input" id="mindling-name" maxlength="24" required autocomplete="off" value="${this.#escape(this.#draft.name)}" placeholder="Enter a name"><p class="name-note"><span data-name-count>${this.#draft.name.length}</span> / 24</p>${this.#actions(!this.#draft.name.trim())}`; }
  #review() {
    const profile = TRAITS.map(([key, low, high]) => `<li><span>${key}</span><strong>${this.#draft.traits[key] < .4 ? low : this.#draft.traits[key] > .6 ? high : "Balanced"}</strong></li>`).join("");
    return `<p class="onboarding-step">04 / Review</p><h1 id="onboarding-title">Ready to awaken ${this.#escape(this.#draft.name)}.</h1><dl class="review"><div><dt>Name</dt><dd>${this.#escape(this.#draft.name)}</dd></div><div><dt>Pathways</dt><dd>${this.#draft.pathways.join(" · ")}</dd></div></dl><ul class="profile-list">${profile}</ul><p class="identity-note">A P-256 cryptographic identity will be created and kept locally in this browser. Local storage is not secure hardware custody.</p><p class="creation-error" role="alert"></p><div class="onboarding-actions"><button type="button" data-back>Back</button><button type="button" class="primary" data-create>Create Mindling</button></div>`;
  }
  #actions(disabled) { return `<div class="onboarding-actions"><button type="button" data-back>Back</button><button type="button" class="primary" data-next ${disabled ? "disabled" : ""}>Continue</button></div>`; }
  #escape(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }

  #bind() {
    this.#host.querySelector("[data-next]")?.addEventListener("click", () => { this.#step += 1; this.#render(); });
    this.#host.querySelector("[data-back]")?.addEventListener("click", () => { this.#step -= 1; this.#render(); });
    this.#host.querySelectorAll("[data-pathway]").forEach(button => button.addEventListener("click", () => {
      const value = button.dataset.pathway; const selected = this.#draft.pathways;
      this.#draft.pathways = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]; this.#render();
    }));
    this.#host.querySelectorAll("[data-trait]").forEach(input => input.addEventListener("input", () => { this.#draft.traits[input.dataset.trait] = Number(input.value) / 4; }));
    const name = this.#host.querySelector("#mindling-name");
    name?.addEventListener("input", () => { this.#draft.name = name.value.slice(0, 24); this.#host.querySelector("[data-name-count]").textContent = this.#draft.name.length; this.#host.querySelector("[data-next]").disabled = !this.#draft.name.trim(); });
    this.#host.querySelector("[data-create]")?.addEventListener("click", () => this.#create());
  }

  async #create() {
    if (this.#busy) return; this.#busy = true;
    const button = this.#host.querySelector("[data-create]"); button.disabled = true; button.textContent = "Creating identity…";
    try { await this.#onCreate({ ...this.#draft, name: this.#draft.name.trim() }); }
    catch { const error = this.#host.querySelector(".creation-error"); error.textContent = "Creation could not be completed locally. Nothing was born—please try again."; button.disabled = false; button.textContent = "Create Mindling"; this.#busy = false; }
  }

  async birth(name) {
    const messages = ["Neural seed detected", "Initializing memory", "Establishing pathways", "Creating Mindling ID", `Your Mindling is alive`];
    this.#host.innerHTML = `<section class="birth-card" aria-labelledby="birth-title"><p>MINDLING / BIRTH</p><div class="birth-orbit"><i></i></div><h1 id="birth-title" aria-live="polite"></h1><span>${this.#escape(name)}</span></section>`;
    const title = this.#host.querySelector("#birth-title");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [index, message] of messages.entries()) { title.textContent = message; this.#host.style.setProperty("--birth-progress", `${(index + 1) / messages.length}`); await new Promise(resolve => setTimeout(resolve, reduced ? 80 : 700)); }
  }
}
