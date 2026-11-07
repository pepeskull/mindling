"""Offline subject continuity, button-only clarification, elastic graph and area identity.
Normal and Preview use separate real IndexedDB stores. No screenshots/model calls.
"""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000});errors=[]
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  print(page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js'),{understandInput}=await import('/src/learning/input-understanding.js'),{interpretInteraction,resumeClarification}=await import('/src/learning/clarification.js');
   const {Dashboard}=await import('/src/ui/dashboard.js'),{EventBus}=await import('/src/app/events.js');
   const db=await(preview?new PreviewStore():new MindlingDatabase()).open(),read=()=>preview?db.read():db.get('gameplay','primary').then(x=>x.state),write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'continuity-'+preview}));await write(s=>{s.mind.memories=Array.from({length:5},(_,i)=>({id:'memory'+i,content:`Distinct fixture claim ${i} about competitive rules.`,source:'SERVICE',categoryId:i<2?'sports':'football',category:i<2?'Sports':'Association football',topic:'Topic '+i,submissionId:'submission'+i,relatedMemoryIds:i?['memory'+(i-1)]:[]}));return s;});
   const app={state:await read(),store:db,renderState(){},async change(fn,opts){this.state=await write(fn,opts);}};window.app=app;window.db=db;window.read=read;
   await db.saveResearchPermissions(app.state.mind.id,{enabled:true});const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();window.engine=engine;
   app.submitInput=async(text,activity,id,{continuation})=>{const flow=interpretInteraction(app,text,activity,id,continuation);if(flow.result)return flow.result;await engine.prepare(flow.interpretation,id,{taskId:flow.taskId,guard:flow.guard});return {accepted:true,message:'Scope selected.'};};
   const dashboard=new Dashboard(new EventBus(),{onClarification:(...args)=>resumeClarification(app,...args)});dashboard.render({...app.state.mind,mindlingId:app.state.mind.id});app.dashboard=dashboard;window.dashboard=dashboard;document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelectorAll('.installation').forEach(e=>e.remove());
   window.calls=[];window.originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(url!=='/api/mindling/reason')return originalFetch(url,options);const body=JSON.parse(options.body);calls.push(body);if(body.mode!=='research')throw Error('unexpected search');return Response.json({service:'mindling-reasoning-service',kind:'research-plan',planning:{plan:['Compare competition structure'],clarification:{question:'Which scope within Italian football?',options:[{id:'league',label:'Serie A — top division',value:'Serie A league rules'},{id:'system',label:'Italian league system',value:'Italian league system'}]},queries:[],sourceCategory:'web'},information:{provider:'openai-web-search',available:true}});};
   const task=await engine.prepare(understandInput('learn about italian soccer league','TEACH'),'original-request');window.taskId=task.id;window.before=JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP]);dashboard.beginInteraction('original-request');await engine.run(task,task.topic);
   if(calls.length!==1||calls[0].context.topic!=='italian soccer league')throw Error('subject not delivered');
   return `${preview?'Preview':'Normal'}: existing planning call receives original subject`;
  }''',preview),flush=True)
  assert page.locator('[data-talk-content] input,[data-talk-content] textarea').count()==0
  assert page.locator('[data-talk-content] .clarification-choices button').count()==2
  page.locator('[data-talk-content] .clarification-choices button').first.click()
  page.wait_for_function('app.state.mind.learningTasks.find(t=>t.id===taskId).scope.detail==="Serie A league rules"')
  print(page.evaluate('''async()=>{const {researchSubject}=await import('/src/autonomous/research-subject.js');const task=app.state.mind.learningTasks.find(t=>t.id===taskId);if(task.originalText!=='Learn about italian soccer league')throw Error('original lost');await engine.run(task,researchSubject(task));const next=app.state.mind.learningTasks.find(t=>t.id===taskId);if(next.code!=='CLARIFICATION_UNAVAILABLE'||calls.length!==2||next.sourceRequests!==0)throw Error('clarification loop/search');if(!calls[1].context.topic.includes('italian soccer league — Serie A'))throw Error('scope replaced subject');if(JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP])!==before)throw Error('unexpected mutation');await new Promise(r=>setTimeout(r,30));engine.destroy();dashboard.destroy();globalThis.fetch=originalFetch;
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js'),{AdaptivePathwaysView}=await import('/src/pathways/pathway-view.js'),{livePathways}=await import('/src/pathways/live-pathways.js'),{graphData}=await import('/src/memory/graph-data.js');
   const graph=graphData(app.state.mind),paths=livePathways(graph,app.state.mind),host=document.createElement('div');document.body.append(host);new AdaptivePathwaysView(host).update(app.state.mind,paths);if(host.querySelectorAll('[data-area-id]').length!==2||host.querySelector('li').style.borderImage)throw Error('areas merged or gradient remains');window.areaMarkers=[...host.querySelectorAll('[data-area-id]')].map(e=>({id:e.dataset.areaId,color:e.style.borderLeftColor,text:e.textContent}));host.remove();
   const root=document.querySelector('#memory-view');root.hidden=false;document.querySelector('#app').classList.add('memory-mode');window.memory=new NeuralMemoryView(root);memory.update(app.state.mind);memory.setVisible(true);return 'Button scope and original survive persistence; repeated ambiguity stops without search or extra charge';}'''),flush=True)
  page.wait_for_function('memory.layout?.nodes.some(n=>n.kind==="area")')
  assert page.evaluate('''()=>areaMarkers.every(m=>{const e=document.createElement('span');e.style.color=memory.colors.get(m.id);return e.style.color===m.color;})''')
  def point():
   return page.evaluate('''()=>{const n=memory.layout.nodes.find(n=>n.kind==='area'),b=memory.canvas.getBoundingClientRect();window.area=n.id;window.positions=memory.layout.nodes.map(n=>({id:n.id,x:n.x,y:n.y,areaId:n.areaId}));return {x:b.x+n.x*memory.zoom+memory.pan.x,y:b.y+n.y*memory.zoom+memory.pan.y};}''')
  pos=point();page.mouse.click(pos['x'],pos['y']);assert page.evaluate('memory.selected===area');detail=page.locator('#memory-inspector-title').text_content()
  page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+65,pos['y']+25)
  assert page.evaluate('''()=>{const old=positions.find(n=>n.id===area),root=memory.positions.get(area),child=positions.find(n=>n.areaId===area);return root.x>old.x&&memory.positions.get(child.id).x-child.x<root.x-old.x;}''')
  page.mouse.up();page.wait_for_function('!memory.elastic?.active');assert page.locator('#memory-inspector-title').text_content()==detail
  assert page.evaluate('''()=>{const dx=memory.positions.get(area).x-positions.find(p=>p.id===area).x;return positions.every(p=>Math.abs(memory.positions.get(p.id).x-p.x-((p.id===area||p.areaId===area)?dx:0))<.1)&&memory.layout.edges.every(e=>memory.positions.has(e.from)&&memory.positions.has(e.to));}''')
  pos=point();page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']-20,pos['y']+10);page.evaluate("memory.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:memory.drag.id}))");page.mouse.up();assert page.evaluate('memory.drag===null&&memory.elastic===null')
  page.emulate_media(reduced_motion='reduce');pos=point();page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+20,pos['y']+10);page.mouse.up();assert page.evaluate('!memory.elastic?.active')
  assert page.evaluate('''async()=>{memory.setVisible(false);if(memory.frame!==null||memory.elastic!==null)return false;const saved=await read();return JSON.stringify([saved.mind.memories,saved.mind.energy,saved.mind.lifetimeXP])===before;}''')
  page.evaluate('memory.destroy();db.close()');page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open(),s=preview?await db.read():(await db.get('gameplay','primary')).state,t=s.mind.learningTasks[0];db.close();return t.originalText==='Learn about italian soccer league'&&t.scope.detail==='Serie A league rules'&&t.code==='CLARIFICATION_UNAVAILABLE'&&t.modelCalls===2&&s.mind.memories.length===5;}''',preview)
  assert not errors,errors
  print('Elastic lag/settling/cancellation/reduced motion, inspector, area colors, reload and unchanged memory/XP/Energy passed',flush=True)
  context.close()
 browser.close()
