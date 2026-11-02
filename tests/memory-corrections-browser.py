"""Real correction inspector, learning handler and both IndexedDB adapters.
Research reports/model classifications are authored local fixtures, never live calls.
Run against tests/support/autonomous-web-search-server.cjs.
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8765')
CLAIM = 'Common video game genres include action, adventure, role-playing, strategy, simulation, puzzle, platformer, sports and racing games.'
CORRECTED = 'Common video game genres include action, adventure, role-playing, strategy and simulation, while individual games can combine several genres.'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1600, 'height':1050}, reduced_motion='reduce')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    page = context.new_page()
    requests = []
    page.on('request', lambda request: requests.append(request.url) if '/api/mindling/' in request.url else None)
    page.goto(BASE+'/tests/blank.html')
    summaries = []
    for preview in [False, True]:
        result = page.evaluate('''async({preview,claim})=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
          const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');
          const {renderTaskInspector}=await import('/src/autonomous/task-inspector.js');
          const {graphData}=await import('/src/memory/graph-data.js');
          const check=(v,m)=>{if(!v)throw Error(m);};
          const store=await (preview?new PreviewStore():new MindlingDatabase()).open();
          const write=preview?store.change.bind(store):store.changeGameplay.bind(store);
          const read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
          await write(()=>newMindling(createSandbox(),{confirmed:true,id:preview?'preview-correction':'primary-correction'}));
          const app={store,...(!preview?{db:store}:{}),state:await read(),renderState(){},events:{emit(){}},dashboard:{canContinueResearch(){return false;}},async change(reducer,options={}){this.state=await write(reducer,options);}};
          const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
          const prepared=await engine.prepare(understandInput('Learn about video game genres','TEACH'),'synthetic-genres');await engine.run(prepared,prepared.topic);
          const task=app.state.mind.learningTasks.find(t=>t.id===prepared.id);
          check(task.status==='COMPLETED','research fixture failed: '+task.code);
          check(task.sourceReferences.length===2&&task.completedToolCalls===2&&app.state.mind.memories.length===2,'research sources/counters lost');
          check(app.state.mind.memories.every(m=>m.category==='Genre comparison'&&m.topic==='Common video game genres'),'research classification changed');
          const original=app.state.mind.memories.find(m=>m.research.evidenceText===claim);check(original,'fixture quote not retained');
          const host=document.createElement('section');document.body.replaceChildren(host);
          const render=()=>{host.replaceChildren();renderTaskInspector(host,{task:app.state.mind.learningTasks.find(t=>t.id===task.id)},{onAction:engine.act.bind(engine),refresh:render,memories:graphData(app.state.mind).memories});};
          render();host.querySelector('details:has(textarea)').open=true;
          check(host.querySelector('textarea').value===claim,'generated source prefix appears in editable claim');
          check(host.textContent.includes('Original source: '+original.research.sourceURL),'read-only source metadata missing');
          globalThis.correctionHarness={app,engine,store,read,write,render,taskId:task.id,originalId:original.id,before:JSON.stringify(app.state),original:structuredClone(original),sources:JSON.stringify(task.sourceReferences),nodes:JSON.stringify(app.state.mind.nodes),synapses:JSON.stringify(app.state.mind.synapses)};
          return {status:task.status,sources:task.sourceReferences.length,category:original.category,topic:original.topic};
        }''', {'preview':preview, 'claim':CLAIM})
        summaries.append(result)
        calls = len(requests)
        save = page.get_by_role('button', name='Save correction', exact=True).first
        save.click()
        page.wait_for_function("document.querySelector('.learning-task-feedback').textContent.includes('No changes to save')")
        assert len(requests) == calls
        assert page.evaluate('JSON.stringify(correctionHarness.app.state)===correctionHarness.before')
        page.get_by_role('textbox', name='Correct this learned claim').first.fill('  '+CLAIM.replace('game genres', 'game   genres')+'  ')
        save.click()
        page.wait_for_function("!document.querySelector('details:has(textarea) button').disabled")
        assert len(requests) == calls
        assert page.evaluate('JSON.stringify(correctionHarness.app.state)===correctionHarness.before')
        page.get_by_role('textbox', name='Correct this learned claim').first.fill(CORRECTED)
        save.click()
        page.wait_for_function("document.querySelector('.learning-task-feedback').textContent.includes('Correction saved')")
        assert len(requests) == calls+1 and requests[-1].endswith('/api/mindling/learn')
        print(page.evaluate('''async({corrected})=>{
          const {app,engine,store,read,originalId,original,taskId,sources,nodes,synapses}=correctionHarness;
          const check=(v,m)=>{if(!v)throw Error(m);};
          const parent=app.state.mind.memories.find(m=>m.id===originalId),replacement=app.state.mind.memories.find(m=>m.correctsMemoryId===originalId);
          check(parent.supersededBy===replacement.id&&parent.intelligence.current===false,'lineage missing');
          check(parent.content===original.content&&JSON.stringify(parent.research)===JSON.stringify(original.research),'source history altered');
          check(replacement.content===corrected&&!replacement.research&&replacement.provenance.source==='player'&&replacement.intelligence.verification==='unverified-player-claim','edited claim inherits authority');
          check(replacement.category==='Genre comparison'&&replacement.topic==='Common video game genres','same subject relabelled');
          check(JSON.stringify(app.state.mind.nodes)===nodes&&JSON.stringify(app.state.mind.synapses)===synapses,'neural state mutated');
          const initial=JSON.parse(correctionHarness.before).mind;
          check(app.state.mind.energy.remaining===initial.energy.remaining-2&&app.state.mind.lifetimeXP===initial.lifetimeXP+3,'genuine correction charged/rewarded incorrectly: '+JSON.stringify({energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,initialEnergy:initial.energy.remaining,initialXP:initial.lifetimeXP}));
          check(JSON.stringify(app.state.mind.learningTasks.find(t=>t.id===taskId).sourceReferences)===sources,'task sources altered');
          const before=JSON.stringify(app.state);const repeated=await engine.act('correct-memory',taskId,{memoryId:originalId,text:corrected});
          check(repeated.changed===false&&JSON.stringify(app.state)===before,'repeat correction duplicated');
          const userNoop=await engine.act('correct-memory',taskId,{memoryId:replacement.id,text:corrected});
          check(userNoop.changed===false&&JSON.stringify(app.state)===before,'user-provided no-op duplicated');
          check(JSON.stringify((await read()).mind.memories)===JSON.stringify(app.state.mind.memories),'IndexedDB correction lost');
          correctionHarness.saved=structuredClone(app.state);
          engine.destroy();store.close();
          return 'PASS '+app.state.mind.id+': two-source Gaming research, inspector no-op, whitespace, semantic correction, source history, version lineage, repeated submissions and counters';
        }''', {'corrected':CORRECTED}), flush=True)
        assert len(requests) == calls+1
        # Reopen the actual application URL. Hydration runs the bounded repair.
        # Add one provable legacy no-op pair plus one unrelated ambiguous Notes record.
        page.evaluate('''async(preview)=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),write=preview?db.change.bind(db):db.changeGameplay.bind(db);
          await write(s=>{
            const original=s.mind.memories.find(m=>m.research),parent=structuredClone(original);
            parent.id='repair-parent';parent.supersededBy='repair-child';parent.intelligence={...parent.intelligence,current:false};
            const child={id:'repair-child',content:parent.research.evidenceText,source:'NATIVE',category:'Notes: genres',categoryId:'bad-label',topic:'common genres compared play',correctsMemoryId:parent.id,relatedMemoryIds:[parent.id],neuronIds:[],synapseIds:[]};
            const ambiguous={id:'ambiguous',content:'An independent old memory.',source:'NATIVE',category:'Notes: old',categoryId:'old-label',topic:'independent old memory',neuronIds:[],synapseIds:[],relatedMemoryIds:[]};
            s.mind.memories.push(parent,child,ambiguous);s.mind.categories.push({id:'bad-label',name:'Notes: genres'},{id:'old-label',name:'Notes: old'});return s;
          });db.close();
        }''', preview)
        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('Test Mindling')")
        repaired = page.evaluate('''async(preview)=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),state=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return state.mind.memories;
        }''', preview)
        child = next(m for m in repaired if m['id']=='repair-child')
        assert child['category']=='Genre comparison' and child['topic']=='Common video game genres', {'child':child, 'parent':next(m for m in repaired if m['id']=='repair-parent')}
        assert child['classificationRepair']['method']=='identical-correction-parent' and not child.get('research')
        assert next(m for m in repaired if m['id']=='ambiguous')['category']=='Notes: old'
        page.reload()
        page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('Test Mindling')")
        assert page.evaluate('''async(preview)=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),state=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return state.mind.memories;
        }''', preview) == repaired
        print('PASS '+('Stage Preview' if preview else 'normal app')+': actual URL hydration, bounded repair, ambiguous record preserved, idempotent reload', flush=True)
        if not preview:
            primary_memories = repaired
        else:
            assert page.evaluate('''async()=>{const {MindlingDatabase}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();const s=(await db.get('gameplay','primary')).state;db.close();return s.mind.memories;}''') == primary_memories
        page.goto(BASE+'/tests/blank.html')
    assert summaries[0] == summaries[1]
    print('PASS normal/Preview classification parity and database isolation; no external network permitted', flush=True)
    context.close()
    browser.close()
