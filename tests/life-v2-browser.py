"""UI/framing regression with real Chromium, Three.js and Canvas.
BASELINE=1 captures the unmodified main branch for matched before screenshots.
Stage injection is a visual harness only; progression is tested by engine/browser suites.
"""
import os
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8000')
BASELINE = os.environ.get('BASELINE') == '1'
OUTPUT = Path('/tmp/mindling-life-v2')
OUTPUT.mkdir(exist_ok=True)
ASSETS = Path(tempfile.mkdtemp(prefix='mindling-framing-three-'))
for name in ['three.module.min.js', 'three.core.min.js']:
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '45',
                    f'https://cdn.jsdelivr.net/npm/three@0.180.0/build/{name}', '-o', str(ASSETS/name)], check=True)

def route_models(page, backend):
    page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/build/*', lambda r: r.abort() if backend == 'canvas' else r.fulfill(path=str(ASSETS/r.request.url.rsplit('/',1)[1]), content_type='application/javascript', headers={'Access-Control-Allow-Origin':'*'}))
    page.route('https://cdn.jsdelivr.net/npm/@huggingface/**', lambda r: r.abort())

def settle(page):
    page.evaluate('window.testPreview?.render(performance.now())')
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')

def typography(page):
    expectations = {'.life-attribute label':'9px', '.life-attribute strong':'9px', '.life-panel [data-life-warning] span':'9px', '.compact-neural-stats':'8px', '.control-hint':'9px', '.energy-panel > footer':'9px', '[data-energy-reset]':'9px', '.coming-soon':'8px', '.activity-grid b':'9px', '.activity-grid small':'8px'}
    for selector, value in expectations.items():
        assert page.locator(selector).first.evaluate('(e) => getComputedStyle(e).fontSize') == value, selector
    assert page.locator('.life-panel [data-life-warning] span').evaluate('(e) => getComputedStyle(e).lineHeight') == '12.15px'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    if page.locator('.care-grid small').count():
        assert page.locator('.care-grid small').first.evaluate('(e) => getComputedStyle(e).fontSize') == '8px'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for backend in ['three', 'canvas']:
        for size, viewport in [('desktop',{'width':1440,'height':1000}), ('mobile',{'width':390,'height':844})]:
            context = browser.new_context(viewport=viewport, reduced_motion='reduce')
            page = context.new_page(); route_models(page, backend)
            errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
            # Real production creation and Talk; no Life 2.0 production activation.
            page.goto(BASE); page.locator('[data-next]').click()
            for name in ['Developer','Social','Researcher']: page.locator(f'[data-pathway="{name}"]').click()
            page.locator('[data-next]').click(); page.locator('[data-next]').click()
            page.locator('#mindling-name').fill('Scale Comparison'); page.locator('[data-next]').click(); page.locator('[data-create]').click()
            page.wait_for_function("document.querySelector('#onboarding').hidden")
            settle(page)
            if not BASELINE:
                typography(page)
                assert page.locator('[data-life-attribute="neuralStability"]').count() == 0
            prefix = 'before' if BASELINE else 'after'
            page.screenshot(path=str(OUTPUT/f'{prefix}-main-{backend}-{size}.png'))
            # Bootstrap-suppressed shell lets the visual harness own its controller.
            page.route('**/js/bootstrap.js', lambda r:r.fulfill(body='',content_type='application/javascript'))
            page.add_init_script("""(()=>{const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='mindling-db')throw Error('Production DB touched');return open(name,...args)}})()""")
            page.goto(BASE+'/?stage-preview=1')
            page.evaluate("""async()=>{
              const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');
              const {newMindling}=await import('/src/preview/sandbox/engine.js');
              window.testPreview=new SandboxPreview();await testPreview.start();
              await testPreview.change(s=>newMindling(s,{name:'Scale Comparison',confirmed:true}));
              testPreview.panel.open=false;
              cancelAnimationFrame(testPreview.frame);testPreview.frame=null;testPreview.schedule=()=>{};
            }""")
            settle(page)
            assert page.locator('#scene').get_attribute('data-backend') == backend
            if not BASELINE:
                typography(page)
                assert page.locator('[data-life-attribute="neuralStability"]').count() == 1
                assert page.locator('.preview-seed').evaluate('(e)=>getComputedStyle(e).transform') == 'none'
            page.screenshot(path=str(OUTPUT/f'{prefix}-sandbox-{backend}-{size}.png'))
            if not BASELINE:
                for stage in range(1,8):
                    page.evaluate("""async stage=>{await testPreview.change(s=>{const n=structuredClone(s);n.mind.stage=stage;return n;});testPreview.render(performance.now());}""",stage)
                    settle(page)
                    assert page.locator('#scene').get_attribute('data-stage') == str(stage)
                    # Geometry envelope and matching backing/container dimensions.
                    metrics = page.evaluate("""()=>{
                      const p=testPreview,v=p.view,b=p.host.getBoundingClientRect();
                      const f=v.framing;
                      return {width:b.width,height:b.height,bufferWidth:v.width,bufferHeight:v.height,extent:f.unit*f.zoom*f.radius,min:Math.min(v.width,v.height)};
                    }""")
                    assert metrics['width'] == metrics['bufferWidth'] and metrics['height'] == metrics['bufferHeight']
                    assert metrics['extent'] <= metrics['min']*.461
                    page.screenshot(path=str(OUTPUT/f'stage-{stage}-{backend}-{size}.png'))
                    # Project an actual canonical node and click it through the host.
                    point = page.evaluate("""()=>{
                      const p=testPreview,v=p.view,b=p.host.getBoundingClientRect();
                      if(p.timeline.stage===1)return {x:b.left+b.width/2,y:b.top+b.height/2- v.framing.unit*.1};
                      let x,y;if(v.three){const q=new v.three.Vector3().fromArray(v.buffers.positions,0).applyMatrix4(v.root.matrixWorld).project(v.camera);x=(q.x+1)*v.width/2;y=(1-q.y)*v.height/2;}
                      else{const q=new Float32Array(2);v.project(v.buffers.positions,0,q);[x,y]=q;}
                      return {x:b.left+x,y:b.top+y};
                    }""")
                    page.evaluate('testPreview.view.selectedCanonical=null')
                    page.mouse.click(point['x'],point['y']); assert page.evaluate('!!testPreview.view.selectedCanonical')
                    # Drag and wheel still drive the shared interaction, then resize.
                    before = page.evaluate('testPreview.interaction.rotation.y')
                    box = page.locator('#scene').bounding_box(); x=box['x']+box['width']/2;y=box['y']+box['height']/2
                    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+35,y+15,steps=4);page.mouse.up()
                    assert page.evaluate('testPreview.interaction.rotation.y') != before
                    for direction in [-10000,10000]:
                        page.mouse.wheel(0,direction);page.evaluate('testPreview.interaction.update(10)');page.evaluate('testPreview.render(performance.now()+100)')
                        assert page.evaluate('testPreview.interaction.zoom >= .72 && testPreview.interaction.zoom <= 1.48')
                        assert page.evaluate('testPreview.view.framing.unit*testPreview.view.framing.zoom*testPreview.view.framing.radius <= Math.min(testPreview.width,testPreview.height)*.461')
                    page.set_viewport_size({'width':viewport['width']-20,'height':viewport['height']-20});settle(page)
                    page.set_viewport_size(viewport);settle(page)
                # Sandbox reload preserves Life 2.0 and permanent identities.
                identity=page.evaluate('testPreview.state.mind.id');page.reload()
                page.evaluate("""async()=>{const {SandboxPreview}=await import('/src/preview/sandbox/controller.js');window.testPreview=new SandboxPreview();await testPreview.start();testPreview.panel.open=false;cancelAnimationFrame(testPreview.frame);testPreview.frame=null;testPreview.schedule=()=>{};}""")
                assert page.evaluate('testPreview.state.mind.id') == identity
                assert page.evaluate('testPreview.state.mind.life.version') == 2
                for value in page.locator('[data-life-attribute] strong').all_text_contents(): assert value.endswith('%') and value[:-1].isdigit(),value
            assert not errors,errors
            context.close()
            print(f'PASS {prefix}: {backend} {size}',flush=True)
    browser.close()
