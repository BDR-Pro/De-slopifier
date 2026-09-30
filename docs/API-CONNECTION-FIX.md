# De-slopifier 0.2.1: X API permission and diagnostics update

This package patches the v0.2.0 downloadable build. It has not been pushed to GitHub or submitted to a browser store.

## Install in Firefox

1. Back up your following lists using the existing export feature. Do not erase extension data.
2. Replace the files in the existing unpacked extension folder with this package's `dist/firefox` contents. Keep the same add-on ID.
3. Open `about:debugging#/runtime/this-firefox` and click **Reload** for De-slopifier. Reopen the extension settings page.
4. Click **Connect X**, approve the `api.x.com` website permission and existing optional data permissions when Firefox asks, then authorize X again. If already connected, use **Sync now**.
5. The callback should remain stable when the add-on ID is unchanged. Compare the displayed callback to your X app before reconnecting; do not regenerate secrets.

Firefox may not show a new permissions prompt if access was already granted. A denied grant now produces an explicit permissions message before authorization instead of attempting the network request.

## If a request still fails

Open `about:debugging` → **This Firefox** → **De-slopifier / Inspect** → **Console**. This read-only check prints whether the API host grant exists:

```js
browser.permissions.contains({origins: ["https://api.x.com/*"]}).then(console.log)
```

`false` means API access is not granted. `true` only confirms host permission; it does not prove network reachability, valid X authorization, or billing access.

Use the extension toolbox's **Network** tab, retry **Connect X** or **Sync now**, and inspect requests to `api.x.com`. The request method, endpoint path without its query string, HTTP status if present, and browser error name are sufficient for initial troubleshooting. Do not share Authorization headers, OAuth codes, cookies, request/response bodies containing tokens, or a full HAR export.

Do not disable browser security/CORS checks or send tokens through a third-party proxy. Requests still reject redirects and do not include website cookies.

## Build

```sh
python3 build.py
```

Windows: `py -3 build.py`. Firefox build: `dist/firefox`; Chromium build: `dist/chromium`.

## Scope of verification

The tests exercise mocked permissions and API responses. Live X authorization, the user's network, and a native Firefox runtime are not verified here. A missing host permission is one plausible cause of the original generic error, not the only possible cause.

## Verification results for this patch

68 JavaScript tests, 22 Python tooling tests, 70 Chromium DOM fixture checks, and 16 Chromium sync UI fixture checks passed. All runtime JavaScript passed syntax checks. X authorization and API responses were mocked.

## Primary documentation

- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request
- https://extensionworkshop.com/documentation/develop/debugging/
