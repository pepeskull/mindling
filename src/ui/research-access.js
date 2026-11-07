// Compact consent/revocation only. Existing grants, budgets and allowances are
// never overwritten when displaying the preselected choice for a new identity.
export class ResearchAccess {
 constructor(host,{getState,onSave,canAct=()=>true}){
  this.getState=getState;this.onSave=onSave;this.canAct=canAct;this.abort=new AbortController();this.dialog=document.createElement('dialog');this.dialog.className='research-access';this.dialog.setAttribute('aria-labelledby','research-access-title');
  this.dialog.innerHTML='<h2 id="research-access-title">Research access</h2><label><input type="checkbox" data-research-enabled> Enable autonomous learning</label><p>Mindling can research public topics while the app is active. AI inference and hosted web search may incur API costs. Private identity keys and wallet data are not shared.</p><p>Existing daily reservations, task limits, cooldowns and Energy readiness still apply. Disabling prevents new research and memory integration.</p><p data-access-limits></p><p data-access-status role="status"></p><div class="clarification-choices"><button type="button" data-save-research>Save access choice</button><button type="button" data-close-research>Close</button></div>';
  this.choice=this.dialog.querySelector('input');this.save=this.dialog.querySelector('[data-save-research]');this.status=this.dialog.querySelector('[data-access-status]');host.append(this.dialog);
  this.dialog.querySelector('[data-close-research]').addEventListener('click',()=>this.close(),{signal:this.abort.signal});
  this.save.addEventListener('click',()=>this.commit(),{signal:this.abort.signal});
 }
 open(){if(!this.canAct())return;this.identity=this.getState()?.mindlingId;this.refresh(true);this.dialog.showModal();}
 close(){this.dialog.close();}
 refresh(reset=false){const state=this.getState(),p=state?.researchPermissions,ready=Boolean(p)&&p.loaded!==false;
  if(this.dialog.open&&this.identity!==state?.mindlingId)this.close();
  if((reset||ready&&!this.ready)&&!this.busy){this.choice.checked=ready&&(p.decided?p.enabled:true);this.status.textContent=ready?(p.enabled?'Research is enabled.':p.decided?'Research is disabled.':'Consent required. The preselected choice is not active until saved.'):'Loading research authorization…';}
  this.ready=ready;
  this.choice.disabled=this.save.disabled=!ready||this.busy||!this.onSave;
  this.dialog.querySelector('[data-access-limits]').textContent=ready?`Saved limits: ${p.automaticRequestLimit??12} inference reservations and ${p.semanticCallsPerDay??0} extra semantic calls per UTC day. Reservations are ceilings, not billed usage.`:'';
 }
 async commit(){if(this.save.disabled||!this.canAct())return;const identity=this.getState()?.mindlingId;this.busy=true;this.refresh();this.status.textContent='Saving…';
  try{const p=await this.onSave(this.choice.checked);if(this.abort.signal.aborted||identity!==this.getState()?.mindlingId)return;this.choice.checked=p.enabled;this.status.textContent=p.enabled?'Research access saved and enabled.':'Research access saved and disabled.';}
  catch{if(identity===this.getState()?.mindlingId)this.status.textContent='The choice could not be saved. Existing authorization is unchanged.';}
  finally{this.busy=false;if(!this.abort.signal.aborted)this.refresh();}
 }
 destroy(){this.abort.abort();this.close();this.dialog.remove();}
}
