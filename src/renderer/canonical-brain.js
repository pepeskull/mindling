// Read-only rendering projection. Never generates nodes, edges or positions.
export function canonicalBrain(state = {}) {
  const unique = values => [...new Map((Array.isArray(values) ? values : []).filter(item => item && typeof item.id === 'string' && item.id).map(item => [item.id, item])).values()];
  const savedNodes = unique(state.nodes), savedEdges = unique(state.synapses);
  const nodes = savedNodes.filter(node => Array.isArray(node.position) && node.position.length === 3 && node.position.every(Number.isFinite))
    .map(node => ({ id: node.id, position: [...node.position], size: Number.isFinite(node.size) && node.size > 0 ? node.size : 1 }));
  const ids = new Set(nodes.map(node => node.id));
  const synapses = savedEdges.filter(edge => ids.has(edge.from) && ids.has(edge.to)).map(edge => ({ id: edge.id, from: edge.from, to: edge.to, strength: Number.isFinite(edge.strength) ? edge.strength : .2, activations: Number.isFinite(edge.activations) ? edge.activations : 0 }));
  return { nodes, synapses, neuronCount: savedNodes.length, synapseCount: savedEdges.length, unplottedNodes: savedNodes.length - nodes.length, unplottedEdges: savedEdges.length - synapses.length };
}
