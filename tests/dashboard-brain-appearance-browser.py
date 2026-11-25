"""Exercise Dashboard appearance with disposable IndexedDB and a mocked Talk response."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv('MINDLING_TEST_URL', 'http://127.0.0.1:8774')
THREE = Path(os.getenv('MINDLING_THREE_DIR', '/tmp/mindling-three-0180'))
ARTIFACTS = os.getenv('MINDLING_UI_ARTIFACTS')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/'
BOOT = """
const params=new URLSearchParams(location.search);
const {MindlingApp}=await import('/src/app/app.js');
const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
const app=window.fixtureApp=params.has('stage-preview')?new SandboxPreview():new MindlingApp();
app.forceCanvas=params.has('canvas');
await app.start();
window.fixtureReady=true;
"""
SEED = """async preview=>{
  const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
  const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const store=await (preview?new PreviewStore():new MindlingDatabase()).open();
  const now=Date.now(), state=newMindling(createSandbox(now),{id:'brain-fixture',name:'Lab',confirmed:true});
  state.wallAt=now;
  const content='The duration of a waggle run increases with the distance to the food source.';
  state.mind.memories=[{id:'fixture-memory',content,concept:'Waggle duration',category:'Behavior',kind:'claim',source:'NATIVE',
    createdAt:new Date(now).toISOString(),contentIntegrity:{version:1,status:'captured',length:content.length},
    strength:.3,activations:1,neuronIds:['origin','upper'],synapseIds:['origin-upper'],relatedMemoryIds:[]}];
  if(preview)await store.change(()=>state);else await store.changeGameplay(()=>state);
  store.close();
}"""
TALK = """async()=>{
  const app=fixtureApp,{knowledgeTalk}=await import('/src/cognition/talk-response.js');
  const original=window.fetch,content=app.state.mind.memories[0].content;
  window.fetch=async(url,options)=>{
    if(url!=='/api/mindling/reason'||JSON.parse(options.body).mode!=='talk')throw Error('Unexpected request');
    return Response.json({service:'mindling-reasoning-service',kind:'talk',reasoning:{answer:content,explanation:'Stored evidence',
      facts:[{memoryId:'fixture-memory',quote:content,basis:'stored_claim'}],
      inferences:[],memoryIds:['fixture-memory'],uncertainty:'low',insufficientInformation:false,missingInformation:[]}});
  };
  try{await knowledgeTalk(app,'How does waggle run duration change with distance?','brain-talk');}finally{window.fetch=original;}
  return app.brainAppearance.events.map(({key,synapseId})=>[key,synapseId]);
}"""


def test_case(browser,preview,canvas,viewport):
    context=browser.new_context(viewport=viewport,reduced_motion='reduce')
    api=[]
    def route_asset(route):
        url=route.request.url
        if url==BASE+'/brain-fixture':
            route.fulfill(body='<body></body>',content_type='text/html')
        elif url==BASE+'/js/bootstrap.js':
            route.fulfill(body=BOOT,content_type='application/javascript')
        elif url.startswith(CDN) and (THREE/url.rsplit('/',1)[-1]).is_file():
            route.fulfill(path=THREE/url.rsplit('/',1)[-1],content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'})
        elif url.startswith(BASE+'/') and '/api/' not in url:
            route.continue_()
        else:
            if '/api/' in url:api.append(url)
            route.abort()
    context.route('**/*',route_asset)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda message:errors.append(message.text) if message.type=='error' and 'THREE.' in message.text else None)
    page.goto(BASE+'/brain-fixture')
    page.evaluate(SEED,preview)
    query=['stage-preview=1'] if preview else []
    if canvas:query.append('canvas=1')
    page.goto(BASE+'/'+('?'+'&'.join(query) if query else ''))
    page.wait_for_function('()=>window.fixtureReady')
    page.wait_for_function("()=>fixtureApp.brainAppearance.webgl||fixtureApp.brainAppearance.canvas")
    assert page.evaluate('Boolean(fixtureApp.view.three)')== (not canvas)
    assert page.locator('[data-brain-preset],.brain-activity-legend').count()==0
    assert page.evaluate('fixtureApp.brainAppearance.profile')=='soft'
    assert page.locator('.view-list button').first.evaluate("(button)=>getComputedStyle(button).cursor")=='pointer'
    if ARTIFACTS and not preview:
        page.screenshot(path=Path(ARTIFACTS)/'dashboard.png')
    pose=page.evaluate("""()=>{
      const app=fixtureApp;
      app.interaction.restorePose({rotation:{x:-.25,y:.32},zoom:1.12,targetZoom:1.12});
      app.seed.setSelection({type:'synapse',id:'origin-upper'});
      return app.interaction.capturePose();
    }""")
    node=page.evaluate("fixtureApp.seed.inputTarget()")
    assert page.evaluate("(node)=>fixtureApp.seed.hoverAt({clientX:node.x,clientY:node.y})?.type",node)=='neuron'
    page.mouse.click(node['x'],node['y'])
    assert page.evaluate('fixtureApp.seed.view.selection.id')=='origin-upper'
    if viewport['width']>800:
        edge=page.evaluate('''node=>{
          const {seed}=fixtureApp;
          for(let radius=40;radius<=280;radius+=10){
            for(let angle=0;angle<2*Math.PI;angle+=.08){
              const x=Math.round(node.x+radius*Math.cos(angle)),y=Math.round(node.y+radius*Math.sin(angle));
              const pick=(dx,dy)=>seed.hoverAt({clientX:x+dx,clientY:y+dy});
              const hit=pick(0,0);
              if(hit?.type==='synapse'&&document.elementFromPoint(x,y)?.closest('#scene')&&
                [[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>pick(dx,dy)?.id===hit.id))return {x,y,id:hit.id};
            }
          }
          return null;
        }''',node)
        assert edge
        page.evaluate("fixtureApp.seed.setSelection(null)")
        page.mouse.click(edge['x'],edge['y'])
        assert page.evaluate('fixtureApp.seed.view.selection?.id')==edge['id'], edge
        page.evaluate("fixtureApp.seed.setSelection({type:'synapse',id:'origin-upper'})")
        page.mouse.move(node['x'],node['y'])
        page.mouse.down()
        page.mouse.move(node['x']+28,node['y']+15,steps=4)
        page.mouse.up()
        assert page.evaluate('fixtureApp.interaction.rotation')!=pose['rotation']
        page.evaluate('(pose)=>fixtureApp.interaction.restorePose(pose)',pose)
    model=page.evaluate('fixtureApp.seed.model')
    for name in ('synapses','activity','xray','neural','activity'):
        # Mobile manages collapse of the enclosing panel separately.
        button=page.locator(f'[data-brain-mode="{name}"]')
        button.evaluate('(button)=>button.click()')
        assert button.get_attribute('aria-pressed')=='true'
        assert page.evaluate('fixtureApp.interaction.capturePose()')==pose
        assert page.evaluate('fixtureApp.seed.view.selection.id')=='origin-upper'
        assert page.evaluate('fixtureApp.seed.model')==model
    assert page.evaluate(TALK)==[['talk','origin-upper'],['recall','origin-upper']]
    page.wait_for_function('()=>fixtureApp.brainAppearance.activeCues.length===0')
    page.evaluate("""async()=>{
      await fixtureApp.change(state=>{state.mind.stage=5;return state;});
      document.querySelector('[data-brain-mode=xray]').click();
    }""")
    page.wait_for_function("""()=>fixtureApp.seed.view.data.visualNeuronCount===148&&
      (fixtureApp.brainAppearance.webgl?.wires.size||fixtureApp.brainAppearance.canvas)""")
    if not canvas:
        assert page.evaluate('fixtureApp.view.soma.count===148')
    else:
        assert page.locator('#scene .dashboard-brain-effects').count()==1
    page.evaluate("fixtureApp.primaryViewChanged('development')")
    assert page.evaluate('!fixtureApp.brainAppearance.webgl&&!fixtureApp.brainAppearance.canvas')
    page.evaluate("fixtureApp.primaryViewChanged('dashboard')")
    page.wait_for_function('()=>fixtureApp.brainAppearance.webgl||fixtureApp.brainAppearance.canvas')
    assert page.locator('[data-brain-mode=xray]').get_attribute('aria-pressed')=='true'
    if not preview:
        verify_navigation(page)
    assert not errors, errors
    assert not api, api
    page.evaluate('fixtureApp.destroy()')
    assert page.locator('#scene .dashboard-brain-effects,[data-cloud],[data-fallback]').count()==0
    print(f'{"Stage Preview" if preview else "Dashboard"} · {"Canvas" if canvas else "WebGL 2"} · {viewport["width"]}px passed',flush=True)
    context.close()


def verify_navigation(page):
    page.emulate_media(reduced_motion='no-preference')
    page.locator('[data-view=development]').click()
    cloud=page.locator('#development-view canvas[data-cloud]')
    assert cloud.is_visible()
    assert page.locator('#development-view canvas').count()==2  # WebGL and its existing fallback
    assert page.locator('#development-view [data-brain-backend]').count()==0
    assert 'positioned neurons' in page.locator('#development-view [data-brain-accessible]').text_content()
    assert page.locator('#network-view canvas[data-cloud]').count()==0
    page.evaluate("window.initialCloud=document.querySelector('[data-cloud]')")
    if ARTIFACTS:
        page.screenshot(path=Path(ARTIFACTS)/'development.png')
    page.locator('[data-view=network]').click()
    assert cloud.is_hidden()
    detail=page.locator('.integration-detail')
    panel=page.locator('.integration-detail-motion')
    assert panel.is_hidden()

    telegram=page.locator('[data-platform=telegram]')
    discord=page.locator('[data-platform=discord]')
    github=page.locator('[data-platform=github]')
    transition=page.evaluate("""()=>{
      const button=document.querySelector('[data-platform=telegram]');
      button.focus();
      button.click();
      const panel=document.querySelector('.integration-detail-motion'),detail=panel.firstElementChild;
      const [height]=panel.getAnimations(),[content]=detail.getAnimations();
      const keyframes=height.effect.getKeyframes();
      return {from:keyframes[0].height,to:keyframes[1].height,opacity:content.effect.getKeyframes()[0].opacity,
        duration:height.effect.getTiming().duration};
    }""")
    assert transition['from']=='0px' and float(transition['to'][:-2])>0
    assert transition['opacity']=='0' and transition['duration']==340
    page.wait_for_function("!document.querySelector('.integration-detail').getAnimations().length")
    assert detail.locator('h3').text_content()=='Telegram'
    switched=page.evaluate("""()=>{
      const panel=document.querySelector('.integration-detail-motion'),height=panel.getBoundingClientRect().height;
      document.querySelector('[data-platform=discord]').click();
      return {height,from:parseFloat(panel.getAnimations()[0].effect.getKeyframes()[0].height),
        name:panel.querySelector('h3').textContent};
    }""")
    assert switched['name']=='Discord' and switched['from']==switched['height']>0
    page.evaluate("""()=>{
      for(const name of ['discord','telegram','github'])document.querySelector('[data-platform='+name+']').click();
    }""")
    page.wait_for_function("!document.querySelector('.integration-detail').getAnimations().length")
    assert detail.locator('h3').text_content()=='GitHub'
    assert detail.locator('[data-detail-permissions] li').all_text_contents()==['Selected repositories','Explicit write approval']
    assert github.get_attribute('aria-pressed')=='true' and telegram.get_attribute('aria-pressed')=='false'
    if ARTIFACTS:
        page.screenshot(path=Path(ARTIFACTS)/'network.png')
    github.press('Enter')
    panel.wait_for(state='hidden')
    assert github.get_attribute('aria-pressed')=='false'
    for _ in range(2):
        page.locator('[data-view=development]').click()
        assert cloud.is_visible()
        assert cloud.evaluate('(node)=>node===window.initialCloud')
        page.locator('[data-view=network]').click()
        assert cloud.is_hidden()
    page.emulate_media(reduced_motion='reduce')
    discord.press('Enter')
    assert detail.locator('h3').text_content()=='Discord' and panel.is_visible()
    assert panel.evaluate('(node)=>node.getAnimations({subtree:true}).length')==0
    discord.press('Enter')
    assert panel.is_hidden()
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-mobile-view=development]').click()
    assert cloud.is_visible()
    page.wait_for_function("""()=>{
      const canvas=document.querySelector('[data-cloud]');
      return Math.abs(canvas.width-canvas.clientWidth*devicePixelRatio)<=1;
    }""")
    page.locator('[data-mobile-view=network]').click()
    telegram.click()
    assert detail.locator('h3').text_content()=='Telegram'
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    print('Cloud relocation, repeated navigation, responsive resizing, transition, rapid switching and reduced motion passed',flush=True)


if __name__=='__main__':
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle',
            '--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        test_case(browser,False,False,{'width':1440,'height':900})
        test_case(browser,True,True,{'width':390,'height':780})
        browser.close()
