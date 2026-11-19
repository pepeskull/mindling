import { eligibleSemanticMemory, semanticSnapshot } from './model-contract.js';
import { graphData } from '../memory/graph-data.js';

const VERSION = 1;
const stop = new Set('about after also because before being between could during from have into means other should some such than that their these they this those through under using were when where which while with would'.split(' '));
const words = text => [...new Set(text.normalize('NFKC').toLowerCase().match(/[\p{L}]{4,}/gu) || [])].filter(word => !stop.has(word));

// Store contributions by immutable memory identity so unchanged passages aren't
// tokenized again. A transaction backfills at most 32 passages.
export function reconcileAreaProfiles(mind) {
  const previous = mind.semanticProfiles?.version === VERSION ? mind.semanticProfiles : null;
  const graph = graphData(mind);
  const entries = new Map(Object.entries(previous?.entries || {}));
  const used = new Set();
  const pending = [];
  const profiles = {};
  for (const area of graph.areas) {
    profiles[area.id] = { label: area.label, references: area.memoryIds, tags: [] };
  }
  for (const node of graph.memories) {
    const memory = node.raw;
    if (!eligibleSemanticMemory(memory)) continue;
    const snapshot = semanticSnapshot(memory);
    const signature = JSON.stringify([node.areaId, snapshot, memory.topic, memory.concept]);
    used.add(node.recordId);
    if (entries.get(node.recordId)?.signature !== signature) {
      entries.delete(node.recordId);
      pending.push({ node, signature, snapshot });
    }
  }
  for (const id of entries.keys()) if (!used.has(id)) entries.delete(id);
  for (const { node, signature, snapshot } of pending.slice(0, 32)) {
    const metadata = [node.raw.concept, node.raw.topic].filter(value => typeof value === 'string').join(' ');
    entries.set(node.recordId, { signature, area: node.areaId, tags: words(metadata + ' ' + snapshot.text).slice(0, 48) });
  }
  const tags = new Map();
  for (const entry of entries.values()) {
    if (!tags.has(entry.area)) tags.set(entry.area, new Map());
    for (const tag of entry.tags) {
      const counts = tags.get(entry.area);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  for (const [id, profile] of Object.entries(profiles)) {
    profile.references = profile.references.filter(reference => entries.has(reference));
    profile.tags = [...(tags.get(id) || [])].sort(([a, x], [b, y]) => y-x || a.localeCompare(b)).slice(0, 48).map(([tag]) => tag);
  }
  const updated = { version: VERSION, entries: Object.fromEntries(entries), profiles, pending: Math.max(0, pending.length - 32) };
  if (JSON.stringify(updated) !== JSON.stringify(previous && { ...previous, updatedAt: undefined })) {
    mind.semanticProfiles = { ...updated, updatedAt: Date.now() };
  }
}

export function areaProfileCandidates(mind) {
  const profiles = Object.entries(mind.semanticProfiles?.profiles || {});
  const indexed = new Map();
  for (const [id, profile] of profiles) {
    for (const tag of profile.tags) {
      if (!indexed.has(tag)) indexed.set(tag, []);
      indexed.get(tag).push(id);
    }
  }
  const scores = new Map();
  for (const ids of indexed.values()) {
    // Common words do not create a dense comparison graph.
    if (ids.length > 8) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = JSON.stringify([ids[i], ids[j]].sort());
      scores.set(key, (scores.get(key) || 0) + 1);
    }
  }
  return [...scores].filter(([, score]) => score >= 2)
    .sort(([a, x], [b, y]) => y-x || a.localeCompare(b)).map(([key]) => JSON.parse(key));
}
