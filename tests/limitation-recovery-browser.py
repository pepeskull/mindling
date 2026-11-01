"""Gaming LIMITATION_INVALID through real handler/client/engine/inspector and both stores.
Run tests/support/autonomous-web-search-server.cjs first. No live inference.
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
      const {renderTaskInspector}=await import('/src/autonomous/task-inspector.js');
      const check=(v,m)=>{if(!v)throw Error(m);};
      const wait=async fn=>{const deadline=performance.now()+10000;while(!fn()){if(performance.now()>deadline)throw Error('Gaming recovery timeout');await new Promise(r=>setTimeout(r,10));}};
      const operations=[],fetcher=globalThis.fetch;let simulateOffline=true;
      globalThis.fetch=async(url,options)=>{
        if(url==='/api/mindling/reason')operations.push(JSON.parse(options.body).mode);
        const response=await fetcher(url,options);
        // A received server diagnostic remains authoritative even if connectivity
        // changes before the engine persists it. This used to mask it as OFFLINE.
        if(url==='/api/mindling/reason'&&response.status===502&&simulateOffline){const text=await response.text();Object.defineProperty(navigator,'onLine',{value:false,configurable:true});return new Response(text,{status:502});}
        return response;
      };
      let primarySnapshot;
      for(const preview of [false,true]){
        await fetcher('/tests/gaming-mode',{method:'POST',body:JSON.stringify({mode:'invalid'})});simulateOffline=true;
        let store=await (preview?new PreviewStore():new MindlingDatabase()).open();
        const write=(reducer,options)=>preview?store.change(reducer,options):store.changeGameplay(reducer,options);
        const read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
        await write(()=>newMindling(createSandbox(),{confirmed:true,id:'gaming-limitation-'+preview,pathways:['Gaming','Developer','Social']}));
        const app={store,state:await read(),renderState(){},async change(reducer,options={}){this.state=await write(reducer,options);}};
        let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
        const initial={energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,player:JSON.stringify(app.state.player),origins:JSON.stringify(app.state.mind.pathways)};
        check(app.state.mind.memories.length===0,'new Gaming Mindling not empty');
        await engine.tick();await wait(()=>!engine.active&&!engine.draining&&app.state.mind.learningTasks?.length);
        let task=app.state.mind.learningTasks[0];delete navigator.onLine;simulateOffline=false;
        check(task.topic==='Gaming'&&task.autonomous,'scheduler did not select Gaming');
        check(task.code==='RESPONSE_PARSE_ERROR'&&task.lastFailureCode==='RESPONSE_PARSE_ERROR'&&task.lastFailurePhase==='SOURCE_EVALUATION','received error masked as interruption/offline');
        check(task.serviceDiagnostic.detail==='LIMITATION_INVALID'&&task.serviceDiagnostic.limitationFailure.rule==='TOO_LONG','limitation subrule lost');
        check(task.completedToolCalls===2&&task.sourceRequests===2&&task.pendingSourceEvidence?.evidence.sources.length===2,'two completed calls/signed evidence lost');
        check(app.state.mind.memories.length===0&&app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp,'failure mutated knowledge or rewards');
        const host=document.createElement('section');renderTaskInspector(host,{task});check(host.textContent.includes('RESPONSE_PARSE_ERROR · SOURCE_EVALUATION · LIMITATION_INVALID'),'inspector hides real category');
        const signature=task.pendingSourceEvidence.signature,count=operations.length,searches=operations.filter(m=>m==='research-acquire').length;
        // Reopen a saved task carrying the misleading legacy interruption label,
        // but retain its matching, validated server receipt. Recovery must use it.
        await app.change(s=>{const t=s.mind.learningTasks[0];t.status='RESEARCHING';t.code=t.lastFailureCode='REQUEST_INTERRUPTED';t.lastFailurePhase='RESEARCHING';return s;});
        engine.destroy();store.close();store=await (preview?new PreviewStore():new MindlingDatabase()).open();app.store=store;app.state=await read();
        engine=new AutonomousLearningEngine(app);await engine.loadPermissions();engine.recover();
        await wait(()=>app.state.mind.learningTasks[0].status==='BLOCKED'&&app.state.mind.learningTasks[0].code==='RESPONSE_PARSE_ERROR');
        task=app.state.mind.learningTasks[0];check(task.lastFailurePhase==='SOURCE_EVALUATION'&&task.pendingSourceEvidence.signature===signature&&operations.length===count,'recovery discarded receipt or dispatched early');
        await fetcher('/tests/gaming-mode',{method:'POST',body:JSON.stringify({mode:'valid'})});
        await app.change(s=>{s.mind.learningTasks[0].retryAt=0;return s;});await engine.tick();await wait(()=>!engine.active&&!engine.draining);
        task=app.state.mind.learningTasks[0];
        check(task.status==='COMPLETED'&&app.state.mind.memories.length===1,'Gaming retry did not integrate supported claim');
        check(operations.filter(m=>m==='research-acquire').length===searches&&task.modelCalls===4&&task.evaluationCalls===2&&task.sourceRequests===2&&task.completedToolCalls===2,'recovery exceeded reservation or repeated search');
        check(task.limitations[0]==='  These synthetic cited summaries are not independently verified.\\nA second source does not remove uncertainty.\\t','meaningful qualification was rewritten');
        check(task.evidenceDiagnostics.rejections.some(r=>r.code==='QUOTE_NOT_IN_CITED_PASSAGE'),'PR 115 independent validation lost');
        const memory=app.state.mind.memories[0],source=task.sourceReferences.find(s=>s.url===memory.research.sourceURL);
        check(memory.research.verification==='tool-cited-unverified-synthesis'&&source.passages.includes(memory.research.evidenceText)&&source.hash===memory.research.sourceHash,'evidence provenance weakened');
        check(app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp&&JSON.stringify(app.state.player)===initial.player&&JSON.stringify(app.state.mind.pathways)===initial.origins,'identity/consent/economy changed');
        const memories=JSON.stringify(app.state.mind.memories);engine.destroy();store.close();store=await (preview?new PreviewStore():new MindlingDatabase()).open();check(JSON.stringify((await read()).mind.memories)===memories,'reload duplicated or altered memory');store.close();
        const primary=await new MindlingDatabase().open(),snapshot=JSON.stringify(await primary.get('gameplay','primary'));primary.close();if(preview)check(snapshot===primarySnapshot,'Preview changed primary state');else primarySnapshot=snapshot;
      }
      globalThis.fetch=fetcher;
      return 'PASS primary and Preview: empty Mindling autonomously selects Gaming, two tool calls/two cited sources, real LIMITATION_INVALID persisted/displayed, concurrent offline signal does not mask it, legacy matching receipt restored, signed reload/evaluation-only retry within budgets, verbatim limitations, independent claim rejection, exact provenance, no failed-operation costs/rewards, no duplicate writes and sandbox isolation';
    }'''),flush=True)
    context.unroute_all(behavior='wait');context.close();browser.close()
