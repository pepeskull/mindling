"""M3 read-only Memory map: persisted fixtures, real shell, Canvas interactions,
rehydration, no Energy/API/storage changes, lifecycle and large data. No model calls.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000')
SHOTS=Path(os.environ.get('M3_SCREENSHOTS','/tmp/mindling-m3-screenshots'))
SHOTS.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1100},reduced_motion='reduce')
    page=context.new_page();errors=[];api=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
    page.route('**/api/**',lambda r:(api.append(r.request.url),r.abort()))
    page.goto(BASE);page.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:page.locator(f'[data-pathway="{name}"]').click()
    page.locator('[data-next]').click();page.locator('[data-next]').click();page.locator('#mindling-name').fill('Demo');page.locator('[data-next]').click();page.locator('[data-create]').click();page.wait_for_function("document.querySelector('#onboarding').hidden")
    page.locator('[data-view=memories]').click();page.wait_for_function("document.querySelector('.memory-stat-strip strong')?.textContent==='0'")
    assert page.locator('.graph-empty').is_visible()
    assert page.locator('.coverage-values li').count()==0
    assert page.locator('.memory-overall').count()==0
    page.screenshot(path=str(SHOTS/'m3-empty.png'))
    # Seed only the explicit synthetic browser fixture through the real existing DB.
    page.evaluate('''async()=>{const {MindlingDatabase}=await import('/src/storage/database.js');const {memoryFixtures}=await import('/tests/support/m3-memory-fixtures.js');const db=await new MindlingDatabase().open();await db.changeGameplay(s=>{s.mind.memories=memoryFixtures();return s;});db.close();}''')
    page.reload();page.locator('[data-view=memories]').click();page.wait_for_function("document.querySelector('.memory-stat-strip strong')?.textContent==='33'")
    snapshot='''async()=>{const {MindlingDatabase,databaseConfig}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();const result={};for(const name of databaseConfig.stores)result[name]=await db.getAll(name);db.close();return JSON.stringify(result);}'''
    before=page.evaluate(snapshot)
    assert page.locator('.coverage-values li').count()==6
    assert 'Coverage, not measured skill' in page.locator('.radar-method').text_content()
    # Wheel zoom and drag panning never select a node.
    canvas=page.locator('.memory-graph-stage canvas');bounds=canvas.bounding_box()
    zoom=page.locator('[data-zoom-level]').text_content()
    page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
    page.mouse.wheel(0,-280);page.wait_for_function('(old)=>document.querySelector("[data-zoom-level]").textContent!==old',arg=zoom)
    page.mouse.down();page.mouse.move(bounds['x']+bounds['width']/2+70,bounds['y']+bounds['height']/2+30,steps=8);page.mouse.up()
    assert page.locator('#memory-inspector-title').text_content()=='Follow a thought.'
    page.locator('[data-graph-action=fit]').click()
    # Keyboard index, selected inspector, collapsed technical metadata.
    page.locator('.memory-browser summary').click()
    page.locator('[data-select-memory]').first.focus();page.keyboard.press('Enter')
    assert page.locator('.inspector-memory-text').text_content()=='Words carry meaning through context.'
    assert not page.locator('.memory-advanced').evaluate('(e)=>e.open')
    page.locator('.memory-advanced summary').click();assert 'm3-0-0' in page.locator('.memory-advanced').text_content()
    page.locator('.memory-advanced summary').click();page.locator('.memory-browser summary').click()
    page.locator('[data-graph-action=fit]').click();page.evaluate("document.querySelector('#memory-view').scrollTop=0;document.querySelector('.memory-inspector').scrollTop=0")
    page.screenshot(path=str(SHOTS/'m3-network.png'))
    # Area filtering and a connected memory that crosses that filter.
    area=page.locator('[data-area-filter] option',has_text='Language').get_attribute('value')
    page.locator('[data-area-filter]').select_option(area)
    page.locator('.memory-browser summary').click();page.locator('[data-select-memory]').first.click();page.locator('.memory-browser summary').click()
    cross=page.locator('.related-memory-button',has_text='Tests describe observable behavior.')
    assert cross.count()==1;cross.click()
    assert page.locator('[data-area-filter]').input_value()=='all'
    assert 'Tests describe observable behavior.' in page.locator('.inspector-memory-text').text_content()
    page.locator('[data-memory-search]').fill('favorite programming language')
    page.locator('.memory-browser summary').click();page.locator('[data-select-memory]').first.click();page.locator('.memory-browser summary').click()
    assert 'Python' in page.locator('.inspector-memory-text').text_content()
    assert page.locator('.memory-value-history').count()==1
    page.locator('.memory-value-history summary').click();assert 'JavaScript' in page.locator('.memory-value-history').text_content()
    page.locator('[data-graph-action=reset]').click()
    assert page.locator('[data-memory-search]').input_value()==''
    assert page.evaluate(snapshot)==before,'Visualization mutated IndexedDB'
    assert api==[],'Opening/interacting with Memory called an API'
    page.locator('[data-close-memory]').click();assert not page.locator('#memory-view').is_visible()
    # A real, native successful Teach updates the view on the next navigation.
    page.locator('[data-input-mode=TEACH]').click();page.locator('#mindling-input').fill('Whales communicate across long distances through underwater sound patterns.')
    page.locator('#interaction-form button[type=submit]').click();page.wait_for_function("document.querySelector('[data-stat=memories]').textContent==='34'")
    page.locator('[data-view=memories]').click();page.wait_for_function("document.querySelector('.memory-stat-strip strong')?.textContent==='34'")
    assert api==[]
    page.reload();page.locator('[data-view=memories]').click();page.wait_for_function("document.querySelector('.memory-stat-strip strong')?.textContent==='34'")
    page.set_viewport_size({'width':1100,'height':850});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');assert page.locator('[data-graph-action=fit]').is_visible()
    page.set_viewport_size({'width':1600,'height':1100})
    assert not errors,errors
    print('PASS real shell: empty state, graph/radar, wheel zoom, drag suppression, keyboard selection, inspector/history, cross-area links, filter/search/reset, no writes/API/Energy and successful-learning hydration',flush=True)
    # Component harness: actual node selection coordinates, hidden rendering, cleanup,
    # optional corruption and 5,000 nodes with a responsive event loop.
    harness=context.new_page();harness.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'));harness.goto(BASE);harness.evaluate("document.querySelector('#onboarding').hidden=true;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#app').classList.add('memory-mode')")
    harness.evaluate('''async()=>{const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');const {memoryFixtures}=await import('/tests/support/m3-memory-fixtures.js');const root=document.querySelector('#memory-view');root.hidden=false;window.__m3=new NeuralMemoryView(root);__m3.update({memories:memoryFixtures()});__m3.setVisible(true);await new Promise(r=>setTimeout(r,45));}''')
    point_script="()=>{const m=__m3,n=m.layout.nodes.find(n=>n.kind==='memory'&&m.hit(n.x*m.zoom+m.pan.x,n.y*m.zoom+m.pan.y)?.id===n.id),b=m.canvas.getBoundingClientRect();return {x:b.x+n.x*m.zoom+m.pan.x,y:b.y+n.y*m.zoom+m.pan.y,label:n.label};}"
    point=harness.evaluate(point_script)
    harness.mouse.move(point['x'],point['y']);assert harness.locator('.memory-tooltip').is_visible()
    harness.mouse.down();harness.mouse.move(point['x']+70,point['y']+25,steps=6);harness.mouse.up()
    assert harness.locator('#memory-inspector-title').text_content()=='Follow a thought.'
    point=harness.evaluate(point_script);harness.mouse.click(point['x'],point['y'])
    assert harness.locator('.inspector-memory-text').text_content()==point['label']
    harness.evaluate('()=>__m3.destroy()')
    print(harness.evaluate('''async()=>{
      const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');const {memoryFixtures}=await import('/tests/support/m3-memory-fixtures.js');
      const root=document.querySelector('#memory-view');root.hidden=false;const check=(v,m)=>{if(!v)throw Error(m);};
      const wait=()=>new Promise(r=>setTimeout(r,35));
      let map=new NeuralMemoryView(root);map.update({memories:memoryFixtures()});map.setVisible(true);await wait();
      const memory=map.layout.nodes.find(n=>n.kind==='memory'),point={x:memory.x*map.zoom+map.pan.x,y:memory.y*map.zoom+map.pan.y};
      check(map.hit(point.x,point.y)?.id===memory.id,'Node hit testing failed');map.select(memory.id);check(root.querySelector('.inspector-memory-text').textContent===memory.label,'Node selection failed');
      map.setVisible(false);map.drawSoon();check(map.frame===null,'Hidden map scheduled work');
      map.setVisible(true);await wait();check(map.frame===null,'Map has a continuous frame loop');
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));map.drawSoon();check(map.frame===null,'Hidden page rendered');map.update({memories:memoryFixtures().slice(0,3)});await wait();check(map.graph.stats.canonical===33,'Hidden page rebuilt unnecessarily');delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));await wait();check(map.graph.stats.canonical===3,'Visibility resume missed state update');
      map.destroy();check(map.abort.signal.aborted&&map.frame===null,'Destroyed map retained listeners/frames');
      map=new NeuralMemoryView(root);let heartbeats=0;const timer=setInterval(()=>heartbeats++,0);
      const state={memories:Array.from({length:5000},(_,i)=>({id:`large-${i}`,content:`Saved item ${i}`,category:`Area ${i%8}`,topic:`Topic ${i%17}`,relatedMemoryIds:i?[`large-${i-1}`]:[]}))};
      const start=performance.now();map.update(state);map.setVisible(true);await wait();check(map.graph.stats.canonical===5000,'Large graph incomplete');check(heartbeats>0,'Large graph blocked the event loop');const elapsed=performance.now()-start;check(elapsed<1000,'Large graph stalled');
      const previous=map.layout;map.update({...state,energy:0});await wait();check(map.layout===previous,'Energy-only tick rebuilt the graph');
      clearInterval(timer);map.destroy();return `PASS component: hit testing, hidden/idle rendering, cleanup, 5,000 canonical nodes in ${elapsed.toFixed(1)} ms, ${heartbeats} event-loop heartbeats, stable updates`;
    }'''),flush=True)
    browser.close()
