# Reviewer notes — 0.2.0

Readable, unminified extension JavaScript/HTML/CSS. Build with Python 3.10+:
`python3 build.py`; Firefox output is `dist/firefox`. No dependency installation or
remote code is required for the build. Source and byte-reproducible ZIPs are supplied.

The base filter and ad hiding use local DOM inspection. Manual fixture lists can
exercise these features without API authorization. Follow the manual instructions
in docs/USAGE.md and use a logged-in X account provided privately by the publisher.

Automatic sync uses the documented X Following API and OAuth 2.0 public-client PKCE.
No live Client ID or reviewer credentials are bundled. See docs/AUTO-SYNC.md. The
publisher must configure X API access and privately supply any necessary testing
instructions/access through the store, not a public source file or issue. User consent
and a possible-cost warning are shown before API use. Firefox optional data consent
is requested on Connect/Enable. Do not claim this feature works without API setup.

New permissions: identity, alarms, api.x.com host access, and Firefox optional
transmission declarations for authentication/identifying information. Tokens are
stored only in extension-origin IndexedDB and sent only to X. No cookies or social
write actions are used. Local data handling is in PRIVACY.md. Erase invokes the
background to clear both the vault and graph. Server revocation is best effort.

Tests are offline/mock-based. Local actual-extension installation was blocked by
managed browser restrictions. Authenticated X, OAuth redirects, live API access,
Firefox runtime and store acceptance remain unverified. See TESTING.md.
