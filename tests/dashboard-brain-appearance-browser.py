"""Exercise Dashboard appearance with disposable IndexedDB and a mocked Talk response."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv('MINDLING_TEST_URL', 'http://127.0.0.1:8774')
THREE = Path(os.getenv('MINDLING_THREE_DIR', '/tmp/mindling-three-0180'))
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
    if viewport['width']>800:
        page.get_by_label('Neural appearance').select_option('holo')
        assert page.evaluate('fixtureApp.brainAppearance.profile')=='holo'
        page.get_by_label('Neural appearance').select_option('soft')
    assert page.evaluate('fixtureApp.brainAppearance.profile')=='soft'
    pose=page.evaluate("""()=>{
      const app=fixtureApp;
      app.interaction.restorePose({rotation:{x:-.25,y:.32},zoom:1.12,targetZoom:1.12});
      app.seed.setSelection({type:'synapse',id:'origin-upper'});
      return app.interaction.capturePose();
    }""")
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
    assert not errors, errors
    assert not api, api
    page.evaluate('fixtureApp.destroy()')
    assert page.locator('#scene .dashboard-brain-effects').count()==0
    print(f'{"Stage Preview" if preview else "Dashboard"} · {"Canvas" if canvas else "WebGL 2"} · {viewport["width"]}px passed',flush=True)
    context.close()


if __name__=='__main__':
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle',
            '--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        test_case(browser,False,False,{'width':1440,'height':900})
        test_case(browser,True,True,{'width':390,'height':780})
        browser.close()
