import { energyCapacityForStage } from '../economy/energy.js';
import { canonicalBrain } from '../renderer/canonical-brain.js';
import { graphData } from '../memory/graph-data.js';
import { STAGES } from '../preview/evolution-model.js';
import { RULES } from '../preview/sandbox/engine.js';

const list = value => Array.isArray(value) ? value : [];
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const text = value => typeof value === 'string' ? value : '';
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// Presentation only. No database access, generated brain geometry or evaluation.
export function developmentData(state = {}, life = null) {
  const brain = canonicalBrain(state);
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
  return {
    id: text(state.mindlingId || state.id), name: text(state.name) || 'Your Mindling',
    stage: stage?.name || 'Stage unavailable', stageNumber: stage?.number ?? null,
    deceased: (state.life?.lifeState || life?.lifeState) === 'DECEASED',
    nodes: brain.nodes, edges: brain.synapses,
    neuronCount: brain.neuronCount, synapseCount: brain.synapseCount,
    unplottedNodes: brain.unplottedNodes, unplottedEdges: brain.unplottedEdges,
    memoryCount: memories.stats.canonical, currentMemories: memories.stats.current,
    areas: memories.coverage.map(area => ({ label: area.label, count: area.count })),
    areaCount: memories.areas.length,
    energyText:state.energy?`${state.energy.remaining-(state.energy.bonus||0)} / ${energyCapacityForStage(stageNumber)}${state.energy.bonus?` + ${state.energy.bonus} bonus`:''}`:'—',
    stageXP: number(state.stageXP), lifetimeXP: number(state.lifetimeXP),
    targetXP: stage && stage.number < 7 ? RULES[stage.number - 1].xp : null,
    milestones: Array.isArray(state.milestones) ? state.milestones.length : null,
    pathways: [...new Set(list(state.pathways).filter(value => typeof value === 'string' && value.trim()))],
    events,
    enteredAt: timestamp(state.enteredAt), simulatedClock,
    // Evaluations are loaded separately by TrainingPanel, never inferred here.
  };
}
