import {orbitFrame,streamColor} from './orbit-motion.js';
// Catalog describes potential connectors, never authentication or authorization.
export const PLATFORMS=[
 ['x','X','Social & community','Publish and review approved posts.',['Read selected posts','Publish only with approval']],
 ['discord','Discord','Social & community','Participate in approved community channels.',['Selected server channels','Send approved messages']],
 ['telegram','Telegram','Social & community','Receive updates and manage approved conversations.',['Selected chats','Send approved messages']],
 ['reddit','Reddit','Social & community','Explore communities and prepare contributions.',['Read selected communities','Submit approved content']],
 ['github','GitHub','Developer & productivity','Understand repositories and assist with reviewed changes.',['Selected repositories','Explicit write approval']],
 ['notion','Notion','Developer & productivity','Work with selected notes and project context.',['Selected pages','Explicit edit approval']],
 ['google','Google services','Developer & productivity','Coordinate selected documents and productivity workflows.',['Service-specific scopes','Selected files or calendars']],
 ['solana','Solana ecosystem','Crypto & Web3','Explore public on-chain information.',['Public read access','Separate approval for any future signing']],
 ['wallets','Wallets','Crypto & Web3','Inspect a user-selected public wallet address.',['Public address only','No signing in this preview']],
 ['launchpads','Launchpads','Crypto & Web3','Review public project information.',['Public project data','No trading or transfers']],
 ['onchain','On-chain services','Crypto & Web3','Connect public network context to approved workflows.',['Provider-specific read scopes','No financial execution']]
].map(([id,name,group,description,permissions])=>({id,name,group,description,permissions,status:'Coming soon'}));
export class IntegrationView{
 constructor(root){this.root=root;this.abort=new AbortController();this.selected=null;this.paths=[];this.frame=null;
  root.innerHTML=`<section class="integration-panel glass-panel"><header><div><p class="integration-eyebrow">CONNECTION ARCHITECTURE</p><h2>Extend your Mindling.</h2></div><span class="integration-status">Connector preview</span></header><div class="integration-map"><canvas class="orbit-streams" aria-hidden="true"></canvas><div class="integration-platforms" aria-label="Potential platforms">${PLATFORMS.map(p=>`<button type="button" data-platform="${p.id}" aria-pressed="false"><span class="integration-monogram" aria-hidden="true">${p.name.slice(0,1)}</span><span>${p.name}<small>${p.group}</small></span><span class="integration-dot" aria-hidden="true"></span></button>`).join('')}</div><div class="integration-hub"><div class="integration-orbit"></div><span class="integration-eyebrow">MINDLING</span><strong data-hub-name></strong><small>Identity · Knowledge · Permissions</small></div></div><section class="integration-detail" aria-live="polite"><div><span class="integration-eyebrow" data-detail-group></span><h3 data-detail-name></h3><p data-detail-description></p></div><div><h4>Permissions required</h4><ul data-detail-permissions></ul></div><div><span class="integration-status">Coming soon</span><p>No connector is available or authenticated. No permissions have been requested.</p></div></section><p class="integration-note">The orbit illustrates potential connections.</p></section>`;
  root.addEventListener('click',event=>{const button=event.target.closest('[data-platform]');if(button){const selected=PLATFORMS.find(p=>p.id===button.dataset.platform);this.selected=this.selected===selected?null:selected;this.renderSelection();}},{signal:this.abort.signal});this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.motion.addEventListener('change',()=>this.syncMotion(),{signal:this.abort.signal});document.addEventListener('visibilitychange',()=>this.syncMotion(),{signal:this.abort.signal});this.update({});this.renderSelection();this.syncMotion();this.observer=new ResizeObserver(()=>this.layoutPaths());this.observer.observe(root.querySelector('.integration-map'));
 }
 update(state){this.root.querySelector('[data-hub-name]').textContent=state.name||'Your Mindling';}
 renderSelection(){
  const platform=this.selected;
  for(const button of this.root.querySelectorAll('[data-platform]'))button.setAttribute('aria-pressed',String(button.dataset.platform===platform?.id));
  const detail=this.root.querySelector('.integration-detail');
  detail.hidden=!platform;
  if(platform){
   for(const key of ['group','name','description'])this.root.querySelector(`[data-detail-${key}]`).textContent=platform[key];
   this.root.querySelector('[data-detail-permissions]').replaceChildren(...platform.permissions.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));
  }
  if(this.visible)this.layoutPaths();
 }
 layoutPaths(){
  if(this.abort.signal.aborted)return;
  const map=this.root.querySelector('.integration-map').getBoundingClientRect();
  const hub=this.root.querySelector('.integration-hub').getBoundingClientRect();
  if(!map.width||!map.height)return;
  this.width=map.width;this.height=map.height;
  const canvas=this.root.querySelector('canvas'),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(map.width*dpr);canvas.height=Math.round(map.height*dpr);
  this.ctx=canvas.getContext('2d');this.ctx.setTransform(dpr,0,0,dpr,0,0);
  this.paths=PLATFORMS.map(platform=>{
   const button=this.root.querySelector(`[data-platform="${platform.id}"]`).getBoundingClientRect();
   return {startX:button.right-map.left,startY:button.top+button.height/2-map.top,endX:hub.left-map.left,endY:hub.top+hub.height/2-map.top,outputX:hub.right-map.left,width:Math.max(0,map.right-hub.right-10)};
  });
  this.paint(this.time||0);
 }
 paint(time){
  const ctx=this.ctx;if(!ctx)return;
  ctx.clearRect(0,0,this.width,this.height);
  const selected=PLATFORMS.indexOf(this.selected);
  this.paths.forEach(({startX,startY,endX,endY},index)=>{
   const middle=(startX+endX)/2;
   ctx.globalAlpha=index===selected?.7:.24;
   ctx.strokeStyle=streamColor(index,selected);ctx.lineWidth=index===selected?1.8:1;
   ctx.beginPath();ctx.moveTo(startX,startY);ctx.bezierCurveTo(middle,startY,middle,endY,endX,endY);ctx.stroke();
  });
  const {nodes,digits}=orbitFrame(time,this.paths,selected);
  for(const node of nodes){ctx.globalAlpha=node.opacity;ctx.fillStyle=node.color;ctx.beginPath();ctx.arc(node.x,node.y,node.radius,0,Math.PI*2);ctx.fill();}
  for(const digit of digits){ctx.globalAlpha=digit.opacity;ctx.fillStyle=digit.color;ctx.font=digit.size+'px monospace';ctx.fillText(digit.digit,digit.x,digit.y);}
  ctx.globalAlpha=1;
 }
 syncMotion(){
  const active=!!this.visible&&!document.hidden&&!this.motion.matches&&!this.abort.signal.aborted;
  this.root.classList.toggle('is-active',active);
  if(!active){cancelAnimationFrame(this.frame);this.frame=null;return;}
  if(this.frame!==null)return;
  const tick=now=>{this.time=now/1000;this.paint(this.time);this.frame=requestAnimationFrame(tick);};
  this.frame=requestAnimationFrame(tick);
 }
 setVisible(visible){this.visible=visible;this.root.hidden=!visible;if(visible)this.layoutPaths();this.syncMotion();}
 destroy(){this.visible=false;this.syncMotion();this.observer.disconnect();this.abort.abort();this.root.replaceChildren();this.ctx=null;this.paths=[];}
}
