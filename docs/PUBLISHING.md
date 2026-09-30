> **0.2.0 update:** Automatic sync adds X OAuth/API access and optional data
> transmission. Update store privacy answers and reviewer notes before publishing.
> The store workflows do not create an X OAuth app, grant API access, or pay for
> usage. See AUTO-SYNC.md and the updated PRIVACY.md. No live Client ID is bundled.

# Chrome Web Store and Firefox Add-ons

**Not published yet.** The source/workflows are prepared, but neither store listing
nor a public installation URL has been created by this chat. GitHub release,
submission, review, signing, and public availability are different states.

## Chrome: initial listing and account

Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Complete your publisher registration, any payment, two-step verification, and agreements.
Create the initial item by uploading the numbered `*-chromium.zip`. Complete listing
text, screenshots, privacy disclosures, permissions, contact/distribution information,
and the initial dashboard submission. Suggested copy is in STORE-LISTING.md.

A public privacy URL after repo creation can be
`https://github.com/BDR-Pro/De-slopifier/blob/main/PRIVACY.md`; check it logged out first.
The icon is src/icons/icon-128.png. UI screenshots use synthetic fixture data and
must not be described as proof of real feed/ad compatibility. Resize/create store
screenshots in the dashboard's required dimensions and test the extension live before
representing it as generally supported.

The API requires an existing item. Finish the initial version in the dashboard;
do not upload the same version again just because the workflow exists.

Follow [Google's API setup](https://developer.chrome.com/docs/webstore/using-api).
Enable Chrome Web Store API in Google Cloud, configure OAuth, and obtain an offline
refresh token authorized for `https://www.googleapis.com/auth/chromewebstore`.
Use an OAuth consent configuration appropriate for persistent automation; testing-only
tokens can expire. Never paste credentials into chat, source, issue comments, or YAML.

Repository **variables**:

| Name | Value |
| --- | --- |
| CWS_PUBLISHER_ID | Publisher ID from Publisher settings. |
| CWS_EXTENSION_ID | Real 32-letter item ID. |
| CHROME_PUBLISH_ENABLED | Leave unset while setting up; later set true. |

Repository or **chrome-web-store** environment **secrets**:
CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN. Configure them through GitHub
Settings, or CLI prompts (no literal secrets in command history):

```bash
gh secret set CWS_CLIENT_ID --repo BDR-Pro/De-slopifier
gh secret set CWS_CLIENT_SECRET --repo BDR-Pro/De-slopifier
gh secret set CWS_REFRESH_TOKEN --repo BDR-Pro/De-slopifier
```

Create a NEW numbered release by bumping the manifest version. Run **Publish Chrome
Web Store** manually, select that tag, and use `publish` (upload and submit) or `upload`
(upload only; submit the resulting draft manually in the dashboard).

```bash
# Example only: v0.2.1 must exist and be newer than the version uploaded to the store.
gh workflow run publish-chrome.yml --repo BDR-Pro/De-slopifier -f tag=v0.2.1 -f mode=publish
```

The helper uses API v2, polls asynchronous upload completion, blocks on warnings,
and requests ordinary review. It does not skip review or cancel pending versions.
Matching already-published/pending versions are recognized. On upload timeout or a
partial failure, inspect the dashboard before retrying the same version.

After testing, enable automatic submission for new numbered releases:
`gh variable set CHROME_PUBLISH_ENABLED --body true --repo BDR-Pro/De-slopifier`.
A successful API request does not guarantee acceptance or immediate public availability.

## Firefox: AMO

Complete an account at [AMO Developer Hub](https://addons.mozilla.org/developers/).
Generate [API credentials](https://addons.mozilla.org/developers/addon/api/key/).
Set AMO_JWT_ISSUER and AMO_JWT_SECRET as repository or **firefox-add-ons** environment secrets:

```bash
gh secret set AMO_JWT_ISSUER --repo BDR-Pro/De-slopifier
gh secret set AMO_JWT_SECRET --repo BDR-Pro/De-slopifier
```

Review store/firefox-metadata.json: name, summary, description, categories, MIT license,
and reviewer notes. The fixed add-on ID is **de-slopifier@bdr-pro**; do not change it
after first publication. The generated manifest declares optional authentication and personal-identifier
data permissions for X sync and Firefox 140 minimum. Android runtime compatibility is not tested or promised.

Run **Publish Firefox Add-ons** manually for an existing numbered release. Mozilla
web-ext@10.5.0 lints and submits the **listed** package plus matching source. It can
create the first listing with the supplied metadata or submit a new version. The
--approval-timeout 0 option returns after submission, not after review/signing.
Complete outstanding privacy-policy, screenshot, listing, account, or reviewer-access
requirements in AMO. Supply any necessary test account information privately through
AMO, never this public repo.

```bash
gh workflow run publish-firefox.yml --repo BDR-Pro/De-slopifier -f tag=v0.2.0
```

After testing: `gh variable set FIREFOX_PUBLISH_ENABLED --body true --repo BDR-Pro/De-slopifier`.
Inspect AMO before retrying interrupted submissions. The workflow is not transactionally
idempotent across every network failure. It does not attach a signed XPI to GitHub;
use the approved AMO listing for normal installation. The GitHub Firefox ZIP is unsigned.

## Real install links

Chrome assigns an item ID and AMO assigns a real listing URL. After verifying public
availability, replace the STORE_LINKS_START/END section in README with those actual
links and commit/push. Do not fabricate an ID or infer AMO's slug from the repo name.

Chrome URL shape:
`https://chromewebstore.google.com/detail/de-slopifier/ACTUAL_32_LETTER_ITEM_ID`

Copy the complete Firefox listing URL from AMO. The README intentionally has no
working store install button until those listings exist.

## Release/security behavior

Successful main builds replace rolling assets. A new MAJOR.MINOR.PATCH creates a
new numbered release. Same-version updates only refresh rolling; store versions must
increase. Numbered tags/assets are not moved or overwritten. Publishing jobs verify
a numbered release, matching manifest and main-branch ancestry before submitting.

Store workflows are called directly from Release, rather than relying on a release
published event created by GITHUB_TOKEN to trigger another run. GitHub documents that
[event restriction](https://docs.github.com/en/actions/concepts/security/github_token).
Configure required reviewers in the named publishing environments; YAML does not
create their protections. Secrets are supplied only to publishing steps, not PR tests.
Actions are commit-pinned; Dependabot proposes updates for review. The build has no
third-party dependencies; browser tests and Mozilla's tool do.

## Official API references

- [Chrome API guide](https://developer.chrome.com/docs/webstore/using-api)
- [Chrome v2 upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Chrome v2 status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [Chrome v2 publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [Mozilla web-ext reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [AMO metadata API](https://mozilla.github.io/addons-server/topics/api/addons.html)
