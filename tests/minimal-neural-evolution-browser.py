"""Actual engine/HTTP handler, explicitly synthetic reports, real isolated stores.
Exercises automatic integration and the normal minimal UI in both environments.
No external requests, model charges or screenshots.
"""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce',accept_downloads=True)
    context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') else r.abort())
    primary=None
    for preview in [False,True]:
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/tests/blank.html')
        print(page.evaluate('''async(preview)=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');const {graphData}=await import('/src/memory/graph-data.js');
          const check=(v,m)=>{if(!v)throw Error(m);},store=await (preview?new PreviewStore():new MindlingDatabase()).open(),write=preview?store.change.bind(store):store.changeGameplay.bind(store),read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
          await write(()=>newMindling(createSandbox(),{id:preview?'preview-evolution':'primary-evolution',name:'NeuralEvolution',confirmed:true}));
          const app={store,...(preview?{}:{db:store}),state:await read(),renderState(){},events:{emit(){}},async change(reducer,options={}){this.state=await write(reducer,options);}};
          const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
          // Advance only the fixture clock: exercise the real three/day and
          // ten-minute cooldown guards instead of relaxing them for the test.
          const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
          const run=async(topic,autonomous=true)=>{clock+=600001;const task=await engine.prepare(understandInput('Learn about evolution '+topic,'TEACH'),'local-'+topic,{autonomous});await engine.run(task,task.topic);return app.state.mind.learningTasks.find(t=>t.id===task.id);};
          const foundation=await run('foundation');check(foundation.status==='COMPLETED','foundation failed');
          const original=structuredClone(app.state.mind.memories[0]),identity=JSON.stringify(app.state.player),origins=JSON.stringify(app.state.mind.originPathways),nodes=JSON.stringify(app.state.mind.nodes),synapses=JSON.stringify(app.state.mind.synapses);
          const conflict=await run('conflict');check(conflict.status==='BLOCKED'&&conflict.code==='NO_EVIDENCE','single conflict overwrote knowledge');check(app.state.mind.memories.length===1&&!app.state.mind.memories[0].supersededBy,'premature version');
          const corrected=await run('corroboration');check(corrected.status==='COMPLETED','correction failed: '+corrected.code);check(app.state.mind.memories.length===2,'successor missing');
          const parent=app.state.mind.memories[0],child=app.state.mind.memories[1];check(parent.supersededBy===child.id&&child.correctsMemoryId===parent.id,'lineage missing');check(parent.content===original.content&&JSON.stringify(parent.research)===JSON.stringify(original.research),'source provenance overwritten');check(child.research.evidenceText==='A standard chessboard contains 64 squares.'&&child.researchSupport.length===2,'independent new attribution missing');check(child.research.verification==='tool-cited-unverified-synthesis','citations promoted to verification');
          check(JSON.stringify(app.state.mind.nodes)===nodes&&JSON.stringify(app.state.mind.synapses)===synapses,'correction fabricated neural growth');
          const unchanged=JSON.stringify(app.state.mind.memories),support=await run('duplicate',false);check(support.status==='COMPLETED'&&JSON.stringify(app.state.mind.memories)===unchanged,'repeat duplicated versions or support');
          check(app.state.mind.energy.remaining===10&&app.state.mind.lifetimeXP===0,'automatic maintenance charged/rewarded');
          const complement=await run('complement',false);check(complement.status==='COMPLETED'&&app.state.mind.memories.length===3,'complement missing');check(app.state.mind.energy.remaining===8&&app.state.mind.lifetimeXP===0,'ordinary Teach research accounting changed');
          check(JSON.stringify(app.state.player)===identity&&JSON.stringify(app.state.mind.originPathways)===origins,'identity/origins changed');
          const graph=graphData(app.state.mind),edges=graph.edges.map(e=>[e.kind,...[e.from,e.to].sort()].join(':'));check(new Set(edges).size===edges.length,'duplicate graph edges');
          check(app.state.mind.learningTasks.every(t=>(t.sourceRequests||0)<=2&&(t.modelCalls||0)<=4),'budget ceilings changed');
          await engine.setAccess(false);engine.destroy();Date.now=realNow;const saved=await read();store.close();globalThis.evolutionSaved=saved;
          return 'PASS '+(preview?'Preview':'primary')+': real handler + cited report validation, conflict retention, two-source successor, repeat idempotency, complementary knowledge, exact provenance, graph/identity/origin integrity, Energy/XP and unchanged call budgets';
        }''',preview),flush=True)
        saved=page.evaluate('evolutionSaved')
        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('NeuralEvolution')")
        page.locator('[data-view="memories"]').click();page.locator('.memory-browser summary').click()
        buttons=page.locator('.memory-browser .compact-memory');assert buttons.count()==3
        assert all(b.locator('.memory-entry-title').inner_text()=='Chessboard structure' for b in buttons.all())
        assert all(b.locator('.memory-entry-area').inner_text()=='Gaming' for b in buttons.all())
        assert 'Source observation' not in page.locator('#memory-view').inner_text()
        assert page.locator('#memory-view textarea').count()==0
        assert page.get_by_role('button',name='Save correction',exact=True).count()==0
        for button in buttons.all():
            assert 'Source observation' not in button.get_attribute('aria-label') and 'http' not in button.get_attribute('aria-label')
        # Keyboard selection announces the title, area and historical state.
        historic=page.locator('.memory-browser button',has=page.locator('.memory-entry-state',has_text='Historical'))
        historic.focus();page.keyboard.press('Enter');assert page.locator('#memory-inspector-title').inner_text()=='Chessboard structure'
        assert page.locator('.memory-inspector .memory-status-chip').inner_text()=='Historical memory'
        assert page.locator('.memory-inspector-content .inspector-memory-text').count()==0
        assert page.locator('.memory-inspector-content dl').inner_text().find('Gaming')>=0
        page.locator('.memory-inspector-content .compact-memory').first.click()
        assert page.locator('.memory-inspector .memory-status-chip').inner_text()=='Current memory'
        page.locator('.research-task-browser summary').click();page.locator('[data-select-learning]').first.click()
        inspector=page.locator('.memory-inspector-content');assert inspector.locator('progress').count()==1
        assert 'sources' in inspector.inner_text() and 'new memories' in inspector.inner_text()
        assert all(text not in inspector.inner_text() for text in ['Hosted tool','Request reference','HTTP','Source observation','Saved sources'])
        page.locator('[data-select-learning]').filter(has_text='evolution conflict').click()
        assert 'Learning paused' in inspector.inner_text() and 'More supporting evidence is needed.' in inspector.inner_text()
        assert inspector.locator('progress').get_attribute('value')=='71'
        assert '0 new memories' in inspector.inner_text()
        # Detailed evidence/admin operations exist only after explicit maintenance.
        page.get_by_role('button',name='Memory maintenance',exact=True).click()
        dialog=page.get_by_role('dialog',name='Memory maintenance');assert dialog.is_visible()
        assert dialog.evaluate("d=>getComputedStyle(d).boxShadow")=='none'
        dialog.get_by_text('Stored memory records',exact=True).click();raw=json.loads(dialog.locator('pre').inner_text());assert raw==saved['mind']['memories']
        with page.expect_download() as download_info:dialog.get_by_role('button',name='Export memory records',exact=True).click()
        exported=json.load(open(download_info.value.path()));assert exported['memories']==saved['mind']['memories'];assert 'player' not in exported
        # Open a task with retained source memory: administrative correction/delete are preserved.
        for details in dialog.locator(':scope > details').all()[1:]:details.locator('summary').first.click()
        for summary in dialog.get_by_text('Manage retained knowledge',exact=True).all():summary.click()
        assert dialog.get_by_role('button',name='Remove learned memory',exact=True).count()>0, dialog.evaluate("d=>[...d.querySelectorAll('details')].map(x=>({summary:x.querySelector('summary')?.textContent,buttons:x.querySelectorAll('button').length,readonly:x.textContent.includes('read-only')}))")
        assert dialog.get_by_role('textbox',name='Correct this learned claim').count()>0
        page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0
        # Rehydration keeps complete source records and historical links.
        page.reload();page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('NeuralEvolution')")
        after=page.evaluate('''async(preview)=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),s=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return s;}''',preview)
        assert after['mind']['memories']==saved['mind']['memories']
        if preview:
            actual_primary=page.evaluate('''async()=>{const {MindlingDatabase}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();const s=(await db.get('gameplay','primary')).state;db.close();return s.mind.memories;}''')
            assert actual_primary==primary
        else:primary=after['mind']['memories']
        assert not errors,errors
        print('PASS '+('Preview' if preview else 'primary')+': actual URL compact titles/areas, keyboard/history navigation, minimal inspector/task progress, no manual controls or raw source text, separate maintenance/export, exact persisted data and reload isolation',flush=True)
        page.close()
    context.close();browser.close()
