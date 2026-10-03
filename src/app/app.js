import { EventBus } from "./events.js";
import { BrainEngine } from "../brain/brain-engine.js";
import { BrainRenderer } from "../renderer/brain-renderer.js";
import { MindlingDatabase } from "../storage/database.js";
import { Dashboard } from "../ui/dashboard.js";
import { Onboarding } from "../ui/onboarding.js";
import { createLocalIdentity } from "../identity/identity.js";
import { neuralSeedRecords } from "../brain/neural-seed-state.js";

export class MindlingApp {
  #events=new EventBus(); #brain=new BrainEngine(this.#events); #db=new MindlingDatabase(); #dashboard; #renderer; #onboarding;
  async start(){
    this.#dashboard=new Dashboard(this.#events);
    await this.#db.open();
    this.#dashboard.setStorageStatus(true);
    const saved = await this.#db.get("mindling", "primary");
    const state = saved ? this.#brain.hydrate(saved) : this.#brain.initialize();
    this.#renderer=new BrainRenderer(document.querySelector("#scene"));
    const rendering=this.#renderer.initialize(state);
    await rendering;
    if (saved) this.#dashboard.show();
    else {
      this.#dashboard.hide();
      this.#onboarding = new Onboarding(document.querySelector("#onboarding"), draft => this.#createMindling(draft));
      this.#onboarding.show();
    }
  }
  async #createMindling(draft) {
    const identity = await createLocalIdentity();
    const createdAt = new Date().toISOString();
    const mindling = { id: "primary", name: draft.name, stage: "NEURAL_SEED", createdAt, traits: draft.traits, pathways: draft.pathways, mindlingId: identity.mindlingId };
    const seed = neuralSeedRecords();
    await this.#db.createMindling({
      identity,
      pathways: draft.pathways.map((name, index) => ({ id: `initial-${index}`, name, selected: true, createdAt })),
      mindling,
      neurons: seed.neurons,
      synapses: seed.synapses
    });
    await this.#onboarding.birth(draft.name);
    const state = this.#brain.create(mindling);
    this.#renderer.update(state);
    this.#onboarding.hide();
    this.#dashboard.show();
  }
  destroy(){this.#renderer?.destroy();this.#dashboard?.destroy();this.#db.close();}
}
