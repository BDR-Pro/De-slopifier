/* MV3 service worker (Chromium) / event background script (Firefox). */
if (typeof importScripts === 'function' && !globalThis.DSSync) importScripts('core.js', 'sync-engine.js', 'oauth.js');
(() => {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome, S = globalThis.DSSync, O = globalThis.DSOAuth, T = globalThis.TwoHop;
  async function requireApiPermissions() {
    if (!await ext.permissions.contains({ origins: ['https://api.x.com/*'] })) {
      // This is a local permission failure, not an HTTP 403 from a private list.
      throw new S.ApiError('De-slopifier is not allowed to access api.x.com. Open Settings, click Connect X (or Sync now), and approve the website permission.');
    }
    const types = ext.runtime.getManifest().browser_specific_settings?.gecko?.data_collection_permissions?.optional;
    if (types) {
      const granted = await ext.permissions.getAll();
      if (!types.every(type => granted.data_collection?.includes(type))) throw new S.ApiError('Grant the optional Firefox data permissions from Connect X before syncing.', 403);
    }
  }
  const api = new O.Client({ beforeRequest: requireApiPermissions });
  const engine = new S.Engine({ storage: ext.storage.local, request: (id, cursor) => api.following(id, cursor) });
  // All writers, OAuth actions and alarm ticks share a queue. No racing refreshes.
  let tail = Promise.resolve();
  function serial(fn) { const result = tail.then(fn); tail = result.catch(() => {}); return result; }
  async function arm() {
    const d = await ext.storage.local.get(['autoSync', 'syncState']);
    const c = S.config(d.autoSync), s = d.syncState;
    if (!c.enabled || !c.consent || !s?.account || s.pause) { await ext.alarms.clear('ds-next'); return; }
    const now = Date.now();
    await ext.alarms.create('ds-next', { when: Math.max(now + 30000, s.blockedUntil || 0, s.nextRequestAt || 0) });
  }
  async function tick() { await engine.step(); await arm(); }
  async function status() {
    const d = await ext.storage.local.get(['autoSync', 'syncState']);
    const s = d.syncState || S.freshState(), parents = Object.values(s.parents);
    return { config: S.config(d.autoSync), connected: Boolean(s.account), account: s.account,
      message: s.message, paused: s.pause, lastDirectAt: s.lastDirectAt,
      nextDirectAt: s.nextDirectAt, blockedUntil: s.blockedUntil, requestsToday: s.budget.day === S.dateKey(Date.now()) ? s.budget.used : 0,
      parentCount: parents.length, parentsSynced: parents.filter(p => p.updatedAt).length,
      unavailable: parents.filter(p => p.error).map(p => ({ username: p.username, error: p.error })),
      redirectUri: ext.identity.getRedirectURL('oauth2') };
  }
  function isUI(sender) {
    if (sender.id !== ext.runtime.id) return false;
    try {
      const u = new URL(sender.url), base = new URL(ext.runtime.getURL('/'));
      return u.protocol === base.protocol && u.host === base.host && ['/settings.html', '/popup.html'].includes(u.pathname);
    } catch { return false; }
  }
  function isXTab(sender) {
    if (sender.id !== ext.runtime.id || !sender.tab) return false;
    try { const u = new URL(sender.url); return u.protocol === 'https:' && ['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname); }
    catch { return false; }
  }
  async function configure(input) {
    const next = S.config(input), d = await ext.storage.local.get(['autoSync', 'syncState']);
    const old = S.config(d.autoSync);
    if (next.clientId && !/^[A-Za-z0-9_:.\-]{1,300}$/.test(next.clientId)) throw new Error('Enter the public OAuth Client ID, not an API secret or bearer token.');
    if (d.syncState?.account && old.clientId !== next.clientId) throw new Error('Disconnect X before changing the OAuth Client ID.');
    if (next.enabled && !next.consent) throw new Error('Acknowledge X API usage and possible charges before enabling sync.');
    const s = d.syncState || S.freshState();
    if (next.enabled && !old.enabled) { s.pause = ''; s.nextDirectAt = 0; }
    if (next.maxRequestsPerDay > old.maxRequestsPerDay && s.message.startsWith('Daily API-read')) s.nextRequestAt = 0;
    await ext.storage.local.set({ autoSync: next, syncState: s });
    await tick(); return status();
  }
  async function connect() {
    const d = await ext.storage.local.get(['autoSync', 'syncState', 'settings']);
    const c = S.config(d.autoSync);
    if (!c.clientId) throw new Error('Set your X public-client OAuth Client ID first. See docs/AUTO-SYNC.md.');
    if (!c.consent) throw new Error('Acknowledge X API usage and possible charges first.');
    const day = S.dateKey(Date.now()), oldBudget = d.syncState?.budget;
    const used = oldBudget?.day === day ? oldBudget.used : 0;
    if (used >= c.maxRequestsPerDay) throw new Error('Daily API-read cap reached. Increase it explicitly or connect after 00:00 UTC.');
    await requireApiPermissions();
    const redirect = ext.identity.getRedirectURL('oauth2'), proof = await O.pkce();
    const returned = await ext.identity.launchWebAuthFlow({ url: O.authorizationURL(c.clientId, redirect, proof), interactive: true });
    const code = O.callbackCode(returned, redirect, proof.state);
    const auth = await api.exchange(c.clientId, redirect, proof.verifier, code);
    // Meter the identity lookup too. OAuth token and revocation calls are not reads.
    const provisional = d.syncState || S.freshState(); provisional.budget = { day, used: used + 1 };
    await ext.storage.local.set({ syncState: provisional });
    const user = await api.me(auth);
    const configured = T.settings(d.settings).myHandle;
    if (configured && configured !== user.username) {
      // Keep any existing authorization and never bind another account silently.
      throw new Error(`X authorized @${user.username}, but Settings names @${configured}. Authorize the matching account or change your configured handle first.`);
    }
    await O.vault.put({ ...auth, account: user });
    const state = S.freshState(user); state.budget = provisional.budget;
    const all = await ext.storage.local.get(null);
    const stale = Object.entries(all).filter(([k, v]) => k.startsWith(T.PREFIX) && v?.source === 'x-api' && v.viewerId !== user.id).map(([k]) => k);
    if (stale.length) await ext.storage.local.remove(stale);
    await ext.storage.local.set({ syncState: state, settings: T.settings({ ...d.settings, myHandle: user.username }) });
    await tick(); return status();
  }
  async function disconnect(erase = false) {
    const d = await ext.storage.local.get(['autoSync', 'syncState']);
    // Disable scheduling before doing a best-effort server-side revocation.
    await ext.storage.local.set({ autoSync: { ...S.config(d.autoSync), enabled: false } });
    await ext.alarms.clear('ds-next');
    const revoked = await api.disconnect();
    if (erase) { await ext.storage.local.clear(); return { erased: true, revoked }; }
    const s = S.freshState(); s.budget = d.syncState?.budget || s.budget;
    s.message = revoked ? 'Disconnected. Cached following lists remain local.' : 'Local credentials removed. Also revoke the app in X Settings; online revocation could not be confirmed.';
    await ext.storage.local.set({ syncState: s }); return status();
  }
  async function handle(msg, sender) {
    if (msg?.type === 'ds:followHint' && isXTab(sender)) {
      if (await engine.hint(msg.viewer)) await tick();
      return { accepted: true };
    }
    if (!isUI(sender)) throw new Error('This action is available only from the extension settings or popup.');
    switch (msg.type) {
      case 'ds:status': return status();
      case 'ds:configure': return configure(msg.config);
      case 'ds:connect': return connect();
      case 'ds:disconnect': return disconnect();
      case 'ds:erase': return disconnect(true);
      case 'ds:syncNow': {
        const d = await ext.storage.local.get('syncState');
        await engine.hint(d.syncState?.account?.username, true); await tick(); return status();
      }
      default: throw new Error('Unknown sync action.');
    }
  }
  ext.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg?.type?.startsWith('ds:')) return false;
    serial(() => handle(msg, sender)).then(data => respond({ ok: true, data }), e => respond({ ok: false, error: e.message || 'Sync failed.' }));
    return true;
  });
  ext.alarms.onAlarm.addListener(alarm => {
    if (['ds-next', 'ds-periodic'].includes(alarm.name)) serial(tick).catch(() => {});
  });
  async function init() {
    // Recreate alarms after browser restarts or extension reloads.
    await ext.alarms.create('ds-periodic', { periodInMinutes: 1 });
    await arm();
  }
  ext.runtime.onInstalled.addListener(() => { serial(init).catch(() => {}); });
  ext.runtime.onStartup.addListener(() => { serial(init).catch(() => {}); });
  // Event pages and restarted workers also recover the next scheduled step.
  serial(init).catch(() => {});
})();
