'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../src/core.js'), S = require('../src/sync-engine.js');
const O = require('../src/oauth.js');
const MIN = 60000, DAY = 86400000;
const me = { id: '1', username: 'me' }, alice = { id: '2', username: 'alice' }, bob = { id: '3', username: 'bob' };
function response(users, next) { return { data: users, meta: { result_count: users.length, ...(next ? { next_token: next } : {}) } }; }
function fixture(extra = {}) {
  let now = Date.parse('2026-09-30T12:00:00Z');
  const data = { settings: { myHandle: 'me', includeSecondDegree: true },
    autoSync: { ...S.DEFAULTS, enabled: true, consent: true }, syncState: S.freshState(me), ...extra };
  const calls = [], responses = [];
  const store = {
    async get(keys) {
      if (keys === null) return structuredClone(data);
      return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(k => Object.hasOwn(data, k)).map(k => [k, structuredClone(data[k])]));
    },
    async set(o) { Object.assign(data, structuredClone(o)); },
    async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key]; }
  };
  const deps = { storage: store, now: () => now, request: async (id, cursor) => {
    calls.push({ id, cursor });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    assert.notEqual(next, undefined, 'mock response supplied'); return structuredClone(next);
  } };
  let engine = new S.Engine(deps);
  return { data, calls, responses, store, now: () => now, advance(n = MIN) { now += n; }, restart() { engine = new S.Engine(deps); },
    async step(value) { if (value !== undefined) responses.push(value); await engine.step(); },
    hint: (h = 'me', force = false) => engine.hint(h, force) };
}
test('API page validation accepts a valid empty list but rejects missing/error payloads', () => {
  assert.deepEqual(S.page({ meta: { result_count: 0 } }), { users: [], next: null });
  for (const p of [{}, {data:[]}, {meta:{result_count:2},data:[]}, {errors:[{}],meta:{result_count:0}}, response([{id:'x',username:'alice'}])]) assert.throws(() => S.page(p));
});
test('sync config clamps cadence and caps; consent is never implied', () => {
  assert.equal(S.config({intervalMinutes:1}).intervalMinutes,5);
  assert.equal(S.config({maxRequestsPerDay:9000}).maxRequestsPerDay,2000);
  assert.equal(S.config({enabled:true}).consent,false);
});
test('direct list downloads with pagination without any DOM or scrolling', async () => {
  const f=fixture(); await f.step(response([alice], 'cursor-one'));
  assert.equal(f.data['following:me'],undefined);
  f.advance(); await f.step(response([bob]));
  assert.deepEqual(f.calls,[{id:'1',cursor:null},{id:'1',cursor:'cursor-one'}]);
  assert.deepEqual(f.data['following:me'].handles,['alice','bob']);
  assert.equal(f.data['following:me'].complete,true); assert.equal(f.data['following:me'].source,'x-api');
});
test('only direct follows are traversed; no third-degree requests', async () => {
  const f=fixture(); await f.step(response([alice])); f.advance();
  await f.step(response([bob])); f.advance(); await f.step();
  assert.deepEqual(f.calls.map(c=>c.id),['1','2']);
  assert.equal(T.buildGraph(f.data).allowed.has('bob'),true);
});
test('checkpoint survives a worker restart', async () => {
  const f=fixture(); await f.step(response([alice], 'next')); f.restart(); f.advance(); await f.step(response([bob]));
  assert.deepEqual(f.data['following:me'].handles,['alice','bob']);
});
test('a failed later page never wipes a previous complete snapshot', async () => {
  const old=T.record(['existing'],true); const f=fixture({'following:me':old});
  await f.step(response([alice],'next')); f.advance(); await f.step(new S.ApiError('offline'));
  assert.deepEqual(f.data['following:me'],old);
});
test('partial HTTP-200 responses with errors are not committed', async () => {
  const f=fixture(); await f.step({...response([alice]),errors:[{title:'partial'}]});
  assert.equal(f.data['following:me'],undefined); assert.ok(f.data.syncState.blockedUntil>f.now());
});
test('rate limit respects retry timestamp and persists the exact cursor', async () => {
  const f=fixture(); await f.step(response([alice],'next')); f.advance();
  await f.step(new S.ApiError('rate limit',429,f.now()+15*MIN));
  const n=f.calls.length; f.advance(); await f.step(); assert.equal(f.calls.length,n);
  f.advance(15*MIN); await f.step(response([bob])); assert.equal(f.calls.at(-1).cursor,'next');
});
test('daily read cap stops reads and resumes after UTC rollover', async () => {
  const f=fixture({autoSync:{...S.DEFAULTS,enabled:true,consent:true,maxRequestsPerDay:1}});
  await f.step(response([alice],'next'));f.advance();await f.step();assert.equal(f.calls.length,1);
  f.advance(13*60*MIN);await f.step(response([bob]));assert.equal(f.calls.length,2);
  assert.equal(f.data.syncState.budget.used,1);
});
test('disabled sync and missing consent produce zero API reads', async () => {
  for(const opts of [{enabled:false,consent:true},{enabled:true,consent:false}]) {
    const f=fixture({autoSync:opts});await f.step();assert.equal(f.calls.length,0);
  }
});
test('account mismatch does not read another account network', async () => {
  const f=fixture({settings:{myHandle:'other'}});await f.step();assert.equal(f.calls.length,0);
});
test('new follows are automatically queued and existing fresh parents are not refetched', async () => {
  const f=fixture();await f.step(response([alice]));f.advance();await f.step(response([]));
  f.advance();await f.hint();await f.step(response([alice,bob]));
  assert.deepEqual(f.data['following:me'].handles,['alice','bob']);f.advance();await f.step(response([{id:'4',username:'charlie'}]));
  assert.equal(f.calls.at(-1).id,'3');assert.equal(T.buildGraph(f.data).allowed.has('charlie'),true);
});
test('unfollow prunes dependent edges but preserves shared second-degree membership', async () => {
  const f=fixture();await f.step(response([alice,bob]));f.advance();
  await f.step(response([{id:'4',username:'shared'},{id:'5',username:'alice_only'}]));f.advance();
  await f.step(response([{id:'4',username:'shared'}]));f.advance();await f.hint();await f.step(response([bob]));
  const g=T.buildGraph(f.data);assert.equal(g.allowed.has('alice_only'),false);assert.equal(g.allowed.has('shared'),true);
  assert.equal(f.data['following:alice'],undefined);
});
test('direct refresh preempts a second-degree traversal without losing its cursor', async () => {
  const f=fixture();await f.step(response([alice]));f.advance();await f.step(response([bob],'parent-cursor'));
  f.advance();await f.hint();await f.step(response([alice]));f.advance();await f.step(response([]));
  assert.deepEqual(f.calls.map(c=>[c.id,c.cursor]),[['1',null],['2',null],['1',null],['2','parent-cursor']]);
});
test('read-only click hints cannot add arbitrary handles and are throttled', async () => {
  const f=fixture();assert.equal(await f.hint('attacker'),false);assert.equal(await f.hint(),true);
  assert.equal(await f.hint(),false);assert.equal(f.data['following:me'],undefined);
});
test('forbidden parent list is marked unavailable, never saved as an empty list', async () => {
  const f=fixture();await f.step(response([alice]));f.advance();await f.step(new S.ApiError('denied',403));
  assert.equal(f.data['following:alice'],undefined);assert.equal(f.data.syncState.parents['2'].error,'denied');
  assert.equal(T.buildGraph(f.data).syncIncomplete,true);
});
test('invalid authorization pauses rather than polling forever', async () => {
  const f=fixture();await f.step(new S.ApiError('revoked',401));f.advance(DAY);await f.step();
  assert.equal(f.calls.length,1);assert.equal(f.data.syncState.pause,'auth');
});
test('direct API access/billing failure pauses with cached lists retained', async () => {
  for(const status of [402,403]) {const f=fixture();await f.step(new S.ApiError('no access',status));assert.equal(f.data.syncState.pause,'access');}
});
test('repeated pagination tokens stop instead of looping', async () => {
  const f=fixture();await f.step(response([alice],'loop'));f.advance();await f.step(response([bob],'loop'));
  assert.equal(f.data.syncState.pause,'access');assert.equal(f.data['following:me'],undefined);
});
test('stable account ID migrates a renamed parent snapshot', async () => {
  const f=fixture();await f.step(response([alice]));f.advance();await f.step(response([bob]));
  f.advance();await f.hint();await f.step(response([{id:'2',username:'renamed'}]));
  assert.deepEqual(f.data['following:renamed'].handles,['bob']);assert.equal(f.data['following:alice'],undefined);
});
test('initial incomplete two-hop coverage fails open unless explicitly overridden', async () => {
  const f=fixture();await f.step(response([alice]));assert.equal(T.buildGraph(f.data).syncIncomplete,true);
  f.data.autoSync.allowPartial=true;assert.equal(T.buildGraph(f.data).syncIncomplete,false);
  f.data.autoSync.allowPartial=false;f.advance();await f.step(response([bob]));assert.equal(T.buildGraph(f.data).syncIncomplete,false);
});
test('direct-only mode does not request parent lists', async () => {
  const f=fixture({settings:{myHandle:'me',includeSecondDegree:false}});await f.step(response([alice]));f.advance();await f.step();
  assert.equal(f.calls.length,1);assert.equal(T.buildGraph(f.data).syncIncomplete,false);
});
test('Retry-After seconds, dates, and rate-limit headers are respected', () => {
  const now=Date.parse('2026-09-30T00:00:00Z');
  assert.equal(S.retryTime({'retry-after':'120'},now),now+2*MIN);
  assert.equal(S.retryTime({'retry-after':new Date(now+5*MIN).toUTCString()},now),now+5*MIN);
  assert.equal(S.retryTime({'x-rate-limit-reset':String((now+8*MIN)/1000)},now),now+8*MIN+1000);
});
test('PKCE uses S256 and distinct random verifier/state per authorization', async () => {
  const a=await O.pkce(),b=await O.pkce();assert.notEqual(a.verifier,b.verifier);assert.notEqual(a.state,b.state);
  assert.match(a.verifier,/^[a-zA-Z0-9_-]{43}$/);assert.match(a.challenge,/^[a-zA-Z0-9_-]{43}$/);
  const hash=require('node:crypto').createHash('sha256').update(a.verifier).digest('base64url');assert.equal(a.challenge,hash);
});
test('authorization asks for read/refresh scopes, never social-write permissions', async () => {
  const u=new URL(O.authorizationURL('public','https://extension.test/oauth2',await O.pkce()));
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(u.searchParams.get('scope').includes('follows.read'));
  assert.equal(u.searchParams.get('scope').includes('write'),false);assert.equal(u.searchParams.has('client_secret'),false);
});
test('callback validates origin, path, state, duplicate parameters and OAuth denial', () => {
  const base='https://extension.test/oauth2';assert.equal(O.callbackCode(base+'?state=s&code=c',base,'s'),'c');
  for(const result of ['https://evil.test/oauth2?state=s&code=c',base+'?state=x&code=c',base+'?state=s&state=s&code=c',base+'?state=s&error=denied',base+'?state=s&code=c&code=d',base+'/wrong?state=s&code=c']) assert.throws(()=>O.callbackCode(result,base,'s'));
});
test('API requests never send cookies, tokens in URLs, or fetch third-party origins', async () => {
  const calls=[],client=new O.Client({fetchImpl:async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify({data:me}));}});
  await client.me({accessToken:'fixture-private'});
  assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][0].includes('fixture-private'),false);
  assert.equal(calls[0][1].headers.Authorization,'Bearer fixture-private');await assert.rejects(()=>client.http('https://evil.test/2/users/me'));
});
test('refresh token rotation updates only the credential vault', async () => {
  let stored={clientId:'public',accessToken:'old-access',refreshToken:'old-refresh',expiresAt:0};
  const vault={async get(){return structuredClone(stored);},async put(x){stored=structuredClone(x);}};
  const client=new O.Client({credentials:vault,now:()=>100000,fetchImpl:async()=>new Response(JSON.stringify({token_type:'bearer',expires_in:7200,access_token:'new-access',refresh_token:'new-refresh'}))});
  await client.refresh();assert.equal(stored.refreshToken,'new-refresh');assert.equal(stored.accessToken,'new-access');assert.equal(stored.expiresAt,7300000);
});
test('401 read is not silently retried outside the request cap', async () => {
  const paths=[];let stored={clientId:'p',accessToken:'old',refreshToken:'r',expiresAt:9999999999999};
  const client=new O.Client({credentials:{async get(){return stored;},async put(x){stored=x;}},fetchImpl:async(url)=>{
    paths.push(url);return url.includes('/token')?new Response(JSON.stringify({token_type:'bearer',expires_in:7200,access_token:'new'})):new Response('{}',{status:401});
  }});
  await assert.rejects(()=>client.following('1',null),/renewed/);assert.equal(paths.filter(p=>p.includes('/following')).length,1);
});
test('revoked optional consent prevents both API and OAuth-token requests', async () => {
  let calls=0;const client=new O.Client({beforeRequest:async()=>{throw new Error('consent required');},fetchImpl:async()=>{calls++;}});
  await assert.rejects(()=>client.me({accessToken:'a'}),/consent/);await assert.rejects(()=>client.token({}),/consent/);assert.equal(calls,0);
});
test('unrecognized token response is rejected rather than persisted', () => {
  const client=new O.Client();for(const bad of [{},{access_token:'a',token_type:'basic',expires_in:10},{access_token:'a',token_type:'bearer',expires_in:-1}]) assert.throws(()=>client.normalizedToken(bad));
});

test('network errors identify the operation without disclosing request secrets', async () => {
  const c = new O.Client({fetchImpl:async()=>{throw new TypeError('SECRET-TOKEN raw diagnostic');}});
  await assert.rejects(()=>c.token({refresh_token:'SECRET-TOKEN'}), e => {
    assert.match(e.message,/OAuth token exchange\/refresh/);
    assert.match(e.message,/TypeError/);
    assert.ok(!e.message.includes('SECRET-TOKEN'));
    return true;
  });
});
test('timeouts receive a distinct message', async () => {
  const c = new O.Client({fetchImpl:async()=>{throw new DOMException('aborted','AbortError');}});
  await assert.rejects(()=>c.me({accessToken:'not-logged'}),/timed out after 20 seconds during account lookup/);
});
test('HTTP configuration and billing errors are not reclassified as network failures', async () => {
  for (const status of [400,401,402,403,429]) {
    const c = new O.Client({fetchImpl:async()=>new Response('{}',{status})});
    await assert.rejects(()=>c.http('/2/users/me'), e => {
      assert.equal(e.status,status); assert.ok(!e.message.includes('No readable HTTP'));
      return true;
    });
  }
});
