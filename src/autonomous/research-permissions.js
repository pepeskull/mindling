import { INFORMATION_CAPABILITY } from './research-contract.js';
// Preserve historical grants, but never silently reuse consent for a different capability.
export const permissionKey=id=>`mindling-autonomous-access:${id}`;
export const defaultPermissions=id=>({id:permissionKey(id),version:1,mindlingId:id,capability:INFORMATION_CAPABILITY,enabled:false,decided:false,updatedAt:0,revision:0});
export function validatePermissions(value,id){
  if(!value)return defaultPermissions(id);
  const fallback=defaultPermissions(id);
  if(value.id!==fallback.id||value.version!==1||value.mindlingId!==id||value.capability!==INFORMATION_CAPABILITY||typeof value.enabled!=='boolean'||typeof value.decided!=='boolean'||!Number.isSafeInteger(value.updatedAt)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Autonomous learning access could not be read. Access remains disabled.');
  return value;
}
export function assertResearchGrant(grant,records){
  if(!grant)return;
  const prefs=validatePermissions(records.find(record=>record.id===permissionKey(grant.mindlingId)),grant.mindlingId);
  if(!prefs.enabled||grant.capability!==INFORMATION_CAPABILITY||grant.revision!==prefs.revision)throw Error('Autonomous learning was disabled or authorization changed. No result was saved.');
}
export function loadResearchPermissions(db,preview,id){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readonly'),request=tx.objectStore(preview?'sandbox':'settings').get(permissionKey(id));
  tx.oncomplete=()=>{try{resolve(validatePermissions(request.result,id));}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>reject(Error('Autonomous learning access could not be read.'));
});}
export function saveResearchPermissions(db,preview,id,choice){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readwrite'),store=tx.objectStore(preview?'sandbox':'settings'),request=store.get(permissionKey(id));let result,failure;
  request.onsuccess=()=>{try{
    if(typeof choice?.enabled!=='boolean')throw Error('Choose whether to enable autonomous learning.');
    const previous=validatePermissions(request.result,id);result={...defaultPermissions(id),enabled:choice.enabled,decided:true,updatedAt:Date.now(),revision:previous.revision+1};
    if(preview)store.put(result,permissionKey(id));else store.put(result);
  }catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure||Error('Autonomous learning access could not be saved.'));
});}
