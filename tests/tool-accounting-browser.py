"""No network/model calls: correlated HTTP errors through real client, engine and isolated IndexedDB."""
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
          const task=await engine.prepare(understandInput('Learn seria A, italian league.','TEACH',{answers:{detail:'Basic rules'}}),'serie');
          const topic=task.topic+' '+task.scope.detail,request=engine.context(task,topic);
          const planned=await engine.patch(task.id,null,t=>{t.sourcePlan={request,queries:['Serie A basic rules'],available:true,sourceCategory:'web'};t.plan=['Explain league structure'];t.planningCalls=1;t.modelCalls=1;t.code='QUEUED';});
          const before=JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP,app.state.player,app.state.mind.pathways]);let calls=0;
          const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls++;const {id,mode,context}=JSON.parse(options.body);if(mode!=='research-acquire'||!context.request.topic.includes('seria A')||!context.request.topic.includes('Basic rules'))throw Error('subject lost');return Response.json({error:{code:'TOOL_LIFECYCLE_INCOMPLETE',diagnostic:{correlationId:id,operation:mode,phase:'INFORMATION',endpoint:'responses',upstreamStatus:200,errorCategory:'TOOL_LIFECYCLE_INCOMPLETE',detail:'TOOL_LIMIT_OUTCOME_UNKNOWN',durationMs:25916,searchRequested:true,searchDispatched:true,searchCompleted:true,completed:2,failed:0,outcomeUnknown:true,sourceCount:0,fallbackReason:'none',modelConfirmed:true,observedToolEvents:3,toolAccounting:{distinctIds:3,anonymous:0,conflicts:0,incomplete:1,responseCompleted:true,requestedLimit:2,reportedCalls:3,duplicateObservations:0,terminalCalls:2,dispatchUnknown:1}}}},{status:502});};
          await engine.run(planned,topic);const saved=app.state.mind.learningTasks.find(t=>t.id===task.id),check=(ok,m)=>{if(!ok)throw Error(m);};
          check(saved.code==='TOOL_LIFECYCLE_INCOMPLETE'&&saved.status==='BLOCKED','server error lost');check(saved.sourceRequests===2&&saved.modelCalls===3&&saved.researchExecution.completed===2&&saved.researchExecution.outcomeUnknown,'reservation/accounting changed');check(saved.sourceReferences.length===0&&saved.knowledgeIds.length===0,'unsupported evidence accepted');check(saved.message.includes('incomplete tool work'),'generic error');
          engine.destroy();app.state=await read();engine=new AutonomousLearningEngine(app);await engine.loadPermissions();engine.recover();await new Promise(r=>setTimeout(r,50));let blocked=false;try{await engine.act('retry',task.id);}catch{blocked=true;}check(blocked&&calls===1,'unknown remote work repeated');
          check(JSON.stringify([app.state.mind.memories,app.state.mind.energy,app.state.mind.lifetimeXP,app.state.player,app.state.mind.pathways])===before,'knowledge/Energy/XP/identity changed');
          engine.destroy();db.close();globalThis.fetch=original;return `${preview?'Preview':'Normal'}: exact correlated error, preserved reservation, no evidence, reload protection and no duplicate request passed`;
        }''',preview),flush=True)
        context.close()
    browser.close()
