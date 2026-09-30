"""Real Chromium DOM tests with MOCKED extension APIs, navigation, and X HTML.
This does NOT test authenticated x.com, live selectors, or browser installation.
Requires: pip install playwright; playwright install chromium
Set CHROMIUM_EXECUTABLE to use a system Chromium installation.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
RESULTS = []
MOCK = r'''
const saved = __INITIAL__;
const storageListeners = [];
let receiver;
window.browser = {
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return structuredClone(saved);
        const list = typeof keys === 'string' ? [keys] : keys;
        return Object.fromEntries(list.filter(k => Object.hasOwn(saved,k)).map(k => [k, structuredClone(saved[k])]));
      },
      async set(obj) {
        const changes = {};
        for (const [key, value] of Object.entries(obj)) {
          changes[key] = {oldValue: saved[key], newValue: structuredClone(value)};
          saved[key] = structuredClone(value);
        }
        storageListeners.forEach(fn => fn(changes, 'local'));
      },
      async remove(keys) {
        const changes = {};
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          changes[key] = {oldValue: saved[key]}; delete saved[key];
        }
        storageListeners.forEach(fn => fn(changes,'local'));
      },
      async clear() { await this.remove(Object.keys(saved)); }
    },
    onChanged: {addListener(fn) { storageListeners.push(fn); }}
  },
  runtime: {id: 'test-extension', onMessage: {addListener(fn) { receiver = fn; }}, async openOptionsPage() {}},
};
window.testSend = (type) => new Promise(resolve => receiver({type}, {id:'test-extension'}, resolve));
window.testSaved = () => structuredClone(saved);
'''

def initial():
    return {'settings': {'myHandle':'me','enabled':True,'includeSecondDegree':True},
            'following:me': {'handles':['alice','bob'], 'complete':True},
            'following:alice': {'handles':['charlie'], 'complete':True},
            'following:bob': {'handles':['dana'], 'complete':False},
            'following:charlie': {'handles':['third_degree'], 'complete':True}}

STATUS_IDS={}
def tweet(ident, author=None, extra=''):
    status_id=STATUS_IDS.setdefault(ident, str(10000+len(STATUS_IDS)))
    head = (f'<div data-testid="User-Name"><a href="https://x.com/{author}">@{author}</a>'
            f'<a href="https://x.com/{author}/status/{status_id}"><time>Now</time></a></div>') if author else ''
    return f'<div data-testid="cellInnerDiv" id="cell-{ident}"><article data-testid="tweet" id="{ident}">{head}<div data-testid="tweetText">Post {ident}</div>{extra}</article></div>'

def fixture():
    cards = ''.join(tweet(a, a) for a in ['me','alice','charlie','third_degree','stranger'])
    cards += tweet('unknown')
    quote = '<div role="link"><div data-testid="User-Name"><a href="https://x.com/alice">@alice</a></div></div>'
    cards += tweet('outsider_quotes_allowed','outsider',quote)
    cards += tweet('missing_author_quotes_allowed', None,quote)
    cards += tweet('allowed_quotes_outsider','alice',quote.replace('alice','outsider'))
    cards += tweet('outsider_reposted','outsider','<div data-testid="socialContext"><a href="https://x.com/alice">Alice reposted</a></div>')
    cards += '<div data-testid="cellInnerDiv" id="conversation">' + tweet('conversation_allowed','alice').replace('data-testid="cellInnerDiv"','') + tweet('conversation_outside','outsider').replace('data-testid="cellInnerDiv"','') + '</div>'
    return '<!doctype html><html><body><nav><a data-testid="AppTabBar_Profile_Link" href="https://x.com/me">Profile</a></nav><main><div data-testid="primaryColumn"><div role="tablist"><a role="tab" aria-selected="true">For you</a><a role="tab" aria-selected="false">Following</a></div><section role="region" id="timeline">'+cards+'</section></div></main></body></html>'

def check(name, condition):
    assert condition, name
    print('PASS', name)
    RESULTS.append(name)

def settle(page): page.wait_for_timeout(180)

def change_settings(page, **changes):
    page.evaluate('async c => { const d=await browser.storage.local.get("settings"); await browser.storage.local.set({settings:{...d.settings,...c}}); }', changes)
    settle(page)

def usercell(handle, ident=None):
    return f'<div data-testid="UserCell" id="u-{ident or handle}"><a href="https://x.com/{handle}"><span>@{handle}</span></a><div data-testid="UserDescription"><a href="https://x.com/bio_mention"><span>@bio_mention</span></a></div></div>'

with sync_playwright() as p:
    binary = os.environ.get('CHROMIUM_EXECUTABLE')
    opts = {'headless':True}
    if binary: opts['executable_path'] = binary
    browser = p.chromium.launch(**opts)
    context = browser.new_context()
    # In-page fixtures only. No navigation or external access is needed.
    context.route('**/*', lambda route: route.abort())
    page = context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(fixture())
    page.evaluate('''() => {
      window.testLocation = {href:'https://x.com/home', pathname:'/home', origin:'https://x.com'};
      window.testNavigate = path => { testLocation.pathname=path; testLocation.href='https://x.com'+path; };
    }''')
    page.add_script_tag(content=MOCK.replace('__INITIAL__',json.dumps(initial())))
    page.add_style_tag(path=str(SRC/'content.css'))
    page.add_script_tag(path=str(SRC/'core.js'))
    page.add_script_tag(content='((location) => {\n'+(SRC/'content.js').read_text()+'\n})(window.testLocation);')
    settle(page)
    check('own/direct/second-degree authors remain visible',all(page.locator('#'+x).is_visible() for x in ['me','alice','charlie']))
    check('third-degree and outside authors are hidden',all(not page.locator('#'+x).is_visible() for x in ['third_degree','stranger']))
    check('unknown authors are hidden in strict mode',not page.locator('#unknown').is_visible())
    check('quoted allowed author does not authorize outer post',not page.locator('#outsider_quotes_allowed').is_visible())
    check('missing outer author cannot borrow quoted identity',not page.locator('#missing_author_quotes_allowed').is_visible())
    check('allowed outer author keeps embedded quoted content',page.locator('#allowed_quotes_outsider').is_visible())
    check('allowed reposter does not authorize outsider author',not page.locator('#outsider_reposted').is_visible())
    check('shared conversation wrapper preserves allowed sibling',page.locator('#conversation_allowed').is_visible() and not page.locator('#conversation_outside').is_visible())
    page.locator('#timeline').evaluate('(el,html)=>el.insertAdjacentHTML("beforeend",html)',tweet('new_outside','outsider'))
    settle(page)
    check('newly inserted outside post is filtered',not page.locator('#new_outside').is_visible())
    page.locator('#stranger [data-testid="User-Name"] a').first.evaluate('(el)=>{el.href="https://x.com/alice";el.textContent="@alice";}')
    settle(page)
    check('recycled DOM card is restored for allowed author',page.locator('#stranger').is_visible())
    page.locator('#stranger [data-testid="User-Name"] a').first.evaluate('(el)=>{el.href="https://x.com/stranger";el.textContent="@stranger";}')
    settle(page)
    check('recycled DOM card is hidden again for outside author',not page.locator('#stranger').is_visible())
    page.evaluate('''()=> { const t=document.querySelectorAll('[role="tab"]');t[0].setAttribute('aria-selected','false');t[1].setAttribute('aria-selected','true'); }''')
    settle(page)
    check('switching to Following restores hidden content',page.locator('#stranger').is_visible())
    change_settings(page,onlyForYou=False)
    check('optional all-Home mode also filters Following',not page.locator('#stranger').is_visible())
    page.evaluate('testNavigate("/alice")')
    page.wait_for_timeout(850)
    check('SPA navigation to a profile restores hidden posts',page.locator('#stranger').is_visible())
    page.evaluate('testNavigate("/home")')
    page.wait_for_timeout(850)
    check('SPA navigation back to Home resumes filtering',not page.locator('#stranger').is_visible())
    page.locator('[data-testid="AppTabBar_Profile_Link"]').evaluate('(el)=>el.href="https://x.com/other_account"')
    settle(page)
    check('switching accounts pauses filtering',page.locator('#stranger').is_visible())
    page.locator('[data-testid="AppTabBar_Profile_Link"]').evaluate('(el)=>el.href="https://x.com/me"')
    settle(page)
    change_settings(page,hideUnknownAuthors=False)
    check('unknown-author policy can be changed',page.locator('#unknown').is_visible())
    change_settings(page,hideUnknownAuthors=True,includeSecondDegree=False)
    check('direct-only mode hides second-degree author',not page.locator('#charlie').is_visible() and page.locator('#alice').is_visible())
    change_settings(page,includeSecondDegree=True)
    page.evaluate('browser.storage.local.set({"following:me":{handles:["bob"]}})')
    settle(page)
    check('replacing direct list prunes stale second-degree branch',not page.locator('#alice').is_visible() and not page.locator('#charlie').is_visible())
    page.evaluate('browser.storage.local.remove("following:me")')
    settle(page)
    check('deleting own list disarms filtering instead of blanking feed',page.locator('#stranger').is_visible())
    page.evaluate('browser.storage.local.set({"following:me":{handles:["alice","bob"]}})')
    settle(page)
    change_settings(page,mode='remove')
    check('experimental removal detaches excluded article HTML',page.locator('#stranger').count()==0 and page.locator('#alice').count()==1)
    check('removal does not detach shared allowed sibling',page.locator('#conversation_allowed').count()==1)
    check('status reports removals',page.evaluate('testSend("twohop:status")')['removed']>0)

    # Explicit capture and review; no approved graph changes until settings save.
    change_settings(page,mode='hide')
    page.evaluate('testNavigate("/me/following")')
    html='<section role="region" id="following-list">'+usercell('alice')+usercell('bob')+'</section><aside>'+usercell('sidebar_suggest')+'</aside>'
    page.locator('[data-testid="primaryColumn"]').evaluate('(el,html)=>el.innerHTML=html',html)
    settle(page)
    result=page.evaluate('testSend("twohop:startCapture")')
    check('capture starts on own exact Following page',result['ok'] and result['capture']['count']==2)
    page.locator('#following-list').evaluate('(el,html)=>el.insertAdjacentHTML("beforeend",html)',usercell('charlie'))
    settle(page)
    result=page.evaluate('testSend("twohop:status")')
    check('capture accumulates newly rendered Following cards',result['capture']['count']==3)
    result=page.evaluate('testSend("twohop:stopCapture")')
    check('capture excludes sidebar suggestions and bio mentions',result['draft']['handles']==['alice','bob','charlie'])
    check('capture is a review draft, not an automatic graph write',page.evaluate('testSaved()["following:me"].handles')==['alice','bob'])
    page.evaluate('testSend("twohop:discardCapture")')
    page.evaluate('testNavigate("/outsider/following")')
    result=page.evaluate('testSend("twohop:startCapture")')
    check('capture rejects unrelated owner',not result['ok'])
    page.evaluate('testNavigate("/me/followers")')
    result=page.evaluate('testSend("twohop:startCapture")')
    check('capture rejects Followers page',not result['ok'])
    page.evaluate('testNavigate("/alice/following")')
    result=page.evaluate('testSend("twohop:startCapture")')
    check('capture accepts known direct follow',result['ok'])
    page.evaluate('testNavigate("/bob/following")')
    page.wait_for_timeout(850)
    result=page.evaluate('testSend("twohop:status")')
    check('capture stops rather than mix different owners',not result['capture']['running'])
    check('content script has no unhandled browser errors',not errors)

    # Actual settings HTML/JS, mocked storage only.
    ui=context.new_page()
    ui_errors=[]
    ui.on('pageerror',lambda e:ui_errors.append(str(e)))
    ui.on('dialog',lambda dialog:dialog.accept())
    import re
    html=(SRC/'settings.html').read_text()
    html=re.sub(r'<script.*?</script>','',html,flags=re.S)
    ui.set_content(html)
    ui.add_style_tag(path=str(SRC/'ui.css'))
    ui.add_script_tag(content=MOCK.replace('__INITIAL__','{}'))
    ui.add_script_tag(path=str(SRC/'core.js'))
    ui.add_script_tag(path=str(SRC/'settings.js'))
    settle(ui)
    ui.locator('#me').fill('me')
    ui.locator('#saveSettings').click()
    settle(ui)
    check('settings saves configured account',ui.evaluate('testSaved().settings.myHandle')=='me')
    ui.locator('#owner').fill('me')
    ui.locator('#handles').fill('@alice\nbob')
    ui.locator('#replace').click()
    settle(ui)
    check('list editor saves reviewed list',ui.evaluate('testSaved()["following:me"].handles')==['alice','bob'])
    ui.locator('#handles').fill('charlie')
    ui.locator('#merge').click()
    settle(ui)
    check('merge preserves earlier accounts and marks partial',ui.evaluate('testSaved()["following:me"]') ['handles']==['alice','bob','charlie'] and not ui.evaluate('testSaved()["following:me"].complete'))
    ui.locator('#handles').fill('bob')
    ui.locator('#replace').click()
    settle(ui)
    check('replace removes stale handles',ui.evaluate('testSaved()["following:me"].handles')==['bob'])
    ui.locator('#enabled').check()
    ui.locator('#saveSettings').click()
    settle(ui)
    check('settings can enable filtering',ui.evaluate('testSaved().settings.enabled'))
    ui.locator('#handles').fill('<script>alert(1)</script>')
    ui.locator('#replace').click()
    settle(ui)
    check('invalid pasted data yields validation error without replacing list','Invalid handle' in ui.locator('#message').inner_text() and ui.evaluate('testSaved()["following:me"].handles')==['bob'])
    ui.set_viewport_size({'width':1100,'height':1100})
    ui.screenshot(path=str(ROOT/'tests'/'settings-preview.png'),full_page=True)
    check('settings has no unhandled browser errors',not ui_errors)

    # Fresh page for cumulative counts and promoted-post fixtures.
    f=context.new_page()
    feature_errors=[]
    f.on('pageerror',lambda e:feature_errors.append(str(e)))
    html=fixture()
    f.set_content(html)
    f.evaluate("window.testLocation={href:'https://x.com/home',pathname:'/home',origin:'https://x.com'}")
    f.add_script_tag(content=MOCK.replace('__INITIAL__',json.dumps(initial())))
    f.add_style_tag(path=str(SRC/'content.css'))
    f.add_script_tag(path=str(SRC/'core.js'))
    f.add_script_tag(content='((location) => {\n'+(SRC/'content.js').read_text()+'\n})(window.testLocation);')
    settle(f)
    def session(): return f.evaluate('testSend("twohop:status")')['session']
    def add_post(html):
        f.locator('#timeline').evaluate('(el,html)=>el.insertAdjacentHTML("beforeend",html)',html)
        settle(f)
    baseline=session()['blocked']
    check('session total counts already blocked cards',baseline>0)
    for _ in range(3): session()
    check('repeated scans do not inflate session count',session()['blocked']==baseline)
    add_post(tweet('counter_new','outsider'))
    check('new post increments cumulative session count',session()['blocked']==baseline+1)
    f.locator('#cell-counter_new').evaluate('(el)=>el.remove()')
    settle(f)
    check('scrolling a card out does not decrement the total',session()['blocked']==baseline+1)
    add_post(tweet('counter_new','outsider'))
    check('remounted same post ID is not double counted',session()['blocked']==baseline+1)
    add_post(tweet('ad_allowed','alice','<span data-testid="promotedIndicator">Ad</span>'))
    check('promoted post is hidden even from a followed author',not f.locator('#ad_allowed').is_visible())
    check('ads have their own cumulative counter',session()['ads']==1 and session()['blocked']==baseline+2)
    add_post(tweet('quote_ad','alice','<div role="link" data-testid="quoteTweet"><span data-testid="promotedIndicator">Ad</span></div>'))
    check('promoted marker inside a quote does not classify the outer post',f.locator('#quote_ad').is_visible())
    add_post(tweet('talk_about_ads','alice','<div data-testid="tweetText"><span>Ad</span> Promoted content is annoying.</div>'))
    check('ordinary post text saying Ad is not an ad signal',f.locator('#talk_about_ads').is_visible())
    add_post('<div data-testid="placementTracking">'+tweet('placement_ad','alice')+'</div>')
    check('single-post promotion placement is hidden',not f.locator('#placement_ad').is_visible())
    add_post('<div data-testid="placementTracking">'+tweet('shared_place_a','alice')+tweet('shared_place_b','bob')+'</div>')
    check('shared placement wrapper does not hide unrelated posts',f.locator('#shared_place_a').is_visible() and f.locator('#shared_place_b').is_visible())
    before=session()['blocked']
    change_settings(f,hideAds=False)
    check('ad hiding can be disabled independently',f.locator('#ad_allowed').is_visible())
    check('disabling ad hiding preserves prior session totals',session()['blocked']==before)
    change_settings(f,hideAds=True)
    check('re-enabling does not recount known ads',session()['blocked']==before)
    f.evaluate('browser.storage.local.remove("following:me")')
    settle(f)
    check('ad hiding works while following lists are missing',not f.locator('#ad_allowed').is_visible() and f.locator('#counter_new').is_visible())
    check('ads-only mode explains the paused network filter','Ads only' in f.evaluate('testSend("twohop:status")')['reason'])
    f.evaluate('browser.storage.local.set({"following:me":{handles:["alice","bob"]}})')
    settle(f)
    result=f.evaluate('testSend("twohop:resetSession")')
    check('Reset clears cumulative counters',result['session']['blocked']==0 and session()['ads']==0)
    check('already mounted blocked posts are not immediately recounted',session()['blocked']==0)
    add_post(tweet('after_reset','outsider'))
    check('new blocked posts after reset are counted',session()['blocked']==1)
    count=session()['blocked']
    f.evaluate("testLocation.pathname='/alice';testLocation.href='https://x.com/alice'")
    f.wait_for_timeout(850)
    check('profile navigation restores ads outside Home scope',f.locator('#ad_allowed').is_visible())
    f.evaluate("testLocation.pathname='/home';testLocation.href='https://x.com/home'")
    f.wait_for_timeout(850)
    check('single-page navigation preserves session count',session()['blocked']==count)
    change_settings(f,enabled=False)
    check('master disable restores ads and network-hidden posts',f.locator('#ad_allowed').is_visible() and f.locator('#after_reset').is_visible())
    change_settings(f,enabled=True)
    check('master re-enable does not recount known IDs',session()['blocked']==count)
    change_settings(f,mode='remove')
    add_post(tweet('removed_new','outsider'))
    check('session counter includes new posts physically removed',f.locator('#removed_new').count()==0 and session()['blocked']==count+1)
    check('session feature page has no unhandled errors',not feature_errors)

    ui.locator('#hideAds').uncheck();ui.locator('#saveSettings').click();settle(ui)
    check('settings saves the ad hiding toggle',ui.evaluate('testSaved().settings.hideAds') is False)
    ui.locator('#hideAds').check();ui.locator('#saveSettings').click();settle(ui)
    check('settings can re-enable ad hiding',ui.evaluate('testSaved().settings.hideAds') is True)
    ui.screenshot(path=str(ROOT/'tests'/'settings-preview.png'),full_page=True)

    pop=context.new_page()
    popup_errors=[]
    pop.on('pageerror',lambda e:popup_errors.append(str(e)))
    pop.set_content(re.sub(r'<script.*?</script>','',(SRC/'popup.html').read_text(),flags=re.S))
    pop.add_style_tag(path=str(SRC/'ui.css'))
    pop.add_script_tag(content=MOCK.replace('__INITIAL__','{}'))
    pop.evaluate('''() => {
      window.popupState={ok:true,reason:'Filtering',session:{blocked:1234,network:1200,ads:34,estimated:0},
        direct:10,second:30,kept:4,hidden:8,removed:0,captured:10,totalParents:10,ownComplete:true,capture:null};
      browser.tabs={query:async()=>[{id:7}],sendMessage:async(id,m)=>{
        if(m.type==='twohop:resetSession') popupState.session={blocked:0,network:0,ads:0,estimated:0};
        return structuredClone(popupState);
      }};
    }''')
    pop.add_script_tag(path=str(SRC/'popup.js'));settle(pop)
    check('popup prominently displays cumulative blocked count',pop.locator('#sessionTotal').inner_text().replace(',','')=='1234')
    check('popup displays separate ads count','34 ads' in pop.locator('#sessionBreakdown').inner_text())
    pop.set_viewport_size({'width':420,'height':950})
    pop.screenshot(path=str(ROOT/'tests'/'popup-preview.png'),full_page=True)
    pop.locator('#resetSession').click();settle(pop)
    check('popup Reset button resets its displayed total',pop.locator('#sessionTotal').inner_text()=='0')
    check('popup has no unhandled errors',not popup_errors)

    browser.close()

(ROOT/'tests'/'browser-results.json').write_text(json.dumps({'environment':'Chromium; in-page fixture with mocked X DOM, navigation and extension APIs; no live X session','passed':len(RESULTS),'checks':RESULTS},indent=2)+'\n')
print(f'\n{len(RESULTS)} browser/DOM checks passed. No live x.com testing performed.')
