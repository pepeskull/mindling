from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for preview in [False,True]:
  c=b.new_context(viewport={'width':1400,'height':950})
  c.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:8771/') and '/api/' not in r.request.url else r.abort())
  c.route('**/js/bootstrap.js',lambda r:r.fulfill(body='',content_type='application/javascript'))
  page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8771/'+('?stage-preview=1' if preview else ''))
  page.evaluate("""async()=>{
   const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;background:black';document.body.append(host);
   let resolve;const saved=new Promise(r=>resolve=r);window.v=new NeuralMemoryView(host,{onMemoryView:()=>saved});
   v.stage.style.cssText='width:800px;height:450px';v.setVisible(true);await new Promise(r=>setTimeout(r,30));
   if(v.graph)throw Error('Built before state');
   v.update({id:'fixture',memories:[{id:'m',content:'A complete fixture claim.',category:'Science',categoryId:'science'}]});
   v.setVisible(false);v.setVisible(true);await new Promise(r=>setTimeout(r,20));
   if(v.graph)throw Error('Built during hydration');
   resolve({version:1,revision:0,positions:{},zoom:.8,pan:{x:20,y:30},autoFit:false});await new Promise(r=>setTimeout(r,40));
   if(!(v.positions instanceof Map)||!v.layout)throw Error('Hydration corrupted node map');
   v.draw();v.setVisible(false);v.setVisible(true);v.rebuild();v.draw();
   if(v.zoom!==.8||v.pan.x!==20)throw Error('Navigation reset transform');
   v.destroy();await new Promise(r=>setTimeout(r,20));if(v.frame!==null)throw Error('Frame survived teardown');host.remove();
   const {IntegrationView}=await import('/src/integration/integration-view.js');
   window.integrationHost=document.createElement('div');integrationHost.className='integration-view';document.body.append(integrationHost);
   window.iv=new IntegrationView(integrationHost);iv.setVisible(true);iv.layoutPaths();
  }""")
  for width in [1400,900]:
   page.set_viewport_size({'width':width,'height':950})
   page.evaluate("""()=>{iv.layoutPaths();for(const selector of ['[data-flow=notion]','[data-capability=Development]']){
    const path=integrationHost.querySelector(selector),style=getComputedStyle(path),start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
    if(start.x>=end.x||style.animationName!=='integration-flow'||style.animationPlayState!=='paused')throw Error('Missing directional preview');
    const map=integrationHost.querySelector('.integration-map').getBoundingClientRect(),hub=integrationHost.querySelector('.integration-hub').getBoundingClientRect();
    const expected=(selector.includes('notion')?hub.left:hub.right)-map.left,actual=(selector.includes('notion')?end.x:start.x)*map.width/1000;
    if(Math.abs(expected-actual)>1)throw Error('Detached hub endpoint');
   }}""")
  page.evaluate("""()=>{
   const gradient=integrationHost.querySelector('linearGradient');
   if(gradient.getAttribute('gradientUnits')!=='userSpaceOnUse')throw Error('Horizontal path paint collapses');
   for(const [platform,capability] of [['notion','Knowledge'],['github','Development']]){
    integrationHost.querySelector('[data-platform="'+platform+'"]').click();
    for(const path of integrationHost.querySelectorAll('path')){
     const selected=path.dataset.flow===platform||path.dataset.capability===capability;
     if(getComputedStyle(path).animationPlayState!==(selected?'running':'paused'))throw Error('Incorrect selected flow');
    }
    iv.setVisible(false);iv.setVisible(true);
   }
  }""")
  page.emulate_media(reduced_motion='reduce')
  assert page.locator('[data-flow=notion]').evaluate("(n)=>getComputedStyle(n).animationName")=='none'
  assert page.locator('[data-capability=Development]').evaluate("(n)=>getComputedStyle(n).animationName")=='none'
  page.evaluate('iv.destroy()')
  assert not errors,errors
  print('Preview' if preview else 'Normal','lifecycle and integration passed')
  c.close()
 b.close()
