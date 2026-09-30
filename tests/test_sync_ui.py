"""Sync settings JavaScript in Chromium with a MOCKED background/OAuth flow.
No real account, installation, authorization, or API request is used.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
MOCK = r'''
window.testCalls=[]; window.testConsent=true; window.testPermissions=[];
const initialConfig={clientId:'',enabled:false,consent:false,intervalMinutes:15,secondRefreshHours:24,maxRequestsPerDay:200,allowPartial:false};
const status={config:initialConfig,connected:false,account:null,message:'Connect X to sync.',lastDirectAt:0,requestsToday:0,parentCount:0,parentsSynced:0,unavailable:[],redirectUri:'https://example.chromiumapp.org/oauth2'};
window.browser={permissions:{async request(v){testPermissions.push(v); return testConsent;}},runtime:{getManifest(){return {browser_specific_settings:{gecko:{data_collection_permissions:{optional:['authenticationInfo','personallyIdentifyingInfo']}}}};},async sendMessage(m){
 testCalls.push(m); switch(m.type){
 case 'ds:configure': if(m.config.enabled&&!m.config.consent)return {ok:false,error:'Acknowledge X API usage and possible charges.'}; status.config=m.config; break;
 case 'ds:connect': status.connected=true; status.account={id:'1',username:'me'}; status.message='Connected, awaiting sync.'; break;
 case 'ds:disconnect': status.connected=false; status.account=null; status.config.enabled=false; status.message='Disconnected.'; break;
 case 'ds:syncNow': status.message='Refresh queued.';break;
 }
 return {ok:true,data:structuredClone(status)};
}}};
'''
checks=[]
def check(name, result):
    assert result, name
    checks.append(name)
    print('PASS',name)

with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_EXECUTABLE'): options['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
    browser=p.chromium.launch(**options)
    context=browser.new_context(viewport={'width':1120,'height':1000},device_scale_factor=1)
    context.route('**/*',lambda route:route.abort())
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((SRC/'settings.html').read_text())
    page.add_style_tag(path=str(SRC/'ui.css'))
    page.add_script_tag(content=MOCK)
    page.add_script_tag(path=str(SRC/'sync-ui.js'))
    page.wait_for_timeout(100)
    check('sync starts opt-in with documented polling and request caps', not page.locator('#syncEnabled').is_checked() and page.locator('#syncInterval').input_value()=='15' and page.locator('#syncLimit').input_value()=='200')
    check('actual per-install callback is displayed as a readonly field', page.locator('#syncCallback').input_value()=='https://example.chromiumapp.org/oauth2' and page.locator('#syncCallback').get_attribute('readonly') is not None)
    check('opening settings does not connect or enable sync', page.evaluate('testCalls.every(m=>m.type==="ds:status")'))
    page.locator('#syncClient').fill('public-id-example')
    page.wait_for_timeout(2200)
    check('status polling does not overwrite unsaved user input',page.locator('#syncClient').input_value()=='public-id-example')
    page.locator('#syncEnabled').check(); page.locator('#syncSave').click()
    page.wait_for_timeout(100)
    check('failed consent/configuration is shown to the user', 'possible charges' in page.locator('#syncError').inner_text())
    check('API host permission is requested alongside optional Firefox data consent',page.evaluate('testPermissions.length===1 && testPermissions[0].origins[0]==="https://api.x.com/*"'))
    check('Firefox optional data consent is requested by the click handler',page.evaluate('testPermissions.length===1 && testPermissions[0].data_collection.includes("authenticationInfo")'))
    page.locator('#syncConsent').check();page.locator('#syncSave').click();page.wait_for_timeout(100)
    check('saved opt-in settings are sent to the background', page.evaluate('testCalls.filter(m=>m.type==="ds:configure").at(-1).config.consent===true'))
    page.locator('#syncConnect').click();page.wait_for_timeout(100)
    check('connect first saves configuration and then starts the OAuth action',page.evaluate('testCalls.at(-1).type==="ds:connect" && testCalls.at(-2).type==="ds:configure"'))
    check('connected account and details are displayed', 'Connected as @me' in page.locator('#syncDetails').inner_text() and page.locator('#me').input_value()=='me')
    page.locator('#syncNow').click();page.wait_for_timeout(100)
    check('Sync now also requests API host access',page.evaluate('testPermissions.length===4 && testPermissions.at(-1).origins[0]==="https://api.x.com/*"'))
    check('manual refresh button queues a background refresh',page.locator('#syncStatus').inner_text()=='Refresh queued.')
    page.evaluate('status.unavailable=[{username:"private_list"}]; status.parentCount=2;status.parentsSynced=1;')
    page.wait_for_timeout(2200)
    check('incomplete or unavailable graph coverage is explicit', '@private_list' in page.locator('#syncUnavailable').inner_text() and '1/2' in page.locator('#syncDetails').inner_text())
    page.on('dialog',lambda dialog:dialog.accept())
    page.locator('#syncDisconnect').click();page.wait_for_timeout(100)
    check('disconnect restores disabled state in the form',not page.locator('#syncEnabled').is_checked() and 'Not connected' in page.locator('#syncDetails').inner_text())
    page.evaluate('testConsent=false; testCalls.length=0;');page.locator('#syncConnect').click();page.wait_for_timeout(100)
    check('denied browser consent prevents an authorization action',not page.evaluate('testCalls.some(m=>m.type==="ds:connect")') and 'not granted' in page.locator('#syncError').inner_text())
    check('sync controls run without JavaScript page errors',not errors)
    page.locator('#syncError').evaluate('(e)=>e.textContent=""')
    page.locator('#syncClient').fill('')
    page.evaluate('status.unavailable=[];status.parentCount=0;status.parentsSynced=0;status.message="Connect X to sync. This is a synthetic test preview."')
    page.wait_for_timeout(2200)
    page.screenshot(path=str(ROOT/'tests/sync-settings-preview.png'),full_page=True)
    context.close();browser.close()
print(f'{len(checks)} sync settings fixture checks passed. OAuth/background services were mocked.')
