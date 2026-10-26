import { generateStage } from '../preview/evolution-model.js';
import { canonicalBrain } from './canonical-brain.js';

const VISUAL_MODELS = new Map();
export function visualMorphologyFor(stage) {
  if (!VISUAL_MODELS.has(stage)) VISUAL_MODELS.set(stage, generateStage(stage));
  return VISUAL_MODELS.get(stage);
}
const FOUNDATION = ['origin','upper','right','lower','left'];
// Fixed identity slots, never an active-set rank or modulo mapping. Adding learned-N
// cannot remap an existing ID. Imported unknown IDs retain a separate saved-position
// projection rather than impersonating a decorative neuron.
export function canonicalSlot(id, visualCount) {
  const seed = FOUNDATION.indexOf(id);
  const index = seed >= 0 ? seed : /^learned-(\d+)$/.test(id) ? Number(id.slice(8)) : -1;
  return Number.isSafeInteger(index) && index >= 0 && index < visualCount ? index : null;
}
export function stagePresentation(state = {}) {
  const stage = Number.isInteger(state.stage) && state.stage >= 1 && state.stage <= 7 ? state.stage : 1;
  const visualMorphology = visualMorphologyFor(stage);
  const canonicalNetwork = canonicalBrain(state);
  const claimed = new Set();
  const projection = canonicalNetwork.nodes.map(node => {
    let visualIndex = canonicalSlot(node.id, visualMorphology.nodes.length);
    if (claimed.has(visualIndex)) visualIndex = null;
    if (visualIndex !== null) claimed.add(visualIndex);
    return { id:node.id, visualIndex, position:visualIndex === null ? node.position.map(v=>Math.tanh(v)*.8) : [...visualMorphology.nodes[visualIndex].position] };
  });
  return { stage, visualMorphology, canonicalNetwork, projection,
    visualNeuronCount:visualMorphology.nodes.length, visualSynapseCount:visualMorphology.edges.length,
    canonicalNeuronCount:canonicalNetwork.neuronCount, canonicalSynapseCount:canonicalNetwork.synapseCount };
}
