export const PREVIEW_DB='mindling-preview-m4';
export class PreviewStore {
  async open() {
    this.db=await new Promise((resolve,reject)=>{let abandoned=false;const r=indexedDB.open(PREVIEW_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('sandbox');r.onsuccess=()=>{if(abandoned)r.result.close();else resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>{abandoned=true;reject(Error('Close other preview tabs to upgrade'));};});
    this.db.onversionchange=()=>this.close();return this;
  }
  async read() { return new Promise((resolve,reject)=>{const r=this.db.transaction('sandbox').objectStore('sandbox').get('state');r.onsuccess=()=>{if(abandoned)r.result.close();else resolve(r.result);};r.onerror=()=>reject(r.error);}); }
  async change(reducer) {
    return new Promise((resolve,reject)=>{const tx=this.db.transaction('sandbox','readwrite'),store=tx.objectStore('sandbox'),r=store.get('state');let next,error;
      r.onsuccess=()=>{try{if(r.result&&r.result.version!==1)throw Error('Unsupported preview schema; export before resetting');next=reducer(r.result);next.revision=(r.result?.revision||0)+1;store.put(next,'state');}catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve(next);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Preview save failed'));
    });
  }
  close(){this.db?.close();}
}
