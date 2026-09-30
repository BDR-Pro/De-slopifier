# GitHub setup

Install Git, [GitHub CLI](https://cli.github.com/), Python 3.10+, and Node 22+.
Extract the project outside any existing Git checkout. Run from its root:

```bash
gh auth login --hostname github.com --web --git-protocol https --scopes workflow
python3 scripts/bootstrap_github.py --dry-run
python3 scripts/bootstrap_github.py --owner BDR-Pro
```

Windows: use `py -3` instead of `python3`. In WSL use a WSL-installed/authenticated
GitHub CLI. Organization creation is supported through --owner when you have permission.
Repository links are adjusted; copyright and Firefox identity are not changed.

The script checks availability, tests/builds source, initializes main, sets a local
Git identity only when none is configured, stages explicitly allowed project files,
and creates a **public** repo with its description. It pushes and watches the first
Release workflow, which produces v0.1.0 and rolling downloads after CI passes.
No browser-store publication occurs until you separately configure it.

No repository or release is created merely by extracting this archive. After setup
succeeds, the repository is https://github.com/BDR-Pro/De-slopifier and releases are
under its /releases page. The script requires your local authenticated CLI because
this chat's connected GitHub actions do not expose repository creation.

Never place secrets or personal graph exports in project directories. The bootstrap
stages a source allowlist rather than arbitrary root files, but this is not a secrets
scanner. Review the source before publishing.

## Recovery

The bootstrap refuses existing repositories/.git directories and never overwrites
an existing repository or changes its visibility. Completed actions are not rolled
back after an error. Inspect git status and git remote -v before recovery.

If local initialization succeeded but remote creation failed, and the target truly
does not exist:

```bash
gh repo create BDR-Pro/De-slopifier --public --source . --remote origin --push \
 --description "Filter X For You by your following network, hide detected promoted posts, and track blocked posts this session."
```

If creation succeeded but pushing failed, verify origin points to that new repository,
then `git push -u origin main`. Do not force-push. If a workflow failed, resolve its
reported issue and rerun it in Actions. Account/organization policy, billing, or
Actions settings can block CI even though repository creation succeeded.

To rerun release checks: `gh workflow run release.yml --repo BDR-Pro/De-slopifier --ref main`.
If the numbered release exists but store submission failed, use that specific store
workflow and tag; inspect its dashboard first to avoid duplicate submissions.

Protect main and configure environment approval gates before adding store secrets.
