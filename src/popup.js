(() => {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const $ = id => document.getElementById(id);
  let tabId;
  function error(e) { $('error').textContent = e.message || String(e); }
  async function send(type) {
    if (!Number.isInteger(tabId)) throw new Error('Open X, reload the page, and open this popup again.');
    let result;
    try { result = await ext.tabs.sendMessage(tabId, { type }); }
    catch { throw new Error('Cannot reach this page. Open X and reload it after installing the extension. Firefox users: also allow access to X when prompted.'); }
    if (!result?.ok) throw new Error(result?.error || 'No response from the content script.');
    return result;
  }
  async function refresh() {
    $('error').textContent = '';
    try {
      const s = await send('twohop:status');
      $('status').textContent = s.reason;
      $('sessionTotal').textContent = s.session.blocked.toLocaleString();
      $('sessionBreakdown').textContent = `${s.session.network.toLocaleString()} outside your network · ${s.session.ads.toLocaleString()} ads`;
      $('sessionEstimate').textContent = s.session.estimated ? `${s.session.estimated} counted cards had no detectable post ID; those may be counted again if X remounts them.` : 'Detected post IDs are counted once in this session.';
      $('stats').textContent = `${s.direct} direct · ${s.second} second-degree · ${s.kept} kept / ${s.hidden} hidden in the current rendered batch · ${s.removed} removed since reload`;
      $('coverage').textContent = `Lists saved for ${s.captured}/${s.totalParents} direct follows. Own list: ${s.ownComplete ? 'user-marked complete' : 'partial/unverified'}.`;
      $('capture').textContent = s.capture ? `@${s.capture.owner}: ${s.capture.count} handles. ${s.capture.running ? 'Capturing as you scroll.' : 'Stopped.'} ${s.capture.stoppedReason || ''}` : 'No capture in this tab.';
      $('start').disabled = Boolean(s.capture);
      $('stop').disabled = !s.capture;
      $('discard').disabled = !s.capture;
    } catch (e) { $('status').textContent = 'Not connected to an X tab'; error(e); }
  }
  $('resetSession').addEventListener('click', async () => {
    try { await send('twohop:resetSession'); await refresh(); } catch (e) { error(e); }
  });
  const poll = setInterval(refresh, 1500);
  addEventListener('pagehide', () => clearInterval(poll), { once: true });
  $('settings').addEventListener('click', () => ext.runtime.openOptionsPage().catch(error));
  $('refresh').addEventListener('click', refresh);
  $('start').addEventListener('click', async () => {
    try { await send('twohop:startCapture'); await refresh(); } catch (e) { error(e); }
  });
  $('stop').addEventListener('click', async () => {
    try {
      const { draft } = await send('twohop:stopCapture');
      if (draft.handles.length === 0) throw new Error('No handles detected. Scroll the Following list, or paste/import it in Settings. The current X markup may not match the capture selector.');
      // This is a review draft, not an approved relationship list.
      await ext.storage.local.set({ captureDraft: draft });
      await send('twohop:discardCapture');
      await ext.runtime.openOptionsPage();
      window.close();
    } catch (e) { error(e); }
  });
  $('discard').addEventListener('click', async () => {
    try { await send('twohop:discardCapture'); await refresh(); } catch (e) { error(e); }
  });
  ext.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    tabId = tabs[0]?.id;
    return refresh();
  }).catch(error);
})();
