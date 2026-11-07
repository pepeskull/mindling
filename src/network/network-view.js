import {ActivityModel,CHANNELS,COLORS} from './activity-model.js';
import {BrainStateModel} from './brain-state-model.js';
import {SpectrumRenderer} from './spectrum-renderer.js';
// Meter and history presentation adapted from Realtime_PyAudio_FFT, MIT.
export class NetworkView {
 constructor(root,{clock=Date.now}={}){
  this.root=root;
  this.clock=clock;
  this.model=new ActivityModel();
  this.brain=new BrainStateModel();
  this.visible=false;
  this.frame=null;
  this.history=30;
  this.mode='3d';
  this.abort=new AbortController();
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML=`<div class="network-grid">
    <section class="network-panel network-bars" aria-label="Recent Talk, Teach and Deep Training events"><div class="network-plot"><canvas data-bars role="img" aria-label="Real interaction intensity with peak hold; decorative brain activity is excluded"></canvas></div></section>
    <section class="network-panel network-lines" aria-label="Recent interaction history"><div class="network-legend"><span>Talk</span><span>Teach</span><span>Deep Training</span></div><div class="network-plot"><canvas data-lines role="img" aria-label="Real interaction events, newest on the right; no synthetic baseline"></canvas></div></section>
    <section class="network-panel network-cloud" aria-label="Living neural structure"><div class="network-plot network-cloud-plot"><canvas data-cloud role="img" aria-label="Animated decorative projection of stored neural structure and retained memories; not computation or learning"></canvas><canvas data-fallback role="img" aria-label="Decorative neural structure, Canvas fallback" hidden></canvas><span class="sr-only" data-brain-accessible></span></div></section>
  </div>`;
  this.bars=root.querySelector('[data-bars]');
  this.lines=root.querySelector('[data-lines]');
  this.spectrum=new SpectrumRenderer(root.querySelector('[data-cloud]'),root.querySelector('[data-fallback]'),()=>this.sync());
  window.addEventListener('resize',()=>{this.fit();this.sync();},{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>this.sync(),{signal:this.abort.signal});
  this.reduced.addEventListener('change',()=>this.sync(),{signal:this.abort.signal});
  this.resize=new ResizeObserver(()=>{this.fit();this.sync();});
  root.querySelectorAll('.network-plot').forEach(el=>this.resize.observe(el));
 }
 update(state={}){const identity=state.mindlingId||state.id;
  if(this.identity!==identity){this.model=new ActivityModel();
  this.brain=new BrainStateModel();
  this.identity=identity;
  }this.state=state;
  this.brain.update(state);
  const counts=this.brain.summary,summary=`${counts.neurons} positioned neurons · ${counts.synapses} valid synapses · ${counts.memories} current readable memories · ${counts.associations} stored associations`;
  this.root.querySelector('[data-brain-accessible]').textContent=summary;
  this.sync();
  }
 ingest(event){if(this.state?.learningTasks?.some(t=>t.id===event?.id&&t.autonomous))return false;
  const accepted=this.model.ingest(event,this.clock());
  if(accepted)this.sync();
  return accepted;
  }
 fit(){const style=getComputedStyle(this.root);
  this.colors=['--life-rest','--accent','--life-nutrition'].map((name,i)=>style.getPropertyValue(name).trim()||COLORS[i]);
  this.textColor=style.getPropertyValue('--text-secondary').trim();this.track=style.getPropertyValue('--surface-glass').trim();
  this.spectrum.accent=style.getPropertyValue('--accent').trim()||'#b7d8d1';
  const dpr=Math.min(devicePixelRatio||1,1.5);
  for(const canvas of[this.bars,this.lines]){const rect=canvas.parentElement.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  }const rect=this.spectrum.canvas.parentElement.getBoundingClientRect();
  this.spectrum.fit(Math.max(1,Math.round(rect.width*dpr)),Math.max(1,Math.round(rect.height*dpr)),dpr);
  this.dpr=dpr;
  }
 setVisible(value){this.visible=value;
  if(value)this.fit();
  this.sync();
  }
 sync(){if(this.frame!==null)cancelAnimationFrame(this.frame);
  this.frame=null;
  if(!this.visible||document.hidden)return;
  this.draw();
  if(!this.reduced.matches&&this.hasRecentActivity())this.frame=requestAnimationFrame(this.animate);
  }
 animate=time=>{this.frame=null;
  if(!this.visible||document.hidden||this.reduced.matches)return;
  if(!this.lastFrame||time-this.lastFrame>=(this.bars.width/(this.dpr||1)<220?66:33)){this.lastFrame=time;
  this.draw();
  }if(this.hasRecentActivity())this.frame=requestAnimationFrame(this.animate);
  };
 hasRecentActivity(){return this.brain.alive||this.model.events.some(e=>e.time>=this.clock()-(this.history+12)*1000);
  }
 draw(){const model=this.model,now=this.clock(),values=model.sample(now),rows=model.history(now,this.history),peaks=model.peaks(now),flashes=model.flashes(now);
  this.currentValues=values;
  this.status=values.some(v=>v>.01)||flashes.some(v=>v>0)?'LIVE':'IDLE';
  this.drawBars(values,peaks,flashes);
  this.drawLines(rows,now);
  this.spectrum.draw(model,now,this.history,this.mode,this.brain);
  }
 drawBars(values,peaks,flashes){const c=this.bars.getContext('2d'),d=this.dpr||1,w=this.bars.width/d,h=this.bars.height/d;
  c.setTransform(d,0,0,d,0,0);
  c.clearRect(0,0,w,h);
  const top=55,bottom=h-30,range=Math.max(1,bottom-top),bw=Math.min(72,w*.19);
  c.font='9px system-ui';
  c.textAlign='center';
  for(let i=0;i<3;i++){const x=(i+.5)*w/3-bw/2;
  c.fillStyle=this.track||'#08090a';
  c.fillRect(x,12,bw,32);
  c.fillStyle=this.colors?.[i]||COLORS[i];
  c.globalAlpha=.18+.82*flashes[i];
  c.fillRect(x,12,bw,32);
  c.globalAlpha=1;
  c.fillStyle=this.track||'#08090a';
  c.fillRect(x,top,bw,range);
  c.fillStyle=this.colors?.[i]||COLORS[i];
  c.fillRect(x,bottom-values[i]*range,bw,values[i]*range);
  if(peaks[i]>.005){c.fillStyle='#e2e6e9';
  c.fillRect(x,bottom-peaks[i]*range,bw,1.5);
  }c.fillStyle=this.textColor||'#92959b';
  if(i===2&&w<220){c.font='7px system-ui';
  c.fillText('DEEP',x+bw/2,h-17);
  c.fillText('TRAINING',x+bw/2,h-7);
  }else{c.font=w<220?'8px system-ui':'9px system-ui';
  c.fillText(CHANNELS[i].replace('_',' '),x+bw/2,h-12);
  }}}
 drawLines(rows,now){const c=this.lines.getContext('2d'),d=this.dpr||1,w=this.lines.width/d,h=this.lines.height/d;
  c.setTransform(d,0,0,d,0,0);
  c.clearRect(0,0,w,h);
  const top=14,bottom=h-28,left=28,right=w-12;
  c.font='10px monospace';
  c.textAlign='left';
  for(const value of[0,.5,1]){const y=bottom-value*(bottom-top);
  c.strokeStyle='#ffffff08';
  c.beginPath();
  c.moveTo(left,y);
  c.lineTo(right,y);
  c.stroke();
  c.fillStyle='#686e75';
  c.fillText(String(value),4,y+3);
  }for(let i=0;i<3;i++){const path=new Path2D();
  let firstX=left,lastX=left;
  rows.forEach((row,j)=>{const x=left+(1-(now-row.time)/(this.history*1000))*(right-left),y=bottom-row.values[i]*(bottom-top);if(j===0){path.moveTo(x,y);firstX=x;}else path.lineTo(x,y);lastX=x;});
  const gradient=c.createLinearGradient(left,0,right,0);
  gradient.addColorStop(0,(this.colors?.[i]||COLORS[i])+'08');
  gradient.addColorStop(1,(this.colors?.[i]||COLORS[i])+'ed');
  c.strokeStyle=gradient;
  c.lineWidth=1.35;
  c.stroke(path);
  path.lineTo(lastX,bottom);
  path.lineTo(firstX,bottom);
  path.closePath();
  c.globalAlpha=.13;
  c.fillStyle=gradient;
  c.fill(path);
  c.globalAlpha=1;
  }c.fillStyle='#787e86';
  c.fillText(`−${this.history}s`,left,h-9);
  c.textAlign='right';
  c.fillText('now',right,h-9);
  }
 destroy(){this.visible=false;
  this.sync();
  this.abort.abort();
  this.resize.disconnect();
  this.spectrum.destroy();
  this.root.replaceChildren();
  }
}
