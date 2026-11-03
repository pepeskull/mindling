"""Actual research handler/receipt/engine plus primary and Preview IndexedDB.
All inference and cited reports are authored local fixtures. No paid/live calls.
"""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce')
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    page=context.new_page();requests=[];errors=[];page.on('request',lambda r:requests.append(r.url) if '/api/' in r.url else None);page.on('pageerror',lambda e:errors.append(str(e)))
    read='''async(preview)=>{const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await (preview?new PreviewStore():new MindlingDatabase()).open();const s=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return s;}'''
    primary=None
    for preview in [False,True]:
        page.goto(BASE+'/tests/blank.html')
        print(page.evaluate('''async(preview)=>{
          const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');const {understandInput}=await import('/src/learning/input-understanding.js');
          const check=(v,m)=>{if(!v)throw Error(m);},store=await (preview?new PreviewStore():new MindlingDatabase()).open(),write=preview?store.change.bind(store):store.changeGameplay.bind(store),read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
          await write(()=>newMindling(createSandbox(),{id:preview?'preview-semantic':'primary-semantic',name:'Semantic Connections',confirmed:true}));const app={store,...(preview?{}:{db:store}),state:await read(),renderState(){},events:{emit(){}},async change(reducer,options={}){this.state=await write(reducer,options);}};
          let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);const before={energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,player:JSON.stringify(app.state.player),origins:JSON.stringify(app.state.mind.originPathways)};
          const prepared=await engine.prepare(understandInput('Learn about semantic crypto research','TEACH'),'semantic-request',{autonomous:true});await engine.run(prepared,prepared.topic);const task=app.state.mind.learningTasks.find(t=>t.id===prepared.id);
          check(task.status==='COMPLETED'&&task.completedWork.length===7,'valid three-claim result failed: '+task.code);check(task.sourceReferences.length===3&&task.completedToolCalls===2&&task.serviceDiagnostic.validation.accepted===3,'accepted evidence/counters missing');check(task.sourceReferences[0].title==='Crypto Market Risks','title layout not normalized');check(!task.researchExecution.outcomeUnknown,'completed research became unknown');check(app.state.mind.memories.length===3,'canonical claims not integrated');
          for(const memory of app.state.mind.memories){check(memory.relatedMemoryIds.length===2,'cross-area semantic association missing');check(memory.research?.sourceHash&&memory.research?.quoteHash&&memory.research.evidenceText,'source provenance lost');}
          check(app.state.mind.energy.remaining===before.energy&&app.state.mind.lifetimeXP===before.xp,'background integration charged/rewarded');check(JSON.stringify(app.state.player)===before.player&&JSON.stringify(app.state.mind.originPathways)===before.origins,'identity/origin changed');
          engine.destroy();store.close();const reopened=await (preview?new PreviewStore():new MindlingDatabase()).open();app.store=reopened;if(!preview)app.db=reopened;app.state=preview?await reopened.read():(await reopened.get('gameplay','primary')).state;app.change=async function(reducer,options={}){this.state=await (preview?reopened.change.bind(reopened):reopened.changeGameplay.bind(reopened))(reducer,options);};
          engine=new AutonomousLearningEngine(app);await engine.loadPermissions();const snapshot=JSON.stringify(app.state.mind.memories),fetcher=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('Completed work must not repeat');};await engine.run(app.state.mind.learningTasks.find(t=>t.id===task.id),task.topic);globalThis.fetch=fetcher;check(network===0&&JSON.stringify(app.state.mind.memories)===snapshot,'reload/retry repeated research or retention');await engine.setAccess(false);engine.destroy();reopened.close();
          return 'PASS '+(preview?'Preview':'primary')+': real three-source/three-claim handler → correlated signed receipt → canonical integration → 7/7 completion, persisted cross-area relationships, unchanged Energy/XP/identity/origins, and no repeated research after reload';
        }''',preview),flush=True)
        before=page.evaluate(read,preview)
        # Recreate legacy missing-edge state only in the isolated fixture store.
        # Preserve the actual canonical IDs, text, labels and source hashes.
        page.evaluate('''async(preview)=>{const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),change=preview?db.change.bind(db):db.changeGameplay.bind(db);await change(s=>{s.mind.memories.forEach((m,i)=>{m.relatedMemoryIds=[];delete m.semanticAssociations;m.submissionId='independent-session-'+i;});s.mind.memories.push({id:'misleading',content:'Crypto market speculation reflects enthusiasm rather than blockchain consensus.',category:'Crypto markets',topic:'Blockchain consensus',strength:.4,activations:2,relatedMemoryIds:[]});return s;});db.close();}''',preview)
        legacy=page.evaluate(read,preview)
        calls=len(requests)
        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('Semantic Connections')")
        repaired=page.evaluate(read,preview)
        assert len(requests)==calls
        for old,current in zip(legacy['mind']['memories'],repaired['mind']['memories']):
            preserved=dict(current);preserved.pop('semanticAssociations',None);preserved['relatedMemoryIds']=[]
            assert preserved==old
        assert all(len(m['relatedMemoryIds'])==2 for m in repaired['mind']['memories'][:3])
        assert repaired['mind']['memories'][3]['relatedMemoryIds']==[]
        page.locator('[data-view="memories"]').click();page.locator('.memory-browser summary').click()
        page.locator('.memory-browser .compact-memory',has=page.locator('.memory-entry-title',has_text='Blockchain Ledgers and Consensus')).click()
        inspector=page.locator('.memory-inspector-content');links=inspector.locator('.compact-memory')
        assert links.count()==2
        assert sorted(links.locator('.memory-entry-title').all_inner_texts())==['Crypto Market and Blockchain','Solana Blockchain Concepts']
        assert 'Source observation' not in inspector.inner_text() and 'https://' not in inspector.inner_text() and inspector.locator('textarea').count()==0
        solana=links.filter(has_text='Solana Blockchain Concepts');solana.focus();page.keyboard.press('Enter')
        assert page.locator('#memory-inspector-title').inner_text()=='Solana Blockchain Concepts'
        page.get_by_role('button',name='Memory maintenance',exact=True).click();dialog=page.get_by_role('dialog',name='Memory maintenance');dialog.get_by_text('Stored memory records',exact=True).click()
        stored=json.loads(dialog.locator('pre').inner_text());assert stored==repaired['mind']['memories'];assert all(m['research']['sourceHash'] for m in stored[:3])
        page.keyboard.press('Escape');page.reload();page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('Semantic Connections')")
        again=page.evaluate(read,preview);assert again['mind']['memories']==repaired['mind']['memories'];assert len(requests)==calls
        if preview:assert page.evaluate(read,False)['mind']['memories']==primary
        else:primary=repaired['mind']['memories']
        print('PASS '+('Preview' if preview else 'primary')+': automatic existing-record repair, exact preserved IDs/claims/source/strength, no speculative false link, compact Connected Memories, keyboard reciprocity, maintenance evidence, idempotent reload and database isolation',flush=True)
    assert not errors,errors
    context.close();browser.close()
