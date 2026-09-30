/* Public-client OAuth 2.0 PKCE. Credentials stay in the extension-origin IDB. */
(function (root) {
  'use strict';
  const S = root.DSSync || (typeof require === 'function' ? require('./sync-engine.js') : null);
  const API = 'https://api.x.com';
  const SCOPES = ['tweet.read', 'users.read', 'follows.read', 'offline.access'];
  function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
  async function pkce(cryptoAPI = root.crypto) {
    const verifier = base64url(cryptoAPI.getRandomValues(new Uint8Array(32)));
    const state = base64url(cryptoAPI.getRandomValues(new Uint8Array(24)));
    const challenge = base64url(new Uint8Array(await cryptoAPI.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    return { verifier, state, challenge };
  }
  function authorizationURL(clientId, redirectUri, proof) {
    const u = new URL('https://x.com/i/oauth2/authorize');
    u.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
      scope: SCOPES.join(' '), state: proof.state, code_challenge: proof.challenge, code_challenge_method: 'S256' });
    return u.href;
  }
  function callbackCode(result, redirectUri, state) {
    const u = new URL(result), expected = new URL(redirectUri);
    if (u.origin !== expected.origin || u.pathname !== expected.pathname || u.hash || u.searchParams.getAll('state').length !== 1 ||
        u.searchParams.get('state') !== state) throw new Error('OAuth callback/state did not match. Nothing was connected.');
    if (u.searchParams.has('error')) throw new Error('X authorization was cancelled or denied.');
    const code = u.searchParams.get('code');
    if (!code || u.searchParams.getAll('code').length !== 1 || code.length > 4096) throw new Error('X did not return a valid authorization code.');
    return code;
  }
  const vault = {
    async run(mode, fn) {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('de-slopifier-auth', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('credentials');
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Cannot open local credential storage.'));
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('credentials', mode); let value;
          const r = fn(tx.objectStore('credentials'));
          r.onsuccess = () => { value = r.result; };
          tx.oncomplete = () => resolve(value);
          tx.onabort = tx.onerror = () => reject(new Error('Cannot update local credential storage.'));
        });
      } finally { db.close(); }
    },
    get() { return this.run('readonly', s => s.get('auth')); },
    put(value) { return this.run('readwrite', s => s.put(value, 'auth')); },
    clear() { return this.run('readwrite', s => s.clear()); }
  };
  class Client {
    constructor({ fetchImpl = root.fetch.bind(root), credentials = vault, now = Date.now, beforeRequest = async () => {} } = {}) {
      this.fetch = fetchImpl; this.vault = credentials; this.now = now; this.beforeRequest = beforeRequest;
    }
    async http(path, options = {}) {
      await this.beforeRequest();
      // Never accept a caller-supplied origin or arbitrary social-write endpoint.
      if (!/^\/2\/(?:oauth2\/(?:token|revoke)|users\/(?:me|[0-9]{1,25}\/following))(?:\?|$)/.test(path)) throw new Error('Unsupported X API path.');
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
      let response;
      try { response = await this.fetch(API + path, { ...options, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal }); }
      catch (error) {
        // Report the operation, not URLs, request bodies, tokens, or raw error text.
        const operation = path.startsWith('/2/oauth2/token') ? 'OAuth token exchange/refresh'
          : path.startsWith('/2/oauth2/revoke') ? 'OAuth revocation'
          : path.startsWith('/2/users/me') ? 'account lookup' : 'following-list download';
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new S.ApiError(`X API timed out after 20 seconds during ${operation}. Check your connection and try again.`);
        }
        const kind = ['TypeError', 'NetworkError', 'SecurityError'].includes(error?.name) ? ` (${error.name})` : '';
        throw new S.ApiError(`X API request failed during ${operation}${kind}. No readable HTTP response was received. Check api.x.com website permission and the extension's Network panel for a blocked request, redirect, or connection failure.`);
      }
      finally { clearTimeout(timeout); }
      if (!response.ok) {
        const labels = { 400: 'X rejected the request or OAuth app configuration.', 401: 'X rejected the authorization.',
          402: 'X API credits or billing access are required.', 403: 'X denied access to this resource.',
          404: 'The requested X resource is unavailable.', 429: 'X API rate limit reached.' };
        throw new S.ApiError(labels[response.status] || `X API returned HTTP ${response.status}.`, response.status,
          response.status === 429 ? S.retryTime(response.headers, this.now()) : 0);
      }
      try { return await response.json(); } catch { throw new S.ApiError('X returned a non-JSON response.'); }
    }
    async token(params) {
      return this.http('/2/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    }
    normalizedToken(body, previous = {}) {
      if (typeof body.access_token !== 'string' || !body.access_token || body.token_type?.toLowerCase() !== 'bearer' ||
          !Number.isFinite(Number(body.expires_in)) || Number(body.expires_in) <= 0) throw new S.ApiError('Invalid X token response. Reconnect X.', 401);
      if (typeof body.scope === 'string' && !SCOPES.every(scope => body.scope.split(' ').includes(scope))) throw new S.ApiError('X did not grant all required read/refresh scopes.', 401);
      return { ...previous, accessToken: body.access_token, refreshToken: body.refresh_token || previous.refreshToken || '',
        expiresAt: this.now() + Number(body.expires_in) * 1000 };
    }
    async exchange(clientId, redirectUri, verifier, code) {
      const body = await this.token({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier, code });
      return this.normalizedToken(body, { clientId });
    }
    async refresh(force = false) {
      const auth = await this.vault.get();
      if (!auth) throw new S.ApiError('Connect X first.', 401);
      if (!force && auth.expiresAt > this.now() + 60000) return auth;
      if (!auth.refreshToken) throw new S.ApiError('Reconnect X to renew authorization.', 401);
      let body;
      try { body = await this.token({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: auth.clientId }); }
      catch (e) { if ([400, 401, 403].includes(e.status)) throw new S.ApiError('Reconnect X to renew authorization.', 401); throw e; }
      const next = this.normalizedToken(body, auth); await this.vault.put(next); return next;
    }
    async me(auth) { return S.account((await this.http('/2/users/me', { headers: { Authorization: 'Bearer ' + auth.accessToken } })).data); }
    async following(id, cursor) {
      if (!S.uid(id)) throw new Error('Invalid X user ID.');
      const params = new URLSearchParams({ max_results: '1000', 'user.fields': 'id,username' });
      if (cursor) params.set('pagination_token', cursor);
      let auth = await this.refresh();
      const read = () => this.http(`/2/users/${id}/following?${params}`, { headers: { Authorization: 'Bearer ' + auth.accessToken } });
      // One failed authorized read is not repeated here: leave the page checkpoint
      // in place, refresh once, and let the next metered engine step retry it.
      try { return await read(); }
      catch (e) { if (e.status === 401) { await this.refresh(true); throw new S.ApiError('Authorization renewed; this page will be retried.'); } throw e; }
    }
    async disconnect() {
      const auth = await this.vault.get(); let revoked = true;
      try {
        if (auth) await this.http('/2/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: auth.refreshToken || auth.accessToken, client_id: auth.clientId, token_type_hint: auth.refreshToken ? 'refresh_token' : 'access_token' }).toString() });
      } catch { revoked = false; }
      finally { await this.vault.clear(); }
      return revoked;
    }
  }
  root.DSOAuth = Object.freeze({ Client, vault, pkce, authorizationURL, callbackCode, SCOPES });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DSOAuth;
})(globalThis);
