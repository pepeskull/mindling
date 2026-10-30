"""Observed live outcomes reproduced with synthetic hosted responses, real handler/IndexedDB.
Run with tests/support/autonomous-web-search-server.cjs. No external API calls.
"""
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
      const {createSandbox,newMindling,talk}=await import('/src/preview/sandbox/engine.js');
      const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
      const {understandInput}=await import('/src/learning/input-understanding.js');
      const {renderTaskInspector}=await import('/src/autonomous/task-inspector.js');
      const {graphData}=await import('/src/memory/graph-data.js');
      const check=(value,message)=>{if(!value)throw Error(message);};
      const store=await new PreviewStore().open();await store.change(()=>newMindling(createSandbox(),{confirmed:true,id:'live-diagnostics-test'}));
      const app={store,state:await store.read(),renderState(){},async change(reducer,options={}){this.state=await store.change(reducer,options);}};
      const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
      const identity=JSON.stringify(app.state.player),origins=JSON.stringify(app.state.mind.pathways),permission=JSON.stringify(await store.researchPermissions(app.state.mind.id));
      // Model asks for an optional focus on a broad autonomous orientation.
      const automatic=await engine.prepare(understandInput('Learn about ambiguous orientation','TEACH'),'auto-focus',{autonomous:true});
      await engine.run(automatic,automatic.topic);
      const paused=app.state.mind.learningTasks.find(task=>task.id===automatic.id);
      check(paused.code==='MODEL_CLARIFICATION'&&paused.sourceRequests===0&&engine.status==='PAUSED','initial planning pause not diagnosed');
      // Original Talk activity charged once; hosted search returns a season but no fact date.
      await app.change(state=>talk(state,'Which team leads the Spanish league standings right now?',{id:'manual-undated'}));
      const energyAfterTalk=app.state.mind.energy.remaining;
      const interpretation=understandInput('Which team leads LaLiga now?','TALK',{answers:{metric:'standings'}});
      const manual=await engine.prepare(interpretation,'manual-undated');await engine.run(manual,'LaLiga season evidence');
      const insufficient=app.state.mind.learningTasks.find(task=>task.id===manual.id);
      check(insufficient.status==='BLOCKED'&&insufficient.code==='NO_EVIDENCE'&&insufficient.completedWork.length===5,'observed 5/7 outcome not reproduced');
      check(insufficient.completedToolCalls===1&&insufficient.sourceRequests===2&&insufficient.sourceReferences.length===1,'tool reservation or source counts changed');
      check(insufficient.evidenceDiagnostics.rejections[0].code==='MISSING_AS_OF_DATE'&&app.state.mind.memories.length===0,'undated fact escaped validation');
      check(engine.status==='PAUSED'&&engine.diagnostics.taskId===automatic.id,'manual insufficient evidence incorrectly turned autonomy into ERROR');
      check(app.state.mind.energy.remaining===energyAfterTalk&&app.state.mind.lifetimeXP===0,'research charged extra Energy/XP');
      const host=document.createElement('section');renderTaskInspector(host,{task:insufficient},{memories:[]});
      check(host.textContent.includes('a season or retrieval date is insufficient')&&host.textContent.includes('no second source comparison')&&host.textContent.includes('not the number of completed or billed calls'),'inspector hid evidence/budget reasons');
      // Complete authoritative single-source fact: date outside quote but same cited paragraph.
      await app.change(state=>talk(state,'What are the dated standings in the selected Spanish league?',{id:'manual-dated'}));
      const dated=await engine.prepare(understandInput('Which team leads LaLiga currently?','TALK',{answers:{metric:'standings'}}),'manual-dated');
      await engine.run(dated,'LaLiga dated evidence');
      const completed=app.state.mind.learningTasks.find(task=>task.id===dated.id),memory=app.state.mind.memories[0];
      check(completed.status==='COMPLETED'&&memory&&completed.sourceReferences.length===1,'supported single-source fact not retained');
      check(completed.sourceReferences[0].passages.length===2&&completed.evidenceDiagnostics.accepted===1,'later dated paragraph discarded');
      check(memory.research.validAt===Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')&&memory.research.verification==='tool-cited-unverified-synthesis','date/provenance misrepresented');
      check(app.state.mind.energy.remaining===energyAfterTalk-1&&app.state.mind.lifetimeXP===0,'continuation duplicated Talk charge');
      // A settled pause no longer starves the scheduler. Keep the persisted daily cap/cooldown.
      await app.change(state=>{state.mind.autonomousLearning.nextAt=Date.now()-1;return state;});
      await engine.tick();const deadline=performance.now()+10000;while(engine.active||engine.draining){if(performance.now()>deadline)throw Error('Autonomous continuation timeout');await new Promise(resolve=>setTimeout(resolve,10));}
      check(app.state.mind.learningTasks.filter(task=>task.autonomous).length===2,'paused task deadlocked autonomous scheduling');
      check(JSON.stringify(app.state.player)===identity&&JSON.stringify(app.state.mind.pathways)===origins&&JSON.stringify(await store.researchPermissions(app.state.mind.id))===permission,'identity/origins/permission changed');
      check((await store.read()).mind.learningTasks.find(task=>task.id===manual.id).evidenceDiagnostics.rejections[0].code==='MISSING_AS_OF_DATE','diagnostics did not persist');
      engine.destroy();store.close();return 'PASS live-scenario regression: PLANNING→PAUSED, manual 5/7 missing date, one completed/two reserved, no false ERROR, retained dated single-source evidence, inspector reasons, autonomous continuation, persisted diagnostics and unchanged permissions/identity/XP';
    }'''),flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
