"""New synthetic pipeline tests using real Chromium IndexedDB; no paid API calls."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    page.route('**/js/bootstrap.js',lambda route:route.fulfill(body='',content_type='application/javascript'))
    page.goto(os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000'))
    result=page.evaluate('''async()=>{
      const {PreviewStore,PREVIEW_DB}=await import('/src/preview/sandbox/storage.js');
      const {createSandbox,newMindling,learn}=await import('/src/preview/sandbox/engine.js');
      const {requestLearningAssessment}=await import('/src/preview/sandbox/learning-service.js');
      const {learningContext}=await import('/src/preview/sandbox/learning-assessment.js');
      const check=(value,message)=>{if(!value)throw Error(message);};
      const store=await new PreviewStore().open();
      await store.change(()=>newMindling(createSandbox(),{confirmed:true,id:'transaction-test'}));
      const text='Neurons communicate using chemical signals through synapses.';
      const decision={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'neural signals',category:'Science',categoryId:'',topic:'neurons',relatedMemoryId:'',confidence:.95};
      const initial=JSON.stringify(await store.read());
      // Transport failure is outside the transaction and cannot charge or award anything.
      try{await requestLearningAssessment(text,(await store.read()).mind,{fetcher:async()=>{throw Error('network');}});throw Error('expected transport error');}catch(e){check(e.message.includes('No Energy or XP changed'),'neutral failure');}
      check(JSON.stringify(await store.read())===initial,'transport failure changed IndexedDB');
      // A reducer that fails after computing mutations must abort the whole transaction.
      try{await store.change(s=>{learn(s,{id:'aborted',text,assessment:decision});throw Error('forced rollback');});throw Error('missing abort');}catch(e){check(e.message==='forced rollback','unexpected abort');}
      check(JSON.stringify(await store.read())===initial,'reducer rollback lost state');
      const put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic quota','QuotaExceededError');};
      try{await store.change(s=>learn(s,{id:'quota',text,assessment:decision}));throw Error('missing quota');}catch(e){check(e.name==='QuotaExceededError','wrong quota error');}finally{IDBObjectStore.prototype.put=put;}
      check(JSON.stringify(await store.read())===initial,'failed write changed memory, Energy or XP');
      // Concurrent delivery of the same successful event commits exactly once.
      const results=await Promise.allSettled([store.change(s=>learn(s,{id:'once',text,assessment:decision})),store.change(s=>learn(s,{id:'once',text,assessment:decision}))]);
      check(results.filter(r=>r.status==='fulfilled').length===1,'replay accepted twice');
      let saved=await store.read();check(saved.mind.memories.length===1&&saved.mind.energy.remaining===8&&saved.mind.lifetimeXP===50,'non-atomic successful event');
      // Stale decisions must be revalidated against transaction-time candidates.
      const prior=JSON.stringify(learningContext(text,saved.mind));
      await store.change(s=>{s.mind.memories[0].content='A different current claim about neural signals.';return s;});
      const beforeStale=JSON.stringify(await store.read());
      try{await store.change(s=>{if(JSON.stringify(learningContext(text,s.mind))!==prior)throw Error('stale context');return learn(s,{id:'stale',text,assessment:decision});});throw Error('missing stale guard');}catch(e){check(e.message==='stale context','wrong stale error');}
      check(JSON.stringify(await store.read())===beforeStale,'stale decision mutated data');
      const databases=await indexedDB.databases();check(databases.some(db=>db.name===PREVIEW_DB)&&!databases.some(db=>db.name==='mindling-db'),'production database accessed');
      store.close();const reopened=await new PreviewStore().open();saved=await reopened.read();check(saved.mind.processed.includes('once'),'committed state did not persist');reopened.close();
      return 'PASS real IndexedDB: transport failure, reducer abort, quota failure, concurrent replay, atomic Energy/XP, stale context, reload and production isolation';
    }''')
    print(result,flush=True)
    page.route('https://cdn.jsdelivr.net/**',lambda route:route.abort())
    page.goto(os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000')+'/?stage-preview=1')
    print(page.evaluate('''async()=>{
      const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
      const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
      const check=(v,m)=>{if(!v)throw Error(m);};
      const c=new SandboxPreview({forceCanvas:true});await c.start();
      await c.change(()=>newMindling(createSandbox(),{confirmed:true,id:'controller-test'}));c.setActivity('TEACH');
      const decision={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'preference',certainty:'asserted',concept:'interface preference',category:'Preferences',categoryId:'',topic:'interfaces',relatedMemoryId:'',confidence:.95};
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async()=>new Response(JSON.stringify({service:'mindling-learning-service',assessment:decision}),{status:200,headers:{'Content-Type':'application/json'}});
      const input=document.querySelector('#mindling-input');input.value='I prefer dark interfaces.';await c.submitLearning();
      const id=c.state.mind.memories[0].id;
      Object.assign(decision,{relationship:'UPDATED_MEMORY',operation:'UPDATE_EXISTING',relatedMemoryId:id});
      input.value='I prefer light interfaces now.';await c.submitLearning();
      check(c.state.mind.memories.length===1&&c.state.mind.memories[0].id===id,'controller lost stable memory ID');
      document.querySelector('[data-view=memories]').click();await new Promise(r=>setTimeout(r,40));document.querySelector('.memory-browser').open=true;document.querySelector('.memory-browser [data-select-memory]').click();
      check(document.querySelector('.memory-inspector-content').textContent.includes('I prefer dark interfaces.'),'previous value absent from Memory inspector');
      check(!document.querySelector('.memory-inspector-content').textContent.includes('Native lexical organization'),'external analysis presented as local');
      document.querySelector('[data-close-memory]').click();
      const before=c.state.mind.energy.remaining,xp=c.state.mind.lifetimeXP;
      Object.assign(decision,{operation:'ASK_FOR_CLARIFICATION',relationship:'NEW_MEMORY',responseAction:'CLARIFY',relatedMemoryId:''});
      input.value='I prefer that other option.';await c.submitLearning();
      check(c.state.mind.energy.remaining===before&&c.state.mind.lifetimeXP===xp,'clarification charged resources');
      check(document.querySelector('[data-sandbox-status]').textContent.includes('clarify'),'clarification response absent');
      let release,notify;const reached=new Promise(resolve=>notify=resolve);
      globalThis.fetch=()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({service:'mindling-learning-service',assessment:{...decision,operation:'UPDATE_EXISTING',relationship:'UPDATED_MEMORY',responseAction:'ACKNOWLEDGE',relatedMemoryId:id}}),{status:200}));notify();});
      input.value='I prefer blue interfaces now.';const pending=c.submitLearning();await reached;
      const other=await new PreviewStore().open();await other.change(s=>{s.mind.memories[0].content='I prefer green interfaces now.';return s;});other.close();release();
      let rejected=false;try{await pending;}catch(e){rejected=e.message.includes('Relevant memories changed');}
      check(rejected,'controller accepted stale model decision');
      const saved=await c.store.read();check(saved.mind.memories[0].content==='I prefer green interfaces now.'&&saved.mind.energy.remaining===before&&saved.mind.lifetimeXP===xp,'stale response changed committed state');
      globalThis.fetch=originalFetch;c.destroy();
      return 'PASS actual sandbox controller: v2 creation/update, stable IDs/history UI, privacy, clarification and stale cross-tab response rejection';
    }'''),flush=True)
    browser.close()
