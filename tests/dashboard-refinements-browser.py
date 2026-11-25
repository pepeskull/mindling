"""Real Dashboard controllers, isolated IndexedDB, and an offline Talk result."""
import os

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8771')
DERBY_PASSAGES = [
    'The **Madrid derby** is distinct from other rivalries and pits **Real Madrid** against **Atlético de Madrid**.',
    'The **Seville derby**, also called *El Gran Derbi*, is played by **Sevilla FC** and **Real Betis**.',
]
BOOTSTRAP = """
const preview=new URLSearchParams(location.search).has('stage-preview');
const {MindlingApp}=await import('/src/app/app.js');
const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');
const update=NeuralMemoryView.prototype.update;
NeuralMemoryView.prototype.update=function(state){window.memoryView=this;return update.call(this,state);};
window.app=preview?new SandboxPreview({forceCanvas:true}):new MindlingApp();
await app.start();
window.fixtureReady=true;
"""
SEED = """async preview=>{
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
  const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
  const {graphData}=await import('/src/memory/graph-data.js');
  const {persistAreaRelations}=await import('/src/semantic/area-relations.js');
  const store=await (preview?new PreviewStore():new MindlingDatabase()).open();
  const now=Date.now()+(preview?3*86400000:0);
  const state=newMindling(createSandbox(now),{id:'dashboard-fixture',name:'Dashboard Fixture',confirmed:true});
  Object.assign(state.mind.life.attributes,{nutrition:65,rest:70,health:80,wellbeing:80});
  state.mind.life.care={NOURISH:now-6*3600000+31000,REST:now-3600000,CARE:now-3600000};
  const categories=['Computing','Cryptocurrency','Video games','Interactive media systems and rendering techniques in large multiplayer environments'];
  state.mind.memories=categories.map((category,i)=>{
    const content=`${category} can involve shared computing systems.`;
    return {id:'m'+i,categoryId:'area'+i,category,content,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},
      analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},
      neuronIds:['origin'],synapseIds:[],relatedMemoryIds:[]};
  });
  const graph=graphData(state.mind),byLabel=label=>graph.areas.find(a=>a.label===label),origin=byLabel(categories[0]);
  const evidence=memory=>({snapshot:{id:memory.id,text:memory.content,provenance:{verification:memory.analysis.verification,correctsMemoryId:null}},
    span:{start:0,end:memory.content.length,quote:memory.content}});
  const relations=categories.slice(1).map((category,i)=>{
    const target=byLabel(category);
    return {version:1,from:origin.id,to:target.id,type:'related-to',direction:'symmetric',reason:'Shared computing systems',
      validation:'model-supported-not-independently-verified',areas:[origin,target].map(({id,label})=>({id,label})),
      evidence:[evidence(state.mind.memories[0]),evidence(state.mind.memories[i+1])]};
  });
  if(persistAreaRelations(state.mind,relations,graph.areas,now).some(result=>result!=='AREA_PERSISTED'))throw Error('Fixture relations missing');
  if(preview)await store.change(()=>state);else await store.changeGameplay(()=>state);
  store.close();
}"""


def assets(route):
    url = route.request.url
    if url == BASE + '/js/bootstrap.js':
        route.fulfill(body=BOOTSTRAP, content_type='application/javascript')
    elif url.startswith(BASE + '/') and '/api/' not in url:
        route.continue_()
    else:
        route.abort()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for preview in (False, True):
        context = browser.new_context(viewport={'width': 1500, 'height': 940}, reduced_motion='reduce')
        context.route('**/*', assets)
        context.add_init_script("""window.fixtureWall=Number(sessionStorage.fixtureWall)||Date.UTC(2026,10,22,12);
            Date.now=()=>window.fixtureWall;
            window.advance=(ms)=>{window.fixtureWall+=ms;sessionStorage.fixtureWall=window.fixtureWall;};""")
        page = context.new_page()
        page.set_default_timeout(5000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/tests/blank.html')
        page.evaluate(SEED, preview)
        url = BASE + ('/?stage-preview=1' if preview else '/')
        page.goto(url)
        page.wait_for_function('window.fixtureReady')
        if preview:
            page.locator('.sandbox-controls > summary').click()

        for action, remaining in [('nourish', '00:00:31'), ('rest', '07:00:00'), ('care', '11:00:00')]:
            expect(page.locator(f'#{action}-cooldown')).to_have_text(remaining)
            expect(page.locator(f'#{action}-availability')).to_have_text('Cooling down')
        for action, duration in [('nourish', 6), ('rest', 8), ('care', 12)]:
            expect(page.locator(f'#{action}-details')).to_have_text(f'Free · {duration}h')
        assert page.locator('.care-grid').evaluate("""grid=>{
          const cards=[...grid.children],sizes=cards.map(card=>card.getBoundingClientRect());
          return sizes.every(rect=>Math.abs(rect.width-sizes[0].width)<1&&rect.height===sizes[0].height&&rect.top===sizes[0].top)
            &&cards.every(card=>{const parts=[...card.children].map(part=>part.getBoundingClientRect()),box=card.getBoundingClientRect();
              return parts.every((part,index)=>Math.abs(part.left+part.width/2-box.left-box.width/2)<1
                &&part.left>=box.left&&part.right<=box.right&&(!index||parts[index-1].bottom<=part.top));});
        }""")
        page.evaluate('advance(11000)')
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')
        page.reload()
        page.wait_for_function('window.fixtureReady')
        if preview:
            page.locator('.sandbox-controls > summary').click()
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')

        page.evaluate("""()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});
          document.dispatchEvent(new Event('visibilitychange'));advance(21000);}""")
        expect(page.locator('#nourish-cooldown')).to_have_text('00:00:20')
        page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
        ready = page.locator('#nourish-cooldown')
        expect(ready).to_have_text('Ready!')
        expect(ready).to_have_css('color', 'rgb(53, 184, 123)')
        expect(page.locator('#nourish-availability')).to_have_text('Available')
        expect(page.locator('[data-care-announcement]')).to_have_text('Nourish cooldown complete.')
        page.get_by_role('button', name='Nourish, free').click()
        expect(ready).to_have_text('06:00:00')
        care_at = page.evaluate('app.state.mind.life.care.NOURISH')
        page.evaluate('advance(1000)')
        page.get_by_role('button', name='Nourish, free').click()
        expect(page.locator('.interaction-status')).to_contain_text('cooldown is still active')
        assert page.evaluate('app.state.mind.life.care.NOURISH') == care_at
        expect(ready).to_have_text('05:59:59')
        page.evaluate('advance(11*3600000)')
        for action, duration in [('Rest', '08:00:00'), ('Care', '12:00:00')]:
            countdown = page.locator(f'#{action.lower()}-cooldown')
            expect(countdown).to_have_text('Ready!')
            page.get_by_role('button', name=f'{action}, free').click()
            expect(countdown).to_have_text(duration)
        page.evaluate("""()=>app.change(s=>{s.mind.life.attributes.nutrition=100;s.mind.life.care.NOURISH=null;return s;})""")
        expect(ready).to_have_text('Ready!')
        expect(page.locator('#nourish-availability')).to_have_text('No care needed')
        page.get_by_role('button', name='Nourish, free').click()
        expect(page.locator('.interaction-status')).to_contain_text('No care needed')
        assert page.evaluate('app.state.mind.life.care.NOURISH===null')

        page.evaluate("""answer=>{const id='synthetic-talk';app.dashboard.beginInteraction(id,'TALK');
          app.dashboard.presentInteraction(id,{accepted:true,talkResponse:{answer}});}""",
            'Set in **Leonida**, including *Vice City*.\nSingle line break.\n\nPlain text <img src=x onerror="window.injected=true">.')
        body = page.locator('[data-talk-content]')
        expect(body.locator('strong')).to_have_text('Leonida')
        expect(body.locator('em')).to_have_text('Vice City')
        assert body.locator('p').count() == 2
        assert '\nSingle line break.' in body.locator('p').first.text_content()
        expect(body.locator('p').last).to_contain_text('<img src=x onerror=')
        assert body.locator('img, script').count() == 0 and not page.evaluate('window.injected')
        page.evaluate("""()=>{const id='plain-talk';app.dashboard.beginInteraction(id,'TALK');
          app.dashboard.presentInteraction(id,{accepted:true,talkResponse:{answer:'A plain answer.'}});}""")
        expect(body).to_have_text('A plain answer.')

        task_id = page.evaluate("""async passages=>{
          const {learningEngine}=await import('/src/autonomous/learning-engine.js');
          const {understandInput}=await import('/src/learning/input-understanding.js');
          const {digest}=await import('/src/autonomous/tasks.js');
          const requestId='derby-talk',engine=learningEngine(app);
          app.dashboard.beginInteraction(requestId,'TALK');
          const task=await engine.prepare(understandInput('What are the main La Liga football derbies in Spain?','TALK'),requestId);
          app.dashboard.presentInteraction(requestId,{accepted:true,talkResponse:{researchTaskId:task.id,insufficientInformation:true}});
          const at=Date.now(),url='https://example.com/derbies',hash=await digest(passages.join(''));
          const saved=await Promise.all(passages.map(async (text,i)=>({
            id:'derby-'+i,content:`Source observation (${new Date(at).toISOString()}) from ${url}: ${text}`,
            category:'Spanish football',source:'AUTONOMOUS',neuronIds:['origin'],synapseIds:[],relatedMemoryIds:[],
            research:{taskId:task.id,sourceURL:url,observedAt:at,sourceHash:hash,quoteHash:await digest(text),evidenceText:text}
          })));
          // Simulate the successful, source-backed state emitted by the Research engine.
          const completed=await engine.patch(task.id,null,(current,state)=>{
            state.mind.memories.push(...saved);
            Object.assign(current,{status:'COMPLETED',code:'SOURCE_BACKED',knowledgeIds:saved.map(m=>m.id),
              completedWork:['understanding','plan','source','evidence','knowledge','answer'],
              sourceReferences:[{url,title:'Synthetic derby coverage',authorizedAt:at,observedAt:at,hash}]});
          });
          engine.notify(completed);
          return completed.id;
        }""", DERBY_PASSAGES)
        expect(body.locator('p')).to_have_count(2)
        expect(body.locator('strong')).to_have_text(['Madrid derby', 'Real Madrid', 'Atlético de Madrid', 'Seville derby', 'Sevilla FC', 'Real Betis'])
        expect(body.locator('em')).to_have_text('El Gran Derbi')
        expect(body).not_to_contain_text('**')

        page.reload()
        page.wait_for_function('window.fixtureReady')
        if preview:
            page.locator('.sandbox-controls > summary').click()
        page.evaluate("""async id=>{
          const {learningEngine}=await import('/src/autonomous/learning-engine.js');
          const task=app.state.mind.learningTasks.find(t=>t.id===id),reply=learningEngine(app).reply(task);
          app.dashboard.beginInteraction('reopen-derby','TALK');
          app.dashboard.presentInteraction('reopen-derby',{accepted:true,talkResponse:reply});
        }""", task_id)
        expect(body.locator('p')).to_have_count(2)
        expect(body.locator('strong')).to_have_text(['Madrid derby', 'Real Madrid', 'Atlético de Madrid', 'Seville derby', 'Sevilla FC', 'Real Betis'])
        expect(body.locator('em')).to_have_text('El Gran Derbi')
        assert page.evaluate("""passages=>app.state.mind.memories.filter(m=>m.id.startsWith('derby-')).every((m,i)=>
          m.research.evidenceText===passages[i]&&m.content.endsWith(passages[i]))""", DERBY_PASSAGES)

        page.locator('[data-view=memories]').click()
        page.wait_for_function('memoryView.layout && !memoryView.loadingView')
        page.evaluate("""()=>{window.knowledgeBefore=JSON.stringify([app.state.mind.memories,app.state.mind.semanticAreaRelations]);
          memoryView.select(memoryView.graph.areas.find(area=>area.label==='Computing').id);}""")
        tags = page.locator('.connected-area-tag')
        expect(tags).to_have_count(3)
        assert tags.evaluate_all("""tags=>tags.every(tag=>{
          const style=getComputedStyle(tag),color=memoryView.colors.get(tag.dataset.selectMemory),probe=document.createElement('span');
          probe.style.color=color;document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();
          return style.color===expected&&style.borderRadius==='999px'&&tag.type==='button';
        })""")
        first = page.get_by_role('button', name='Cryptocurrency', exact=True)
        before_hover = first.evaluate('tag=>getComputedStyle(tag).backgroundColor')
        first.hover()
        assert first.evaluate('tag=>getComputedStyle(tag).backgroundColor') != before_hover
        first.focus()
        page.keyboard.press('Tab')
        following = tags.nth(1)
        expect(following).to_be_focused()
        expect(following).to_have_css('outline-style', 'solid')
        selected_label = following.inner_text()
        page.keyboard.press('Enter')
        expect(page.locator('#memory-inspector-title')).to_have_text(selected_label)
        assert page.evaluate('memoryView.positions.get(memoryView.selected).label') == selected_label
        page.get_by_role('button', name='Computing', exact=True).click()
        expect(page.locator('#memory-inspector-title')).to_have_text('Computing')
        assert page.evaluate('knowledgeBefore===JSON.stringify([app.state.mind.memories,app.state.mind.semanticAreaRelations])')
        page.set_viewport_size({'width': 390, 'height': 940})
        assert tags.evaluate_all("""tags=>new Set(tags.map(tag=>tag.offsetTop)).size>1&&tags.every(tag=>{
          const outer=tag.parentElement.getBoundingClientRect(),box=tag.getBoundingClientRect();
          return box.right<=outer.right+1&&tag.scrollWidth<=tag.clientWidth+1;
        })""")
        page.locator('[data-mobile-view=dashboard]').click()
        assert page.locator('.care-grid').evaluate('grid=>grid.clientWidth>=grid.scrollWidth')
        page.set_viewport_size({'width': 1500, 'height': 940})

        page.evaluate("window.mainBrain=document.querySelector('#scene canvas')")
        page.locator('[data-view=network]').click()
        network = page.locator('#network-view')
        expect(network.get_by_role('heading', name='Network', exact=True)).to_be_visible()
        assert page.locator('[data-view=network]').count() == 1
        assert page.locator('[data-view=integration], [data-mobile-view=integration], .network-bars, .network-lines').count() == 0
        assert network.locator('canvas[data-cloud]').count() == 0
        assert page.locator('#development-view canvas[data-cloud]').count() == 1
        page.set_viewport_size({'width': 390, 'height': 940})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        network.locator('[data-platform=github]').click()
        expect(network.locator('[data-detail-name]')).to_have_text('GitHub')
        expect(network.locator('.integration-detail')).to_contain_text('Coming soon')
        page.locator('[data-mobile-view=dashboard]').click()
        expect(network).to_be_hidden()
        assert page.evaluate("""()=>window.mainBrain&&document.querySelector('#scene canvas')===window.mainBrain
          &&app.dashboard.integration.frame===null""")
        page.goto(url + '#integration')
        page.wait_for_function("location.hash==='#network'&&!document.querySelector('#network-view').hidden")
        page.evaluate("app.destroy()")
        assert page.locator('canvas[data-cloud],canvas[data-fallback]').count() == 0
        assert not errors, errors
        context.close()
        print(f'{"Stage Preview" if preview else "Normal"}: care cards, cooldowns, area tags, keyboard selection, Talk and Network passed')
    browser.close()
