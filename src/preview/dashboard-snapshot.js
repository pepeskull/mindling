import { databaseConfig } from '../storage/database.js';

// Never call the production database opener: it can create/upgrade schema.
// Without safe enumeration, report unavailable rather than risk creating a DB.
export async function readDashboardSnapshot(storage = globalThis.indexedDB) {
  if (!storage?.databases) return { status: 'unavailable' };
  let db;
  try {
    const databases = await storage.databases();
    if (!databases.some(item => item.name === databaseConfig.name)) return { status: 'empty' };
    db = await new Promise((resolve, reject) => {
      const request = storage.open(databaseConfig.name);
      let abandoned = false;
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Database disappeared')); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { abandoned = true; reject(new Error('Database blocked')); };
      request.onsuccess = () => { if (abandoned) request.result.close(); else resolve(request.result); };
    });
    db.onversionchange = () => db.close();
    const names = ['mindling', 'neurons', 'synapses', 'memories', 'pathways', 'life'].filter(name => db.objectStoreNames.contains(name));
    if (!names.includes('mindling')) return { status: 'unavailable' };
    const records = await new Promise((resolve, reject) => {
      const values = {}, transaction = db.transaction(names, 'readonly');
      for (const name of names) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => { values[name] = request.result; };
      }
      transaction.oncomplete = () => resolve(values);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Snapshot unavailable'));
    });
    const mindling = records.mindling.find(item => item.id === 'primary');
    if (!mindling) return { status: 'empty' };
    return { status: 'saved', state: { ...mindling, nodes: records.neurons || [], synapses: records.synapses || [], memories: records.memories || [], pathwayRecords: records.pathways || [] }, life: records.life?.find(item => item.id === 'primary') || null };
  } catch { return { status: 'unavailable' }; }
  finally { db?.close(); }
}
