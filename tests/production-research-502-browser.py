"""Production failure regression: actual handler/client/IndexedDB; synthetic upstream only."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context()
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    page=context.new_page();page.goto(BASE+'/tests/blank.html')
    print(page.evaluate('''async()=>{
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
      const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
      const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
      const {understandInput}=await import('/src/learning/input-understanding.js');
      const {canRetryResearch}=await import('/src/autonomous/service-diagnostics.js');
      const check=(v,m)=>{if(!v)throw Error(m);};
      let store=await new PreviewStore().open();await store.change(()=>newMindling(createSandbox(),{confirmed:true,id:'production-502-browser'}));
      const operations=[],originalFetch=globalThis.fetch;
      globalThis.fetch=async(url,options)=>{if(url==='/api/mindling/reason')operations.push(JSON.parse(options.body).mode);return originalFetch(url,options);};
      const app={store,state:await store.read(),renderState(){},async change(reducer,options={}){this.state=await store.change(reducer,options);}};
      let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
      const origins=JSON.stringify(app.state.mind.pathways),player=JSON.stringify(app.state.player),energy=app.state.mind.energy.remaining,xp=app.state.mind.lifetimeXP;
      const first=await engine.prepare(understandInput('Learn about social analysis once '+crypto.randomUUID().slice(0,8),'TEACH'),'analysis-task',{autonomous:true});
      await engine.run(first,first.topic);
      let saved=app.state.mind.learningTasks.find(task=>task.id===first.id);
      check(saved.code==='UPSTREAM_HTTP_ERROR'&&saved.lastFailurePhase==='SOURCE_EVALUATION','analysis failure masked');
      check(saved.completedToolCalls===1&&saved.sourceRequests===2&&saved.sourceReferences.length===1&&saved.modelCalls===3,'confirmed search/reservation not preserved');
      check(saved.pendingSourceEvidence&&saved.researchExecution.toolState==='COMPLETED'&&!saved.researchExecution.outcomeUnknown,'source checkpoint/known completion lost');
      check(app.state.mind.memories.length===0,'analysis failure invented knowledge');
      const signature=saved.pendingSourceEvidence.signature;engine.destroy();store.close();store=await new PreviewStore().open();app.store=store;app.state=await store.read();
      check(app.state.mind.learningTasks.find(task=>task.id===first.id).pendingSourceEvidence.signature===signature,'checkpoint lost on reload');
      engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await app.change(state=>{state.mind.learningTasks.find(task=>task.id===first.id).retryAt=0;return state;});
      const before=operations.filter(mode=>mode==='research-acquire').length;await engine.tick();const deadline=performance.now()+10000;while(engine.active||engine.draining){if(performance.now()>deadline)throw Error('analysis resume timed out');await new Promise(resolve=>setTimeout(resolve,10));}
      saved=app.state.mind.learningTasks.find(task=>task.id===first.id);
      check(saved.status==='COMPLETED'&&app.state.mind.memories.length===1,'signed evidence analysis did not recover');
      check(operations.filter(mode=>mode==='research-acquire').length===before&&operations.filter(mode=>mode==='research-evaluate').length===1,'recovery repeated search');
      check(saved.sourceRequests===2&&saved.modelCalls===4&&saved.evaluationCalls===2&&saved.attempts===2&&!saved.pendingSourceEvidence,'double reservation or model ceiling violation');
      // Incident B and an unknown interrupted call cannot be retried into a misleading BUDGET_EXHAUSTED.
      await app.change(state=>{state.mind.autonomousLearning.nextAt=0;return state;});
      const second=await engine.prepare(understandInput('Learn about no hosted action','TEACH'),'missing-tool',{autonomous:true});
      await engine.run(second,second.topic);let missing=app.state.mind.learningTasks.find(task=>task.id===second.id);
      check(missing.code==='NO_SEARCH_EXECUTED'&&missing.completedToolCalls===0&&missing.sourceRequests===2,'no-tool failure misclassified');
      const total=operations.length;let blocked=false;try{await engine.act('retry',second.id);}catch{blocked=true;}
      missing=app.state.mind.learningTasks.find(task=>task.id===second.id);check(blocked&&operations.length===total&&missing.code==='NO_SEARCH_EXECUTED'&&missing.lastFailureCode==='NO_SEARCH_EXECUTED','failed retry overwrote original error or dispatched again');
      await app.change(state=>{state.mind.autonomousLearning.nextAt=0;return state;});
      const third=await engine.prepare(understandInput('Learn about cancellation','TEACH'),'unknown-tool',{autonomous:true});
      const running=engine.run(third,'cancel operation');while(app.state.mind.learningTasks.find(task=>task.id===third.id)?.researchExecution?.toolState!=='DISPATCHED')await new Promise(resolve=>setTimeout(resolve,5));
      engine.active.controller.abort();await running;let interrupted=app.state.mind.learningTasks.find(task=>task.id===third.id);
      check(interrupted.code==='REQUEST_INTERRUPTED'&&interrupted.researchExecution.outcomeUnknown&&interrupted.sourceRequests===2,'unknown remote work refunded or misreported');
      check(!canRetryResearch(interrupted),'unknown search can repeat');
      check(app.state.mind.memories.length===1&&app.state.mind.energy.remaining===energy&&app.state.mind.lifetimeXP===xp,'failure/recovery changed rewards or fabricated memories');
      check(JSON.stringify(app.state.player)===player&&JSON.stringify(app.state.mind.pathways)===origins,'identity/origins changed');
      engine.destroy();store.close();globalThis.fetch=originalFetch;
      return 'PASS production-502 integration: preserved completed search after analysis failure, signed checkpoint survives reload, analysis-only bounded retry, no second search/reservation, original no-tool failure retained, unknown interruption protected, no unsupported memories or Energy/XP/identity changes';
    }'''),flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
