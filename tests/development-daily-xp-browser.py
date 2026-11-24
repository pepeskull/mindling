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
  const content='The duration of a waggle run increases with the distance to the food source.';
  state.mind.memories=[{id:'saved-waggle',content,concept:'Waggle run duration',category:'Behavior',kind:'claim',source:'NATIVE',
    createdAt:new Date(now).toISOString(),contentIntegrity:{version:1,status:'captured',length:content.length},
    strength:.3,activations:1,neuronIds:['origin'],synapseIds:[],relatedMemoryIds:[]}];
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
    assert panel.get_by_text('Research paused — Daily XP limit reached', exact=True).count() == (1 if daily == 100 else 0)
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
        assert page.evaluate("""async preview=>{
          const {knowledgeTalk}=await import('/src/cognition/talk-response.js');
          const {learningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');
          const app=fixtureApp,original=window.fetch,content=app.state.mind.memories[0].content;
          let calls=0;
          window.fetch=async(url,options)=>{
            if(url!=='/api/mindling/reason')return original(url,options);
            const request=JSON.parse(options.body);
            if(request.mode!=='talk')throw Error('No research may be dispatched at the cap');
            calls++;
            return Response.json({service:'mindling-reasoning-service',kind:'talk',reasoning:{answer:content,explanation:'The saved claim explains the direction of change.',
              facts:[{memoryId:'saved-waggle',quote:content,basis:'stored_claim'}],inferences:[],memoryIds:['saved-waggle'],
              uncertainty:'low',insufficientInformation:false,missingInformation:[]}});
          };
          try{
            const reply=await knowledgeTalk(app,'How does waggle run duration relate to food source distance?','grounded-at-cap',{journal:!preview});
            let paused=false;
            try{await learningEngine(app).prepare(understandInput('Learn about honeybee habitats','TEACH'),'blocked-at-cap');}
            catch(error){paused=error.code==='DAILY_XP_LIMIT_REACHED';}
            return paused&&calls===1&&!reply.researchTaskId&&reply.answer===content&&app.state.mind.memories[0].activations===2;
          }finally{window.fetch=original;}
        }""", preview)
        page.reload()
        page.wait_for_function('window.fixtureReady')
        page.locator('[data-view=development]').click()
        check_xp(page, 54, 100)
        page.set_viewport_size({'width': 390, 'height': 760})
        check_xp(page, 54, 100)
        page.evaluate('async()=>{window.fixtureWall+=60000;await fixtureApp.change(s=>s);}')
        check_xp(page, 54, 0)
        assert page.evaluate("""async preview=>{
          const app=fixtureApp,state=preview?await app.store.read():(await app.db.get('gameplay','primary')).state;
          const memory=state.mind.memories.find(m=>m.id==='saved-waggle');
          return state.mind.stageXP===54&&state.mind.lifetimeXP===190&&state.mind.history.find(e=>e.id==='one-point').xp===1&&
            state.mind.history.find(e=>e.id==='grounded-at-cap').xp===0&&memory.strength===.3+.01*(1-.3)&&memory.activations===2;
        }""", preview)
        assert not errors, errors
        context.close()
        print(f'{"Stage Preview" if preview else "Normal"}: capped award, grounded Talk, blocked Research, reload, accessible bars and daily reset passed')
    browser.close()
