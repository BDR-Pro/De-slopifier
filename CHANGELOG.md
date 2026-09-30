# Changelog

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
