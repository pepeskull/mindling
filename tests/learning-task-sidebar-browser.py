"""Exercise the relocated task browser with synthetic data and local assets."""
import os
import subprocess

from playwright.sync_api import sync_playwright

BASE = os.environ.get('MINDLING_TEST_URL', 'http://127.0.0.1:8771')
BASELINE = os.environ.get('MINDLING_BASELINE_REF')
LAYOUT_FILES = ('src/memory/neural-memory-view.js', 'css/neural-memory.css')

SETUP = """async () => {
  const {NeuralMemoryView}=await import('/src/memory/neural-memory-view.js');
  const taskId=i=>String(i).padStart(64,'0');
  const source={url:'https://example.test/astronomy',title:'Saturn source',authorizedAt:1};
  const state={
    id:'sidebar-fixture',learningSession:'fixture-session',
    memories:[{id:'saturn',content:'Saturn has rings.',category:'Science',topic:'Saturn',
      research:{taskId:taskId(1),sourceURL:source.url}}],
    learningTasks:Array.from({length:10},(_,i)=>({
      version:1,engineVersion:4,id:taskId(i),mindlingId:'sidebar-fixture',
      requestId:'fixture-'+i,run:'fixture',session:'fixture-session',mode:'TALK_RESEARCH',
      objective:'Learn about topic '+i,topic:'Topic '+i,createdAt:1,updatedAt:i+1,attempts:0,
      status:i<2?'COMPLETED':i===3?'CANCELLED':'BLOCKED',
      code:i===2?'MODEL_CLARIFICATION':'NO_EVIDENCE',
      ...(i===2&&{coordinatorClarification:{version:1,kind:'model-scope',field:'detail',
        question:'Which aspect?',options:[{id:'example',label:'Examples',value:'Examples'}],freeText:false}}),
      completedWork:['understanding'],referenceIds:[],sourceReferences:i===1?[source]:[],knowledgeIds:i===1?['saturn']:[],
      sourceRequests:0,plan:[],message:'Fixture',energyCharged:false,timeSensitive:false
    }))
  };
  window.sidebarState=state;
  window.initialState=JSON.stringify(state);
  document.querySelector('#app').hidden=false;
  document.querySelector('.dashboard-chrome').classList.remove('is-hidden');
  document.querySelector('#app').classList.add('memory-mode');
  const root=document.querySelector('#memory-view');root.hidden=false;
  window.mountSidebarView=()=> {
    window.view=new NeuralMemoryView(root,{
      onLearningTask:(action,id)=>{window.taskAction={action,id};},
      onMemoryView:async (_id,value)=> {
        if(value)window.savedLayout={...value,version:1,revision:value.revision+1};
        return window.savedLayout;
      }
    });
    view.update(state);view.setVisible(true);
  };
  mountSidebarView();
}"""

def mount(context, overrides=None, errors=None):
    assets = {'js/bootstrap.js': '', **(overrides or {})}

    def route_asset(route):
        url = route.request.url
        if not url.startswith(BASE + '/') or '/api/' in url:
            route.abort()
            return
        path = url[len(BASE) + 1:].split('?', 1)[0]
        if path in assets:
            route.fulfill(body=assets[path], content_type='text/css' if path.endswith('.css') else 'application/javascript')
        else:
            route.continue_()

    context.route('**/*', route_asset)
    page = context.new_page()
    if errors is not None:
        page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/')
    page.evaluate(SETUP)
    page.wait_for_function('view.taskNodes.size === 9 && view.canvas.width > 0')
    return page

def boxes(page, selectors):
    return [page.locator(selector).bounding_box() for selector in selectors]

def check_sidebar(page, touch):
    sidebar = page.locator('.knowledge-graph-panel .research-task-browser')
    assert sidebar.count() == page.locator('.research-task-browser').count() == 1
    assert sidebar.evaluate('(node) => node.tagName === "SECTION" && !node.querySelector("summary")')
    assert sidebar.get_by_role('heading', name='Learning Tasks').is_visible()
    assert page.locator('.neural-memory-grid .memory-eyebrow').all_text_contents() == [
        '01 / LEARNING TASKS', '02 / EXPLORE', '03 / PERSPECTIVE', '04 / CONNECTION DETAIL'
    ]
    assert page.evaluate('''() => {
      const metrics=id=>{const style=getComputedStyle(document.getElementById(id));return [style.fontSize,style.fontWeight,style.fontFamily].join(',');};
      return metrics('learning-tasks-title')===metrics('knowledge-areas-title') && metrics('learning-tasks-title')===metrics('coverage-title');
    }''')

    panel, explore, stage = boxes(page, ['.research-task-browser', '.knowledge-explore', '.memory-graph-stage'])
    if touch:
        assert panel['x'] == explore['x'] and panel['width'] == explore['width']
        assert panel['y'] + panel['height'] <= explore['y']
    else:
        assert panel['x'] + panel['width'] == explore['x']
        assert panel['y'] == explore['y'] and panel['height'] == explore['height']
    assert stage['x'] == explore['x'] and stage['width'] == explore['width']
    assert page.locator('.knowledge-graph-panel').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    assert sidebar.locator('.task-browser-body').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    if touch:
        tasks = sidebar.locator('ul')
        assert tasks.evaluate('(el) => el.scrollHeight > el.clientHeight')
        tasks.evaluate('(el) => { el.scrollTop = el.scrollHeight; }')
        assert tasks.evaluate('(el) => el.scrollTop > 0')
        assert sidebar.locator('.task-browser-body').evaluate('(el) => el.scrollTop === 0')

    search, status = sidebar.locator('[data-task-search]'), sidebar.locator('[data-task-filter]')
    rows = sidebar.locator('[data-select-learning]')
    pagination = sidebar.locator('[data-task-page-label]')
    previous, next_page = sidebar.locator('[data-task-page=prev]'), sidebar.locator('[data-task-page=next]')
    assert rows.count() == 6 and rows.first.inner_text().startswith('Topic 9')
    assert pagination.inner_text() == '1–6 of 9' and previous.is_disabled()
    next_page.click()
    assert pagination.inner_text() == '7–9 of 9' and next_page.is_disabled()
    previous.click()
    assert pagination.inner_text() == '1–6 of 9'
    search.fill('topic 5')
    assert rows.count() == 1 and rows.first.inner_text().startswith('Topic 5')
    search.fill('')
    status.select_option('active')
    assert pagination.inner_text() == '1–6 of 7'
    status.select_option('actionable')
    assert rows.count() == 1 and rows.first.inner_text().startswith('Topic 2')
    rows.first.click()
    assert rows.first.get_attribute('aria-pressed') == 'true'
    detail = page.locator('.memory-inspector-content')
    assert 'Which aspect?' in detail.inner_text()
    detail.get_by_role('button', name='Answer my question').click()
    assert page.evaluate('taskAction.action === "clarify" && taskAction.id.endsWith("2")')

    status.select_option('completed')
    assert rows.count() == 2 and rows.first.inner_text().startswith('Topic 1')
    rows.first.click()
    assert rows.first.get_attribute('aria-pressed') == 'true'
    assert '1 new memory' in detail.inner_text()
    assert detail.locator('.compact-memory').count() == 1
    assert 'Saturn source' not in detail.inner_text()
    assert detail.locator('a, .memory-entry-context').count() == 0
    status.select_option('all')
    search.fill('topic')
    next_page.click()
    assert pagination.inner_text() == '7–9 of 9'
    assert page.evaluate('JSON.stringify(sidebarState) === initialState')

    page.evaluate('''async () => {
      view.scheduleSave(0);
      await view.saveChain;
      view.destroy();
      mountSidebarView();
    }''')
    page.wait_for_function('view.taskNodes.size === 9 && !view.loadingView')
    assert sidebar.get_by_role('heading', name='Learning Tasks').is_visible()
    assert search.input_value() == 'topic' and status.input_value() == 'all'
    assert pagination.inner_text() == '7–9 of 9'
    assert rows.last.get_attribute('aria-pressed') != 'true'
    assert rows.filter(has_text='Topic 1').get_attribute('aria-pressed') == 'true'
    page.get_by_role('button', name='Fit graph').click()
    assert page.evaluate('view.autoFit && view.zoom > 0')
    pan = page.evaluate('view.pan.x')
    page.locator('.memory-graph-stage canvas:not(.memory-flow)').press('ArrowLeft')
    assert page.evaluate('view.pan.x') == pan + 35
    assert page.evaluate('view.taskPage === 1 && view.taskQuery === "topic" && view.selected.endsWith("1")')
    page.get_by_role('button', name='Zoom in').click()
    assert page.evaluate('view.zoom > view.fitZoom')
    page.get_by_role('button', name='Reset view').click()
    assert page.evaluate('view.autoFit && view.zoom === view.fitZoom')
    page.locator('.memory-browser summary').click()
    page.locator('.memory-browser [data-select-memory]').click()
    assert page.locator('#memory-inspector-title').inner_text() == 'Saturn'
    assert page.evaluate('JSON.stringify(sidebarState) === initialState')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    baseline_files = {file: subprocess.check_output(['git', 'show', f'{BASELINE}:{file}'], text=True)
                      for file in LAYOUT_FILES} if BASELINE else None
    for width, height, touch in [(1900, 940, False), (1024, 768, False), (390, 760, True), (320, 568, True)]:
        settings = dict(viewport={'width': width, 'height': height}, has_touch=touch, reduced_motion='reduce')
        context = browser.new_context(**settings)
        errors = []
        page = mount(context, errors=errors)
        if baseline_files:
            baseline = browser.new_context(**settings)
            protected = ['.knowledge-radar-panel', '.memory-inspector']
            assert boxes(mount(baseline, baseline_files), protected) == boxes(page, protected)
            baseline.close()
        check_sidebar(page, touch)
        assert not errors, errors
        context.close()
        print(f'{width}×{height}: permanent sidebar, filters, selection, graph controls and restore passed')
    browser.close()
