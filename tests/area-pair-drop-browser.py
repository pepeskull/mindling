"""Real area pointer drops and isolated IndexedDB; synthetic provider only."""
import os,json
from playwright.sync_api import sync_playwright
DECISION=os.environ.get('AREA_TEST_DECISION','OVERLAPS')
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000},reduced_motion='reduce')
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  context.add_init_script('window.fixtureDecision='+json.dumps(DECISION))
  page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js'),{connectAreas}=await import('/src/semantic/area-pair-worker.js');
   window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'drop-'+preview}));
   await write(s=>{s.mind.memories=['Video games use engines to render scenes.','Game engines render scenes in video games.'].map((content,i)=>({id:'m'+i,content,category:i?'Game engines':'Video games',categoryId:'area'+i,topic:'Rendering',source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},relatedMemoryIds:[]}));return s;});
   window.app={state:await read(),store:db,async change(fn,opts){this.state=await write(fn,opts);window.view?.update(this.state.mind);}};
   await db.saveResearchPermissions(app.state.mind.id,{enabled:true,semanticCallsPerDay:3});
   window.calls=0;const gate=new Promise(resolve=>window.releaseResponse=resolve);const originalFetch=window.fetch;
   window.fetch=async(url,opts)=>{if(url!=='/api/mindling/reason')return originalFetch(url,opts);calls++;await gate;const body=JSON.parse(opts.body);if(body.mode!=='area-pair'||body.context.areas.length!==2)throw Error('Not dedicated area analysis');return Response.json({id:body.id,service:'mindling-reasoning-service',result:{decision:window.fixtureDecision,parent:window.fixtureDecision==='CONTAINS'?'A':'NONE',support:'supported',scopePreserved:true,reason:'Both supplied areas describe scene rendering.',citations:['A','B'].map(area=>({area,memory:0,first:0,last:0}))}});};
   document.querySelectorAll('.installation').forEach(e=>e.remove());document.querySelector('#app').hidden=false;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#memory-view').hidden=false;document.querySelector('#app').classList.add('memory-mode');
   window.view=new NeuralMemoryView(document.querySelector('#memory-view'),{onMergeAreas:async()=>{throw Error('Unexpected manual hierarchy commit');},onConnectAreas:(ids,id,progress)=>connectAreas(app,ids,id,progress)});view.update(app.state.mind);view.setVisible(true);
   window.original=JSON.stringify(app.state.mind.memories.map(m=>[m.content,m.category,m.analysis]));
  }''',preview)
  page.wait_for_function('view.layout && !view.loadingView')
  page.evaluate('''()=>{window.point=id=>{const n=view.layout.nodes.find(n=>n.kind==='area'&&n.label===id),box=view.canvas.getBoundingClientRect();return {x:box.left+view.pan.x+n.x*view.zoom,y:box.top+view.pan.y+n.y*view.zoom};};}''')
  a=page.evaluate("point('Video games')");b=page.evaluate("point('Game engines')")
  page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=10);page.mouse.up()
  page.wait_for_function('calls===1')
  assert page.evaluate("!app.state.mind.memories.some(m=>m.relatedMemoryIds.length) && !view.graph.edges.some(e=>e.persisted&&['semantic-area','canonical-area-membership'].includes(e.origin))")
  page.evaluate('releaseResponse()')
  page.wait_for_function("view.root.querySelector('.memory-connection-status')?.textContent.includes('was saved')")
  assert page.evaluate("calls===1 && app.state.mind.memories.every(m=>m.relatedMemoryIds.length===0) && app.state.mind.semanticAreaRelations.records.length===1 && original===JSON.stringify(app.state.mind.memories.map(m=>[m.content,m.category,m.analysis]))")
  assert page.evaluate("view.graph.edges.some(e=>e.persisted&&['semantic-area','canonical-area-membership'].includes(e.origin))")
  # Duplicate request after the pointer drop cannot bill again.
  page.evaluate("view.connectAreaPair(...view.graph.areas.map(a=>a.id))")
  assert page.evaluate('calls===1')
  page.evaluate('view.destroy();db.close()');page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{graphData}=await import('/src/memory/graph-data.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const s=preview?await db.read():(await db.get('gameplay','primary')).state;const ok=s.mind.memories.every(m=>m.relatedMemoryIds.length===0)&&s.mind.areaPairAttempts[0].state==='COMPLETED'&&graphData(s.mind).edges.some(e=>e.persisted&&['semantic-area','canonical-area-membership'].includes(e.origin));db.close();return ok;}''',preview)
  assert not errors,errors
  print(('Stage Preview' if preview else 'Normal')+': area drop, full evidence, stored area edge, immutable memories, duplicate protection and reload PASS',flush=True)
  context.close()
 browser.close()
