const DB_NAME = "mindling-db";
const DB_VERSION = 2;
const STORES = ["meta","mindling","identity","neurons","synapses","memories","knowledge","pathways","activities","events","settings","entitlements","life","energyJournal","memorials"];

export class MindlingDatabase {
  #db = null;
  async open() {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable");
    this.#db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
        request.transaction.objectStore("meta").put({ id: "schema", version: DB_VERSION, application: "play-mindling" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage"));
      request.onblocked = () => reject(new Error("Database upgrade was blocked"));
    });
    this.#db.onversionchange = () => this.close();
    return this;
  }
  async get(store, id) { return this.#request(store, "readonly", target => target.get(id)); }
  async getAll(store) { return this.#request(store, "readonly", target => target.getAll()); }
  async put(store, value) { return this.#request(store, "readwrite", target => target.put(value)); }
  async createMindling({ identity, pathways, mindling, neurons, synapses, life }) {
    if (!this.#db) throw new Error("Database is not open");
    const stores = ["identity", "pathways", "neurons", "synapses", "mindling", "life"];
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(stores, "readwrite");
      const putAll = (name, values) => values.forEach(value => transaction.objectStore(name).put(value));
      transaction.objectStore("identity").put(identity);
      putAll("pathways", pathways);
      putAll("neurons", neurons);
      putAll("synapses", synapses);
      // This authoritative record is queued last; IndexedDB commits the transaction atomically.
      transaction.objectStore("mindling").put(mindling);
      transaction.objectStore("life").put(life);
      transaction.oncomplete = () => resolve(mindling);
      transaction.onerror = () => reject(transaction.error || new Error("Creation could not be saved"));
      transaction.onabort = () => reject(transaction.error || new Error("Creation was cancelled"));
    });
  }
  async commitActivity({ learning = null, life, journal }) {
    if (!this.#db) throw new Error("Database is not open");
    const stores = ["life", "energyJournal", ...(learning ? ["memories", "synapses"] : [])];
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(stores, "readwrite");
      transaction.objectStore("life").put(life);
      transaction.objectStore("energyJournal").put(journal);
      if (learning) {
        transaction.objectStore("memories").put(learning.memory);
        (learning.relatedMemories || []).forEach(memory => transaction.objectStore("memories").put(memory));
        transaction.objectStore("synapses").put(learning.synapse);
      }
      transaction.oncomplete = () => resolve({ life, journal, learning });
      transaction.onerror = () => reject(transaction.error || new Error("Activity could not be saved"));
      transaction.onabort = () => reject(transaction.error || new Error("Activity was cancelled"));
    });
  }
  async commitCare(life, careType) {
    if (!this.#db) throw new Error("Database is not open");
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(["life", "events"], "readwrite");
      transaction.objectStore("life").put(life);
      transaction.objectStore("events").put({ id: crypto.randomUUID(), type: "BASIC_CARE", careType, at: life.lastSimulationAt });
      transaction.oncomplete = () => resolve(life);
      transaction.onerror = () => reject(transaction.error || new Error("Care could not be saved"));
    });
  }
  async archiveDeceasedMindling({ mindling, life, memories }) {
    if (!this.#db) throw new Error("Database is not open");
    if (life.lifeState !== "DECEASED") throw new Error("Only a deceased Mindling can be archived");
    const activeStores = STORES.filter(name => !["meta", "memorials"].includes(name));
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction([...activeStores, "memorials"], "readwrite");
      transaction.objectStore("memorials").put({ id: `${mindling.mindlingId}-${life.deathTimestamp}`, mindling: structuredClone(mindling), life: structuredClone(life), memories: structuredClone(memories), archivedAt: new Date().toISOString() });
      activeStores.forEach(name => transaction.objectStore(name).clear());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Memorial could not be preserved"));
    });
  }
  async commitLearning({ memory, relatedMemories = [], synapse }) {
    if (!this.#db) throw new Error("Database is not open");
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(["memories", "synapses"], "readwrite");
      transaction.objectStore("memories").put(memory);
      relatedMemories.forEach(related => transaction.objectStore("memories").put(related));
      transaction.objectStore("synapses").put(synapse);
      transaction.oncomplete = () => resolve({ memory, relatedMemories, synapse });
      transaction.onerror = () => reject(transaction.error || new Error("Learning could not be saved"));
      transaction.onabort = () => reject(transaction.error || new Error("Learning was cancelled"));
    });
  }
  #request(store, mode, operation) {
    if (!this.#db) return Promise.reject(new Error("Database is not open"));
    if (!STORES.includes(store)) return Promise.reject(new Error(`Unknown store: ${store}`));
    return new Promise((resolve, reject) => {
      const request = operation(this.#db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  close() { this.#db?.close(); this.#db = null; }
}

export const databaseConfig = Object.freeze({ name: DB_NAME, version: DB_VERSION, stores: [...STORES] });
