import { DISCOVERY_PROVIDERS } from './source-discovery.js';
export const permissionKey=id=>`research-access:${id}`;
export const defaultPermissions=id=>({id:permissionKey(id),version:1,mindlingId:id,mode:'disabled',providers:[],updatedAt:0,revision:0});
export function validatePermissions(value,id){
  if(!value)return defaultPermissions(id);
  if(value.id!==permissionKey(id)||value.version!==1||value.mindlingId!==id||!['disabled','ask','automatic'].includes(value.mode)||!Array.isArray(value.providers)||value.providers.length>DISCOVERY_PROVIDERS.length||new Set(value.providers).size!==value.providers.length||value.providers.some(provider=>!DISCOVERY_PROVIDERS.some(item=>item.id===provider))||!Number.isSafeInteger(value.updatedAt)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Research permissions could not be validated. Research remains disabled.');
  return value;
}
export function allowsProvider(value,provider){return value.mode!=='disabled'&&value.providers.includes(provider);}
export function assertResearchGrant(grant,records){
  if(!grant)return;
  const prefs=validatePermissions(records.find(record=>record.id===permissionKey(grant.mindlingId)),grant.mindlingId);
  if(prefs.mode==='disabled'||grant.revision!==prefs.revision||grant.providers.some(provider=>!allowsProvider(prefs,provider)))throw Error('Research permission changed or was revoked. No research knowledge was committed.');
}
export function loadResearchPermissions(db,preview,id){return new Promise((resolve,reject)=>{const tx=db.transaction(preview?'sandbox':'settings','readonly'),request=tx.objectStore(preview?'sandbox':'settings').get(permissionKey(id));tx.oncomplete=()=>{try{resolve(validatePermissions(request.result,id));}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>reject(Error('Research permissions could not be read.'));});}
export function saveResearchPermissions(db,preview,id,choice){return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?'sandbox':'settings','readwrite'),store=tx.objectStore(preview?'sandbox':'settings'),request=store.get(permissionKey(id));let result,failure;
  request.onsuccess=()=>{try{const previous=validatePermissions(request.result,id);result=validatePermissions({...defaultPermissions(id),mode:choice.mode,providers:[...choice.providers],updatedAt:Date.now(),revision:previous.revision+1},id);if(preview)store.put(result,permissionKey(id));else store.put(result);}catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure||Error('Research permissions could not be saved.'));
});}
