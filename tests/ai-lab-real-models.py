"""Opt-in real browser inference through the AI Lab UI.

This can download several gigabytes. It uses synthetic text and no player data.
Start the repository server, then run:
  MINDLING_AI_LAB_REAL=1 python3 tests/ai-lab-real-models.py

Use MINDLING_AI_LAB_MODELS with comma-separated catalog keys for a bounded run.
No TLS checks are disabled and no model response is mocked.
"""
import json
import os
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

if os.environ.get("MINDLING_AI_LAB_REAL") != "1":
    raise SystemExit("Not run: set MINDLING_AI_LAB_REAL=1 to consent to real model downloads.")

BASE = os.environ.get("MINDLING_TEST_URL", "http://127.0.0.1:8000")
REQUESTED = os.environ.get("MINDLING_AI_LAB_MODELS")
TIMEOUT_MS = int(os.environ.get("MINDLING_AI_LAB_TIMEOUT_MS", "1200000"))
SYNTHETIC = "Become a trader in finance about stocks"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    failures = []
    page.on("requestfailed", lambda request: failures.append({
        "host": urlparse(request.url).hostname,
        "path": urlparse(request.url).path[-180:],
        "failure": request.failure,
    }))
    page.goto(f"{BASE}/ai-lab/", wait_until="networkidle")
    keys = page.locator("[data-model-card] input").evaluate_all("nodes => nodes.map(node => node.value)")
    if REQUESTED:
        allow = set(REQUESTED.split(","))
        keys = [key for key in keys if key in allow]
    report = []
    for key in keys:
        page.locator("[data-deselect-all]").click()
        page.locator(f'[data-model-card="{key}"] input').check()
        page.locator("[data-backend]").select_option("wasm")
        page.locator("[data-input]").fill(SYNTHETIC)
        started = time.monotonic()
        before_failures = len(failures)
        page.locator("[data-run]").click()
        try:
            page.locator("[data-run-progress]").filter(has_text="Sequence complete").wait_for(timeout=TIMEOUT_MS)
            card = page.locator(".result-card").last
            raw = json.loads(card.locator("pre").inner_text())
            result = {
                "model": key,
                "elapsedSeconds": round(time.monotonic() - started, 3),
                "status": card.locator(".status").inner_text(),
                "observed": card.locator(".observed-grid").inner_text(),
                "raw": raw,
                "transportFailures": failures[before_failures:],
            }
        except Exception as error:
            result = {
                "model": key,
                "elapsedSeconds": round(time.monotonic() - started, 3),
                "status": "HARNESS_TIMEOUT_OR_PAGE_FAILURE",
                "error": str(error)[:1000],
                "progress": page.locator("[data-run-progress]").inner_text(),
                "transportFailures": failures[before_failures:],
            }
        report.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    print(json.dumps({"input": SYNTHETIC, "modelsAttempted": len(report), "report": report}, ensure_ascii=False, indent=2))
    browser.close()
