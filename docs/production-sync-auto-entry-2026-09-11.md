# Production Sync — Auto Entry Control Modes

This marker forces a normal main-branch CI/deploy cycle after the generated control-mode commit.

The production settings UI must use automatic BUY/SELL analysis for AUTO, RACE, ASSISTED, and MANUAL control modes. The BUY_ONLY/SELL_ONLY direction selector is not part of the customer-facing settings UI.

Reason for this sync: the previous generated web/API commit was pushed by GitHub Actions, so it did not receive its own CI run. The VPS auto-deployer intentionally waits for a successful CI result on the current main SHA, leaving production on an older bundle until a normal CI-backed commit arrives.
