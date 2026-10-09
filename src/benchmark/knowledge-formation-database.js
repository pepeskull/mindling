const DB_NAME = "mindling-knowledge-benchmark"; const DB_VERSION = 1;

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
});
const requestResult = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export class KnowledgeFormationBenchmarkDatabase {
  #db;
  async open() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("runs", { keyPath: "runId" });
      db.createObjectStore("memories", { keyPath: ["runId", "memoryId"] });
      db.createObjectStore("operations", { keyPath: ["runId", "caseId"] });
      db.createObjectStore("datasets", { keyPath: "datasetId" });
      db.createObjectStore("importedCases", { keyPath: ["datasetId", "position"] });
      db.createObjectStore("reports", { keyPath: "runId" });
    };
    this.#db = await requestResult(request); return this;
  }
  async createRun(run) { const transaction = this.#db.transaction("runs", "readwrite"); transaction.objectStore("runs").put(structuredClone(run)); await transactionDone(transaction); }
  async getRun(runId) { return requestResult(this.#db.transaction("runs").objectStore("runs").get(runId)); }
  async commitBatch({ runId, memories, operations, checkpoint }) {
    const transaction = this.#db.transaction(["runs", "memories", "operations"], "readwrite");
    const memoryStore = transaction.objectStore("memories"); const operationStore = transaction.objectStore("operations");
    for (const memory of memories) memoryStore.put({ ...memory, memoryId: memory.id });
    for (const operation of operations) operationStore.put(operation);
    transaction.objectStore("runs").put({ runId, checkpoint, status: checkpoint.nextPosition >= checkpoint.targetSize ? "COMPLETE" : "RUNNING" });
    await transactionDone(transaction);
  }
  async saveReport(report) { const transaction = this.#db.transaction("reports", "readwrite"); transaction.objectStore("reports").put(structuredClone(report)); await transactionDone(transaction); }
  async saveDataset(metadata) { const transaction = this.#db.transaction("datasets", "readwrite"); transaction.objectStore("datasets").put(structuredClone(metadata)); await transactionDone(transaction); }
  async putImportedCases(datasetId, records) {
    const transaction = this.#db.transaction("importedCases", "readwrite"); const store = transaction.objectStore("importedCases");
    for (const record of records) store.put({ datasetId, position: record.sequence, record }); await transactionDone(transaction);
  }
  async getImportedCase(datasetId, position) {
    const value = await requestResult(this.#db.transaction("importedCases").objectStore("importedCases").get([datasetId, position]));
    return value?.record || null;
  }
  async deleteAllBenchmarkData() { this.#db?.close(); this.#db = null; await requestResult(indexedDB.deleteDatabase(DB_NAME)); }
  close() { this.#db?.close(); this.#db = null; }
}

export const knowledgeBenchmarkDatabaseConfig = Object.freeze({ name: DB_NAME, version: DB_VERSION,
  stores: Object.freeze(["runs", "memories", "operations", "datasets", "importedCases", "reports"]) });
