from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context();calls=[]
 def route(r):
  if '/api/' in r.request.url:
   calls.append(r.request.url);r.abort()
  elif r.request.url.startswith('http://127.0.0.1:8771/'):r.continue_()
  else:r.abort()
 c.route('**/*',route)
 page=c.new_page();page.goto('http://127.0.0.1:8771/tests/blank.html')
 print(page.evaluate("""async()=>{
  const {MindlingDatabase}=await import('/src/storage/database.js'),{PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {newMindling,createSandbox}=await import('/src/preview/sandbox/engine.js');
  const {AutonomousLearningEngine}=await import('/src/autonomous/learning-engine.js');
  const {understandInput}=await import('/src/learning/input-understanding.js');
  const {renderTaskInspector}=await import('/src/autonomous/task-inspector.js');
  const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');
  for(const preview of [false,true]){
   let store=await (preview?new PreviewStore():new MindlingDatabase()).open();
   const read=async()=>preview?store.read():(await store.get('gameplay','primary')).state;
   const write=(f,o)=>preview?store.change(f,o):store.changeGameplay(f,o);
   const identity=preview?'hypothesis-preview':'hypothesis-normal';
   await write(()=>newMindling(createSandbox(),{id:identity,confirmed:true}));
   const app={store,state:await read(),renderState(){},async change(f,o){this.state=await write(f,o);}};
   const engine=new AutonomousLearningEngine(app);await engine.loadPermissions();
   const task=await engine.prepare(understandInput('Learn about Gaming','TEACH'),'offline-request');
   await engine.patch(task.id,null,item=>{item.hypotheses=[{id:'h1',claim:identity+' unverified claim.',status:'unverified',relationship:null}];});
   engine.destroy();store.close();store=await(preview?new PreviewStore():new MindlingDatabase()).open();
   const saved=await read();if(saved.mind.id!==identity||saved.mind.learningTasks[0].hypotheses[0].claim!==identity+' unverified claim.'||saved.mind.memories.length)throw Error('Isolation or hypothesis persistence failed');
   const host=document.createElement('div');document.body.append(host);renderTaskInspector(host,{task:saved.mind.learningTasks[0]});
   if(!host.textContent.includes('Unverified proposal'))throw Error('Hypothesis shown as fact');host.remove();
   const root=document.createElement('div');document.body.append(root);const view=new NeuralMemoryView(root);view.update(saved.mind);view.setVisible(true);await new Promise(r=>setTimeout(r,20));view.destroy();root.remove();store.close();
  }
  const db=await new MindlingDatabase().open();if((await db.get('gameplay','primary')).state.mind.id!=='hypothesis-normal')throw Error('Preview overwrote normal identity');db.close();
  return 'Normal/Stage Preview IndexedDB hypotheses isolated; inspector unverified; graph opens without inference.';
 }"""))
 assert calls==[],calls
 c.close();b.close()
