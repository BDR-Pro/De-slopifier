# Privacy policy

Effective version: 0.2.0 · 2026-09-30

## Local filtering and storage

De-slopifier stores your configured handle, following lists, account IDs associated
with automatic snapshots, timestamps, sync progress, request-count limits and
preferences in the browser's extension local storage. Manual Following-page capture
reads visible account cards only when you request it. Home filtering inspects outer
post authors and promotion markers. It does not fetch post or DM content via the API.

The session counter keeps detected post IDs and fallback card identities/hashes in
that X tab's content-script memory. Raw post text is not saved by the counter. A full
reload, tab close, or Reset clears the session. Closing the popup does not reset it.
No relationship data or counters are sent to the extension developer or analytics.

## Optional X authorization and automatic network sync

Automatic sync is off by default. It requires a separately configured X public-client
OAuth app, explicit API-usage consent, and authorization on X's own page. X API usage
can incur charges or consume credits on that app. No live Client ID, secret or token
is included in this distribution.

When connected, OAuth access/refresh tokens are kept in a separate extension-origin
IndexedDB credential store. They are not put in content-script-readable local
storage, X pages, exports or logs. This storage is not separately encrypted by the
extension; device compromise or a malicious extension update could expose it.

Authorization takes place at x.com. The extension sends authentication information,
requested user IDs, pagination tokens and necessary protocol parameters directly to
api.x.com to download and refresh the following network, renew authorization, or
revoke it. X can observe these requests, the authorization and normal connection
metadata. X's own privacy/billing policies apply. There is no intermediate developer
server. The extension does not send the local graph, post content, or session counters
to a developer service.

The OAuth grant uses tweet.read, users.read, follows.read and offline.access. It
requests no social-write, direct-message, payment or email scopes. It does not read
website cookies, passwords or DMs, and it performs no follows, unfollows, likes,
reposts, messages, or other social-account changes. It may notice a Follow/Unfollow
button click locally to request an earlier API refresh; that hint contains only the
current account handle and stays within the extension before the normal API read.

## Controls and deletion

Disable automatic sync to stop scheduled reads. Disconnect X stops sync and deletes
local credentials, while attempting server-side revocation. If that request fails,
the interface tells you to revoke the application in X Settings. Cached graph lists
remain local until erased. **Erase all extension data** clears local settings, graph
and credential storage. Reload open X tabs to clear memory and restore removed
content. JSON exports contain personal relationships and IDs; keep them private and
delete exported files separately.

## Permissions

- storage: local settings, graph, sync configuration and pagination checkpoints.
- activeTab and X/Twitter host access: toolbar/page interaction and local feed filtering.
- identity: explicit X OAuth authorization, not access to a Google identity.
- alarms: automatic refresh and recovery while the browser is running.
- api.x.com host access: direct X API/OAuth requests after configuration and consent.

Firefox declares optional authenticationInfo and personallyIdentifyingInfo data
permissions for the sync feature and requests them on user activation. Revoking them
prevents subsequent API/OAuth requests until granted again. Manual filtering remains
available without them. Chrome uses the in-extension explicit disclosure and opt-in.

No telemetry, remote code, advertising SDK, data sale or developer backend is present.
Ad hiding does not stop every initial download or guarantee no impressions. Browser
store/update services and X's own website behavior are outside this extension's control.

Use the repository's security-reporting process for sensitive issues. Never include
real tokens, personal relationship exports or private screenshots in public issues.
