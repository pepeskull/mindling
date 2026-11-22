"""Real Dashboard controllers, isolated IndexedDB, and an offline Talk result."""
import os

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8771')
BOOTSTRAP = """
const preview=new URLSearchParams(location.search).has('stage-preview');
const {MindlingApp}=await import('/src/app/app.js');
const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
window.app=preview?new SandboxPreview({forceCanvas:true}):new MindlingApp();
await app.start();
window.fixtureReady=true;
"""
SEED = """async preview=>{
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
  const store=await (preview?new PreviewStore():new MindlingDatabase()).open();
  const now=Date.now()+(preview?3*86400000:0);
  const state=newMindling(createSandbox(now),{id:'dashboard-fixture',name:'Dashboard Fixture',confirmed:true});
  Object.assign(state.mind.life.attributes,{nutrition:65,rest:70,health:80,wellbeing:80});
  state.mind.life.care={NOURISH:now-6*3600000+31000,REST:now-3600000,CARE:now-3600000};
  if(preview)await store.change(()=>state);else await store.changeGameplay(()=>state);
  store.close();
}"""


def assets(route):
    url = route.request.url
    if url == BASE + '/js/bootstrap.js':
        route.fulfill(body=BOOTSTRAP, content_type='application/javascript')
    elif url.startswith(BASE + '/') and '/api/' not in url:
        route.continue_()
    else:
        route.abort()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for preview in (False, True):
        context = browser.new_context(viewport={'width': 1500, 'height': 940}, reduced_motion='reduce')
        context.route('**/*', assets)
        context.add_init_script("""window.fixtureWall=Number(sessionStorage.fixtureWall)||Date.UTC(2026,10,22,12);
            Date.now=()=>window.fixtureWall;
            window.advance=(ms)=>{window.fixtureWall+=ms;sessionStorage.fixtureWall=window.fixtureWall;};""")
        page = context.new_page()
        page.set_default_timeout(5000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/tests/blank.html')
        page.evaluate(SEED, preview)
        url = BASE + ('/?stage-preview=1' if preview else '/')
        page.goto(url)
        page.wait_for_function('window.fixtureReady')
        if preview:
            page.locator('.sandbox-controls > summary').click()

        for action, remaining in [('nourish', '00:00:31'), ('rest', '07:00:00'), ('care', '11:00:00')]:
            expect(page.locator(f'#{action}-cooldown')).to_have_text(remaining)
        page.evaluate('advance(11000)')
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')
        page.reload()
        page.wait_for_function('window.fixtureReady')
        if preview:
            page.locator('.sandbox-controls > summary').click()
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')

        page.evaluate("""()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});
          document.dispatchEvent(new Event('visibilitychange'));advance(21000);}""")
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')
        page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
        ready = page.locator('#nourish-cooldown')
        expect(ready).to_have_text('Ready!')
        expect(ready).to_have_css('color', 'rgb(53, 184, 123)')
        expect(page.locator('[data-care-announcement]')).to_have_text('Nourish cooldown complete.')
        page.get_by_role('button', name='Nourish, free').click()
        expect(ready).to_have_text('06:00:00')
        care_at = page.evaluate('app.state.mind.life.care.NOURISH')
        page.evaluate('advance(1000)')
        page.get_by_role('button', name='Nourish, free').click()
        expect(page.locator('.interaction-status')).to_contain_text('cooldown is still active')
        assert page.evaluate('app.state.mind.life.care.NOURISH') == care_at
        expect(ready).to_have_text('05:59:59')
        page.evaluate('advance(11*3600000)')
        for action, duration in [('Rest', '08:00:00'), ('Care', '12:00:00')]:
            countdown = page.locator(f'#{action.lower()}-cooldown')
            expect(countdown).to_have_text('Ready!')
            page.get_by_role('button', name=f'{action}, free').click()
            expect(countdown).to_have_text(duration)

        page.evaluate("""answer=>{const id='synthetic-talk';app.dashboard.beginInteraction(id,'TALK');
          app.dashboard.presentInteraction(id,{accepted:true,talkResponse:{answer}});}""",
            'Set in **Leonida**, including *Vice City*.\nSingle line break.\n\nPlain text <img src=x onerror="window.injected=true">.')
        body = page.locator('[data-talk-content]')
        expect(body.locator('strong')).to_have_text('Leonida')
        expect(body.locator('em')).to_have_text('Vice City')
        assert body.locator('p').count() == 2
        assert '\nSingle line break.' in body.locator('p').first.text_content()
        expect(body.locator('p').last).to_contain_text('<img src=x onerror=')
        assert body.locator('img, script').count() == 0 and not page.evaluate('window.injected')
        page.evaluate("""()=>{const id='plain-talk';app.dashboard.beginInteraction(id,'TALK');
          app.dashboard.presentInteraction(id,{accepted:true,talkResponse:{answer:'A plain answer.'}});}""")
        expect(body).to_have_text('A plain answer.')

        page.evaluate("window.mainBrain=document.querySelector('#scene canvas')")
        page.locator('[data-view=network]').click()
        network = page.locator('#network-view')
        expect(network.get_by_role('heading', name='Network', exact=True)).to_be_visible()
        assert page.locator('[data-view=network]').count() == 1
        assert page.locator('[data-view=integration], [data-mobile-view=integration], .network-bars, .network-lines').count() == 0
        expect(network.locator('[data-brain-accessible]')).to_contain_text('positioned neurons')
        assert page.locator('canvas[data-cloud]').count() == 1
        for width in (1500, 390):
            page.set_viewport_size({'width': width, 'height': 940})
            assert page.evaluate("""()=>{const map=document.querySelector('.integration-map'),cloud=map.querySelector('.network-cloud-plot'),orbit=map.querySelector('.orbit-streams');
              const a=map.getBoundingClientRect(),b=cloud.getBoundingClientRect();
              return b.left>a.left+a.width/2&&b.right<=a.right+1&&b.width>100&&
                getComputedStyle(cloud).pointerEvents==='none'&&+getComputedStyle(cloud).zIndex<+getComputedStyle(orbit).zIndex&&
                document.documentElement.scrollWidth<=innerWidth+1;}""")
        network.locator('[data-platform=github]').click()
        expect(network.locator('[data-detail-name]')).to_have_text('GitHub')
        expect(network.locator('.integration-detail')).to_contain_text('Coming soon')
        page.locator('[data-mobile-view=dashboard]').click()
        expect(network).to_be_hidden()
        assert page.evaluate("""()=>window.mainBrain&&document.querySelector('#scene canvas')===window.mainBrain
          &&app.dashboard.integration.cloud.frame===null&&app.dashboard.integration.frame===null""")
        page.goto(url + '#integration')
        page.wait_for_function("location.hash==='#network'&&!document.querySelector('#network-view').hidden")
        page.evaluate("app.destroy()")
        assert page.locator('canvas[data-cloud],canvas[data-fallback]').count() == 0
        assert not errors, errors
        context.close()
        print(f'{"Stage Preview" if preview else "Normal"}: cooldowns, reload, care guard, Talk formatting, Network routes and layout passed')
    browser.close()
