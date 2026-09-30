"""Actual Chromium unpacked installation. Offline; no X OAuth grant or live API calls."""
import json, os, re, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
results=[]
def check(name, condition):
    assert condition,name
    print('PASS',name);results.append(name)
with tempfile.TemporaryDirectory() as profile, sync_playwright() as p:
    binary=os.environ.get('CHROMIUM_EXECUTABLE')
    kw={'executable_path':binary} if binary else {'channel':'chromium'}
    path=ROOT/'dist/chromium'
    context=p.chromium.launch_persistent_context(profile,headless=True,
        args=[f'--disable-extensions-except={path}',f'--load-extension={path}'],**kw)
    context.route(re.compile(r'^https?://'),lambda route:route.abort())
    workers=context.service_workers
    worker=workers[0] if workers else context.wait_for_event('serviceworker')
    ident=worker.url.split('/')[2]
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'chrome-extension://{ident}/settings.html')
    page.wait_for_function("document.getElementById('syncCallback').value.startsWith('https://')")
    check('MV3 background worker starts from the packaged manifest',worker.url.endswith('/background.js'))
    check('actual extension exposes a browser-generated OAuth callback',page.locator('#syncCallback').input_value()==f'https://{ident}.chromiumapp.org/oauth2')
    check('unconfigured install performs no automatic sync',not page.locator('#syncEnabled').is_checked())
    check('OAuth tokens absent from content-script-readable local storage',page.evaluate("async()=>JSON.stringify(await chrome.storage.local.get(null))").find('accessToken')==-1)
    config={'enabled':True,'clientId':'fixture-public-client','consent':False}
    reply=page.evaluate("async config=>chrome.runtime.sendMessage({type:'ds:configure',config})",config)
    check('background rejects sync enablement without consent',not reply['ok'] and 'Acknowledge' in reply['error'])
    page.locator('#syncClient').fill('fixture-public-client')
    page.locator('#syncConsent').check();page.locator('#syncEnabled').check();page.locator('#syncSave').click()
    page.wait_for_function("document.getElementById('syncSave').disabled===false")
    saved=page.evaluate('async()=>chrome.storage.local.get(null)')
    check('settings page reaches real background configure handler',saved['autoSync']['enabled'] and saved['autoSync']['consent'])
    check('enabled but unauthenticated sync never invents a following list','following:me' not in saved)
    page.locator('#syncEnabled').uncheck();page.locator('#syncSave').click()
    page.wait_for_function("document.getElementById('syncSave').disabled===false")
    reply=page.evaluate("async()=>chrome.runtime.sendMessage({type:'ds:status'})")
    check('Sync pause persists',not reply['data']['config']['enabled'])
    check('manual graph editing remains available',page.locator('#handles').is_visible())
    page.screenshot(path=str(ROOT/'tests/extension-settings-preview.png'),full_page=True)
    check('settings and sync controls have no JavaScript errors',not errors)
    erased=page.evaluate("async()=>chrome.runtime.sendMessage({type:'ds:erase'})")
    check('erase clears the credential store and local graph',erased['ok'] and page.evaluate('async()=>Object.keys(await chrome.storage.local.get(null)).length')==0)
    context.close()
(ROOT/'tests/extension-results.json').write_text(json.dumps({'passed':len(results),'checks':results,'live_x_tested':False},indent=2)+'\n')
print(f'{len(results)} actual Chromium installation checks passed; network access blocked.')
