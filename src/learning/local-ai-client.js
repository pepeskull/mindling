import { memoryBasis, indexedEntry, migrateIndex } from './intelligence-index.js';
export class LocalIntelligence {
  ready=false;pending=new Map();sequence=0;
  constructor(app){
    this.app=app;this.panel=document.createElement('details');this.panel.className='local-intelligence glass-panel';
    this.panel.innerHTML='<summary>Local intelligence</summary><p data-ai-status role="status">Native lexical fallback active. Pretrained models are off.</p><p>Experimental browser-local analysis. About 650 MB of model/tokenizer files, plus runtime assets. Downloads require internet; input stays on this device. Model accuracy is not yet qualified.</p><button type="button" data-ai-enable>Download and enable local AI</button><button type="button" data-ai-index disabled>Organize next 3 saved memories</button><button type="button" data-ai-off disabled>Use native fallback</button>';
    document.querySelector('.dashboard-chrome').append(this.panel);
    this.panel.querySelector('[data-ai-enable]').addEventListener('click',()=>this.enable());
    this.panel.querySelector('[data-ai-off]').addEventListener('click',()=>{if(!app.external?.locked)this.disable();});
    this.panel.querySelector('[data-ai-index]').addEventListener('click',()=>this.reindex());
  }
  status(text){this.panel.querySelector('[data-ai-status]').textContent=text;}
  request(action,payload,timeout=120000){
    return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('LOCAL_MODEL_TIMEOUT'));this.stopWorker();},timeout);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,action,payload});});
  }
  async enable(){
    if(this.disposed||this.app.external?.locked||this.loading||this.ready)return;
    this.loading=true;this.status('Downloading local models. No learning content is sent.');this.panel.querySelector('[data-ai-enable]').disabled=true;
    try{
      if(!globalThis.Worker||!navigator.serviceWorker||!globalThis.caches)throw Error('LOCAL_RUNTIME_UNSUPPORTED');
      await navigator.serviceWorker.register('/local-ai-cache.js');await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CACHE_UNAVAILABLE')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
      if(this.disposed)throw Error('DISPOSED');
      this.worker=new Worker(new URL('./local-ai-worker.js',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{if(data.progress!==undefined){this.status(`Caching model assets: ${data.progress}% of current file.`);return;}const item=this.pending.get(data.id);if(!item)return;this.pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(Error(data.error)):item.resolve(data.result);};
      this.worker.onerror=()=>this.stopWorker();
      const result=await this.request('init',null,600000);this.ready=true;
      this.status(`Local AI ready (${result.backend}). Experimental classification; claims are not fact-checked. Cached assets support offline inference while this application is open.`);
      this.panel.querySelector('[data-ai-index]').disabled=false;this.panel.querySelector('[data-ai-off]').disabled=false;
    }catch{this.stopWorker();this.status('Local AI could not load. Native lexical fallback remains active; no semantic AI analysis is claimed.');}
    finally{this.loading=false;this.panel.querySelector('[data-ai-enable]').disabled=this.ready;}
  }
  async prepare(text,mind){
    if(!this.ready)return null;
    this.app.external?.assertWritable();this.app.pendingMutations=(this.app.pendingMutations||0)+1;
    try{return await this.request('analyze',{text,basis:memoryBasis(mind),labels:Object.values(mind.intelligence?.entries||{}).map(e=>({domain:e.domain,topic:e.topic})).slice(-16)});}
    catch{this.stopWorker();this.status('Local AI analysis failed. Native lexical fallback is active; no Energy was charged for the failed analysis.');return null;}
    finally{this.app.pendingMutations--;}
  }
  async reindex(){
    const app=this.app;if(!this.ready||this.indexing||app.external?.locked||app.busy||app.pendingMutations||!app.state.mind)return;
    this.indexing=true;app.pendingMutations=(app.pendingMutations||0)+1;
    try{
      const mind=structuredClone(app.state.mind),memories=mind.memories.filter(m=>!indexedEntry(mind,m)).slice(0,3),items=[];
      for(const memory of memories){const analysis=await this.prepare(memory.content,mind);if(!analysis)throw Error('MODEL_UNAVAILABLE');items.push({id:memory.id,analysis});}
      if(items.length)await app.change(state=>migrateIndex(state,items),{preserveGameplay:true});
      this.status(items.length?`Organized ${items.length} saved memories. Original records, Energy and XP were preserved. Continue to resume.`:'All saved memories have a current classification index.');
    }catch{this.status('Classification was not saved. Original memories are preserved; retry when the model is available and memories have not changed.');}
    finally{app.pendingMutations--;this.indexing=false;}
  }
  stopWorker(){this.worker?.terminate();this.worker=null;this.ready=false;this.panel.querySelector('[data-ai-enable]').disabled=false;for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(Error('LOCAL_MODEL_UNAVAILABLE'));}this.pending.clear();this.panel.querySelector('[data-ai-index]').disabled=true;this.panel.querySelector('[data-ai-off]').disabled=true;}
  disable(){this.stopWorker();this.status('Native lexical fallback active. Downloaded model assets remain cached.');this.panel.querySelector('[data-ai-enable]').disabled=false;}
  destroy(){this.disposed=true;this.stopWorker();this.panel.remove();}
}
