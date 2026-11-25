import { ACTIVITY_KEYS, ACTIVITIES, LOOKS, activityFrame } from './presets.js';
import { CanvasLook } from './canvas-look.js';
import { WebGLLook } from './webgl-look.js';

const CUE_LIMIT=8;
const IDLE_INTERVAL=10;

export class DashboardBrainAppearance {
  mode='neural';
  preset='soft';
  events=[];
  nextIdle=null;

  record(event,now){
    if(this.mode!=='activity'||!ACTIVITY_KEYS.has(event.category))return;
    this.events=this.events.filter(cue=>cue.key!=='idle'&&now-cue.start<ACTIVITIES[cue.key].duration);
    const synapseIds=[...new Set(event.synapseIds||[])];
    for(const synapseId of synapseIds.slice(0,2)){
      this.events.push({key:event.category,synapseId,start:now});
    }
    this.events=this.events.slice(-CUE_LIMIT);
    this.nextIdle=now+IDLE_INTERVAL;
  }

  clear(){
    this.events=[];
    this.nextIdle=null;
  }

  prepare(view,now,reduced){
    this.view=view;
    this.selection=view.selection;
    this.activeCues=[];
    if(this.mode!=='activity')return;
    const edges=new Map(view.data.canonicalNetwork.synapses.map(edge=>[edge.id,edge]));
    const first=edges.keys().next().value;
    this.nextIdle??=now+IDLE_INTERVAL;
    if(!reduced&&first&&now>=this.nextIdle){
      if(!activityFrame(this.events,now,reduced,edges).length){
        this.events=[{key:'idle',synapseId:first,start:now}];
      }
      this.nextIdle=now+IDLE_INTERVAL;
    }
    this.activeCues=activityFrame(this.events,now,reduced,edges);
  }

  drawThree(scene,renderer){
    this.webgl??=new WebGLLook(this.view.three,scene,this.view);
    this.webgl.apply(this.mode,LOOKS[this.profile],this.activeCues,this.selection,renderer);
  }

  drawCanvas(){
    this.canvas??=new CanvasLook(this.view);
    this.canvas.draw(this.mode,this.profile,this.activeCues,this.selection);
  }

  get profile(){return this.mode==='neural'?this.preset:this.mode;}

  release(){
    this.webgl?.dispose();
    this.canvas?.dispose();
    this.webgl=null;
    this.canvas=null;
  }
}
