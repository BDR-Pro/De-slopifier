'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core.js');
function fixture() {
 return { settings: { myHandle: 'me', enabled: true, includeSecondDegree: true },
   'following:me': T.record(['alice','bob'], true),
   'following:alice': T.record(['charlie','bob'], true),
   'following:bob': T.record(['dana']),
   'following:charlie': T.record(['eve']) };
}
test('normalizes case and @ prefixes', () => { assert.equal(T.handle(' @ALICE '), 'alice'); });
test('rejects invalid handles', () => {
 for (const h of ['', null, '@@alice', 'not a handle', 'a'.repeat(16), '<script>', 'home']) assert.equal(T.handle(h), null);
});
test('accepts only exact X profile URLs', () => {
 assert.equal(T.profileHandle('https://x.com/Alice'), 'alice');
 for (const u of ['https://evil.test/alice','https://x.com.evil.test/alice','http://x.com/alice',
 'https://x.com/alice/status/12','javascript:alert(1)']) assert.equal(T.profileHandle(u), null);
});
test('Following path is not Followers or Followers-you-know', () => {
 assert.equal(T.followingOwner('/Alice/following'), 'alice');
 assert.equal(T.followingOwner('/Alice/followers'), null);
 assert.equal(T.followingOwner('/Alice/followers_you_follow'), null);
});
test('parses text without evaluating it', () => {
 assert.deepEqual(T.parseHandles('@Alice, bob\nhttps://x.com/Charlie alice'), ['alice','bob','charlie']);
 assert.throws(() => T.parseHandles('<script>alert(1)</script>'));
});
test('exactly two hops plus own author', () => {
 const g=T.buildGraph(fixture());
 assert.deepEqual([...g.allowed].sort(), ['alice','bob','charlie','dana','me']);
 assert.equal(g.allowed.has('eve'), false);
 assert.equal(g.captured,2); assert.equal(g.declaredComplete,1);
});
test('unknown author policy is explicit', () => {
 const d=fixture(); let g=T.buildGraph(d); assert.equal(T.shouldKeep(null,g),false);
 d.settings.hideUnknownAuthors=false; g=T.buildGraph(d); assert.equal(T.shouldKeep(null,g),true);
});
test('unfollow invalidates only relationships dependent on removed parent', () => {
 const d=fixture(); d['following:me']=T.record(['bob']);
 const g=T.buildGraph(d); assert.equal(g.allowed.has('charlie'),false); assert.equal(g.allowed.has('dana'),true);
});
test('second degree can be disabled', () => {
 const d=fixture(); d.settings.includeSecondDegree=false;
 assert.deepEqual([...T.buildGraph(d).allowed].sort(),['alice','bob','me']);
});
test('missing own list does not arm filter', () => {
 const d=fixture(); delete d['following:me']; assert.equal(T.buildGraph(d).ready,false);
});
test('an intentionally empty own list is valid', () => {
 const d=fixture(); d['following:me']=T.record([],true); const g=T.buildGraph(d);
 assert.equal(g.ready,true); assert.deepEqual([...g.allowed],['me']);
});
test('unknown list owner is not a source of second-degree edges', () => {
 const d=fixture(); d['following:outsider']=T.record(['mallory']);
 assert.equal(T.buildGraph(d).allowed.has('mallory'),false);
});
test('schema-checked import', () => {
 const result=T.importGraph({version:1,myHandle:'ME',lists:{me:['alice'],alice:{handles:['bob'],complete:true}}});
 assert.equal(result.myHandle,'me'); assert.equal(result.records['following:me'].complete,false);
 assert.equal(result.records['following:alice'].complete,true);
});
test('invalid imports fail rather than silently discard data', () => {
 for (const value of [null,{}, {version:1,myHandle:'me',lists:{}},
  {version:1,myHandle:'me',lists:{me:['invalid handle']}}]) assert.throws(() => T.importGraph(value));
});
test('prototype-like valid handles cannot alter object prototypes', () => {
 const r=T.importGraph({version:1,myHandle:'me',lists:JSON.parse('{"me":["constructor"],"constructor":["bob"]}')});
 assert.equal(Object.getPrototypeOf(r.records),null);
 assert.deepEqual(r.records['following:constructor'].handles,['bob']);
});
test('duplicates/case do not overcount', () => {
 assert.deepEqual(T.record(['ALICE','@alice','bob']).handles,['alice','bob']);
});

test('ad hiding defaults on and can be disabled', () => {
 assert.equal(T.settings().hideAds, true);
 assert.equal(T.settings({hideAds:false}).hideAds, false);
});
test('session count deduplicates stable keys', () => {
 const s=T.createSessionCounter(); s.record('post:1','network'); s.record('post:1','network');
 assert.equal(s.values().blocked,1); assert.equal(s.values().network,1);
});
test('session count splits ads and network without double counting', () => {
 const s=T.createSessionCounter(); s.record('post:1','ad'); s.record('post:2','network'); s.record('post:1','network');
 assert.equal(s.values().blocked,2); assert.equal(s.values().ads,1); assert.equal(s.values().network,1);
});
test('reset can seed existing cards without counting them again', () => {
 const s=T.createSessionCounter(); s.record('post:1','ad'); s.reset();
 s.record('post:1','ad',false); s.record('post:1','ad'); s.record('post:2','network');
 assert.equal(s.values().blocked,1); assert.equal(s.values().ads,0);
});
test('unknown-ID estimates are explicit and resettable', () => {
 const s=T.createSessionCounter(); s.record('card:1','network',true,true);
 assert.equal(s.values().estimated,1); s.reset(); assert.equal(s.values().estimated,0);
});
