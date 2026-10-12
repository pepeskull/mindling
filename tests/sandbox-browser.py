"""M4 isolated sandbox integration. Run against the static server on port 8000.
Gemini responses here are explicit fixtures, never a live API verification.
"""
import os
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000')
ASSETS=Path(tempfile.mkdtemp(prefix='mindling-m4-three-'))
for name in ['three.module.min.js','three.core.min.js']:
    subprocess.run(['curl','--fail','--silent','--show-error','--max-time','45',f'https://cdn.jsdelivr.net/npm/three@0.180.0/build/{name}','-o',str(ASSETS/name)],check=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for backend in ['canvas','three']:
        context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page=context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/build/*',lambda r:r.abort() if backend=='canvas' else r.fulfill(path=str(ASSETS/r.request.url.rsplit('/',1)[1]),content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
        page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
        page.goto(BASE)
        page.evaluate('''async()=>{const {MindlingDatabase}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();await db.put('mindling',{id:'primary',name:'Protected production identity'});await db.put('memories',{id:'private-memory',content:'Private production content'});db.close();}''')
        page.unroute('**/js/bootstrap.js')
        page.add_init_script('''(()=>{const original=indexedDB.open.bind(indexedDB);window.__productionAccess=0;indexedDB.open=(name,...args)=>{if(name==='mindling-db'){window.__productionAccess++;throw Error('Production storage access from sandbox');}return original(name,...args);};})();''')
        page.goto(BASE+'/?stage-preview=1');page.wait_for_selector('.sandbox-controls')
        assert page.locator('#scene').get_attribute('data-backend')==backend
        page.on('dialog',lambda d:d.accept())
        page.locator('[data-sandbox="new"]').click();page.wait_for_function("document.querySelector('.hero-copy h1').textContent==='Test Mindling is learning.'")
        page.locator('.sandbox-controls summary').first.click();page.locator('[data-sandbox="fixture"]').click()
        page.wait_for_function("document.querySelector('[data-stat=memories]').textContent==='1'")
        assert page.locator('[data-stat=neurons]').text_content()=='6'
        assert page.locator('[data-energy-value]').text_content()=='8 / 10'
        page.locator('[data-hours="1"]').click();page.wait_for_function("document.querySelector('[data-diagnostics]').textContent.includes('Offset: 0.04')")
        page.locator('[data-sandbox="fixture"]').click();page.wait_for_function("document.querySelector('[data-sandbox-status]').textContent.includes('duplicate')")
        assert page.locator('[data-stat=memories]').text_content()=='1'
        # Explicit fixture response exercises the real client/schema/engine boundary, not the live Gemini service.
        submitted=[]
        assessment={'meaningful':True,'duplicate':False,'quality':.95,'concept':'gravitational attraction','memory':'Gravity attracts bodies with mass.','area':'Physics','kind':'concept','embedding':[0,1]+[0]*766}
        def learning_reply(route):
            submitted.append(route.request.post_data_json)
            route.fulfill(json={'assessment':assessment})
        page.route('**/api/preview-learning',learning_reply)
        page.locator('[data-api-token]').fill('fixture-access')
        page.locator('.sandbox-controls summary').first.click()
        page.locator('#mindling-input').fill('Gravity describes attraction between bodies with mass.')
        page.locator('#interaction-form button[type=submit]').click()
        page.wait_for_function("document.querySelector('[data-stat=memories]').textContent==='2'")
        assert submitted==[{'text':'Gravity describes attraction between bodies with mass.','pathway':'Researcher'}]
        page.locator('.sandbox-controls summary').first.click();page.locator('[data-hours="24"]').click()
        page.wait_for_function("document.querySelector('[data-diagnostics]').textContent.includes('Eligible: true')")
        page.locator('[data-sandbox="evolve"]').click();page.wait_for_function("document.querySelector('#scene').dataset.stage==='2'")
        assert page.locator('[data-stat=neurons]').text_content()=='7'
        page.locator('.sandbox-controls summary').first.click()
        page.locator('[data-view=memories]').click();assert page.locator('.memory-record').count()==2;page.locator('[data-close-memory]').click()
        page.locator('.energy-panel .coming-soon').click();page.wait_for_selector('.sandbox-wallet')
        assert page.locator('[data-wallet-qr] svg').count()==1
        assert 'simulation:' in page.locator('[data-wallet-id]').input_value()
        page.locator('[data-quote]').click();page.locator('[data-buy]').click()
        page.wait_for_function("document.querySelector('[data-energy-value]').textContent==='20 / 10'")
        assert 'No Solana transaction occurred' in page.locator('[data-wallet-status]').text_content()
        page.locator('[data-close-wallet]').click()
        page.locator('.sandbox-controls summary').first.click()
        page.locator('[data-hours="168"]').click();page.wait_for_function("document.querySelector('.hero-copy h1').textContent.includes('Neural Collapse')")
        assert page.locator('#mindling-input').is_disabled()
        page.locator('[data-sandbox="evolve"]').click();page.wait_for_function("document.querySelector('[data-sandbox-status]').textContent.includes('required')")
        state=page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return s;}''')
        assert len(state['tombstones'])==1 and len(state['player']['wallet']['receipts'])==1
        page.reload();page.wait_for_selector('.sandbox-controls');assert page.locator('#mindling-input').is_disabled()
        assert page.evaluate('window.__productionAccess')==0
        page.locator('[data-sandbox="new"]').click();page.wait_for_function("document.querySelector('.hero-copy h1').textContent==='Test Mindling is learning.'")
        after=page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return s;}''')
        assert after['player']==state['player'] and after['mind']['id']!=state['mind']['id']
        # Explicit unavailable Gemini request cannot mutate gameplay.
        page.locator('.sandbox-controls summary').first.click();page.locator('[data-api-token]').fill('test-only-token');page.locator('.sandbox-controls summary').first.click()
        page.unroute('**/api/preview-learning')
        page.route('**/api/preview-learning',lambda r:r.fulfill(status=503,json={'error':'GEMINI_NOT_CONFIGURED'}))
        page.locator('#mindling-input').fill('Photosynthesis converts sunlight into stored chemical energy.')
        page.locator('#interaction-form button[type=submit]').click()
        page.locator('.sandbox-controls summary').first.click();page.wait_for_function("document.querySelector('[data-sandbox-status]').textContent.includes('not configured')")
        assert page.locator('[data-energy-value]').text_content()=='10 / 10'
        assert page.locator('[data-stat=memories]').text_content()=='0'
        assert not errors,errors
        page.locator('.sandbox-controls summary').first.click();page.screenshot(path=f'/tmp/m4-{backend}.png')
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=f'/tmp/m4-{backend}-mobile.png')
        page.locator('[data-mobile-view=development]').click();assert page.locator('.left-stack').is_visible()
        context.close()
        print(f'PASS {backend}: learning, real sandbox stats, memory UI, death, wallet, persistence, no production access, mobile',flush=True)
    # Lifecycle runs against the real shell with bootstrap suppressed; no timers or network calls needed.
    life=browser.new_context(viewport={'width':1440,'height':1000}).new_page()
    life.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
    life.goto(BASE+'/?stage-preview=1')
    life.evaluate("""async()=>{
      const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
      for(let i=0;i<3;i++){
        const p=new SandboxPreview({forceCanvas:true});await p.start();
        const before=JSON.stringify(p.state);
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
        p.render(performance.now()+10000000);if(JSON.stringify(p.state)!==before)throw Error('Hidden state advanced');
        if(p.frame!==null)throw Error('Hidden frame still scheduled');
        delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
        p.destroy();p.destroy();
        if(p.frame!==null||document.querySelector('.sandbox-controls,.sandbox-wallet,.preview-peer-label,#scene canvas'))throw Error('Cleanup failed');
      }
      const interrupted=new SandboxPreview({forceCanvas:true}),starting=interrupted.start();interrupted.destroy();await starting;
      if(document.querySelector('.sandbox-controls,#scene canvas'))throw Error('Interrupted startup mounted UI');
    }""")
    print('PASS sandbox lifecycle: hidden time isolation, repeated teardown and interrupted startup',flush=True)
    browser.close()
