from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  c=b.new_context(viewport={'width':1500,'height':950},reduced_motion='reduce');errors=[]
  c.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:8771/') and '/api/' not in r.request.url else r.abort())
  c.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:8771/'+('?stage-preview=1' if preview else ''))
  page.evaluate('''async()=>{const {Dashboard}=await import('/src/ui/dashboard.js'),{EventBus}=await import('/src/app/events.js'),{createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js'),{dashboardState}=await import('/src/app/gameplay-state.js');const mind=newMindling(createSandbox(Date.now()),{confirmed:true,id:'smoke',name:'Mindling'}).mind;window.state={...dashboardState(mind),researchPermissions:{enabled:false,loaded:true}};window.dashboard=new Dashboard(new EventBus(),{onResearchAccess:async enabled=>{state.researchPermissions.enabled=enabled;dashboard.render(state);}});dashboard.render(state);dashboard.show();document.querySelectorAll('.installation').forEach(e=>e.remove());}''')
  page.locator('[data-view=network]').click();assert page.locator('#network-view').is_visible();page.locator('[data-platform=github]').click();assert page.locator('[data-detail-name]').inner_text()=='GitHub';assert 'Coming soon' in page.locator('.integration-detail').inner_text()
  switch=page.locator('.footer-links [role=switch]');switch.click();assert switch.get_attribute('aria-checked')=='true';assert page.locator('[role=switch]').count()==1
  page.locator('[data-view=dashboard]').click();assert page.locator('#network-view').is_hidden()
  page.evaluate("""()=>{const cloud=dashboard.integration.cloud;dashboard.destroy();if(cloud.frame!==null||cloud.root.children.length)throw Error('Cloud survived teardown');}""")
  assert not errors,errors
  print('Preview' if preview else 'Normal','UI smoke passed',flush=True);c.close()
 b.close()
