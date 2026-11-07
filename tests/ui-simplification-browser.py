"""Real UI, isolated IndexedDB, offline callbacks. No model calls or screenshots."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000},reduced_motion='reduce');errors=[];api=[]
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:api.append(r.url) if '/api/' in r.url else None)
  page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  page.evaluate('''async()=>{const {Onboarding}=await import('/src/ui/onboarding.js');window.draft=null;window.onboarding=new Onboarding(document.querySelector('#onboarding'),async value=>{window.draft=value;await onboarding.birth(value.name);});onboarding.show();}''')
  assert page.locator('.onboarding-lead,.onboarding-copy,.identity-note').count()==0
  for mobile in [True,False]:
   page.set_viewport_size({'width':390 if mobile else 1500,'height':900 if mobile else 1000})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.locator('[data-next]').click();assert page.locator('[data-next]').is_disabled()
  for name in ['Developer','Social','Researcher']:page.locator(f'[data-pathway="{name}"]').click()
  assert page.evaluate('parseInt(getComputedStyle(document.querySelector(".pathway-grid")).marginTop)>=24')
  page.locator('[data-next]').click();assert page.locator('[data-dimension]').count()==3
  page.locator('[data-dimension]').first.fill('65');page.locator('[data-next]').click();assert page.locator('[data-next]').is_disabled()
  page.locator('#mindling-name').fill('Offline fixture');page.locator('[data-next]').click();assert page.locator('.identity-note').count()==0
  page.locator('[data-create]').click();page.wait_for_function('document.querySelector("#birth-title").textContent==="AWAKENING COMPLETE"')
  assert page.locator('.onboarding-node[data-visible=true]').count()==6
  assert page.evaluate('draft.pathways.length===3 && draft.dimensions.thinkingStyle===.65')
  page.evaluate('onboarding.hide()')
  print(page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js'),{understandInput}=await import('/src/learning/input-understanding.js'),{interpretInteraction,resumeClarification}=await import('/src/learning/clarification.js');
   const {Dashboard}=await import('/src/ui/dashboard.js'),{EventBus}=await import('/src/app/events.js');
   window.check=(ok,m)=>{if(!ok)throw Error(m);};window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'notifications-'+preview,name:draft.name,pathways:draft.pathways}));await write(s=>{s.mind.memories=[{id:'keep',content:'Synthetic retained claim.',category:'Science'}];return s;});
   window.app={state:await read(),store:db,renderState(){dashboard.render({...this.state.mind,mindlingId:this.state.mind.id,researchPermissions:{...engine.preferences,loaded:true}});},async change(fn,opts){this.state=await write(fn,opts);this.renderState();}};
   window.engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
   app.submitInput=async(text,activity,id,{continuation})=>{const flow=interpretInteraction(app,text,activity,id,continuation);if(flow.result)return flow.result;await engine.prepare(flow.interpretation,id,{taskId:flow.taskId,guard:flow.guard});return {accepted:true,message:'Scope selected.'};};
   // Exercise the real permission API and recovery entry point without allowing paid dispatch.
   window.recoveries=0;engine.recover=()=>{recoveries++;};engine.tick=async()=>{};
   window.dashboard=new Dashboard(new EventBus(),{onLearningTask:(...args)=>engine.act(...args),onClarification:(...args)=>resumeClarification(app,...args),onResearchAccess:(...args)=>engine.setAccess(...args)});app.dashboard=dashboard;app.renderState();dashboard.show();document.querySelectorAll('.installation').forEach(e=>e.remove());
   window.ids=[];for(const topic of ['Italian football','Marine biology']){const t=await engine.prepare(understandInput('Learn about '+topic,'TEACH'),'request-'+topic);ids.push(t.id);await engine.patch(t.id,null,item=>{item.status='BLOCKED';item.code='MODEL_CLARIFICATION';item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:'Which aspect of '+topic+'?',options:[{id:'basics',label:'Foundations',value:'Foundations of '+topic},{id:'detail',label:'Deeper relationships',value:'Relationships within '+topic}],freeText:false};});}
   window.original=JSON.stringify([app.state.mind.memories,app.state.mind.pathways,app.state.mind.energy,app.state.mind.lifetimeXP]);
   check(!document.querySelector('.research-settings,.research-settings-link'),'Settings remains');check(document.querySelector('.notification-count').textContent==='2','count');check(document.querySelector('.age-chip').nextElementSibling.classList.contains('clarification-notifications'),'header placement');
   return `${preview?'Preview':'Normal'}: six-step onboarding, two canonical notifications and unchanged stored knowledge`;
  }''',preview),flush=True)
  bell=page.locator('.notification-button');bell.click();assert page.locator('[data-notification-task]').count()==2
  page.keyboard.press('Escape');assert page.locator('#clarification-notifications').is_hidden();assert bell.evaluate('(el)=>el===document.activeElement')
  bell.click();page.locator('.brand').click();assert page.locator('#clarification-notifications').is_hidden()
  page.set_viewport_size({'width':390,'height':900});bell.click()
  assert page.evaluate('''()=>{const r=document.querySelector('#clarification-notifications').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}''')
  page.locator('[data-notification-task]').first.click()
  assert page.locator('#clarification-notifications').is_hidden();assert page.evaluate('dashboard.primaryView==="dashboard"')
  assert page.locator('[data-talk-content] .clarification-choices button').count()==2
  assert 'Italian football' in page.locator('[data-talk-content]').inner_text()
  assert page.locator('[data-talk-content] input,[data-talk-content] textarea').count()==0
  page.locator('[data-talk-content] .clarification-choices button').first.click()
  page.wait_for_function('document.querySelector(".notification-count").textContent==="1"')
  assert page.evaluate('app.state.mind.learningTasks.find(t=>t.id===ids[0]).scope.detail==="Foundations of Italian football"')
  # Consent is preselected, explicitly inactive until saved, and not a full settings menu.
  bell.click();page.get_by_role('button',name='Research access · Consent required',exact=True).click()
  assert page.locator('[data-research-enabled]').is_checked()
  assert page.evaluate('engine.preferences.enabled===false && !engine.preferences.decided')
  page.locator('[data-save-research]').click();page.wait_for_function('engine.preferences.enabled===true')
  assert page.evaluate('recoveries===1 && engine.preferences.automaticRequestLimit===12 && engine.preferences.semanticCallsPerDay===0')
  page.locator('[data-research-enabled]').uncheck();page.locator('[data-save-research]').click();page.wait_for_function('engine.preferences.enabled===false && engine.preferences.decided')
  page.locator('[data-close-research]').click();bell.click();page.get_by_role('button',name='Research access · Disabled',exact=True).click();assert not page.locator('[data-research-enabled]').is_checked()
  page.locator('[data-close-research]').click()
  assert page.evaluate('''async()=>{await db.saveResearchPermissions(app.state.mind.id,{enabled:false,semanticCallsPerDay:3,automaticRequestLimit:8});await engine.loadPermissions(true);app.renderState();await engine.setAccess(false);const saved=await db.researchPermissions(app.state.mind.id);return saved.semanticCallsPerDay===3&&saved.automaticRequestLimit===8&&!saved.enabled;}''')
  # A rejected save cannot make the selected draft look authorized.
  page.evaluate("()=>{window.savedAccess=engine.setAccess;engine.setAccess=async()=>{throw Error('offline save rejection');};}")
  bell.click();page.get_by_role('button',name='Research access · Disabled',exact=True).click();page.locator('[data-research-enabled]').check();page.locator('[data-save-research]').click()
  page.wait_for_function("document.querySelector('[data-access-status]').textContent.includes('could not be saved')")
  assert page.evaluate('engine.preferences.enabled===false && recoveries===1')
  page.locator('[data-close-research]').click();page.evaluate('()=>{engine.setAccess=savedAccess;}')
  # Exact remaining task can be cancelled; record and reserved accounting stay stored.
  page.evaluate('engine.act("cancel",ids[1])');page.wait_for_function('document.querySelector(".notification-count").hidden')
  assert page.evaluate('''()=>JSON.stringify([app.state.mind.memories,app.state.mind.pathways,app.state.mind.energy,app.state.mind.lifetimeXP])===original''')
  page.set_viewport_size({'width':1500,'height':1000});page.locator('[data-view=memories]').click();page.keyboard.press('Shift+Alt+m');assert page.locator('.memory-maintenance').count()==0
  # Restore a pending task for reload, using an independent synthetic task.
  page.evaluate('''async()=>{const {understandInput}=await import('/src/learning/input-understanding.js');const t=await engine.prepare(understandInput('Learn about marine habitats','TEACH'),'reload-fixture');await engine.patch(t.id,null,item=>{item.code='MODEL_CLARIFICATION';item.coordinatorClarification={version:1,kind:'model-scope',field:'detail',question:'Which habitat?',options:[{id:'coast',label:'Coastal',value:'Coastal habitats'},{id:'deep',label:'Deep sea',value:'Deep sea habitats'}],freeText:false};});window.expected=t.id;dashboard.destroy();engine.destroy();db.close();}''')
  page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{pendingClarifications}=await import('/src/autonomous/clarification-tasks.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const state=preview?await db.read():(await db.get('gameplay','primary')).state;const prefs=await db.researchPermissions(state.mind.id);const tasks=pendingClarifications(state.mind);db.close();return tasks.length===1&&tasks[0].topic==='marine habitats'&&prefs.enabled===false&&prefs.decided&&state.mind.memories.length===1;}''',preview)
  assert not errors,errors;assert not api,api
  print(('Preview' if preview else 'Normal')+': exact task navigation, button resolution, consent/opt-out, durable reload and maintenance removal passed',flush=True)
  context.close()
 browser.close()
