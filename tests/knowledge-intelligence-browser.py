"""Authored incident claims, real app views/IndexedDB, mocked model transport only.
Geometry assertions replace screenshots. Both namespaces; no external requests.
"""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8783')
# Read fixture JSON through Node only; no generated test data or live inference.
import subprocess
FIXTURE=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/knowledge-intelligence-fixture.cjs')))"]))
READ="""async(preview)=>{const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),s=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return s;}"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce')
 context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') else r.abort())
 page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if '/api/' in r.url else None)
 primary=None
 for preview in [False,True]:
  geometry_calls=len(requests)
  page.goto(BASE+'/tests/blank.html')
  page.evaluate('''async({preview,records})=>{const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const db=await (preview?new PreviewStore():new MindlingDatabase()).open(),write=preview?db.change.bind(db):db.changeGameplay.bind(db);await write(()=>{const s=newMindling(createSandbox(Date.now()),{id:preview?'preview-intelligence':'primary-intelligence',name:'IntelligenceRepair',confirmed:true});s.mind.memories=records;return s;});db.close();}''',{'preview':preview,'records':FIXTURE['records']})
  page.goto(BASE+('/?stage-preview=1' if preview else '/'));page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('IntelligenceRepair')")
  # Instrument the actual application renderer, without adding a product API.
  page.evaluate('''async()=>{const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');const draw=NeuralMemoryView.prototype.draw;NeuralMemoryView.prototype.draw=function(){draw.call(this);globalThis.actualMemoryView=this;};}''')
  if preview:page.locator('.sandbox-controls > summary').click()
  page.locator('[data-view="memories"]').click();page.wait_for_function('globalThis.actualMemoryView?.labelGeometry?.length>0')
  assert page.locator('.memory-science-note,[data-memory-maintenance],[data-graph-action="focus"],[data-brain-action="focus"]').count()==0
  assert len(requests)==geometry_calls
  saved=page.evaluate(READ,preview);by_id={m['id']:m for m in saved['mind']['memories']};assert 'validation' in by_id['tx']['relatedMemoryIds'];assert 'feedback' in by_id['game']['relatedMemoryIds'];assert not by_id['unrelated'].get('relatedMemoryIds')
  for viewport in [{'width':1600,'height':1050},{'width':1180,'height':820}]:
   page.set_viewport_size(viewport);page.get_by_role('button',name='Fit graph',exact=True).click()
   page.wait_for_function('actualMemoryView.labelGeometry.length>0')
   geometry=page.evaluate('''()=>{const v=actualMemoryView;v.draw();const rects=v.labelGeometry,overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;return {width:v.stage.clientWidth,height:v.stage.clientHeight,labels:rects,overlap:rects.some((a,i)=>rects.slice(i+1).some(b=>overlap(a,b))),edges:v.layout.edges.filter(e=>e.kind==='association').length,paths:v.flowPaths.length,stats:v.graph.stats,visible:v.layout.edges.filter(e=>e.kind==='association').some(e=>{const a=v.positions.get(e.from),b=v.positions.get(e.to);return a.topicId!==b.topicId&&[a,b].every(n=>n.x*v.zoom+v.pan.x>0&&n.x*v.zoom+v.pan.x<v.stage.clientWidth&&n.y*v.zoom+v.pan.y>0&&n.y*v.zoom+v.pan.y<v.stage.clientHeight);}),scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};}''')
   assert not geometry['overlap'] and not geometry['scroll'],geometry
   assert geometry['visible'] and geometry['edges']==geometry['stats']['associations'] and geometry['paths']==geometry['edges'],geometry
   assert sum(r['kind']=='area' for r in geometry['labels'])==geometry['stats']['areas'],geometry
   assert all(r['x']>=0 and r['x']+r['width']<=geometry['width'] and r['y']>=0 and r['y']+r['height']<=geometry['height'] for r in geometry['labels']),geometry
   zoom=page.locator('[data-zoom-level]').inner_text();page.get_by_role('button',name='Zoom in',exact=True).click();page.wait_for_function('(z)=>document.querySelector("[data-zoom-level]").textContent!==z',arg=zoom)
   page.get_by_role('button',name='Reset view',exact=True).click()
   bounds=page.locator('.memory-graph-stage').bounding_box();selected=page.evaluate('actualMemoryView.selected');page.mouse.move(bounds['x']+20,bounds['y']+30);page.mouse.down();page.mouse.move(bounds['x']+55,bounds['y']+50);page.mouse.up();assert page.evaluate('actualMemoryView.selected')==selected
   page.get_by_role('button',name='Fit graph',exact=True).click()
  page.locator('.memory-browser summary').click();page.locator('.memory-browser [data-select-memory]').first.click();assert page.locator('.memory-inspector .memory-status-chip').count()==1
  page.locator('[data-view="development"]').click();assert page.locator('[data-brain-action="focus"]').count()==0
  page.reload();page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('IntelligenceRepair')");assert page.evaluate(READ,preview)['mind']['memories']==saved['mind']['memories'];assert len(requests)==geometry_calls
  print('PASS '+('Preview' if preview else 'primary')+': incident claims reconcile durably, cross-topic semantic edges visible, unrelated Gaming/blockchain disconnected; accurate audited counter, compact Fit geometry, no primary-label overlap at 1600/1180, zoom/reset/selection, controls removed and reload',flush=True)
  page.goto(BASE+'/tests/blank.html')
  # Real research integration, rewards and failure recovery through the actual handler.
  print(page.evaluate('''async(preview)=>{
    const {MindlingDatabase}=await import('/src/storage/database.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');const {understandInput}=await import('/src/learning/input-understanding.js');const {canRetryResearch}=await import('/src/autonomous/service-diagnostics.js');
    const check=(v,m)=>{if(!v)throw Error(m);},db=await (preview?new PreviewStore():new MindlingDatabase()).open(),write=preview?db.change.bind(db):db.changeGameplay.bind(db),read=async()=>preview?db.read():(await db.get('gameplay','primary')).state;
    const fixtureIdentity=(await read()).mind.id,runTag=crypto.randomUUID();let serial=0;const app={store:db,...(!preview?{db}:{}),state:null,renderState(){},events:{emit(){}},async change(reducer,options={}){this.state=await write(reducer,options);}};
    for(const mode of ['TEACH','DEEP_TRAINING','BACKGROUND','BUDGET','ANONYMOUS','DAILY','RECOVERY']){
      await write(()=>newMindling(createSandbox(Date.now()),{id:fixtureIdentity,name:'ResearchCorrection',confirmed:true}));app.state=await read();if(mode==='DAILY'){await app.change(s=>{const next=structuredClone(s),day=Math.floor(next.now/86400000);next.mind.history.push({id:'existing-reward',day,at:next.now,xp:100,kind:'concept'});next.mind.stageXP=next.mind.lifetimeXP=100;return next;});}const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
      const topic=mode==='BUDGET'?'intelligence budget':mode==='ANONYMOUS'?'intelligence budget anonymous':mode==='RECOVERY'?'intelligence recovery '+preview+' '+runTag:'intelligence transactions';
      const task=await engine.prepare(understandInput('Learn about '+topic,mode==='DEEP_TRAINING'?'DEEP_TRAINING':'TEACH'),'request-'+(++serial),{autonomous:!['TEACH','DEEP_TRAINING','DAILY'].includes(mode)});await engine.run(task,task.topic);let current=app.state.mind.learningTasks.find(t=>t.id===task.id);
      if(mode==='DAILY'){check(current.status==='BLOCKED'&&current.pendingEvidence?.length,'daily limit did not preserve recoverable evidence');check(app.state.mind.memories.length===0&&app.state.mind.energy.remaining===10&&app.state.mind.lifetimeXP===100&&app.state.mind.history.length===1,'daily reward failure partially committed');}
      else if(['BUDGET','ANONYMOUS'].includes(mode)){
        check(current.status==='BLOCKED'&&current.code==='RESPONSE_PARSE_ERROR','incorrect error state: '+current.code);check(current.serviceDiagnostic.detail===(mode==='BUDGET'?'TOOL_BUDGET_EXCEEDED':'TOOL_ACCOUNTING_AMBIGUOUS'),'original diagnostic lost');check(current.completedToolCalls===(mode==='BUDGET'?3:0),'observed counters lost');check(current.researchExecution.outcomeUnknown===(mode==='ANONYMOUS'),'uncertainty wrong');check(current.sourceRequests===2&&!canRetryResearch(current),'reservation reset');check(app.state.mind.memories.length===0&&app.state.mind.energy.remaining===10&&app.state.mind.lifetimeXP===0,'failed research charged/rewarded');
        const before=JSON.stringify(app.state.mind.learningTasks);engine.recover();check(JSON.stringify((await read()).mind.learningTasks)===before,'reload/resume changed exhausted reservations');
      }else{
        if(mode==='RECOVERY'){check(current.pendingSourceEvidence&&current.sourceRequests===2&&current.modelCalls===3,'checkpoint missing');await engine.run(current,current.topic);current=app.state.mind.learningTasks.find(t=>t.id===task.id);check(current.modelCalls===4&&current.sourceRequests===2&&current.serviceDiagnostic.operation==='research-evaluate','recovery repeated search');}
        check(current.status==='COMPLETED'&&app.state.mind.memories.length===3,'research failed: '+current.code+' '+current.message);const manual=['TEACH','DEEP_TRAINING'].includes(mode),xp=manual?5:0;check(app.state.mind.lifetimeXP===xp&&app.state.mind.history.reduce((s,e)=>s+e.xp,0)===xp,'research reward mismatch '+mode);check(app.state.mind.energy.remaining===(mode==='TEACH'?8:mode==='DEEP_TRAINING'?7:10),'research Energy mismatch');const saved=JSON.stringify(app.state.mind.memories);await engine.run(current,current.topic);check(JSON.stringify(app.state.mind.memories)===saved&&app.state.mind.lifetimeXP===xp,'repeat reward/write');
      }
      await engine.setAccess(false);engine.destroy();
    }
    db.close();return 'PASS '+(preview?'Preview':'primary')+': real research handler/integration, Teach/Deep one reward per activity, background XP0, confirmed vs ambiguous budget errors, reserved ceiling survives storage/recovery, signed checkpoint evaluation-only retry with four model calls and no repeated search';
  }''',preview),flush=True)
  # The last run contains the real retained incident transaction, source evidence and task.
  page.goto(BASE+('/?stage-preview=1' if preview else '/'));page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('ResearchCorrection')")
  before=page.evaluate(READ,preview);root=next(m for m in before['mind']['memories'] if m['research']['evidenceText']==FIXTURE['transaction']);page.locator('[data-view="memories"]').click();page.keyboard.press('Alt+Shift+M');dialog=page.get_by_role('dialog',name='Memory maintenance');dialog.locator(':scope > details[data-task] > summary').click();dialog.get_by_text('Manage retained knowledge',exact=True).first.click();textbox=dialog.get_by_role('textbox',name='Correct this learned claim').first;assert textbox.input_value()==FIXTURE['transaction'];textbox.fill(FIXTURE['corrected']);dialog.get_by_role('button',name='Save correction',exact=True).first.click()
  page.wait_for_function("[...document.querySelectorAll('.memory-maintenance [role=status]')].some(n=>n.textContent.length>0)");assert 'Correction saved as user-provided knowledge' in page.locator('.memory-maintenance').inner_text(),page.locator('.memory-maintenance').inner_text()
  after=page.evaluate(READ,preview);parent=next(m for m in after['mind']['memories'] if m['id']==root['id']);child=next(m for m in after['mind']['memories'] if m.get('correctsMemoryId')==root['id']);assert parent['research']==root['research'] and parent['content']==root['content'];assert child['content']==FIXTURE['corrected'] and child['provenance']['source']=='player' and 'research' not in child;assert any(i!=root['id'] for i in child['relatedMemoryIds']);assert after['mind']['lifetimeXP']==before['mind']['lifetimeXP']+3;assert after['mind']['energy']['remaining']==before['mind']['energy']['remaining']-2
  page.wait_for_function("document.querySelector('.memory-inspector .memory-status-chip')?.textContent==='Current memory'")
  dialog=page.get_by_role('dialog',name='Memory maintenance');dialog.get_by_text('Manage retained knowledge',exact=True).first.click();assert dialog.get_by_role('textbox',name='Correct this learned claim').first.input_value()==FIXTURE['corrected'];calls=len(requests);dialog.get_by_role('button',name='Save correction',exact=True).first.click();page.wait_for_function("document.querySelector('.memory-maintenance')?.textContent.includes('No changes to save')");assert len(requests)==calls
  page.keyboard.press('Escape');page.reload();page.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('ResearchCorrection')");reloaded=page.evaluate(READ,preview);assert reloaded['mind']['memories']==after['mind']['memories'] and reloaded['mind']['lifetimeXP']==after['mind']['lifetimeXP']
  if preview:assert page.evaluate(READ,False)['mind']['memories']==primary
  else:primary=reloaded['mind']['memories']
  print('PASS '+('Preview' if preview else 'primary')+': actual maintenance correction of incident transaction, active descendant editable after save, truthful preserved source history, +3 once / 2 Energy, no-op free, reconnect, reload and namespace isolation',flush=True)
 assert not errors,errors
 context.close();browser.close()
