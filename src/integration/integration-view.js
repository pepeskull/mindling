// Catalog describes potential connectors, never authentication or authorization.
export const PLATFORMS=[
 ['x','X','Social & community','Publish and review approved posts.',['Read selected posts','Publish only with approval'],'Communication'],
 ['discord','Discord','Social & community','Participate in approved community channels.',['Selected server channels','Send approved messages'],'Communication'],
 ['telegram','Telegram','Social & community','Receive updates and manage approved conversations.',['Selected chats','Send approved messages'],'Communication'],
 ['reddit','Reddit','Social & community','Explore communities and prepare contributions.',['Read selected communities','Submit approved content'],'Knowledge'],
 ['github','GitHub','Developer & productivity','Understand repositories and assist with reviewed changes.',['Selected repositories','Explicit write approval'],'Development'],
 ['notion','Notion','Developer & productivity','Work with selected notes and project context.',['Selected pages','Explicit edit approval'],'Knowledge'],
 ['google','Google services','Developer & productivity','Coordinate selected documents and productivity workflows.',['Service-specific scopes','Selected files or calendars'],'Workflows'],
 ['solana','Solana ecosystem','Crypto & Web3','Explore public on-chain information.',['Public read access','Separate approval for any future signing'],'On-chain context'],
 ['wallets','Wallets','Crypto & Web3','Inspect a user-selected public wallet address.',['Public address only','No signing in this preview'],'On-chain context'],
 ['launchpads','Launchpads','Crypto & Web3','Review public project information.',['Public project data','No trading or transfers'],'On-chain context'],
 ['onchain','On-chain services','Crypto & Web3','Connect public network context to approved workflows.',['Provider-specific read scopes','No financial execution'],'On-chain context']
].map(([id,name,group,description,permissions,capability])=>({id,name,group,description,permissions,capability,status:'Coming soon'}));
const CAPABILITIES=['Communication','Knowledge','Development','Workflows','On-chain context'];
export class IntegrationView{
 constructor(root){this.root=root;this.abort=new AbortController();this.selected=PLATFORMS[0];
  root.innerHTML=`<section class="integration-panel glass-panel"><header><div><p class="integration-eyebrow">CONNECTION ARCHITECTURE</p><h2>Extend your Mindling.</h2></div><span class="integration-status">Connector preview</span></header><div class="integration-map"><svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="integration-flow"><stop stop-color="var(--life-rest)"/><stop offset=".5" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--life-nutrition)"/></linearGradient></defs>${PLATFORMS.map((p,i)=>`<path data-flow="${p.id}" d="M 235 ${(i+.5)*600/PLATFORMS.length} C 365 ${(i+.5)*600/PLATFORMS.length}, 365 300, 500 300"/>`).join('')}${CAPABILITIES.map((c,i)=>`<path data-capability="${c}" d="M 500 300 C 650 300, 650 ${(.09+(i+.5)*.82/CAPABILITIES.length)*600}, 790 ${(.09+(i+.5)*.82/CAPABILITIES.length)*600}"/>`).join('')}</svg><div class="integration-platforms" aria-label="Potential platforms">${PLATFORMS.map(p=>`<button type="button" data-platform="${p.id}" aria-pressed="false"><span class="integration-monogram" aria-hidden="true">${p.name.slice(0,1)}</span><span>${p.name}<small>${p.group}</small></span><span class="integration-dot" aria-hidden="true"></span></button>`).join('')}</div><div class="integration-hub"><div class="integration-orbit"></div><span class="integration-eyebrow">MINDLING</span><strong data-hub-name></strong><small>Identity · Knowledge · Permissions</small></div><div class="integration-capabilities">${CAPABILITIES.map(c=>`<div data-cap-label="${c}"><span class="integration-dot"></span>${c}</div>`).join('')}</div></div><section class="integration-detail" aria-live="polite"><div><span class="integration-eyebrow" data-detail-group></span><h3 data-detail-name></h3><p data-detail-description></p></div><div><h4>Permissions required</h4><ul data-detail-permissions></ul></div><div><span class="integration-status">Coming soon</span><p>No connector is available or authenticated. No permissions have been requested.</p></div></section><p class="integration-note">Animated paths illustrate potential connections. They do not represent live data or activity.</p></section>`;
  root.addEventListener('click',event=>{const button=event.target.closest('[data-platform]');if(button){this.selected=PLATFORMS.find(p=>p.id===button.dataset.platform);this.renderSelection();}},{signal:this.abort.signal});this.update({});this.renderSelection();this.observer=new ResizeObserver(()=>this.layoutPaths());this.observer.observe(root.querySelector('.integration-map'));
 }
 update(state){this.root.querySelector('[data-hub-name]').textContent=state.name||'Your Mindling';}
 renderSelection(){const p=this.selected;for(const button of this.root.querySelectorAll('[data-platform]'))button.setAttribute('aria-pressed',String(button.dataset.platform===p.id));for(const path of this.root.querySelectorAll('[data-flow]'))path.classList.toggle('is-selected',path.dataset.flow===p.id);for(const path of this.root.querySelectorAll('[data-capability]'))path.classList.toggle('is-selected',path.dataset.capability===p.capability);for(const label of this.root.querySelectorAll('[data-cap-label]'))label.classList.toggle('is-selected',label.dataset.capLabel===p.capability);
  for(const [key,value]of [['group',p.group],['name',p.name],['description',p.description]])this.root.querySelector(`[data-detail-${key}]`).textContent=value;
  const list=this.root.querySelector('[data-detail-permissions]');list.replaceChildren(...p.permissions.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));
 }
 layoutPaths(){
  if(this.abort.signal.aborted)return;
  const map=this.root.querySelector('.integration-map').getBoundingClientRect(),hub=this.root.querySelector('.integration-hub').getBoundingClientRect();if(!map.width||!map.height)return;
  const x=v=>(v-map.left)*1000/map.width,y=v=>(v-map.top)*600/map.height,hy=y(hub.top+hub.height/2),left=x(hub.left),right=x(hub.right);
  for(const path of this.root.querySelectorAll('[data-flow]')){
   const node=this.root.querySelector('[data-platform="'+path.dataset.flow+'"]').getBoundingClientRect(),sx=x(node.right),sy=y(node.top+node.height/2),cx=(sx+left)/2;
   path.setAttribute('d',`M ${sx} ${sy} C ${cx} ${sy}, ${cx} ${hy}, ${left} ${hy}`);
  }
  for(const path of this.root.querySelectorAll('[data-capability]')){
   const node=[...this.root.querySelectorAll('[data-cap-label]')].find(n=>n.dataset.capLabel===path.dataset.capability).getBoundingClientRect(),ex=x(node.left),ey=y(node.top+node.height/2),cx=(right+ex)/2;
   path.setAttribute('d',`M ${right} ${hy} C ${cx} ${hy}, ${cx} ${ey}, ${ex} ${ey}`);
  }
 }
 setVisible(visible){this.root.hidden=!visible;this.root.classList.toggle('is-active',visible);if(visible)this.layoutPaths();}
 destroy(){this.observer.disconnect();this.abort.abort();this.root.replaceChildren();}
}
