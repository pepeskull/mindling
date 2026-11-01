"""Local integration: real Chromium + IndexedDB + handler, explicitly synthetic AI upstream.
No paid/live AI calls, downloads, screenshots or production data.
Run: node tests/support/autonomous-web-search-server.cjs, then this script.
"""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    page=context.new_page()
    page.goto(BASE+'/tests/blank.html')
    print(page.evaluate('''async()=>{
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
      const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
      const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
      const {understandInput}=await import('/src/learning/input-understanding.js');
      const {trainingContext}=await import('/src/training/retrieval.js');
      const {assertResearchGrant}=await import('/src/autonomous/research-permissions.js');
      const check=(value,message)=>{if(!value)throw Error(message);};
      const wait=async fn=>{const deadline=performance.now()+10000;while(!fn()){if(performance.now()>deadline)throw Error('Integration timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
      const store=await new PreviewStore().open();await store.change(()=>newMindling(createSandbox(),{confirmed:true,id:'autonomous-browser-test'}));
      const highlights=[],notifications=[];
      const app={store,state:await store.read(),renderState(){},events:{emit(){}},seed:{highlightRoute(route){highlights.push(route);}},dashboard:{showResearchResult(task){notifications.push(task.status);},canContinueResearch(){return false;}},async change(reducer,options={}){this.state=await store.change(reducer,options);}};
      let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
      check(engine.preferences.enabled===false,'new provider consent inherited');await engine.setAccess(true);
      const initial={energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,keys:JSON.stringify(app.state.player),origins:JSON.stringify(app.state.mind.pathways),nodes:app.state.mind.nodes.length,synapses:app.state.mind.synapses.length};
      // No user message, Start Research, per-query/source approval, or manual URL.
      await engine.tick();await wait(()=>!engine.active&&!engine.draining&&app.state.mind.learningTasks?.some(task=>task.status==='COMPLETED'));
      let first=app.state.mind.learningTasks[0];check(first.autonomous&&first.status==='COMPLETED','no automatic initiation');
      check(app.state.mind.memories.length===1,'canonical memory not integrated');
      let memory=app.state.mind.memories[0];
      check(memory.research.sourceURL.startsWith('https://www.ninds.nih.gov/'),'missing provenance');
      check(memory.research.evidenceRelation==='web-search-supported-synthesis'&&memory.research.verification==='tool-cited-unverified-synthesis','synthesis falsely labelled verified or verbatim');
      check(first.completedToolCalls===1&&first.completedWork.length===7,'simulated or missing progress');
      check(app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp,'background learning charged Energy/XP');
      check(app.state.mind.nodes.length===initial.nodes&&app.state.mind.synapses.length===initial.synapses,'search fabricated brain growth');
      check(highlights.length>0&&notifications.includes('COMPLETED'),'missing neural feedback/result');
      const cited=engine.reply(first);check(cited.sources.length===1&&cited.answer.includes('Neurons'),'no researched answer/citation');
      check(trainingContext('How do neurons communicate through synapses?',app.state.mind).candidates.some(candidate=>candidate.id===memory.id),'learned memory unavailable to later retrieval');
      // Different request with identical hosted claim: same canonical memory, no reward/cost.
      let duplicate=await engine.prepare(understandInput('Learn about neural communication basics','TEACH'),'duplicate-request');await engine.run(duplicate,duplicate.topic);
      check(app.state.mind.memories.length===1&&app.state.mind.lifetimeXP===0,'duplicate knowledge inflated');
      // Interrupt AFTER persisted evidence, before canonical commit, then reopen IndexedDB.
      let stars=await engine.prepare(understandInput('Learn about stars','TEACH'),'stars-request');
      const integrate=engine.integrate.bind(engine);engine.integrate=async()=>{throw new DOMException('synthetic interruption','AbortError');};await engine.run(stars,stars.topic);
      stars=app.state.mind.learningTasks.find(task=>task.id===stars.id);check(stars.pendingEvidence?.length===1&&stars.code==='INTEGRATION_FAILED'&&stars.clientDiagnostic.phase==='INTEGRATION'&&!stars.researchExecution.outcomeUnknown,'pending evidence not durable');
      engine.destroy();store.close();const reopened=await new PreviewStore().open();app.store=reopened;app.state=await reopened.read();app.change=async function(reducer,options={}){this.state=await reopened.change(reducer,options);};
      engine=new AutonomousLearningEngine(app);await engine.loadPermissions();let network=0,fetcher=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('Recovery must not refetch');};
      await engine.run(app.state.mind.learningTasks.find(task=>task.id===stars.id),stars.topic);globalThis.fetch=fetcher;
      check(network===0&&app.state.mind.memories.length===2,'interrupted evidence was lost or re-fetched');
      check(app.state.mind.learningTasks.find(task=>task.id===stars.id).status==='COMPLETED','recovered task incomplete');
      // Source failure has no side effects and persists a bounded backoff state.
      let failed=await engine.prepare(understandInput('Learn about source failure','TEACH'),'failure-request');await engine.run(failed,failed.topic);
      failed=app.state.mind.learningTasks.find(task=>task.id===failed.id);check(failed.code==='RATE_LIMITED'&&failed.retryAt>Date.now()&&failed.sourceRequests===2,'rate limit/budget not durable');
      check(app.state.mind.memories.length===2&&app.state.mind.lifetimeXP===0,'failed search fabricated learning');
      // Cancel a real in-flight browser request; stale remote callbacks cannot commit.
      let cancelled=await engine.prepare(understandInput('Learn about cancellation','TEACH'),'cancel-request');const running=engine.run(cancelled,'cancel operation');
      await wait(()=>app.state.mind.learningTasks.find(task=>task.id===cancelled.id)?.status==='RESEARCHING');await engine.act('cancel',cancelled.id);await running;
      check(app.state.mind.learningTasks.find(task=>task.id===cancelled.id).status==='CANCELLED'&&app.state.mind.memories.length===2,'cancel accepted late knowledge');
      // Revocation is checked inside the same readwrite transaction as the memory write.
      const oldGrant=engine.grant(engine.preferences);await engine.setAccess(false);
      let denied=false;try{await app.change(state=>{state.mind.name='MUST NOT SAVE';return state;},{researchGrant:oldGrant});}catch{denied=true;}
      check(denied&&(await reopened.read()).mind.name!=='MUST NOT SAVE','revocation did not fence write');
      check(JSON.stringify(app.state.player)===initial.keys&&JSON.stringify(app.state.mind.pathways)===initial.origins,'identity or origins changed');
      // Explicit correction is regular Teach, has no false web-source attribution.
      first=app.state.mind.learningTasks[0];memory=app.state.mind.memories.find(item=>item.research?.taskId===first.id);
      await engine.manageKnowledge(first,'correct-memory',{memoryId:memory.id,text:'Axons carry electrical impulses toward their terminal branches.'});
      const corrected=app.state.mind.memories.find(item=>item.correctsMemoryId===memory.id);check(corrected&&!corrected.research&&app.state.mind.memories.find(item=>item.id===memory.id).supersededBy===corrected.id,'manual correction misattributed');
      const starTask=app.state.mind.learningTasks.find(task=>task.id===stars.id),starMemory=app.state.mind.memories.find(item=>item.research?.taskId===starTask.id);
      await engine.manageKnowledge(starTask,'forget-memory',{memoryId:starMemory.id});
      check(!app.state.mind.memories.some(item=>item.id===starMemory.id)&&app.state.mind.researchExclusions.includes(starMemory.research.quoteHash),'deleted research remains current or may auto-relearn');
      check(app.state.mind.learningTasks.find(task=>task.id===starTask.id).sourceReferences.length===1,'delete destroyed source history');
      engine.destroy();reopened.close();
      return 'PASS local integration: automatic initiation, real HTTP handler + synthetic hosted search, canonical learning, citations, retrieval, IndexedDB reopen/recovery without network, duplicates, 0 research XP/Energy, rate limit, cancellation, atomic revocation, identity/origins, correction and deletion';
    }'''),flush=True)
    shell=context.new_page();errors=[]
    shell.on('pageerror',lambda error:errors.append(str(error)))
    shell.goto(BASE)
    shell.locator('[data-next]').click()
    for name in ['Developer','Social','Researcher']:shell.locator(f'[data-pathway="{name}"]').click()
    shell.locator('[data-next]').click();shell.locator('[data-next]').click()
    shell.locator('#mindling-name').fill('LocalCheck');shell.locator('[data-next]').click();shell.locator('[data-create]').click()
    shell.wait_for_function("document.querySelector('#onboarding').hidden")
    assert shell.locator('#scene canvas').count()>0
    shell.locator('.research-settings-link').click()
    assert shell.locator('.research-settings input[type=checkbox]').count()==1
    assert 'Enable autonomous learning' in shell.locator('.research-settings').inner_text()
    shell.locator('[data-close-settings]').click()
    for view in ['development','memories','dashboard']:
        shell.locator(f'[data-view="{view}"]').click()
        if view!='dashboard':assert shell.locator('#development-view' if view=='development' else '#memory-view').is_visible()
    shell.reload();shell.wait_for_function("document.querySelector('[data-life-status-title]')?.textContent.includes('LocalCheck')")
    assert shell.locator('#onboarding').is_hidden()
    assert not errors,errors
    print(shell.evaluate('''async()=>{
      const {MindlingDatabase}=await import('/src/storage/database.js');
      const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
      const db=await new MindlingDatabase().open(),saved=(await db.get('gameplay','primary')).state;
      const keys=JSON.stringify(await db.getAll('identity')),origins=JSON.stringify(saved.mind.pathways);
      const app={db,state:saved,renderState(){},async change(reducer,options={}){this.state=await db.changeGameplay(reducer,options);}};
      const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);await engine.tick();
      const deadline=performance.now()+10000;while(engine.draining||engine.active||!app.state.mind.learningTasks?.some(task=>task.status==='COMPLETED')){if(performance.now()>deadline)throw Error('Primary store learning timeout');await new Promise(resolve=>setTimeout(resolve,10));}
      if(app.state.mind.memories.length!==1||app.state.mind.lifetimeXP!==saved.mind.lifetimeXP||app.state.mind.energy.remaining!==saved.mind.energy.remaining)throw Error('Primary database canonical/reward mismatch');
      if(JSON.stringify(await db.getAll('identity'))!==keys||JSON.stringify(app.state.mind.pathways)!==origins)throw Error('Primary database identity changed');
      const persisted=(await db.get('gameplay','primary')).state;
      if(persisted.mind.memories[0].research.evidenceRelation!=='web-search-supported-synthesis')throw Error('Primary evidence provenance lost');
      await engine.setAccess(false);engine.destroy();db.close();return 'PASS primary IndexedDB: consent + automatic task + canonical memory persistence, unchanged cryptographic identity, Origin DNA, Energy and XP';
    }'''),flush=True)
    print('PASS shell smoke: real onboarding/identity, Canvas neural visualization, navigation, one global learning control and returning-user hydration; external network blocked',flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
