"""No network/model calls: planning validation errors through real client, engine and isolated IndexedDB."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8769')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for preview in [False,True]:
        context=browser.new_context()
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
        page=context.new_page();page.goto(BASE+'/tests/blank.html')
        print(page.evaluate('''async preview=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');
          const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
          const read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state),write=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
          await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'accounting-'+preview}));
          const app={store:db,state:await read(),renderState(){},async change(fn,opts){this.state=await write(fn,opts);}};
          await db.saveResearchPermissions(app.state.mind.id,{enabled:true});let engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
          const task=await engine.prepare(understandInput('learn about sea and oceans','TEACH'),'oceans');
          const topic=task.topic;
          const before=JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP,app.state.player,app.state.mind.pathways]);let calls=0;
          const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls++;const {id,mode,context}=JSON.parse(options.body);if(mode!=='research'||context.topic!=='sea and oceans')throw Error('subject lost');return Response.json({error:{code:'RESPONSE_PARSE_ERROR',diagnostic:{correlationId:id,operation:mode,phase:'PLANNING',endpoint:'completions',upstreamStatus:200,errorCategory:'RESPONSE_PARSE_ERROR',detail:'PLAN_QUERY_CHARACTERS_INVALID',durationMs:4695,searchRequested:false,searchDispatched:false,searchCompleted:false,completed:0,failed:0,outcomeUnknown:false,sourceCount:0,fallbackReason:'none',modelConfirmed:true}}},{status:502});};
          await engine.run(task,topic);const saved=app.state.mind.learningTasks.find(t=>t.id===task.id),check=(ok,m)=>{if(!ok)throw Error(m);};
          check(saved.code==='RESPONSE_PARSE_ERROR'&&saved.status==='BLOCKED','server error lost');check(saved.sourceRequests===0&&saved.modelCalls===1&&saved.planningCalls===1,'reservation/accounting changed');check(saved.serviceDiagnostic.detail==='PLAN_QUERY_CHARACTERS_INVALID'&&saved.lastFailurePhase==='PLANNING','rule lost');check(saved.sourceReferences.length===0&&saved.knowledgeIds.length===0,'unsupported evidence accepted');
          engine.destroy();app.state=await read();engine=new AutonomousLearningEngine(app);await engine.loadPermissions();engine.recover();await new Promise(r=>setTimeout(r,50));check(calls===1,'reload automatically repeated planning');check(app.state.mind.learningTasks.find(t=>t.id===task.id).serviceDiagnostic.detail==='PLAN_QUERY_CHARACTERS_INVALID','persisted diagnostic lost');
          check(JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP,app.state.player,app.state.mind.pathways])===before,'knowledge/Energy/XP/identity changed');
          engine.destroy();db.close();globalThis.fetch=original;return `${preview?'Preview':'Normal'}: PLANNING rule persisted, one model reservation, zero searches, no automatic retry, no knowledge/Energy/XP changes passed`;
        }''',preview),flush=True)
        context.close()
    browser.close()
