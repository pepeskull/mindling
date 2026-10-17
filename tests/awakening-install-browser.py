"""Real onboarding/IndexedDB/client integration with explicit worker fixtures, not model qualification."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8001')
BOOT=(ROOT/'js/bootstrap.js').read_text().replace('await active.start();','window.testApp=active;await active.start();window.testReady=true;')
CONFIG=(ROOT/'src/learning/model-config.js').read_text()
WORKER="""import {MODEL_PACK} from "/src/learning/model-config.js";onmessage=({data})=>{if(data.action==='init')postMessage({id:data.id,result:{backend:'wasm',pack:MODEL_PACK}});else if(data.action==='health')postMessage({id:data.id,result:{healthy:true}});};"""
def create(page):
 page.get_by_role('button',name='Begin',exact=True).click()
 for name in ['Developer','Social','Researcher']:page.get_by_role('button',name=name,exact=True).click()
 page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
 page.locator('#mindling-name').fill('Awakening test');page.get_by_role('button',name='Continue',exact=True).click()
 assert '655 MB' in page.locator('.local-ai-notice').inner_text()
 page.get_by_role('button',name='Create Mindling',exact=True).click()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for mode in ['disabled','success','retry','continue','reload','health-failure']:
  context=browser.new_context(reduced_motion='reduce');page=context.new_page();errors=[];workers=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body=BOOT,content_type='application/javascript'))
  context.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
  context.route('**/src/learning/model-config.js',lambda r:r.fulfill(body=CONFIG if mode=='disabled' else CONFIG.replace('automatic:false,qualifiedPack:null','automatic:true,qualifiedPack:MODEL_PACK'),content_type='application/javascript'))
  def worker(route):
   workers.append(1)
   if mode in ['continue','reload'] and len(workers)==1:body='onmessage=()=>{};'
   elif mode=='retry' and len(workers)==1:body="onmessage=({data})=>postMessage({id:data.id,error:'LOCAL_MODEL_FAILED'});"
   elif mode=='health-failure':body="import {MODEL_PACK} from '/src/learning/model-config.js';onmessage=({data})=>postMessage({id:data.id,result:data.action==='init'?{backend:'wasm',pack:MODEL_PACK}:{healthy:false}});"
   else:body=WORKER
   route.fulfill(body=body,content_type='application/javascript')
  context.route('**/src/learning/local-ai-worker.js',worker)
  page.goto(BASE);page.wait_for_function('window.testReady');create(page)
  if mode=='retry':
   page.get_by_role('button',name='Retry Download',exact=True).wait_for();identity=page.evaluate('testApp.state.mind.id');page.get_by_role('button',name='Retry Download',exact=True).click()
  elif mode in ['continue','reload']:
   page.wait_for_function('testApp.intelligence.loading && testApp.intelligence.worker!==undefined');identity=page.evaluate('testApp.state.mind.id')
   if mode=='reload':page.reload();page.wait_for_function('window.testReady')
   else:page.get_by_role('button',name='Continue with Native Intelligence',exact=True).click()
  elif mode=='health-failure':
   page.get_by_role('button',name='Retry Download',exact=True).wait_for();assert not page.evaluate('testApp.intelligence.ready');page.get_by_role('button',name='Continue with Native Intelligence',exact=True).click()
  page.wait_for_function('window.testApp?.state?.mind && document.querySelector("#onboarding").hidden')
  assert page.evaluate('testApp.state.mind.energy.remaining')==10
  assert page.evaluate('testApp.state.mind.lifetimeXP')==0
  assert page.evaluate('testApp.state.mind.memories.length')==0
  assert page.evaluate('testApp.state.mind.nodes.length')==5
  assert page.evaluate('testApp.state.mind.pathways.length')==3
  assert page.evaluate("async()=> (await testApp.db.getAll('identity')).length")==2
  assert page.evaluate("async()=> !(await indexedDB.databases()).some(d=>d.name==='mindling-preview-m4')")
  if mode in ['retry','continue','reload']:assert page.evaluate('testApp.state.mind.id')==identity
  if mode=='disabled':
   assert len(workers)==0
   page.locator('.local-intelligence summary').click();page.get_by_role('button',name='Download and enable local AI').click();page.wait_for_function('testApp.intelligence.ready');assert len(workers)==1
  elif mode in ['success','retry','reload']:assert page.evaluate('testApp.intelligence.ready')
  else:assert not page.evaluate('testApp.intelligence.ready')
  # Existing owners are not silently downloaded or sent through onboarding again.
  count=len(workers);saved_id=page.evaluate('testApp.state.mind.id');page.reload();page.wait_for_function('window.testReady');assert len(workers)==count
  assert page.locator('#onboarding').is_hidden();assert page.evaluate('testApp.state.mind.id')==saved_id
  assert not errors,errors
  print('PASS awakening:',mode,flush=True);context.close()
 browser.close()
