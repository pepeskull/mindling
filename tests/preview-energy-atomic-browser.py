"""Approved Stage Preview Energy and atomic-memory regressions. Real IndexedDB/UI;
all model responses mocked, no paid API calls. Run against the static server.
"""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    page=context.new_page()
    page.route('**/js/bootstrap.js',lambda route:route.fulfill(body='',content_type='application/javascript'))
    page.route('https://cdn.jsdelivr.net/**',lambda route:route.abort())
    page.goto(os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000')+'/?stage-preview=1')
    result=page.evaluate('''async()=>{
      const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
      const {createSandbox,newMindling,learn}=await import('/src/preview/sandbox/engine.js');
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
      const {MindlingDatabase,databaseConfig}=await import('/src/storage/database.js');
      const {atomicStatements}=await import('/src/preview/sandbox/atomic-memory.js');
      const check=(condition,message)=>{if(!condition)throw Error(message);};
      const ORIGINAL='Jag heter Alex och mitt favoritprogrammeringsspråk är JavaScript.';
      const DUPLICATE='Mitt favoritprogrammeringsspråk är JavaScript.';
      const CHANGE='Jag har ändrat mig. Mitt favoritprogrammeringsspråk är nu Python istället för JavaScript.';
      const LEGACY='313332f9-15d6-44c9-aaae-40974e871ab5';
      const CATEGORY='category-234465f8-58ff-4ac6-92d6-ac4d7e595f87';
      const fresh=()=>{const s=newMindling(createSandbox(),{confirmed:true,id:crypto.randomUUID()});s.mind.categories=[{id:CATEGORY,name:'personal profile'}];return s;};
      const d=extra=>({version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'Player knowledge',category:'personal profile',categoryId:CATEGORY,topic:'player knowledge',relatedMemoryId:'',confidence:.99,...extra});
      const batch=(text,decisions)=>({version:3,operations:atomicStatements(text).map((_,statement)=>({statement,targetPart:-1,decision:decisions[statement]}))});
      const legacy=()=>{const s=fresh();s.mind.memories=[{id:LEGACY,content:ORIGINAL,concept:'Player profile',category:'personal profile',categoryId:CATEGORY,topic:'name and programming preference',createdAt:'2026-01-01T00:00:00.000Z',strength:.3,activations:1,neuronIds:['origin',s.mind.synapses[0].to],synapseIds:[s.mind.synapses[0].id],relatedMemoryIds:[],intelligence:{kind:'claim',certainty:'asserted',current:true}}];return s;};
      const production=await new MindlingDatabase().open();await production.put('mindling',{id:'primary',name:'Protected production identity'});
      const snapshot=async db=>{const result={};for(const name of databaseConfig.stores)result[name]=await db.getAll(name);return JSON.stringify(result);};
      const productionBefore=await snapshot(production);
      const c=new SandboxPreview({forceCanvas:true});await c.start();await c.change(()=>fresh());
      const originalFetch=globalThis.fetch;let output,calls=0;
      globalThis.fetch=async(url)=>{check(url==='/api/mindling/learn','Unexpected external request');calls++;if(output instanceof Error)throw output;return new Response(JSON.stringify({service:'mindling-learning-service',assessment:output}),{status:200,headers:{'Content-Type':'application/json'}});};
      const energy=async expected=>{
        const saved=await c.store.read();check(saved.mind.energy.remaining===expected,'Persisted Energy mismatch');
        check(c.state.mind.energy.remaining===expected,'Controller Energy mismatch');
        check(document.querySelector('[data-energy-value]').textContent===`${expected} / 10`,'Displayed Energy mismatch');
      };
      const submit=async(text,mode)=>{
        c.setActivity(mode);const input=document.querySelector('#mindling-input'),button=document.querySelector('#interaction-form button[type=submit]');
        check(!input.disabled&&!button.disabled,'Free submission disabled');input.value=text;button.click();
        while(c.busy)await new Promise(resolve=>setTimeout(resolve,5));
      };
      output=batch(ORIGINAL,[d({}),d({kind:'preference'})]);await submit(ORIGINAL,'TEACH');await energy(8);
      check(c.state.mind.memories.length===2&&c.state.mind.lifetimeXP===50,'Compound input was not atomic with one XP reward');
      check(c.state.mind.memories.some(m=>m.content==='Jag heter Alex'),'Name lost');
      for(const mode of ['TALK','TEACH','DEEP_TRAINING']){await submit(DUPLICATE,mode);await energy(8);}
      check(c.state.mind.memories.length===2&&c.state.mind.lifetimeXP===50,'Duplicate created memory/XP');
      await c.change(s=>{s.mind.energy.remaining=0;return s;});
      const noCalls=calls;
      for(const mode of ['TALK','TEACH','DEEP_TRAINING']){await submit(DUPLICATE,mode);await energy(0);}
      check(calls===noCalls,'Exact duplicate called a model');
      check(document.querySelector('[data-sandbox-status]').textContent.includes('No Energy spent'),'Free duplicate UI message missing');
      await c.change(()=>legacy());
      output=batch(CHANGE,[d({operation:'NO_MEMORY_CHANGE'}),d({relationship:'UPDATED_MEMORY',operation:'UPDATE_EXISTING',kind:'preference',relatedMemoryId:LEGACY})]);output.operations[1].targetPart=1;
      await submit(CHANGE,'TEACH');await energy(8);
      let saved=await c.store.read();check(saved.mind.memories.length===3&&saved.mind.lifetimeXP===60,'Legacy compound update failed');
      check(saved.mind.memories.find(m=>m.id===LEGACY).content===ORIGINAL,'Original legacy ID/content destroyed');
      check(saved.mind.memories.some(m=>m.parentMemoryId===LEGACY&&m.content==='Jag heter Alex'),'Unrelated name overwritten');
      check(saved.mind.memories.some(m=>m.intelligence?.kind==='preference'&&m.valueHistory?.some(v=>v.content.includes('JavaScript'))),'Historical preference missing');
      const memoryText=document.querySelector('.knowledge-area-list').textContent;check(memoryText.includes('Python')&&memoryText.includes('Previous value')&&memoryText.includes('Historical'),'History/current status absent from UI');
      output=batch('Jag tycker om finans',[d({kind:'preference',concept:'Enjoys finance',topic:'finance interest',confidence:.9})]);
      await submit('Jag tycker om finans','TEACH');await energy(6);check(c.state.mind.lifetimeXP===110,'Finance XP changed');
      const finance=c.state.mind.memories.find(m=>m.content==='Jag tycker om finans');check(finance.strength===.3&&finance.activations===1&&finance.categoryId===CATEGORY,'Finance preference regression');
      // A database write failure aborts the full multi-memory update, including resources/neural changes.
      await c.change(()=>legacy());const before=await c.store.read(),put=IDBObjectStore.prototype.put;
      output=batch(CHANGE,[d({operation:'NO_MEMORY_CHANGE'}),d({relationship:'UPDATED_MEMORY',operation:'UPDATE_EXISTING',kind:'preference',relatedMemoryId:LEGACY})]);output.operations[1].targetPart=1;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='sandbox')throw new DOMException('synthetic write failure','QuotaExceededError');return put.apply(this,args);};
      try{let failed=false;try{await c.store.change(s=>learn(s,{id:'rollback',text:CHANGE,assessment:output}));}catch{failed=true;}check(failed,'Write failure not propagated');}finally{IDBObjectStore.prototype.put=put;}
      check(JSON.stringify(await c.store.read())===JSON.stringify(before),'Failed transaction partially decomposed or charged');await energy(10);
      // Actual DOM submission with a model failure or invalid assessment preserves displayed/persisted resources.
      output=Error('synthetic model failure');await submit('Jag tycker om ekonomi','TEACH');await energy(10);
      output={version:3,operations:[]};await submit('Jag tycker om ekonomi','TEACH');await energy(10);check((await c.store.read()).mind.memories.length===1,'Invalid response mutated memories');
      // Two independent IndexedDB connections cannot duplicate rewards on successful redelivery.
      const other=await new PreviewStore().open();const assessment=batch(ORIGINAL,[d({}),d({kind:'preference'})]);
      await c.change(()=>fresh());
      const results=await Promise.allSettled([c.store.change(s=>learn(s,{id:'concurrent',text:ORIGINAL,assessment})),other.change(s=>learn(s,{id:'concurrent',text:ORIGINAL,assessment}))]);
      check(results.filter(r=>r.status==='fulfilled').length===1,'Concurrent replay committed twice');
      await c.change(s=>s);await energy(8);check(c.state.mind.lifetimeXP===50&&c.state.mind.memories.length===2,'Replay doubled XP/memory');
      // Different IDs for the same assessment also cannot create duplicate atoms/rewards.
      const identical=await Promise.allSettled([c.store.change(s=>learn(s,{id:'again-1',text:ORIGINAL,assessment})),other.change(s=>learn(s,{id:'again-2',text:ORIGINAL,assessment}))]);
      check(identical.every(r=>r.status==='rejected'),'Existing atoms recreated under a new request ID');
      // Insufficient Energy never leaves children or mutated nodes, even after legacy decomposition was computed.
      await c.change(()=>{const s=legacy();s.mind.energy.remaining=1;return s;});const low=await c.store.read();
      const updateAssessment=batch(CHANGE,[d({operation:'NO_MEMORY_CHANGE'}),d({relationship:'UPDATED_MEMORY',operation:'UPDATE_EXISTING',kind:'preference',relatedMemoryId:LEGACY})]);updateAssessment.operations[1].targetPart=1;
      let denied=false;try{await other.change(s=>learn(s,{id:'insufficient',text:CHANGE,assessment:updateAssessment}));}catch(e){denied=e.message.includes('Energy');}
      check(denied&&JSON.stringify(await c.store.read())===JSON.stringify(low),'Insufficient Energy partially committed');await energy(1);
      // A delayed assessment is rejected by the real controller after another tab changes its target.
      await c.change(()=>legacy());let release,notify;const reached=new Promise(resolve=>notify=resolve);
      globalThis.fetch=()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({service:'mindling-learning-service',assessment:updateAssessment}),{status:200}));notify();});
      document.querySelector('#mindling-input').value=CHANGE;const pending=c.submitLearning();await reached;
      await other.change(s=>{s.mind.memories[0].content='Jag heter Alex och mitt favoritprogrammeringsspråk är Rust.';return s;});const concurrentBefore=JSON.stringify(await other.read());release();
      let stale=false;try{await pending;}catch(e){stale=e.message.includes('Relevant memories changed');}
      check(stale&&JSON.stringify(await other.read())===concurrentBefore,'Stale response charged or overwrote state');
      check(await snapshot(production)===productionBefore,'Production IndexedDB changed');
      other.close();production.close();globalThis.fetch=originalFetch;c.destroy();
      return 'PASS real UI + IndexedDB: four reported cases, free duplicates in all modes/at zero, history/name preservation, rollback, replay, two connections, insufficient Energy, stale assessments and production isolation';
    }''')
    print(result,flush=True)
    # Two actual tabs release their transactions together through BroadcastChannel.
    second=page.context.new_page()
    second.route('**/js/bootstrap.js',lambda route:route.fulfill(body='',content_type='application/javascript'))
    second.goto(os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8000'))
    page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const db=await new PreviewStore().open();await db.change(()=>{const s=newMindling(createSandbox(),{confirmed:true});s.mind.energy.remaining=2;return s;});db.close();}''')
    arm='''async()=>{
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {learn}=await import('/src/preview/sandbox/engine.js');const db=await new PreviewStore().open();
      const decision={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'profile',category:'personal profile',categoryId:'',topic:'profile',relatedMemoryId:'',confidence:.99};
      const assessment={version:3,operations:[{statement:0,targetPart:-1,decision},{statement:1,targetPart:-1,decision:{...decision,kind:'preference'}}]};
      const channel=new BroadcastChannel('mindling-energy-regression');
      window.__tabWork=new Promise(resolve=>{const timeout=setTimeout(()=>resolve({timeout:true}),5000);channel.onmessage=async()=>{channel.onmessage=null;try{await db.change(s=>learn(s,{id:'two-tab-race',text:'Jag heter Alex och mitt favoritprogrammeringsspråk är JavaScript.',assessment}));resolve({committed:true});}catch{resolve({committed:false});}finally{clearTimeout(timeout);channel.close();db.close();}};});
    }'''
    page.evaluate(arm)
    second.evaluate(arm)
    page.evaluate("()=>{const sender=new BroadcastChannel('mindling-energy-regression');sender.postMessage('go');sender.close();}")
    results=[page.evaluate('()=>window.__tabWork'),second.evaluate('()=>window.__tabWork')]
    assert sum(result.get('committed',False) for result in results)==1,results
    assert not any(result.get('timeout') for result in results),results
    final=page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return {energy:s.mind.energy.remaining,xp:s.mind.lifetimeXP,memories:s.mind.memories.length,events:s.mind.history.length};}''')
    assert final=={'energy':0,'xp':50,'memories':2,'events':1},final
    print('PASS two real tabs: concurrent atomic submission commits exactly once, Energy 0, XP 50, two atoms, one event',flush=True)
    # Distinct funded requests race too: only one can spend the final two Energy.
    page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');const db=await new PreviewStore().open();await db.change(()=>{const s=newMindling(createSandbox(),{confirmed:true});s.mind.energy.remaining=2;return s;});db.close();}''')
    arm_distinct='''async text=>{
      const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {learn}=await import('/src/preview/sandbox/engine.js');const db=await new PreviewStore().open();
      const decision={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'preference',certainty:'asserted',concept:'interest',category:'personal profile',categoryId:'',topic:'interest',relatedMemoryId:'',confidence:.99};
      const assessment={version:3,operations:[{statement:0,targetPart:-1,decision}]},id=crypto.randomUUID();
      const channel=new BroadcastChannel('mindling-distinct-energy-regression');
      window.__tabWork=new Promise(resolve=>{const timeout=setTimeout(()=>resolve({timeout:true}),5000);channel.onmessage=async()=>{channel.onmessage=null;try{await db.change(s=>learn(s,{id,text,assessment}));resolve({committed:true});}catch(e){resolve({committed:false,insufficient:e.message.includes('Energy')});}finally{clearTimeout(timeout);channel.close();db.close();}};});
    }'''
    page.evaluate(arm_distinct,'Jag tycker om finans')
    second.evaluate(arm_distinct,'Jag tycker om musik')
    page.evaluate("()=>{const sender=new BroadcastChannel('mindling-distinct-energy-regression');sender.postMessage('go');sender.close();}")
    results=[page.evaluate('()=>window.__tabWork'),second.evaluate('()=>window.__tabWork')]
    assert sum(result.get('committed',False) for result in results)==1 and sum(result.get('insufficient',False) for result in results)==1,results
    final=page.evaluate('''async()=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const db=await new PreviewStore().open();const s=await db.read();db.close();return {energy:s.mind.energy.remaining,xp:s.mind.lifetimeXP,memories:s.mind.memories.length,events:s.mind.history.length};}''')
    assert final=={'energy':0,'xp':50,'memories':1,'events':1},final
    print('PASS two real tabs with distinct IDs/inputs: final two Energy fund one commit only; no negative balance or partial memory/reward',flush=True)
    browser.close()
