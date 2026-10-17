import { FRAMEWORK, MODEL_PACK, MODEL_ASSETS, MODEL_CACHE, EMBEDDING, CLASSIFIER, modelDownloadNotice } from './model-config.js';
import { InstallProgress, INSTALL_STAGES } from './install-progress.js';
import { memoryBasis, indexedEntry, migrateIndex } from './intelligence-index.js';
export class LocalIntelligence {
  ready=false;pending=new Map();sequence=0;
  constructor(app){
    this.app=app;this.panel=document.createElement('details');this.panel.className='local-intelligence glass-panel';
    this.panel.innerHTML='<summary>Local intelligence</summary><p data-ai-status role="status">Native lexical fallback active. Pretrained models are off.</p><p>Experimental browser-local analysis. __MODEL_SIZE__. Downloads require internet; input stays on this device. Model accuracy is not yet qualified.</p><button type="button" data-ai-enable>Download and enable local AI</button><button type="button" data-ai-index disabled>Organize next 3 saved memories</button><button type="button" data-ai-off disabled>Use native fallback</button>';
    this.panel.innerHTML=this.panel.innerHTML.replace('__MODEL_SIZE__',modelDownloadNotice());
    document.querySelector('.dashboard-chrome').append(this.panel);
    this.panel.querySelector('[data-ai-enable]').addEventListener('click',()=>this.enable({retry:Boolean(this.failed)}));
    this.panel.querySelector('[data-ai-off]').addEventListener('click',()=>{if(!app.external?.locked)this.disable();});
    this.panel.querySelector('[data-ai-index]').addEventListener('click',()=>this.reindex());
  }
  diagnose(code,action,backend=null){
    if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))console.warn('local-ai-diagnostic',{code,action,backend});
  }
  status(text){this.panel.querySelector('[data-ai-status]').textContent=text;}
  request(action,payload,timeout=120000){
    return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);this.diagnose('TIMEOUT',action);reject(Error('LOCAL_MODEL_TIMEOUT'));this.stopWorker();},timeout);this.pending.set(id,{resolve,reject,timer,action});this.worker.postMessage({id,action,payload});});
  }
  listeners=new Set();epoch=0;
  report(stage,detail=''){
    this.installStage=stage;const event={stage,detail,...this.progress?.snapshot()};if(detail)event.detail=detail;
    this.status(`${INSTALL_STAGES[stage]||stage}${event.detail?` · ${event.detail}`:''}`);
    for(const listener of this.listeners)listener(event);
  }
  enable({onProgress,retry=false}={}){
    if(this.disposed||this.app.external?.locked)return Promise.resolve(false);
    if(this.ready)return Promise.resolve(true);
    if(onProgress)this.listeners.add(onProgress);
    if(!this.installPromise){
      const epoch=++this.epoch;this.installPromise=this.install(epoch,retry).finally(()=>{this.installPromise=null;});
    }
    return this.installPromise.finally(()=>{if(onProgress)this.listeners.delete(onProgress);});
  }
  async install(epoch,retry){
    const current=()=>{if(this.disposed||epoch!==this.epoch)throw Error('INSTALLATION_CANCELLED');};
    const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_SETUP_TIMEOUT')),20000);})]);}finally{clearTimeout(timer);}};
    this.loading=true;this.panel.querySelector('[data-ai-off]').disabled=false;this.progress=new InstallProgress();this.report('preparing');this.panel.querySelector('[data-ai-enable]').disabled=true;
    const assetProgress=({data})=>{if(epoch!==this.epoch||['verifying','complete'].includes(this.installStage)||data?.kind!=='LOCAL_ASSET_PROGRESS')return;this.progress.update(data);this.report('downloading');};
    try{
      if(!globalThis.Worker||!navigator.serviceWorker||!globalThis.caches)throw Error('LOCAL_RUNTIME_UNSUPPORTED');
      const cache=await bounded(caches.open(MODEL_CACHE));current();
      if(retry&&this.repairRuntime){
        for(const key of await cache.keys())if(key.url===FRAMEWORK||key.url.startsWith('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/')||key.url.startsWith('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/'))await cache.delete(key);
        this.repairRuntime=false;
      }
      if(retry&&this.repairModel){
        const model=[EMBEDDING,CLASSIFIER].find(m=>m.id===this.repairModel);
        if(model)for(const key of await cache.keys())if(key.url.startsWith(`https://huggingface.co/${model.id}/resolve/${model.revision}/`))await cache.delete(key);
        this.repairModel=null;
      }
      const cached=await cache.keys();
      const missing=MODEL_ASSETS.filter(asset=>!cached.some(key=>key.url===asset.url)).reduce((n,asset)=>n+asset.bytes,0);
      const storage=await bounded(navigator.storage?.estimate?.()||Promise.resolve(null));current();
      if(storage?.quota&&storage.quota-(storage.usage||0)<missing*1.15)throw Error('LOCAL_STORAGE_INSUFFICIENT');
      const existing=await bounded(navigator.serviceWorker.getRegistration('/'));
      if(!existing?.active||navigator.onLine)await bounded(navigator.serviceWorker.register('/local-ai-cache.js',{type:'module'}));
      await bounded(navigator.serviceWorker.ready);current();
      if(!navigator.serviceWorker.controller){
        let listener;try{await bounded(new Promise(resolve=>{listener=resolve;navigator.serviceWorker.addEventListener('controllerchange',listener,{once:true});}));}
        finally{navigator.serviceWorker.removeEventListener('controllerchange',listener);}
      }current();
      navigator.serviceWorker.addEventListener('message',assetProgress);
      this.worker=new Worker(new URL('./local-ai-worker.js',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{
        if(epoch!==this.epoch)return;
        if(data.stage){this.report(data.stage);return;}
        const item=this.pending.get(data.id);if(!item)return;this.pending.delete(data.id);clearTimeout(item.timer);
        if(data.error){this.repairModel=data.repairModel;this.repairRuntime=data.repairRuntime;this.diagnose(data.diagnostic||'RUNTIME_ERROR',item.action,data.backend||null);const error=Error(data.error);error.diagnostic=data.diagnostic;item.reject(error);}else item.resolve(data.result);
      };
      this.worker.onerror=()=>{this.diagnose('WORKER_RUNTIME','worker');this.stopWorker();};
      this.report('initializing');const result=await this.request('init',{pack:MODEL_PACK},600000);current();
      if(result?.pack!==MODEL_PACK)throw Error('LOCAL_MODEL_PACK_CHANGED');
      this.report('verifying');const health=await this.request('health',null,120000);current();
      if(!health?.healthy)throw Error('LOCAL_HEALTH_FAILED');
      let channel,flushed;try{flushed=await bounded(new Promise(resolve=>{channel=new MessageChannel();channel.port1.onmessage=({data})=>resolve(data.ok);navigator.serviceWorker.controller.postMessage({kind:'FLUSH_MODEL_CACHE'},[channel.port2]);}));}
      finally{channel?.port1.close();}current();
      if(!flushed)throw Error('LOCAL_CACHE_FAILED');
      this.ready=true;this.failed=false;this.report('complete','Local inference health check passed. Claims are not fact-checked.');
      this.panel.querySelector('[data-ai-index]').disabled=false;this.panel.querySelector('[data-ai-off]').disabled=false;return true;
    }catch{
      if(epoch===this.epoch){this.failed=true;this.stopWorker();this.status('Neural intelligence is temporarily unavailable. Native lexical fallback remains active; no semantic AI analysis is claimed.');}
      return false;
    }finally{
      navigator.serviceWorker?.removeEventListener('message',assetProgress);
      this.loading=false;this.panel.querySelector('[data-ai-enable]').disabled=this.ready;
    }
  }
  cancel(){this.epoch++;this.stopWorker();this.status('Native lexical fallback active. Complete model files remain cached for retry.');}
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
  disable(){this.cancel();this.status('Native lexical fallback active. Downloaded model assets remain cached.');this.panel.querySelector('[data-ai-enable]').disabled=false;}
  destroy(){this.disposed=true;this.cancel();this.panel.remove();}
}
