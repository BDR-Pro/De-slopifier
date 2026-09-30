# Security

Do not post tokens, passwords, private following exports, store credentials, or
unredacted account screenshots in public issues. Use synthetic reproduction data.
Use GitHub private vulnerability reporting when the owner has enabled it; otherwise
ask for a private channel without disclosing sensitive exploit details publicly.

Store credentials belong only in Actions/environment secrets. Protect main and
configure required reviewers on chrome-web-store and firefox-add-ons environments.
The YAML names environments but does not configure their protection rules.
PR tests must never receive publishing secrets. Review workflow and dependency
updates before approving releases; avoid pull_request_target for untrusted code.

X markup is untrusted and unstable. Keep schema-checked JSON, outer-author parsing,
account mismatch safeguards, and local feed processing. Never replace those with
an arbitrary @mention scan or remote scripts. HTML removal is experimental.

## Automatic sync (0.2.0)

OAuth tokens are stored in extension-origin IndexedDB, separate from content-script
local storage. No page message bridge or raw API proxy is exposed. Background
configuration and OAuth actions accept only messages from extension popup/settings
URLs; content scripts may request a throttled read refresh, never alter the allowlist
with a claimed follow or request arbitrary URLs. Review sync-engine.js, oauth.js and
background.js for the data flow. Tokens/refresh grants are not separately encrypted.
The public OAuth Client ID is not a secret. A shared developer application's billing
must be controlled in X, not solely by per-install extension request caps.
