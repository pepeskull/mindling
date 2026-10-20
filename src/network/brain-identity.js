import { generateStage, BUDGET } from '../preview/evolution-model.js';
import { seededValue } from '../renderer/neural-morphology.js';
export function brainSeed(id){let value=2166136261;for(const char of id){value^=char.codePointAt(0);value=Math.imul(value,16777619);}return value>>>0;}
// A fixed LOD is used in every role. Centering never swaps topology or adds nodes.
export function createBrainIdentity(id){
  const seed=brainSeed(id),shape=generateStage(7,seed),indices=Array.from({length:BUDGET.remoteNeurons},(_,i)=>Math.floor(i*shape.nodes.length/BUDGET.remoteNeurons));
  const lookup=new Map(indices.map((source,i)=>[source,i])),nodes=indices.map(i=>shape.nodes[i]);
  const positions=new Float32Array(nodes.flatMap(n=>n.position)),radii=new Float32Array(nodes.map(n=>n.radius)),regions=new Uint8Array(nodes.map(n=>n.region));
  const edges=shape.edges.filter(([a,b])=>lookup.has(a)&&lookup.has(b)).map(([a,b])=>[lookup.get(a),lookup.get(b),.13+(a%4)*.055]);
  // Every Agent Mind keeps all 240 somas. Fibers use a fixed LOD so three
  // connected brains have stable CPU, GPU and memory costs in both renderers.
  const lines=[],segment=(a,b)=>{if(lines.length<BUDGET.remoteSegments*6)lines.push(...a,...b);};
  for(const contour of shape.contours)for(let i=1;i<contour.length;i++)segment(contour[i-1],contour[i]);
  const point=(a,b,t,bend)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t+4*t*(1-t)*bend,a[2]+(b[2]-a[2])*t+2*t*(1-t)*bend];
  for(const [a,b,bend] of edges)for(let j=0;j<BUDGET.curveSteps;j++)segment(point(nodes[a].position,nodes[b].position,j/BUDGET.curveSteps,bend),point(nodes[a].position,nodes[b].position,(j+1)/BUDGET.curveSteps,bend));
  nodes.forEach((node,i)=>{const [x,y,z]=node.position,length=node.radius*4.19;for(let branch=0;branch<3;branch++){
    const angle=branch/3*Math.PI*2+seededValue(indices[i]*31+branch+seed);segment([x,y,z],[x+Math.cos(angle)*length,y+Math.sin(angle)*length,z+length*.2]);
  }});
  return Object.freeze({id,seed,positions,radii,regions,edges,lines:new Float32Array(lines),nodeIds:indices.map(i=>`${id}:neuron:${i}`)});
}
export class BrainIdentities {
  cache=new Map();
  get(id){if(!this.cache.has(id)){if(this.cache.size>=12)throw Error('Public brain rendering budget exceeded');this.cache.set(id,createBrainIdentity(id));}return this.cache.get(id);}
  clear(){this.cache.clear();}
}
