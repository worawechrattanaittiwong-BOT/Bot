# Production Sync — Start Control Hotfix

This marker triggers the normal main-branch CI/deploy cycle after the generated start-control hotfix commit.

The included hotfix makes the Start transition explicit and timeout-safe, locks bot settings while Start is pending or the bot is running, and keeps version mismatch/update actions visible until the user performs a manual update successfully.

EA/Agent updates remain user-initiated; version detection must not trigger an automatic EA restart/update.
