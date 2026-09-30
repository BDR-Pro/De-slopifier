# Automatic following sync (v0.2.0)

**No scrolling, list-page visits, CSV import, or manual list maintenance is required
after configuration. This is the official-X-API implementation, not a keyless
website scraper.** It requires an X developer application, permitted API access,
and a one-time OAuth authorization. Signing in to the X website alone is not enough.
There is no configured live developer Client ID in this source distribution.

## One-time setup

1. Install the updated extension, open **Settings & lists**, and save your X handle.
   Use the same account when authorizing X. Leave the removal mode on **Hide / collapse**.
2. Create/configure an application in the [X Developer Console](https://console.x.com/).
   Enable OAuth 2.0 and use a **Native App or Single Page App (public client)**.
   Do not configure a confidential Web App that requires a client secret; browser
   extensions cannot keep a bundled secret confidential.
3. In the extension's **Automatic following sync** section, copy the exact callback
   URL displayed there. Register it as a callback/redirect URL in your X application.
   The URL is browser/extension-ID specific. Do not use a guessed example URL.
4. Copy the application's public **OAuth Client ID** into the extension. Do not
   paste API-key secrets, passwords, cookies, client secrets, or bearer tokens.
5. Check your developer API access, credits and pricing. Configure a monetary
   spending limit in X's console. A large second-degree graph can be expensive.
   Read the notice and explicitly acknowledge possible API charges in the extension.
6. Check **Enable automatic sync**, then **Connect X**. Authorize the matching X
   account in the official X window. Firefox additionally requests optional data
   permissions for authentication and identifying information. Manual mode does
   not require granting those permissions.
7. Enable the existing **Enable filtering** setting. Keep **Include accounts
   followed by my direct follows** checked for the original two-hop rule, or disable
   it for direct-following-only filtering. Return to For You.

The extension automatically downloads your own Following list by following API
pagination tokens. It then downloads Following lists for those accounts. It never
expands the third hop. Progress and the current page token are saved after each step.
No visit to your Following page is needed.

## New follows, unfollows, and refresh

- Your direct following list refreshes every **15 minutes by default**, adjustable
  from 5 minutes to 24 hours. Polling runs while the browser/extension can run, even
  with the X tab closed; it resumes when the browser restarts. Browser scheduling,
  sleep, network errors, API limits and the local daily cap can delay it.
- A recognized Follow/Unfollow control click on X requests an earlier refresh after
  a short delay. This is an optimization, not an assurance of instant synchronization.
  A click never directly edits the graph: only a successful API traversal does.
  Unrecognized or changed X controls are covered by periodic polling instead.
- Follows from your phone or another browser appear after the next successful direct
  refresh. This version does not receive real-time webhook events.
- A newly followed account becomes a direct allowlist member after that refresh.
  Its own following list is queued automatically. New parent lists take priority
  over old second-degree lists due for refresh.
- An unfollow removes that direct edge. Second-degree accounts remain eligible if
  any remaining direct follow still follows them. API-created snapshots for removed
  parents are pruned; no X follow/unfollow actions are performed by the extension.
- Second-degree lists refresh every **24 hours by default**, configurable from 1 to
  168 hours. Changes made by other people are not instant. Cache and pagination
  mean the graph is eventually refreshed, not an atomic real-time snapshot.
- **Sync now** requests an earlier direct refresh, but does not bypass X backoff or
  the local request cap. In-flight parent pagination is retained when a direct
  refresh takes priority.

## Coverage, safety and limits

A list is published to the filter only after all its pages are read successfully.
An error, an inaccessible list, a malformed response, or a partial response does
not silently replace a known list with an empty or incomplete one. Last-good
snapshots remain available and may become stale.

By default, while automatic initial coverage is incomplete, network filtering
keeps unverified posts visible. Existing ad hiding can remain active. You can
explicitly enable **Filter using incomplete sync results**, understanding that
eligible posts may then be hidden. An inaccessible parent list can prevent full
coverage; direct-follows-only mode avoids that second-degree dependency.

The built-in safeguards are 10,000 accounts per automatically traversed list,
50,000 stored graph relationships when committing automatic snapshots, one
following page attempt per scheduled step, a minimum 30-second spacing between
such attempts, and a default cap of 200 API read attempts per UTC day. These are
extension choices, not claims about X plan limits. They are visible in source and
may mean a large network takes multiple sessions/days or cannot complete within
the safety caps. Missing coverage is reported rather than called complete.

**The request cap is not a dollar spending limit.** One response can contain up to
1,000 users, and X can bill by returned resource rather than by HTTP call. Failed
attempts are counted conservatively. Identity lookup during Connect counts as one
read. OAuth token/refresh/revocation calls are not counted as following/user reads.
The local counter resets at 00:00 UTC and is specific to this installation, not an
app-wide quota. Set actual cost controls in the X Developer Console before enabling.

HTTP 429 respects Retry-After and X's reset header, with a fallback backoff when no
usable header exists. The extension never rotates accounts, proxies, or credentials
to evade rate limits. Authorization errors pause for reconnection; other failures
retain checkpoints and back off. It does not bypass protected or unavailable lists.

## Permissions and data handling

OAuth uses Authorization Code + PKCE S256 with `tweet.read`, `users.read`,
`follows.read`, and `offline.access`. These are read/refresh scopes, not `follows.write`,
`tweet.write`, or DM scopes. Actual data reads are restricted to `GET /2/users/me`
and `GET /2/users/{id}/following`. OAuth token and revocation calls are separate POSTs.

The extension does not read your X cookies/password or intercept website API
requests. OAuth credentials are stored in the extension-origin IndexedDB credential
store, not `storage.local`, DOM attributes, page scripts, exports or logs. Content
scripts receive no tokens. Local credentials are not separately encrypted by this
code and a compromised device or extension update remains a risk.

API requests go directly to `https://api.x.com`; authorization uses X's own page.
No developer backend, telemetry, remote JavaScript or analytics is used. Your tokens
and the requested account IDs are transmitted to X for the feature. See PRIVACY.md.

**Disconnect X** stops reads and clears local credentials, with best-effort online
revocation. If revocation fails, the UI says to revoke the app in X's connected-app
settings. Cached lists remain unless you use **Erase all extension data**, which
also clears the credential vault. Erasing exported files is your responsibility.

## Updating an existing unpacked installation

Back up your lists, replace/rebuild the files in the same unpacked extension folder,
then click Reload on the extension in the browser and reload X. The new version adds
identity/alarms/API-host permissions. If the extension ID or callback changes, update
the callback in X and reconnect. This is not an automatic store update.

## Publishing to other users

The publisher must decide who supplies and pays for the X application. This package
uses a user-entered Client ID rather than distributing a live billable application.
A public Client ID is not a secret. Do not embed a shared billable Client ID without
app-level controls and a spending limit: local per-install caps cannot enforce an
app-wide budget, and modified clients can ignore them. Configure real store privacy
answers and reviewer access before submission. A workflow cannot grant X API access,
create an OAuth app, pay for credits, or guarantee store approval.

## Primary documentation

- [X Following API and pagination](https://docs.x.com/x-api/users/get-following)
- [X OAuth 2.0 PKCE, public clients, scopes and refresh](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [X rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [X API billing and spending limits](https://docs.x.com/x-api/getting-started/pricing)
- [Chrome identity and callbacks](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Firefox identity flow](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow)
- [Firefox optional data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

Implementation was checked against these documents on 2026-09-30. Live X OAuth/API
access and store acceptance have not been verified in this environment.
