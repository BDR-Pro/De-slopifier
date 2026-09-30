/* De-slopifier. No network calls. Shared by content and extension pages. */
(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({
    myHandle: '', enabled: false, includeSecondDegree: true,
    onlyForYou: true, hideUnknownAuthors: true, hideAds: true, mode: 'hide'
  });
  const PREFIX = 'following:';
  const MAX_HANDLES = 250000;
  const RESERVED = new Set(['home','explore','search','notifications','messages','i','settings',
    'compose','login','logout','signup','intent','share','tos','privacy','about']);
  function handle(value) {
    if (typeof value !== 'string') return null;
    const h = value.trim().replace(/^@/, '').toLowerCase();
    return /^[a-z0-9_]{1,15}$/.test(h) && !RESERVED.has(h) ? h : null;
  }
  function profileHandle(href, base = 'https://x.com') {
    try {
      const u = new URL(href, base);
      if (!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)) return null;
      if (u.protocol !== 'https:') return null;
      const m = u.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i);
      return m ? handle(m[1]) : null;
    } catch { return null; }
  }
  function followingOwner(path) {
    const m = path.match(/^\/([a-z0-9_]{1,15})\/following\/?$/i);
    return m ? handle(m[1]) : null;
  }
  function normalizeHandles(input) {
    if (!Array.isArray(input)) throw new Error('A following list must be an array of handles.');
    if (input.length > MAX_HANDLES) throw new Error(`Maximum ${MAX_HANDLES} handles per list.`);
    const out = new Set();
    for (const item of input) {
      const h = handle(item);
      if (!h) throw new Error(`Invalid handle: ${String(item).slice(0, 60)}`);
      out.add(h);
    }
    return [...out].sort();
  }
  function parseHandles(text) {
    const tokens = String(text).trim().split(/[\s,;]+/).filter(Boolean);
    return normalizeHandles(tokens.map(t => t.startsWith('https://') ? (profileHandle(t) || t) : t));
  }
  function settings(input = {}) {
    const x = input && typeof input === 'object' ? input : {};
    return {
      myHandle: handle(x.myHandle) || '',
      enabled: x.enabled === true,
      includeSecondDegree: x.includeSecondDegree !== false,
      onlyForYou: x.onlyForYou !== false,
      hideUnknownAuthors: x.hideUnknownAuthors !== false,
      hideAds: x.hideAds !== false,
      mode: x.mode === 'remove' ? 'remove' : 'hide'
    };
  }
  function record(list, complete = false, updatedAt = new Date().toISOString()) {
    return { handles: normalizeHandles(list), complete: complete === true,
      updatedAt: typeof updatedAt === 'string' && Number.isFinite(Date.parse(updatedAt))
        ? new Date(updatedAt).toISOString() : new Date().toISOString() };
  }
  function buildGraph(data) {
    const cfg = settings(data.settings);
    const me = cfg.myHandle;
    const own = me ? data[PREFIX + me] : null;
    const direct = new Set(Array.isArray(own?.handles) ? own.handles.map(handle).filter(Boolean) : []);
    direct.delete(me);
    const second = new Set();
    let captured = 0;
    let declaredComplete = 0;
    for (const parent of direct) {
      const entry = data[PREFIX + parent];
      if (!entry || !Array.isArray(entry.handles)) continue;
      captured++;
      if (entry.complete === true) declaredComplete++;
      if (cfg.includeSecondDegree) {
        for (const raw of entry.handles) {
          const h = handle(raw);
          if (h && h !== me && !direct.has(h)) second.add(h);
        }
      }
    }
    const allowed = new Set([...direct, ...second]);
    if (me) allowed.add(me);
    return { cfg, allowed, direct, second, captured, declaredComplete,
      ready: Boolean(me && own && Array.isArray(own.handles)),
      ownComplete: own?.complete === true };
  }
  function shouldKeep(author, graph) {
    const h = handle(author);
    return h ? graph.allowed.has(h) : !graph.cfg.hideUnknownAuthors;
  }
  function importGraph(value) {
    if (!value || typeof value !== 'object' || value.version !== 1 || !value.lists ||
        typeof value.lists !== 'object' || Array.isArray(value.lists)) {
      throw new Error('Expected JSON with version: 1, myHandle, and lists. See example-graph.json.');
    }
    const me = handle(value.myHandle);
    if (!me) throw new Error('The JSON needs a valid myHandle.');
    const records = Object.create(null);
    let total = 0;
    for (const [owner, entry] of Object.entries(value.lists)) {
      const h = handle(owner);
      if (!h) throw new Error(`Invalid list owner: ${owner}`);
      const list = Array.isArray(entry) ? entry : entry?.handles;
      total += Array.isArray(list) ? list.length : 0;
      if (total > 500000) throw new Error('Import exceeds 500,000 total relationships.');
      records[PREFIX + h] = record(list, !Array.isArray(entry) && entry?.complete === true,
        !Array.isArray(entry) ? entry?.updatedAt : undefined);
    }
    if (!Object.hasOwn(records, PREFIX + me)) throw new Error('JSON must include your own following list.');
    return { myHandle: me, records };
  }
  // Per-tab page-session totals, not a count of currently mounted cards.
  function createSessionCounter() {
    const seen = new Set();
    let blocked = 0, ads = 0, network = 0, estimated = 0;
    let since = new Date().toISOString();
    return Object.freeze({
      record(key, kind, count = true, approximate = false) {
        if (seen.has(key)) return false;
        seen.add(key);
        if (!count) return false;
        blocked++;
        if (kind === 'ad') ads++; else network++;
        if (approximate) estimated++;
        return true;
      },
      reset() { seen.clear(); blocked = ads = network = estimated = 0; since = new Date().toISOString(); },
      values() { return { blocked, ads, network, estimated, since }; }
    });
  }
  const api = { createSessionCounter, DEFAULTS, PREFIX, handle, profileHandle, followingOwner, normalizeHandles,
    parseHandles, settings, record, buildGraph, shouldKeep, importGraph };
  root.TwoHop = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
