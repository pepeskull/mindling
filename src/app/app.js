import { EventBus, EVENTS } from "./events.js";
import { BrainEngine } from "../brain/brain-engine.js";
import { BrainRenderer } from "../renderer/brain-renderer.js";
import { MindlingDatabase } from "../storage/database.js";
import { Dashboard } from "../ui/dashboard.js";
import { Onboarding } from "../ui/onboarding.js";
import { createLocalIdentity } from "../identity/identity.js";
import { neuralSeedRecords } from "../brain/neural-seed-state.js";
import { SemanticEngine } from "../semantic/semantic-engine.js";

export class MindlingApp {
  #events=new EventBus(); #brain=new BrainEngine(this.#events); #db=new MindlingDatabase(); #semantic=new SemanticEngine(); #dashboard; #renderer; #onboarding; #learningQueue=Promise.resolve();
  async start(){
    this.#dashboard=new Dashboard(this.#events, (text, mode) => this.#queueInput(text, mode));
    this.#events.on(EVENTS.NEURAL_INPUT, signal => this.#renderer?.signal(signal));
    this.#events.on(EVENTS.MEMORY_SELECTED, route => this.#renderer?.highlightRoute(route));
    await this.#db.open();
    this.#dashboard.setStorageStatus(true);
    const saved = await this.#db.get("mindling", "primary");
    const memories = saved ? await this.#db.getAll("memories") : [];
    const storedSynapses = saved ? await this.#db.getAll("synapses") : [];
    const pathwayRecords = saved ? await this.#db.getAll("pathways") : [];
    const state = saved ? this.#brain.hydrate({ ...saved, memories, pathwayRecords, ...(storedSynapses.length ? { synapses: storedSynapses } : {}) }) : this.#brain.initialize();
    this.#renderer=new BrainRenderer(document.querySelector("#scene"), selection => this.#events.emit(EVENTS.SCENE_SELECTION, selection));
    const rendering=this.#renderer.initialize(state);
    await rendering;
    if (saved) this.#dashboard.show();
    else {
      this.#dashboard.hide();
      this.#onboarding = new Onboarding(document.querySelector("#onboarding"), draft => this.#createMindling(draft));
      this.#onboarding.show();
    }
    this.#events.emit(EVENTS.SEMANTIC_STATUS, { status: "loading" });
    this.#semantic.initialize().then(() => {
      this.#events.emit(EVENTS.SEMANTIC_STATUS, { status: "ready" });
      this.#embedLegacyMemories();
    }).catch(() => this.#events.emit(EVENTS.SEMANTIC_STATUS, { status: "unavailable" }));
  }
  #queueInput(text, mode) {
    const task = this.#learningQueue.then(() => this.#processInput(text, mode));
    this.#learningQueue = task.catch(() => {});
    return task;
  }
  async #processInput(text, mode) {
    let semantic;
    try { semantic = await this.#semantic.evaluate(text, this.#brain.getState().memories); }
    catch { this.#events.emit(EVENTS.SEMANTIC_STATUS, { status: "unavailable" }); }
    const result = this.#brain.evaluateInput(text, mode, semantic);
    if (!result) return null;
    this.#events.emit(EVENTS.NEURAL_INPUT, { ...result.route, outcome: result.outcome });
    if (result.outcome === "STIMULATION") return result;
    try {
      await this.#db.commitLearning(result);
      const state = this.#brain.commitLearning(result);
      this.#renderer.update(state);
      this.#events.emit(result.outcome === "MEMORY_FORMATION" ? EVENTS.MEMORY_CREATED : EVENTS.MEMORY_REINFORCED, { id: result.memory.id });
      return result;
    } catch (error) {
      this.#events.emit(EVENTS.LEARNING_FAILED, { message: error.message });
      throw error;
    }
  }
  async #embedLegacyMemories() {
    for (const memory of this.#brain.getState().memories.filter(item => !item.embedding)) {
      try {
        const embedding = await this.#semantic.encode(memory.content);
        const updated = { ...memory, embedding };
        await this.#db.put("memories", updated);
        this.#brain.attachEmbedding(memory.id, embedding);
      } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  async #createMindling(draft) {
    const identity = await createLocalIdentity();
    const createdAt = new Date().toISOString();
    const pathwayRecords = draft.pathways.map((name, index) => ({ id: `initial-${index}`, name, selected: true, createdAt }));
    const mindling = { id: "primary", name: draft.name, stage: "NEURAL_SEED", createdAt, traits: draft.traits, pathways: draft.pathways, pathwayRecords, mindlingId: identity.mindlingId };
    const seed = neuralSeedRecords();
    await this.#db.createMindling({
      identity,
      pathways: pathwayRecords,
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
