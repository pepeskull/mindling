"""Received-success regressions with real handler/client/engine/IndexedDB; mock upstream.
The first normal-store success uses an actual 23.087-second hosted-tool fixture delay.
"""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
CASES=['success','abort_after_body','hidden_after_body','offline_after_body','missing','body_abort','parse','stale','checkpoint','receipt_store','evidence_store','integration','cancel','changed_run','revoked','storage_unavailable','navigation']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for preview in [False,True]:
      for case in CASES:
        context=browser.new_context()
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
        page=context.new_page();page.goto(BASE+'/tests/blank.html')
        delayed=not preview and case=='success'
        context.request.post(BASE+'/tests/receipt-mode',data={'delayed':delayed})
        result=page.evaluate('''async({preview,kind,delayed})=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
          const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');
          const {canRetryResearch}=await import('/src/autonomous/service-diagnostics.js');
          const check=(v,m)=>{if(!v)throw Error(kind+': '+m);};
          let store=await (preview?new PreviewStore():new MindlingDatabase()).open();
          const read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
          const write=(reducer,options)=>preview?store.change(reducer,options):store.changeGameplay(reducer,options);
          await write(()=>newMindling(createSandbox(),{id:'receipt-browser',confirmed:true,pathways:['Gaming','Developer','Social']}));
          const prior={id:'previous',content:'An existing retained teaching claim remains unchanged.',category:'History',categoryId:'prior-area',topic:'History',source:'NATIVE',neuronIds:[],synapseIds:[],relatedMemoryIds:[]};
          if(kind!=='success')await write(s=>{s.mind.memories.push(prior);return s;});
          let injected=false;
          const app={store,state:await read(),renderState(){},async change(reducer,options={}){
            this.state=await write(s=>{
              const next=reducer(s),task=next.mind.learningTasks?.[0];
              const match=kind==='receipt_store'&&task?.pendingSourceEvaluation||kind==='evidence_store'&&task?.pendingEvidence?.length||kind==='integration'&&task?.status==='COMPLETED';
              if((match&&!injected)||(kind==='storage_unavailable'&&window.__bodyRead)){injected=true;throw new DOMException('Private transaction details','QuotaExceededError');}
              return next;
            },options);
          }};
          let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.setAccess(true);
          const task=await engine.prepare(understandInput('Learn about Gaming','TEACH'),'received-browser',{autonomous:true});
          const saved=()=>app.state.mind.learningTasks.find(t=>t.id===task.id),initial={memories:JSON.stringify(app.state.mind.memories),energy:app.state.mind.energy.remaining,xp:app.state.mind.lifetimeXP,player:JSON.stringify(app.state.player),origins:JSON.stringify(app.state.mind.pathways)};
          let calls=0,bodyRead=false,networkCalls=0;const originalFetch=globalThis.fetch;
          globalThis.fetch=async(url,options)=>{
            networkCalls++;const request=url==='/api/mindling/reason'?JSON.parse(options.body):null;
            if(request?.mode==='research-acquire')calls++;
            const response=await originalFetch(url,options);
            if(request?.mode!=='research-acquire')return response;
            const raw=await response.text();bodyRead=true;window.__bodyRead=true;
            const result=JSON.parse(raw);window.__serverResult=result;
            check(response.status===200&&result.execution.detail==='COMPLETED'&&result.execution.validation.accepted===3&&result.acquisition.sources.length===3,'fixture did not complete');
            if(kind==='missing')throw new DOMException('Private response lost','AbortError');
            if(kind==='body_abort')return {ok:true,status:200,async text(){throw new DOMException('Private body interrupted','AbortError');}};
            if(kind==='parse')return new Response('{broken',{status:200});
            if(kind==='stale')result.execution.correlationId='f'.repeat(64);
            if(kind==='checkpoint')delete result.sourceCheckpoint;
            if(kind==='navigation')return {ok:true,status:200,text:()=>new Promise(()=>{})};
            return {ok:true,status:200,async text(){
              if(kind==='abort_after_body')engine.active.controller.abort('PAGEHIDE');
              if(kind==='hidden_after_body'){Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));}
              if(kind==='offline_after_body'){Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.dispatchEvent(new Event('offline'));}
              if(kind==='cancel')await engine.act('cancel',task.id);
              if(kind==='changed_run')await app.change(s=>{s.mind.learningTasks[0].run='new-owner';return s;});
              if(kind==='revoked')await engine.setAccess(false);
              return JSON.stringify(result);
            }};
          };
          const start=performance.now(),running=engine.run(task,'Gaming');
          if(kind==='navigation'){
            window.__running=running;window.__mode=preview;
            const deadline=performance.now()+10000;while(!bodyRead){if(performance.now()>deadline)throw Error('Response gate timeout');await new Promise(r=>setTimeout(r,5));}
            return 'NAVIGATE';
          }
          await running;const elapsed=performance.now()-start;let value=saved();
          delete document.hidden;delete navigator.onLine;
          if(kind==='success'){
            check(value.status==='COMPLETED'&&app.state.mind.memories.length===3,'valid receipt not integrated');
            if(delayed)check(elapsed>=23000&&window.__serverResult.execution.durationMs>=23000,'actual 23-second delay missing');
          }else if(['abort_after_body','hidden_after_body','offline_after_body','evidence_store','integration'].includes(kind)){
            const expected=kind==='evidence_store'?'EVIDENCE_PERSISTENCE_FAILED':kind==='integration'?'INTEGRATION_FAILED':'INTEGRATION_PAUSED';
            check(value.code===expected&&!value.researchExecution.outcomeUnknown&&value.sourceReferences.length===3,'received success became unknown: '+value.code);
            check(value.pendingSourceEvaluation||value.pendingEvidence?.length,'received evidence was not durable');
            check(JSON.stringify(app.state.mind.memories)===initial.memories,'failed stage mutated canonical knowledge');
            const before=networkCalls;globalThis.fetch=async()=>{networkCalls++;throw Error('Local recovery must not use the network');};
            engine.destroy();store.close();store=await (preview?new PreviewStore():new MindlingDatabase()).open();app.store=store;app.state=await read();
            engine=new AutonomousLearningEngine(app);await engine.loadPermissions();await engine.run(saved(),'Gaming');value=saved();
            check(value.status==='COMPLETED'&&app.state.mind.memories.length===4&&networkCalls===before,'recovery repeated research or failed');
          }else if(kind==='storage_unavailable'){
            check(engine.diagnostics.reason.includes('could not be saved locally'),'failed diagnostic persistence was hidden');
            check(JSON.stringify(app.state.mind.memories)===initial.memories,'unavailable storage changed knowledge');
          }else{
            if(kind==='cancel')check(value.status==='CANCELLED','late response revived cancellation');
            else if(kind==='changed_run')check(value.run==='new-owner'&&value.sourceReferences.length===0,'stale response changed new owner');
            else if(kind==='revoked')check(value.code==='CHECKPOINT_PERSISTENCE_FAILED'&&!engine.preferences.enabled,'revocation accepted receipt');
            else{
              const expected={missing:'TRANSPORT_INTERRUPTED',body_abort:'TRANSPORT_INTERRUPTED',parse:'RESPONSE_PARSE_FAILED',stale:'RECEIPT_VALIDATION_FAILED',checkpoint:'CHECKPOINT_VALIDATION_FAILED',receipt_store:'CHECKPOINT_PERSISTENCE_FAILED'}[kind];
              check(value.code===expected,'incorrect browser phase: '+value.code);check(!canRetryResearch(value),'failed receipt can repeat search');
              if(['missing','body_abort','parse','stale'].includes(kind))check(value.researchExecution.outcomeUnknown&&value.sourceReferences.length===0,'unconfirmed result invented work');
              if(kind==='receipt_store')check(!value.researchExecution.outcomeUnknown&&value.completedToolCalls===1,'known completed work was erased by storage failure');
            }
            check(JSON.stringify(app.state.mind.memories)===initial.memories,'failure changed previous knowledge');
          }
          check(calls===1&&value.sourceRequests===2&&value.modelCalls===3,'duplicate dispatch or changed ceilings');
          check(app.state.mind.energy.remaining===initial.energy&&app.state.mind.lifetimeXP===initial.xp&&JSON.stringify(app.state.player)===initial.player&&JSON.stringify(app.state.mind.pathways)===initial.origins,'identity/economy/origins changed');
          if(kind!=='success')check(JSON.stringify(app.state.mind.memories.find(m=>m.id==='previous'))===JSON.stringify(prior),'existing memory changed');
          if(value.status==='COMPLETED')for(const memory of app.state.mind.memories.filter(m=>m.research)){const source=value.sourceReferences.find(s=>s.url===memory.research.sourceURL);check(source.passages.includes(memory.research.evidenceText)&&source.hash===memory.research.sourceHash&&memory.research.verification==='tool-cited-unverified-synthesis','provenance changed');}
          engine.destroy();store.close();globalThis.fetch=originalFetch;return 'PASS';
        }''',{'preview':preview,'kind':case,'delayed':delayed})
        if result=='NAVIGATE':
          page.goto(BASE+'/tests/blank.html?reopened=1')
          result=page.evaluate('''async(preview)=>{
            const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
            const store=await (preview?new PreviewStore():new MindlingDatabase()).open(),read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
            const app={store,state:await read(),renderState(){},async change(reducer,options={}){this.state=await (preview?store.change(reducer,options):store.changeGameplay(reducer,options));}};
            let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unknown navigation outcome must not repeat search');};
            const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();engine.recover();const deadline=performance.now()+3000;
            while(app.state.mind.learningTasks[0].status!=='BLOCKED'){if(performance.now()>deadline)throw Error('Recovery did not classify unknown navigation');await new Promise(r=>setTimeout(r,5));}
            const task=app.state.mind.learningTasks[0];if(task.code!=='TRANSPORT_INTERRUPTED'||!task.researchExecution.outcomeUnknown||task.sourceReferences.length||calls||task.sourceRequests!==2)throw Error('Navigation invented a receipt or repeated search');
            engine.destroy();store.close();return 'PASS';
          }''',preview)
        assert result=='PASS',(preview,case,result)
        print(('Preview' if preview else 'Normal')+' '+case+': PASS',flush=True)
        context.unroute_all(behavior='wait');context.close()
    browser.close()
