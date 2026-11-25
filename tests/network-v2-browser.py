"""Local-only rendering and lifecycle checks; no screenshots or model calls."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8769')
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
          const {DevelopmentView}=await import('/src/development/development-view.js');
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
          const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
          const initial=newMindling(createSandbox(Date.now()),{confirmed:true,id:preview?'v2-preview':'v2-normal',name:'Network fixture'});
          initial.mind.memories=Array.from({length:24},(_,i)=>({id:'stored-fixture-'+i,content:`Synthetic retained observation ${i}.`,category:'Fixture knowledge',neuronIds:['origin'],synapseIds:[],relatedMemoryIds:i?['stored-fixture-'+(i-1)]:[]}));
          const change=fn=>preview?db.change(fn):db.changeGameplay(fn);await change(()=>initial);
          const read=()=>preview?db.read():db.get('gameplay','primary').then(x=>x.state);
          const before=JSON.stringify(await read());
          document.querySelectorAll('.installation,.onboarding-overlay').forEach(el=>el.remove());
          document.querySelector('.dashboard-chrome').classList.remove('is-hidden');const root=document.querySelector('#development-view');root.hidden=false;document.querySelector('#app').classList.add('development-mode');
          let now=1800000000000;const development=new DevelopmentView(root),view=development.cloud;view.clock=()=>now;development.update(initial.mind);development.setVisible(true);
          const check=(ok,message)=>{if(!ok)throw Error(message);};
          // The visible baseline uses the stored fixture, with no interaction events.
          check(view.model.events.length===0&&view.brain.summary.memories===24,'not a stored baseline');
          const first=view.brain.height(.4,now);now+=6000;view.draw();check(view.brain.height(.4,now)!==first,'idle brain not living');
          check(view.model.values(now).every(v=>v===0),'baseline fabricated user activity');
          check(root.querySelectorAll('.development-evolution [data-cloud]').length===1,'cloud outside Neural Evolution');
          check(view.spectrum.gl&&!view.spectrum.lost,'WebGL2 cloud unavailable');check(view.frame!==null,'RAF missing');
          check(!root.querySelector('[data-bars],[data-lines]'),'removed activity panels remain');
          check(JSON.stringify(await read())===before,'visualization mutated IndexedDB');
          view.setVisible(false);check(view.frame===null,'hidden frame leak');view.setVisible(true);
          window.development=development;window.view=view;window.advance=ms=>{now+=ms;view.draw();};window.db=db;window.before=before;window.read=read;
          return `${preview?'Preview':'Normal'}: WebGL2, shared fixture, one cloud, isolated read-only database passed`;
        }''',preview))
        page.wait_for_timeout(200)
        assert page.evaluate('view.mode==="3d"')
        assert page.locator('.network-controls,[data-pause],[data-history]').count()==0
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
        page.set_viewport_size({'width':430,'height':930});page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.evaluate('window.advance(35000)')
        assert page.evaluate("window.view.model.values(0).every(v=>v===0)&&window.view.brain.alive&&window.view.frame!==null")
        assert page.evaluate('async()=>JSON.stringify(await window.read())===window.before')
        page.evaluate('window.gpu=window.view.spectrum.gl;window.program=window.view.spectrum.program;window.development.destroy();window.db.close()')
        assert page.evaluate('!window.gpu.isProgram(window.program)')
        assert page.evaluate('window.view.frame===null')
        assert not requests,requests
        assert not errors,errors
        context.close()
    browser.close()
print('PASS: normal/preview WebGL2, fallback, context loss/restoration, reduced motion, fixed 30s history, idle, viewport, teardown; zero API requests.')
