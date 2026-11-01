"""SOURCE_EVALUATION regressions: actual server/client/engine and both IndexedDB stores.
Run tests/support/autonomous-web-search-server.cjs first. Synthetic upstream only.
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
      const {MindlingDatabase}=await import('/src/storage/database.js');
      const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
      const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
      const {understandInput}=await import('/src/learning/input-understanding.js');
      const {autonomousDiagnostics}=await import('/src/autonomous/autonomous-schedule.js');
      const check=(v,m)=>{if(!v)throw Error(m);};
      const operations=[],fetcher=globalThis.fetch;
      globalThis.fetch=async(url,options)=>{if(url==='/api/mindling/reason')operations.push(JSON.parse(options.body).mode);return fetcher(url,options);};
      let primarySnapshot;
      for(const preview of [false,true]){
        const name=preview?'preview':'primary',fixtureRun=crypto.randomUUID().replace(/[^a-f]/g,'').slice(0,8);
        let store=await (preview?new PreviewStore():new MindlingDatabase()).open();
        const write=(reducer,options)=>preview?store.change(reducer,options):store.changeGameplay(reducer,options);
        const read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
        await write(()=>newMindling(createSandbox(),{confirmed:true,id:'source-evaluation-'+name}));
        const app={store,state:await read(),renderState(){},async change(reducer,options={}){this.state=await write(reducer,options);}};
        let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
        const initial={energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,player:JSON.stringify(app.state.player),origins:JSON.stringify(app.state.mind.pathways)};
        const prepare=async kind=>{if(app.state.mind.autonomousLearning)await app.change(s=>{s.mind.autonomousLearning.nextAt=0;return s;});return engine.prepare(understandInput('Learn about source validation '+kind+' '+name+' '+fixtureRun,'TEACH'),'source-'+kind+'-'+name,{autonomous:true});};
        const first=await prepare('mixed');await engine.run(first,first.topic);
        let task=app.state.mind.learningTasks.find(t=>t.id===first.id);
        check(task.status==='COMPLETED'&&app.state.mind.memories.length===1,'mixed evidence failed to retain its valid claim in '+name);
        check(task.evidenceDiagnostics.candidates===2&&task.evidenceDiagnostics.accepted===1&&task.evidenceDiagnostics.rejections[0].code==='QUOTE_NOT_IN_CITED_PASSAGE','per-claim diagnosis lost');
        check(task.serviceDiagnostic.validation.metadataRejections[0].rule==='FOLLOWUP_INVALID'&&task.nextQuestion===null,'invalid question contaminated persisted task');
        let memory=app.state.mind.memories[0],source=task.sourceReferences.find(s=>s.url===memory.research.sourceURL);
        check(source.passages.includes(memory.research.evidenceText)&&memory.research.sourceHash===source.hash,'accepted claim lost exact provenance');
        check(memory.research.verification==='tool-cited-unverified-synthesis','synthesis relabelled as verified');
        const memoryBefore=JSON.stringify(app.state.mind.memories);
        const zero=await prepare('zero');await engine.run(zero,zero.topic);task=app.state.mind.learningTasks.find(t=>t.id===zero.id);
        check(task.code==='NO_EVIDENCE'&&task.status==='BLOCKED'&&task.serviceDiagnostic.detail==='INSUFFICIENT_EVIDENCE','zero valid claims became generic failure');
        check(task.evidenceDiagnostics.candidates===2&&task.evidenceDiagnostics.accepted===0&&task.evidenceDiagnostics.rejections.length===2,'zero-claim rejection counts lost');
        check(autonomousDiagnostics(engine).status==='PAUSED','insufficient evidence misreported as autonomous ERROR');
        check(JSON.stringify(app.state.mind.memories)===memoryBefore,'failed evidence mutated existing knowledge');
        check(app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp,'failed research charged Energy or XP');
        const recovering=await prepare('recovery');await engine.run(recovering,recovering.topic);task=app.state.mind.learningTasks.find(t=>t.id===recovering.id);
        check(task.pendingSourceEvidence&&task.pendingSourceEvidence.evidence.sources.length===2&&task.code==='UPSTREAM_HTTP_ERROR','interrupted evaluation lost signed sources');
        check(JSON.stringify(app.state.mind.memories)===memoryBefore&&app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp,'interrupted evaluation changed knowledge or rewards');
        const signature=task.pendingSourceEvidence.signature,searches=operations.filter(m=>m==='research-acquire').length;
        engine.destroy();store.close();store=await (preview?new PreviewStore():new MindlingDatabase()).open();app.store=store;app.state=await read();
        check(app.state.mind.learningTasks.find(t=>t.id===recovering.id).pendingSourceEvidence.signature===signature,'checkpoint did not survive reopen');
        engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
        await app.change(s=>{s.mind.learningTasks.find(t=>t.id===recovering.id).retryAt=0;return s;});await engine.tick();
        const deadline=performance.now()+10000;while(engine.active||engine.draining){if(performance.now()>deadline)throw Error('Checkpoint recovery timed out');await new Promise(r=>setTimeout(r,10));}
        task=app.state.mind.learningTasks.find(t=>t.id===recovering.id);
        check(task.status==='COMPLETED'&&!task.pendingSourceEvidence,'signed analysis did not recover');
        check(task.modelCalls===4&&task.sourceRequests===2&&task.completedToolCalls===1,'recovery changed call ceilings or reservations');
        check(operations.filter(m=>m==='research-acquire').length===searches,'checkpoint recovery repeated web search');
        check(app.state.mind.memories.length===1&&JSON.stringify(app.state.mind.memories)===memoryBefore,'duplicate recovered claim wrote or mutated canonical knowledge');
        check(app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp,'recovery charged duplicate costs or rewards');
        check(JSON.stringify(app.state.player)===initial.player&&JSON.stringify(app.state.mind.pathways)===initial.origins,'identity or origin data changed');
        engine.destroy();store.close();
        const primary=await new MindlingDatabase().open(),snapshot=JSON.stringify(await primary.get('gameplay','primary'));primary.close();
        if(preview)check(snapshot===primarySnapshot,'Preview research modified primary IndexedDB');else primarySnapshot=snapshot;
      }
      globalThis.fetch=fetcher;
      return 'PASS actual handler/client/engine in primary and Preview IndexedDB: mixed-claim retention with exact provenance, zero-claim NO_EVIDENCE and PAUSED state, no failed-operation rewards/costs, persisted signed evaluation-only recovery without search repetition, no duplicate canonical writes and sandbox isolation';
    }'''),flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
