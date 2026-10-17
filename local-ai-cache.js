// Installed only after the user opts into local model downloads. No player data is cached.
const CACHE='mindling-local-model-assets-v1';
const allowed=url=>{
  if(url.origin===self.location.origin)return url.pathname.startsWith('/src/learning/');
  if(url.hostname==='cdn.jsdelivr.net')return url.pathname.startsWith('/npm/@huggingface/transformers@3.8.1/')||url.pathname.startsWith('/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/');
  return url.hostname==='huggingface.co'&&(url.pathname.startsWith('/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/')||url.pathname.startsWith('/onnx-community/Qwen2.5-0.5B-Instruct/resolve/'));
};
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET'||!allowed(new URL(request.url)))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(request);
    // Revalidate application modules online; immutable pinned model assets stay cache-first.
    const local=new URL(request.url).origin===self.location.origin;
    if(saved&&!local)return saved;
    let response;try{response=await fetch(request);}catch(error){if(saved)return saved;throw error;}if(!response.ok||response.type==='opaque')return response;
    // A quota failure is a visible initialization failure, not an offline-ready claim.
    await cache.put(request,response.clone());return response;
  })());
});
