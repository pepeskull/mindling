"""Isolated normal/preview IndexedDB and UI; all model responses are synthetic."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8794")
MOUNT = """async ({preview, seed})=>{
  const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const {newMindling,createSandbox}=await import('/src/preview/sandbox/engine.js');
  const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
  const {understandInput}=await import('/src/learning/input-understanding.js');
  const {digest}=await import('/src/autonomous/tasks.js');
  const {renderTaskInspector}=await import('/src/autonomous/task-inspector.js');
  const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
  const read=()=>preview?db.read():db.get('gameplay','primary').then(value=>value.state);
  const save=(fn,opts)=>preview?db.change(fn,opts):db.changeGameplay(fn,opts);
  if(seed){
    await save(()=>newMindling(createSandbox(Date.now()),{id:'refinement-'+preview,confirmed:true}));
    await db.saveResearchPermissions('refinement-'+preview,{enabled:true});
  }
  const app={state:await read(),store:db,renderState(){},async change(fn,opts){this.state=await save(fn,opts);}};
  const engine=new AutonomousLearningEngine(app);
  await engine.loadPermissions();
  const quote='A scientific hypothesis is a testable proposed explanation.';
  const url='https://example.org/science';
  const source={id:'web:'+await digest(url+'\\n'+quote),provider:'openai-web-search',url,title:'Synthetic science',domain:'example.org',publisher:null,publishedAt:null,observedAt:Date.now(),type:'web-search-synthesis',status:'tool-cited',text:quote,passages:[quote],hash:await digest(quote)};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    if(url!=='/api/mindling/reason')return original(url,options);
    const {id,mode,context}=JSON.parse(options.body);
    sessionStorage.setItem(mode,String(Number(sessionStorage.getItem(mode)||0)+1));
    const refining=mode==='research-evaluate';
    if(refining&&context.refinement!==true)throw Error('No refinement context');
    const empty={claims:[],limitations:[],nextQuestion:null};
    const evidence={provider:'openai-web-search',responseId:'resp_fixture',sources:[source],requests:2,bytes:400,failures:[],evaluation:empty};
    const checkpoint=refining?context.checkpoint:{version:1,expiresAt:Date.now()+600000,originalId:id,request:context.request,plan:context.plan,evidence,signature:'a'.repeat(64)};
    const chosen=checkpoint.evidence.sources[0];
    const claims=refining?[{sourceId:chosen.id,quote,category:'Science',topic:'Hypotheses',reason:'Definition is stated directly.',validAt:null}]:[];
    const execution={correlationId:id,operation:mode,phase:'SOURCE_EVALUATION',endpoint:'completions',upstreamStatus:200,errorCategory:null,
      detail:refining?'COMPLETED':'INSUFFICIENT_EVIDENCE',durationMs:40,searchRequested:!refining,searchDispatched:!refining,searchCompleted:true,
      completed:2,failed:0,outcomeUnknown:false,sourceCount:1,fallbackReason:'none',candidateOutcome:refining?'CANDIDATES_ACCEPTED':'NO_GENERATED_CANDIDATES',
      validation:{version:1,candidates:claims.length,accepted:claims.length,rejections:[],metadataRejections:[]},...(refining?{refinement:true}:{})};
    return Response.json({service:'mindling-reasoning-service',kind:'research-acquisition',acquisition:{...checkpoint.evidence,evaluation:{...empty,claims}},execution,sourceCheckpoint:checkpoint});
  };
  if(seed){
    const task=await engine.prepare(understandInput('Learn about Science','TEACH'),'science-fixture',{autonomous:true});
    const planned=await engine.patch(task.id,null,t=>{
      t.sourcePlan={request:engine.context(t,'Science'),queries:['scientific hypotheses'],available:true,sourceCategory:'web'};
      t.plan=['Find a cited definition'];t.planningCalls=1;t.modelCalls=1;
    });
    await engine.run(planned,'Science');
  }
  window.fixture={engine,db,app,task:()=>app.state.mind.learningTasks[0],render:()=>{
    const host=document.createElement('div');
    document.body.replaceChildren(host);
    renderTaskInspector(host,{task:fixture.task()},{onAction:(action,id)=>engine.act(action,id)});
  }};
  if(seed)fixture.render();
}"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    context = browser.new_context()
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE + "/") and "/api/" not in route.request.url else route.abort())
    for preview in (False, True):
        page = context.new_page()
        page.goto(BASE + "/tests/blank.html")
        page.evaluate(MOUNT, {"preview": preview, "seed": True})
        assert page.get_by_role("progressbar", name="Learning progress").count() == 1
        assert page.get_by_role("button", name="Cancel learning").count() == 1
        assert page.get_by_text("Re-evaluate saved sources").count() == 0
        assert page.get_by_text("Research will automatically check the saved sources", exact=False).count() == 1
        assert page.evaluate("fixture.task().evidenceRefinement.state==='QUEUED' && fixture.app.state.mind.memories.length===0")
        page.evaluate("fixture.engine.destroy();fixture.db.close()")
        page.reload()
        page.evaluate(MOUNT, {"preview": preview, "seed": False})
        page.evaluate("fixture.engine.tick()")
        page.wait_for_function("fixture.task().status==='COMPLETED'")
        assert page.evaluate("""()=>fixture.task().modelCalls===4&&fixture.task().sourceRequests===2
            &&fixture.app.state.mind.memories.length===1&&sessionStorage.getItem('research-acquire')==='1'
            &&sessionStorage.getItem('research-evaluate')==='1'""")
        page.evaluate("fixture.engine.destroy();fixture.db.close()")
        page.reload()
        page.evaluate(MOUNT, {"preview": preview, "seed": False})
        assert page.evaluate("fixture.task().evidenceRefinement.state==='COMPLETED' && fixture.app.state.mind.memories.length===1")
        page.evaluate("fixture.engine.destroy();fixture.db.close()")
        page.close()
        print(("Stage Preview" if preview else "Normal") + ": automatic refinement, no manual button, progress, cancel, durable receipt and memory passed", flush=True)
    context.close()
    browser.close()
