"""Offline actual Network DOM/renderers with separate normal and Preview stores."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for preview in [False,True]:
  context=browser.new_context(viewport={'width':1500,'height':1000},device_scale_factor=2)
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();errors=[];api=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:api.append(r.url) if '/api/' in r.url else None)
  page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  print(page.evaluate('''async preview=>{
   const {NetworkView}=await import('/src/network/network-view.js');const {PreviewStore}=await import('/src/preview/sandbox/storage.js');const {MindlingDatabase}=await import('/src/storage/database.js');const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=fn=>preview?db.change(fn):db.changeGameplay(fn);
   const s=newMindling(createSandbox(Date.now()),{confirmed:true,id:'playback-'+preview});s.mind.memories=Array.from({length:43},(_,i)=>({id:'memory-'+i,content:`Synthetic offline retained observation ${i}.`,categoryId:'area-'+i%6,category:'Area '+i%6,source:i%5===3?'AUTONOMOUS':'SERVICE',analysis:i%5<3?{activity:['TALK','TEACH','DEEP_TRAINING'][i%5]}:undefined,relatedMemoryIds:i<4?['memory-'+(i+1)]:[]}));await write(()=>s);
   document.querySelectorAll('.installation,.onboarding-overlay').forEach(e=>e.remove());document.querySelector('.dashboard-chrome').classList.remove('is-hidden');document.querySelector('#app').classList.add('network-mode');const root=document.querySelector('#network-view');root.hidden=false;
   window.now=1800000000000;window.view=new NetworkView(root,{clock:()=>now});view.update((await read()).mind);view.setVisible(true);window.before=JSON.stringify(await read());window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
   check(root.querySelectorAll('.network-panel').length===3&&!root.querySelector('button,select,input'),'layout changed');check(getComputedStyle(root.querySelector('.network-cloud-plot')).backgroundImage==='none','cloud gradient');check(getComputedStyle(root.querySelector('.network-cloud-plot')).backgroundColor==='rgba(0, 0, 0, 0)','opaque cloud');
   for(let i=0;i<20;i++){now+=250;view.draw();}check(view.brain.playback.active().length===5,'five memory overlap');check(view.visualValues.some(v=>v>0)&&view.currentValues.every(v=>v===0),'combined bars or event isolation');check(view.model.events.length===0,'fake operation');check(view.spectrum.gl&&!view.spectrum.lost&&view.spectrum.gl.getError()===0,'WebGL2');check(view.spectrum.colors.some(v=>v>0),'area colors');check(view.dpr===2,'high DPI');
   const count=view.brain.playback.cursor;await write(s=>{s.mind.memories.push({id:'new-memory',content:'Synthetic new retained observation.',category:'New area'});return s;});view.update((await read()).mind);check(view.brain.playback.pending.length===44&&view.brain.playback.cursor===count,'update reset sequence');window.before=JSON.stringify(await read());
   view.ingest({id:'new-memory',phase:'accepted',activity:'TEACH'});check(!view.ingest({id:'new-memory',phase:'accepted',activity:'TEACH'}),'duplicate event');now+=200;view.draw();check(view.model.events.length===1,'duplicate from canonical update');
   const frozen=view.brain.playback.time;view.setVisible(false);now+=100000;check(view.frame===null,'hidden RAF');view.setVisible(true);check(view.brain.playback.time===frozen,'hidden catchup');
   Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));const hidden=view.brain.playback.time;now+=100000;check(view.frame===null,'document hidden RAF');Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));check(view.brain.playback.time===hidden,'hidden document catchup');delete document.hidden;
   view.spectrum.lost=true;view.draw();check(!view.spectrum.fallback.hidden&&view.spectrum.canvas.hidden,'Canvas fallback');check(view.spectrum.ctx.getImageData(0,0,view.spectrum.fallback.width,view.spectrum.fallback.height).data.some((v,i)=>i%4===3&&v>0),'fallback blank');view.spectrum.lost=false;view.draw();check(!view.spectrum.canvas.hidden,'GL resume');
   check(JSON.stringify(await read())===before,'visualization wrote data');return `${preview?'Preview':'Normal'}: concurrent playback, bars, real activity, updates, pause, WebGL2 and Canvas passed`;
  }''',preview))
  page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80)
  assert page.evaluate('''()=>{const t=view.brain.playback.time;now+=90000;view.sync();return view.frame===null&&view.brain.playback.time===t;}''')
  page.emulate_media(reduced_motion='no-preference');page.wait_for_timeout(80)
  page.wait_for_function('!view.reduced.matches && view.frame!==null')
  assert page.evaluate('''async()=>{view.destroy();const ok=view.frame===null&&view.root.children.length===0&&JSON.stringify(await read())===before;db.close();return ok;}''')
  page.reload()
  assert page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{BrainStateModel}=await import('/src/network/brain-state-model.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const state=preview?await db.read():(await db.get('gameplay','primary')).state;const b=new BrainStateModel();b.update(state.mind);db.close();return b.playback.pending.length===44&&b.playback.links.length===4&&b.playback.advance(0).length===1;}''',preview)
  assert not errors,errors
  assert not api,api
  context.close()
 browser.close()
