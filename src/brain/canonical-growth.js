export const NEURAL_CAPACITY=Object.freeze([5,12,20,30,42,54,64]);
const CADENCE=[0,1,2,3,4,5,6];
function positionFor(parent,index,nodes){
  for(let attempt=0;attempt<200;attempt++){
    const angle=(index+attempt)*2.399963229728653,r=.55+.07*Math.floor(attempt/12);
    const p=[parent.position[0]+Math.cos(angle)*r,parent.position[1]+Math.sin(angle)*r,parent.position[2]+Math.sin(angle*.73)*r*.65];
    if(nodes.every(node=>Math.hypot(...p.map((v,i)=>v-node.position[i]))>.22))return p;
  }
  throw Error('Canonical growth placement could not be resolved.');
}
export function repairCanonicalPositions(mind,at){
  if(mind.neuralPositionPolicy===1)return;
  const repaired=[];
  for(const node of mind.nodes){
    if(!/^learned-/.test(node.id)||!Array.isArray(node.position)||!node.position.every(v=>v===0))continue;
    const edge=mind.synapses.find(edge=>edge.to===node.id&&edge.from!==node.id),parent=mind.nodes.find(n=>n.id===edge?.from);
    if(!parent)continue;
    const before=[...node.position];node.position=positionFor(parent,mind.nodes.indexOf(node),mind.nodes.filter(n=>n!==node));
    repaired.push({id:node.id,parentId:parent.id,before,after:[...node.position]});
  }
  mind.neuralPositionPolicy=1;if(repaired.length)mind.neuralPositionRepairs=[...(mind.neuralPositionRepairs||[]),{policy:1,at,repaired}];
}
// Called once per genuinely new formation (one step for a service batch).
export function growCanonical(mind,eventId){
  if(typeof eventId!=='string'||!eventId)throw Error('A real learning event is required for neural growth.');
  const growth=mind.neuralGrowth||(mind.neuralGrowth={version:1,stage:mind.stage,formations:0,events:[]});
  const foundation=mind.synapses[mind.memories.length%4];
  const result={neuronIds:['origin',foundation.to],synapseIds:[foundation.id]};
  if(growth.events.includes(eventId))return result;
  growth.events.push(eventId);
  foundation.strength=Math.min(1,foundation.strength+.05);foundation.activations++;
  if(growth.stage!==mind.stage){growth.stage=mind.stage;growth.formations=0;}
  growth.formations++;
  if(mind.stage===1)return result;
  if((growth.formations-1)%CADENCE[mind.stage-1]||mind.nodes.length>=NEURAL_CAPACITY[mind.stage-1])return result;
  const parent=mind.nodes.find(node=>node.id===foundation.to)||mind.nodes[0];
  let index=mind.nodes.length;while(mind.nodes.some(node=>node.id===`learned-${index}`))index++;
  const id=`learned-${index}`,position=positionFor(parent,index,mind.nodes);
  mind.nodes.push({id,position,size:.6,parentId:parent.id,growthEventId:eventId});
  const neighbors=[parent,...mind.nodes.filter(n=>n.id!==id&&n.id!==parent.id).sort((a,b)=>Math.hypot(...a.position.map((v,i)=>v-position[i]))-Math.hypot(...b.position.map((v,i)=>v-position[i]))).slice(0,mind.stage>=4?2:1)];
  for(const from of neighbors){const edge={id:`${from.id}-${id}`,from:from.id,to:id,strength:.28,activations:1,growthEventId:eventId};mind.synapses.push(edge);result.synapseIds.push(edge.id);}
  result.neuronIds.push(id);return result;
}
