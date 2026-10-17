"""Opt-in REAL model evaluation; downloads ~650 MB. No production/player data.
Run with MINDLING_REAL_MODELS=1 after allowing Hugging Face's model CDN.
This benchmark uses synthetic inputs only. It does not certify factual truth.
"""
import json,os,time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
if os.environ.get('MINDLING_REAL_MODELS')!='1':
 raise SystemExit('Not run: set MINDLING_REAL_MODELS=1 to consent to real model downloads.')
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8001')
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
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context();context.on('requestfailed',lambda r:print(json.dumps({'asset_host':urlparse(r.url).hostname,'failure':r.failure}),flush=True));page=context.new_page();page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));page.goto(BASE)
 page.evaluate('''async()=>{
 await navigator.serviceWorker.register('/local-ai-cache.js');await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
 window.worker=new Worker('/src/learning/local-ai-worker.js',{type:'module'});let seq=0;
 window.call=(action,payload)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('evaluation timeout')),600000);worker.onmessage=({data})=>{if(data.id===id){clearTimeout(timer);resolve(data)}};worker.onerror=()=>{clearTimeout(timer);reject(Error('worker failure'))};worker.postMessage({id,action,payload})});
 }''')
 started=time.monotonic();init=page.evaluate("call('init')");cold=time.monotonic()-started
 if init.get('error'):
  print(json.dumps({'qualified':False,'initialization':init['error'],'elapsed_seconds':cold,'accuracy':None,'runtime_memory':None}));browser.close();raise SystemExit(1)
 results=[]
 for text,expected in CASES:
  started=time.monotonic();result=page.evaluate("text=>call('analyze',{text,basis:'synthetic',labels:[]})",text);elapsed=time.monotonic()-started
  value=result.get('result',{});results.append({'expected':expected,'actual':value.get('classification'),'seconds':elapsed,'vector':value.get('embedding'),'error':result.get('error')})
 context.set_offline(True);offline=page.evaluate("call('analyze',{text:'The Earth rotates around its own axis.',basis:'synthetic',labels:[]})");context.set_offline(False)
 def cosine(a,b):
  if not a or not b:return None
  return sum(x*y for x,y in zip(a,b))/(sum(x*x for x in a)*sum(y*y for y in b))**.5
 similarities={'rotation_pair':cosine(results[0]['vector'],results[1]['vector']),'rotation_vs_compiler':cosine(results[0]['vector'],results[12]['vector'])}
 for row in results:row.pop('vector')
 print(json.dumps({'backend':init,'cold_start_seconds':cold,'correct':sum(bool(r['actual'] and r['actual']['type'] in r['expected']) for r in results),'total':len(results),'results':results,'retrieval':similarities,'offline':not offline.get('error'),'runtime_memory':'Not measurable reliably in this browser; requires device profiling'},ensure_ascii=False,indent=2))
 browser.close()
