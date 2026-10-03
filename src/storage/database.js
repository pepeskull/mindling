const DB_NAME = "mindling-db";
const DB_VERSION = 1;
const STORES = ["meta","mindling","identity","neurons","synapses","memories","knowledge","pathways","activities","events","settings","entitlements"];

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
  async put(store, value) { return this.#request(store, "readwrite", target => target.put(value)); }
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
