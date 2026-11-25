import { EVENTS } from './events.js';

// Only committed actions call this helper. Presentation receives saved route
// IDs and an activity kind, never request text, memory passages or credentials.
export function emitBrainActivity(app,identity,category,memoryIds=[]){
  const mind=app.state?.mind;
  if(app.disposed||mind?.id!==identity||mind?.life?.lifeState!=='ALIVE')return;
  const matching=new Set(memoryIds);
  const edges=mind.synapses||[];
  const savedEdges=new Set(edges.map(edge=>edge.id));
  const routes=(mind.memories||[]).filter(memory=>matching.has(memory.id)&&!memory.supersededBy&&memory.intelligence?.current!==false)
    .flatMap(memory=>memory.synapseIds||[]).filter(id=>savedEdges.has(id));
  const synapseIds=[...new Set(routes)].slice(0,2);
  if(category==='talk'&&!synapseIds.length&&edges.length)synapseIds.push(edges[0].id);
  if(synapseIds.length)app.events?.emit(EVENTS.BRAIN_ACTIVITY,{identity,category,synapseIds});
}
