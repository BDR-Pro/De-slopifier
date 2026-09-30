# Changelog

## 0.2.1 — API permission and error diagnostics

- Explicitly request `https://api.x.com/*` website permission from Save (when enabled), Connect X, and Sync now. Include Firefox's existing optional data consent in that request.
- Check API host permission in the background before OAuth and before every API request. Denied local permission is not mistaken for a private/inaccessible following list.
- Distinguish the 20-second timeout from other fetch failures and identify the operation without logging tokens, request bodies, query strings, or raw error messages.
- Keep the existing PKCE, credential storage, fail-closed redirect policy, and API billing safeguards unchanged.
- A permissions gap is fixed; whether it caused a particular user's error still requires a live retry. No claim of a successful live X login is made.

## 0.2.0 — 2026-09-30

- Add opt-in official X API following sync, with automatic pagination and no scrolling.
- Add X public-client OAuth PKCE, refresh-token rotation, separate credential storage,
  exact callback/state verification, read-only scopes, and disconnect/erase controls.
- Periodically refresh direct follows, queue new parents, remove unfollowed-parent
  dependencies, and refresh second-degree lists without traversing a third hop.
- Add durable page checkpoints, direct-refresh priority, server backoff, request caps,
  explicit cost consent, account binding, and last-good-snapshot preservation.
- Wait for initial automatic coverage by default; make partial filtering explicit.
- Retain session blocked-post counts, ad hiding, manual capture and existing workflows.
- Update permissions, Firefox data consent, privacy, setup and reviewer documentation.
- Live OAuth/API/store integration is not verified; see TESTING.md.


## 0.1.0 — 2026-09-30

Initial De-slopifier release based on the local X Two-Hop Filter prototype.

Adds cumulative blocked-post counts per X tab session, deduplication by detected
post ID, separate network/ad counts, reset, and explicit estimated fallback counts.
Adds optional marked promoted-post hiding, including ads-only operation before a
following graph is ready. Includes negative tests for quoted markers and ordinary
post text mentioning ads.

Includes Chromium/Firefox MV3 source, local list capture/review/import/export,
reversible hiding, experimental removal, account safeguards, MIT license, privacy
policy, install/build guides, reproducible packaging, CI, numbered/rolling releases,
and opt-in browser-store submission workflows.

No live X/Firefox runtime verification or browser-store approval is claimed.
