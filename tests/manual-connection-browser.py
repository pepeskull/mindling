"""Real pointer drops and isolated IndexedDB; synthetic provider only."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000},reduced_motion='reduce')
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js'),{connectMemories}=await import('/src/semantic/manual-connection.js'),{decodeSemanticWire}=await import('/src/semantic/model-wire.js');
   window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'drop-'+preview}));
   await write(s=>{s.mind.memories=['Gravity affects orbital motion.','Sideways motion affects an orbit.'].map((content,i)=>({id:'m'+i,content,category:'Orbital mechanics',categoryId:'orbit',topic:'Motion',source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},strength:.1,activations:1,relatedMemoryIds:[]}));return s;});
   window.app={state:await read(),store:db,async change(fn,opts){this.state=await write(fn,opts);window.view?.update(this.state.mind);}};
   await db.saveResearchPermissions(app.state.mind.id,{enabled:true});
   window.calls=0;const gate=new Promise(resolve=>window.releaseResponse=resolve);const originalFetch=window.fetch;
   window.fetch=async(url,opts)=>{if(url!=='/api/mindling/reason')return originalFetch(url,opts);calls++;await gate;const body=JSON.parse(opts.body);if(body.context.areas||body.context.parentDiscovery)throw Error('Not memory-only');return Response.json({id:body.id,service:'mindling-reasoning-service',result:decodeSemanticWire({version:1,relationships:[{pair:0,reverse:false,type:'complements',evidenceA:{first:0,last:0},evidenceB:{first:0,last:0},assessment:{support:'supported',reason:'Synthetic orbital claims complement each other.',qualifications:[],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}]},body.context)});};
   document.querySelectorAll('.installation').forEach(e=>e.remove());document.querySelector('#app').hidden=false;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#memory-view').hidden=false;document.querySelector('#app').classList.add('memory-mode');
   window.view=new NeuralMemoryView(document.querySelector('#memory-view'),{onConnectMemories:(ids,id)=>connectMemories(app,ids,id)});view.update(app.state.mind);view.setVisible(true);
   window.original=JSON.stringify(app.state.mind.memories.map(m=>[m.content,m.category,m.analysis]));
  }''',preview)
  page.wait_for_function('view.layout && !view.loadingView')
  assert page.evaluate("""()=>{window.originalLayout=view.layout;return view.layout.nodes.filter(n=>n.kind==='memory').every(n=>n.r===5.5);}""")
  page.evaluate('''()=>{window.point=id=>{const n=view.layout.nodes.find(n=>n.recordId===id),box=view.canvas.getBoundingClientRect();return {x:box.left+view.pan.x+n.x*view.zoom,y:box.top+view.pan.y+n.y*view.zoom};};}''')
  a=page.evaluate("point('m0')");b=page.evaluate("point('m1')")
  page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=10);page.mouse.up()
  page.wait_for_function('calls===1')
  assert page.evaluate("view.connectionVisual?.state==='pending' && !app.state.mind.memories.some(m=>m.relatedMemoryIds.length) && !view.graph.edges.some(e=>e.persisted&&e.kind==='association')")
  page.evaluate('releaseResponse()')
  page.wait_for_function("view.connectionVisual?.state==='valid'")
  assert page.locator('.memory-connection-status').count()==0
  assert page.evaluate("calls===1 && app.state.mind.memories.every(m=>m.relatedMemoryIds.length===1) && original===JSON.stringify(app.state.mind.memories.map(m=>[m.content,m.category,m.analysis]))")
  page.wait_for_function("view.graph.edges.some(e=>e.persisted&&e.kind==='association')")
  assert page.evaluate("view.layout===originalLayout && view.layout.nodes.filter(n=>n.kind==='memory').every(n=>n.r===8.2 && n.r<n.ownerRadius)")
  assert page.evaluate("app.state.mind.memories.every(m=>m.strength===.1+.01*(1-.1)&&m.activations===2)")
  page.set_viewport_size({'width':400,'height':760})
  assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
  # Duplicate request after the pointer drop cannot bill again.
  page.evaluate("view.connectMemoryPair('m1','m0')")
  assert page.evaluate('calls===1')
  # Paint a temporary dense projection without writing it to the store.
  page.evaluate("""()=>{
   const fixture=structuredClone(app.state.mind);
   fixture.memories.push(...Array.from({length:410},(_,i)=>({
     id:'padding-'+i,content:'Synthetic orbital memory '+i,categoryId:'orbit',category:'Orbital mechanics',topic:'Motion'
   })));
   view.update(fixture);
  }""")
  page.wait_for_function('view.layout.nodes.length>400')
  assert page.evaluate("""()=>{
   const anchor=view.layout.nodes.find(n=>n.recordId==='m0'),arc=view.ctx.arc;
   view.zoom=.25;view.pan={x:view.stage.clientWidth/2-anchor.x*view.zoom,y:view.stage.clientHeight/2-anchor.y*view.zoom};
   let painted=false;
   view.ctx.arc=function(x,y,r,...args){if(x===anchor.x&&y===anchor.y&&r===8.2)painted=true;return arc.call(this,x,y,r,...args);};
   try{view.draw();return painted&&calls===1;}finally{view.ctx.arc=arc;}
  }""")
  page.evaluate('view.destroy();db.close()');page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{graphData}=await import('/src/memory/graph-data.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const s=preview?await db.read():(await db.get('gameplay','primary')).state;const ok=s.mind.memories.every(m=>m.relatedMemoryIds.length===1)&&s.mind.manualSemanticAttempts[0].state==='COMPLETED'&&graphData(s.mind).edges.some(e=>e.persisted&&e.kind==='association');db.close();return ok;}''',preview)
  assert not errors,errors
  print(('Stage Preview' if preview else 'Normal')+': pointer drop, validation, dense rendering, duplicate protection and reload PASS',flush=True)
  context.close()
 browser.close()
