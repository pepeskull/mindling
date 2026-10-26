export function canonicalSelectionText(state, selection) {
  if(!selection)return 'Bright cores and connections identify the saved canonical network. Select a core to inspect it.';
  if(selection.type==='synapse'){
    const edge=state?.synapses?.find(item=>item.id===selection.id);
    return edge?`Canonical synapse ${edge.id} · ${edge.from} → ${edge.to} · ${Math.round((edge.strength??0)*100)}% saved strength · ${edge.activations??0} activations`:'Select a saved neuron or synapse.';
  }
  const node=state?.nodes?.find(item=>item.id===selection.id);
  if(!node)return 'Select a saved neuron or synapse.';
  const connections=state.synapses.filter(edge=>edge.from===node.id||edge.to===node.id).length;
  const memories=(state.memories||[]).filter(memory=>memory.neuronIds?.includes(node.id)).length;
  return `Canonical neuron ${node.id} · ${connections} saved connections · ${memories} associated memories`;
}
