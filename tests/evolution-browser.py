"""Optional real Chromium regression suite. Requires Python Playwright + Chromium.
Start: python3 -m http.server 8000 --bind 127.0.0.1
Run: python3 tests/evolution-browser.py
The CDN files are fetched with curl's verified TLS, then delivered unchanged to Chromium
because the cloud proxy CA is absent from its trust store. No certificate bypass is used.
"""
import json
from support.browser_branding import verify_branding
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

def settle(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce')
    page=context.new_page();route_three(page);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    # Establish real persisted state via normal gameplay, then freeze a stale saved snapshot.
    page.goto(BASE);page.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:page.locator(f'[data-pathway="{name}"]').click()
    page.locator('[data-next]').click();page.locator('[data-next]').click();page.locator('#mindling-name').fill('Dashboard Test');page.locator('[data-next]').click();page.locator('[data-create]').click()
    page.wait_for_function("document.querySelector('#onboarding').hidden")
    page.locator('#mindling-input').fill('Hello');page.locator('#interaction-form button[type=submit]').click();page.wait_for_function("document.querySelector('[data-energy-value]').textContent==='9 / 10'")
    verify_branding(page, 'normal-desktop')
    page.set_viewport_size({'width':390,'height':844}); verify_branding(page, 'normal-mobile'); page.set_viewport_size({'width':1440,'height':1000})
    # Yesterday's energy must remain yesterday's energy in preview; do not run daily resets.
    page.evaluate("""async()=>{
      const db=await new Promise(r=>{const q=indexedDB.open('mindling-db');q.onsuccess=()=>r(q.result)});
      await new Promise((resolve,reject)=>{const tx=db.transaction('life','readwrite'),store=tx.objectStore('life'),r=store.get('primary');
        r.onsuccess=()=>{const life=r.result;life.energy.remaining=3;life.energy.utcDay='2020-01-01';life.lastSimulationAt=life.birthTimestamp;store.put(life)};
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
    }""")
    before=page.evaluate(SNAPSHOT)
    page.add_init_script(INSTRUMENT);page.emulate_media(reduced_motion='no-preference')
    page.goto(BASE+'/?stage-preview=1&preview-mode=demo');page.wait_for_selector('#scene[data-backend=three]')
    assert page.locator('.dashboard-chrome').is_visible()
    assert page.locator('.topbar').count()==1 and page.locator('#scene .preview-growth canvas').count()==1
    assert page.locator('.preview-toolbar, .evolution-preview, .preview-heading, [data-action]').count()==0
    assert page.locator('#scene').get_attribute('data-stage')=='1'
    assert page.locator('[data-energy-value]').inner_text()=='3 / 10'
    assert page.locator('#mindling-input').is_disabled()
    assert all(page.locator(selector).is_disabled() for selector in ['[data-care="CARE"]','[data-activity-mode="TEACH"]','#interaction-form button[type=submit]'])
    assert 'DASHBOARD TEST' in page.locator('[data-life-status-title]').inner_text()
    assert page.locator('.social-status em').text_content().lower()=='not connected'
    for stage in range(1,8):
        page.wait_for_function('(s)=>document.querySelector("#scene").dataset.stage===String(s)',arg=stage,timeout=15000)
        page.evaluate("""async(stage)=>{
          const {generateStage,STAGES}=await import('/src/preview/evolution-model.js');
          const {PRESETS}=await import('/src/preview/dashboard-presentation.js');
          const {conditionFor}=await import('/src/life/life-system.js');
          const q=s=>document.querySelector(s), check=(actual,expected)=>{if(actual!==expected)throw new Error(`Stage ${stage}: ${actual} != ${expected}`)};
          check(Number(q('#scene').dataset.stage),stage);
          const preset=PRESETS[stage-1];
          document.querySelectorAll('.stages li').forEach((row,i)=>check(row.querySelector('small').textContent,i+1<stage?'Completed':i+1===stage?'Current':'Locked'));
          check(q('.hero-copy p').textContent,`${STAGES[stage-1].name} · Stage ${String(stage).padStart(2,'0')}`);
          check(q('.hero-copy h1').textContent,'Dashboard Test is awake.');
          for(const [key,value] of Object.entries({neurons:STAGES[stage-1].count,synapses:generateStage(stage).edges.length,memories:preset.memories}))check(q(`[data-stat="${key}"]`).textContent,String(value));
          for(const [key,value] of Object.entries(preset.attributes)){check(q(`[data-life-attribute="${key}"] strong`).textContent,`${value}%`);check(q(`[data-life-attribute="${key}"] progress`).value,value)}
          check(q('[data-life-condition]').textContent,conditionFor(preset.attributes));
          check(q('.social-status em').textContent,'Not Connected');
        }""",stage)
        settle(page);page.screenshot(path=f'/tmp/dashboard-three-stage-{stage}.png')
    # Morph and subsequent countdown must finish before discovery begins.
    assert page.locator('#scene').get_attribute('data-network')=='DISCONNECTED'
    page.wait_for_function("document.querySelector('#scene').dataset.network==='EXCHANGING'",timeout=30000)
    page.screenshot(path='/tmp/dashboard-three-network.png')
    assert page.locator('.preview-stage-label, .preview-network-label, .hero-copy span').count()==0
    assert page.locator('.preview-simulated').is_visible()
    assert page.locator('.social-status em').text_content()=='Connected · 3 Mindlings · Active'
    assert page.locator('.preview-peer-label:visible').all_text_contents()==['Nova','Echo','Atlas']
    assert page.locator('#scene').get_attribute('data-stage')=='7'
    assert page.locator('[data-life-stage]').inner_text()=='Agent Mind'
    assert page.evaluate('window.__testMetrics().writes')==0
    assert page.evaluate(SNAPSHOT)==before
    # Navigation remains real shared Dashboard UI; memory inspection is read-only.
    page.locator('[data-view="memories"]').click();assert page.locator('#memory-view').is_visible()
    page.locator('[data-close-memory]').click()
    box=page.locator('#scene').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+50,box['y']+box['height']/2+20);page.mouse.up();page.mouse.wheel(0,-100)
    assert page.evaluate('window.__testMetrics().pending')==1
    assert not errors,errors
    # Reload without the parameter: gameplay really resumes and resets stale daily energy.
    verify_branding(page, 'demo-desktop')
    page.goto(BASE);page.wait_for_function("document.querySelector('[data-energy-value]').textContent==='10 / 10'")
    page.wait_for_function("!document.querySelector('#mindling-input').disabled && document.querySelectorAll('#scene canvas').length===1")
    assert page.locator('#mindling-input').is_enabled() and page.locator('#scene canvas').count()==1
    print('PASS Three.js: dashboard mount, automatic seven stages/network, saved data isolation, normal gameplay',flush=True)
    # A fresh profile must not acquire an empty database or fictional player data.
    fresh=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    fallback=fresh.new_page();route_three(fallback,blocked=True);fallback.add_init_script(INSTRUMENT)
    fallback.goto(BASE+'/?stage-preview=1&preview-mode=demo');fallback.wait_for_selector('#scene[data-backend=canvas]');verify_branding(fallback, 'demo-mobile')
    assert fallback.locator('[data-energy-value]').inner_text()=='—'
    assert fallback.evaluate('indexedDB.databases()')==[]
    fallback.wait_for_function("document.querySelector('#scene').dataset.stage==='7'",timeout=40000)
    fallback.wait_for_function("document.querySelector('#scene').dataset.network==='EXCHANGING'",timeout=25000)
    fallback.screenshot(path='/tmp/dashboard-canvas-mobile.png')
    assert fallback.locator('.preview-peer-label:visible').all_text_contents()==['Nova','Echo','Atlas']
    assert fallback.evaluate('window.__testMetrics().writes')==0
    assert fallback.evaluate('indexedDB.databases()')==[]
    fallback.locator('[data-mobile-view="development"]').click();assert fallback.locator('.left-stack').is_visible()
    fallback.locator('[data-mobile-view="memories"]').click();assert fallback.locator('#memory-view').is_visible()
    print('PASS Canvas/reduced motion: automatic final network, mobile panels, no saved data fabricated or created',flush=True)
    # Direct lifecycle/timing checks use the real dashboard markup, with bootstrap suppressed.
    harness=context.new_page();route_three(harness,blocked=True);harness.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));harness.add_init_script(INSTRUMENT);harness.emulate_media(reduced_motion='no-preference');harness.goto(BASE)
    result=harness.evaluate("""async()=>{
      const {EvolutionPreview}=await import('/src/preview/evolution-preview.js');
      for(let i=0;i<3;i++){
        const p=new EvolutionPreview({forceCanvas:true});await p.start();
        if(__testMetrics().pending!==1)throw new Error('Scheduler count');
        p.timeline.select(7);p.syncStage();p.view.morph.tick(2);p.transition=1;
        p.countdown.update(2,{stage:7,transitionComplete:true,network:p.timeline.network});
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
        if(__testMetrics().pending!==0)throw new Error('Hidden frames');
        const remaining=p.countdown.remaining;p.render(performance.now()+100000);
        if(p.countdown.remaining!==remaining)throw new Error('Hidden countdown advanced');
        Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));
        if(__testMetrics().pending!==1)throw new Error('Duplicate resumed frames');
        p.destroy();p.destroy();delete document.hidden;
      }
      const p=new EvolutionPreview({forceCanvas:true});await p.start();
      const step=time=>{cancelAnimationFrame(p.frame);p.frame=null;p.render(time);cancelAnimationFrame(p.frame);p.frame=null;};
      p.timeline.select(7);p.syncStage();p.lastTime=0;
      step(1000);if(p.countdown.remaining!==5 || p.view.morph.progress===1)throw new Error('Countdown before morph');
      step(1601);if(p.countdown.remaining!==5 || p.view.morph.progress!==1)throw new Error('Morph completion gate');
      step(6599);if(p.countdown.started)throw new Error('Countdown too short');
      step(6602);if(p.timeline.network.state!=='DISCOVERING')throw new Error('Automatic discovery missing');
      step(21000);step(100000);if(p.timeline.stage!==7 || p.timeline.network.state!=='EXCHANGING')throw new Error('Final network did not persist');
      p.destroy();return __testMetrics();
    }""")
    assert result['pending']==0 and result['visibilityListeners']==0,result
    print('PASS lifecycle: repeated read-only dashboard mount, hidden countdown pause, single resume and cleanup',flush=True)
    for backend, viewport in [(b, v) for b in ['three','canvas'] for v in [{'width':1440,'height':1000}, {'width':390,'height':844}]]:
        labels=context.new_page();route_three(labels,blocked=backend=='canvas');labels.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));labels.goto(BASE)
        labels.set_viewport_size(viewport)
        labels.evaluate("""async(backend)=>{
          const {EvolutionPreview}=await import('/src/preview/evolution-preview.js');
          const p=new EvolutionPreview({forceCanvas:backend==='canvas'});await p.start();cancelAnimationFrame(p.frame);p.frame=null;
          p.timeline.pause();p.timeline.select(7);p.syncStage();p.view.select(7);p.view.morph.tick(2);
          const draw=()=>{p.view.render(0,0,p.timeline.network);p.refreshNetwork();};draw();
          if(!p.originalFraming||p.view.useSharedFraming)throw new Error('Original fixed framing missing');
          if(getComputedStyle(p.seedHost).transform!=='matrix(0.5, 0, 0, 0.5, 0, 0)')throw new Error('Original seed scale missing');
          const framing=()=>{
            if(p.view.three)return [...p.view.camera.projectionMatrix.elements,p.view.camera.position.z,...p.view.root.scale.toArray()];
            const out=new Float32Array(2);const scale=p.view.project(p.view.buffers.positions,0,out);return [scale,...out];
          };
          const fixed=JSON.stringify(framing());p.timeline.network.start();
          for(const delta of [.4,.9,3,10]){p.timeline.network.tick(delta);draw();if(JSON.stringify(framing())!==fixed)throw new Error(`Network ${p.timeline.network.state} changed framing`);}
          if(p.timeline.network.state!=='EXCHANGING')throw new Error('Network did not connect');
          const positions=()=>p.view.labels.map((el,i)=>{const anchor=p.view.projectRemote(i);if(el.hidden||Math.abs(parseFloat(el.style.left)-anchor.x)>1||Math.abs(parseFloat(el.style.top)-anchor.y)>1)throw new Error('Unanchored label');return el.style.left+el.style.top;});
          const before=positions();p.interaction.rotation.y+=.3;draw();const rotated=positions();if(before.every((v,i)=>v===rotated[i]))throw new Error('Rotation did not move labels');
          p.interaction.zoom=.8;draw();const zoomed=positions();if(rotated.every((v,i)=>v===zoomed[i]))throw new Error('Zoom did not move labels');
          p.timeline.network.stop();p.timeline.network.tick(2);draw();if(p.view.labels.some(el=>!el.hidden))throw new Error('Disconnected labels');
          p.destroy();if(document.querySelector('.preview-peer-label,.preview-simulated'))throw new Error('Label cleanup');
          if(document.querySelector('#app').classList.contains('original-preview-framing'))throw new Error('Framing class cleanup');
        }""",backend)
        labels.close()
        print(f'PASS {backend} {viewport["width"]}px: fixed network framing, projected peer labels, rotation, zoom, disconnect and cleanup',flush=True)
    browser.close()
