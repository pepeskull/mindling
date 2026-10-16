export const NORMAL_VIEW = 'NORMAL_VIEW';
export const EXTERNAL_VIEW = 'EXTERNAL_VIEW';
export const eligible = node => node?.stage === 7 && node?.lifeState !== 'DECEASED';
// Explicit illustration graph, never a discovery service or real player records.
const DEMO = [
  {id:'demo:nova',name:'Nova',stage:7,demo:true,connections:['demo:echo'],life:{health:92,nutrition:84,rest:79,wellbeing:91,neuralStability:88}},
  {id:'demo:echo',name:'Echo',stage:7,demo:true,connections:['demo:nova','demo:atlas']},
  {id:'demo:atlas',name:'Atlas',stage:7,demo:true,connections:[]}
];
// Whitelist only public fields. No keys, wallets, memories or database access.
export function publicNode(input) {
  if(!input || typeof input.id!=='string'||typeof input.name!=='string')throw Error('Invalid public node');
  const life={};
  for(const key of ['health','nutrition','rest','wellbeing','neuralStability']){
    const value=input.life?.[key];if(Number.isFinite(value)&&value>=0&&value<=100)life[key]=value;
  }
  return Object.freeze({id:input.id,name:input.name,stage:input.stage,demo:input.demo===true,
    publicIdentity:typeof input.publicIdentity==='string'?input.publicIdentity:null,
    lifeState:input.lifeState,life:Object.freeze(life),connections:Object.freeze([...new Set((input.connections||[]).filter(id=>typeof id==='string'&&id!==input.id))])});
}
export const DEMO_NODES=Object.freeze(DEMO.map(publicNode));
export class PublicNetwork {
  constructor(nodes=DEMO_NODES){this.nodes=new Map(nodes.map(node=>{const safe=publicNode(node);return [safe.id,safe];}));}
  get(id){return this.nodes.get(id)||null;}
  connections(id){const node=this.get(id);return eligible(node)?node.connections.map(id=>this.get(id)).filter(eligible):[];}
  roots(owner){return eligible(owner)?DEMO_NODES.map(node=>this.get(node.id)).filter(eligible):[];}
}
// Pure view state, kept outside both gameplay databases.
export class ExternalVisit {
  mode=NORMAL_VIEW; selected=null; transitioning=false;
  constructor(graph=new PublicNetwork()){this.graph=graph;}
  get locked(){return this.mode===EXTERNAL_VIEW;}
  enter(id,{owner,connectedIds,busy=false}={}){
    const target=this.graph.get(id);
    if(busy||this.transitioning||!eligible(owner)||!eligible(target)||!connectedIds?.includes(id))return false;
    if(this.locked&&!this.graph.connections(this.selected).some(node=>node.id===id))return false;
    this.mode=EXTERNAL_VIEW;this.selected=id;this.transitioning=true;return true;
  }
  settled(){this.transitioning=false;}
  valid(owner){return eligible(owner)&&eligible(this.graph.get(this.selected));}
  exit(){this.mode=NORMAL_VIEW;this.selected=null;this.transitioning=false;}
  assertWritable(){if(this.locked)throw Error('External View is read-only. Return to My Mindling first.');}
}
export class CameraTrip {
  constructor(from,to,{reduced=false,onComplete=()=>{}}={}){this.from=structuredClone(from);this.to=structuredClone(to);this.duration=reduced?0:1.25;this.elapsed=0;this.onComplete=onComplete;this.done=false;}
  tick(delta){
    this.elapsed+=Math.max(0,Math.min(delta,.1));const t=this.duration?Math.min(1,this.elapsed/this.duration):1;
    const blend=t*t*(3-2*t),value={focus:this.from.focus.map((v,i)=>v+(this.to.focus[i]-v)*blend),scale:this.from.scale+(this.to.scale-this.from.scale)*blend};
    if(t===1&&!this.done){this.done=true;this.onComplete();}return value;
  }
  finish(){this.duration=0;return this.tick(0);}
}
