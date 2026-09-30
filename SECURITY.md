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
account mismatch safeguards, and local-only processing. Never replace those with
an arbitrary @mention scan or remote scripts. HTML removal is experimental.
