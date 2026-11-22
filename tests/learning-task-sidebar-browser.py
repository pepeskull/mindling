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
      research:{taskId:taskId(1),sourceURL:source.url}},...Array.from({length:18},(_,i)=>({
        id:'observation-'+String(i).padStart(2,'0'),content:'Observation '+i,topic:'Observation '+i,category:i%2?'Astronomy':'Science'
      }))],
    learningTasks:Array.from({length:20},(_,i)=>({
      version:1,engineVersion:4,id:taskId(i),mindlingId:'sidebar-fixture',
      requestId:'fixture-'+i,run:'fixture',session:'fixture-session',mode:'TALK_RESEARCH',
      objective:'Learn about topic '+i,topic:'Topic '+i,createdAt:1,updatedAt:i+1,attempts:0,
      status:i<2?'COMPLETED':i===3?'CANCELLED':i===19?'RESEARCHING':'BLOCKED',
      code:({2:'MODEL_CLARIFICATION',17:'ACCESS_DISABLED',18:'OFFLINE',19:'SEARCHING'})[i]||'NO_EVIDENCE',
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
    page.wait_for_function('view.taskNodes.size === 19 && view.canvas.width > 0')
    return page

def boxes(page, selectors):
    return [page.locator(selector).bounding_box() for selector in selectors]

def check_sidebar(page, touch):
    sidebar = page.locator('.knowledge-graph-panel .knowledge-sidebar')
    tasks_tab = sidebar.get_by_role('tab', name='Learning Tasks')
    memories_tab = sidebar.get_by_role('tab', name='Browse Memories')
    tasks_panel = sidebar.locator('.research-task-browser')
    memories_panel = sidebar.locator('.memory-browser')
    assert tasks_panel.count() == memories_panel.count() == page.locator('.memory-browser').count() == 1
    assert tasks_tab.get_attribute('aria-selected') == 'true'
    assert tasks_panel.is_visible() and not memories_panel.is_visible()
    assert page.locator('.neural-memory-grid .memory-eyebrow').all_text_contents() == [
        '01 / LEARNING & MEMORY', '02 / EXPLORE', '03 / PERSPECTIVE', '04 / CONNECTION DETAIL'
    ]

    panel, explore, stage = boxes(page, ['.knowledge-sidebar', '.knowledge-explore', '.memory-graph-stage'])
    if touch:
        assert panel['x'] == explore['x'] and panel['width'] == explore['width']
        assert panel['y'] + panel['height'] <= explore['y']
    else:
        assert panel['x'] + panel['width'] == explore['x']
        assert panel['y'] == explore['y'] and panel['height'] == explore['height']
    assert stage['x'] == explore['x'] and stage['width'] == explore['width']
    assert page.locator('.knowledge-graph-panel').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    assert tasks_panel.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    if touch:
        tasks = tasks_panel.locator('ul')
        assert tasks.evaluate('(el) => el.scrollHeight > el.clientHeight')
        tasks.evaluate('(el) => { el.scrollTop = el.scrollHeight; }')
        assert tasks.evaluate('(el) => el.scrollTop > 0')
        assert tasks_panel.evaluate('(el) => el.scrollTop === 0')

    search, status = sidebar.locator('[data-task-search]'), sidebar.locator('[data-task-filter]')
    for control in (search, status):
        assert control.evaluate('(el) => getComputedStyle(el).margin') == '10px 0px'
    rows = sidebar.locator('[data-select-learning]')
    pagination = sidebar.locator('[data-task-page-label]')
    previous, next_page = sidebar.locator('[data-task-page=prev]'), sidebar.locator('[data-task-page=next]')
    assert rows.count() == 14 and rows.first.locator('.task-title').inner_text() == 'Topic 19'
    assert pagination.inner_text() == '1–14 of 19' and previous.is_disabled()
    for title, label, tone in [('Topic 19', 'Exploring', 'active'), ('Topic 18', 'Paused', 'attention'),
                               ('Topic 17', 'Waiting', 'attention'), ('Topic 16', 'Finished', 'neutral')]:
        badge = rows.filter(has=page.get_by_text(title, exact=True)).locator('.task-status')
        assert badge.inner_text() == label and badge.get_attribute('data-tone') == tone
    next_page.click()
    assert pagination.inner_text() == '15–19 of 19' and rows.count() == 5 and next_page.is_disabled()
    previous.click()
    assert pagination.inner_text() == '1–14 of 19' and previous.is_disabled()
    search.fill('topic 5')
    assert rows.count() == 1 and rows.first.inner_text().startswith('Topic 5')
    assert pagination.inner_text() == '1–1 of 1' and previous.is_disabled() and next_page.is_disabled()
    search.fill('')
    status.select_option('active')
    assert pagination.inner_text() == '1–14 of 17'
    next_page.click()
    assert pagination.inner_text() == '15–17 of 17' and rows.count() == 3 and next_page.is_disabled()
    status.select_option('actionable')
    assert rows.count() == 1 and rows.first.inner_text().startswith('Topic 2')
    assert pagination.inner_text() == '1–1 of 1' and previous.is_disabled()
    assert rows.first.locator('.task-status').inner_text() == 'Waiting for you'
    assert rows.first.locator('.task-status').get_attribute('data-tone') == 'attention'
    rows.first.click()
    assert rows.first.get_attribute('aria-pressed') == 'true'
    detail = page.locator('.memory-inspector-content')
    assert 'Which aspect?' in detail.inner_text()
    detail.get_by_role('button', name='Answer my question').click()
    assert page.evaluate('taskAction.action === "clarify" && taskAction.id.endsWith("2")')

    status.select_option('completed')
    assert rows.count() == 2 and rows.first.inner_text().startswith('Topic 1')
    assert rows.first.locator('.task-status').inner_text() == 'Completed'
    assert rows.first.locator('.task-status').get_attribute('data-tone') == 'success'
    rows.first.click()
    assert rows.first.get_attribute('aria-pressed') == 'true'
    assert '1 new memory' in detail.inner_text()
    assert detail.locator('.compact-memory').count() == 1
    assert 'Saturn source' not in detail.inner_text()
    assert detail.locator('a, .memory-entry-context').count() == 0
    status.select_option('all')
    search.fill('topic')
    next_page.click()
    assert pagination.inner_text() == '15–19 of 19'
    assert page.evaluate('JSON.stringify(sidebarState) === initialState')

    rectangles = ['.memory-graph-stage', '.knowledge-radar-panel', '.memory-inspector']
    before = boxes(page, rectangles)
    camera = page.evaluate('JSON.stringify([view.selected,view.pan,view.zoom])')
    tasks_tab.press('ArrowRight')
    assert memories_tab.get_attribute('aria-selected') == 'true'
    assert memories_tab.evaluate('(el) => el === document.activeElement')
    assert memories_panel.is_visible() and not tasks_panel.is_visible()
    after = boxes(page, rectangles)
    assert after == before, (before, after)
    assert page.evaluate('JSON.stringify([view.selected,view.pan,view.zoom])') == camera

    memory_rows = memories_panel.locator('[data-select-memory]')
    memory_page = memories_panel.locator('[data-memory-page-label]')
    memory_previous = memories_panel.locator('[data-memory-page=prev]')
    memory_next = memories_panel.locator('[data-memory-page=next]')
    assert memory_rows.count() == 14 and memory_page.inner_text() == '1–14 of 19' and memory_previous.is_disabled()
    assert memories_panel.locator('ul').evaluate('(el) => el.scrollHeight > el.clientHeight')
    assert memory_rows.first.evaluate('''el => {
      const style=getComputedStyle(el);
      return style.borderLeftWidth==='2px' && style.backgroundImage.startsWith('linear-gradient') && !!style.getPropertyValue('--memory-area-color');
    }''')
    memory_next.click()
    assert memory_rows.count() == 5 and memory_page.inner_text() == '15–19 of 19' and memory_next.is_disabled()
    memory_previous.click()
    assert memory_page.inner_text() == '1–14 of 19'
    memory_next.click()
    memory_rows.last.press('Enter')
    assert memory_rows.last.get_attribute('aria-pressed') == 'true'
    assert memory_rows.last.evaluate('(el) => getComputedStyle(el).backgroundImage') == 'none'
    assert page.locator('#memory-inspector-title').inner_text() == 'Saturn'
    assert page.evaluate('view.positions.get(view.selected)?.recordId === "saturn"')

    page.evaluate('''async () => {
      view.scheduleSave(0);
      await view.saveChain;
      view.destroy();
      mountSidebarView();
    }''')
    page.wait_for_function('view.taskNodes.size === 19 && !view.loadingView')
    assert memories_panel.is_visible() and memory_page.inner_text() == '15–19 of 19'
    assert memory_rows.last.get_attribute('aria-pressed') == 'true'
    memories_tab.press('Home')
    assert tasks_panel.is_visible() and not memories_panel.is_visible()
    assert search.input_value() == 'topic' and status.input_value() == 'all'
    assert pagination.inner_text() == '15–19 of 19'
    assert page.locator('#memory-inspector-title').inner_text() == 'Saturn'
    page.get_by_role('button', name='Fit graph').click()
    assert page.evaluate('view.autoFit && view.zoom > 0')
    pan = page.evaluate('view.pan.x')
    page.locator('.memory-graph-stage canvas:not(.memory-flow)').press('ArrowLeft')
    assert page.evaluate('view.pan.x') == pan + 35
    assert page.evaluate('view.taskPage === 1 && view.query === "" && view.taskQuery === "topic" && view.positions.get(view.selected)?.recordId === "saturn"')
    page.get_by_role('button', name='Zoom in').click()
    assert page.evaluate('view.zoom > view.fitZoom')
    page.get_by_role('button', name='Reset view').click()
    assert page.evaluate('view.autoFit && view.zoom === view.fitZoom')
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
