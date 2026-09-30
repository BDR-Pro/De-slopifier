/* Real background controller, mocked browser services and OAuth network calls. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../src/core.js');
const S = require('../src/sync-engine.js');
const O = require('../src/oauth.js');

function harness(initial = {}, {firefox = false, grant = true, hostGrant = true, username = 'me'} = {}) {
  const saved = structuredClone(initial), calls = [], alarms = new Map();
  let receiver, alarmListener, auth;
  const store = {
    async get(keys) { if (keys == null) return structuredClone(saved); return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(k => k in saved).map(k => [k, structuredClone(saved[k])])); },
    async set(value) { Object.assign(saved, structuredClone(value)); },
    async remove(keys) { for (const k of typeof keys === 'string' ? [keys] : keys) delete saved[k]; },
    async clear() { for (const k of Object.keys(saved)) delete saved[k]; }
  };
  const vault = {async put(v) {auth = structuredClone(v);}, async clear() {auth = undefined;}};
  class Client {
    constructor({beforeRequest}) {this.before = beforeRequest;}
    async exchange() {await this.before(); calls.push('exchange'); return {accessToken:'secret-access', refreshToken:'secret-refresh'};}
    async me() {await this.before(); calls.push('me'); return {id:'1',username};}
    async following(id) {await this.before(); calls.push('following:'+id); return {data:[],meta:{result_count:0}};}
    async disconnect() {calls.push('disconnect'); await vault.clear(); return true;}
  }
  const origin = 'chrome-extension://example';
  const ext = {
    storage:{local:store},
    permissions:{async contains(p) {assert.deepEqual(p.origins.join(','),'https://api.x.com/*');return hostGrant;},async getAll() {return {data_collection:grant ? ['authenticationInfo','personallyIdentifyingInfo'] : []};}},
    runtime:{id:'example',getURL(path) {return origin+path;},getManifest() {return firefox ? {browser_specific_settings:{gecko:{data_collection_permissions:{optional:['authenticationInfo','personallyIdentifyingInfo']}}}} : {};},
      onMessage:{addListener(fn) {receiver=fn;}},onInstalled:{addListener() {}},onStartup:{addListener() {}}},
    alarms:{async create(name, options) {alarms.set(name,options);},async clear(name) {return alarms.delete(name);},onAlarm:{addListener(fn) {alarmListener=fn;}}},
    identity:{getRedirectURL(path) {return 'https://example.chromiumapp.org/'+path;},async launchWebAuthFlow({url}) {calls.push('flow'); const u=new URL(url); return u.searchParams.get('redirect_uri')+'?state='+encodeURIComponent(u.searchParams.get('state'))+'&code=code';}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/background.js'),'utf8'), {browser:ext,DSSync:S,DSOAuth:{...O,Client,vault},TwoHop:T,URL,Date,console});
  const ui = {id:'example',url:origin+'/settings.html'};
  const tab = {id:'example',url:'https://x.com/home',tab:{id:3}};
  async function send(type, extra = {}, sender = ui) {
    return await new Promise(resolve => {const pending=receiver({type,...extra},sender,resolve); if (!pending) resolve(undefined);});
  }
  return {saved,calls,alarms,send,ui,tab,getAuth:()=>auth,tick:()=>alarmListener({name:'ds-periodic'})};
}
const opted = {clientId:'public-client',consent:true,enabled:true};

test('background starts disabled, exposes callback and does not call X', async () => {
  const h=harness(); const r=await h.send('ds:status'); assert.equal(r.ok,true);
  assert.equal(r.data.config.enabled,false); assert.equal(r.data.connected,false);
  assert.equal(r.data.redirectUri,'https://example.chromiumapp.org/oauth2'); assert.equal(h.calls.length,0);
  assert.ok(h.alarms.has('ds-periodic')); assert.ok(!h.alarms.has('ds-next'));
});
test('privileged messages reject content scripts, other origins, and unknown extension pages',async()=>{
  const h=harness();
  for (const sender of [h.tab,{id:'other',url:h.ui.url},{id:'example',url:'https://evil.example/settings.html'},{id:'example',url:'chrome-extension://example/not-settings.html'}]) {
    assert.equal((await h.send('ds:connect',{},sender)).ok,false);
    assert.equal((await h.send('ds:erase',{},sender)).ok,false);
  }
  assert.equal(h.calls.length,0);
});
test('enabling without explicit consent fails without changing configuration',async()=>{
  const h=harness(); const r=await h.send('ds:configure',{config:{...opted,consent:false}});
  assert.equal(r.ok,false); assert.match(r.error,/charges/); assert.equal(h.saved.autoSync,undefined);
});
test('connection uses validated OAuth callback, binds identity, and stores no token in shared storage',async()=>{
  const h=harness({settings:{myHandle:'me'}});
  assert.equal((await h.send('ds:configure',{config:opted})).ok,true);
  assert.equal((await h.send('ds:connect')).ok,true);
  assert.equal(h.saved.syncState.account.id,'1'); assert.equal(h.saved['following:me'].complete,true);
  assert.equal(h.saved.syncState.budget.used,2); assert.equal(h.getAuth().accessToken,'secret-access');
  const exposed=JSON.stringify([h.saved,(await h.send('ds:status')).data]);
  assert.ok(!exposed.includes('secret-access')&&!exposed.includes('secret-refresh'));
});
test('OAuth identity mismatch does not overwrite the configured account or vault',async()=>{
  const h=harness({autoSync:opted,settings:{myHandle:'somebody'}});
  const r=await h.send('ds:connect'); assert.equal(r.ok,false); assert.match(r.error,/matching account/);
  assert.equal(h.saved.settings.myHandle,'somebody'); assert.equal(h.getAuth(),undefined);
  assert.ok(!h.calls.some(c=>c.startsWith('following:')));
});
test('Firefox consent is checked before launching authorization or any network calls',async()=>{
  const h=harness({autoSync:opted},{firefox:true,grant:false}); const r=await h.send('ds:connect');
  assert.equal(r.ok,false); assert.match(r.error,/permissions/); assert.equal(h.calls.length,0);
});
test('connected public client cannot be changed until disconnect',async()=>{
  const h=harness({autoSync:opted,settings:{myHandle:'me'}}); await h.send('ds:connect');
  const r=await h.send('ds:configure',{config:{...opted,clientId:'different'}});
  assert.equal(r.ok,false); assert.match(r.error,/Disconnect/); assert.equal(h.saved.autoSync.clientId,'public-client');
});
test('disconnect disables scheduling, clears credentials, and retains cached lists',async()=>{
  const h=harness({autoSync:opted,settings:{myHandle:'me'}}); await h.send('ds:connect');
  assert.equal((await h.send('ds:disconnect')).ok,true); assert.equal(h.saved.autoSync.enabled,false);
  assert.equal(h.getAuth(),undefined); assert.equal(h.saved.syncState.account,null);
  assert.ok(h.saved['following:me']); assert.ok(!h.alarms.has('ds-next'));
});
test('erase clears graph, settings, scheduling, and credentials together',async()=>{
  const h=harness({autoSync:opted,settings:{myHandle:'me'}}); await h.send('ds:connect');
  assert.equal((await h.send('ds:erase')).ok,true); assert.deepEqual(h.saved,{});
  assert.equal(h.getAuth(),undefined); assert.ok(!h.alarms.has('ds-next'));
});
test('a content follow hint cannot inject a relationship or switch the connected account',async()=>{
  const h=harness({autoSync:opted,settings:{myHandle:'me'}}); await h.send('ds:connect');
  const before=JSON.stringify(h.saved); const r=await h.send('ds:followHint',{viewer:'stranger',handles:['outsider']},h.tab);
  assert.equal(r.ok,true); assert.equal(JSON.stringify(h.saved),before);
});

for (const firefox of [false, true]) {
  test(`missing API host grant blocks ${firefox ? 'Firefox' : 'Chromium'} before OAuth`, async () => {
    const h = harness({autoSync:opted}, {firefox,hostGrant:false});
    const r = await h.send('ds:connect');
    assert.equal(r.ok,false); assert.match(r.error,/not allowed to access api\.x\.com/);
    assert.equal(h.calls.length,0);
  });
}
test('missing API grant blocks a following read without marking its list inaccessible', async () => {
  const s = S.freshState({id:'1',username:'me'});
  const h = harness({autoSync:opted,syncState:s,settings:{myHandle:'me'}}, {hostGrant:false});
  await h.send('ds:syncNow');
  assert.ok(!h.calls.some(c=>c.startsWith('following:')));
  assert.match(h.saved.syncState.message,/api\.x\.com/);
  assert.equal(h.saved['following:me'],undefined);
});
