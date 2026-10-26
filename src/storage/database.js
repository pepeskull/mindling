import { loadTraining, saveTraining, trainingSource } from '../training/persistence.js';
import { energyAt } from '../economy/energy.js';
import { migrateGameplay, dashboardLife } from '../app/gameplay-state.js';

const DB_NAME = "mindling-db";
const DB_VERSION = 3;
const STORES = ["meta","mindling","identity","neurons","synapses","memories","knowledge","pathways","activities","events","settings","entitlements","life","energyJournal","memorials","gameplay"];

export class MindlingDatabase {
  #db = null;
  async open() {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable");
    this.#db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let abandoned = false;
      request.onupgradeneeded = () => {
        if (abandoned) { request.transaction.abort(); return; }
        const db = request.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
        request.transaction.objectStore("meta").put({ id: "schema", version: DB_VERSION, application: "play-mindling" });
      };
      request.onsuccess = () => { if (abandoned) request.result.close(); else resolve(request.result); };
      request.onerror = () => reject(request.error || new Error("Could not open local storage"));
      request.onblocked = () => { abandoned = true; reject(new Error("Close other Mindling tabs to finish the storage upgrade. Your data is preserved.")); };
    });
    this.#db.onversionchange = () => this.close();
    return this;
  }
  trainingSource(mindId) { return trainingSource(this.#db, false, mindId); }
  trainingHistory(mindId) { if (!this.#db) return Promise.reject(Error('Local storage is unavailable.')); return loadTraining(this.#db, false, mindId); }
  saveTraining(record) { if (!this.#db) return Promise.reject(Error('Local storage is unavailable.')); return saveTraining(this.#db, false, record); }
  async get(store, id) { return this.#request(store, "readonly", target => target.get(id)); }
  async getAll(store) { return this.#request(store, "readonly", target => target.getAll()); }
  async put(store, value) { return this.#request(store, "readwrite", target => target.put(value)); }
  async changeGameplay(reducer, { identity = null, journal = null } = {}) {
    if (!this.#db) throw Error('Database is not open');
    const names = ['gameplay', 'mindling', 'life', 'identity', 'neurons', 'synapses', 'memories', 'pathways', 'energyJournal', 'memorials', 'settings'];
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(names, 'readwrite'), data = {}; let next, error, pending = names.length;
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          data[name] = request.result;
          if (--pending) return;
          try {
            const saved = data.gameplay.find(item => item.id === 'primary');
            if (saved && saved.state?.version !== 1) throw Error('Unsupported gameplay data; existing records have been preserved.');
            const initial = saved ? saved.state : migrateGameplay(data, Date.now());
            next = reducer(structuredClone(initial));
            next.revision = (initial.revision || 0) + 1;
            if (initial.mind && next.mind?.id !== initial.mind.id && initial.mind.life.lifeState !== 'DECEASED') throw Error('A living identity cannot be replaced.');
            if (next.mind && next.tombstones.some(item => item.id === next.mind.id) && next.mind.life.lifeState !== 'DECEASED') throw Error('A deceased identity cannot be revived.');
            if (!saved && data.life.length) tx.objectStore('settings').put({ id: `life-before-v2:${initial.mind?.id || 'unassigned'}`, records: structuredClone(data.life) });
            tx.objectStore('gameplay').put({ id: 'primary', state: next });
            const archive = mind => tx.objectStore('memorials').put({ id: `life-v2:${mind.id}`, mindling: structuredClone(mind), life: dashboardLife({ mind }), memories: structuredClone(mind.memories), archivedAt: new Date().toISOString() });
            if (initial.mind && next.mind?.id !== initial.mind.id) archive(initial.mind);
            if (next.mind) {
              const m = next.mind;
              tx.objectStore('mindling').put({ ...dashboardStateRecord(m), id: 'primary' });
              tx.objectStore('life').put(dashboardLife(next));
              for (const [name, values] of [['neurons', m.nodes], ['synapses', m.synapses], ['memories', m.memories]]) for (const value of values) tx.objectStore(name).put(value);
              if (m.life.lifeState === 'DECEASED') archive(m);
            }
            if (identity) {
              if (data.memorials.some(item => item.mindling?.mindlingId === identity.mindlingId || item.mindling?.id === identity.mindlingId)) throw Error('An archived identity cannot be reused.');
              if (!data.identity.some(item => item.id === 'local-identity')) tx.objectStore('identity').put(identity);
              tx.objectStore('identity').put({ ...identity, id: `mindling:${identity.mindlingId}` });
            }
            if (journal && next.mind) {
              if (data.energyJournal.some(item => item.id === journal.id)) throw Error('Activity already processed');
              const cost = energyAt(initial.mind.energy,next.now).remaining - next.mind.energy.remaining;
              tx.objectStore('energyJournal').put({ ...journal, mindlingId: next.mind.id, at: new Date(next.now).toISOString(), energyCost: cost, balanceAfter: next.mind.energy.remaining });
            }
          } catch (caught) { error = caught; tx.abort(); }
        };
      }
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(error || tx.error || Error('Gameplay could not be saved'));
    });
  }
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

function dashboardStateRecord(mind) {
  return { ...mind, mindlingId: mind.id, createdAt: new Date(mind.createdAt).toISOString() };
}
