"""Dynamic decisions, atomic store rollback and reload, with all network calls blocked."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('MINDLING_TEST_URL','http://127.0.0.1:8771')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  context=browser.new_context();errors=[]
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE+'/') and '/api/' not in r.request.url else r.abort())
  context.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+('/?stage-preview=1' if preview else '/'))
  page.evaluate('''async preview=>{
   const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
   const {graphData,layoutGraph}=await import('/src/memory/graph-data.js'),{mergeProposal,commitHierarchy}=await import('/src/memory/knowledge-hierarchy.js');
   const {livePathways}=await import('/src/pathways/live-pathways.js');
   window.db=await(preview?new PreviewStore():new MindlingDatabase()).open();window.read=()=>preview?db.read():db.get('gameplay','primary').then(v=>v.state);window.write=fn=>preview?db.change(fn):db.changeGameplay(fn);
   await write(()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'dynamic-'+preview}));
   const memory=(id,category,content)=>({id,categoryId:id,category,content,source:'SERVICE',analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},contentIntegrity:{version:1,status:'captured',length:content.length}});
   await write(s=>{s.mind.memories=[memory('hockey','Ice hockey','Ice hockey is a type of sport.'),memory('sport','Sport','Sport includes organized physical competition.'),memory('nhl','National Hockey League','The NHL is a professional ice hockey league.')];return s;});
   const state=await read(),before=JSON.stringify(state.mind.memories),g=graphData(state.mind),a=g.areas.find(a=>a.label==='Sport').id,b=g.areas.find(a=>a.label==='Ice hockey').id;
   const check=(v,m)=>{if(!v)throw Error(m);};check(state.mind.semanticAreaRelations.records.length===1,'persisted proof');
   const proposal=mergeProposal(g,null,a,b);check(proposal.valid,'unknown taxonomy now supported');check(mergeProposal(g,null,b,a).parentId===a,'reverse direction');
   const saved=JSON.stringify(state.mind);try{await write(s=>{s.mind=commitHierarchy(s.mind,graphData(s.mind),proposal);throw Error('synthetic rollback');});}catch{}
   check(JSON.stringify((await read()).mind)===saved,'atomic rollback');
   const pathwaysBefore=livePathways(g,state.mind).map(p=>[p.id,p.count,p.share]);
   await write(s=>({...s,mind:commitHierarchy(s.mind,graphData(s.mind),proposal)}));
   const after=(await read()).mind,projected=graphData(after);check(JSON.stringify(after.memories)===before,'memory identity/content');check(projected.stats.canonical===3&&projected.stats.areas===2,'counts');check(layoutGraph(projected).nodes.filter(n=>n.kind==='area').length===2,'root only');check(JSON.stringify(livePathways(projected,after).map(p=>[p.id,p.count,p.share]))===JSON.stringify(pathwaysBefore),'no false specialization or ranking');
   window.expected=JSON.stringify(after);db.close();
  }''',preview)
  expected=page.evaluate('expected');page.reload()
  actual=page.evaluate('''async preview=>{const {PreviewStore}=await import('/src/preview/sandbox/storage.js'),{MindlingDatabase}=await import('/src/storage/database.js');const db=await(preview?new PreviewStore():new MindlingDatabase()).open();const state=preview?await db.read():(await db.get('gameplay','primary')).state;db.close();return JSON.stringify(state.mind);}''',preview)
  assert actual==expected
  assert errors==[],errors
  print(('Preview' if preview else 'Normal')+': dynamic proof, direction, rollback, distinct memories, projection, unchanged ranking and durable reload passed',flush=True)
  context.close()
 browser.close()
