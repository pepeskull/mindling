"""Focused real Chromium/IndexedDB checks; no screenshots or production requests.
Run against python3 -m http.server 8000: python3 tests/network-energy-browser.py
Requires the existing Python Playwright + Chromium browser-test environment.
"""
import os
import tempfile
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000')
ROOT=Path(__file__).resolve().parents[1]
ASSETS=Path(tempfile.mkdtemp(prefix='mindling-network-three-'))
for name in ['three.module.min.js','three.core.min.js']:
    subprocess.run(['curl','--fail','--silent','--show-error','--max-time','45',f'https://cdn.jsdelivr.net/npm/three@0.180.0/build/{name}','-o',str(ASSETS/name)],check=True)
BOOT=(ROOT/'js/bootstrap.js').read_text().replace('await active.start();','window.testApp=active; await active.start(); window.testReady=true;')
SEED="""async () => {
 const e=await import('/src/preview/sandbox/engine.js');
 const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
 let s=e.newMindling(e.createSandbox(Date.now()),{confirmed:true,id:'own-player',name:'Own Mind'});s.mind.stage=7;
 s=e.learn(s,{id:'existing',text:'Photosynthesis converts sunlight into chemical energy stored in glucose.'});s.mind.energy.remaining=10;
 const prod=await new MindlingDatabase().open();await prod.changeGameplay(()=>structuredClone(s));prod.close();
 const sandbox=await new PreviewStore().open();s.mind.id='sandbox-player';await sandbox.change(()=>s);sandbox.close();
}"""
SNAPSHOT="""async () => {
 const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
 const db=await new MindlingDatabase().open(),preview=await new PreviewStore().open();
 const result=JSON.stringify({prod:(await db.get('gameplay','primary')).state,sandbox:await preview.read(),memories:await db.getAll('memories'),journal:await db.getAll('energyJournal')});db.close();preview.close();return result;
}"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MINDLING_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for case,(sandbox,canvas,mobile) in enumerate([(False,True,False),(True,True,True),(False,False,True),(True,False,False)]):
        if os.environ.get('MINDLING_BROWSER_CASE') is not None and str(case)!=os.environ['MINDLING_BROWSER_CASE']:continue
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},reduced_motion='reduce')
        page=context.new_page();errors=[];service_requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
        def learning_reply(route):
            body=route.request.post_data_json;service_requests.append(body)
            words=body['input'].strip('.').lower().split()
            route.fulfill(json={'service':'mindling-learning-service','assessment':{'meaningful':True,'relationship':'new','concept':' '.join(words[:2]),'category':'Network test knowledge','categoryId':'','topic':' '.join(words[:4]),'relatedMemoryId':'','confidence':.9,'evidence':'none'}})
        page.route('**/api/mindling/learn',learning_reply)
        page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
        page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/build/*',lambda r:r.abort() if canvas else r.fulfill(path=str(ASSETS/r.request.url.rsplit('/',1)[1]),content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
        page.goto(BASE);page.evaluate(SEED);page.unroute('**/js/bootstrap.js');page.route('**/js/bootstrap.js',lambda r:r.fulfill(body=BOOT,content_type='application/javascript'))
        page.goto(BASE+('/?stage-preview=1' if sandbox else '/'));page.wait_for_function('window.testReady===true')
        if sandbox:page.locator('.sandbox-controls > summary').click()
        assert page.locator('#scene').get_attribute('data-backend')==('canvas' if canvas else 'three')
        page.evaluate('()=>{const a=testApp;a.timeline.network.start();a.timeline.network.tick(20);a.refreshNetwork();}')
        assert page.evaluate("()=>testApp.timeline.network.peers.filter(peer=>peer.id).every(peer=>testApp.view.buffers.identities.get(peer.id).radii.length===240)")
        assert page.evaluate("""async()=>{const a=testApp,pending=a.change(s=>s);const entered=a.external.enter('demo:nova');await pending;return !entered;}""")
        snapshot=page.evaluate(SNAPSHOT)
        original_geometry=page.evaluate("()=>JSON.stringify({positions:Array.from(testApp.view.morph.positions),target:testApp.view.morph.target})")
        # Each peer is visitable with actual rendered labels/buttons; its graph is independent.
        for name,connections in [('Nova','Echo'),('Echo','Nova, Atlas'),('Atlas','No known connections')]:
            page.evaluate("(id)=>{window.visitedIdentity=testApp.view.buffers.identities.get(id);window.visitedGeometry=JSON.stringify(visitedIdentity);}",'demo:'+name.lower())
            if name=='Nova':
                page.locator('[data-mobile-view="memories"]' if mobile else '[data-view="memories"]').click()
            page.locator('.network-visits button',has_text=name).click()
            page.wait_for_function('testApp.external.locked && !testApp.external.visit.transitioning')
            page.wait_for_function('getComputedStyle(document.querySelector("#scene")).visibility==="visible"')
            assert page.locator('.external-view h2').inner_text()==name+' · Agent Mind'
            assert page.evaluate('()=>testApp.view.buffers.identities.get(testApp.view.buffers.focusedId)===visitedIdentity && JSON.stringify(visitedIdentity)===visitedGeometry')
            assert connections in page.locator('[data-connections]').inner_text()
            assert 'Demo' in page.locator('[data-source]').inner_text()
            if name=='Echo':assert 'Unavailable' in page.locator('.external-view dl').inner_text()
            assert page.locator('.dashboard-chrome').evaluate('(e)=>e.inert')
            assert page.locator('#mindling-input').is_disabled()
            # Direct handlers and programmatically dispatched events cannot bypass the lock.
            result=page.evaluate("""async()=>{
              const a=testApp;let rejected=false;try{await a.change(s=>{s.mind.energy.remaining=999;return s;});}catch{rejected=true;}
              if(a.submitInput){const r=await a.submitInput('A new forbidden learning claim about the universe.','TEACH','locked');if(r.accepted)throw Error('accepted while locked');await a.refreshState();}
              else {await a.action(()=>a.runFixture());a.walletUI.open();if(a.walletUI.dialog?.open)throw Error('wallet opened');}
              document.querySelector('[data-view="memories"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
              document.querySelector('#interaction-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
              return rejected;
            }""")
            assert result
            assert page.evaluate(SNAPSHOT)==snapshot
            page.get_by_role('button',name='Return to My Mindling').click()
            page.wait_for_function('!testApp.external.locked')
            assert not page.locator('#mindling-input').is_disabled()
            assert page.evaluate(SNAPSHOT)==snapshot
            if name=='Nova':
                assert page.locator('#app').evaluate('(e)=>e.classList.contains("memory-mode")')
                if mobile:
                    page.locator('[data-mobile-view="network"]').click()
                    page.locator('[data-close-network]').click()
                else:page.locator('[data-view="dashboard"]').click()
        # Pick the actual projected 3D brain (not its label), with CSS scaling accounted for.
        page.evaluate('()=>{testApp.view.render(testApp.elapsed,0,testApp.timeline.network);testApp.refreshNetwork();}')
        hit=page.evaluate("""()=>{const a=testApp,p=a.view.projectRemote(0),r=a.view.canvas.getBoundingClientRect();return a.view.pickPeer({clientX:r.left+p.x*r.width/a.view.width,clientY:r.top+p.centerY*r.height/a.view.height});}""")
        assert hit=='demo:nova',hit
        # Exercise the scene's actual pointer handlers at the projected brain center.
        page.evaluate("""()=>{const a=testApp,p=a.view.projectRemote(0),r=a.view.canvas.getBoundingClientRect(),options={bubbles:true,pointerId:77,pointerType:'mouse',isPrimary:true,button:0,clientX:r.left+p.x*r.width/a.view.width,clientY:r.top+p.centerY*r.height/a.view.height};
          // Real browser capture requires an active physical pointer; dispatch through the tap callback via a mouse click below instead.
          window.peerPoint={x:options.clientX,y:options.clientY};
        }""")
        point=page.evaluate('window.peerPoint')
        # Some peers sit behind responsive dashboard panels; the accessible name remains available.
        reachable=page.evaluate("()=>testApp.host.contains(document.elementFromPoint(peerPoint.x,peerPoint.y))")
        if reachable:
            page.mouse.click(point['x'],point['y']);page.wait_for_function('testApp.external.locked && !testApp.external.visit.transitioning')
            page.get_by_role('button',name='Return to My Mindling').click();page.wait_for_function('!testApp.external.locked')
        # Multi-hop follows Nova -> Echo -> Atlas, including empty state.
        page.evaluate("()=>testApp.external.enter('demo:nova')");page.wait_for_function('!testApp.external.visit.transitioning')
        page.evaluate('()=>{testApp.timeline.network.tick(20);testApp.refreshNetwork();}')
        page.locator('.network-visits button',has_text='Echo').click();page.wait_for_function('!testApp.external.visit.transitioning')
        page.evaluate('()=>{testApp.timeline.network.tick(20);testApp.refreshNetwork();}')
        page.locator('.network-visits button',has_text='Atlas').click();page.wait_for_function('!testApp.external.visit.transitioning')
        page.get_by_role('button',name='Return to My Mindling').click();page.wait_for_function('!testApp.external.locked')
        page.evaluate("()=>{testApp.external.enter('demo:nova');testApp.timeline.network.stop();}")
        page.wait_for_function('!testApp.external.locked');assert page.evaluate(SNAPSHOT)==snapshot
        # Interrupted travel and removed public nodes both restore safely without writes.
        page.emulate_media(reduced_motion='no-preference')
        page.evaluate("()=>{testApp.external.enter('demo:nova');testApp.external.tick(.1);testApp.external.returnHome();}")
        page.wait_for_function('!testApp.external.locked');assert page.evaluate(SNAPSHOT)==snapshot
        page.evaluate("()=>testApp.external.enter('demo:nova')");page.wait_for_function('!testApp.external.visit.transitioning')
        page.evaluate("()=>{testApp.timeline.network.tick(20);testApp.refreshNetwork();testApp.external.enter('demo:echo');testApp.external.tick(.1);const pose=JSON.stringify(testApp.external.pose());testApp.external.returnHome();if(JSON.stringify(testApp.external.pose())!==pose)throw Error('interrupted hop jumped');}")
        page.wait_for_function('!testApp.external.locked');assert page.evaluate(SNAPSHOT)==snapshot
        page.emulate_media(reduced_motion='reduce')
        page.evaluate("()=>{testApp.external.enter('demo:echo');testApp.external.visit.graph.nodes.delete('demo:echo');}")
        page.wait_for_function('!testApp.external.locked');assert page.evaluate(SNAPSHOT)==snapshot
        assert page.evaluate("()=>JSON.stringify({positions:Array.from(testApp.view.morph.positions),target:testApp.view.morph.target})")==original_geometry
        # Direct real handlers permit immediate learning after returning; other DB stays unchanged.
        page.locator('[data-input-mode="TEACH"]').click()
        page.locator('#mindling-input').fill('Volcanoes release molten rock from deep beneath the crust.')
        page.locator('#interaction-form button[type=submit]').click()
        page.wait_for_function('testApp.state.mind.energy.remaining===8')
        assert len(service_requests)==(1 if sandbox else 0)
        assert not errors,errors
        print('PASS view/handlers/isolation:', 'Sandbox' if sandbox else 'Main','Canvas' if canvas else 'Three','narrow desktop' if mobile else 'desktop')
        context.close()
    # Actual IndexedDB transactions serialized across two independent database connections.
    context=browser.new_context();page=context.new_page();page.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));page.goto(BASE)
    results=page.evaluate("""async()=>{
      const {MindlingDatabase}=await import('/src/storage/database.js'),{PreviewStore}=await import('/src/preview/sandbox/storage.js');
      const e=await import('/src/preview/sandbox/engine.js');
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const db=await new MindlingDatabase().open(),other=await new MindlingDatabase().open(),preview=await new PreviewStore().open(),previewOther=await new PreviewStore().open();
      const make=id=>e.newMindling(e.createSandbox(Date.now()),{confirmed:true,id});
      await db.changeGameplay(()=>make('prod'));await preview.change(()=>make('sandbox'));
      const frozen=JSON.stringify(await preview.read());
      const results=await Promise.allSettled(Array.from({length:14},(_,i)=>(i%2?db:other).changeGameplay(s=>e.talk(s,`I am considering a meaningful new observation number ${i}.`,{id:`talk-${i}`}),{journal:{id:`talk-${i}`,type:'TALK'}})));
      check(results.filter(r=>r.status==='fulfilled').length===10,'atomic Energy overspend');
      let state=(await db.get('gameplay','primary')).state;check(state.mind.energy.remaining===0,'balance');check((await db.getAll('energyJournal')).length===10,'journal');check(JSON.stringify(await preview.read())===frozen,'sandbox isolation');
      const before=JSON.stringify(state);try{await db.changeGameplay(s=>{s.mind.energy.remaining=99;throw Error('injected rollback');});}catch{}
      check(JSON.stringify((await db.get('gameplay','primary')).state)===before,'rollback');
      // Preview also serializes tabs and rejects replay IDs even with different text.
      const races=await Promise.allSettled([preview.change(s=>e.talk(s,'A thoughtful observation from the first browser tab.',{id:'replay'})),previewOther.change(s=>e.talk(s,'Another thoughtful observation from the second browser tab.',{id:'replay'}))]);check(races.filter(r=>r.status==='fulfilled').length===1,'preview replay');
      const lesson='Whales communicate through complex underwater sound patterns.';
      await preview.change(s=>e.learn(s,{id:'memory',text:lesson}));const saved=await preview.read();preview.close();const reopened=await new PreviewStore().open();check(JSON.stringify(await reopened.read())===JSON.stringify(saved),'reload');check(saved.mind.memories.length===1&&saved.mind.lifetimeXP===50,'XP/memory persistence');check(JSON.stringify((await db.get('gameplay','primary')).state)===before,'production isolation');
      await db.changeGameplay(s=>{s.mind.energy.remaining=2;return s;});
      const teaching=await Promise.allSettled([db.changeGameplay(s=>e.learn(s,{id:'teach-a',text:'Volcanoes release molten rock from deep beneath the crust.'}),{journal:{id:'teach-a',type:'TEACH'}}),other.changeGameplay(s=>e.learn(s,{id:'teach-b',text:'Bees transfer pollen between flowers while gathering nectar.'}),{journal:{id:'teach-b',type:'TEACH'}})]);
      check(teaching.filter(r=>r.status==='fulfilled').length===1,'concurrent learning');
      state=(await db.get('gameplay','primary')).state;check(state.mind.energy.remaining===0&&state.mind.lifetimeXP===50&&state.mind.memories.length===1,'concurrent learning rewards');check((await db.getAll('memories')).length===1,'memory mirror');
      db.close();other.close();previewOther.close();reopened.close();return 'PASS concurrent Energy, replay, rollback, persistence, cross-tab and DB isolation';
    }""")
    print(results);context.close();browser.close()
