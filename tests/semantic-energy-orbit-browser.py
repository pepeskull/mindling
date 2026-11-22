"""Isolated IndexedDB, identity hydration and Integration Orbit interaction."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8771")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    for preview in (False, True):
        context = browser.new_context(viewport={"width": 1200, "height": 850})
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE + "/") and "/api/" not in route.request.url else route.abort())
        context.route("**/js/bootstrap.js", lambda route: route.fulfill(body="", content_type="application/javascript"))
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + ("/?stage-preview=1" if preview else "/"))
        page.evaluate("""async preview => {
          const {MindlingDatabase}=await import('/src/storage/database.js');
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open();
          const write=fn=>preview?db.change(fn):db.changeGameplay(fn);
          await write(()=>newMindling(createSandbox(Date.now()),{id:'orbit-'+preview,name:'Mira',confirmed:true}));
          await write(s=>{s.mind.energy.remaining=0;return s;});
          await write(s=>{s.mind.energy.remaining=2;return s;});
          db.close();
        }""", preview)
        page.reload()
        page.evaluate("""async preview => {
          const {MindlingDatabase}=await import('/src/storage/database.js');
          const {PreviewStore}=await import('/src/preview/sandbox/storage.js');
          const {researchEnergyReady}=await import('/src/autonomous/energy-readiness.js');
          const {IntegrationView}=await import('/src/integration/integration-view.js');
          const {StageChip}=await import('/src/ui/stage-chip.js');
          const db=await (preview?new PreviewStore():new MindlingDatabase()).open();
          const read=async()=>preview?db.read():(await db.get('gameplay','primary')).state;
          const write=fn=>preview?db.change(fn):db.changeGameplay(fn);
          const paused=await read();
          if(researchEnergyReady(paused.mind)||paused.mind.name!=='Mira')throw Error('Hydration');
          await write(s=>{s.mind.energy.remaining=3;return s;});
          await write(s=>{s.mind.energy.remaining=1;return s;});
          const resumed=await read();
          if(!researchEnergyReady(resumed.mind))throw Error('Hysteresis');
          db.close();
          document.querySelectorAll('.installation').forEach(e=>e.remove());
          document.querySelector('#app').hidden=false;
          document.querySelector('#app').classList.add('network-mode');
          document.querySelector('.dashboard-chrome').classList.remove('is-hidden');
          const chip=new StageChip(document.querySelector('[data-life-stage]'));
          chip.setStage('Neural Seed');chip.elapsed=31000;chip.setName(resumed.mind.name);
          if(chip.node.textContent!=='Mira is learning.')throw Error('Stage name');
          chip.destroy();
          window.orbit=new IntegrationView(document.querySelector('#network-view'));
          orbit.update(resumed.mind);orbit.setVisible(true);
        }""", preview)
        page.wait_for_function("orbit.time>0&&orbit.paths.length===11")
        assert page.locator("[data-platform][aria-pressed=true]").count() == 0
        assert page.locator(".integration-capabilities").count() == 0
        page.locator("[data-platform=github]").click()
        assert page.locator("[data-platform=github]").get_attribute("aria-pressed") == "true"
        before = page.evaluate("orbit.time")
        page.locator("[data-platform=notion]").focus()
        page.keyboard.press("Enter")
        assert page.locator("[data-platform=github]").get_attribute("aria-pressed") == "false"
        assert page.locator("[data-platform=notion]").get_attribute("aria-pressed") == "true"
        assert page.evaluate("orbit.time") >= before
        page.set_viewport_size({"width": 420, "height": 800})
        page.wait_for_function("orbit.width<420&&orbit.paths.every(path=>path.width>0)")
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_function("orbit.frame===null&&orbit.cloud.frame===null")
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_function("orbit.frame!==null")
        page.evaluate("orbit.setVisible(false)")
        assert page.evaluate("orbit.frame===null&&orbit.cloud.frame===null")
        page.evaluate("orbit.setVisible(true);orbit.destroy()")
        assert page.evaluate("orbit.frame===null&&orbit.cloud.frame===null&&orbit.ctx===null")
        assert not errors, errors
        print(("Stage Preview" if preview else "Normal") + ": hydrated name, durable Energy state, Orbit interaction, resize, reduced motion and cleanup passed.", flush=True)
        context.close()
    browser.close()
