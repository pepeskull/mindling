"""Shared assertions for the public shell in all three application modes."""
def verify_branding(page, name):
    page.wait_for_function("[...document.querySelectorAll('img.brand-mark,img.interaction-mark')].length===2 && [...document.querySelectorAll('img.brand-mark,img.interaction-mark')].every(i=>i.complete && i.naturalWidth>0)")
    assert page.locator('a[aria-label="Mindling dashboard"] img').get_attribute('src') == './logo.png'
    assert page.locator('#interaction-form img').get_attribute('src') == './logo.png'
    assert page.locator('link[rel="icon"]').get_attribute('href') == './favicon.png'
    response = page.request.get(page.url.split('?')[0].rstrip('/') + '/favicon.png')
    assert response.ok and response.body()[:8] == b'\x89PNG\r\n\x1a\n'
    footer = page.locator('.site-footer')
    assert 'Milestone 03' not in footer.inner_text() and 'Read-only' not in footer.inner_text()
    assert footer.locator('a[data-footer-link="github"]').get_attribute('href') == 'https://github.com/pepeskull/mindling'
    for key in ['x', 'docs']:
        assert footer.locator(f'span[data-footer-link="{key}"][aria-disabled="true"]').count() == 1
    page.evaluate('document.activeElement?.blur()')
    page.wait_for_function("!document.documentElement.classList.contains('input-active')")
    assert footer.is_visible() == (page.viewport_size['width'] > 800)
    assert page.locator('svg').count() > 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=f'/tmp/branding-{name}.png')
