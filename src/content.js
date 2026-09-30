(() => {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const T = globalThis.TwoHop;
  const TWEET = 'article[data-testid="tweet"]';
  const HIDDEN = 'data-x-twohop-hidden';
  let graph = T.buildGraph({});
  let marked = new Set();
  let scheduled = false;
  let disposed = false;
  let removed = 0;
  let scopeStatus = 'Loading settings';
  let lastURL = location.href;
  let capture = null;
  const session = T.createSessionCounter();
  const fallbackIds = new WeakMap();
  let nextFallbackId = 0;
  let stats = { active: false, hidden: 0, unknown: 0, kept: 0, rendered: 0 };

  function viewer() {
    const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"][href]');
    return link ? T.profileHandle(link.getAttribute('href'), location.origin) : null;
  }
  function primary() { return document.querySelector('[data-testid="primaryColumn"]'); }
  function scopeReason() {
    const c = graph.cfg;
    if (!c.enabled) return 'Disabled — turn on in Settings';
    if (!/^\/home\/?$/.test(location.pathname)) return 'Paused — only Home is filtered';
    if (!primary()) return 'Paused — Home column not detected';
    if (c.onlyForYou) {
      // X has no documented DOM contract. Assumes For You is the first Home tab.
      // Fail open when no selected tab can be identified, rather than filter profiles.
      const lists = [...primary().querySelectorAll('[role="tablist"]')];
      const homeTabs = lists.map(list => [...list.querySelectorAll('[role="tab"]')])
        .find(tabs => tabs.length >= 2 && tabs.some(tab => tab.getAttribute('aria-selected') === 'true'));
      if (!homeTabs || homeTabs[0].getAttribute('aria-selected') !== 'true') {
        return 'Paused — For You (first Home tab) is not selected or was not detected';
      }
    }
    return null;
  }
  function networkReason() {
    if (!graph.cfg.myHandle) return 'Set your own handle in Settings';
    if (!graph.ready) return 'Save your own Following list first';
    if (viewer() !== graph.cfg.myHandle) return 'Signed-in account does not match, or profile link is unavailable';
    return null;
  }
  function topTweets(root) {
    return [...root.querySelectorAll(TWEET)].filter(a => !a.parentElement?.closest(TWEET));
  }
  function authorHeader(article) {
    return [...article.querySelectorAll('[data-testid="User-Name"]')]
      .find(el => el.closest(TWEET) === article && !el.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], [role="link"]'));
  }
  function authorOf(article) {
    const header = authorHeader(article);
    return header ? [...header.querySelectorAll('a[href]')]
      .map(a => T.profileHandle(a.getAttribute('href'), location.origin)).find(Boolean) || null : null;
  }
  function isPromoted(article) {
    // Best-effort X markup, not a documented API. Never classify by words in post text.
    const markers = article.querySelectorAll('[data-testid="promotedIndicator"], [data-testid="promotedBadge"], [data-testid="tweetPromotedIndicator"]');
    for (const marker of markers) {
      if (marker.closest(TWEET) === article &&
          !marker.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], [role="link"], [data-testid="tweetText"]')) return true;
    }
    const placement = article.closest('[data-testid="placementTracking"]');
    return Boolean(placement && placement !== primary() &&
      !placement.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"]') &&
      (placement === article || topTweets(placement).length === 1));
  }
  function postKey(article, author) {
    const header = authorHeader(article);
    if (header) for (const link of header.querySelectorAll('a[href]')) {
      if (!link.querySelector('time')) continue;
      try {
        const u = new URL(link.getAttribute('href'), location.origin);
        const m = u.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,25})(?:\/.*)?$/i);
        if (u.protocol === 'https:' && ['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname) && m) {
          return { key: 'post:' + m[2], approximate: false };
        }
      } catch { /* Fall back to mounted-card identity. */ }
    }
    if (!fallbackIds.has(article)) fallbackIds.set(article, ++nextFallbackId);
    const text = article.querySelector('[data-testid="tweetText"]')?.textContent || '';
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return { key: `card:${fallbackIds.get(article)}:${author || '?'}:${hash >>> 0}`, approximate: true };
  }
  function clearHidden() {
    for (const element of marked) element.removeAttribute(HIDDEN);
    marked.clear();
  }
  function captureStatus() {
    if (!capture) return null;
    return { owner: capture.owner, count: capture.handles.size, running: capture.running,
      stoppedReason: capture.stoppedReason, startedAt: capture.startedAt };
  }
  function status() {
    return { ...stats, reason: scopeStatus, mode: graph.cfg.mode, removed, session: session.values(), hideAds: graph.cfg.hideAds,
      configuredAccount: graph.cfg.myHandle, detectedAccount: viewer(),
      direct: graph.direct.size, second: graph.second.size,
      captured: graph.captured, totalParents: graph.direct.size,
      ownComplete: graph.ownComplete, capture: captureStatus() };
  }
  function captureVisible() {
    if (!capture?.running) return;
    if (T.followingOwner(location.pathname) !== capture.owner || viewer() !== graph.cfg.myHandle) {
      capture.running = false;
      capture.stoppedReason = 'Navigation/account changed; review captured handles before saving.';
      return;
    }
    const column = primary();
    if (!column) return;
    const region = [...column.querySelectorAll('section[role="region"]')]
      .find(el => el.querySelector('[data-testid="UserCell"]'));
    if (!region) return;
    for (const cell of region.querySelectorAll('[data-testid="UserCell"]')) {
      if (cell.closest('aside, [data-testid="sidebarColumn"]')) continue;
      // Require an explicit @handle in a profile link. Ignore bio mentions.
      for (const anchor of cell.querySelectorAll('a[href]')) {
        if (anchor.closest('[data-testid="UserDescription"]')) continue;
        const h = T.profileHandle(anchor.getAttribute('href'), location.origin);
        if (!h) continue;
        const exact = [...anchor.querySelectorAll('span')]
          .some(s => s.textContent.trim().toLowerCase() === '@' + h);
        if (exact || anchor.textContent.trim().toLowerCase() === '@' + h) {
          if (capture.handles.size < 250000) capture.handles.add(h);
          break;
        }
      }
    }
  }
  function run({ countNew = true } = {}) {
    scheduled = false;
    if (disposed) return;
    captureVisible();
    const reason = scopeReason();
    if (reason) {
      clearHidden();
      scopeStatus = reason;
      stats = { active: false, hidden: 0, unknown: 0, kept: 0, rendered: 0 };
      return;
    }
    const networkPaused = networkReason();
    if (networkPaused && !graph.cfg.hideAds) {
      clearHidden();
      scopeStatus = 'Paused — ' + networkPaused;
      stats = { active: false, hidden: 0, unknown: 0, kept: 0, rendered: 0 };
      return;
    }
    const articles = topTweets(primary());
    const next = new Set();
    let hidden = 0, kept = 0, unknown = 0;
    for (const article of articles) {
      const author = authorOf(article);
      if (!author) unknown++;
      const ad = graph.cfg.hideAds && isPromoted(article);
      if (!ad && (networkPaused || T.shouldKeep(author, graph))) { kept++; continue; }
      hidden++;
      const identity = postKey(article, author);
      session.record(identity.key, ad ? 'ad' : 'network', countNew, identity.approximate);
      // Stop existing inline media; this is NOT a network blocker.
      for (const media of article.querySelectorAll('video, audio')) {
        try { if (!media.paused) media.pause(); } catch { /* Media may not be ready. */ }
      }
      if (graph.cfg.mode === 'remove') {
        // Experimental: remove only the article, not a shared conversation wrapper.
        article.remove();
        removed++;
      } else {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        const target = cell && topTweets(cell).length === 1 ? cell : article;
        next.add(target);
        if (target.getAttribute(HIDDEN) !== '1') target.setAttribute(HIDDEN, '1');
      }
    }
    for (const element of marked) if (!next.has(element)) element.removeAttribute(HIDDEN);
    marked = next;
    stats = { active: true, hidden, unknown, kept, rendered: articles.length };
    scopeStatus = networkPaused ? 'Ads only — network filtering paused: ' + networkPaused : graph.cfg.mode === 'remove'
      ? 'Filtering — experimental DOM removal; reload to restore removed posts'
      : 'Filtering — reversible hiding';
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    setTimeout(run, 60);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true,
    attributes: true, attributeFilter: ['href', 'aria-selected', 'data-testid'], characterData: true });
  const navigationTimer = setInterval(() => {
    if (location.href !== lastURL) { lastURL = location.href; schedule(); }
  }, 600);
  addEventListener('popstate', schedule);
  addEventListener('pageshow', schedule);

  // Maintain a local snapshot; queued storage changes cannot be lost to an initial read.
  let snapshot = {};
  let loaded = false;
  const earlyChanges = [];
  function applyChanges(changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete snapshot[key];
      else snapshot[key] = change.newValue;
    }
  }
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!loaded) { earlyChanges.push(changes); return; }
    applyChanges(changes);
    graph = T.buildGraph(snapshot);
    schedule();
  });
  ext.storage.local.get(null).then(data => {
    snapshot = data;
    for (const change of earlyChanges) applyChanges(change);
    loaded = true;
    graph = T.buildGraph(snapshot);
    schedule();
  }).catch(error => {
    scopeStatus = `Storage unavailable: ${error.message}`;
    disposed = true;
    observer.disconnect();
    clearInterval(navigationTimer);
    clearHidden();
  });

  // Only messages from this extension. No page postMessage bridge, no remote code.
  ext.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== ext.runtime.id) return false;
    try {
      if (message?.type === 'twohop:status') { run(); reply({ ok: true, ...status() }); }
      else if (message?.type === 'twohop:resetSession') {
        session.reset();
        run({ countNew: false }); // Seed already-mounted cards without immediately refilling the count.
        reply({ ok: true, ...status() });
      }
      else if (message?.type === 'twohop:startCapture') {
        const owner = T.followingOwner(location.pathname);
        if (!owner) throw new Error('Open an exact /HANDLE/following page first. Not Followers or mutual followers.');
        if (!graph.cfg.myHandle || viewer() !== graph.cfg.myHandle) {
          throw new Error('Set your own handle in Settings and use the matching signed-in account.');
        }
        if (owner !== graph.cfg.myHandle && !graph.direct.has(owner)) {
          throw new Error('Save your own Following list first. This list owner must be someone you directly follow.');
        }
        if (capture) throw new Error('Review or discard the existing capture before starting another.');
        capture = { owner, handles: new Set(), running: true, stoppedReason: '', startedAt: new Date().toISOString() };
        captureVisible();
        reply({ ok: true, ...status() });
      } else if (message?.type === 'twohop:stopCapture') {
        if (!capture) throw new Error('No capture in this tab.');
        captureVisible();
        capture.running = false;
        reply({ ok: true, draft: { owner: capture.owner, handles: [...capture.handles].sort(),
          startedAt: capture.startedAt, stoppedReason: capture.stoppedReason } });
      } else if (message?.type === 'twohop:discardCapture') {
        capture = null;
        reply({ ok: true });
      } else return false;
    } catch (error) { reply({ ok: false, error: error.message }); }
    return false;
  });
})();
