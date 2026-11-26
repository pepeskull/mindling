"""Offline Dashboard top-up, signing flow, and IndexedDB reload."""
import json
import os
from pathlib import Path
from urllib.parse import quote, urlparse

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


def run(browser, width):
    page = browser.new_page(viewport={'width': width, 'height': 820}, reduced_motion='reduce')
    seen = []
    unexpectedly_sent = []
    errors = []
    session = None
    market_unavailable = False
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
                assert route.request.headers['x-mindling-session'] == SESSION
                assert route.request.headers['x-mindling-nonce'] != SESSION
            if action == 'availability':
                result = {'active': True, 'cluster': 'mainnet'}
            elif action == 'challenge':
                # This fixture derives the fingerprint, so the real browser signer
                # can reject a challenge for a different saved identity.
                import hashlib
                key = body['publicKey']
                canonical = {k: key[k] for k in ('crv', 'kty', 'x', 'y')}
                result = {'nonce': SESSION, 'fingerprint': hashlib.sha256(
                    json.dumps(canonical, separators=(',', ':')).encode()).hexdigest(),
                          'expiresAt': page_date() + 300000}
            elif action in ('register', 'state'):
                result = {'energy': energy(remaining, revision)}
            elif action == 'local-talk':
                assert isinstance(body['id'], str) and len(body['id']) == 64
                held = 1
                revision += 1
                result = {'energy': energy(remaining, revision)}
            elif action == 'authorize-commit':
                assert held == 1 and body['cost'] == 1
                result = {'approval': 'b' * 64}
            elif action == 'settle':
                assert held == 1 and body['approval'] == 'b' * 64
                held = 0
                remaining -= 1
                revision += 1
                result = {'energy': energy(remaining, revision), 'receipt': {
                    'id': body['id'], 'charge': 1, 'balanceAfter': remaining, 'revision': revision}}
            elif action == 'payment-open':
                if market_unavailable:
                    route.fulfill(status=503, json={'error': {'code': 'MARKET_PRICE_UNAVAILABLE'}})
                    return
                if not session:
                    timestamp = page_date()
                    payload = 'solana:' + quote(BASE + '/api/mindling/pay?session=' + SESSION, safe='')
                    session = {'id': SESSION, 'cluster': 'mainnet', 'address': ADDRESS, 'units': '19900000',
                               'decimals': 6, 'createdAt': timestamp, 'expiresAt': timestamp + 600000,
                               'qrPayload': payload, 'sponsored': True}
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
    button = page.locator('[data-energy-wallet]')
    expect(button).to_be_enabled()
    expect(button.locator('span')).to_be_empty()
    page.wait_for_function("fixtureApp.state.mind.energyAuthority?.revision===1")
    startup = seen.copy()
    assert startup == ['availability', 'challenge', 'register'], (seen, errors)
    expect(page.locator('[data-energy-value]')).to_have_text('2 / 10')
    nav = '[data-mobile-view' if width < 600 else '[data-view'
    page.locator(nav + '=development]').click()
    page.locator(nav + '=dashboard]').click()
    page.wait_for_timeout(1050)
    assert seen == startup, seen
    if not button.is_visible():
        page.locator('[data-mobile-view=dashboard]').click()

    marker = len(seen)
    button.click()
    dialog = page.get_by_role('dialog', name='Energy Top-up')
    expect(dialog.get_by_text('$1.99', exact=True)).to_be_visible()
    expect(dialog.get_by_text('19.900000 MIND', exact=True)).to_be_visible()
    expect(dialog.locator('[data-qr] svg')).to_be_visible()
    expect(dialog.get_by_text('Sponsored network fee')).to_be_visible()
    expect(dialog.locator('[data-address]')).to_have_value(ADDRESS)
    opened = seen[marker:]
    assert opened == ['payment-open'], opened
    expect(button).to_contain_text(ADDRESS[:5] + '…' + ADDRESS[-5:])
    remaining_time = dialog.locator('[data-time]').text_content()
    expect(dialog.locator('[data-time]')).not_to_have_text(remaining_time)
    assert seen[marker:] == opened, seen
    if os.getenv('MINDLING_WALLET_SCREENSHOTS'):
        page.screenshot(path=str(Path(os.environ['MINDLING_WALLET_SCREENSHOTS']) /
                                 ('desktop.png' if width >= 600 else 'mobile.png')))
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    expect(button).to_be_focused()
    button.click()
    expect(dialog.locator('[data-qr] svg')).to_be_visible()
    assert seen[marker:] == ['payment-open', 'payment-open']
    check = dialog.get_by_role('button', name='Check payment')
    check.click()
    expect(dialog.get_by_role('status')).to_have_text('Waiting for the transaction to finalize.')
    expect(page.locator('[data-energy-value]')).to_have_text('2 / 10')
    check.click()
    expect(dialog).to_be_hidden()
    expect(page.locator('[data-energy-value]')).to_have_text('10 / 10')
    expect(page.locator('.interaction-status')).to_have_text('Payment confirmed. Energy restored.')
    marker=len(seen)
    page.reload()
    page.wait_for_function('window.fixtureReady')
    expect(button).to_be_enabled()
    expect(page.locator('[data-energy-value]')).to_have_text('10 / 10')
    assert page.evaluate('fixtureApp.state.mind.energyAuthority.revision') == 2
    expect(button).to_contain_text(ADDRESS[:5] + '…' + ADDRESS[-5:])
    assert seen[marker:] == []
    page.locator('#mindling-input').fill('How are you developing this afternoon?')
    page.locator('#interaction-form button[type=submit]').click()
    expect(page.locator('[data-energy-value]')).to_have_text('9 / 10')
    page.wait_for_function("fixtureApp.state.mind.energyAuthority.pending?.length===0")
    assert seen.count('local-talk') == 1 and seen.count('authorize-commit') == 1 and seen.count('settle') == 1
    journal = page.evaluate("fixtureApp.db.getAll('energyJournal')")
    assert len(journal) == 1 and journal[0]['energyCost'] == 1 and journal[0]['energyRevision'] == 4
    assert seen[marker:] == ['challenge', 'local-talk', 'authorize-commit', 'settle']
    assert seen.count('payment-open') == 2
    assert seen.count('payment-check') == 2
    if not button.is_visible():
        page.locator('[data-mobile-view=dashboard]').click()
    market_unavailable = True
    button.click()
    expect(dialog.get_by_role('status')).to_have_text('A reliable MIND price is unavailable. No payment quote was created.')
    expect(dialog.locator('[data-qr] svg')).to_have_count(0)
    print(f'{width}px: startup={startup}, navigation/idle=0, wallet={opened}, cached reload=0, '
          'ordinary Talk=challenge + local-talk + authorize-commit + settle')
    assert not errors, errors
    assert not unexpectedly_sent, unexpectedly_sent
    page.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        run(browser, 1280)
        run(browser, 390)
        browser.close()
    print('PASS: local desktop and mobile Dashboard top-up, Web Crypto signing, QR, pending finality, successful synchronization, IndexedDB reload and one settled Talk charge.')
