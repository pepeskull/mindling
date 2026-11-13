from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  c=b.new_context(viewport={'width':1500,'height':950},reduced_motion='reduce');errors=[]
  c.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:8771/') and '/api/' not in r.request.url else r.abort())
  c.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:8771/'+('?stage-preview=1' if preview else ''))
  page.evaluate('''async()=>{const {Dashboard}=await import('/src/ui/dashboard.js'),{EventBus}=await import('/src/app/events.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js'),{dashboardState}=await import('/src/app/gameplay-state.js');const mind=newMindling(createSandbox(Date.now()),{confirmed:true,id:'smoke',name:'Mindling'}).mind;window.state={...dashboardState(mind),researchPermissions:{enabled:false,loaded:true}};window.dashboard=new Dashboard(new EventBus(),{onResearchAccess:async enabled=>{state.researchPermissions.enabled=enabled;dashboard.render(state);}});dashboard.render(state);dashboard.show();document.querySelectorAll('.installation').forEach(e=>e.remove());}''')
  page.locator('[data-view=integration]').click();assert page.locator('#integration-view').is_visible();page.locator('[data-platform=github]').click();assert page.locator('[data-detail-name]').inner_text()=='GitHub';assert 'Coming soon' in page.locator('.integration-detail').inner_text()
  switch=page.locator('.footer-links [role=switch]');switch.click();assert switch.get_attribute('aria-checked')=='true';assert page.locator('[role=switch]').count()==1
  page.locator('[data-view=network]').click();assert page.locator('#integration-view').is_hidden()
  page.evaluate('''async()=>{const {NetworkView}=await import('/src/network/network-view.js');const host=document.createElement('div');host.style.cssText='position:fixed;inset:100px;width:900px;height:500px';document.body.append(host);let time=100000;const v=new NetworkView(host,{clock:()=>time});v.update(state);v.reduced={matches:false};v.setVisible(true);for(const activity of ['TALK','TEACH','DEEP_TRAINING'])v.ingest({id:activity,activity,phase:'accepted'});time+=1500;v.draw();const origin=v.visualHistory.activeSince,elapsed=v.brain.playback.time;v.setVisible(false);time+=1000;v.setVisible(true);if(v.visualHistory.activeSince!==origin||v.brain.playback.time<=elapsed)throw Error('Timeline restart');const ctx=v.lines.getContext('2d'),move=ctx.moveTo,ys=[];ctx.moveTo=function(x,y){ys.push(y);return move.call(this,x,y)};v.drawLines([{time:time-100,values:[.5,.5,.5]},{time,values:[.4,.6,.8]}],time);ctx.moveTo=move;if(new Set(ys.map(Math.round)).size<3)throw Error('Missing lanes');v.destroy();if(v.frame!==null)throw Error('Frame leak');host.remove();dashboard.destroy();}''')
  assert not errors,errors
  print('Preview' if preview else 'Normal','UI smoke passed',flush=True);c.close()
 b.close()
