# Testing status

## v0.2.1 patch verification — 2026-09-30

- 68 JavaScript unit/controller tests passed, including missing API host permission, denial before OAuth, timeout classification, and secret-safe errors.
- 22 Python packaging/tooling tests passed.
- 70 Chromium DOM fixture checks and 16 Chromium sync UI fixture checks passed. Browser extension services and X API/OAuth responses were mocked.
- All runtime JavaScript passed `node --check`.
- Native Firefox runtime and live authenticated X authorization/API access were not tested. Passing fixtures do not establish that the user's network issue is resolved.

Local verification date: 2026-09-30. Version: 0.2.0.

## Passed locally

- **62 Node tests:** graph/session behavior, official-API pagination and validation,
  new follows, unfollows, two-hop boundaries, persistent cursor recovery, rate-limit
  backoff, daily request caps, incomplete-graph protection, OAuth PKCE/state checking,
  refresh rotation, read-only endpoints, permission checks, actual background-controller
  message authorization, identity mismatch, disconnect and erase. Browser services,
  OAuth grants, credentials and X API responses are mocked where applicable.
- **70 Chromium DOM/settings/popup fixture checks:** original network/ad filtering,
  session counters, DOM recycling, reset, navigation and capture regressions.
- **14 additional Chromium sync-settings fixture checks:** configuration, explicit
  consent, browser permission requests, callback presentation, connect/disconnect,
  status refresh, error display and preservation of unsaved input. This uses real
  settings JavaScript with a mocked background and mocked authorization, not a live grant.
- **22 Python tooling tests:** deterministic packages, manifest/source integrity,
  checksums, safe build destinations, bootstrap planning, and mocked release/publisher APIs.

The browser fixtures use synthetic X HTML and mocked extension APIs/navigation.
Screenshots are synthetic previews, not proof of live X or actual browsing totals.

## Not verified

Authenticated live X, real OAuth authorization/redirects and token refresh, live
following endpoint behavior with a funded developer app, current ad markup, all ad
formats/languages, Firefox runtime installation, real GitHub Actions execution,
repository creation, Chrome/AMO submission, signing, approval and public listings.

An unpacked Chromium installation test was attempted here, but no extension worker
started. A diagnostic navigation to chrome://extensions was blocked with
ERR_BLOCKED_BY_ADMINISTRATOR. The fixture tests above do not establish that actual
extension installation or service-worker lifecycle passed. The optional
`tests/test_extension.py` smoke test is included for an unrestricted local browser;
it is not counted as passed and is not a CI gate.

Mozilla web-ext lint is configured in CI. A local npx web-ext@10.5.0 lint
attempt timed out before producing a result; lint is not counted as passed. API mocks do not replace an authenticated live test.
No real X credentials are included or required for the passing local tests.

Run instructions are in README.md; setup and API cost controls are in docs/AUTO-SYNC.md.
