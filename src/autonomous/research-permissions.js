import { RESEARCH_CAPABILITY } from './research-contract.js';
// A new capability-scoped key deliberately does not read former source grants.
// Historical settings remain intact and never authorize this inference use.
export const permissionKey=id=>`mindling-planning-access:${id}`;
export const defaultPermissions=id=>({id:permissionKey(id),version:1,mindlingId:id,capability:RESEARCH_CAPABILITY,enabled:false,decided:false,updatedAt:0,revision:0});
export function validatePermissions(value,id){
  if(!value)return defaultPermissions(id);
  if(value.id!==permissionKey(id)||value.version!==1||value.mindlingId!==id||value.capability!==RESEARCH_CAPABILITY||typeof value.enabled!=='boolean'||typeof value.decided!=='boolean'||!Number.isSafeInteger(value.updatedAt)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Research access could not be read. Access remains disabled.');
  return value;
}
export function assertResearchGrant(grant,records){
  if(!grant)return;
  const prefs=validatePermissions(records.find(record=>record.id===permissionKey(grant.mindlingId)),grant.mindlingId);
  if(!prefs.enabled||grant.capability!==RESEARCH_CAPABILITY||grant.revision!==prefs.revision)throw Error('Research access changed or was revoked. No result was saved.');
}
export function loadResearchPermissions(db,preview,id){return new Promise((resolve,reject)=>{const tx=db.transaction(preview?'sandbox':'settings','readonly'),request=tx.objectStore(preview?'sandbox':'settings').get(permissionKey(id));tx.oncomplete=()=>{try{resolve(validatePermissions(request.result,id));}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>reject(Error('Research access could not be read.'));});}
export function saveResearchPermissions(db,preview,id,choice){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readwrite'),store=tx.objectStore(preview?'sandbox':'settings'),request=store.get(permissionKey(id));let result,failure;
  request.onsuccess=()=>{try{if(typeof choice?.enabled!=='boolean')throw Error('Choose whether to allow Mindling planning.');const previous=validatePermissions(request.result,id);result={...defaultPermissions(id),enabled:choice.enabled,decided:true,updatedAt:Date.now(),revision:previous.revision+1};if(preview)store.put(result,permissionKey(id));else store.put(result);}catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure||Error('Research access could not be saved.'));
});}
