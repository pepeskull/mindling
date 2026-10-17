// Module service worker, installed only after informed download consent.
import { FRAMEWORK, EMBEDDING, CLASSIFIER, MODEL_CACHE } from './src/learning/model-config.js';
const models=[EMBEDDING,CLASSIFIER],writes=new Map(),failures=new Set();
const allowed=url=>{
  if(url.origin===self.location.origin)return url.pathname.startsWith('/src/learning/');
  if(url.href===FRAMEWORK)return true;
  if(url.hostname==='cdn.jsdelivr.net')return url.pathname.startsWith('/npm/@huggingface/transformers@3.8.1/dist/')||url.pathname.startsWith('/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/');
  return url.hostname==='huggingface.co'&&models.some(m=>url.pathname.startsWith(`/${m.id}/resolve/${m.revision}/`));
};
const broadcast=async event=>{for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({kind:'LOCAL_ASSET_PROGRESS',...event});};
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.kind==='FLUSH_MODEL_CACHE')event.waitUntil((async()=>{await Promise.allSettled([...writes.values()]);event.ports[0]?.postMessage({ok:failures.size===0});})());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||!allowed(url))return;
  let finish;const complete=new Promise(resolve=>{finish=resolve;});event.waitUntil(complete);
  event.respondWith((async()=>{
    const cache=await caches.open(MODEL_CACHE),local=url.origin===self.location.origin;
    if(writes.has(request.url))await writes.get(request.url).catch(()=>{});
    const saved=await cache.match(request);
    if(saved?.status===200&&!saved.headers.has('content-range')&&!local){finish();return saved;}
    let resolveWrite,rejectWrite;const writing=new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});
    writes.set(request.url,writing);writing.catch(()=>{});failures.delete(request.url);
    try{
      const response=await fetch(request);
      if(!response.ok||response.status!==200||response.type==='opaque')throw Error('ASSET_UNAVAILABLE');
      let loaded=0,lastReport=0;const total=response.headers.has('content-encoding')?null:Number(response.headers.get('content-length'))||null;
      const file=url.origin+url.pathname;
      const tracked=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
        loaded+=chunk.byteLength;controller.enqueue(chunk);
        if(!local&&loaded-lastReport>=256*1024){lastReport=loaded;void broadcast({file,loaded,total});}
      },flush(){if(!local)void broadcast({file,loaded,total});}}));
      const streamed=new Response(tracked,{status:response.status,headers:response.headers});
      // Stream to the model and cache concurrently; do not buffer whole weights
      // while waiting for cache.put. Cache API commits only complete responses.
      cache.put(request,streamed.clone()).then(resolveWrite,error=>{failures.add(request.url);rejectWrite(error);}).finally(()=>{writes.delete(request.url);finish();});
      return streamed;
    }catch(error){writes.delete(request.url);rejectWrite(error);finish();if(saved?.ok)return saved;throw error;}
  })().catch(error=>{finish();throw error;}));
});
