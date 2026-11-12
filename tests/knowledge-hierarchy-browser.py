"""Real isolated stores and pointer interaction; all external/API traffic blocked."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000},reduced_motion='reduce');errors=[]
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js'),{graphData}=await import('/src/memory/graph-data.js'),{commitHierarchy,mergeProposal}=await import('/src/memory/knowledge-hierarchy.js');
   const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js'),{understandInput}=await import('/src/learning/input-understanding.js');
   window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'hierarchy-'+preview}));
   await write(s=>{s.mind.memories=[{id:'a',content:'A broad sport observation.',category:'Sport',categoryId:'sport',relatedMemoryIds:['b']},{id:'b',content:'A football observation.',category:'Association football',categoryId:'football',relatedMemoryIds:['a'],research:{sourceURL:'https://example.org/evidence',quoteHash:'preserved'}},{id:'c',content:'A scientific observation.',category:'Science',categoryId:'science'},{id:'d',content:'Another distinct football observation.',category:'Association football',categoryId:'football'}];s.mind.memories.forEach((m,i)=>{m.source='SERVICE';m.analysis={name:'mindling-learning-service',verification:'unverified-player-claim'};m.intelligence={kind:'claim',current:true};m.contentIntegrity={version:1,status:'captured',length:m.content.length};m.topic='Fixture topic '+i;});return s;});
   window.app={state:await read(),store:db,renderState(){},async change(fn,opts){this.state=await write(fn,opts);}};
   const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
   for(let i=0;i<8;i++)await engine.prepare(understandInput('Learn about public topic '+i,'TEACH'),'fixture-'+i);engine.destroy();
   window.before=JSON.stringify([app.state.mind.memories,app.state.mind.pathways,app.state.mind.energy,app.state.mind.lifetimeXP]);
   document.querySelectorAll('.installation').forEach(e=>e.remove());document.querySelector('#app').hidden=false;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#memory-view').hidden=false;document.querySelector('#app').classList.add('memory-mode');
   window.makeView=()=>{window.view=new NeuralMemoryView(document.querySelector('#memory-view'),{onMemoryView:(id,value)=>db.memoryView(id,value),onMergeAreas:async(proposal,id)=>{await write(s=>{if(s.mind.id!==id)throw Error('identity');const next={...s,mind:commitHierarchy(s.mind,graphData(s.mind),proposal)};if(window.rejectMerge)throw Error('mock transaction rejection');return next;});view.update((await read()).mind);}});return view;};
   makeView();view.update((await read()).mind);view.setVisible(true);
   window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
   window.point=label=>{const n=view.layout.nodes.find(n=>n.kind==='area'&&n.label===label),b=view.canvas.getBoundingClientRect();return{x:b.left+view.pan.x+n.x*view.zoom,y:b.top+view.pan.y+n.y*view.zoom};};
  }''',preview)
  page.wait_for_function('view.layout && !view.loadingView && view.stage.clientHeight>0')
  def drag(a,b,valid,commit=True):
   start=page.evaluate('point',a);target=page.evaluate('point',b)
   page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(target['x'],target['y'],steps=12)
   page.wait_for_function('view.mergePreview!==null')
   assert page.evaluate('view.mergePreview.proposal.valid')==valid
   if valid:
    assert page.evaluate('view.graph.areas.find(a=>a.id===view.mergePreview.proposal.parentId).label==="Sport"')
    assert page.evaluate('view.mergePreview.radius>18 && view.mergePreview.layout.nodes.filter(n=>n.kind==="area").length===1 && view.mergePreview.layout.nodes.filter(n=>n.kind==="memory").length===3')
   else:assert page.evaluate('view.mergePreview.layout===null && view.mergePreview.involved.size>2')
   assert page.evaluate('''valid=>{const strokes=[],ctx=view.ctx,stroke=ctx.stroke;ctx.strokeStyle=valid?'#83dba688':'#969a9f66';const expected=ctx.strokeStyle;ctx.stroke=function(){strokes.push(this.strokeStyle);return stroke.call(this);};try{view.draw();}finally{ctx.stroke=stroke;}return strokes.filter(c=>c===expected).length>=2;}''',valid)
   if commit:page.wait_for_timeout(650);page.mouse.up()
   else:
    # Freeze the brief-release interval inside one browser task: host CPU load
    # must not turn a deliberate short crossing into a 600ms merge hold.
    page.evaluate('''()=>{view.mergePreview.since=performance.now();view.canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:view.drag.id}));}''');page.mouse.up()
   page.wait_for_timeout(200)
  # A simple click selects; unrelated drag rolls back all displayed positions.
  point=page.evaluate('point','Sport');page.mouse.click(point['x'],point['y']);assert page.evaluate('view.selected===view.graph.areas.find(a=>a.label==="Sport").id')
  positions=page.evaluate('view.layout.nodes.map(n=>[n.id,n.x,n.y])')
  drag('Sport','Science',False)
  assert page.evaluate('view.layout.nodes.map(n=>[n.id,n.x,n.y])')==positions
  assert page.evaluate('!view.state.knowledgeHierarchy')
  # Brief crossings cannot accidentally merge. Failed commits preserve storage.
  drag('Sport','Association football',True,False);
  # Pointer cancellation restores both existing clusters without committing.
  start=page.evaluate('point','Sport');target=page.evaluate('point','Science');page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(target['x'],target['y'],steps=10)
  assert page.evaluate('view.mergePreview && !view.mergePreview.proposal.valid')
  page.evaluate('view.canvas.dispatchEvent(new PointerEvent("pointercancel",{pointerId:view.drag.id}))');page.mouse.up()
  assert page.evaluate('view.mergePreview===null && !view.state.knowledgeHierarchy')
  assert page.evaluate('view.layout.nodes.map(n=>[n.id,n.x,n.y])')==positions
  drag('Association football','Sport',True,False);assert page.evaluate('!view.state.knowledgeHierarchy')
  page.evaluate('window.rejectMerge=true');drag('Association football','Sport',True);assert page.evaluate('!view.state.knowledgeHierarchy')
  page.evaluate('window.rejectMerge=false');drag('Association football','Sport',True)
  page.wait_for_function("view.graph.stats.areas===2 && view.layout.nodes.filter(n=>n.kind==='area').length===2")
  assert page.evaluate('''async()=>{const s=await read();check(JSON.stringify([s.mind.memories,s.mind.pathways,s.mind.energy,s.mind.lifetimeXP])===before,'canonical data changed');check(s.mind.knowledgeHierarchy.links.length===1,'hierarchy not durable');const childId=s.mind.knowledgeHierarchy.links[0].childId;check(view.layout.edges.filter(e=>e.from===childId&&view.positions.get(e.to)?.kind==='memory').length===2,'projected child edges lost with task overlay');const {BrainStateModel}=await import('/src/network/brain-state-model.js');const b=new BrainStateModel();b.update(s.mind);check(b.summary.areas===2&&b.summary.memories===4&&b.summary.associations===1,'Network projection');const {graphData}=await import('/src/memory/graph-data.js'),{livePathways}=await import('/src/pathways/live-pathways.js'),{AdaptivePathwaysView}=await import('/src/pathways/pathway-view.js'),{areaColor}=await import('/src/memory/area-colors.js');const g=graphData(s.mind),paths=livePathways(g,s.mind),host=document.createElement('div'),pv=new AdaptivePathwaysView(host);pv.update(s.mind,paths);const child=paths[0].areas.find(a=>a.label==='Association football'),marker=[...host.querySelectorAll('[data-area-id]')].find(n=>n.dataset.areaId===child.id);check(paths[0].count===3&&paths[0].share===.75,'pathway count/share');check(marker.textContent==='Sport › Association football · 2','pathway hierarchy');const color=document.createElement('span');color.style.borderLeftColor=areaColor(child.id);check(marker.style.borderLeftColor===color.style.borderLeftColor,'pathway color changed');pv.destroy();check(view.root.querySelector('.memory-browser').textContent.includes('Sport › Association football'),'Browse hierarchy');return true;}''')
  # Ordinary drag persists root positions without merging; pagination/filter state survives.
  start=page.evaluate('point','Science');page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(start['x']-35,start['y']+30,steps=8);page.mouse.up();page.wait_for_timeout(700)
  page.evaluate('view.root.querySelector(".research-task-browser").open=true')
  page.locator('[data-task-search]').fill('public');page.locator('[data-task-page=next]').click();page.wait_for_timeout(700)
  assert page.evaluate('view.taskPage===1 && view.root.querySelectorAll(".research-task-browser ul li").length<=6')
  saved=page.evaluate('''async()=>{await view.saveChain;const p=await db.memoryView(view.viewIdentity);check(p.taskPage===1,'task page not saved');check(Object.keys(p.positions).length===2,'only displayed roots retain independent positions');window.saved=p;view.setVisible(false);view.setVisible(true);return p;}''')
  page.wait_for_timeout(500)
  assert page.evaluate('view.taskPage===1 && view.taskQuery==="public"')
  # Stale hierarchy/UI revisions and wrong identities are rejected transactionally.
  assert page.evaluate('''async()=>{let n=0;for(const value of [{...saved,hierarchyRevision:0},{...saved,revision:0}])try{await db.memoryView(view.viewIdentity,value);}catch{n++;}try{await db.memoryView('different',saved);}catch{n++;}return n===3;}''')
  page.evaluate('view.destroy()');page.wait_for_timeout(500);page.evaluate('db.close()');page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();const s=preview?await db.read():(await db.get('gameplay','primary')).state;window.persisted=await db.memoryView(s.mind.id);document.querySelectorAll('.installation').forEach(e=>e.remove());document.querySelector('#app').hidden=false;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#memory-view').hidden=false;document.querySelector('#app').classList.add('memory-mode');window.view=new NeuralMemoryView(document.querySelector('#memory-view'),{onMemoryView:(id,value)=>db.memoryView(id,value)});view.update(s.mind);view.setVisible(true);return s.mind.knowledgeHierarchy.links.length===1&&s.mind.memories.length===4;}''',preview)
  page.wait_for_function('view.layout && !view.loadingView')
  assert page.evaluate('''()=>view.taskPage===1&&view.taskQuery==='public'&&view.root.querySelector('.research-task-browser').open&&view.layout.nodes.filter(n=>n.kind==='area').every(n=>Math.abs(n.x-persisted.positions[n.id].x)<.01&&Math.abs(n.y-persisted.positions[n.id].y)<.01)''')
  assert not errors,errors
  print(('Preview' if preview else 'Normal')+': validated previews, atomic hierarchy, rollback, preserved knowledge, compact tasks, isolated durable layout and stale-write guards passed',flush=True)
  context.close()
 browser.close()
