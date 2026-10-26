import { VIEW_ZOOM } from '../ui/view-zoom.js';
import { BrainRenderer } from '../renderer/brain-renderer.js';

// Development owns keyboard camera interaction. All morphology,
// materials, connections, signals and fallback drawing belong to BrainRenderer.
export class NeuralDevelopmentScene {
  constructor(host, onZoom, onSelection) {
    this.host=host;this.onSelection=onSelection;this.abort=new AbortController();
    this.renderer=new BrainRenderer(host,selection=>{this.selection=selection;onSelection?.(selection);},{mode:'development'});
    this.camera=this.renderer.interaction;this.camera.onZoom=onZoom;
    host.addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();this.camera.rotation.y+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;
        this.camera.rotation.x=Math.max(-.45,Math.min(.35,this.camera.rotation.x+(event.key==='ArrowUp'?-.08:event.key==='ArrowDown'?.08:0)));this.renderer.request();
      }
      if(['+','=','-','0'].includes(event.key)){event.preventDefault();this.control(event.key==='0'?'reset':event.key==='-'?'out':'in');}
    },{signal:this.abort.signal});
  }
  update(data){if(data.id!==this.identity||(this.selection?.type==='neuron'&&!data.nodes.some(node=>node.id===this.selection.id))){this.identity=data.id;this.selection=null;this.renderer.setSelection(null);this.renderer.resetFocus();this.onSelection?.(null);}
    this.renderer.deceased=data.deceased;this.renderer.update({nodes:data.nodes,synapses:data.edges,stage:data.stageNumber});this.renderer.setReducedMotion(this.renderer.motion.matches||data.deceased);}
  setVisible(value){if(value&&!this.started){this.started=true;this.renderer.initialize(this.renderer.model).catch(()=>{if(!this.abort.signal.aborted)this.host.dataset.brainError='unavailable';});}this.renderer.setVisible(value);}
  control(action){
    if(action==='focus'){if(this.renderer.focusSelection(this.selection))this.camera.zoomTo(Math.max(1.2,this.camera.zoom));return;}
    if(action==='fit'||action==='reset')this.renderer.resetFocus();
    if(action==='reset')this.camera.restorePose({rotation:{x:-.08,y:-.2},zoom:1,targetZoom:1});
    else this.camera.zoomTo(action==='fit'?1:this.camera.zoom*(action==='in'?VIEW_ZOOM.step:1/VIEW_ZOOM.step));
    this.renderer.request();
  }
  destroy(){if(this.abort.signal.aborted)return;this.abort.abort();this.camera.onZoom=null;this.renderer.destroy();}
}
