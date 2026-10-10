"""Optional real Chromium regression suite. Requires Python Playwright + Chromium.
Start: python3 -m http.server 8000 --bind 127.0.0.1
Run: python3 tests/evolution-browser.py
The CDN files are fetched with curl's verified TLS, then delivered unchanged to Chromium
because the cloud proxy CA is absent from its trust store. No certificate bypass is used.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8000')
CHROMIUM = os.environ.get('MINDLING_CHROMIUM', '/usr/bin/chromium')
ASSETS = Path(tempfile.mkdtemp(prefix='mindling-three-'))
for name in ['three.module.min.js', 'three.core.min.js']:
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '45',
                    f'https://cdn.jsdelivr.net/npm/three@0.180.0/build/{name}', '-o', str(ASSETS / name)], check=True)

INSTRUMENT = """(() => {
  const pending = new Set(); let peak = 0;
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => { const owned = cb.name === "render" || cb.name === "#renderFrame"; const id = request(t => { pending.delete(id); cb(t); }); if (owned) pending.add(id); peak = Math.max(peak,pending.size); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
  const events = new Map(), add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type,listener,...rest) { if (this===document && type==='visibilitychange') events.set(listener,true); return add.call(this,type,listener,...rest); };
  EventTarget.prototype.removeEventListener = function(type,listener,...rest) { if (this===document && type==='visibilitychange') events.delete(listener); return remove.call(this,type,listener,...rest); };
  let opens=0, writes=0; const open=indexedDB.open.bind(indexedDB);
  indexedDB.open=(...args)=>{ opens++; return open(...args); };
  for (const method of ['put','add','delete','clear']) { const original=IDBObjectStore.prototype[method]; IDBObjectStore.prototype[method]=function(...args){writes++; return original.apply(this,args);}; }
  window.__testMetrics=()=>({pending:pending.size,peak,opens,writes,visibilityListeners:events.size});
})();"""
SNAPSHOT = """async () => {
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mindling-db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const result={}; for(const name of db.objectStoreNames) result[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  db.close(); return JSON.stringify(result);
}"""

def route_three(page, blocked=False):
    def handle(route):
        if blocked: route.abort(); return
        route.fulfill(path=str(ASSETS / route.request.url.rsplit('/',1)[1]), content_type='application/javascript', headers={'Access-Control-Allow-Origin':'*'})
    page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/build/*', handle)
    # This suite exercises visual preview and Talk. AI model acquisition is out of scope.
    page.route('https://cdn.jsdelivr.net/npm/@huggingface/**', lambda r:r.abort())

def select(page, stage):
    page.locator('select[aria-label="Current Stage"]').select_option(str(stage))
    page.wait_for_function('(s)=>document.querySelector(".evolution-preview").dataset.stage===String(s)', arg=stage)
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1200,'height':900}, device_scale_factor=1, reduced_motion='reduce')
    page=context.new_page(); route_three(page); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    # Create real persisted state first, including a Life/energy transaction.
    page.goto(BASE); page.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:page.locator(f'[data-pathway="{name}"]').click()
    page.locator('[data-next]').click();page.locator('[data-next]').click();page.locator('#mindling-name').fill('Evolution Test');page.locator('[data-next]').click();page.locator('[data-create]').click()
    page.wait_for_function("document.querySelector('#onboarding').hidden")
    page.locator('#mindling-input').fill('Hello');page.locator('#interaction-form button[type=submit]').click();page.wait_for_function("document.querySelector('[data-energy-value]').textContent==='9 / 10'")
    before=page.evaluate(SNAPSHOT)
    page.add_init_script(INSTRUMENT)
    page.goto(BASE+'/?stage-preview=1');page.wait_for_selector('.evolution-preview[data-backend=three]')
    assert page.locator('[data-preview-playback]').inner_text()=='Paused · Reduced motion'
    for stage in range(1,8):
        select(page,stage)
        page.screenshot(path=f'/tmp/mindling-three-stage-{stage}.png')
    metrics=page.evaluate('window.__testMetrics()')
    assert metrics['opens']==0 and metrics['writes']==0,metrics
    assert metrics['pending']==1 and metrics['peak']==1,metrics
    assert page.evaluate(SNAPSHOT)==before,'Preview altered persistent state'
    assert page.locator('[data-action=next]').is_disabled()
    page.locator('[data-action=previous]').click();assert page.locator('.evolution-preview').get_attribute('data-stage')=='6'
    page.locator('[data-action=next]').click()
    # Enable motion to verify actual WebGL impulses as well as reduced-motion stages.
    page.emulate_media(reduced_motion="no-preference")
    page.locator('[data-action=connect]').click()
    page.wait_for_function("document.querySelector('[data-network-state]').textContent==='EXCHANGING'",timeout=30000)
    assert page.locator('[data-peer]').all_text_contents()==['EXCHANGING']*3
    page.screenshot(path='/tmp/mindling-three-network.png')
    page.locator('[data-action=disconnect]').click()
    assert page.locator('[data-network-state]').inner_text()=='DISCONNECTING'
    page.wait_for_function("document.querySelector('[data-network-state]').textContent==='DISCONNECTED'")
    page.locator('[data-action=restart]').click();assert page.locator('.evolution-preview').get_attribute('data-stage')=='1'
    page.locator('[data-action=pause]').click();page.locator('[data-action=play]').click()
    page.wait_for_function("document.querySelector('.evolution-preview').dataset.stage==='2'",timeout=10000)
    page.locator('[data-action=pause]').click()
    # Exercise the actual interaction listeners during rendering.
    page.mouse.move(450,350);page.mouse.down();page.mouse.move(650,430,steps=8);page.mouse.up();page.mouse.wheel(0,-200)
    page.locator('[data-action=exit]').click();page.wait_for_function("!document.querySelector('.evolution-preview') && document.querySelector('[data-life-status-title]').textContent.includes('Evolution Test')")
    page.wait_for_function("document.querySelector('[data-energy-value]').textContent==='9 / 10'")
    metrics=page.evaluate('window.__testMetrics()');assert metrics['pending']==1 and metrics['visibilityListeners']==1,metrics
    assert page.locator('#scene canvas').count()==1
    assert not errors,errors
    resources=page.evaluate("""async()=>{
      const T=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js');
      const {EvolutionScene}=await import('/src/preview/evolution-scene.js');
      const {NetworkSimulation}=await import('/src/preview/evolution-model.js');
      const host=document.createElement('div');document.body.append(host);
      const view=new EvolutionScene({three:T,reduced:true});view.mount(host);view.resize(320,240);view.select(7);view.render(0,0,new NetworkSimulation());
      const before={...view.renderer.info.memory};view.destroy();const after={...view.renderer.info.memory};host.remove();return {before,after};
    }""")
    assert resources['before']['geometries']>0 and resources['after']['geometries']==0 and resources['after']['textures']==0,resources
    print('PASS Three.js: all stages, network, controls, existing-player isolation, exit, one scheduler',flush=True)
    # Independent Canvas fallback, ordinary motion and mobile-sized controls.
    fallback=context.new_page();route_three(fallback,blocked=True);fallback.add_init_script(INSTRUMENT);fallback.emulate_media(reduced_motion='no-preference')
    fallback.goto(BASE+'/?stage-preview=1');fallback.wait_for_selector('.evolution-preview[data-backend=canvas]')
    fallback.locator('[data-action=pause]').click()
    for stage in range(1,8):
        select(fallback,stage);fallback.wait_for_timeout(1700);fallback.screenshot(path=f'/tmp/mindling-canvas-stage-{stage}.png')
    fallback.locator('[data-action=connect]').click();fallback.wait_for_function("document.querySelector('[data-network-state]').textContent==='EXCHANGING'",timeout=20000)
    fallback.screenshot(path='/tmp/mindling-canvas-network.png')
    metrics=fallback.evaluate('window.__testMetrics()');assert metrics['opens']==0 and metrics['writes']==0 and metrics['peak']==1,metrics
    fallback.set_viewport_size({'width':390,'height':844});fallback.screenshot(path='/tmp/mindling-preview-mobile.png')
    assert fallback.locator('[data-action=exit]').is_visible()
    fallback.locator('[data-action=disconnect]').click();fallback.wait_for_function("document.querySelector('[data-network-state]').textContent==='DISCONNECTED'")
    # Direct instance lifecycle checks teardown before any production renderer is started.
    fallback.locator('[data-action=exit]').click();fallback.wait_for_selector('#scene canvas')
    empty=context.new_page();route_three(empty,blocked=True);empty.add_init_script(INSTRUMENT)
    empty.route(BASE+'/__preview-test-harness',lambda r:r.fulfill(body='<html><body></body></html>',content_type='text/html'))
    empty.goto(BASE+'/__preview-test-harness')
    result=empty.evaluate("""async()=>{
      const {EvolutionPreview}=await import('/src/preview/evolution-preview.js');
      for(let i=0;i<3;i++){
        const p=new EvolutionPreview({forceCanvas:true});await p.start();
        if (__testMetrics().pending!==1) throw new Error('Expected one scheduler');
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
        if (__testMetrics().pending!==0) throw new Error('Hidden preview still animating');
        Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));
        if (__testMetrics().pending!==1) throw new Error('Duplicate resumed scheduler');
        p.destroy();p.destroy(); delete document.hidden;
      }
      return {metrics:__testMetrics(),previews:document.querySelectorAll('.evolution-preview').length};
    }""")
    assert result['metrics']['pending']==0 and result['metrics']['visibilityListeners']==0 and result['previews']==0,result
    print('PASS Canvas: seven stages, animated network, mobile controls, zero DB access, repeatable teardown',flush=True)
    browser.close()
