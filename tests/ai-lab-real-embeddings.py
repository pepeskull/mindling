"""Opt-in real Chromium embedding run through the AI Lab UI.

Start the repository server, then run:
  MINDLING_AI_LAB_REAL=1 python3 tests/ai-lab-real-embeddings.py

This downloads pinned public model artifacts on demand. It does not mock the
worker, disable TLS verification, or access gameplay data.
"""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright

if os.environ.get("MINDLING_AI_LAB_REAL") != "1":
    raise SystemExit("Not run: set MINDLING_AI_LAB_REAL=1 to consent to model downloads.")

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8000")
BACKEND = os.environ.get("MINDLING_AI_LAB_BACKEND", "wasm")
MODELS = os.environ.get("MINDLING_AI_LAB_MODELS", "multilingual-minilm,multilingual-e5-small").split(",")
TIMEOUT_MS = int(os.environ.get("MINDLING_AI_LAB_TIMEOUT_MS", "1200000"))
SENTENCES = """I want to become a successful stock trader.
You should learn how to invest in stocks.
I think programming is amazing.
How does the stock market work?
The Earth rotates around its axis.
Yesterday I lost money trading cryptocurrencies.
Jag vill lära mig att programmera.
Jag tycker att aktiehandel är svårt."""

with sync_playwright() as playwright, TemporaryDirectory() as temporary:
    arguments = ["--no-sandbox"]
    if BACKEND == "webgpu":
        arguments += ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan"]
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=arguments)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    failures = []
    page.on("requestfailed", lambda request: failures.append({"url": request.url, "failure": request.failure}))
    page.goto(f"{BASE}/ai-lab/", wait_until="networkidle")
    output = []
    for model in MODELS:
        page.locator("[data-relationship-model]").select_option(model)
        page.locator("[data-backend]").select_option(BACKEND)
        page.locator("[data-developer-diagnostics]").check()
        page.locator("[data-relationship-input]").fill(SENTENCES)
        page.locator("[data-run-relationships]").click()
        page.locator("[data-run-progress]").filter(has_text="Sequence complete").wait_for(timeout=TIMEOUT_MS)
        if page.locator("[data-export]").is_disabled():
            output.append({
                "model": model,
                "failed": True,
                "visibleDiagnostic": page.locator("[data-relationship-output]").inner_text(),
                "transportFailures": failures,
            })
            continue
        with page.expect_download() as download_info:
            page.locator("[data-export]").click()
        target = Path(temporary) / f"{model}.json"
        download_info.value.save_as(target)
        exported = json.loads(target.read_text())
        output.append(exported["latestRelationship"])
    print(json.dumps({"backend": BACKEND, "results": output}, ensure_ascii=False, indent=2))
    browser.close()
