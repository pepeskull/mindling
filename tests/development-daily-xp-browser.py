"""Verify Development XP in the real controllers with isolated local stores."""
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8771')

BOOTSTRAP = """
const preview=new URLSearchParams(location.search).get('stage-preview')==='1';
const Controller=preview
  ?(await import('/src/preview/sandbox/controller.js')).SandboxPreview
  :(await import('/src/app/app.js')).MindlingApp;
const app=window.fixtureApp=new Controller();
await app.start();
window.fixtureReady=true;
"""

SEED = """async preview=>{
  const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
  const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const store=await (preview?new PreviewStore():new MindlingDatabase()).open();
  const now=Date.now()+(preview?3*86400000:0),day=Math.floor(now/86400000);
  const state=newMindling(createSandbox(now),{id:'xp-fixture',name:'XP Fixture',confirmed:true});
  state.wallAt=Date.now();
  state.mind.stage=2;
  state.mind.stageXP=53;
  state.mind.lifetimeXP=189;
  state.mind.history=[{id:'yesterday',at:now-86400000,day:day-1,xp:90},{id:'today',at:now,day,xp:99}];
  if(preview)await store.change(()=>state);
  else await store.changeGameplay(()=>state);
  store.close();
}"""

def assets(route):
    url = route.request.url
    if url == BASE + '/xp-fixture':
        route.fulfill(body='<body></body>', content_type='text/html')
    elif url == BASE + '/js/bootstrap.js':
        route.fulfill(body=BOOTSTRAP, content_type='application/javascript')
    elif url.startswith(BASE + '/') and '/api/' not in url:
        route.continue_()
    else:
        route.abort()

def check_xp(page, stage, daily):
    panel = page.locator('[data-development-xp]')
    stage_bar = panel.get_by_role('progressbar', name='XP toward the next stage requirement')
    daily_bar = panel.get_by_role('progressbar', name='Daily XP earned today')
    assert panel.get_by_text(f'{stage} / 125 XP', exact=True).is_visible()
    assert panel.get_by_text(f'{daily} / 100 XP today', exact=True).is_visible()
    assert (stage_bar.get_attribute('max'), stage_bar.get_attribute('value')) == ('125', str(stage))
    assert (daily_bar.get_attribute('max'), daily_bar.get_attribute('value')) == ('100', str(daily))
    assert panel.get_by_text('Daily XP cap reached', exact=True).count() == (1 if daily == 100 else 0)
    assert panel.evaluate("""el=>{
      const [stage,daily]=el.querySelectorAll('progress'),counter=el.querySelector('.daily-xp-counter');
      const a=stage.getBoundingClientRect(),b=daily.getBoundingClientRect();
      return a.bottom<b.top&&a.width===b.width&&a.height>b.height
        &&getComputedStyle(stage).accentColor!==getComputedStyle(daily).accentColor
        &&getComputedStyle(daily).accentColor==='rgb(239, 167, 85)'
        &&getComputedStyle(counter).textAlign==='end'&&el.scrollWidth<=el.clientWidth;
    }""")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for preview in (False, True):
        context = browser.new_context(viewport={'width': 1500, 'height': 940}, reduced_motion='reduce')
        context.route('**/*', assets)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("window.fixtureWall=Date.UTC(2026,10,22,23,59,30); Date.now=()=>window.fixtureWall;")
        page.goto(BASE + '/xp-fixture')
        page.evaluate(SEED, preview)
        page.goto(BASE + ('/?stage-preview=1' if preview else '/'))
        page.wait_for_function('window.fixtureReady')
        page.locator('[data-view=development]').click()
        check_xp(page, 53, 99)
        page.evaluate("""async()=>{
          const {talk}=await import('/src/preview/sandbox/engine.js');
          await fixtureApp.change(s=>talk(s,'I would like to learn about memory today.',{id:'one-point',rewardEligible:true}));
        }""")
        check_xp(page, 54, 100)
        page.set_viewport_size({'width': 390, 'height': 760})
        check_xp(page, 54, 100)
        page.evaluate('async()=>{window.fixtureWall+=60000;await fixtureApp.change(s=>s);}')
        check_xp(page, 54, 0)
        assert page.evaluate("""async preview=>{
          const app=fixtureApp,state=preview?await app.store.read():(await app.db.get('gameplay','primary')).state;
          return state.mind.stageXP===54&&state.mind.lifetimeXP===190&&state.mind.history.at(-1).xp===1;
        }""", preview)
        assert not errors, errors
        context.close()
        print(f'{"Stage Preview" if preview else "Normal"}: capped award, separate accessible bars, mobile layout and daily reset passed')
    browser.close()
