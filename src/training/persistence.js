import { validateContext, validateResult, OUTCOMES } from './contract.js';
import { assertTrainingContext } from './retrieval.js';

const LIMIT = 20;
const key = mindId => `cognitive-training:${mindId}`;
const empty = mindId => ({ id: key(mindId), type: 'COGNITIVE_TRAINING', mindlingId: mindId, records: [], totals: { completed: 0, ...Object.fromEntries(OUTCOMES.map(outcome => [outcome, 0])) } });
const checkId = id => { if (typeof id !== 'string' || !id || id.length > 160) throw Error('Mindling identity is unavailable.'); };

function validateRecord(record, mindId) {
  if (!record || Object.keys(record).length !== 6 || record.mindlingId !== mindId || !/^[a-f0-9]{64}$/.test(record.id) || !Number.isFinite(record.at) || record.at < 0 || !Number.isFinite(new Date(record.at).getTime())) throw Error('Evaluation record is invalid.');
  validateContext(record.context); validateResult(record.result, record.context);
  if (record.problem !== record.context.problem || new TextEncoder().encode(JSON.stringify(record)).length > 200000) throw Error('Evaluation record is invalid.');
}
function validateHistory(history, mindId) {
  if (history.id !== key(mindId) || history.mindlingId !== mindId || history.type !== 'COGNITIVE_TRAINING' || !Array.isArray(history.records) || history.records.length > LIMIT || !history.totals || !Number.isSafeInteger(history.totals.completed) || history.totals.completed < history.records.length) throw Error('Training history is invalid.');
  for (const outcome of OUTCOMES) if (!Number.isSafeInteger(history.totals[outcome]) || history.totals[outcome] < 0) throw Error('Training history is invalid.');
  if (OUTCOMES.reduce((sum, outcome) => sum + history.totals[outcome], 0) !== history.totals.completed) throw Error('Training history is invalid.');
  for (const record of history.records) validateRecord(record, mindId);
  return history;
}

export function trainingSource(db, preview, mindId) {
  checkId(mindId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(preview ? 'sandbox' : 'gameplay', 'readonly');
    const request = tx.objectStore(preview ? 'sandbox' : 'gameplay').get(preview ? 'state' : 'primary');
    tx.oncomplete = () => {
      const mind = (preview ? request.result : request.result?.state)?.mind;
      if (!mind || mind.id !== mindId) reject(Error('Mindling identity changed. Reopen Development and try again.'));
      else resolve(mind);
    };
    tx.onerror = tx.onabort = () => reject(Error('Stored knowledge could not be read.'));
  });
}

export function loadTraining(db, preview, mindId) {
  checkId(mindId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(preview ? 'sandbox' : 'events', 'readonly');
    const request = tx.objectStore(preview ? 'sandbox' : 'events').get(key(mindId));
    tx.oncomplete = () => { try { resolve(validateHistory(request.result || empty(mindId), mindId)); } catch { reject(Error('Training history could not be read safely. Existing data was preserved.')); } };
    tx.onerror = tx.onabort = () => reject(Error('Training history could not be loaded.'));
  });
}

export function saveTraining(db, preview, record) {
  checkId(record.mindlingId); validateRecord(record, record.mindlingId);
  return new Promise((resolve, reject) => {
    // Read identity/context and update history in the same transaction. Gameplay
    // is read only: no canonical state, learning history, Energy or XP is written.
    const tx = db.transaction(preview ? ['sandbox'] : ['events', 'gameplay'], 'readwrite');
    const target = tx.objectStore(preview ? 'sandbox' : 'events');
    const stateRequest = tx.objectStore(preview ? 'sandbox' : 'gameplay').get(preview ? 'state' : 'primary');
    const historyRequest = target.get(key(record.mindlingId));
    let pending = 2, result, failure;
    const ready = () => {
      if (--pending) return;
      try {
        const state = preview ? stateRequest.result : stateRequest.result?.state, mind = state?.mind;
        if (!mind || mind.id !== record.mindlingId) throw Error('Mindling identity changed. The evaluation was not saved.');
        assertTrainingContext(record.context, mind);
        const history = validateHistory(historyRequest.result || empty(record.mindlingId), record.mindlingId);
        if (history.records.some(item => item.id === record.id)) { result = history; return; }
        const references = new Set(record.result.reasoning.memoryIds);
        if ([...references].some(id => !mind.memories.some(memory => memory.id === id))) throw Error('A referenced memory is no longer available. Run the evaluation again.');
        result = { ...history, records: [...history.records, structuredClone(record)].slice(-LIMIT), totals: { ...history.totals, completed: history.totals.completed + 1, [record.result.outcome]: history.totals[record.result.outcome] + 1 } };
        if (preview) target.put(result, key(record.mindlingId)); else target.put(result);
      } catch (error) { failure = error; tx.abort(); }
    };
    stateRequest.onsuccess = ready; historyRequest.onsuccess = ready;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(failure || Error('The evaluation could not be saved. No result was recorded.'));
  });
}
