(() => {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome, $ = id => document.getElementById(id);
  let busy = false, initialized = false;
  async function dataPermission() {
    const types = ext.runtime.getManifest?.().browser_specific_settings?.gecko?.data_collection_permissions?.optional;
    // Request the API origin inside the original button click, before any await.
    // Declaring host_permissions alone does not guarantee a grant after an update.
    const requested = { origins: ['https://api.x.com/*'] };
    if (types) requested.data_collection = types;
    if (!await ext.permissions.request(requested)) throw new Error('X API website/data permissions were not granted. Allow api.x.com access and try again. Manual mode remains available.');
  }
  async function send(type, extra = {}) {
    const reply = await ext.runtime.sendMessage({ type, ...extra });
    if (!reply?.ok) throw new Error(reply?.error || 'Reload the extension to start the sync background process.');
    return reply.data;
  }
  function form() { return { clientId: $('syncClient').value, enabled: $('syncEnabled').checked,
    consent: $('syncConsent').checked, intervalMinutes: Number($('syncInterval').value),
    secondRefreshHours: Number($('syncSecondHours').value), maxRequestsPerDay: Number($('syncLimit').value),
    allowPartial: $('syncPartial').checked }; }
  function render(s) {
    $('syncStatus').textContent = s.message;
    $('syncDetails').textContent = `${s.connected ? 'Connected as @' + s.account.username : 'Not connected'} · ${s.parentsSynced}/${s.parentCount} second-degree lists synced · ${s.requestsToday}/${s.config.maxRequestsPerDay} API reads today (UTC)`;
    $('syncLast').textContent = s.lastDirectAt ? 'Your follows last synced: ' + new Date(s.lastDirectAt).toLocaleString() : 'Your follows have not been downloaded yet.';
    $('syncCallback').value = s.redirectUri;
    $('syncUnavailable').textContent = s.unavailable.length ? 'Unavailable lists: ' + s.unavailable.map(p => '@' + p.username).join(', ') + '. Coverage is incomplete; cached data may be stale.' : '';
    if (!initialized) {
      $('syncClient').value = s.config.clientId; $('syncEnabled').checked = s.config.enabled;
      $('syncConsent').checked = s.config.consent; $('syncInterval').value = s.config.intervalMinutes;
      $('syncSecondHours').value = s.config.secondRefreshHours; $('syncLimit').value = s.config.maxRequestsPerDay;
      $('syncPartial').checked = s.config.allowPartial; initialized = true;
    }
  }
  async function action(fn) {
    if (busy) return; busy = true; $('syncError').textContent = '';
    for (const id of ['syncSave', 'syncConnect', 'syncDisconnect', 'syncNow']) $(id).disabled = true;
    try { await fn(); } catch (e) { $('syncError').textContent = e.message; }
    finally { busy = false; for (const id of ['syncSave', 'syncConnect', 'syncDisconnect', 'syncNow']) $(id).disabled = false; }
  }
  $('syncSave').addEventListener('click', () => action(async () => {
    if ($('syncEnabled').checked) await dataPermission();
    render(await send('ds:configure', { config: form() }));
  }));
  $('syncConnect').addEventListener('click', () => action(async () => {
    await dataPermission();
    await send('ds:configure', { config: form() });
    const s = await send('ds:connect'); render(s);
    if (!$('me').value.trim()) $('me').value = s.account.username;
  }));
  $('syncDisconnect').addEventListener('click', () => action(async () => {
    if (!confirm('Disconnect X and stop automatic reads? Your cached lists will remain local.')) return;
    initialized = false; render(await send('ds:disconnect'));
  }));
  $('syncNow').addEventListener('click', () => action(async () => {
    await dataPermission();
    render(await send('ds:syncNow'));
  }));
  const timer = setInterval(() => { if (!busy) send('ds:status').then(render).catch(() => {}); }, 2000);
  addEventListener('pagehide', () => clearInterval(timer), { once: true });
  send('ds:status').then(render).catch(e => { $('syncError').textContent = e.message; });
})();
