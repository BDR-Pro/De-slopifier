# Privacy policy

Effective September 30, 2026. Applies to this De-slopifier implementation.

Settings, your configured X handle, following lists, capture drafts and timestamps
are saved in browser.storage.local, not sync. During user-requested capture the
extension reads relevant visible Following-page account cards. On Home it inspects
outer post author headers and promotion markers. Lists are not fetched automatically.

The cumulative session counter retains detected post IDs and fallback mounted-card
identities only in content-script memory for that X tab. No raw post text is stored
by the counter; a local text hash helps distinguish fallback cards without IDs.
The session is cleared on a full page reload, tab close, or Reset. Reset does not
remove your saved following lists. Closing the popup does not erase the session.

No user data is sent to the developer or a backend. This code makes no network
requests, contains no analytics/remote code, and reads no cookies, auth tokens,
passwords, DMs or browser history. It performs no follows, likes, reposts, messages
or X account changes. Browser updates, store services, and X's own operation are
outside this extension's control. Hiding is not a guarantee against impressions or
initial network downloads.

JSON exports occur only on your request and contain personal relationship lists.
Protect those files. They are not encrypted by the extension. Use **Erase all
extension data** in Settings and reload X to clear stored data and in-memory
captures/counters; exported files must be deleted separately.

Permissions: storage for settings/lists; activeTab for the toolbar popup; host and
content-script access restricted to HTTPS X/Twitter domains for single-page navigation.
No account credentials are needed by this code. The main feature requires you to
be logged into X in the normal website, not to give credentials to the extension.

General questions may be posted to the repository issue tracker once the repo is
created. Do not include personal data. Use SECURITY.md for sensitive reports.
A future change to data handling must update this policy and store disclosures.
