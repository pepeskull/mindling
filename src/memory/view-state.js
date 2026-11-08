// Separate, identity-scoped UI preferences. Never writes gameplay or memories.
export function cleanView(value={}){
 const finite=n=>Number.isFinite(n)&&Math.abs(n)<1e7;
 return {positions:Object.fromEntries(Object.entries(value.positions||{}).slice(0,5000).filter(([id,p])=>id.startsWith('area:')&&finite(p?.x)&&finite(p?.y)).map(([id,p])=>[id,{x:p.x,y:p.y}])),zoom:finite(value.zoom)&&value.zoom>0?Math.min(8,value.zoom):1,pan:finite(value.pan?.x)&&finite(value.pan?.y)?value.pan:{x:0,y:0},autoFit:value.autoFit!==false,taskQuery:String(value.taskQuery||'').slice(0,160),taskFilter:['all','actionable','active','completed'].includes(value.taskFilter)?value.taskFilter:'all',taskPage:Math.max(0,Math.min(10000,Math.floor(value.taskPage)||0)),page:Math.max(0,Math.min(10000,Math.floor(value.page)||0)),selected:typeof value.selected==='string'?value.selected.slice(0,512):null,tasksOpen:value.tasksOpen===true,browseOpen:value.browseOpen===true};
}
export function memoryViewStore(db,preview,id,value){
 const table=preview?'sandbox':'settings',key=`memory-view:${id}`;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(preview?['sandbox']:value?['settings','gameplay']:['settings'],value?'readwrite':'readonly'),store=tx.objectStore(table),r=store.get(key);let result,error;
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Memory view could not be saved.'));
  if(!value){r.onsuccess=()=>{result=r.result||null;};return;}
  const state=tx.objectStore(preview?'sandbox':'gameplay').get(preview?'state':'primary');let pending=2;
  const apply=()=>{if(--pending)return;try{
   const mind=(preview?state.result:state.result?.state)?.mind;
   if(mind?.id!==id||(mind.knowledgeHierarchy?.revision||0)!==value.hierarchyRevision)throw Error('View belongs to an earlier knowledge hierarchy.');
   if((r.result?.revision||0)!==(value.revision||0))throw Error('View changed in another tab.');
   result={id:key,version:1,revision:(r.result?.revision||0)+1,hierarchyRevision:value.hierarchyRevision,...cleanView(value)};
   preview?store.put(result,key):store.put(result);
  }catch(e){error=e;tx.abort();}};r.onsuccess=state.onsuccess=apply;
 });
}
