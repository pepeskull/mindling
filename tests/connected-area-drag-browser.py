"""Pointer and Canvas checks in both real app modes with isolated fixture data."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8771')
VISUAL_DIR = os.environ.get('MINDLING_DRAG_VISUAL_DIR')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for preview in [False, True]:
        mode = 'preview' if preview else 'normal'
        context = browser.new_context(viewport={'width': 1500, 'height': 1000})
        calls = []
        context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE+'/') else r.abort())
        context.route('**/api/**', lambda r: (calls.append(r.request.url), r.abort()))
        context.route('**/connected-drag-fixture', lambda r: r.fulfill(body='<!doctype html><title>Fixture</title>', content_type='text/html'))

        def instrument(route):
            response = route.fetch()
            route.fulfill(response=response, body="""
                import {NeuralMemoryView} from '../src/memory/neural-memory-view.js';
                const update = NeuralMemoryView.prototype.update;
                NeuralMemoryView.prototype.update = function(state) {
                  window.dragView = this;
                  update.call(this,state);
                };
            """ + response.text())

        context.route('**/js/bootstrap.js', instrument)
        page = context.new_page()
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE+'/connected-drag-fixture')
        page.evaluate('''async preview=>{
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {MindlingDatabase}=await import('/src/storage/database.js');
          const {newMindling,createSandbox}=await import('/src/preview/sandbox/engine.js');
          const {seedConnectedAreas}=await import('/tests/support/connected-area-fixture.js');
          const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
          const state=newMindling(createSandbox(Date.now()),{confirmed:true,id:'connected-drag-fixture',name:'Connected Drag'});
          seedConnectedAreas(state.mind);
          if(preview)await db.change(()=>state);else await db.changeGameplay(()=>state);
          db.close();
        }''', preview)

        def open_graph():
            if preview and page.locator('.sandbox-controls').get_attribute('open') is not None:
                page.locator('.sandbox-controls > summary').click()
            page.locator('[data-view=memories]').click()
            page.wait_for_function('dragView.visible && dragView.layout?.nodes.length > 0 && dragView.stage.clientWidth > 0')
            page.evaluate('''()=>{
              const node=label=>dragView.layout.nodes.find(n=>n.label===label||n.recordId===label);
              window.node=node;
              window.point=label=>{
                const n=node(label),box=dragView.canvas.getBoundingClientRect();
                return [box.left+dragView.pan.x+n.x*dragView.zoom,box.top+dragView.pan.y+n.y*dragView.zoom];
              };
              window.geometry=()=>Object.fromEntries(dragView.layout.nodes.map(n=>[n.id,[n.x,n.y]]));
              window.sameGeometry=saved=>Object.entries(geometry()).every(([id,p])=>
                p.every((v,i)=>Math.abs(v-saved[id][i])<.001));
              window.delta=(label,before)=>{const n=node(label);return [n.x-before[n.id][0],n.y-before[n.id][1]];};
              window.coherent=(label,before)=>{const area=node(label),[dx,dy]=delta(label,before);
                return dragView.layout.nodes.filter(n=>n.areaId===area.id).every(n=>
                  Math.abs(n.x-before[n.id][0]-dx)<.001 && Math.abs(n.y-before[n.id][1]-dy)<.001);
              };
            }''')

        def read_knowledge():
            return page.evaluate('''async preview=>{
              const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
              const {MindlingDatabase}=await import('/src/storage/database.js');
              const db=await(preview?new PreviewStore():new MindlingDatabase()).open();
              const state=preview?await db.read():(await db.get('gameplay','primary')).state;
              db.close();
              return [state.mind.memories,state.mind.semanticAreaRelations];
            }''', preview)

        def capture(name):
            if VISUAL_DIR:
                page.locator('.memory-graph-stage').screenshot(path=Path(VISUAL_DIR)/f'{mode}-{name}.png')

        page.goto(BASE+('/?stage-preview=1' if preview else '/'))
        open_graph()
        initial_knowledge = read_knowledge()
        assert page.evaluate("dragView.layout.edges.some(e=>e.origin==='semantic-area'&&e.persisted)")
        capture('before')
        for source, peer, displacement in [('Biology', 'Science', (52, 24)), ('Science', 'Biology', (39, -18))]:
            page.evaluate('window.before=geometry()')
            x, y = page.evaluate('point', source)
            dx, dy = displacement
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x+dx, y+dy)
            movement = page.evaluate('''([source,peer,dx,dy])=>{
              const [x,y]=delta(source,before),[px,py]=delta(peer,before);
              const ok=coherent(source,before)&&coherent(peer,before)&&
                Math.abs(x*dragView.zoom-dx)<1.5&&Math.abs(y*dragView.zoom-dy)<1.5&&
                Math.hypot(px,py)<Math.hypot(x,y)&&delta('Computing',before).every(v=>v===0);
              return {ok,root:[x,y],follower:[px,py],zoom:dragView.zoom,
                active:dragView.drag?.cluster?.group.anchor.node.label,point:point(source)};
            }''', [source, peer, dx, dy])
            assert movement['ok'], movement
            page.wait_for_function('peer=>Math.hypot(...delta(peer,before))>3', arg=peer)
            assert page.evaluate('''peer=>coherent(peer,before)&&dragView.flowPaths.some(
              path=>path.a===node('Biology')&&path.b===node('Science'))''', peer)
            page.mouse.up()
            page.wait_for_function('!dragView.drag && !dragView.elastic')
        capture('moved')

        original_zoom = page.evaluate('dragView.zoom')
        page.locator('[data-graph-action=in]').click()
        assert page.evaluate('dragView.zoom') > original_zoom
        page.evaluate('window.before=geometry()')
        x, y = page.evaluate('point', 'b1')
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x-17, y+25)
        page.mouse.up()
        assert page.evaluate('''()=>{
          const [x,y]=delta('b1',before);
          return Math.abs(x*dragView.zoom+17)<1.5&&Math.abs(y*dragView.zoom-25)<1.5&&
            Object.entries(geometry()).every(([id,p])=>id===node('b1').id||
              p.every((v,i)=>v===before[id][i]));
        }''')

        # A deliberate memory-to-memory drop still assesses the selected pair.
        page.evaluate('''()=>{
          window.before=geometry();window.drops=[];
          dragView.onConnectMemories=async ids=>{drops.push(ids);return {code:'INSUFFICIENT_EVIDENCE'};};
        }''')
        start, target = page.evaluate("[point('b1'),point('b2')]")
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*target, steps=4)
        page.mouse.up()
        page.wait_for_function('drops.length===1 && !dragView.connectionBusy')
        assert page.evaluate("JSON.stringify(drops)==='[[\"b1\",\"b2\"]]' && sameGeometry(before)")

        # A cancelled captured drag rolls back every participating group.
        page.evaluate('window.before=geometry()')
        x, y = page.evaluate('point', 'Biology')
        corner = page.locator('.memory-graph-stage').bounding_box()
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(corner['x']-5, y)
        assert page.evaluate('dragView.drag.moved && dragView.canvas.hasPointerCapture(dragView.drag.id)')
        page.evaluate("""dragView.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:dragView.drag.id}))""")
        page.mouse.up()
        assert page.evaluate('!dragView.drag && !dragView.elastic && sameGeometry(before)')

        # Background panning, wheel zoom, resize and reset keep ownership geometry.
        pan = page.evaluate('({...dragView.pan})')
        corner = page.locator('.memory-graph-stage').bounding_box()
        page.mouse.move(corner['x']+19, corner['y']+22)
        page.mouse.down()
        page.mouse.move(corner['x']+55, corner['y']+39)
        page.mouse.up()
        assert page.evaluate('pan=>dragView.pan.x!==pan.x && sameGeometry(before)', pan)
        page.set_viewport_size({'width': 1350, 'height': 960})
        page.locator('[data-graph-action=reset]').click()
        assert page.evaluate('!dragView.drag && sameGeometry(before)')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('dragView.motion.matches')
        page.evaluate('window.before=geometry()')
        x, y = page.evaluate("point('Science')")
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x+29, y-12)
        assert page.evaluate('''()=>!dragView.elastic.active&&coherent('Science',before)&&coherent('Biology',before)&&
          Math.hypot(...delta('Biology',before))>0''')
        page.mouse.up()
        page.wait_for_function("dragView.viewRevision>0 && !!dragView.memoryOffsets[node('b1').id]")
        page.evaluate('''async ()=>{
          const end=Date.now()+5000;
          while(true){
            const saved=await dragView.onMemoryView(dragView.viewIdentity);
            if(saved?.memoryOffsets?.[node('b1').id] && saved.positions[node('Science').id]?.x===node('Science').x)return;
            if(Date.now()>end)throw Error('Stable geometry was not persisted.');
            await new Promise(resolve=>setTimeout(resolve,25));
          }
        }''')
        saved = page.evaluate('geometry()')
        page.reload()
        open_graph()
        assert page.evaluate('sameGeometry', saved)
        assert read_knowledge() == initial_knowledge
        assert calls == [], calls
        assert errors == [], errors
        print(f'{mode}: rigid Biology/Science groups, damped links, independent memory, pointer capture, pan, resize, reset and reload PASS', flush=True)
        context.close()
    browser.close()
