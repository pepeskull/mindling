// Authorization is shown only from persisted permissions, never from a draft.
export class ResearchAccess {
 constructor(host,{getState,onSave,canAct=()=>true}){
  this.getState=getState;this.onSave=onSave;this.canAct=canAct;this.abort=new AbortController();
  this.root=document.createElement('div');this.root.className='research-access-switch';
  this.root.innerHTML='<button type="button" role="switch" aria-checked="false" aria-describedby="research-consent">Research Off</button><p id="research-consent">Turning on authorizes public-topic AI research while the app is active. Additional API costs may apply. Existing budgets and privacy restrictions remain in force.</p><p role="status"></p>';
  this.save=this.root.querySelector('button');this.status=this.root.querySelector('[role="status"]');host.append(this.root);
  this.save.addEventListener('click',()=>this.commit(),{signal:this.abort.signal});this.refresh();
 }
 refresh(){const state=this.getState(),p=state?.researchPermissions;this.ready=Boolean(p)&&p.loaded!==false;this.enabled=this.ready&&p.enabled===true;
  this.save.textContent=this.enabled?'Research On':'Research Off';this.save.setAttribute('aria-checked',String(this.enabled));this.save.disabled=!this.ready||this.busy||!this.onSave||!this.canAct();
  if(this.identity!==state?.mindlingId){this.identity=state?.mindlingId;this.status.textContent='';}
 }
 async commit(){if(this.save.disabled||!this.canAct())return;const identity=this.getState()?.mindlingId,enabled=!this.enabled;this.busy=true;this.refresh();this.status.textContent='Saving…';
  try{await this.onSave(enabled);if(this.abort.signal.aborted||identity!==this.getState()?.mindlingId)return;this.status.textContent='Authorization saved.';}
  catch{if(identity===this.getState()?.mindlingId)this.status.textContent='Could not save. Existing authorization is unchanged.';}
  finally{this.busy=false;if(!this.abort.signal.aborted)this.refresh();}
 }
 destroy(){this.abort.abort();this.root.remove();}
}
