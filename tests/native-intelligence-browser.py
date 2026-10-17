"""Browser integration with deterministic model fixtures, not model-quality evidence."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8001')
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for device in ['iPhone 13','iPad Pro 11']:
  context=browser.new_context(**p.devices[device]);page=context.new_page();requests=[];page.on('request',lambda r:requests.append(r.url))
  for suffix in ['', '/?stage-preview=1']:
   page.goto(BASE+suffix);page.locator('#compatibility-title').wait_for();assert page.locator('#app').is_hidden();assert page.locator('.desktop-required button').count()==0
   if not suffix:
    assert page.evaluate('async()=> (await indexedDB.databases()).length')==0
    page.evaluate('''async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('preserved-player',1);r.onupgradeneeded=()=>r.result.createObjectStore('records').put({energy:7,content:'Original'},'player');r.onsuccess=()=>{r.result.close();resolve()};r.onerror=reject})}''')
   else:
    assert page.evaluate('''async()=>new Promise(resolve=>{const r=indexedDB.open('preserved-player');r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('player');q.onsuccess=()=>{resolve(q.result);db.close()}}})''')=={'energy':7,'content':'Original'}
  assert not any('/src/app/' in u or '/src/preview/' in u or 'huggingface' in u or 'three@' in u for u in requests),requests
  context.close()
 print('PASS phone/tablet: Main and Sandbox blocked before gameplay, DB or model initialization')
 context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page()
 page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));page.goto(BASE)
 assert page.evaluate("async()=> (await import('/src/platform/desktop.js')).checkDesktop().allowed")
 assert page.evaluate('''async()=>{const {LocalIntelligence}=await import('/src/learning/local-ai-client.js');const app={external:{locked:false},state:{mind:null}};const client=new LocalIntelligence(app),register=navigator.serviceWorker.register;navigator.serviceWorker.register=async()=>{throw Error('fixture loading failure')};try{await client.enable();return !client.ready&&client.panel.textContent.includes('Native lexical fallback remains active')}finally{navigator.serviceWorker.register=register;client.destroy()}}''')
 print('PASS model-loading failure leaves the explicitly labelled native fallback active')
 # Exercise an actual dedicated worker and service-worker cache using a tiny fixture.
 result=page.evaluate('''async()=>{
  await navigator.serviceWorker.register('/local-ai-cache.js',{type:'module'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
  const {FRAMEWORK}=await import('/src/learning/model-config.js');const cache=await caches.open('mindling-local-model-assets-v1');
  const fixture=`export const env={backends:{onnx:{wasm:{}}}};export async function pipeline(task,id,options){if(options.device==='webgpu')throw Error('fixture GPU unavailable');if(task==='feature-extraction')return async text=>{if(text==='embedding failure')throw Error('synthetic embedding detail');return {data:Float32Array.from({length:384},(_,i)=>i===0?1:0)}};return async messages=>{const text=messages.at(-1).content;if(text==='generation failure')throw Error('synthetic generation detail');if(text==='missing output')return [{}];if(text==='invalid json')return [{generated_text:'not json'}];if(text==='invalid classification')return [{generated_text:'{"type":"MADE_UP","domain":"Testing","topic":"Invalid type","confidence":0.9,"evidence":"invalid classification"}'}];return [{generated_text:JSON.stringify({type:'FACT_CLAIM',domain:'Astronomy',topic:'Earth rotation',confidence:.9,evidence:text})}]};}`;
  await cache.put(FRAMEWORK,new Response(fixture,{headers:{'Content-Type':'application/javascript'}}));
  window.runFixture=async()=>{const worker=new Worker('/src/learning/local-ai-worker.js',{type:'module'});const call=(id,action,payload)=>new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.id===id)resolve(data)};worker.onerror=reject;worker.postMessage({id,action,payload})});try{const init=await call(1,'init');const good=await call(2,'analyze',{text:'Jorden roterar kring sin axel.',basis:'fixture',labels:[]}),bad=await call(3,'analyze',{text:'',basis:'fixture'}),embedding=await call(4,'analyze',{text:'embedding failure',basis:'fixture',labels:[],diagnostics:true}),generation=await call(5,'analyze',{text:'generation failure',basis:'fixture',labels:[],diagnostics:true}),missing=await call(6,'analyze',{text:'missing output',basis:'fixture',labels:[],diagnostics:true}),json=await call(7,'analyze',{text:'invalid json',basis:'fixture',labels:[],diagnostics:true}),classification=await call(8,'analyze',{text:'invalid classification',basis:'fixture',labels:[],diagnostics:true}),privateJson=await call(9,'analyze',{text:'invalid json',basis:'fixture',labels:[]});return {init,good,bad,embedding,generation,missing,json,classification,privateJson};}finally{worker.terminate()}};
  return await runFixture();
 }''')
 assert result['init']['result']['backend']=='wasm',result
 assert result['good']['result']['classification']['evidence']=='Jorden roterar kring sin axel.'
 assert result['bad']['error']=='LOCAL_MODEL_FAILED' and result['bad']['diagnostic']=='INPUT_INVALID'
 assert result['embedding']['diagnostic']=='EMBEDDING_GENERATION'
 assert result['generation']['diagnostic']=='TEXT_GENERATION'
 assert result['missing']['diagnostic']=='OUTPUT_MISSING'
 assert result['json']['diagnostic']=='JSON_PARSE' and result['json']['debug']['raw']=='not json'
 assert result['classification']['diagnostic']=='LOCAL_CLASSIFICATION_INVALID'
 assert result['privateJson']['diagnostic']=='JSON_PARSE' and 'debug' not in result['privateJson']
 assert page.evaluate('''async()=>{const {LocalIntelligence}=await import('/src/learning/local-ai-client.js');const client=new LocalIntelligence({state:{mind:null}}),seen=[];client.worker={postMessage(){},terminate(){}};client.diagnose=(code,action)=>seen.push([code,action]);try{await client.request('health',null,5)}catch{}finally{client.destroy()}return JSON.stringify(seen)==='[["TIMEOUT","health"]]' }''')
 context.set_offline(True);assert page.evaluate('runFixture()')['good']['result']['embedding'][0]==1;assert page.evaluate('''async()=>{const {LocalIntelligence}=await import('/src/learning/local-ai-client.js');const client=new LocalIntelligence({state:{mind:null}});try{return await client.enable()&&client.ready}finally{client.destroy()}}''');context.set_offline(False)
 print('PASS dedicated worker protocol, safe malformed-input rejection and cached fixture execution offline (not real model qualification)')
 # Real IndexedDB transactions: concurrent regen/spend, rollback and derived-index isolation.
 result=page.evaluate('''async()=>{
  const {MindlingDatabase}=await import('/src/storage/database.js'),{PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const e=await import('/src/preview/sandbox/engine.js'),energy=await import('/src/economy/energy.js');
  const a=await new MindlingDatabase().open(),b=await new MindlingDatabase().open(),sandbox=await new PreviewStore().open();
  const now=Date.now();let state=e.newMindling(e.createSandbox(now),{confirmed:true,id:'atomic'});state.mind.energy=energy.spendEnergy(state.mind.energy,10,now);
  await a.changeGameplay(()=>state);await sandbox.change(()=>structuredClone(state));
  const spend=db=>db.changeGameplay(s=>{s.now=now+12*60000;return e.talk(s,'A meaningful unique thought for this atomic transaction.',{id:crypto.randomUUID()})});
  const results=await Promise.allSettled([spend(a),spend(b)]);const saved=(await a.get('gameplay','primary')).state;
  if(results.filter(r=>r.status==='fulfilled').length!==1||saved.mind.energy.remaining!==0)throw Error('concurrent overspend or credit');
  const before=JSON.stringify(saved);try{await a.changeGameplay(s=>{s.mind.energy.remaining=999;throw Error('rollback')})}catch{}
  if(JSON.stringify((await b.get('gameplay','primary')).state)!==before)throw Error('rollback failed');
  if((await sandbox.read()).mind.energy.updatedAt!==now)throw Error('sandbox changed');
  const ai=await import('/src/learning/intelligence-index.js'),config=await import('/src/learning/model-config.js');
  await a.changeGameplay(s=>{s.mind.energy=energy.creditEnergy(s.mind.energy,4,s.now);return s});
  const snapshot=(await a.get('gameplay','primary')).state;
  const classify=text=>({mode:'ai',version:config.ANALYSIS_VERSION,model:config.MODEL_KEY,classifier:config.CLASSIFIER_KEY,basis:ai.memoryBasis(snapshot.mind),text,embedding:Array.from({length:384},(_,i)=>i===0?1:0),classification:{type:'FACT_CLAIM',domain:'Biology',topic:'Living systems',confidence:.9,evidence:text}});
  const texts=['Photosynthesis converts sunlight into chemical energy stored in glucose.','Whales communicate using complex underwater sound patterns.'];
  const races=await Promise.allSettled([a,b].map((db,i)=>db.changeGameplay(s=>e.learn(s,{id:'ai-'+i,text:texts[i],analysis:classify(texts[i])}))));
  if(races.filter(r=>r.status==='fulfilled').length!==1)throw Error('stale AI analysis accepted');
  const indexed=(await a.get('gameplay','primary')).state;
  if(indexed.mind.lifetimeXP!==50||indexed.mind.memories.length!==1||!ai.indexedEntry(indexed.mind,indexed.mind.memories[0]))throw Error('atomic index or rewards failed');
  const replay=await a.changeGameplay(s=>ai.migrateIndex(s,[{id:s.mind.memories[0].id,analysis:{...classify(s.mind.memories[0].content),basis:ai.memoryBasis(s.mind)}}]));
  if(JSON.stringify(replay.mind)!==JSON.stringify(indexed.mind))throw Error('reindex changed canonical memory/gameplay');
  a.close();const reopened=await new MindlingDatabase().open();if(JSON.stringify((await reopened.get('gameplay','primary')).state.mind)!==JSON.stringify(indexed.mind))throw Error('index reload failed');
  reopened.close();b.close();sandbox.close();return true;
 }''')
 assert result
 print('PASS real IndexedDB concurrent regeneration/spending, failed-transaction rollback, indexed learning, stale analysis, reload and Main/Sandbox isolation')
 context.close();browser.close()
