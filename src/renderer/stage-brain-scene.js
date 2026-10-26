import { EvolutionScene } from '../preview/evolution-scene.js';
import { NetworkSimulation } from '../preview/evolution-model.js';
import { ThreeSeedScene } from './three-seed-scene.js';
import { CanvasSeedScene } from './canvas-seed-scene.js';
import { stagePresentation } from './stage-presentation.js';

// Adapter over the actual Replay scene, not a new morphology/rendering engine.
// Seed and Replay share ONE canvas/WebGLRenderer; only the active scene draws.
export class StageBrainScene {
  constructor(three, onSelection, interaction, framing, scene = null) {
    this.three=three;this.onSelection=onSelection;this.interaction=interaction;this.framing=framing;
    this.scene=scene;this.ownsScene=!scene;this.network=new NetworkSimulation();
  }
  mount(host, model) {
    this.host=host;
    if(!this.scene){this.scene=new EvolutionScene({three:this.three,interaction:this.interaction,fitDashboard:true,shareContext:true});this.scene.mount(host);}
    this.update(model);
  }
  update(model) {
    const previous=this.data;
    this.data=stagePresentation(model);
    const {stage,canonicalNetwork,projection}=this.data;
    if(!previous||stage!==previous.stage){
      // Hydration shows the saved stage immediately. Later committed changes morph.
      this.scene.morph.select(stage,!previous||this.reduced);
      this.scene.buffers.rebuild(this.scene.morph);this.scene.centralSegments=this.scene.buffers.segmentCount;
      this.network.configure(stage);
    }
    if(stage===1&&!this.seed){
      this.seed=this.three?new ThreeSeedScene(this.three,this.onSelection,this.interaction,this.framing,this.scene.renderer):new CanvasSeedScene(this.onSelection,this.interaction,this.framing,this.scene.canvas);
      this.seed.mount(this.host,canonicalNetwork);this.seed.setReducedMotion(Boolean(this.reduced));
      if(this.width)this.seed.resize(this.width,this.height);
    }else if(stage!==1&&this.seed){this.seed.destroy();this.seed=null;}
    this.seed?.update(canonicalNetwork);
    this.scene.setCanonicalNetwork(canonicalNetwork,projection,Boolean(previous));
    this.host.dataset.visualNeurons=String(this.data.visualNeuronCount);
    this.host.dataset.canonicalNeurons=String(this.data.canonicalNeuronCount);
  }
  resize(width,height){this.width=width;this.height=height;this.scene.resize(width,height);this.seed?.resize(width,height);}
  render(elapsed,delta,network=this.network){
    if(this.seed){this.scene.claimRenderer();this.seed.render(elapsed,delta);}
    else this.scene.render(elapsed,delta,network);
  }
  selectAt(event){const hit=this.seed?this.seed.selectAt(event):this.scene.pickCanonicalElement(event);if(!this.seed){this.setSelection(hit);this.onSelection?.(hit);}return hit;}
  hoverAt(event){if(this.seed)return this.seed.hoverAt(event);this.scene.hoverCanonical=this.scene.pickCanonicalElement(event);return this.scene.hoverCanonical;}
  setSelection(selection){this.seed?.setSelection(selection);this.scene.selectedCanonical=selection?.type==='neuron'?selection.id:null;this.scene.selectedCanonicalEdge=selection?.type==='synapse'?selection.id:null;}
  signal(route){this.seed?.signal(route);this.scene.signalCanonical(route);}
  highlightRoute(route){this.seed?.highlightRoute(route);this.scene.canonicalRoute=route;}
  setReducedMotion(value){this.reduced=value;this.scene.reduced=value;this.seed?.setReducedMotion(value);if(value&&this.scene.morph.progress<1){this.scene.morph.select(this.data.stage,true);this.scene.buffers.rebuild(this.scene.morph);this.scene.centralSegments=this.scene.buffers.segmentCount;}}
  destroy(){if(this.disposed)return;this.disposed=true;this.seed?.destroy();if(this.ownsScene)this.scene?.destroy();for(const key of ['visualNeurons','canonicalNeurons'])delete this.host?.dataset[key];}
}
