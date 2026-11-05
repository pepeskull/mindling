"""Offline worker + actual primary/preview IndexedDB; no external requests."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8765')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context()
    context.route('**/*',lambda r:r.fulfill(status=200,content_type='text/html',body='<title>Offline semantic test</title>') if r.request.url==BASE+'/__semantic_test_blank' else r.continue_() if r.request.url.startswith(BASE+'/') else r.abort())
    page=context.new_page()
    for preview in [False,True]:
        page.goto(BASE+'/__semantic_test_blank')
        print(page.evaluate('''async preview=>{
          const {MindlingDatabase}=await import('/src/storage/database.js'),{PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js'),{runSemantic}=await import('/src/semantic/model-worker.js'),{decodeSemanticWire}=await import('/src/semantic/model-wire.js'),{graphData}=await import('/src/memory/graph-data.js');
          const check=(v,m)=>{if(!v)throw Error(m)},digest=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),v=>v.toString(16).padStart(2,'0')).join('');
          let db=await(preview?new PreviewStore():new MindlingDatabase()).open();
          const write=(fn,options)=>preview?db.change(fn,options):db.changeGameplay(fn,options),read=async()=>preview?db.read():(await db.get('gameplay','primary')).state;
          const teach='Gravity keeps planets in orbit around the Sun.',research="Gravity steers a planet's motion; its sideways motion keeps it from falling straight into the Sun.",hash=await digest(research),id=preview?'preview-bounded':'primary-bounded';
          let state=await write(()=>{const s=newMindling(createSandbox(),{confirmed:true,id});s.mind.memories=[{id:'teach',content:teach,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:teach.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},category:'Astronomy',relatedMemoryIds:[]},{id:'research',content:research,source:'AUTONOMOUS',category:'Astronomy',research:{sourceHash:hash,quoteHash:hash,sourceURL:'https://example.org/offline',observedAt:0},relatedMemoryIds:[]}];s.mind.learningTasks=[{id:'task',status:'COMPLETED',knowledgeIds:['research'],modelCalls:3}];return s;});
          await db.saveResearchPermissions(id,{enabled:true});let calls=0;
          const priorFetch=fetch;globalThis.fetch=async(url,options)=>{check(url==='/api/mindling/reason','unexpected network');calls++;const {id,context}=JSON.parse(options.body);const result=decodeSemanticWire({version:1,relationships:[{pair:0,reverse:false,type:'complements',evidenceA:{first:0,last:0},evidenceB:{first:0,last:0},assessment:{support:'supported',reason:'Mock complementary orbital descriptions.',qualifications:[],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}]},context);return Response.json({service:'mindling-reasoning-service',id,result});};
          const engine={app:{get state(){return state;}},session:'local',abort:new AbortController(),loadPermissions:()=>db.researchPermissions(id),grant:p=>({mindlingId:id,capability:p.capability,revision:p.revision}),assertLive(value){check(value===id,'wrong identity')},async patch(taskId,run,fn,options){state=await write(s=>{fn(s.mind.learningTasks[0],s);return s;},options);}};
          const before={energy:JSON.stringify(state.mind.energy),xp:state.mind.lifetimeXP,provenance:JSON.stringify(state.mind.memories.map(m=>[m.content,m.research]))};
          await runSemantic(engine,state.mind.learningTasks[0]);check(calls===1,'semantic call count');check(state.mind.learningTasks[0].semanticAnalysis.persisted===1,'not persisted');
          db.close();db=await(preview?new PreviewStore():new MindlingDatabase()).open();state=await read();
          check(state.mind.memories[0].relatedMemoryIds.includes('research')&&state.mind.memories[1].relatedMemoryIds.includes('teach'),'reciprocal reload');check(graphData(state.mind).stats.associations===1,'projection missing');
          await runSemantic(engine,state.mind.learningTasks[0]);check(calls===1,'duplicate call after reload');check(before.energy===JSON.stringify(state.mind.energy)&&before.xp===state.mind.lifetimeXP,'gameplay mutation');check(before.provenance===JSON.stringify(state.mind.memories.map(m=>[m.content,m.research])),'source mutation');
          if(preview){const primary=await new MindlingDatabase().open();check((await primary.get('gameplay','primary')).state.mind.id==='primary-bounded','preview changed primary identity');primary.close();}
          globalThis.fetch=priorFetch;db.close();return 'PASS '+(preview?'Stage Preview':'normal app')+': atomic worker persistence, reciprocal reload, graph projection, isolated store, no duplicate inference, unchanged XP/Energy/provenance';
        }''',preview),flush=True)
    browser.close()
