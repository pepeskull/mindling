// Transient input feedback, advanced by the Dashboard's existing RAF owner.
// Pending input never reaches the brain until the authoritative activity succeeds.
export class NeuralInputFeedback {
  constructor(root, input, target, impact, motion) { Object.assign(this,{root,input,target,impact,motion}); }
  handle(event) {
    if(event.phase==='start'){
      this.clear();const rect=this.input.getBoundingClientRect();
      this.effect={id:event.id,started:performance.now(),source:{x:rect.left+rect.width/2,y:rect.top-4}};
      this.canvas=document.createElement('canvas');this.canvas.className='neural-input-feedback';this.canvas.setAttribute('aria-hidden','true');
      this.context=this.canvas.getContext('2d');if(!this.context){this.clear();return;}this.root.append(this.canvas);
    }else if(this.effect?.id===event.id){
      if(event.phase==='accepted'){this.effect.accepted=performance.now();this.effect.progress=this.motion.matches?0:Math.min(.7,(this.effect.accepted-this.effect.started)/700);}
      else this.clear();
    }
  }
  render(now) {
    const e=this.effect;if(!e||!this.context)return;
    const target=this.target();if(!target){this.clear();return;}
    const rect=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),c=this.context;
    if(this.canvas.width!==Math.round(rect.width*dpr)||this.canvas.height!==Math.round(rect.height*dpr)){this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,rect.width,rect.height);
    const complete=e.accepted!==undefined,elapsed=complete?now-e.accepted:now-e.started;
    const progress=this.motion.matches?(complete?1:0):complete?e.progress+(1-e.progress)*Math.min(1,elapsed/500):Math.min(.7,elapsed/700);
    if(complete&&progress>=1&&!e.impacted){e.impacted=true;this.impact();}
    if(complete&&elapsed>(this.motion.matches?180:680)){this.clear();return;}
    const source={x:e.source.x-rect.left,y:e.source.y-rect.top},end={x:target.x-rect.left,y:target.y-rect.top};
    const point=t=>({x:source.x+(end.x-source.x)*t+Math.sin(t*Math.PI)*18,y:source.y+(end.y-source.y)*t});
    for(const [lag,radius,opacity] of this.motion.matches?[[0,9,.35]]:[[.09,9,.1],[.045,12,.16],[0,18,.65]]){
      const p=point(Math.max(0,progress-lag)),fade=complete?Math.min(1,Math.max(0,(680-elapsed)/180)):1;
      const glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);glow.addColorStop(0,`rgba(229,255,249,${opacity*fade})`);glow.addColorStop(.2,`rgba(163,232,215,${opacity*.75*fade})`);glow.addColorStop(1,'rgba(163,232,215,0)');
      c.fillStyle=glow;c.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
    }
  }
  clear(){this.canvas?.remove();this.canvas=null;this.context=null;this.effect=null;}
  destroy(){this.clear();}
}
