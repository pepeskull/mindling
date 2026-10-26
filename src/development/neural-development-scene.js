import { BrainRenderer } from '../renderer/brain-renderer.js';

// Development owns only camera controls and selection callbacks. All morphology,
// materials, connections, signals and fallback drawing belong to BrainRenderer.
export class NeuralDevelopmentScene {
  constructor(host, onSelect) {
    this.host=host;this.onSelect=onSelect;this.abort=new AbortController();
    this.renderer=new BrainRenderer(host,selection=>{this.selection=selection;this.selected=selection?.type==='neuron'?selection.id:null;this.onSelect?.(selection);},{mode:'development'});
    this.camera=this.renderer.interaction;this.selected=null;
    host.addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();this.camera.rotation.y+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;
        this.camera.rotation.x=Math.max(-.45,Math.min(.35,this.camera.rotation.x+(event.key==='ArrowUp'?-.08:event.key==='ArrowDown'?.08:0)));this.renderer.request();
      }
      if(['+','=','-','0'].includes(event.key)){event.preventDefault();this.control(event.key==='0'?'reset':event.key==='-'?'out':'in');}
    },{signal:this.abort.signal});
  }
  update(data){this.renderer.deceased=data.deceased;this.renderer.update({nodes:data.nodes,synapses:data.edges,stage:data.stageNumber});this.renderer.setReducedMotion(this.renderer.motion.matches||data.deceased);}
  setVisible(value){if(value&&!this.started){this.started=true;this.renderer.initialize(this.renderer.model).catch(()=>{if(!this.abort.signal.aborted)this.host.dataset.brainError='unavailable';});}this.renderer.setVisible(value);}
  activate(ids){this.renderer.activate(ids);}
  select(id){const selection=id?{type:'neuron',id}:null;this.selection=selection;this.selected=id;this.renderer.setSelection(selection);this.onSelect?.(selection);}
  control(action){
    if(action==='reset')this.camera.restorePose({rotation:{x:-.08,y:-.2},zoom:1,targetZoom:1});
    else{const zoom=Math.max(.72,Math.min(1.48,this.camera.zoom*(action==='in'?1.12:1/1.12)));this.camera.restorePose({rotation:{...this.camera.rotation},zoom,targetZoom:zoom});}
    this.renderer.request();
  }
  destroy(){if(this.abort.signal.aborted)return;this.abort.abort();this.renderer.destroy();}
}
