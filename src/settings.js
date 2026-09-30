(() => {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const T = globalThis.TwoHop;
  const $ = id => document.getElementById(id);
  let busy = false;
  function notify(message, isError = false) {
    $('message').textContent = message;
    $('message').classList.toggle('error', isError);
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { notify(e.message || String(e), true); }
    finally { busy = false; }
  }
  function putSettings(c) {
    $('me').value = c.myHandle;
    $('enabled').checked = c.enabled;
    $('second').checked = c.includeSecondDegree;
    $('hideAds').checked = c.hideAds;
    $('forYou').checked = c.onlyForYou;
    $('unknown').checked = c.hideUnknownAuthors;
    $('mode').value = c.mode;
  }
  async function renderLists() {
    const data = await ext.storage.local.get(null);
    const g = T.buildGraph(data);
    $('graphStats').textContent = `@${g.cfg.myHandle || 'not set'} · ${g.direct.size} direct · ${g.second.size} second-degree · lists for ${g.captured}/${g.direct.size} direct follows`;
    const chosen = $('savedLists').value;
    $('savedLists').replaceChildren(new Option('Select a list…', ''));
    Object.keys(data).filter(k => k.startsWith(T.PREFIX)).sort().forEach(key => {
      const owner = key.slice(T.PREFIX.length);
      const r = data[key];
      const label = `@${owner} — ${r.handles?.length || 0} accounts — ${r.complete ? 'marked complete' : 'partial'} — ${r.updatedAt ? r.updatedAt.slice(0, 10) : 'undated'}`;
      $('savedLists').add(new Option(label, owner));
    });
    $('savedLists').value = chosen;
    return data;
  }
  function loadRecord(owner, entry) {
    $('owner').value = owner;
    $('handles').value = entry.handles.join('\n');
    $('complete').checked = entry.complete === true;
    $('draftInfo').textContent = `Loaded @${owner}. Last saved ${entry.updatedAt || 'unknown'}. Review before replacing.`;
  }
  async function loadDraft(data) {
    const draft = data.captureDraft;
    if (!draft || !T.handle(draft.owner) || !Array.isArray(draft.handles)) return;
    $('owner').value = draft.owner;
    $('handles').value = T.normalizeHandles(draft.handles).join('\n');
    $('complete').checked = false;
    $('draftInfo').textContent = `Capture draft: @${draft.owner}, ${draft.handles.length} handles. Not saved as a following list yet. ${draft.stoppedReason || ''}`;
    notify('Captured handles loaded for review. Remove suggestions/mistakes, then save or merge the list.');
  }
  $('saveSettings').addEventListener('click', () => action(async () => {
    const me = T.handle($('me').value);
    if ($('me').value.trim() && !me) throw new Error('Enter your X handle, not your display name.');
    const c = T.settings({ myHandle: me, enabled: $('enabled').checked,
      includeSecondDegree: $('second').checked, onlyForYou: $('forYou').checked,
      hideUnknownAuthors: $('unknown').checked, hideAds: $('hideAds').checked, mode: $('mode').value });
    if (c.mode === 'remove' && !confirm('Experimental DOM removal can break rendering. Removed posts require a reload to restore. Continue?')) return;
    await ext.storage.local.set({ settings: c });
    await renderLists();
    notify('Settings saved. Reload X after changing removal mode; hidden posts otherwise update automatically.');
  }));
  $('savedLists').addEventListener('change', () => action(async () => {
    const owner = $('savedLists').value;
    if (!owner) return;
    const key = T.PREFIX + owner;
    const data = await ext.storage.local.get(key);
    if (data[key]) loadRecord(owner, data[key]);
  }));
  async function saveList(merge) {
    const owner = T.handle($('owner').value);
    if (!owner) throw new Error('Enter a valid list owner.');
    let handles = T.parseHandles($('handles').value);
    const key = T.PREFIX + owner;
    const data = await ext.storage.local.get([key, 'captureDraft']);
    if (merge) handles = T.normalizeHandles([...(data[key]?.handles || []), ...handles]);
    if (!handles.length && !confirm('Save an empty following list? This can hide nearly everything for this account.')) return;
    const entry = T.record(handles, !merge && $('complete').checked);
    await ext.storage.local.set({ [key]: entry });
    if (data.captureDraft?.owner === owner) await ext.storage.local.remove('captureDraft');
    await renderLists();
    loadRecord(owner, entry);
    $('savedLists').value = owner;
    notify(`Saved ${handles.length} accounts followed by @${owner}. ${merge ? 'Merged snapshot marked partial.' : 'Previous list replaced.'}`);
  }
  $('replace').addEventListener('click', () => action(() => saveList(false)));
  $('merge').addEventListener('click', () => action(() => saveList(true)));
  $('deleteList').addEventListener('click', () => action(async () => {
    const owner = T.handle($('owner').value);
    if (!owner || !confirm(`Delete the saved following list for @${owner}?`)) return;
    await ext.storage.local.remove(T.PREFIX + owner);
    await renderLists();
    $('handles').value = '';
    $('complete').checked = false;
    notify(`Deleted the saved list for @${owner}.`);
  }));
  $('exportButton').addEventListener('click', () => action(async () => {
    const data = await ext.storage.local.get(null);
    const lists = Object.create(null);
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith(T.PREFIX)) lists[key.slice(T.PREFIX.length)] = val;
    }
    const output = { version: 1, myHandle: T.settings(data.settings).myHandle,
      exportedAt: new Date().toISOString(), lists };
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'de-slopifier-graph.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify('Export requested. The JSON contains your locally saved relationship lists.');
  }));
  $('importButton').addEventListener('click', () => action(async () => {
    const file = $('importFile').files[0];
    if (!file) throw new Error('Choose a JSON file.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Maximum import file size is 20 MB.');
    const imported = T.importGraph(JSON.parse(await file.text()));
    if (!confirm(`Import ${Object.keys(imported.records).length} lists for @${imported.myHandle}? Matching lists will be overwritten and filtering disabled for review.`)) return;
    const data = await ext.storage.local.get('settings');
    const config = T.settings({ ...data.settings, myHandle: imported.myHandle, enabled: false });
    await ext.storage.local.set({ ...imported.records, settings: config });
    putSettings(config);
    await renderLists();
    notify('Import saved. Review the lists, then enable filtering in section 1.');
  }));
  $('erase').addEventListener('click', () => action(async () => {
    if (!confirm('Erase all saved handles, settings and capture drafts from this extension?')) return;
    const result = await ext.runtime.sendMessage({ type: 'ds:erase' });
    if (!result?.ok) throw new Error(result?.error || 'Reload the extension before erasing credentials.');
    putSettings(T.settings());
    $('owner').value = ''; $('handles').value = ''; $('complete').checked = false;
    $('draftInfo').textContent = 'No capture draft.';
    await renderLists();
    notify('Local data and authorization erased. Check X connected-app settings if server revocation could not be confirmed. Reload any X tabs to clear in-memory captures and restore removed posts.');
  }));
  // A newly captured draft can arrive in an already-open options tab.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.captureDraft?.newValue) {
      loadDraft({ captureDraft: changes.captureDraft.newValue }).catch(e => notify(e.message, true));
    }
  });
  action(async () => {
    const data = await renderLists();
    putSettings(T.settings(data.settings));
    await loadDraft(data);
  });
})();
