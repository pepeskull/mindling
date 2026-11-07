"""Offline real DOM, pointer events and isolated stores. No screenshots or API calls."""
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
  page.evaluate('''async()=>{const {Onboarding}=await import('/src/ui/onboarding.js');window.created=null;window.onboard=new Onboarding(document.querySelector('#onboarding'),async draft=>{window.created=draft;await onboard.birth(draft.name);});onboard.show();}''')
  def visible(n):
   assert page.locator('.onboarding-node[data-visible=true]').count()==n
  visible(1);page.locator('[data-next]').click();visible(2)
  assert page.locator('[data-next]').is_disabled()
  for name in ['Developer','Social','Researcher']:page.locator(f'[data-pathway="{name}"]').click()
  page.locator('[data-next]').click();visible(3);page.locator('[data-next]').click();visible(4)
  page.locator('[data-back]').click();visible(3);page.locator('[data-next]').click();visible(4)
  page.locator('#mindling-name').fill('Fixture');page.locator('[data-next]').click();visible(5)
  for count in [4,3,2,1]:
   page.locator('[data-back]').click();visible(count)
  for count in [2,3,4,5]:
   page.locator('[data-next]').click();visible(count)
  page.locator('[data-create]').click();page.wait_for_function('document.querySelector("#birth-title")?.textContent==="AWAKENING COMPLETE"');visible(6)
  assert page.evaluate('created.pathways.length===3 && created.name==="Fixture"')
  page.set_viewport_size({'width':430,'height':930});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.evaluate('onboard.hide()');page.set_viewport_size({'width':1500,'height':1000})
  print(page.evaluate('''async preview=>{
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');const {understandInput}=await import('/src/learning/input-understanding.js');
   const db=await(preview?new PreviewStore():new MindlingDatabase()).open(),read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state),write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'targeted-'+preview}));
   await write(s=>{s.mind.memories=[{id:'a',content:'Cells have membranes.',category:'Science',topic:'Cells',relatedMemoryIds:['b']},{id:'b',content:'Devices process input.',category:'Technology',topic:'Devices',relatedMemoryIds:['a']}];return s;});
   document.querySelectorAll('.installation,.onboarding-overlay').forEach(el=>el.remove());document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#app').classList.add('memory-mode');const root=document.querySelector('#memory-view');root.hidden=false;window.memory=new NeuralMemoryView(root);memory.setVisible(true);
   const app={store:db,state:await read(),renderState(){memory.update(this.state.mind);},async change(fn,opts){this.state=await write(fn,opts);this.renderState();}};
   window.app=app;window.db=db;window.read=read;window.engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
   window.task=await engine.prepare(understandInput('learn about oceans','TEACH'),'oceans');app.renderState();window.original=JSON.stringify(app.state.mind.memories);
   return `${preview?'Preview':'Normal'}: onboarding six steps and back passed`;
  }''',preview))
  page.wait_for_function('memory.layout?.nodes.some(n=>n.kind==="area")')
  positions=page.evaluate('''()=>{const n=memory.layout.nodes.find(n=>n.kind==='area'),b=memory.canvas.getBoundingClientRect();window.area=n.id;window.positions=memory.layout.nodes.map(n=>({id:n.id,x:n.x,y:n.y,areaId:n.areaId}));return {x:b.x+n.x*memory.zoom+memory.pan.x,y:b.y+n.y*memory.zoom+memory.pan.y};}''')
  page.mouse.click(positions['x'],positions['y']);assert page.evaluate('memory.selected===area')
  detail=page.locator('#memory-inspector-title').text_content()
  page.mouse.move(positions['x'],positions['y']);page.mouse.down();page.mouse.move(positions['x']+45,positions['y']+35,steps=8);page.mouse.up()
  assert page.locator('#memory-inspector-title').text_content()==detail
  assert page.evaluate('''()=>{const moved=memory.positions.get(area),old=positions.find(n=>n.id===area),dx=moved.x-old.x,dy=moved.y-old.y;if(!dx&&!dy)return false;return positions.every(p=>{const n=memory.positions.get(p.id),belongs=p.id===area||p.areaId===area;return Math.abs(n.x-p.x-(belongs?dx:0))<.001&&Math.abs(n.y-p.y-(belongs?dy:0))<.001;});}''')
  page.evaluate('''()=>{const selected=memory.selected;memory.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}));if(memory.drag||memory.selected!==selected)throw Error('cancellation selected a node');const zoom=memory.zoom;memory.setZoom(zoom*1.1);if(memory.zoom===zoom)throw Error('zoom broken');}''')
  print(page.evaluate('''async()=>{const check=(v,m)=>{if(!v)throw Error(m);};
   check(JSON.stringify((await read()).mind.memories)===original,'drag wrote memories');
   const {AdaptivePathwaysView}=await import('/src/pathways/pathway-view.js');const {areaColor}=await import('/src/memory/area-colors.js');const host=document.createElement('div');document.body.append(host);const pv=new AdaptivePathwaysView(host);pv.update(app.state.mind,[{title:'Scientist',area:'Science',areaIds:[area],share:.5,count:1,source:'knowledge'}]);check(host.querySelector('li').style.getPropertyValue('--pathway-area-color')===areaColor(area),'pathway palette mismatch');check(memory.colors.get(area)===areaColor(area),'graph palette mismatch');pv.destroy();host.remove();
   const before=JSON.stringify(app.state.mind.memories),browse=memory.root.querySelector('.memory-browser').innerHTML;await engine.act('cancel',task.id);await new Promise(r=>setTimeout(r,30));check(![...memory.taskNodes.values()].some(n=>n.taskId===task.id),'cancelled Learning tasks placeholder');check(!memory.layout.nodes.some(n=>n.taskId===task.id),'cancelled provisional node');check(memory.root.querySelector('.memory-browser').innerHTML===browse,'Browse Memories changed');
   engine.destroy();app.state=await read();memory.update(app.state.mind);await new Promise(r=>setTimeout(r,30));check(app.state.mind.learningTasks.find(t=>t.id===task.id).status==='CANCELLED','lost cancellation audit');check(![...memory.taskNodes.values()].some(n=>n.taskId===task.id),'rehydrated cancelled item');check(JSON.stringify(app.state.mind.memories)===before,'cancel deleted memories');memory.destroy();db.close();return 'Cluster drag/click, unchanged inspector, shared colors, durable cancellation and preserved canonical memories passed';
  }'''))
  page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{learningNodes}=await import('/src/autonomous/research-graph.js'),{graphData}=await import('/src/memory/graph-data.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open(),state=preview?await db.read():(await db.get('gameplay','primary')).state;const ok=state.mind.learningTasks.some(t=>t.status==='CANCELLED')&&learningNodes(state.mind,graphData(state.mind)).length===0&&state.mind.memories.length===2;db.close();return ok;}''',preview)
  assert not errors,errors
  context.close()
 browser.close()
