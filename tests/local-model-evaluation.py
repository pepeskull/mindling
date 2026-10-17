"""Opt-in REAL model evaluation; downloads ~650 MB. No production/player data.
Run with MINDLING_REAL_MODELS=1 after allowing Hugging Face's model CDN.
MINDLING_ASSET_FIXTURE may point to exact predownloaded artifacts for transport diagnosis;
that mode is real inference but does not verify the production download path.
This benchmark uses synthetic inputs only. It does not certify factual truth.
"""
import json,os,statistics,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
if os.environ.get('MINDLING_REAL_MODELS')!='1':
 raise SystemExit('Not run: set MINDLING_REAL_MODELS=1 to consent to real model downloads.')
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8001')
ROOT=Path(__file__).resolve().parents[1]
ASSET_FIXTURE=os.environ.get('MINDLING_ASSET_FIXTURE')
CASES=[
 ('The Earth rotates around its own axis, causing day and night.',['FACT_CLAIM']),
 ("Earth’s rotation makes the Sun appear to rise in the east and set in the west.",['FACT_CLAIM']),
 ('Become a trader',['GOAL','INSTRUCTION','UNCERTAIN']),('Learn to trade',['GOAL','INSTRUCTION','UNCERTAIN']),
 ('You need to learn trade finance',['ADVICE','INSTRUCTION']),('I want to become a trader',['AMBITION']),
 ('I think trading is exciting',['OPINION']),('Jorden roterar kring sin egen axel.',['FACT_CLAIM']),
 ('Jag vill bli programmerare.',['AMBITION']),('Jag tycker att programmering är roligt.',['OPINION']),
 ('Hur fungerar fotosyntes?',['QUESTION']),('Jag studerade matematik förra året.',['EXPERIENCE']),
 ('A compiler translates source code into executable machine instructions.',['FACT_CLAIM']),
 ('Photosynthesis converts sunlight into chemical energy.',['FACT_CLAIM'])]
if os.environ.get('MINDLING_EXTENDED_EVAL')=='1':CASES += [
 ('Become a Trader',['GOAL','INSTRUCTION','UNCERTAIN']),('You should learn how to trade',['ADVICE']),
 ('You will become a trader',['UNCERTAIN']),('learn how to trade in finance',['INSTRUCTION']),
 ('You will learn how to trade finance',['UNCERTAIN']),('A budget tracks income and expenses.',['FACT_CLAIM']),
 ('Jag borde spara pengar varje månad.',['ADVICE']),('Will the meeting start at noon?',['QUESTION']),
 ('I plan to study marine biology next year.',['GOAL'])]
requested=os.environ.get('MINDLING_EVAL_INPUT')
if requested:CASES=[(requested,['AMBITION','GOAL','INSTRUCTION','ADVICE','UNCERTAIN'])]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context();context.on('requestfailed',lambda r:print(json.dumps({'asset_host':urlparse(r.url).hostname,'failure':r.failure}),flush=True))
 if ASSET_FIXTURE:
  config=(ROOT/'src/learning/model-config.js').read_text().replace('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js',f'{ASSET_FIXTURE}/runtime/transformers.min.js').replace('Xenova/paraphrase-multilingual-MiniLM-L12-v2',f'{ASSET_FIXTURE}/embedding').replace('onnx-community/Qwen2.5-0.5B-Instruct',f'{ASSET_FIXTURE}/classifier')
  worker=(ROOT/'src/learning/local-ai-worker.js').read_text().replace('env.allowLocalModels=false','env.allowLocalModels=true')
  context.route('**/src/learning/model-config.js',lambda r:r.fulfill(body=config,content_type='application/javascript'))
  context.route('**/src/learning/local-ai-worker.js',lambda r:r.fulfill(body=worker,content_type='application/javascript'))
 page=context.new_page();page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));page.goto(BASE)
 if ASSET_FIXTURE:
  page.evaluate('''async root=>{const cache=await caches.open('mindling-local-model-assets-v1');for(const file of ['transformers.min.js','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']){const response=await fetch(`${root}/runtime/${file}`);await cache.put(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/${file}`,response)}}''',ASSET_FIXTURE)
 page.evaluate('''async()=>{
 await navigator.serviceWorker.register('/local-ai-cache.js',{type:'module'});await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
 window.worker=new Worker('/src/learning/local-ai-worker.js',{type:'module'});let seq=0;
 window.call=(action,payload)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('evaluation timeout')),600000);worker.onmessage=({data})=>{if(data.id===id){clearTimeout(timer);resolve(data)}};worker.onerror=()=>{clearTimeout(timer);reject(Error('worker failure'))};worker.postMessage({id,action,payload})});
 }''')
 print('Starting real model initialization; no player data is loaded.',flush=True)
 started=time.monotonic();init=page.evaluate("call('init',{diagnostics:true})");cold=time.monotonic()-started
 if init.get('error'):
  print(json.dumps({'qualified':False,'initialization':init['error'],'diagnostic':init.get('diagnostic'),'debug':init.get('debug'),'elapsed_seconds':cold,'accuracy':None,'runtime_memory':None}));browser.close();raise SystemExit(1)
 results=[]
 for text,expected in CASES:
  started=time.monotonic();result=page.evaluate("text=>call('analyze',{text,basis:'synthetic',labels:[],diagnostics:true})",text);elapsed=time.monotonic()-started
  print(json.dumps({'case':len(results)+1,'input':text,'seconds':elapsed,'error':result.get('error'),'diagnostic':result.get('diagnostic'),'debug':result.get('debug'),'raw':result.get('result',{}).get('diagnosticRaw')},ensure_ascii=False),flush=True)
  value=result.get('result',{});results.append({'input':text,'expected':expected,'actual':value.get('classification'),'seconds':elapsed,'vector':value.get('embedding'),'error':result.get('error'),'diagnostic':result.get('diagnostic')})
 context.set_offline(True);offline=page.evaluate("call('analyze',{text:'The Earth rotates around its own axis.',basis:'synthetic',labels:[]})");context.set_offline(False)
 def cosine(a,b):
  if not a or not b:return None
  return sum(x*y for x,y in zip(a,b))/(sum(x*x for x in a)*sum(y*y for y in b))**.5
 similarities={'rotation_pair':cosine(results[0]['vector'],results[1]['vector']),'rotation_vs_compiler':cosine(results[0]['vector'],results[12]['vector'])} if len(results)>=13 else {'rotation_pair':None,'rotation_vs_compiler':None}
 for row in results:row.pop('vector')
 retrieval_pass=all(value is not None for value in similarities.values()) and similarities['rotation_pair']>similarities['rotation_vs_compiler']
 classification_pass=all(r['actual'] is not None and r['actual']['type'] in r['expected'] for r in results)
 functional_pass=classification_pass and (retrieval_pass or requested is not None) and not offline.get('error')
 print(json.dumps({'functional_checks_passed':functional_pass,'backend':init,'cold_start_seconds':cold,'warm_latency_seconds':{'min':min(r['seconds'] for r in results),'median':statistics.median(r['seconds'] for r in results),'max':max(r['seconds'] for r in results)},'correct':sum(bool(r['actual'] and r['actual']['type'] in r['expected']) for r in results),'total':len(results),'results':results,'retrieval':similarities,'offline':not offline.get('error'),'runtime_memory':'Requires external browser process-tree profiling; not inferred by this harness'},ensure_ascii=False,indent=2))
 browser.close()
 if not functional_pass:raise SystemExit(1)
