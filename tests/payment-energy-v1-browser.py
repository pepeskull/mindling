"""Offline production Dashboard, real IndexedDB, mocked payment and AI APIs."""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mindling.test'
ADDRESS = 'So11111111111111111111111111111111111111112'
SESSION = 'a' * 48
POINT = 12 * 60 * 1000
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
  await db.changeGameplay(()=>newMindling(createSandbox(Date.now()),{
    id:identity.mindlingId,name:'Payment fixture',confirmed:true
  }),{identity});
  db.close();
}
"""


def run(browser, width):
    context = browser.new_context(viewport={'width': width, 'height': 820}, reduced_motion='reduce')
    page = context.new_page()
    seen, errors = [], []
    payment_live = True
    checked = 0
    verified_receipt = None

    def route_request(route):
        nonlocal checked, verified_receipt
        url = urlparse(route.request.url)
        if url.hostname != 'mindling.test':
            raise AssertionError(route.request.url)
        if url.path == '/fixture':
            return route.fulfill(content_type='text/html', body='<html><body></body></html>')
        if url.path == '/js/bootstrap.js':
            return route.fulfill(content_type='application/javascript', body=BOOT)
        if url.path == '/api/mindling/energy':
            body = route.request.post_data_json
            action = body['action']
            seen.append(action)
            if not payment_live:
                return route.fulfill(status=503, json={'error': {'code': 'PAYMENT_STORAGE_UNCONFIGURED'}})
            if action == 'challenge':
                canonical = {k: body['publicKey'][k] for k in ('crv', 'kty', 'x', 'y')}
                return route.fulfill(json={'nonce': SESSION, 'expiresAt': now()+300000,
                    'fingerprint': hashlib.sha256(json.dumps(canonical, separators=(',', ':')).encode()).hexdigest()})
            assert len(route.request.headers['x-mindling-signature']) == 128
            assert route.request.headers['x-mindling-nonce'] != SESSION
            if action == 'payment-wallet':
                return route.fulfill(json={'wallet': {'address': ADDRESS, 'pending': None}})
            if action == 'payment-open':
                payload = 'solana:'+quote(BASE+'/api/mindling/pay?session='+SESSION, safe='')
                return route.fulfill(json={'session': {'id': SESSION, 'cluster': 'mainnet',
                    'address': ADDRESS, 'units': '19900000', 'decimals': 6, 'expiresAt': now()+600000,
                    'qrPayload': None if body['recoverOnly'] else payload,
                    'sponsored': not body['recoverOnly']}})
            if action == 'payment-check':
                checked += 1
                if checked == 1:
                    return route.fulfill(status=409, json={'error': {'code': 'PAYMENT_PENDING'}})
                if checked == 2:
                    verified_receipt = {'id':SESSION,'version':2,'owner':route.request.headers['x-mindling-owner'],
                        'mint':ADDRESS,'paymentSignature':'4'*88,'units':'19900000','slot':123,
                        'finalizedAt':now(),'creditedAt':now()}
                    return route.abort('connectionreset')
                return route.fulfill(json={'receipt':verified_receipt})
            raise AssertionError(action)
        if url.path == '/api/mindling/learn':
            seen.append('learn')
            assert 'x-mindling-signature' not in route.request.headers
            body = route.request.post_data_json
            topic = 'database transactions' if 'transaction' in body['input'] else 'cell membranes'
            assessment={'version':3,'operations':[{'statement':0,'targetPart':-1,'decision':{
                'version':2,'relationship':'NEW_MEMORY','operation':'CREATE_NEW','responseAction':'ACKNOWLEDGE',
                'kind':'claim','certainty':'asserted','concept':topic,'category':'Computer science' if 'transaction' in topic else 'Biology',
                'categoryId':'','topic':topic,'relatedMemoryId':'','confidence':0.95}}]}
            return route.fulfill(json={'service':'mindling-learning-service','assessment':assessment})
        if url.path.startswith('/api/'):
            raise AssertionError(url.path)
        path = ROOT / (url.path.lstrip('/') or 'index.html')
        return route.fulfill(path=path) if path.is_file() else route.fulfill(status=404)

    def now():
        import time
        return int(time.time()*1000) + elapsed

    def action(text, activity='TALK', identifier=None, target=None):
        return (target or page).evaluate("""([text,activity,id])=>
            fixtureApp.submitInput(text,activity,id||crypto.randomUUID())""", [text, activity, identifier])

    def fresh_clock(target):
        target.evaluate('offset=>{fixtureClock.offset=offset;}', elapsed)

    def advance(ms):
        nonlocal elapsed
        elapsed += ms
        fresh_clock(page)
        page.evaluate('fixtureApp.refreshState()')

    elapsed = 0
    context.add_init_script("""const clock=Date.now.bind(Date);
      window.fixtureClock={offset:0};Date.now=()=>clock()+window.fixtureClock.offset;""")
    context.route('**/*', route_request)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE+'/fixture')
    page.evaluate(SEED)
    page.goto(BASE+'/')
    page.wait_for_function('window.fixtureReady')
    button = page.locator('[data-energy-wallet]')
    expect(button).to_contain_text(ADDRESS[:5]+'…'+ADDRESS[-5:])
    expect(button).to_be_disabled()
    assert seen == ['challenge','payment-wallet']
    gallery = '[data-mobile-view' if width<600 else '[data-view'
    page.locator(gallery+'=development]').click()
    page.locator(gallery+'=dashboard]').click()
    start = len(seen)
    payment_live = False
    for level in range(10,0,-1):
        expect(page.locator('[data-energy-value]')).to_have_text(f'{level} / 10')
        assert action('I appreciate the way this conversation develops, round '+str(level))['accepted']
    expect(page.locator('[data-energy-value]')).to_have_text('0 / 10')
    assert action('This thoughtful question should wait until Energy regenerates')['reason']=='OUT_OF_ENERGY'
    assert seen[start:]==[]
    advance(POINT)
    expect(button).to_be_disabled()
    assert action('The fresh Energy point lets our conversation continue')['accepted']
    expect(page.locator('[data-energy-value]')).to_have_text('0 / 10')

    advance(2*POINT)
    expect(page.locator('[data-energy-value]')).to_have_text('2 / 10')
    teach='A database transaction uses atomicity to ensure that all changes commit or roll back together.'
    assert action(teach,'TEACH')['accepted']
    expect(page.locator('[data-energy-value]')).to_have_text('0 / 10')
    advance(3*POINT)
    deep='A membrane separates the cell interior from its environment.'
    assert action(deep,'DEEP_TRAINING')['accepted']
    expect(page.locator('[data-energy-value]')).to_have_text('0 / 10')
    assert seen[start:]==['learn','learn']

    # A second tab imports the same elapsed clock and races the same journal ID.
    other=context.new_page()
    other.goto(BASE+'/fixture')
    fresh_clock(other)
    other.add_init_script(f'window.addEventListener("DOMContentLoaded",()=>{{fixtureClock.offset={elapsed};}})')
    other.goto(BASE+'/')
    other.wait_for_function('window.fixtureReady')
    advance(POINT)
    fresh_clock(other)
    for tab in (page,other):
        tab.evaluate("""async()=>{const {talk}=await import('/src/preview/sandbox/engine.js');
          window.race=fixtureApp.change(state=>talk(state,'Both tabs are trying the same local action',{id:'two-tab-replay'}),
            {journal:{id:'two-tab-replay',type:'TALK'}}).then(()=>true,()=>false);}""")
    assert sum(tab.evaluate('window.race') for tab in (page,other))==1
    other.close()
    page.evaluate('fixtureApp.refreshState()')
    expect(page.locator('[data-energy-value]')).to_have_text('0 / 10')
    assert seen[start:]==['learn','learn']

    payment_live=True
    if not button.is_visible():
        page.locator('[data-mobile-view=dashboard]').click()
    expect(button).to_have_text('TOP UP')
    expect(button).to_be_enabled()
    expect(page.locator('.energy-top-up')).to_have_count(0)
    marker=len(seen)
    button.click()
    dialog=page.get_by_role('dialog', name='Energy Top-up')
    expect(dialog.get_by_text('$1.99',exact=True)).to_be_visible()
    expect(dialog.get_by_text('19.900000 MIND')).to_be_visible()
    expect(dialog.locator('[data-qr] svg')).to_be_visible()
    assert seen[marker:]==['challenge','payment-open'], seen[marker:]
    initial=dialog.locator('[data-time]').text_content()
    expect(dialog.locator('[data-time]')).not_to_have_text(initial)
    assert seen[marker:]==['challenge','payment-open'], seen[marker:]
    if os.getenv('MINDLING_WALLET_SCREENSHOTS'):
        page.screenshot(path=str(Path(os.environ['MINDLING_WALLET_SCREENSHOTS'])/
                                 ('desktop.png' if width>=600 else 'mobile.png')))
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    advance(POINT)
    expect(button).to_be_disabled()
    recovery=page.locator('[data-payment-recovery]')
    recovery.click()
    expect(dialog.locator('[data-address]')).to_have_value(ADDRESS)
    expect(dialog.locator('[data-qr] svg')).to_have_count(0)
    check=dialog.get_by_role('button',name='Check payment')
    check.click()
    expect(dialog.get_by_role('status')).to_have_text('Waiting for the transaction to finalize.')
    check.click()
    expect(check).to_be_enabled()
    expect(page.locator('[data-energy-value]')).to_have_text('1 / 10')
    marker=len(seen)
    page.add_init_script(f'window.addEventListener("DOMContentLoaded",()=>{{fixtureClock.offset={elapsed};}})')
    page.reload()
    page.wait_for_function('window.fixtureReady')
    assert seen[marker:]==[]
    if not recovery.is_visible():
        page.locator('[data-mobile-view=dashboard]').click()
    recovery.click()
    expect(dialog.locator('[data-address]')).to_have_value(ADDRESS)
    check.click()
    expect(dialog).to_be_hidden()
    expect(page.locator('[data-energy-value]')).to_have_text('10 / 10')
    expect(recovery).to_be_hidden()
    assert action('How are you developing after that last conversation?')['accepted']
    expect(page.locator('[data-energy-value]')).to_have_text('9 / 10')
    page.evaluate("fixtureApp.paymentClient.request({action:'payment-check',id:'a'.repeat(48)})")
    expect(page.locator('[data-energy-value]')).to_have_text('9 / 10')
    marker=len(seen)
    page.add_init_script(f'window.addEventListener("DOMContentLoaded",()=>{{fixtureClock.offset={elapsed};}})')
    page.reload()
    page.wait_for_function('window.fixtureReady')
    expect(button).to_be_disabled()
    expect(page.locator('[data-energy-value]')).to_have_text('9 / 10')
    expect(button).to_contain_text(ADDRESS[:5]+'…'+ADDRESS[-5:])
    assert seen[marker:]==[]
    assert not errors, errors
    context.close()
    print(f'{width}px: local regeneration, concurrent tabs, lost payment response, receipt replay and reload passed')
    if width>=600:
        offline=browser.new_context(viewport={'width': width, 'height': 820})
        offline.route('**/*',route_request)
        payment_live=False
        elapsed=0
        unconfigured=offline.new_page()
        unconfigured.goto(BASE+'/fixture')
        unconfigured.evaluate(SEED)
        unconfigured.goto(BASE+'/')
        unconfigured.wait_for_function('window.fixtureReady')
        expect(unconfigured.locator('[data-energy-wallet]')).to_have_text('Wallet unavailable')
        assert action('Natural Energy still works when nothing is configured',target=unconfigured)['accepted']
        expect(unconfigured.locator('[data-energy-value]')).to_have_text('9 / 10')
        offline.close()
        print('Fresh profile starts and can use Energy when the payment configuration fails.')


if __name__=='__main__':
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        run(browser,1280)
        run(browser,390)
        browser.close()
