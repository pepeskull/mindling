"""Offline UI/lifecycle and real isolated IndexedDB, with no external transport."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for preview in [False,True]:
        context=browser.new_context(viewport={'width':1440,'height':1000})
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') else r.abort())
        context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
        page=context.new_page();errors=[];api_calls=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:api_calls.append(r.url) if '/api/mindling/' in r.url else None)
        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        print(page.evaluate('''async preview=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
          const {Dashboard}=await import('/src/ui/dashboard.js');const {EventBus,EVENTS}=await import('/src/app/events.js');const {NetworkView}=await import('/src/network/network-view.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');const check=(v,m)=>{if(!v)throw Error(m);};
          const wait=async fn=>{for(let i=0;i<200&&!fn();i++)await new Promise(r=>setTimeout(r,10));check(fn(),'wait timeout');};
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open();
          let initial=newMindling(createSandbox(Date.now()),{confirmed:true,id:preview?'network-preview':'network-normal',name:'Test Mindling'});
          initial.mind.history=[{id:'saved-event',kind:'reinforcement',at:Date.now(),concept:'PRIVATE MEMORY'}];
          const write=fn=>preview?db.change(fn):db.changeGameplay(fn);await write(()=>initial);
          const read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);
          let popup=0,dispatched=0,clarifications=0;
          const app={state:await read(),...(preview?{store:db}:{db}),renderState(){},events:new EventBus(),dashboard:{canContinueResearch:()=>true,showResearchAccess(){popup++;},showResearchResult(){}},async change(fn,opt){this.state=await (preview?db.change(fn,opt):db.changeGameplay(fn,opt));}};
          let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
          engine.run=async(task,topic)=>{dispatched++;check(topic&&!topic.includes('my '),'private query');await engine.patch(task.id,null,item=>{item.status='BLOCKED';item.code='NO_EVIDENCE';item.message='Offline mock has no external evidence.';});};
          const disabled=await engine.prepare(understandInput('Learn about Astronomy','TEACH'),'disabled');engine.startIfAuthorized(disabled);await wait(()=>!engine.draining);check(dispatched===0&&popup===0,'disabled access leaked or repeated consent');
          await db.saveResearchPermissions(app.state.mind.id,{enabled:true,automaticRequestLimit:20});await engine.loadPermissions(true);engine.recover();await wait(()=>!engine.draining);check(dispatched===1&&popup===0,'saved authorization did not resume');
          const sensitive=await engine.prepare(understandInput('Learn about my medical diagnosis','TEACH'),'private');engine.startIfAuthorized(sensitive);await wait(()=>!engine.draining);check(popup===1&&dispatched===1,'privacy review missing');
          let task=app.state.mind.learningTasks.find(t=>t.id===sensitive.id);check(task.code==='QUERY_REVIEW','review state');const run=engine.run;let rejected=false;try{await engine.act('review-topic',task.id,{topic:'Neuroscience'});}catch{rejected=true;}check(rejected&&dispatched===1,'topic replacement escaped privacy gate');engine.destroy();app.state=await read();check(!app.state.mind.learningTasks.find(t=>t.id===task.id).approvedPublicTopic,'replacement persisted');engine=new AutonomousLearningEngine(app);engine.run=run;await engine.loadPermissions();engine.recover();await wait(()=>!engine.draining);check(dispatched===1,'private request recovered without safe subject');
          const before=JSON.stringify(app.state.mind.energy);check(app.state.mind.autonomousLearning===undefined,'manual requests reserved automatic budget');
          await engine.setAccess(false);check((await db.researchPermissions(app.state.mind.id)).enabled===false,'disable persistence');
          await engine.tick();check(dispatched===1,'disabled scheduler dispatched');
          await engine.setAccess(true,20);await wait(()=>dispatched===2&&!engine.draining);check(app.state.mind.autonomousLearning.reservedRequests===4,'automatic reservation missing');const reserved=app.state.mind.autonomousLearning.reservedRequests;await engine.tick();check(dispatched===2&&app.state.mind.autonomousLearning.reservedRequests===reserved,'cooldown or duplicate dispatch failed');await engine.setAccess(false);engine.destroy();
          check(JSON.stringify(app.state.mind.energy)===before,'Energy changed');
          const events=new EventBus(),state={...app.state.mind,mindlingId:app.state.mind.id,researchPermissions:{...await db.researchPermissions(app.state.mind.id),loaded:true},autonomousStatus:'IDLE'};
          const dashboard=new Dashboard(events,{onResearchAccess:async(enabled,limit)=>{state.researchPermissions={...await db.saveResearchPermissions(state.mindlingId,{enabled,automaticRequestLimit:limit}),loaded:true};dashboard.render(state);},onClarification:async()=>{clarifications++;return {accepted:true,message:'Continued'};}});dashboard.render(state);
          document.querySelector('.dashboard-chrome').classList.remove('is-hidden');
          window.testDashboard=dashboard;window.testState=state;window.testEvents=events;
          document.querySelector('.research-settings-link').click();const limit=document.querySelector('[data-automatic-limit]');limit.value='40';check(document.querySelector('[data-automatic-saved]').textContent.includes('20'),'draft looked saved');document.querySelector('[data-save-access]').click();await wait(()=>document.querySelector('[data-settings-feedback]').textContent==='Access preference saved.');check((await db.researchPermissions(state.mindlingId)).automaticRequestLimit===40,'limit did not persist');document.querySelector('[data-close-settings]').click();
          const snapshot=JSON.stringify(await read());events.emit(EVENTS.NEURAL_INPUT,{id:'dashboard-real-event',activity:'DEEP_TRAINING',phase:'start'});document.querySelector('[data-view=network]').click();
          check(!document.querySelector('#network-view').hidden&&document.querySelector('#memory-view').hidden,'navigation');
          check(location.hash==='#network','route');check(!document.querySelector('[data-network-status]'),'custom heading remains');check(document.querySelectorAll('#network-view .network-panel').length===3,'three panels');
          check(!document.querySelector('#network-view').textContent.includes('PRIVATE'),'private log');check(JSON.stringify(await read())===snapshot,'view wrote storage');
          check(!document.querySelector('[data-network-events]'),'postponed communication UI');
          dashboard.showClarification({clarification:{requestId:'clarify',id:'clarification',question:'Which league?',options:[{id:'league',label:'League table'}],freeText:false}});
          document.querySelector('.clarification-choices button').click();await wait(()=>clarifications===1);check(clarifications===1,'clarification broken');
          document.querySelector('[data-view=network]').click();
          const standalone=document.createElement('section');standalone.style='width:600px;height:500px';document.body.append(standalone);const view=new NetworkView(standalone);view.update(state);view.setVisible(true);view.ingest({id:'real-test-event',activity:'TALK',phase:'start'});check(view.frame!==null,'animation missing');view.update({...state,autonomousStatus:'RESEARCHING'});check(view.status!=='RESEARCHING'&&view.model.events.length===1,'research status must not invent channel activity');view.setVisible(false);check(view.frame===null,'hidden animation');view.setVisible(true);window.testView=view;
          const saved=await read();check(saved.mind.history.some(h=>h.id==='saved-event'),'history missing');db.close();
          return `${preview?'Stage Preview':'Normal'}: permission, privacy clarification resume, disabled scheduler, navigation, events, no data mutation passed`;
        }''',preview))
        page.locator('[data-view=memories]').click()
        page.go_back()
        page.wait_for_function("document.querySelector('#network-view').hidden===false")
        page.go_forward()
        assert page.locator('#memory-view').is_visible()
        page.locator('[data-view=network]').click()
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(80)
        page.wait_for_function('window.testView.frame===null')
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(80)
        page.wait_for_function('window.testView.frame!==null')
        page.evaluate('window.testView.destroy();window.testView.root.remove()')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('[data-mobile-view=network]').click()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
        assert page.locator('#network-view').is_visible()
        page.locator('[data-mobile-view=memories]').click()
        assert page.locator('#network-view').is_hidden()
        page.locator('[data-mobile-view=network]').click()
        page.evaluate('window.testDashboard.destroy()')
        page.set_viewport_size({'width':1440,'height':1000})
        page.unroute('**/js/bootstrap.js')
        page.route('**/js/bootstrap.js',lambda r:r.fulfill(path=str(Path(__file__).resolve().parents[1]/'js/bootstrap.js'),content_type='application/javascript'))
        page.goto(BASE+('/?stage-preview=1#network' if preview else '/#network'))
        page.reload()

        page.wait_for_function("document.querySelector('#network-view')?.hidden===false && document.querySelector('#network-view canvas')")
        assert page.locator('#network-view').is_visible()
        assert not errors,errors
        assert not api_calls,api_calls
        context.close()
    browser.close()
print('PASS desktop/mobile navigation, reduced motion and teardown; all requests local, no screenshots.')
