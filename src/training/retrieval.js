import { sourceStatus } from '../memory/content-integrity.js';
import { graphData } from '../memory/graph-data.js';
import { features, overlap } from '../learning/text.js';

export const RETRIEVAL_VERSION = 2;
export const MAX_CANDIDATES = 24;
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit).trim() : '';
const list = value => Array.isArray(value) ? value : [];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// This pool is only a bounded preselection. The service subsequently performs
// semantic selection, rather than treating lexical overlap as sufficient.
export function trainingContext(problem, state) {
  const graph = graphData(state), byNode = new Map(graph.memories.map(node => [node.id, node]));
  const usable = graph.memories.filter(node => !node.historical && node.recordId.length <= 160 && node.recordId === node.recordId.trim() && typeof node.raw.content === 'string' && node.raw.content.trim());
  const byId = new Map(usable.map(node => [node.recordId, node]));
  const query = features(problem);
  const ranked = usable.map(node => {
    const m = node.raw, body = features(m.content), labels = features([m.concept, m.topic, m.category, m.areaSuggestion].filter(value => typeof value === 'string').join(' '));
    const conflicts = features(list(m.contradictions).map(item => item?.claim || '').join(' '));
    const score = overlap(query.terms, body.terms) * 5 + overlap(query.terms, labels.terms) * 3 + overlap(query.grams, body.grams) + overlap(query.terms, conflicts.terms) * 2;
    return { node, score, reasons: score ? ['Content, concept/topic/category or recorded-conflict overlap'] : ['Diverse fallback candidate; semantic relevance not yet established'] };
  }).sort((a, b) => b.score - a.score || compare(a.node.recordId, b.node.recordId));
  const chosen = new Map();
  const add = (item, reason) => { if (item && chosen.size < MAX_CANDIDATES && !chosen.has(item.node.recordId)) chosen.set(item.node.recordId, { ...item, reasons: reason ? [reason] : item.reasons }); };
  // Leave capacity for confirmed relationships and lower-overlap exceptions.
  ranked.filter(item => item.score > 0).slice(0, 10).forEach(item => add(item));
  const seeds = new Set([...chosen.values()].map(item => item.node.id));
  for (const edge of graph.edges) {
    if (edge.kind === 'hierarchy' || !seeds.has(edge.from) && !seeds.has(edge.to)) continue;
    const node = byNode.get(seeds.has(edge.from) ? edge.to : edge.from);
    if (node && byId.has(node.recordId)) add(ranked.find(item => item.node === node), `Persisted ${edge.kind} link to a preselected memory; link is not proof of truth`);
    if (chosen.size >= 18) break;
  }
  const seenAreas = new Set([...chosen.values()].map(item => item.node.areaId));
  for (const item of ranked) if (!seenAreas.has(item.node.areaId)) { add(item); seenAreas.add(item.node.areaId); if (chosen.size >= 21) break; }
  for (const item of ranked) add(item);
  const selected = new Set([...chosen.values()].map(item => item.node.id));
  const allStored = new Map(graph.memories.map(memory => [memory.recordId, memory]));
  const candidates = [...chosen.values()].map(({ node, score, reasons }) => {
    const m = node.raw;
    const storedConflicts = list(m.contradictions).filter(item => typeof item?.claim === 'string' && item.claim.trim());
    const linkMap = new Map();
    const addLink = (id, kind) => {
      if (typeof id !== 'string' || !id || id.length > 160 || id !== id.trim() || id === node.recordId) return;
      const target = allStored.get(id);
      const availability = !target ? 'missing' : target.historical ? 'historical' : byId.has(id) ? 'available' : 'unusable';
      linkMap.set(`${kind}:${id}`, { id, kind, availability, inContext: availability === 'available' && selected.has(target.id) });
    };
    for (const edge of graph.edges) if (edge.kind !== 'hierarchy' && (edge.from === node.id || edge.to === node.id)) addLink(byNode.get(edge.from === node.id ? edge.to : edge.from)?.recordId, edge.kind);
    // graphData safely omits dangling references; expose their saved IDs here
    // without inventing target content or considering them established premises.
    for (const [field, kind] of [['relatedMemoryIds','association'],['coSubmittedMemoryIds','co-submitted'],['componentMemoryIds','part-of'],['supersededByIds','history']]) for (const id of list(m[field])) addLink(id, kind);
    if (m.parentMemoryId) addLink(m.parentMemoryId, 'part-of');
    if (m.supersededBy) addLink(m.supersededBy, 'history');
    const allLinks = [...linkMap.values()].sort((a, b) => Number(b.inContext) - Number(a.inContext) || compare(a.id + a.kind, b.id + b.kind));
    const links = allLinks.slice(0, 12);
    const content = clean(m.content, 900);
    return { id: node.recordId, content, complete: m.content.trim() === content,
      integrity: { sourceStatus: sourceStatus(m), sourceLength: m.content.trim().length, excerptLength: content.length, excerptTruncated: m.content.trim() !== content },
      concept: clean(m.concept, 100), topic: clean(m.topic, 100), category: clean(m.category || m.areaSuggestion, 80),
      kind: clean(m.intelligence?.kind || m.kind || 'claim', 40), certainty: clean(m.intelligence?.certainty || 'Not recorded', 40),
      verification: clean(m.intelligence?.verification || m.analysis?.verification || m.native?.verification || m.verification || 'unverified-player-claim', 80),
      confidence: Number.isFinite(m.analysis?.confidence) && m.analysis.confidence >= 0 && m.analysis.confidence <= 1 ? m.analysis.confidence : null,
      contradictions: [...new Set(storedConflicts.slice(-2).map(item => clean(item.claim, 300)))],
      conflictsComplete: storedConflicts.length <= 2 && storedConflicts.every(item => item.claim.trim().length <= 300), omittedLinks: Math.max(0, allLinks.length - links.length),
      links, ranking: { score: Math.round(score * 1000) / 1000, reasons } };
  });
  const context = { version: RETRIEVAL_VERSION, problem: problem.trim(), candidates, totalCurrent: usable.length };
  // Bound actual UTF-8 request size too, including long IDs and non-ASCII text.
  while (candidates.length > 1 && new TextEncoder().encode(JSON.stringify(context)).length > 56000) candidates.pop();
  const included = new Set(candidates.map(memory => memory.id));
  for (const memory of candidates) for (const link of memory.links) link.inContext = link.availability === 'available' && included.has(link.id);
  return context;
}

export function assertTrainingContext(context, mind) {
  if (JSON.stringify(trainingContext(context.problem, mind)) !== JSON.stringify(context)) throw Error('Your stored knowledge changed. Run the evaluation again with the current memories.');
}
