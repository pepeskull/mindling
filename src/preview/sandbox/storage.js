import { reconcileEvolution } from './engine.js';
import { loadTraining, saveTraining, trainingSource } from '../../training/persistence.js';
import { loadResearchPermissions, saveResearchPermissions, assertResearchGrant } from '../../autonomous/research-permissions.js';
export const PREVIEW_DB='mindling-preview-m4';
export class PreviewStore {
  async open() {
    this.db=await new Promise((resolve,reject)=>{let abandoned=false;const r=indexedDB.open(PREVIEW_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('sandbox');r.onsuccess=()=>{if(abandoned)r.result.close();else resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>{abandoned=true;reject(Error('Close other preview tabs to upgrade'));};});
    this.db.onversionchange=()=>this.close();return this;
  }
  trainingSource(mindId) { return trainingSource(this.db, true, mindId); }
  trainingHistory(mindId) { return loadTraining(this.db, true, mindId); }
  saveTraining(record) { return saveTraining(this.db, true, record); }
  researchPermissions(id){return loadResearchPermissions(this.db,true,id);}
  saveResearchPermissions(id,choice){return saveResearchPermissions(this.db,true,id,choice);}
  async read() { return new Promise((resolve,reject)=>{const r=this.db.transaction('sandbox').objectStore('sandbox').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
  async change(reducer,{researchGrant=null}={}) {
    return new Promise((resolve,reject)=>{const tx=this.db.transaction('sandbox','readwrite'),store=tx.objectStore('sandbox'),r=store.get('state');let next,error;
      const apply=()=>{try{if(researchGrant)assertResearchGrant(researchGrant,permissionRequest.result||[]);if(r.result&&r.result.version!==1)throw Error('Unsupported preview schema; export before resetting');const previousMind=r.result?.mind;
        const previousId=previousMind?.id;
        const knownEvents=new Set((previousMind?.history||[]).map(event=>event.id));
        const previousStages=previousMind?.stageHistory?.length||0;
        next=reconcileEvolution(reducer(structuredClone(r.result)));
        // Keep simulation timestamps for gameplay; add real save time only to new records.
        const recordedAt=Date.now(),sameMind=next.mind?.id===previousId;
        for(const event of next.mind?.history||[])if(!sameMind||!knownEvents.has(event.id))event.recordedAt=recordedAt;
        for(const event of (next.mind?.stageHistory||[]).slice(sameMind?previousStages:0))event.recordedAt=recordedAt;
        next.revision=(r.result?.revision||0)+1;store.put(next,'state');}catch(e){error=e;tx.abort();}};
      let pending=researchGrant?2:1;const ready=()=>{if(!--pending)apply();};let permissionRequest;
      r.onsuccess=ready;if(researchGrant){permissionRequest=store.getAll();permissionRequest.onsuccess=ready;}
      tx.oncomplete=()=>resolve(next);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Preview save failed'));
    });
  }
  close(){this.db?.close();}
}
