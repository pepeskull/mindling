"""Real URL/controller/IndexedDB paths and actual HTTP handler; mocked upstream only.
Run tests/support/teach-deep-502-server.cjs first. No production data or screenshots.
"""
import os,json
from playwright.sync_api import sync_playwright

BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8767')
TEACH='In my fictional world, the word Veloria means a floating crystal island that appears only during a full moon. Remember this definition.'
DEEP='In my fictional world, Veloria is a floating crystal island that appears during a full moon. Its crystals absorb moonlight and release stored energy to keep the island floating. Connect this new information to what you already know about Veloria.'
READ="""async(preview)=>{if(preview){const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return s;}const {MindlingDatabase}=await import('/src/storage/database.js');const db=await new MindlingDatabase().open();const record=await db.get('gameplay','primary');db.close();return record.state;}"""

def submit(page,text,activity):
    page.locator(f'[data-input-mode="{activity}"]').click()
    page.locator('#mindling-input').fill(text)
    page.locator('#interaction-form button[type=submit]').click()
    page.wait_for_function("!document.querySelector('#interaction-form').classList.contains('processing')")

def knowledge(state):
    # Ambient lifecycle ticks are independent; compare canonical learning state.
    return {key:state['mind'].get(key) for key in ['memories','categories','processed','lifetimeXP','neurons','synapses']}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce')
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    normal=context.new_page();normal.goto(BASE+'/')
    normal.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:normal.locator(f'[data-pathway="{name}"]').click()
    normal.locator('[data-next]').click();normal.locator('[data-next]').click();normal.locator('#mindling-name').fill('Learning502');normal.locator('[data-next]').click();normal.locator('[data-create]').click()
    normal.wait_for_function("document.querySelector('#onboarding').hidden")
    preview=context.new_page();preview.on('dialog',lambda dialog:dialog.accept());preview.goto(BASE+'/?stage-preview=1')
    preview.locator('[data-sandbox="new"]').click();preview.wait_for_function("document.querySelector('[data-sandbox-status]').textContent.includes('saved')")
    results=[]
    for page,is_preview in [(normal,False),(preview,True)]:
        other_before=knowledge(normal.evaluate(READ,False)) if is_preview else None
        for text,activity,count,energy,xp in [(TEACH,'TEACH',1,8,5),(DEEP,'DEEP_TRAINING',2,5,10)]:
            before=page.evaluate(READ,is_preview)
            context.request.post(BASE+'/tests/learning-mode',data={'mode':'failure'})
            submit(page,text,activity)
            after=page.evaluate(READ,is_preview)
            assert knowledge(after)==knowledge(before), {'preview':is_preview,'activity':activity,'before':knowledge(before),'after':knowledge(after)}
            assert after['mind']['energy']['remaining']==before['mind']['energy']['remaining']
            assert 'Request reference:' in page.locator('body').inner_text()
            context.request.post(BASE+'/tests/learning-mode',data={'mode':'good'})
            submit(page,text,activity)
            saved=page.evaluate(READ,is_preview)
            assert len(saved['mind']['memories'])==count, saved['mind']['history']
            assert saved['mind']['energy']['remaining']==energy, saved['mind']['energy']
            assert saved['mind']['lifetimeXP']==xp
        original=saved['mind']['memories'][0]['content']
        assert original==TEACH.split('. Remember')[0]+'.'
        assert saved['mind']['memories'][1]['id'] in saved['mind']['memories'][0]['relatedMemoryIds']
        assert saved['mind']['memories'][0]['id'] in saved['mind']['memories'][1]['relatedMemoryIds']
        assert all(m['source']=='SERVICE' and m['intelligence']['verification']=='unverified-player-claim' for m in saved['mind']['memories'])
        submit(page,DEEP,'DEEP_TRAINING')
        repeated=page.evaluate(READ,is_preview)
        assert len(repeated['mind']['memories'])==2
        assert repeated['mind']['energy']['remaining']==5 and repeated['mind']['lifetimeXP']==10
        assert repeated['mind']['memories'][0]['content']==original
        results.append([m['content'] for m in repeated['mind']['memories']])
        page.reload()
        page.wait_for_function("document.querySelector('#interaction-form')")
        assert knowledge(page.evaluate(READ,is_preview))==knowledge(repeated)
        if is_preview:assert knowledge(normal.evaluate(READ,False))==other_before,'Preview modified primary state'
    assert results[0]==results[1]
    print('PASS / and ?stage-preview=1: actual learning HTTP handler, Teach/Deep failure rollback and retry, Deep reinforcement plus new linked claim, repeated Deep without duplicates/rewards, real IndexedDB persistence and sandbox isolation; upstream synthetic only',flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
