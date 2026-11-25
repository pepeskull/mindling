import {ActivityModel} from './activity-model.js';
import {BrainStateModel} from './brain-state-model.js';
import {SpectrumRenderer} from './spectrum-renderer.js';

const HISTORY_SECONDS=30;

// Decorative projection of retained neural structure and recent activity.
export class NetworkView {
 constructor(root,{clock=Date.now}={}){
  this.root=root;this.clock=clock;this.model=new ActivityModel();this.brain=new BrainStateModel();
  this.visible=false;this.frame=null;this.mode='3d';this.abort=new AbortController();
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML='<canvas data-cloud role="img" aria-label="Animated decorative projection of stored neural structure and retained memories; not computation or learning"></canvas><canvas data-fallback role="img" aria-label="Decorative neural structure, Canvas fallback" hidden></canvas><span class="sr-only" data-brain-accessible></span>';
  this.spectrum=new SpectrumRenderer(root.querySelector('[data-cloud]'),root.querySelector('[data-fallback]'),()=>this.sync());
  const resize=()=>{if(this.visible){this.fit();this.sync();}};
  window.addEventListener('resize',resize,{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>this.sync(),{signal:this.abort.signal});
  this.reduced.addEventListener('change',()=>this.sync(),{signal:this.abort.signal});
  this.resize=new ResizeObserver(resize);this.resize.observe(root);
 }
 update(state={}){
  const identity=state.mindlingId||state.id;
  if(this.identity!==identity){
   this.model=new ActivityModel();this.brain=new BrainStateModel();
   this.identity=identity;this.playbackClock=null;
  }
  this.state=state;
  if(!this.brain.update(state))return;
  const {neurons,synapses,memories,associations}=this.brain.summary;
  this.root.querySelector('[data-brain-accessible]').textContent=`${neurons} positioned neurons · ${synapses} valid synapses · ${memories} current readable memories · ${associations} stored associations`;
  this.sync();
 }
 ingest(event){
  if(this.state?.learningTasks?.some(task=>task.id===event?.id&&task.autonomous))return false;
  const accepted=this.model.ingest(event,this.clock());
  if(accepted)this.sync();
  return accepted;
 }
 fit(){
  this.spectrum.accent=getComputedStyle(this.root).getPropertyValue('--accent').trim()||'#b7d8d1';
  const dpr=Math.min(devicePixelRatio||1,2),rect=this.root.getBoundingClientRect();
  this.hasSize=rect.width>0&&rect.height>0;
  if(this.hasSize)this.spectrum.fit(Math.max(1,Math.round(rect.width*dpr)),Math.max(1,Math.round(rect.height*dpr)),dpr);
 }
 setVisible(value){
  if(this.visible===value)return;
  this.visible=value;
  if(value)this.fit();
  this.sync();
 }
 sync(){
  if(this.frame!==null)cancelAnimationFrame(this.frame);
  this.frame=null;
  if(!this.visible||!this.hasSize||document.hidden)return;
  this.draw();
  if(!this.reduced.matches&&this.hasRecentActivity())this.frame=requestAnimationFrame(this.animate);
 }
 animate=time=>{
  this.frame=null;
  if(!this.visible||!this.hasSize||document.hidden||this.reduced.matches)return;
  if(!this.lastFrame||time-this.lastFrame>=33){this.lastFrame=time;this.draw();}
  if(this.hasRecentActivity())this.frame=requestAnimationFrame(this.animate);
 };
 hasRecentActivity(){
  return this.brain.alive||this.model.events.some(event=>event.time>=this.clock()-(HISTORY_SECONDS+12)*1000);
 }
 draw(){
  const now=this.clock();
  const delta=this.playbackClock==null||this.reduced.matches?0:Math.max(0,now-this.playbackClock);
  this.playbackClock=now;this.brain.playback.advance(delta);
  this.spectrum.draw(this.model,now,HISTORY_SECONDS,this.mode,this.brain);
 }
 destroy(){
  this.setVisible(false);this.abort.abort();this.resize.disconnect();this.spectrum.destroy();this.root.replaceChildren();
 }
}
