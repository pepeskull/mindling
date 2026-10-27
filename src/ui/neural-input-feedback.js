// Reception feedback follows presentation time, never inference latency.
// The Dashboard's existing RAF owns this short-lived effect.
export class NeuralInputFeedback {
  constructor(root,input,target,impact,motion){Object.assign(this,{root,input,target,impact,motion});}
  handle(event){
    if(event.phase==='start'){
      this.clear();const rect=this.input.getBoundingClientRect();
      this.effect={id:event.id,started:performance.now(),source:{x:rect.left+rect.width/2,y:rect.top-4}};
      this.canvas=document.createElement('canvas');this.canvas.className='neural-input-feedback';this.canvas.setAttribute('aria-hidden','true');
      this.context=this.canvas.getContext('2d');if(!this.context){this.clear();return;}this.root.append(this.canvas);
    }else if(this.effect?.id===event.id&&event.phase==='cancel')this.clear();
  }
  render(now){
    const e=this.effect;if(!e||!this.context)return;
    const target=this.target();if(!target){this.clear();return;}
    const age=Math.max(0,now-e.started),duration=this.motion.matches?0:850,progress=duration?Math.min(1,age/duration):1;
    if(progress===1&&!e.impacted){e.impacted=true;this.impact();}
    if(age>duration+180){this.clear();return;}
    const rect=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),c=this.context;
    if(this.canvas.width!==Math.round(rect.width*dpr)||this.canvas.height!==Math.round(rect.height*dpr)){this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,rect.width,rect.height);
    const source={x:e.source.x-rect.left,y:e.source.y-rect.top},end={x:target.x-rect.left,y:target.y-rect.top};
    const eased=progress*progress*(3-2*progress),point=t=>({x:source.x+(end.x-source.x)*t,y:source.y+(end.y-source.y)*t});
    const p=point(eased),tail=point(Math.max(0,eased-.16)),fade=age<=duration?1:Math.max(0,1-(age-duration)/180);
    // One continuous gradient stroke; no circular afterimages or particles.
    if(!this.motion.matches&&progress<1){
      const trail=c.createLinearGradient(tail.x,tail.y,p.x,p.y);trail.addColorStop(0,'rgba(163,232,215,0)');trail.addColorStop(1,'rgba(183,242,225,.45)');
      c.strokeStyle=trail;c.lineWidth=2;c.lineCap='round';c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(p.x,p.y);c.stroke();
    }
    const radius=this.motion.matches?9:16,glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
    glow.addColorStop(0,`rgba(229,255,249,${.8*fade})`);glow.addColorStop(.2,`rgba(163,232,215,${.5*fade})`);glow.addColorStop(1,'rgba(163,232,215,0)');
    c.fillStyle=glow;c.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
  }
  clear(){this.canvas?.remove();this.canvas=null;this.context=null;this.effect=null;}
  destroy(){this.clear();}
}
