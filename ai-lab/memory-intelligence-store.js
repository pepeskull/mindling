import { createLabState } from './memory-intelligence-engine.js';

const DB_NAME = 'mindling-ai-memory-lab-v1';
const DB_VERSION = 1;
const STORE = 'lab-state';
const KEY = 'singleton';

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});

export class MemoryIntelligenceStore {
  #db = null;
  async open() {
    if (this.#db) return this;
    this.#db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('MEMORY_LAB_DATABASE_BLOCKED'));
    });
    return this;
  }
  async read() {
    await this.open();
    const value = await requestResult(this.#db.transaction(STORE).objectStore(STORE).get(KEY));
    return value ? structuredClone(value) : createLabState();
  }
  async replace(state) {
    await this.open();
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(structuredClone(state), KEY);
      transaction.oncomplete = () => resolve(structuredClone(state));
      transaction.onerror = transaction.onabort = () => reject(transaction.error || Error('MEMORY_LAB_WRITE_FAILED'));
    });
  }
  async update(transform) {
    await this.open();
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(STORE, 'readwrite'); const store = transaction.objectStore(STORE); const request = store.get(KEY); let next;
      request.onsuccess = () => { try { next = transform(request.result ? structuredClone(request.result) : createLabState()); store.put(structuredClone(next), KEY); } catch (error) { transaction.abort(); reject(error); } };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(structuredClone(next));
      transaction.onerror = transaction.onabort = () => reject(transaction.error || Error('MEMORY_LAB_TRANSACTION_FAILED'));
    });
  }
  close() { this.#db?.close(); this.#db = null; }
  async reset() {
    this.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('MEMORY_LAB_RESET_BLOCKED'));
    });
    return createLabState();
  }
}

export const memoryLabDatabaseConfig = Object.freeze({ name: DB_NAME, version: DB_VERSION, store: STORE });
