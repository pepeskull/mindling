import { EventBus } from "./events.js";
import { BrainEngine } from "../brain/brain-engine.js";
import { BrainRenderer } from "../renderer/brain-renderer.js";
import { MindlingDatabase } from "../storage/database.js";
import { Dashboard } from "../ui/dashboard.js";

export class MindlingApp {
  #events=new EventBus(); #brain=new BrainEngine(this.#events); #db=new MindlingDatabase(); #dashboard; #renderer;
  async start(){
    this.#dashboard=new Dashboard(this.#events);
    const state=this.#brain.initialize();
    this.#renderer=new BrainRenderer(document.querySelector("#scene"));
    const rendering=this.#renderer.initialize(state);
    this.#db.open().then(()=>this.#dashboard.setStorageStatus(true)).catch(()=>this.#dashboard.setStorageStatus(false));
    await rendering;
  }
  destroy(){this.#renderer?.destroy();this.#dashboard?.destroy();this.#db.close();}
}
