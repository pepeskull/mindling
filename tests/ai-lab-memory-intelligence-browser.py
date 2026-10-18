"""Browser test for isolated Memory Intelligence Lab review and persistence.

The worker is an explicit orchestration fixture. Real-model quality is tested by
tests/ai-lab-memory-intelligence-real.py and must never be inferred from this test.
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8000")

WORKER_FIXTURE = """(() => {
  const nativeWorker = globalThis.Worker;
  class MemoryWorker {
    constructor(url) { this.url=String(url); this.listeners={message:new Set(),error:new Set()}; this.calls=0; }
    addEventListener(type,callback){this.listeners[type].add(callback)}
    removeEventListener(type,callback){this.listeners[type].delete(callback)}
    postMessage(message){queueMicrotask(()=>{
      if(message.action==='init') return this.send(message.id,{ready:true});
      if(message.action==='dispose') return this.send(message.id,{disposed:true});
      if(message.action==='analyze'){
        this.calls++; const p=message.payload; const existing=p.state.canonicalMemories[0];
        const proposal={id:p.runId,originalText:p.originalText,embedding:this.calls===1?[1,0]:[.9,.1],createdAt:new Date().toISOString(),language:'en',
          domain:{name:'Fixture Domain',source:'model',status:'proposed',qualified:false},topic:{name:'Fixture Topic',source:'model',status:'proposed',qualified:false},
          informationType:{primary:'FACT_CLAIM',secondary:[],modelEstimate:.5,qualified:false,qualificationReason:'LOCAL_ANALYSIS_MODEL_UNQUALIFIED'},
          categoryDecision:{action:this.calls===1?'CREATE_NEW':'REUSE_EXISTING',existingCategoryId:p.state.categories[0]?.id||null,modelEstimate:.5,qualified:false},
          memoryDecision:{modelProposedAction:existing?'LINK_EXISTING':'CREATE_NEW',modelProposedTargetMemoryId:existing?.id||null,action:'NEEDS_REVIEW',targetMemoryId:null,requiresReview:true,modelEstimate:.5,reason:'fixture',evidence:p.originalText,qualified:false,qualificationReason:'LOCAL_ANALYSIS_MODEL_UNQUALIFIED'},
          evidence:{embeddingModel:'fixture-embedding',classificationModel:'fixture-analysis',decisionModel:'fixture-analysis'},
          candidates:{memories:existing?[{id:existing.id,similarity:.9}]:[],categories:[]},diagnostics:{validation:{valid:true,errors:[]},timings:{embeddingMs:1,analysisMs:1,totalMs:2},rawModelOutput:'fixture'}};
        return this.send(message.id,{proposal,modelStatus:{}});
      }
    })}
    send(id,result){for(const cb of this.listeners.message)cb({data:{id,result}})} terminate(){}
  }
  globalThis.Worker=function(url,options){return String(url).includes('memory-intelligence-worker')?new MemoryWorker(url):new nativeWorker(url,options)};
})()"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    context.add_init_script(WORKER_FIXTURE)
    page = context.new_page()
    page.goto(f"{BASE}/ai-lab/", wait_until="networkidle")
    page.evaluate("""async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('mindling-db',1);r.onupgradeneeded=()=>r.result.createObjectStore('sentinel');r.onsuccess=()=>{const db=r.result,tx=db.transaction('sentinel','readwrite');tx.objectStore('sentinel').put({value:'preserved'},'player');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}})""")

    page.locator("[data-memory-enable]").click()
    page.locator("[data-memory-status]").filter(has_text="Ready for local analysis").wait_for(timeout=5000)
    page.locator("[data-memory-input]").fill("A fixture observation about an unfamiliar subject.")
    page.locator("[data-memory-run]").click()
    page.locator("[data-memory-stages]").filter(has_text="NEEDS_REVIEW").wait_for(timeout=5000)
    page.locator("[data-review-action]").select_option("CREATE_NEW")
    page.locator("[data-memory-review] button[type=submit]").click()
    page.locator("[data-memory-status]").filter(has_text="saved atomically").wait_for(timeout=5000)
    assert "1" in page.locator("[data-memory-stats]").inner_text()

    page.locator("[data-memory-input]").fill("The same fixture observation expressed differently.")
    page.locator("[data-memory-run]").click()
    page.locator("[data-memory-proposal]").wait_for(timeout=5000)
    page.locator("[data-review-action]").select_option("LINK_EXISTING")
    target = page.locator("[data-review-target] option").nth(1).get_attribute("value")
    page.locator("[data-review-target]").select_option(target)
    page.locator("[data-memory-review] button[type=submit]").click()
    page.locator("[data-memory-status]").filter(has_text="saved atomically").wait_for(timeout=5000)
    assert "2 active observation(s)" in page.locator("[data-memory-memories]").inner_text()

    page.reload(wait_until="networkidle")
    assert "2 active observation(s)" in page.locator("[data-memory-memories]").inner_text()
    databases = page.evaluate("indexedDB.databases().then(rows=>rows.map(row=>row.name).sort())")
    assert "mindling-ai-memory-lab-v1" in databases
    assert "mindling-db" in databases

    page.on("dialog", lambda dialog: dialog.accept())
    page.locator("[data-memory-undo]").click()
    page.locator("[data-memory-status]").filter(has_text="decision undone").wait_for(timeout=5000)
    assert "1 active observation(s)" in page.locator("[data-memory-memories]").inner_text()
    page.locator("[data-memory-reset]").click()
    page.locator("[data-memory-status]").filter(has_text="lab state reset").wait_for(timeout=5000)
    assert "No accepted memories yet" in page.locator("[data-memory-memories]").inner_text()
    sentinel = page.evaluate("""async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('mindling-db');r.onsuccess=()=>{const db=r.result,q=db.transaction('sentinel').objectStore('sentinel').get('player');q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}})""")
    assert sentinel == {"value": "preserved"}
    browser.close()

print("Memory Intelligence Lab isolation, review, persistence and reset checks passed.")
