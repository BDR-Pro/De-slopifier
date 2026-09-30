# Testing status

Local verification date: 2026-09-30. Version: 0.1.0.

21 Node graph/session/validation tests passed. 70 Chromium DOM/settings/popup fixture
checks passed, including cumulative counts, deduplication, Reset, scrolling/remounts,
ad toggling, ads from followed authors, quoted ad markers, ordinary text, ads-only
mode, navigation, and experimental removal. 22 tooling tests passed, covering deterministic packages,
manifest/source integrity, checksums, safe build destinations, no-op bootstrap planning,
Chrome upload helper behavior, and mocked GitHub release state transitions.

Chromium fixtures execute real JavaScript in a local browser but use synthetic X
HTML and mocked navigation/extension APIs. They do not use a logged-in X account.
Popup screenshots show fabricated test counters, not actual browsing totals.

Not verified: authenticated live X, today's actual ad markup, every ad format/language,
Firefox extension runtime installation, real GitHub Actions execution, real repository
creation, Chrome/AMO uploads, store review, signing, or public store listing availability.
Mozilla web-ext lint is configured in CI but was not executed in this local environment;
its npm registry access was unavailable. Helper tests mock external APIs and do not
replace end-to-end release/publisher validation.

Run instructions are in README.md. No credentials are required for local tests.
