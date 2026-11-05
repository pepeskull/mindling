import {activityEvents,connectedAgents,semanticSummary,relationOrigins} from './activity-data.js';
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
export class NetworkView{
 constructor(root,{adapter=null}={}){
  this.root=root;this.adapter=adapter;this.visible=false;this.frame=null;this.phase=0;this.abort=new AbortController();this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML='<header><p>NETWORK</p><h2>Connected intelligence.</h2><span>Mindling communication and activity</span></header><section class="network-panel network-signal"><div class="network-panel-heading"><div><small>01 / SIGNAL ACTIVITY</small><h3>Internal signals</h3></div><span data-network-status></span></div><div class="network-canvas"><canvas aria-label="Activity-driven flowing signals; ambient movement is decorative" role="img"></canvas></div><p data-network-reason></p></section><div class="network-bottom"><section class="network-panel"><div class="network-panel-heading"><div><small>02 / INTERNAL COMMUNICATION</small><h3>Activity stream</h3></div><button type="button" data-network-toggle aria-pressed="false">BINARY</button></div><ol data-network-events></ol></section><section class="network-panel"><div class="network-panel-heading"><div><small>03 / CONNECTED AI AGENTS</small><h3>Agent connections</h3></div><span>LOCAL IDENTITY</span></div><p data-network-identity></p><div data-network-agents></div><details><summary>Semantic analysis</summary><div data-network-diagnostics></div></details></section></div>';
  this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
  root.querySelector('[data-network-toggle]').addEventListener('click',event=>{this.decoded=!this.decoded;event.currentTarget.textContent=this.decoded?'DECODED':'BINARY';event.currentTarget.setAttribute('aria-pressed',String(this.decoded));this.renderEvents();},{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>this.sync(),{signal:this.abort.signal});this.reduced.addEventListener('change',()=>this.sync(),{signal:this.abort.signal});
  this.resize=new ResizeObserver(()=>{this.fit();this.sync();});this.resize.observe(this.canvas.parentElement);
 }
 update(state={}){const identity=state.mindlingId||state.id;if(this.identity!==identity){this.latest=null;this.pulseUntil=0;}this.identity=identity;this.state=state;this.events=activityEvents(state);this.summary=semanticSummary(state);this.status=this.summary.running?'SEMANTIC ANALYSIS':state.autonomousStatus||'IDLE';
  const newest=this.events[0]?.id;if(this.latest&&newest!==this.latest&&this.events[0]?.status==='completed')this.pulseUntil=performance.now()+1800;this.latest=newest;
  this.root.querySelector('[data-network-status]').textContent=this.status;
  this.root.querySelector('[data-network-reason]').textContent=this.status==='IDLE'?'Ambient signal field · no active operation':state.autonomousReason||this.status;
  this.root.querySelector('[data-network-identity]').textContent=state.mindlingId||state.id||'Identity unavailable';
  const list=this.root.querySelector('[data-network-agents]');list.replaceChildren();const agents=connectedAgents(this.adapter);
  if(!agents.length){list.append(node('p','No connected agents'),node('p','External agent communication is not available.','network-muted'));}
  for(const a of agents){const card=node('article');card.append(node('strong',a.name),node('p',a.publicId),node('span',`${a.status} · ${a.verified?'Verified channel':'Unverified'}`));if(a.lastCommunication)card.append(node('p',new Date(a.lastCommunication).toLocaleString()));if(a.method)card.append(node('p',a.method));list.append(card);}
  const d=this.summary,detail=this.root.querySelector('[data-network-diagnostics]');detail.replaceChildren(node('p',`${d.pending} scheduled · ${d.running} running · ${d.completed} completed · ${d.failed} failed`),node('p',`UTC day: ${d.reserved} calls reserved · ${d.callsCompleted} completed · ${d.remaining} extra calls available`),node('p',`${d.examined} pairs examined · ${d.accepted} accepted · ${d.rejected} rejected (retained analyses)`));
  const origins=relationOrigins(state);detail.append(node('p',`Stored relation origins: ${origins.teach} Teach model · ${origins.semantic} semantic worker · ${origins.coSubmitted} co-submitted pairs`));
  if(d.lastSuccess)detail.append(node('p',`Last successful analysis: ${new Date(d.lastSuccess).toLocaleString()}`));
  if(d.lastFailure)detail.append(node('pre',JSON.stringify(d.lastFailure,null,2)));
  this.renderEvents();this.sync();
 }
 renderEvents(){const list=this.root.querySelector('[data-network-events]');list.replaceChildren();if(!this.events?.length){list.append(node('li','NO COMMUNICATION EVENTS YET'),node('li','Learning and processing events will appear here.'));return;}
  for(const e of this.events.slice(0,40)){const row=node('li'),time=node('time',new Date(e.timestamp).toLocaleTimeString());time.dateTime=new Date(e.timestamp).toISOString();row.append(time,node('code',this.decoded?e.type.replaceAll('_',' '):e.binary),node('small',`${e.type} · ${e.subsystem} · ${e.status}`));list.append(row);}
 }
 fit(){const r=this.canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);this.width=r.width;this.height=r.height;this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);}
 setVisible(value){this.visible=value;this.fit();this.sync();}
 sync(){if(this.frame!==null){cancelAnimationFrame(this.frame);this.frame=null;}if(!this.visible||document.hidden)return;this.draw(performance.now());if(!this.reduced.matches)this.frame=requestAnimationFrame(this.animate);}
 animate=time=>{this.frame=null;if(!this.visible||document.hidden||this.reduced.matches)return;if(!this.last||time-this.last>=33){this.phase+=Math.min(50,time-(this.last||time))/1000;this.last=time;this.draw(time);}this.frame=requestAnimationFrame(this.animate);};
 draw(time){const c=this.ctx,w=this.width||0,h=this.height||0;c.clearRect(0,0,w,h);const busy=['RESEARCHING','ANALYZING','LEARNING','SEMANTIC ANALYSIS'].includes(this.status),planning=this.status==='PLANNING',amp=busy?1:planning?.65:.3,pulse=time<(this.pulseUntil||0)?1.35:1;
  for(let strand=0;strand<12;strand++){c.beginPath();for(let x=0;x<=w;x+=5){const u=x/Math.max(w,1),envelope=Math.sin(Math.PI*u),wave=Math.sin(u*12-this.phase*(busy?2.4:.8)+strand*.29),interference=Math.sin(u*21-this.phase*1.1+strand*.8);const y=h/2+(strand-5.5)*h*.025+envelope*(wave*h*.22+interference*h*.045)*amp*pulse;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=`rgba(${strand%3===0?'160,177,207':'154,199,192'},${.12+(strand%4)*.065})`;c.lineWidth=strand%4===0?1.5:.7;c.stroke();}
 }
 destroy(){this.visible=false;this.sync();this.abort.abort();this.resize.disconnect();this.root.replaceChildren();}
}
