import { ExternalVisit, CameraTrip, eligible } from './public-network.js';
import { REMOTE_CENTERS, REMOTE_SCALE } from '../preview/evolution-scene.js';
import { presentationFor } from '../preview/dashboard-presentation.js';

// Transient presentation state only: neither production nor sandbox storage is read here.
export class ExternalView {
  visit = new ExternalVisit();
  constructor(app) {
    this.app=app;this.root=document.querySelector('#app');this.root.dataset.viewState='NORMAL_VIEW';
    this.panel=document.createElement('section');this.panel.className='external-view glass-panel';this.panel.hidden=true;
    this.panel.setAttribute('aria-label','External Mindling');
    this.panel.innerHTML='<strong>EXTERNAL VIEW · Read-only</strong><h2 aria-live="polite"></h2><p data-public></p><p data-source></p><dl></dl><p data-connections></p><button type="button">Return to My Mindling</button>';
    this.returnButton=this.panel.querySelector('button');this.returnButton.addEventListener('click',()=>this.returnHome());
    this.root.append(this.panel);
    this.notice=document.createElement('nav');this.notice.className='network-visits';this.notice.setAttribute('aria-label','Demo Agent Mind connections');this.root.append(this.notice);
    this.buttons=Array.from({length:3},()=>{const button=document.createElement('button');button.type='button';button.addEventListener('click',()=>this.enter(button.dataset.id));this.notice.append(button);return button;});
    this.caption=document.createElement('small');this.caption.textContent='Demo network · no live player discovery';this.notice.prepend(this.caption);
    this.block=event=>{if(this.locked&&!this.panel.contains(event.target)&&!this.notice.contains(event.target)&&!app.host.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}};
    for(const event of ['click','submit','keydown','change'])document.addEventListener(event,this.block,true);
    app.view.onVisit=id=>this.enter(id);
  }
  get locked(){return this.visit.locked;}
  assertWritable(){this.visit.assertWritable();}
  owner(){const m=this.app.state?.mind;return this.app.state?m&&{id:m.id,stage:m.stage,lifeState:m.life.lifeState}:{stage:this.app.timeline.stage};}
  tap(event){const id=this.app.view.pickPeer(event);if(id)this.enter(id);return Boolean(id)||this.locked;}
  pose(){return {focus:[...this.app.view.focus],scale:this.app.view.focusScale};}
  lockControls() {
    this.savedFocus=document.activeElement;
    this.memoryMode=this.root.classList.contains('memory-mode');this.root.classList.remove('memory-mode');
    this.overlays=[...this.root.querySelectorAll('#memory-view,#network-view,#neural-inspector')].map(node=>[node,node.hidden]);
    for(const [node] of this.overlays)node.hidden=true;
    this.controls=[...this.root.children].filter(node=>![this.panel,this.notice,this.app.host].includes(node)).map(node=>[node,node.inert]);
    for(const [node] of this.controls){node.inert=true;node.classList.add('external-dim');}
    this.disabled=[...this.root.querySelectorAll('button,input,select,textarea')].filter(node=>!this.panel.contains(node)&&!this.notice.contains(node)&&!this.app.host.contains(node)).map(node=>[node,node.disabled]);
    for(const [node] of this.disabled)node.disabled=true;
    this.app.dashboard.locked=true;this.root.dataset.viewState='EXTERNAL_VIEW';
  }
  enter(id) {
    const a=this.app,n=a.timeline.network,index=n.peers.findIndex(peer=>peer.id===id);
    const peers=presentationFor(a.timeline,a.view.morph).peers;
    const first=!this.locked, source=this.visit.selected;
    if(!this.visit.enter(id,{owner:this.owner(),connectedIds:peers.filter(p=>p.connected).map(p=>p.id),busy:Boolean(a.busy||a.pendingMutations||document.querySelector('dialog[open]'))}))return false;
    this.source=source;
    if(first){
      this.savedNetwork=structuredClone({ownerStage:n.ownerStage,state:n.state,elapsed:n.elapsed,fade:n.fade,stopping:n.stopping,peers:n.peers});
      this.savedPose=a.interaction.capturePose();this.savedSelection=a.view.selectedCanonical;this.entryCenter=[...REMOTE_CENTERS[index]];this.lockControls();
    }
    a.view.selectedCanonical=null;this.returning=false;this.panel.hidden=false;this.showNode();
    a.interaction.locked=true;
    this.trip=new CameraTrip(this.pose(),{focus:REMOTE_CENTERS[index],scale:1/REMOTE_SCALE},{reduced:a.motion.matches});
    this.returnButton.focus();return true;
  }
  showNode(){
    const node=this.visit.graph.get(this.visit.selected);if(!node)return;
    this.panel.querySelector('h2').textContent=`${node.name} · Agent Mind`;
    this.panel.querySelector('[data-public]').textContent=`Public identity: ${node.publicIdentity||'Unavailable'}`;
    this.panel.querySelector('[data-source]').textContent=node.demo?'Demo brain and simulated public status. No live player data.':'Public network information';
    this.panel.querySelector('dl').replaceChildren(...['health','nutrition','rest','wellbeing','neuralStability'].flatMap(key=>{
      const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=key==='neuralStability'?'Neural Stability':key[0].toUpperCase()+key.slice(1);value.textContent=node.life[key]===undefined?'Unavailable':`${node.life[key]}%`;return [term,value];
    }));
    const connections=this.visit.graph.connections(node.id);
    this.panel.querySelector('[data-connections]').textContent=connections.length?`Known connections: ${connections.map(n=>n.name).join(', ')}`:'No known connections';
  }
  returnHome(immediate=false){
    if(!this.locked||this.returning)return;
    const a=this.app;this.returning=true;this.visit.transitioning=true;a.interaction.locked=true;
    if(this.externalGraph){Object.assign(a.timeline.network,structuredClone(this.savedNetwork));a.view.focus=[...this.entryCenter];a.view.focusScale=1/REMOTE_SCALE;this.externalGraph=false;}
    this.trip=new CameraTrip(this.pose(),{focus:[0,0,0],scale:1},{reduced:immediate||a.motion.matches});
    this.returnFromPose=a.interaction.capturePose();
  }
  tick(delta){
    const a=this.app;
    if(this.locked&&!this.returning&&(!this.visit.valid(this.owner())||a.timeline.network.stopping||(this.source&&!this.visit.graph.connections(this.source).some(node=>node.id===this.visit.selected))))this.returnHome(true);
    if(!this.trip)return;
    if(a.motion.matches)this.trip.duration=0;
    const pose=this.trip.tick(delta);a.view.focus=pose.focus;a.view.focusScale=pose.scale;
    if(this.returning){
      const t=this.trip.duration?Math.min(1,this.trip.elapsed/this.trip.duration):1,b=t*t*(3-2*t),from=this.returnFromPose,to=this.savedPose;
      a.interaction.restorePose({rotation:{x:from.rotation.x+(to.rotation.x-from.rotation.x)*b,y:from.rotation.y+(to.rotation.y-from.rotation.y)*b},zoom:from.zoom+(to.zoom-from.zoom)*b,targetZoom:to.targetZoom});
    }
    if(!this.trip.done)return;
    this.trip=null;
    if(this.returning){this.restore();return;}
    // Rebase the visited Agent Mind to the origin using the same morphology.
    a.view.focus=[0,0,0];a.view.focusScale=1;
    a.timeline.network.configure(7,this.visit.graph.connections(this.visit.selected));a.timeline.network.start();
    this.externalGraph=true;this.visit.settled();a.interaction.locked=false;
  }
  restore(){
    const a=this.app;Object.assign(a.timeline.network,structuredClone(this.savedNetwork));
    a.view.focus=[0,0,0];a.view.focusScale=1;a.view.selectedCanonical=this.savedSelection;a.interaction.restorePose(this.savedPose);a.interaction.locked=false;
    this.root.classList.toggle('memory-mode',this.memoryMode);
    for(const [node,hidden] of this.overlays)node.hidden=hidden;
    for(const [node,inert] of this.controls){node.inert=inert;node.classList.remove('external-dim');}
    for(const [node,disabled] of this.disabled)node.disabled=disabled;
    a.dashboard.locked=false;this.root.dataset.viewState='NORMAL_VIEW';this.panel.hidden=true;this.visit.exit();this.returning=false;this.externalGraph=false;
    this.savedFocus?.focus?.();
  }
  refresh(){
    const a=this.app,peers=presentationFor(a.timeline,a.view.morph).peers;
    a.view.updateLabels(peers);this.notice.hidden=!eligible(this.owner());
    this.buttons.forEach((button,index)=>{const peer=peers[index];button.hidden=!peer?.id;button.textContent=peer?.name||'';button.dataset.id=peer?.id||'';button.disabled=!peer?.connected||this.visit.transitioning;});
    a.host.dataset.network=a.timeline.network.state;
    if(!this.locked)document.querySelector('#network-view span').textContent=eligible(this.owner())?'Demo Agent Mind network. Select a connected name to visit. Live player discovery is unavailable.':'Network participation requires Agent Mind.';
  }
  destroy(){if(this.locked)this.restore();for(const event of ['click','submit','keydown','change'])document.removeEventListener(event,this.block,true);this.panel.remove();this.notice.remove();}
}
