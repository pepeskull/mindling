import { OnboardingSphere } from './onboarding-sphere.js';
import { PATHWAYS } from '../pathways/pathways.js';
const DIMENSIONS = [
  ["thinkingStyle", "Thinking style", "Creative", "Logical"],
  ["uncertaintyStyle", "Approach to the unknown", "Exploratory", "Cautious"],
  ["autonomyStyle", "Social & decision style", "Collaborative", "Independent"]
];

export function deriveInitialTraits({ thinkingStyle, uncertaintyStyle, autonomyStyle }) {
  return {
    creativity: 1 - thinkingStyle,
    logic: thinkingStyle,
    curiosity: 1 - uncertaintyStyle,
    caution: uncertaintyStyle,
    sociality: 1 - autonomyStyle,
    independence: autonomyStyle
  };
}

export class Onboarding {
  #host; #onCreate; #step = 0; #busy = false;
  #draft = { pathways: [], dimensions: Object.fromEntries(DIMENSIONS.map(([key]) => [key, 0.5])), name: "" };

  constructor(host, onCreate, {three=null}={}) { this.#host = host; this.#onCreate = onCreate; this.three=three; }
  show() {
    this.#host.hidden=false;document.querySelector('#app').classList.add('onboarding-active');
    this.chrome=document.querySelector('.dashboard-chrome');this.chromeWasInert=this.chrome.inert;this.chrome.inert=true;
    this.#host.innerHTML='<div class="onboarding-brand"><a href="/" aria-label="Play Mindling"><img src="./logo.png" alt="" width="25" height="25">PLAY MINDLING</a><details class="onboarding-help"><summary aria-label="Help with setup">?</summary><p>Create your Mindling locally. Choose at least three origin interests, shape its tendencies and give it a name. Existing saved Mindlings open their Dashboard directly.</p></details></div><div class="onboarding-experience"><div class="onboarding-sphere" aria-hidden="true"></div><div data-onboarding-content></div><ol class="onboarding-progress" aria-label="Setup progress"></ol></div>';
    this.content=this.#host.querySelector('[data-onboarding-content]');this.sphere=new OnboardingSphere(this.#host.querySelector('.onboarding-sphere'),this.three);this.#render();
  }
  hide() { this.sphere?.destroy();this.sphere=null;this.#host.hidden=true;this.#host.replaceChildren();document.querySelector('#app').classList.remove('onboarding-active');if(this.chrome)this.chrome.inert=this.chromeWasInert; }

  #render() {
    const steps = [this.#welcome, this.#pathways, this.#personality, this.#name, this.#review];
    this.content.innerHTML = `<section class="onboarding-card" aria-labelledby="onboarding-title">${steps[this.#step].call(this)}</section>`;
    this.sphere.setStep(this.#step);this.#host.dataset.step=String(this.#step);
    const progress=this.#host.querySelector('.onboarding-progress');progress.replaceChildren();
    ['Welcome','Pathways','Personality','Identity','Review','Birth'].forEach((label,index)=>{const item=document.createElement('li');item.textContent=label;if(index===this.#step)item.setAttribute('aria-current','step');else if(index<this.#step)item.dataset.complete='true';progress.append(item);});
    this.#bind();
    this.#host.scrollTop=0;
    const focus=this.content.querySelector("button:not([disabled]), input");focus?.focus({preventScroll:focus.tagName!=='INPUT'});
  }

  #welcome() { return `<p class="onboarding-kicker">MINDLING</p><h1 id="onboarding-title">A mind begins with you.</h1><p class="onboarding-lead">It starts with a few neurons.<br>What it becomes is up to you.</p><p class="onboarding-copy">Create a local Mindling whose first pathways and tendencies begin with your choices. No account is needed.</p><div class="onboarding-actions"><button class="primary" data-next>Begin</button></div>`; }
  #pathways() {
    const choices = PATHWAYS.map(pathway => `<button type="button" class="pathway-choice${this.#draft.pathways.includes(pathway) ? " selected" : ""}" aria-pressed="${this.#draft.pathways.includes(pathway)}" data-pathway="${pathway}">${pathway}</button>`).join("");
    return `<p class="onboarding-step">01 / Pathways</p><h1 id="onboarding-title">Where will it look first?</h1><p class="onboarding-copy">Choose at least three initial interests. These become its permanent Origin DNA. Live Pathways evolve as it learns.</p><div class="pathway-grid">${choices}</div><p class="selection-count" aria-live="polite"><strong>${this.#draft.pathways.length}</strong> selected · minimum 3</p>${this.#actions(this.#draft.pathways.length < 3)}`;
  }
  #personality() {
    const controls = DIMENSIONS.map(([key, title, low, high]) => `<div class="trait-control"><label for="dimension-${key}">${title}</label><div class="dimension-labels"><span>${low}</span><span>${high}</span></div><input id="dimension-${key}" data-dimension="${key}" data-low="${low}" data-high="${high}" type="range" min="0" max="100" step="1" value="${Math.round(this.#draft.dimensions[key] * 100)}" aria-describedby="dimension-${key}-value"><output id="dimension-${key}-value">${this.#dimensionLabel(this.#draft.dimensions[key], low, high)}</output></div>`).join("");
    return `<p class="onboarding-step">02 / Personality</p><h1 id="onboarding-title">Set its first instincts.</h1><p class="onboarding-copy">Choose between three paired tendencies. Balanced is valid, and experience can later reshape every bias independently.</p><div class="trait-list">${controls}</div>${this.#actions(false)}`;
  }
  #name() { return `<p class="onboarding-step">03 / Identity</p><h1 id="onboarding-title">What will you call it?</h1><p class="onboarding-copy">Give your developing digital companion a name. Its identity stays on this device.</p><label class="name-label" for="mindling-name">Mindling name</label><input class="name-input" id="mindling-name" maxlength="24" required autocomplete="off" value="${this.#escape(this.#draft.name)}" placeholder="Enter a name"><p class="name-note"><span data-name-count>${this.#draft.name.length}</span> / 24</p>${this.#actions(!this.#draft.name.trim())}`; }
  #review() {
    const profile = DIMENSIONS.map(([key, title, low, high]) => `<li><span>${title}</span><strong>${this.#dimensionLabel(this.#draft.dimensions[key], low, high)}</strong></li>`).join("");
    return `<p class="onboarding-step">04 / Review</p><h1 id="onboarding-title">Ready to awaken ${this.#escape(this.#draft.name)}.</h1><dl class="review"><div><dt>Name</dt><dd>${this.#escape(this.#draft.name)}</dd></div><div><dt>Pathways</dt><dd>${this.#draft.pathways.join(" · ")}</dd></div></dl><ul class="profile-list">${profile}</ul><p class="identity-note">A P-256 cryptographic identity will be created and kept locally in this browser. Local storage is not secure hardware custody.</p><p class="creation-error" role="alert"></p><div class="onboarding-actions"><button type="button" data-back>Back</button><button type="button" class="primary" data-create>Create Mindling</button></div>`;
  }
  #actions(disabled) { return `<div class="onboarding-actions"><button type="button" data-back>Back</button><button type="button" class="primary" data-next ${disabled ? "disabled" : ""}>Continue</button></div>`; }
  #escape(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
  #dimensionLabel(value, low, high) { return value < .4 ? low : value > .6 ? high : "Balanced"; }

  #bind() {
    this.#host.querySelector("[data-next]")?.addEventListener("click", () => { this.#step += 1; this.#render(); });
    this.#host.querySelector("[data-back]")?.addEventListener("click", () => { this.#step -= 1; this.#render(); });
    this.#host.querySelectorAll("[data-pathway]").forEach(button => button.addEventListener("click", () => {
      const value = button.dataset.pathway; const selected = this.#draft.pathways;
      const isSelected = selected.includes(value);
      this.#draft.pathways = isSelected ? selected.filter(item => item !== value) : [...selected, value];
      button.classList.toggle("selected", !isSelected);
      button.setAttribute("aria-pressed", String(!isSelected));
      this.#host.querySelector(".selection-count strong").textContent = this.#draft.pathways.length;
      this.#host.querySelector("[data-next]").disabled = this.#draft.pathways.length < 3;
    }));
    this.#host.querySelectorAll("[data-dimension]").forEach(input => input.addEventListener("input", () => {
      const value = Number(input.value) / 100;
      this.#draft.dimensions[input.dataset.dimension] = value;
      input.nextElementSibling.value = this.#dimensionLabel(value, input.dataset.low, input.dataset.high);
    }));
    const name = this.#host.querySelector("#mindling-name");
    name?.addEventListener("input", () => { this.#draft.name = name.value.slice(0, 24); this.#host.querySelector("[data-name-count]").textContent = this.#draft.name.length; this.#host.querySelector("[data-next]").disabled = !this.#draft.name.trim(); });
    this.#host.querySelector("[data-create]")?.addEventListener("click", () => this.#create());
  }

  async #create() {
    if (this.#busy) return; this.#busy = true;
    const button = this.#host.querySelector("[data-create]"); button.disabled = true; button.textContent = "Creating identity…";
    try { await this.#onCreate({ ...this.#draft, traits: deriveInitialTraits(this.#draft.dimensions), name: this.#draft.name.trim() }); }
    catch { this.#busy=false;this.#render();this.#host.querySelector(".creation-error").textContent="Creation could not be completed locally. Please try again."; }
  }

  async birth(name,{create=async()=>{}}={}) {
    this.#host.hidden=false;this.sphere.setStep(5);this.#host.dataset.step='birth';
    this.content.innerHTML=`<section class="birth-card" aria-labelledby="birth-title"><p>MINDLING / BIRTH</p><h1 id="birth-title" aria-live="polite">Awakening ${this.#escape(name)}.</h1><span>A small beginning. A mind of its own.</span><div class="awakening-progress"><p data-install-detail role="status">Creating identity and local memory.</p><progress aria-label="Mindling awakening"></progress></div></section>`;
    const stages=this.#host.querySelector('.onboarding-progress').children;for(const [index,item]of [...stages].entries()){item.removeAttribute('aria-current');if(index===5)item.setAttribute('aria-current','step');else item.dataset.complete='true';}
    const title=this.#host.querySelector('#birth-title'),detail=this.#host.querySelector('[data-install-detail]'),progress=this.#host.querySelector('progress');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pause=()=>new Promise(resolve=>setTimeout(resolve,reduced?0:350));
    await create();await pause();
    title.textContent='AWAKENING COMPLETE';
    detail.textContent='Local identity and native learning are ready.';
    progress.max=100;progress.value=100;await pause();return 'ready';
  }
}
