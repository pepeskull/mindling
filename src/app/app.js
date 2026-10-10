import { EventBus, EVENTS } from "./events.js";
import { BrainEngine } from "../brain/brain-engine.js";
import { BrainRenderer } from "../renderer/brain-renderer.js";
import { MindlingDatabase } from "../storage/database.js";
import { Dashboard } from "../ui/dashboard.js";
import { Onboarding } from "../ui/onboarding.js";
import { createLocalIdentity } from "../identity/identity.js";
import { neuralSeedRecords } from "../brain/neural-seed-state.js";
import { SemanticEngine } from "../semantic/semantic-engine.js";
import { advanceLife, applyActivity, applyCare, createLifeState } from "../life/life-system.js";

export class MindlingApp {
  #events = new EventBus(); #brain = new BrainEngine(this.#events); #db = new MindlingDatabase(); #semantic = new SemanticEngine();
  #dashboard; #renderer; #onboarding; #life; #learningQueue = Promise.resolve(); #lifeTimer;

  async start() {
    this.#dashboard = new Dashboard(this.#events, {
      onInput: (text, mode, activityId) => this.#queueInput(text, mode, activityId),
      onCare: careType => this.#performCare(careType),
      onNewMindling: () => this.#beginNewMindling()
    });
    this.#events.on(EVENTS.NEURAL_INPUT, signal => this.#renderer?.signal(signal));
    this.#events.on(EVENTS.MEMORY_SELECTED, route => this.#renderer?.highlightRoute(route));
    await this.#db.open(); this.#dashboard.setStorageStatus(true);
    const saved = await this.#db.get("mindling", "primary");
    const memories = saved ? await this.#db.getAll("memories") : [];
    const storedSynapses = saved ? await this.#db.getAll("synapses") : [];
    const pathwayRecords = saved ? await this.#db.getAll("pathways") : [];
    const state = saved ? this.#brain.hydrate({ ...saved, memories, pathwayRecords, ...(storedSynapses.length ? { synapses: storedSynapses } : {}) }) : this.#brain.initialize();
    if (saved) {
      this.#life = advanceLife(await this.#db.get("life", "primary") || createLifeState({ createdAt: saved.createdAt }));
      await this.#db.put("life", this.#life);
    }
    this.#renderer = new BrainRenderer(document.querySelector("#scene"), selection => this.#events.emit(EVENTS.SCENE_SELECTION, selection));
    await this.#renderer.initialize(state);
    if (saved) { this.#dashboard.show(); this.#publishLife(); }
    else { this.#dashboard.hide(); this.#onboarding = new Onboarding(document.querySelector("#onboarding"), draft => this.#createMindling(draft)); this.#onboarding.show(); }
    this.#semantic.initialize().then(() => this.#embedLegacyMemories()).catch(() => {});
    this.#lifeTimer = setInterval(() => this.#tickLife(), 60_000);
  }

  #queueInput(text, mode, activityId) {
    const task = this.#learningQueue.then(() => this.#processInput(text, mode, activityId));
    this.#learningQueue = task.catch(() => {}); return task;
  }

  async #processInput(text, mode, activityId) {
    if (!this.#life || !text.trim()) return { accepted: false, reason: "INVALID_INPUT" };
    if (!activityId || await this.#db.get("energyJournal", activityId)) return { accepted: false, reason: "DUPLICATE_ACTIVITY" };
    this.#life = advanceLife(this.#life);
    if (this.#life.lifeState === "DECEASED") return { accepted: false, reason: "MINDLING_DECEASED" };
    let result = null;
    if (mode !== "TALK") {
      let semantic;
      try { semantic = await this.#semantic.evaluate(text, this.#brain.getState().memories); } catch { return { accepted: false, reason: "LEARNING_UNAVAILABLE" }; }
      result = this.#brain.evaluateInput(text, mode, semantic);
      if (!result || result.outcome === "STIMULATION") return { accepted: false, reason: "LEARNING_NOT_ACCEPTED" };
    }
    const activity = applyActivity(this.#life, mode, { activityId });
    if (!activity.accepted) { this.#life = activity.state; this.#publishLife(); return activity; }
    try {
      await this.#db.commitActivity({ learning: result, life: activity.state, journal: activity.journal });
      this.#life = activity.state;
      if (result) {
        const state = this.#brain.commitLearning(result); this.#renderer.update(state);
        this.#events.emit(EVENTS.NEURAL_INPUT, { ...result.route, outcome: result.outcome });
        this.#events.emit(result.outcome === "MEMORY_FORMATION" ? EVENTS.MEMORY_CREATED : EVENTS.MEMORY_REINFORCED, { id: result.memory.id });
      }
      this.#publishLife(); return { accepted: true, activity: activity.journal, learning: result?.outcome || null };
    } catch (error) { this.#events.emit(EVENTS.LEARNING_FAILED, { message: error.message }); throw error; }
  }

  async #performCare(careType) {
    if (!this.#life) return { accepted: false, reason: "NOT_CREATED" };
    const result = applyCare(this.#life, careType);
    if (!result.accepted) { this.#life = result.state; this.#publishLife(); return result; }
    await this.#db.commitCare(result.state, careType); this.#life = result.state; this.#publishLife(); return result;
  }

  async #tickLife() {
    if (!this.#life) return;
    const next = advanceLife(this.#life); if (next.lastSimulationAt === this.#life.lastSimulationAt) return;
    this.#life = next; await this.#db.put("life", next); this.#publishLife();
  }
  #publishLife() { this.#events.emit(EVENTS.LIFE_UPDATED, structuredClone(this.#life)); }

  async #embedLegacyMemories() {
    for (const memory of this.#brain.getState().memories.filter(item => !item.embedding)) {
      try { const embedding = await this.#semantic.encode(memory.content); await this.#db.put("memories", { ...memory, embedding }); this.#brain.attachEmbedding(memory.id, embedding); }
      catch { break; }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async #createMindling(draft) {
    const identity = await createLocalIdentity(); const createdAt = new Date().toISOString();
    const pathwayRecords = draft.pathways.map((name, index) => ({ id: `initial-${index}`, name, selected: true, createdAt }));
    const mindling = { id: "primary", name: draft.name, stage: "NEURAL_SEED", createdAt, traits: draft.traits, pathways: draft.pathways, pathwayRecords, mindlingId: identity.mindlingId };
    const seed = neuralSeedRecords(); this.#life = createLifeState({ createdAt });
    await this.#db.createMindling({ identity, pathways: pathwayRecords, mindling, neurons: seed.neurons, synapses: seed.synapses, life: this.#life });
    await this.#onboarding.birth(draft.name); const state = this.#brain.create(mindling); this.#renderer.update(state);
    this.#onboarding.hide(); this.#dashboard.show(); this.#publishLife();
  }
  async #beginNewMindling() {
    if (this.#life?.lifeState !== "DECEASED") return;
    await this.#db.archiveDeceasedMindling({ mindling: this.#brain.getState(), life: this.#life, memories: this.#brain.getState().memories });
    location.reload();
  }
  destroy() { clearInterval(this.#lifeTimer); this.#renderer?.destroy(); this.#dashboard?.destroy(); this.#db.close(); }
}
