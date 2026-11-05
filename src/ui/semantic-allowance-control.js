// Settings draft and confirmed value stay separate. This controller never writes
// storage itself; the existing engine API commits and recovers deferred work.
export function bindSemanticAllowance(root,{getState,onSave,listen,alive=()=>true,onPending=()=>{}}){
 const select=root.querySelector('[data-semantic-allowance]'),save=root.querySelector('[data-save-semantic]'),status=root.querySelector('[data-semantic-saved]'),feedback=root.querySelector('[data-semantic-feedback]');
 let pending=false,externalBusy=false,lastIdentity=null,lastReady=false;
 const refresh=(resetDraft=false)=>{
  const state=getState(),prefs=state?.researchPermissions,ready=Boolean(state?.mindlingId&&prefs)&&prefs.loaded!==false;
  const allowance=prefs?.semanticCallsPerDay??0;
  status.textContent=ready?`Saved allowance: ${allowance} extra calls per UTC day.${prefs?.enabled?'':' Autonomous learning is disabled; no calls will run.'}`:'Loading saved allowance…';
  if((resetDraft||lastIdentity!==state?.mindlingId||ready&&!lastReady)&&!pending){select.value=String(allowance);feedback.textContent='';}
  lastIdentity=state?.mindlingId;lastReady=ready;
  select.disabled=save.disabled=pending||externalBusy||!ready||!onSave;
 };
 const submit=async()=>{
  if(pending||save.disabled)return;
  const identity=getState()?.mindlingId,value=Number(select.value);if(!Number.isInteger(value)||value<0||value>3)return;
  pending=true;onPending(true);refresh();feedback.textContent='Saving…';
  const current=()=>alive()&&getState()?.mindlingId===identity;
  try{const prefs=await onSave(value);if(!current())return;
   // The returned value is confirmed by the storage transaction, never the draft.
   status.textContent=`Saved allowance: ${prefs.semanticCallsPerDay} extra calls per UTC day.${prefs.enabled?'':' Autonomous learning is disabled; no calls will run.'}`;
   select.value=String(prefs.semanticCallsPerDay);feedback.textContent='Extra semantic analysis saved.';
  }catch(error){if(current())feedback.textContent=error.message||'The allowance could not be saved.';}
  finally{pending=false;onPending(false);if(current()){select.disabled=save.disabled=externalBusy||!onSave;}}
 };
 listen(save,'click',submit);refresh(true);return {refresh,setBusy(value){externalBusy=value;refresh();}};
}
