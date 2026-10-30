import { RESEARCH_CAPABILITY, INFORMATION_CAPABILITY } from './research-contract.js';
export const permissionKey=id=>`mindling-planning-access:${id}`;
export const informationPermissionKey=id=>`mindling-information-access:${id}`;
const emptyInformation=id=>({id:informationPermissionKey(id),version:1,mindlingId:id,capability:INFORMATION_CAPABILITY,enabled:false,decided:false,updatedAt:0,revision:0});
export const defaultPermissions=id=>({id:permissionKey(id),version:1,mindlingId:id,capability:RESEARCH_CAPABILITY,enabled:false,decided:false,updatedAt:0,revision:0,information:emptyInformation(id)});
function check(value,id,information=false){
  const fallback=information?emptyInformation(id):defaultPermissions(id);if(!value)return fallback;
  if(value.id!==fallback.id||value.version!==1||value.mindlingId!==id||value.capability!==fallback.capability||typeof value.enabled!=='boolean'||typeof value.decided!=='boolean'||!Number.isSafeInteger(value.updatedAt)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Research access could not be read. Access remains disabled.');return value;
}
export function validatePermissions(value,id){const planning=check(value,id);return {...planning,information:check(value?.information,id,true)};}
export function assertResearchGrant(grant,records){
  if(!grant)return;const prefs=check(records.find(record=>record.id===permissionKey(grant.mindlingId)),grant.mindlingId);
  if(!prefs.enabled||grant.capability!==RESEARCH_CAPABILITY||grant.revision!==prefs.revision)throw Error('Research access changed or was revoked. No result was saved.');
  if(grant.informationRevision!==undefined){const info=check(records.find(record=>record.id===informationPermissionKey(grant.mindlingId)),grant.mindlingId,true);if(!info.enabled||info.revision!==grant.informationRevision)throw Error('Information access changed or was revoked. No knowledge was saved.');}
}
export function loadResearchPermissions(db,preview,id){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readonly'),store=tx.objectStore(preview?'sandbox':'settings'),planning=store.get(permissionKey(id)),information=store.get(informationPermissionKey(id));
  tx.oncomplete=()=>{try{resolve(validatePermissions({...check(planning.result,id),information:check(information.result,id,true)},id));}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>reject(Error('Research access could not be read.'));
});}
export function saveResearchPermissions(db,preview,id,choice){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readwrite'),store=tx.objectStore(preview?'sandbox':'settings'),planning=store.get(permissionKey(id)),information=store.get(informationPermissionKey(id));let result,failure,pending=2;
  const ready=()=>{if(--pending)return;try{
    if(typeof choice?.enabled!=='boolean'||choice.informationEnabled!==undefined&&typeof choice.informationEnabled!=='boolean')throw Error('Choose which research capabilities to allow.');
    const previous=check(planning.result,id),priorInfo=check(information.result,id,true),{information:unused,...base}=defaultPermissions(id);
    const next={...base,enabled:choice.enabled,decided:true,updatedAt:Date.now(),revision:previous.revision+1};if(preview)store.put(next,permissionKey(id));else store.put(next);
    let info=priorInfo;if(choice.informationEnabled!==undefined){info={...emptyInformation(id),enabled:choice.informationEnabled,decided:true,updatedAt:Date.now(),revision:priorInfo.revision+1};if(preview)store.put(info,informationPermissionKey(id));else store.put(info);}
    result={...next,information:info};
  }catch(error){failure=error;tx.abort();}};planning.onsuccess=ready;information.onsuccess=ready;
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure||Error('Research access could not be saved.'));
});}
