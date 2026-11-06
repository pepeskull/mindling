"""Local-only rendering fixtures. Screenshots are synthetic event demonstrations."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8769')
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/screenshots'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for preview in [False,True]:
        context=browser.new_context(viewport={'width':1600,'height':1050},device_scale_factor=1)
        requests=[];errors=[]
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
        context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if '/api/' in r.url else None)
        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        print(page.evaluate('''async preview=>{
          const {NetworkView}=await import('/src/network/network-view.js');
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
          const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
          const initial=newMindling(createSandbox(Date.now()),{confirmed:true,id:preview?'v2-preview':'v2-normal',name:'Network fixture'});
          const change=fn=>preview?db.change(fn):db.changeGameplay(fn);await change(()=>initial);
          const read=()=>preview?db.read():db.get('gameplay','primary').then(x=>x.state);
          const before=JSON.stringify(await read());
          document.querySelectorAll('.installation,.onboarding-overlay').forEach(el=>el.remove());
          document.querySelector('.dashboard-chrome').classList.remove('is-hidden');const root=document.querySelector('#network-view');root.hidden=false;document.querySelector('#app').classList.add('network-mode');
          let now=1800000000000;const view=new NetworkView(root,{clock:()=>now});view.update({...initial.mind,mindlingId:initial.mind.id});view.setVisible(true);
          const check=(ok,message)=>{if(!ok)throw Error(message);};
          // Explicit synthetic fixture: actual adapter contract, deterministic timestamps.
          const offsets=[[-9700,-8400,-6100,-3400,-850],[-9200,-7200,-5700,-4200,-1900],[-9900,-7900,-4900,-2700,-500]];
          const channels=['TALK','TEACH','DEEP_TRAINING'];
          offsets.forEach((times,c)=>times.forEach((offset,i)=>view.model.ingest({id:`fixture-${c}-${i}`,activity:channels[c],phase:i%2?'start':'accepted'},now+offset)));
          view.model.last=null;view.model.size=0;view.model.head=0;view.sync();root.querySelector('h2').textContent='NETWORK · SYNTHETIC TEST FIXTURE';
          check(view.spectrum.gl&&!view.spectrum.lost,'WebGL2 cloud unavailable');check(view.frame!==null,'RAF missing');
          check(root.querySelectorAll('.network-panel').length===3,'panel count');
          check(JSON.stringify(await read())===before,'visualization mutated IndexedDB');
          view.setVisible(false);check(view.frame===null,'hidden frame leak');view.setVisible(true);
          window.view=view;window.advance=ms=>{now+=ms;view.draw();};window.db=db;window.before=before;window.read=read;
          return `${preview?'Preview':'Normal'}: WebGL2, shared fixture, three panels, isolated read-only database passed`;
        }''',preview))
        page.wait_for_timeout(200)
        if not preview:
            page.locator('#network-view').screenshot(path=str(OUT/'network-v2-desktop.png'))
            page.locator('.network-cloud').screenshot(path=str(OUT/'network-v2-cloud.png'))
        page.locator('[data-mode="2d"]').click()
        assert page.locator('[data-fallback]').is_visible()
        page.locator('[data-mode="3d"]').click()
        page.evaluate("window.loseContext=window.view.spectrum.gl.getExtension('WEBGL_lose_context');window.loseContext.loseContext()")
        page.wait_for_function('window.view.spectrum.lost===true')
        assert page.locator('[data-fallback]').is_visible()
        page.evaluate("window.loseContext.restoreContext()")
        page.wait_for_function('window.view.spectrum.lost===false')
        page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
        assert page.evaluate('window.view.frame===null')
        page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
        page.emulate_media(reduced_motion='reduce');page.wait_for_function('window.view.frame===null')
        assert page.evaluate('window.view.frame===null')
        page.emulate_media(reduced_motion='no-preference');page.wait_for_timeout(80)
        page.locator('[data-pause]').click();assert page.evaluate('window.view.frame===null')
        assert page.evaluate("()=>{const before=JSON.stringify(view.currentValues);advance(1000);view.ingest({id:'while-paused',activity:'TALK',phase:'accepted'});return before===JSON.stringify(view.currentValues);}")
        page.locator('[data-pause]').click()
        page.set_viewport_size({'width':430,'height':930});page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        if not preview: page.locator('#network-view').screenshot(path=str(OUT/'network-v2-narrow.png'))
        page.evaluate('window.advance(35000)')
        assert page.evaluate("window.view.currentValues.every(v=>v===0)&&!document.querySelector('.network-empty').hidden")
        assert page.evaluate('async()=>JSON.stringify(await window.read())===window.before')
        page.evaluate('window.gpu=window.view.spectrum.gl;window.program=window.view.spectrum.program;window.view.destroy();window.db.close()')
        assert page.evaluate('!window.gpu.isProgram(window.program)')
        assert page.evaluate('window.view.frame===null')
        assert not requests,requests
        assert not errors,errors
        context.close()
    browser.close()
print('PASS: normal/preview WebGL2, fallback, context loss/restoration, reduced motion, pause, idle, viewport, teardown; zero API requests.')
