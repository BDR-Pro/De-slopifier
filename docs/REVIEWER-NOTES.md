# Reviewer notes

Build with Python 3.10+: `python3 build.py`. No npm/pip install, transpiler, minifier,
bundler, network access or runtime dependency is needed for this build. Output is
under dist/firefox and dist/chromium. The source archive includes bundled original
icons and complete readable HTML/CSS/JS. Signing modifies the distributable after
submission; compare unsigned files when reproducing the pre-signing build.

Main functionality requires a logged-in X session, configured handle and locally
reviewed following lists. For ads-only use, enable filtering plus ad hiding before
entering lists. The first Home tab is assumed to be For You; unrecognized tab scope
pauses filtering. Missing/account-mismatched graph pauses network filtering, but
ads-only filtering may continue. No passwords or tokens are read by the code.

The popup shows cumulative unique detected post IDs per tab since reload/reset,
with an estimated fallback for no-ID cards. Hiding/removal both count. Ad classification
uses explicit promotion markers and single-post placement wrappers, not arbitrary
body text. Live selector compatibility must still be evaluated by the publisher.

No real account credentials are included in public source. Any required reviewer
access must be supplied privately in the store dashboard. Unit and Chromium fixture
tests use synthetic data; README explains running them without credentials.
