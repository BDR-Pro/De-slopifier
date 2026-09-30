# Contributing

Edit src/, not dist/. Run graph/session tests, tooling tests and Chromium fixtures.
Use synthetic data and distinguish fixture testing from observations in a live X
session. New selectors need negative tests for quotes, mentions, unrelated posts,
and recycled cards. Preserve reversible hiding and explicit capture review.

The counter deduplicates stable post IDs and labels fallback counts as estimates.
Ad hiding is optional and must not classify posts by arbitrary body text. Update
privacy/store disclosures whenever data handling or permissions change.

Update CHANGELOG.md and bump src/manifest.json for numbered store releases.
Do not move published numbered tags or overwrite their assets. Contributions use MIT.
