/* Paginated, restartable X API reader. No website scraping and no social writes. */
(function (root) {
  'use strict';
  const T = root.TwoHop || (typeof require === 'function' ? require('./core.js') : null);
  const MINUTE = 60000, DAY = 86400000;
  const MAX_LIST = 10000, MAX_EDGES = 50000;
  const DEFAULTS = Object.freeze({ enabled: false, clientId: '', intervalMinutes: 15,
    secondRefreshHours: 24, maxRequestsPerDay: 200, allowPartial: false, consent: false });
  const integer = (n, d, lo, hi) => Number.isInteger(Number(n)) ? Math.max(lo, Math.min(hi, Number(n))) : d;
  function config(x = {}) {
    return { enabled: x.enabled === true, clientId: typeof x.clientId === 'string' ? x.clientId.trim().slice(0, 300) : '',
      intervalMinutes: integer(x.intervalMinutes, 15, 5, 1440), secondRefreshHours: integer(x.secondRefreshHours, 24, 1, 168),
      maxRequestsPerDay: integer(x.maxRequestsPerDay, 200, 1, 2000), allowPartial: x.allowPartial === true, consent: x.consent === true };
  }
  function uid(x) { return typeof x === 'string' && /^[0-9]{1,25}$/.test(x) ? x : null; }
  function account(x) {
    const id = uid(x?.id), username = T.handle(x?.username);
    if (!id || !username) throw new Error('X returned an invalid user identity.');
    return { id, username };
  }
  function page(x) {
    if (!x || typeof x !== 'object' || !x.meta || !Number.isInteger(x.meta.result_count) || x.meta.result_count < 0 ||
        (x.errors && (!Array.isArray(x.errors) || x.errors.length))) {
      throw new Error('X returned an incomplete or unrecognized following response; the saved list was not replaced.');
    }
    const list = x.data === undefined && x.meta.result_count === 0 ? [] : x.data;
    if (!Array.isArray(list) || list.length !== x.meta.result_count || list.length > 1000) {
      throw new Error('X returned an inconsistent following page; the saved list was not replaced.');
    }
    const next = x.meta.next_token;
    if (next !== undefined && (typeof next !== 'string' || !next || next.length > 4096)) throw new Error('Invalid pagination token.');
    return { users: list.map(account), next: next || null };
  }
  function dateKey(now) { return new Date(now).toISOString().slice(0, 10); }
  function nextDay(now) { return Date.parse(dateKey(now) + 'T00:00:00Z') + DAY; }
  function freshState(user = null) {
    return { account: user, parents: {}, directJob: null, parentJob: null, nextDirectAt: 0,
      nextRequestAt: 0, blockedUntil: 0, pause: '', message: user ? 'Connected. Enable automatic sync to start.' : 'Connect X to start.',
      lastDirectAt: 0, budget: { day: '', used: 0 }, lastHintAt: 0, retryCount: 0 };
  }
  function job(owner, now) { return { owner, users: {}, cursor: null, cursors: [], pages: 0, startedAt: now }; }
  function retryTime(headers, now, fallback = 15 * MINUTE) {
    const get = name => headers?.get ? headers.get(name) : headers?.[name];
    const retry = get('retry-after');
    const delay = retry && /^\d+(\.\d+)?$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry || '');
    const reset = Number(get('x-rate-limit-reset')) * 1000;
    return Math.max(now + MINUTE, Number.isFinite(delay) && delay > now ? delay : 0,
      Number.isFinite(reset) && reset > now ? reset + 1000 : 0,
      !(delay > now) && !(reset > now) ? now + fallback : 0);
  }
  class ApiError extends Error {
    constructor(message, status = 0, retryAt = 0) { super(message); this.name = 'ApiError'; this.status = status; this.retryAt = retryAt; }
  }
  // Serialise calls in the host background process. Each step performs at most one
  // following read, committing a checkpoint before sending the HTTP request.
  class Engine {
    constructor({ storage, request, now = Date.now }) { this.store = storage; this.request = request; this.now = now; }
    async hint(viewer, force = false) {
      const d = await this.store.get(['autoSync', 'syncState', 'settings']);
      const s = d.syncState, c = config(d.autoSync), now = this.now();
      if (!s?.account || !c.enabled || !c.consent || T.handle(viewer) !== s.account.username ||
          T.settings(d.settings).myHandle !== s.account.username) return false;
      if (!force && now - s.lastHintAt < MINUTE) return false;
      s.lastHintAt = now; s.nextDirectAt = 0;
      // Do not clear server/budget backoff. A click never grants an allowlist entry.
      if (force && s.pause !== 'auth') { s.pause = ''; s.message = 'Refresh requested.'; }
      await this.store.set({ syncState: s });
      return true;
    }
    async step() {
      const d = await this.store.get(null), c = config(d.autoSync), s = d.syncState;
      const now = this.now(), cfg = T.settings(d.settings);
      if (!c.enabled || !c.consent || !s?.account || s.pause) return;
      if (cfg.myHandle !== s.account.username) {
        s.message = 'Paused: configured account differs from the X authorization. Reconnect or restore your handle.';
        await this.store.set({ syncState: s }); return;
      }
      if (s.budget.day !== dateKey(now)) s.budget = { day: dateKey(now), used: 0 };
      if (s.budget.used >= c.maxRequestsPerDay) {
        s.message = 'Daily API-read request cap reached; resumes after 00:00 UTC. This cap is not a spending limit.';
        s.nextRequestAt = Math.max(s.nextRequestAt, nextDay(now));
        await this.store.set({ syncState: s }); return;
      }
      if (now < Math.max(s.nextRequestAt, s.blockedUntil)) return;
      let field;
      if (s.directJob || now >= s.nextDirectAt) {
        field = 'directJob';
        if (!s.directJob) s.directJob = job(s.account, now);
      } else if (cfg.includeSecondDegree) {
        field = 'parentJob';
        if (s.parentJob && !Object.hasOwn(s.parents, s.parentJob.owner.id)) s.parentJob = null;
        if (!s.parentJob) {
          const due = Object.entries(s.parents).filter(([, p]) => now >= (p.retryAt || 0) &&
            (!p.updatedAt || now - p.updatedAt >= c.secondRefreshHours * 3600000))
            .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
          if (due.length) s.parentJob = job({ id: due[0][0], username: due[0][1].username }, now);
        }
        if (!s.parentJob) {
          s.message = Object.values(s.parents).some(p => p.error) ? 'Available lists synced; some lists are unavailable. See coverage.' : 'Up to date. Automatic refresh is scheduled.';
          await this.store.set({ syncState: s }); return;
        }
      } else { s.message = 'Direct follows are up to date.'; await this.store.set({ syncState: s }); return; }
      let j = s[field];
      // Do not complete a days-old cursor traversal as though it were a fresh snapshot.
      if (now - j.startedAt > DAY) s[field] = j = job(j.owner, now);
      s.budget.used++; s.nextRequestAt = now + 30000;
      s.message = `Syncing @${j.owner.username} · ${Object.keys(j.users).length} accounts read · page ${j.pages + 1}`;
      await this.store.set({ syncState: s });
      try {
        const raw = await this.request(j.owner.id, j.cursor), p = page(raw);
        const pending = { ...j.users };
        for (const u of p.users) pending[u.id] = u.username;
        if (Object.keys(pending).length > MAX_LIST) throw new ApiError(`This list exceeds the ${MAX_LIST.toLocaleString()}-account safety cap. No partial replacement was applied.`, 413);
        if (p.next && (p.next === j.cursor || j.cursors.includes(p.next))) throw new ApiError('X repeated a pagination token. Sync stopped without replacing the saved list.', 422);
        j.users = pending; j.pages++;
        if (p.next) {
          j.cursors.push(p.next); j.cursor = p.next;
          s.message = `Reading @${j.owner.username} automatically · ${Object.keys(pending).length} accounts so far`;
        } else {
          await this.commit(d, s, field, now);
        }
        s.retryCount = 0; s.blockedUntil = 0;
        await this.store.set({ syncState: s });
      } catch (error) {
        const status = error.status || 0;
        if (status === 429) {
          s.blockedUntil = error.retryAt || now + 15 * MINUTE;
          s.message = 'Rate-limited by X. Progress saved; resumes after ' + new Date(s.blockedUntil).toISOString() + '.';
        } else if (status === 401) {
          s.pause = 'auth'; s.message = 'X authorization expired or was revoked. Reconnect X; saved lists are unchanged.';
        } else if (field === 'parentJob' && [403, 404, 413, 422].includes(status)) {
          const parent = s.parents[j.owner.id];
          if (parent) { parent.retryAt = now + DAY; parent.error = error.message; }
          s.parentJob = null; s.message = `Could not read @${j.owner.username}: ${error.message}`;
        } else if ([400, 402, 403, 404, 413, 422].includes(status)) {
          s.pause = 'access'; s.message = `Sync paused: ${error.message} Check X API access, credits and settings, then press Sync now.`;
        } else {
          s.retryCount = (s.retryCount || 0) + 1;
          s.blockedUntil = now + Math.min(30, 2 ** Math.min(s.retryCount, 5)) * MINUTE;
          s.message = 'Read failed; cached lists were not replaced. Will retry with backoff. ' + error.message;
        }
        await this.store.set({ syncState: s });
      }
    }
    async commit(d, s, field, now) {
      const j = s[field], key = T.PREFIX + j.owner.username;
      const handles = [...new Set(Object.values(j.users))].sort();
      const edgeCount = Object.entries(d).filter(([k]) => k.startsWith(T.PREFIX) && k !== key)
        .reduce((sum, [, v]) => sum + (Array.isArray(v?.handles) ? v.handles.length : 0), handles.length);
      if (edgeCount > MAX_EDGES) throw new ApiError(`The local graph exceeds the ${MAX_EDGES.toLocaleString()}-relationship safety cap. No partial replacement was applied.`, 413);
      const record = { ...T.record(handles, true, new Date(now).toISOString()), source: 'x-api',
        userId: j.owner.id, viewerId: s.account.id };
      const changes = { [key]: record };
      const remove = [];
      if (field === 'directJob') {
        const parents = {};
        for (const [id, username] of Object.entries(j.users)) {
          if (id === s.account.id) continue;
          const old = s.parents[id];
          parents[id] = { username, updatedAt: old?.updatedAt || 0, retryAt: old?.retryAt || 0, error: old?.error || '' };
          if (old && old.username !== username) {
            const oldKey = T.PREFIX + old.username, oldRecord = d[oldKey];
            if (oldRecord?.source === 'x-api' && oldRecord.userId === id && oldRecord.viewerId === s.account.id) {
              changes[T.PREFIX + username] = oldRecord; remove.push(oldKey);
            }
          }
        }
        for (const [id, parent] of Object.entries(s.parents)) {
          if (Object.hasOwn(parents, id)) continue;
          const k = T.PREFIX + parent.username;
          if (d[k]?.source === 'x-api' && d[k].viewerId === s.account.id) remove.push(k);
        }
        s.parents = parents; s.lastDirectAt = now;
        s.nextDirectAt = now + config(d.autoSync).intervalMinutes * MINUTE;
        if (s.parentJob && !Object.hasOwn(parents, s.parentJob.owner.id)) s.parentJob = null;
        else if (s.parentJob) s.parentJob.owner.username = parents[s.parentJob.owner.id].username;
        s.message = `Synced your ${handles.length} follows. New follows are queued for second-degree sync.`;
      } else {
        const parent = s.parents[j.owner.id];
        if (parent) { parent.updatedAt = now; parent.retryAt = 0; parent.error = ''; }
        s.message = `Synced ${handles.length} accounts followed by @${j.owner.username}.`;
      }
      s[field] = null;
      // Publish the completed list and queue together; never publish partial pages.
      changes.syncState = s;
      await this.store.set(changes);
      const obsolete = remove.filter(k => !Object.hasOwn(changes, k));
      if (obsolete.length) await this.store.remove(obsolete);
    }
  }
  const api = { DEFAULTS, config, uid, account, page, freshState, retryTime, ApiError, Engine, MAX_LIST, MAX_EDGES, dateKey };
  root.DSSync = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
