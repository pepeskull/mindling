import { graphData } from '../memory/graph-data.js';
import { STAGES } from '../preview/evolution-model.js';
import { RULES } from '../preview/sandbox/engine.js';

const list = value => Array.isArray(value) ? value : [];
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const text = value => typeof value === 'string' ? value : '';
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const unique = records => [...new Map(list(records).filter(item => item && typeof item.id === 'string' && item.id).map(item => [item.id, item])).values()];

// Presentation only. No database access, generated brain geometry or evaluation.
export function developmentData(state = {}, life = null) {
  const nodes = unique(state.nodes);
  const ids = new Set(nodes.map(node => node.id));
  const edges = unique(state.synapses);
  const memories = graphData(state);
  const stageNumber = Number.isInteger(state.stage) ? state.stage : state.stage === 'NEURAL_SEED' ? 1 : life?.stage;
  const stage = STAGES.find(item => item.number === stageNumber);
  const simulatedClock = state.developmentClock === 'simulated';
  const eventTime = event => ({ recordedAt: timestamp(event.recordedAt), simulated: simulatedClock && timestamp(event.recordedAt) === null });
  const history = list(state.history).filter(event => event && timestamp(event.at) !== null)
    .map(event => ({ at: timestamp(event.at), ...eventTime(event), xp: number(event.xp), kind: text(event.kind), concept: text(event.concept) }))
    .sort((a, b) => a.at - b.at);
  const stageHistory = list(state.stageHistory).filter(event => event && timestamp(event.leftAt) !== null)
    .map(event => ({ at: timestamp(event.leftAt), ...eventTime(event), title: `${STAGES.find(item => item.number === event.stage)?.name || 'Previous stage'} completed`, detail: number(event.xp) === null ? '' : `${event.xp} recorded stage XP` }));
  const events = [...history.map(event => ({ at: event.at, recordedAt: event.recordedAt, simulated: event.simulated, title: event.kind === 'reinforcement' ? 'Memory reinforced' : event.kind === 'correction' ? 'Memory updated' : event.kind === 'decision' ? 'Learning response recorded' : 'Learning recorded', detail: event.concept || (event.kind === 'decision' ? 'A learning response was saved; this does not imply new knowledge.' : 'Saved learning event'), xp: event.xp })), ...stageHistory]
    .sort((a, b) => b.at - a.at).slice(0, 8);
  const plotted = nodes.filter(node => Array.isArray(node.position) && node.position.length === 3 && node.position.every(Number.isFinite))
    .map(node => ({ id: node.id, position: [...node.position], size: number(node.size) ?? 1 }));
  const plottedIds = new Set(plotted.map(node => node.id));
  return {
    id: text(state.mindlingId || state.id), name: text(state.name) || 'Your Mindling',
    stage: stage?.name || 'Stage unavailable', stageNumber: stage?.number ?? null,
    deceased: (state.life?.lifeState || life?.lifeState) === 'DECEASED',
    nodes: plotted, edges: edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && plottedIds.has(edge.from) && plottedIds.has(edge.to)).map(edge => ({ id: edge.id, from: edge.from, to: edge.to })),
    neuronCount: nodes.length, synapseCount: edges.length,
    unplottedNodes: nodes.length - plotted.length,
    unplottedEdges: edges.length - edges.filter(edge => plottedIds.has(edge.from) && plottedIds.has(edge.to)).length,
    memoryCount: memories.stats.canonical, currentMemories: memories.stats.current,
    areas: memories.coverage.map(area => ({ label: area.label, count: area.count })),
    areaCount: memories.areas.length,
    stageXP: number(state.stageXP), lifetimeXP: number(state.lifetimeXP),
    targetXP: stage && stage.number < 7 ? RULES[stage.number - 1].xp : null,
    milestones: Array.isArray(state.milestones) ? state.milestones.length : null,
    pathways: [...new Set(list(state.pathways).filter(value => typeof value === 'string' && value.trim()))],
    events,
    enteredAt: timestamp(state.enteredAt), simulatedClock,
    // Knowledge, progression and demonstrated ability intentionally stay separate.
    ability: { available: false }
  };
}
