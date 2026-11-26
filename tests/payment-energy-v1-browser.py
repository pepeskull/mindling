"""Offline Dashboard top-up, signing flow, and IndexedDB reload."""
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mindling.test'
ADDRESS = 'So11111111111111111111111111111111111111112'
SESSION = 'a' * 48
BOOT = """
const {MindlingApp}=await import('/src/app/app.js');
const app=window.fixtureApp=new MindlingApp();
app.forceCanvas=true;
await app.start();
window.fixtureReady=true;
"""
SEED = """
async()=>{
  const {MindlingDatabase}=await import('/src/storage/database.js');
  const {createLocalIdentity}=await import('/src/identity/identity.js');
  const {createSandbox,newMindling}=await import('/src/preview/sandbox/engine.js');
  const db=await new MindlingDatabase().open();
  const identity=await createLocalIdentity();
  const state=newMindling(createSandbox(Date.now()),{id:identity.mindlingId,name:'Payment fixture',confirmed:true});
  state.mind.energy.remaining=2;
  await db.changeGameplay(()=>state,{identity});db.close();
}
"""


def run(browser):
    page = browser.new_page(viewport={'width': 390, 'height': 820}, reduced_motion='reduce')
    seen = []
    unexpectedly_sent = []
    errors = []
    session = None
    remaining, revision, pending, held = 2, 1, True, 0

    def route_request(route):
        nonlocal session, remaining, revision, pending, held
        url = urlparse(route.request.url)
        if url.hostname != 'mindling.test':
            route.abort()
            return
        if url.path == '/fixture':
            route.fulfill(content_type='text/html', body='<html><body></body></html>')
            return
        if url.path == '/js/bootstrap.js':
            route.fulfill(content_type='application/javascript', body=BOOT)
            return
        if url.path == '/api/mindling/energy':
            body = route.request.post_data_json
            action = body['action']
            seen.append(action)
            if action not in ('availability', 'challenge'):
                assert len(route.request.headers['x-mindling-signature']) == 128
            if action == 'availability':
                result = {'active': True, 'cluster': 'devnet'}
            elif action == 'challenge':
                # This fixture derives the fingerprint, so the real browser signer
                # can reject a challenge for a different saved identity.
                import hashlib
                key = body['publicKey']
                canonical = {k: key[k] for k in ('crv', 'kty', 'x', 'y')}
                result = {'nonce': SESSION, 'fingerprint': hashlib.sha256(
                    json.dumps(canonical, separators=(',', ':')).encode()).hexdigest()}
            elif action in ('register', 'state'):
                result = {'energy': energy(remaining, revision)}
            elif action == 'local-talk':
                assert isinstance(body['id'], str) and len(body['id']) == 64
                held = 1
                revision += 1
                result = {'energy': energy(remaining, revision)}
            elif action == 'settle':
                assert held == 1 and body['committed'] and body['cost'] == 1
                held = 0
                remaining -= 1
                revision += 1
                result = {'energy': energy(remaining, revision)}
            elif action == 'payment-current':
                result = {'session': session}
            elif action == 'payment-create':
                timestamp = page_date()
                session = {'id': SESSION, 'cluster': 'devnet', 'address': ADDRESS, 'units': '19900000',
                           'decimals': 6, 'createdAt': timestamp, 'expiresAt': timestamp + 600000}
                result = {'session': session}
            elif action == 'payment-check':
                assert body['id'] == SESSION
                if pending:
                    pending = False
                    route.fulfill(status=409, json={'error': {'code': 'PAYMENT_PENDING'}})
                    return
                remaining, revision = 10, 2
                session['receipt'] = {'id': SESSION, 'energyRevision': revision}
                result = {'energy': energy(remaining, revision), 'receipt': session['receipt']}
            else:
                raise AssertionError(action)
            route.fulfill(json=result)
            return
        if url.path.startswith('/api/'):
            unexpectedly_sent.append(url.path)
            route.abort()
            return
        path = ROOT / url.path.lstrip('/')
        if url.path == '/':
            path = ROOT / 'index.html'
        if path.is_file():
            route.fulfill(path=path)
        else:
            route.fulfill(status=404)

    def page_date():
        import time
        return int(time.time() * 1000)

    def energy(value, rev):
        now = page_date()
        return {'version': 2, 'remaining': value, 'capacity': 10, 'bonus': 0, 'reserved': held,
                'updatedAt': now, 'serverTime': now, 'revision': rev, 'stage': 1}

    page.route('**/*', route_request)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/fixture')
    page.evaluate(SEED)
    page.goto(BASE + '/')
    page.wait_for_function('window.fixtureReady')
    button = page.locator('.energy-panel .coming-soon')
    try:
        expect(button).to_be_enabled()
    except AssertionError as error:
        raise AssertionError((seen, errors, page.locator('.interaction-status').text_content())) from error
    expect(page.locator('[data-energy-value]')).to_have_text('2 / 10')
    # Mobile uses the Dashboard sheet for the Energy panel.
    if not button.is_visible():
        page.locator('[data-mobile-view=dashboard]').click()
    button.click()
    dialog = page.get_by_role('dialog', name='Energy top-up')
    expect(dialog.get_by_text('19.900000 MIND · $1.99 test quote')).to_be_visible()
    expect(dialog.locator('[data-qr] svg')).to_be_visible()
    expect(button).to_have_text(ADDRESS[:5] + '…' + ADDRESS[-5:])
    check = dialog.get_by_role('button', name='Check payment')
    check.click()
    expect(dialog.get_by_role('status')).to_have_text('Waiting for the transaction to finalize.')
    expect(page.locator('[data-energy-value]')).to_have_text('2 / 10')
    check.click()
    expect(dialog).to_be_hidden()
    expect(page.locator('[data-energy-value]')).to_have_text('10 / 10')
    page.reload()
    page.wait_for_function('window.fixtureReady')
    expect(button).to_be_enabled()
    expect(page.locator('[data-energy-value]')).to_have_text('10 / 10')
    assert page.evaluate('fixtureApp.state.mind.energyAuthority.revision') == 2
    page.locator('#mindling-input').fill('How are you developing this afternoon?')
    page.locator('#interaction-form button[type=submit]').click()
    expect(page.locator('[data-energy-value]')).to_have_text('9 / 10')
    page.wait_for_function("fixtureApp.state.mind.energyAuthority.pending?.length===0")
    assert seen.count('local-talk') == 1 and seen.count('settle') == 1
    assert seen.count('payment-create') == 1
    assert seen.count('payment-check') == 2
    assert not errors, errors
    assert not unexpectedly_sent, unexpectedly_sent
    page.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        run(browser)
        browser.close()
    print('PASS: local mobile Dashboard top-up, Web Crypto signing, QR, pending finality, successful synchronization, IndexedDB reload and one settled Talk charge.')
