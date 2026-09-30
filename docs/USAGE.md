# Detailed network-filter usage

See README for the session counter and optional ad hiding.

## First-time setup

1. Open **Settings & lists**, enter your own X handle, and **Save settings**. Leave filtering disabled during initial list preparation.
2. On X open `https://x.com/YOUR_HANDLE/following` (Following, not Followers).
3. Open the popup and select **Start capture**. Close the popup and scroll the Following page yourself. The capture accumulates account cards as they are rendered; it does not scroll or request more pages for you.
4. Reopen the popup and select **Stop & review**. Review the captured handles in Settings. Remove suggested accounts and any incorrect entries. Select **Save / replace list**.
5. Repeat for the Following pages of the accounts you directly follow, to add second-degree coverage. For large graphs, JSON import is more practical than visiting every list manually.
6. Enable **Include accounts followed by my direct follows**, **Enable filtering**, and save. Return to X Home's **For You** tab.

Capture is intentionally opt-in. A following list becomes authoritative for filtering only when you save/import it. The capture draft alone is not used by the filter.

The simplest deterministic test is to paste a few known handles into the list editor rather than use capture. Save your own following list, then a list owned by one of those handles. Enable filtering and inspect the popup status.

## Filtering rule

```text
allowed = {your account}
          UNION following(your account)
          UNION following(each account you directly follow)

keep a post exactly when its outer author's handle is in allowed
```

The second union is optional. A list for an account outside your direct follows is ignored, even if that account is reachable at the second hop. Unfollowing a parent in your saved direct list automatically removes any second-hop access that depended only on that parent.

Reposts are classified by the original author, NOT by the reposter. An outsider's post reposted by a direct follow is excluded unless the outsider is independently allowed. For quote posts, the outer author's identity controls the whole post; quoted content inside an allowed outer post remains visible. Mentions in the post body do not grant access.

## Hide versus remove

**Hide / collapse** is the default. A reversible CSS attribute hides the excluded article, or a single-post wrapper when safe. No original inline styles are overwritten. Disabling the filter restores hidden content that remains in the DOM.

**Remove article HTML** uses `article.remove()` and is explicitly experimental. X may expect those nodes to exist; this can interfere with rendering, scrolling, or hydration. Empty wrappers may remain. Removed posts cannot be restored by merely disabling the filter: reload the page. This option is provided because literal HTML removal was requested, not because it is the most reliable default.

Neither mode deletes a post from X, alters another person's account, or prevents the browser from initially receiving the post. This is not a bandwidth blocker or a guarantee against impression recording. A short flash before filtering is possible because processing occurs after the post is rendered.

## Scope and failure behavior

- Only `/home` is filtered. Profiles, searches, notifications and individual post/reply pages are never intentionally filtered.
- By default, the first selected Home tab is treated as **For You**. This is an explicit UI-layout assumption, not a documented X API. An unrecognized tab state pauses filtering. Uncheck **Only filter For You** to filter both Home tabs.
- Your configured handle must match the signed-in profile navigation link. Missing/unrecognized identity pauses network filtering (ad hiding may continue); the extension does not silently apply one account's graph to another account.
- Before your own list is saved, network filtering is paused rather than hiding the entire feed. Optional ad hiding may continue. A deliberately saved empty own list is different and permits only your own author.
- With **Hide posts whose author cannot be identified** enabled, an unrecognized tweet header is hidden. If X changes its author markup, this can hide valid posts. Disable filtering and inspect selectors instead of treating that as a correct network classification.
- The popup's hidden/kept counts describe currently mounted post cards, not all posts in the entire session. Removed count is per tab since page reload.

## Graph completeness and refresh

**An absent handle is not proof of being outside your real network.** It may be missing from an incomplete, inaccessible, stale, or incorrectly captured list. With a partial graph, some eligible authors will be hidden. Only complete, current and accurate inputs can implement the exact requested rule.

The “complete” checkbox is your declaration, not independent verification. Coverage reports how many of your direct follows have a stored list, not whether all of those lists are complete. Seeing `20/20` alone does not establish complete coverage.

Capture reads `UserCell` cards in the first matching Following timeline region. It ignores the sidebar and profile-bio mentions, but X may place recommendations inside that same region. Therefore, **review captured lists**; do not treat capture as certified relationship data. If it captures zero handles, paste/import instead and verify the current X markup before updating the selector.

Only relationships already visible to you or provided by you can be used. The extension does not bypass protected profiles or unavailable lists. It does not automatically refresh follows or unfollows. Use **Replace** for a fresh snapshot; **Merge partial capture** only adds handles and marks the result partial. Handle renames/reassignment can invalidate cached identities; this prototype does not resolve permanent user IDs.

Capture state lives in one tab's memory until you stop/review it; refreshing or closing that tab loses the capture. Changing the list owner or active account stops the capture to avoid mixing owners. Save or discard it before starting another capture in that tab.

## JSON format

See [`example-graph.json`](../example-graph.json). Replace the fictional handles; it is not real relationship data.

```json
{
  "version": 1,
  "myHandle": "your_handle",
  "lists": {
    "your_handle": {"handles": ["alice", "bob"], "complete": false},
    "alice": {"handles": ["charlie"], "complete": false},
    "bob": {"handles": ["dana"], "complete": false}
  }
}
```

An array can be used instead of each record; it is treated as an unverified/partial list. Exports include timestamps. Import overwrites only owners present in the file, preserves other stored lists, sets the configured account to `myHandle`, and disables filtering for review. Files are limited to 20 MB and 500,000 total relationships per import; the browser's actual local-storage quota may impose a lower practical ceiling. Imports are JSON-parsed, never executed.

## Privacy and permissions

The code makes **no network requests**, uses no API credentials, and does not read cookies, passwords, DMs, authentication tokens or browsing history. It does not follow/unfollow, like, repost, send messages, or change X account settings. It uses `storage.local`, not browser-sync storage. Saved handles and timestamps stay in the browser extension's local storage. They are not separately encrypted. Exported JSON contains personal relationship data, so keep it private.

Permissions are `storage`, `activeTab`, and content-script/host access for HTTPS X and Twitter domains only. Broad host permission enables the script to survive X's client-side navigation; it does not mean this implementation reads every kind of page content. The code only inspects the account link, relevant home posts, and the explicit Following capture region.

There is no page-to-extension `postMessage` bridge, remotely loaded code, `eval`, analytics or backend. Erase data in Settings and reload open X tabs to clear in-memory captures. The DOM is shared with X, so page-side filtering should not be treated as invisible to the site.

