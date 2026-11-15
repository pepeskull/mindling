"""Mock proposals through actual isolated IndexedDB transactions; all API calls blocked."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8785')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context()
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  # Test-only client build override. The checked-in production flag stays false.
  context.route('**/src/semantic/parent-discovery.js',lambda r:r.fulfill(content_type='application/javascript',body=Path('src/semantic/parent-discovery.js').read_text().replace('PARENT_DISCOVERY_ENABLED=false','PARENT_DISCOVERY_ENABLED=true')))
  page=context.new_page();page.goto(BASE+'/tests/blank.html')
  expected=page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js');
   const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {discoveryContext,validateParents,persistParents,PARENT_DISCOVERY_ENABLED}=await import('/src/semantic/parent-discovery.js');
   const {semanticCandidates}=await import('/src/semantic/model-contract.js');const {graphData,layoutGraph}=await import('/src/memory/graph-data.js');
   const check=(v,m)=>{if(!v)throw Error(m);};check(PARENT_DISCOVERY_ENABLED,'test-only build override');
   const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
   const read=()=>preview?db.read():db.get('gameplay','primary').then(r=>r.state),write=(fn,options)=>preview?db.change(fn,options):db.changeGameplay(fn,options);
   const mem=(id,category,content)=>({id,categoryId:id,category,content,source:'SERVICE',analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},contentIntegrity:{version:1,status:'captured',length:content.length}});
   await write(()=>{const state=newMindling(createSandbox(),{id:'parent-test-'+preview,confirmed:true});state.mind.categories=[];state.mind.learningTasks=[{id:'task',status:'COMPLETED',knowledgeIds:['h'],modelCalls:3}];state.mind.memories=[mem('h','Ice hockey','Ice hockey is a sport.'),mem('f','Association football','Association football is a sport.')];return state;});
   const state=await read(),before=JSON.stringify(state.mind.memories),ctx=discoveryContext(state.mind,semanticCandidates(state.mind,['h'],{includeAreaReconsideration:true}));
   const proposal={name:'Sport',meaning:'Physical competitive activity.',reuseCategoryId:null,children:ctx.areas.map(a=>({areaId:a.id,pair:0,side:ctx.pairs[0].a.id===a.memoryIds[0]?'a':'b',first:0,last:0,support:'supported',scopePreserved:true,reason:'Mock assessment of explicit fixture claim.'}))};
   const accepted=validateParents([proposal],ctx).accepted;check(accepted.length===1,'proposal');
   try{await write(s=>{persistParents(s.mind,accepted,ctx);throw Error('rollback');});}catch{}
   check(JSON.stringify((await read()).mind)===JSON.stringify(state.mind),'atomic rollback');
   const {runSemantic}=await import('/src/semantic/model-worker.js'),{decodeSemanticWire}=await import('/src/semantic/model-wire.js');
   const identity=state.mind.id;await db.saveResearchPermissions(identity,{enabled:true});let current=await read(),calls=0;
   const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{check(url==='/api/mindling/reason','unexpected request');calls++;const body=JSON.parse(options.body);return Response.json({service:'mindling-reasoning-service',id:body.id,result:decodeSemanticWire({version:1,relationships:[],areaRelationships:[],parentCategories:[proposal]},body.context)});};
   const engine={app:{get state(){return current;}},session:'parent-offline',abort:new AbortController(),loadPermissions:()=>db.researchPermissions(identity),grant:p=>({mindlingId:identity,capability:p.capability,revision:p.revision}),assertLive:id=>check(id===identity,'identity'),async patch(id,run,fn,options){current=await write(s=>{fn(s.mind.learningTasks[0],s);return s;},options);}};
   await runSemantic(engine,current.mind.learningTasks[0]);check(current.mind.learningTasks[0].semanticParentAnalysis?.outcomes[0]==='PARENT_PERSISTED','worker parent persistence');
   await runSemantic(engine,current.mind.learningTasks[0]);check(calls===1&&current.mind.learningTasks[0].modelCalls===4,'duplicate/budget');globalThis.fetch=originalFetch;
   const after=await read(),graph=graphData(after.mind),parent=graph.areas.find(a=>a.label==='Sport');
   check(parent&&parent.memoryIds.length===0&&parent.childIds.length===2,'empty parent projection');
   check(layoutGraph(graph).nodes.filter(n=>n.kind==='area').length===1,'separate large child root');
   check(JSON.stringify(after.mind.memories)===before,'canonical changed');
   check(graph.areas.every(a=>a.label!==a.id&&a.label!==a.categoryId),'internal label');
   check(JSON.stringify(after.mind.pathways)===JSON.stringify(state.mind.pathways)&&after.mind.lifetimeXP===state.mind.lifetimeXP,'progression');
   const result=JSON.stringify(after.mind);db.close();return result;
  }''',preview)
  page.reload()
  actual=page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const state=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return JSON.stringify(state.mind);}''',preview)
  assert actual==expected
  print(('Preview' if preview else 'Normal')+': parent discovery, rollback, stable identity, projection and durable reload PASS',flush=True)
  context.close()
 browser.close()
