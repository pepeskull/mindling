// Presentation time only. No gameplay clock, database access or activity events.
export class StageChip {
  constructor(node) {
    this.node=node;this.stage=node.textContent;this.enabled=false;this.active=true;this.elapsed=0;this.last=performance.now();
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.abort=new AbortController();
    document.addEventListener('visibilitychange',()=>this.reconcile(),{signal:this.abort.signal});
  }
  setStage(stage,{enabled=true}={}) {
    if(this.stage===stage&&this.enabled===enabled)return;
    this.stage=stage;this.enabled=enabled;this.elapsed=0;this.last=performance.now();this.reconcile();
  }
  setActive(active){this.active=active;this.reconcile();}
  reconcile(){
    if(this.abort.signal.aborted)return;
    const now=performance.now();if(this.running)this.elapsed+=Math.max(0,now-this.last);this.last=now;
    this.running=this.active&&this.enabled&&!document.hidden;clearTimeout(this.timer);
    const phase=this.elapsed%40000,text=this.running&&phase>=30000?'Demo is learning.':this.stage;
    if(this.node.textContent!==text){this.animation?.cancel();this.node.textContent=text;if(!this.motion.matches)this.animation=this.node.animate([{opacity:.4},{opacity:1}],{duration:250});}
    if(this.running)this.timer=setTimeout(()=>this.reconcile(),(phase<30000?30000:40000)-phase);
  }
  destroy(){clearTimeout(this.timer);this.animation?.cancel();this.abort.abort();this.running=false;}
}
