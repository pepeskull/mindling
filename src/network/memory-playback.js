import {CHANNELS} from './activity-model.js';
import {areaColor,NEUTRAL_COLOR} from '../memory/area-colors.js';

export const INTERVAL=900, DURATION=4500;
export const placement=id=>{let h=2166136261;for(const c of id){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return .06+.88*(h>>>0)/4294967295;};
const compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const envelope=(age,duration=DURATION)=>age<0||age>=duration?0:Math.sin(Math.PI*age/duration)**2;
const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);

// Ephemeral visualization only. Neither scheduled activations nor propagation
// are learning events. The journal covers the existing 30-second visual history.
export class MemoryPlayback {
 constructor(){this.time=0;this.next=0;this.cursor=0;this.cycle=0;this.edgeCursor=0;this.records=[];this.links=[];this.journal=[];this.latest=new Map();this.pending=[];}
 update(memories,links,areas){
  const areaMap=new Map(areas.map(a=>[a.id,a]));
  this.latest=new Map(memories.map(m=>{const area=areaMap.get(m.areaId);const activity=m.raw.source==='AUTONOMOUS'?null:(m.raw.analysis?.activity??m.raw.native?.provenance?.activity);
   return [m.id,{id:m.id,recordId:m.recordId,areaId:m.areaId,center:placement(m.id),areaCenter:placement(m.areaId),color:rgb(area?.label==='Uncategorized'?NEUTRAL_COLOR:areaColor(m.areaId)),channel:CHANNELS.indexOf(activity),origin:m.raw.source??null}];}));
  this.pending=[...this.latest.values()].sort(compare);
  // Remove invalidated entries immediately, but additions join at the next boundary.
  this.journal=this.journal.filter(e=>this.latest.has(e.memory.id));
  this.links=links.map(e=>({id:JSON.stringify([e.from,e.to]),from:e.from,to:e.to})).sort(compare);
  this.edgeCursor%=this.links.length||1;
  const validEdges=new Set(this.links.map(e=>e.id));
  this.journal=this.journal.map(e=>({...e,memory:this.latest.get(e.memory.id),edge:validEdges.has(e.edge?.id)?e.edge:null}));
 }
 advance(delta=0){
  this.time+=Math.max(0,Number.isFinite(delta)?delta:0);
  const activated=[];
  while(this.next<=this.time){
   if(this.cursor>=this.records.length){this.records=this.pending;this.cursor=0;if(this.records.length)this.cycle++;}
   if(!this.records.length){this.next=this.time;break;}
   const candidate=this.records[this.cursor++],memory=this.latest.get(candidate.id);
   if(!memory)continue;
   const edge=this.links.length?this.links[this.edgeCursor++%this.links.length]:null;
   for(const previous of this.journal)if(previous.memory.id===memory.id)previous.duration=Math.min(previous.duration,this.next-previous.time);
   this.journal.push({memory,edge,time:this.next,cycle:this.cycle,duration:Math.min(DURATION,this.records.length*INTERVAL)});activated.push({id:memory.id,cycle:this.cycle});this.next+=INTERVAL;
  }
  this.journal=this.journal.filter(e=>e.time>=this.time-30000-DURATION);
  return activated;
 }
 active(time=this.time){return this.journal.filter(e=>envelope(time-e.time,e.duration)>0);}
 values(time=this.time){const v=[0,0,0];for(const e of this.journal){const pulse=envelope(time-e.time,e.duration)*.19;if(e.memory.channel>=0)v[e.memory.channel]+=pulse;else for(let i=0;i<3;i++)v[i]+=pulse/3;}return v.map(x=>Math.min(.62,x));}
 // Once per surface row, not once per vertex. At most five memory pulses and
 // five real edges; all stored edges rotate deterministically across slots.
 paint(time,heights,colors){
  heights.fill(0);colors.fill(0);
  const add=(center,weight,color)=>{const first=Math.max(0,Math.floor((center-.14)*(heights.length-1))),last=Math.min(heights.length-1,Math.ceil((center+.14)*(heights.length-1)));for(let i=first;i<=last;i++){const v=weight*Math.exp(-(((i/(heights.length-1)-center)/.035)**2));heights[i]+=v;for(let k=0;k<3;k++)colors[i*3+k]+=v*color[k];}};
  for(const e of this.journal){const age=time-e.time,pulse=envelope(age,e.duration);if(!pulse)continue;const m=e.memory;
   add(m.center,.22*pulse,m.color);add(m.areaCenter+(m.center-m.areaCenter)*age/e.duration,.09*pulse,m.color);
   if(e.edge){const a=this.latest.get(e.edge.from),b=this.latest.get(e.edge.to);if(a&&b){const t=age/e.duration;add(a.center+(b.center-a.center)*t,.13*pulse,a.color.map((v,i)=>v*(1-t)+b.color[i]*t));}}
  }
 }
}
