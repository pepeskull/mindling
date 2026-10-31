"""Actual / and ?stage-preview=1 Teach paths, real isolated IndexedDB, synthetic assessments.
Run against a static local server. No external inference, screenshots or production data.
"""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8766')
CASES=[
 ('In my fictional world, the word Lumora means a glowing blue tree that grows only at night. Remember this definition.','fictional worldbuilding','Lumora','Lumora definition'),
 ('A database transaction uses atomicity to ensure that all its changes commit or roll back together.','computer science','database transactions','transaction atomicity'),
 ('Photosynthesis converts light energy into chemical energy.','biology','photosynthesis','photosynthesis'),
 ('That system handles the thing in the usual way.',None,None,None),
 ('A membrane separates the cell interior from its environment.','biology','cell membranes','membrane boundary')
]
def assessment(case):
    text,category,topic,concept=case
    decisions=[]
    for i in range(2 if text==CASES[0][0] else 1):
        decisions.append({'statement':i,'targetPart':-1,'decision':{'version':2,'relationship':'NEW_MEMORY','operation':'NO_MEMORY_CHANGE' if i else 'CREATE_NEW' if category else 'ASK_FOR_CLARIFICATION','responseAction':'ACKNOWLEDGE' if category or i else 'CLARIFY','kind':'intention' if i else 'claim','certainty':'asserted','concept':concept if category and not i else '', 'category':category if category and not i else '', 'categoryId':'','topic':topic if category and not i else '', 'relatedMemoryId':'','confidence':.95}})
    return {'version':3,'operations':decisions}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce')
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    requests=[];held=[];mode={'kind':'success'}
    def learning(route):
        body=route.request.post_data_json;requests.append(body)
        if mode['kind']=='hold':held.append(route);return
        if mode['kind']=='failure':route.fulfill(status=503,json={'service':'mindling-learning-service','error':{'code':'ANALYSIS_UNAVAILABLE'}});return
        case=next(item for item in CASES if item[0]==body['input'])
        route.fulfill(json={'service':'mindling-learning-service','assessment':assessment(case)})
    context.route('**/api/mindling/learn',learning)
    normal=context.new_page();normal.goto(BASE+'/')
    normal.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:normal.locator(f'[data-pathway="{name}"]').click()
    normal.locator('[data-next]').click();normal.locator('[data-next]').click();normal.locator('#mindling-name').fill('NormalParity');normal.locator('[data-next]').click();normal.locator('[data-create]').click()
    normal.wait_for_function("document.querySelector('#onboarding').hidden")
    preview=context.new_page();preview.on('dialog',lambda dialog:dialog.accept());preview.goto(BASE+'/?stage-preview=1')
    preview.locator('[data-sandbox="new"]').click();preview.wait_for_function("document.querySelector('[data-sandbox-status]').textContent.includes('saved')")
    read="""async(preview)=>{if(preview){const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return s;}const {MindlingDatabase}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();const value=await db.get('gameplay','primary');db.close();return value.state;}"""
    mutate="""async({preview,stale})=>{let db;if(preview){const {PreviewStore}=await import('/src/preview/sandbox/storage.js');db=await new PreviewStore().open();}else{const {MindlingDatabase}=await import('/src/storage/database.js');db=await new MindlingDatabase().open();}const change=preview?db.change.bind(db):db.changeGameplay.bind(db);await change(s=>{s.mind.categories||=[];if(stale)s.mind.categories.push({id:'concurrent-area',name:'A concurrently saved area'});else{s.mind.categories.push({id:'legacy-area',name:'Notes: my'});s.mind.memories.push({id:'legacy-memory',content:'An older saved claim remains in its original category.',categoryId:'legacy-area',category:'Notes: my',topic:'legacy topic',source:'NATIVE',createdAt:'2026-01-01T00:00:00.000Z',neuronIds:[],synapseIds:[],relatedMemoryIds:[]});}return s;});db.close();}"""
    summaries=[]
    for page,is_preview in [(normal,False),(preview,True)]:
        other_before=normal.evaluate(read,False) if is_preview else None
        page.evaluate(mutate,{'preview':is_preview,'stale':False})
        legacy=page.evaluate(read,is_preview)['mind']['memories'][0]
        page.locator('[data-input-mode="TEACH"]').click()
        for case in CASES[:4]:
            page.locator('#mindling-input').fill(case[0]);page.locator('#interaction-form button[type=submit]').click()
            page.wait_for_function("!document.querySelector('#interaction-form').classList.contains('processing')")
        saved=page.evaluate(read,is_preview)
        assert len(saved['mind']['memories'])==4, saved['mind']['history']
        assert saved['mind']['memories'][0]==legacy
        values=json.loads(json.dumps([{key:memory.get(key) for key in ['content','concept','category','topic','source','intelligence','analysis']} for memory in saved['mind']['memories'][1:]]))
        for i,memory in enumerate(values):
            assert memory['category']==CASES[i][1]
            assert memory['topic']==CASES[i][2]
            assert memory['source']=='SERVICE' and memory['analysis']['confidence']==.95
            assert memory['intelligence']['verification']=='unverified-player-claim'
            del memory['analysis']['learnedAt']
        summaries.append(values)
        assert saved['mind']['energy']['remaining']==4
        assert saved['mind']['lifetimeXP']==15
        page.locator('[data-view="memories"]').click()
        page.wait_for_function("document.querySelector('.coverage-values')?.textContent.includes('fictional worldbuilding')")
        assert 'computer science' in page.locator('.coverage-values').inner_text()
        assert 'biology' in page.locator('.coverage-values').inner_text()
        page.locator('[data-view="dashboard"]').click()
        # Service failure cannot silently fall back to Notes labels or charge.
        mode['kind']='failure';page.locator('#mindling-input').fill(CASES[4][0]);page.locator('#interaction-form button[type=submit]').click()
        page.wait_for_function("!document.querySelector('#interaction-form').classList.contains('processing')")
        after=page.evaluate(read,is_preview)
        assert after['mind']['memories']==saved['mind']['memories'] and after['mind']['energy']['remaining']==4 and after['mind']['lifetimeXP']==15, {'preview':is_preview,'energy':after['mind']['energy']['remaining'],'xp':after['mind']['lifetimeXP'],'count':len(after['mind']['memories']),'changes':[[key for key in set(a)|set(b) if a.get(key)!=b.get(key)] for a,b in zip(after['mind']['memories'],saved['mind']['memories'])]}
        # Cross-tab category change while the service reply is pending must reject stale classification.
        mode['kind']='hold';page.locator('#mindling-input').fill(CASES[4][0]);page.locator('#interaction-form button[type=submit]').click()
        page.wait_for_function("document.querySelector('#interaction-form').classList.contains('processing')")
        page.evaluate(mutate,{'preview':is_preview,'stale':True})
        assert held
        held.pop(0).fulfill(json={'service':'mindling-learning-service','assessment':assessment(CASES[4])})
        page.wait_for_function("!document.querySelector('#interaction-form').classList.contains('processing')")
        after=page.evaluate(read,is_preview)
        assert after['mind']['memories']==saved['mind']['memories'] and after['mind']['energy']['remaining']==4
        mode['kind']='success';page.reload()
        if is_preview:page.wait_for_function("document.querySelector('[data-sandbox-status]')")
        else:page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('NormalParity')")
        assert page.evaluate(read,is_preview)['mind']['memories']==saved['mind']['memories']
        if is_preview:assert normal.evaluate(read,False)['mind']==other_before['mind'],'Preview modified primary Mindling'
    assert summaries[0]==summaries[1]
    print('PASS actual URL paths: fictional worldbuilding/Lumora, technical/scientific names, ambiguous input without invented memory, preserved legacy data, displayed areas, service failure rollback, stale response rejection, reload persistence and Preview/primary isolation; synthetic assessments only',flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
