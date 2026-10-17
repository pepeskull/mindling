"""Service-worker cache/network behavior using small synthetic assets only."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8001')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context();page=context.new_page();page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));page.goto(BASE)
 page.evaluate('''async()=>{await navigator.serviceWorker.register('/local-ai-cache.js',{type:'module'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));window.progressEvents=[];navigator.serviceWorker.addEventListener('message',e=>{if(e.data.kind==='LOCAL_ASSET_PROGRESS')progressEvents.push(e.data)});window.flush=()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>{c.port1.close();resolve(e.data)};navigator.serviceWorker.controller.postMessage({kind:'FLUSH_MODEL_CACHE'},[c.port2])});}''')
 url=page.evaluate("async()=>{const {EMBEDDING:m}=await import('/src/learning/model-config.js');return `https://huggingface.co/${m.id}/resolve/${m.revision}/config.json`}")
 calls=[];fail=[False];body='x'*300000
 def asset(route):
  calls.append(1)
  if fail[0]:route.abort()
  else:route.fulfill(body=body,headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/octet-stream','Content-Length':str(len(body))})
 context.route(url,asset)
 assert page.evaluate('async url=>(await (await fetch(url)).text()).length',url)==len(body)
 assert page.evaluate('flush()')['ok']
 page.wait_for_function('progressEvents.some(e=>e.loaded===300000)')
 assert page.evaluate('progressEvents.at(-1).total')==300000
 context.set_offline(True);assert page.evaluate('async url=>(await (await fetch(url)).text()).length',url)==len(body);context.set_offline(False);assert len(calls)==1
 page.evaluate("async url=>{const {MODEL_CACHE}=await import('/src/learning/model-config.js');await (await caches.open(MODEL_CACHE)).delete(url)}",url)
 fail[0]=True
 assert page.evaluate('async url=>{try{await fetch(url);return false}catch{return true}}',url)
 assert page.evaluate("async url=>{const {MODEL_CACHE}=await import('/src/learning/model-config.js');return !(await (await caches.open(MODEL_CACHE)).match(url))}",url)
 fail[0]=False;assert page.evaluate('async url=>(await (await fetch(url)).text()).length',url)==len(body);assert page.evaluate('flush()')['ok'];assert len(calls)==3
 # Qualification/preflight does not depend on IndexedDB writes or create a worker when storage is insufficient.
 assert page.evaluate('''async()=>{const {LocalIntelligence}=await import('/src/learning/local-ai-client.js');const client=new LocalIntelligence({state:{mind:null}}),estimate=navigator.storage.estimate;navigator.storage.estimate=async()=>({quota:10,usage:9});try{return !(await client.enable())&&!client.worker&&!client.ready;}finally{navigator.storage.estimate=estimate;client.destroy()}}''')
 workers=[]
 def worker(route):
  workers.append(1)
  if len(workers)==1:body="import {EMBEDDING} from '/src/learning/model-config.js';onmessage=({data})=>postMessage({id:data.id,error:'LOCAL_MODEL_FAILED',repairModel:EMBEDDING.id});"
  else:body="import {MODEL_PACK} from '/src/learning/model-config.js';onmessage=({data})=>postMessage({id:data.id,result:data.action==='init'?{pack:MODEL_PACK,backend:'wasm'}:{healthy:true}});"
  route.fulfill(body=body,content_type='application/javascript')
 context.route('**/src/learning/local-ai-worker.js',worker)
 assert page.evaluate("""async()=>{
  const {LocalIntelligence}=await import('/src/learning/local-ai-client.js'),config=await import('/src/learning/model-config.js');
  const cache=await caches.open(config.MODEL_CACHE),url=m=>`https://huggingface.co/${m.id}/resolve/${m.revision}/config.json`;
  await cache.put(url(config.EMBEDDING),new Response('corrupted fixture'));await cache.put(url(config.CLASSIFIER),new Response('preserved fixture'));
  const client=new LocalIntelligence({state:{mind:null}});
  try{const first=await Promise.all([client.enable(),client.enable()]);if(first.some(Boolean))throw Error('invalid model became ready');
   if(!(await client.enable({retry:true})))throw Error('retry failed');
   return !(await cache.match(url(config.EMBEDDING)))&&Boolean(await cache.match(url(config.CLASSIFIER)));
  }finally{client.destroy()}
 }""")
 assert len(workers)==2,workers
 print('PASS one shared initialization attempt, explicit corrupt-model cache repair and preservation of other model assets')
 print('PASS real byte progress, complete-cache offline reuse, missing/interrupted asset retry and insufficient-storage fallback')
 context.close();browser.close()
