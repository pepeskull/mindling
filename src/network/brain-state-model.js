import {canonicalBrain} from '../renderer/canonical-brain.js';
import {graphData, memorySignature} from '../memory/graph-data.js';
import {sourceStatus} from '../memory/content-integrity.js';
import {spectrum} from './activity-model.js';

const BINS = 320;
const clamp = value => Math.max(0, Math.min(1, value));
const hash = text => {let value=2166136261;for(const ch of text){value^=ch.charCodeAt(0);value=Math.imul(value,16777619);}return (value>>>0)/4294967295;};
const compare = (a,b) => a.id<b.id?-1:a.id>b.id?1:0;

// Read-only, decorative projection. These heights are not neural firing,
// model computation or new learning. No generated memory/edge records exist.
export class BrainStateModel {
  constructor(){this.profile=new Float32Array(BINS);this.signature=null;this.summary={memories:0,neurons:0,synapses:0,associations:0};this.phase=0;}
  update(state={}){
    const brain=canonicalBrain(state);
    const signature=JSON.stringify([state.mindlingId||state.id,memorySignature(state),brain.nodes,brain.synapses]);
    if(signature===this.signature)return false;
    this.signature=signature;
    const graph=graphData(state);
    const memories=graph.memories.filter(node=>!node.historical&&node.raw.content?.trim()&&sourceStatus(node.raw)!=='incomplete').sort(compare);
    const current=new Set(memories.map(node=>node.id));
    const links=graph.edges.filter(edge=>edge.kind==='association'&&edge.persisted&&current.has(edge.from)&&current.has(edge.to)).sort((a,b)=>compare({id:a.from+'|'+a.to},{id:b.from+'|'+b.to}));
    const neurons=brain.nodes.slice().sort(compare),synapses=brain.synapses.slice().sort(compare);
    this.summary={memories:memories.length,neurons:neurons.length,synapses:synapses.length,associations:links.length};
    this.phase=hash(String(state.mindlingId||state.id||''))*Math.PI*2;
    const positions=new Map();this.profile.fill(0);
    const add=(center,width,weight)=>{for(let i=0;i<BINS;i++){const distance=(i/(BINS-1)-center)/width;this.profile[i]+=weight*Math.exp(-distance*distance);}};
    // Stable ID placement is visualization layout, not inferred semantic meaning.
    for(const node of neurons.slice(0,128)){const center=.06+.88*hash(node.id);positions.set(node.id,center);add(center,.025,.035);}
    for(const memory of memories.slice(0,256)){const center=.06+.88*hash(memory.id);positions.set(memory.id,center);add(center,.025+.03*hash(memory.id+'width'),.035);}
    for(const edge of synapses.slice(0,256)){const a=positions.get(edge.from),b=positions.get(edge.to);if(a!==undefined&&b!==undefined)add((a+b)/2,.025+Math.abs(a-b)*.2,.018+.012*clamp(edge.strength));}
    for(const edge of links.slice(0,256)){const a=positions.get(edge.from),b=positions.get(edge.to);if(a!==undefined&&b!==undefined)add((a+b)/2,.035+Math.abs(a-b)*.15,.028);}
    const peak=Math.max(0,...this.profile),richness=Math.min(1,Math.log1p(memories.length+links.length+synapses.length)/Math.log(257));
    const height=(neurons.length||memories.length) ? .075+.48*richness : 0;
    if(peak)for(let i=0;i<BINS;i++)this.profile[i]=this.profile[i]/peak*height;
    return true;
  }
  get alive(){return this.summary.neurons>0||this.summary.memories>0;}
  height(u,time){
    const bin=clamp(u)*(BINS-1),index=Math.floor(bin),fraction=bin-index;
    const value=this.profile[index]*(1-fraction)+this.profile[Math.min(BINS-1,index+1)]*fraction;
    // Slow bounded breathing is explicitly decorative. No event is created.
    return value*(.86+.10*Math.sin(time/4700+this.phase+u*5)+.04*Math.sin(time/8300+u*13));
  }
  surface(values,u,time){return clamp(this.height(u,time)+.62*spectrum(values,u));}
}
