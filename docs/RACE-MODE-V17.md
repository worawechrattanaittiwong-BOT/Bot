# RACE Mode V17

RACE is an execution mode isolated from the normal AUTO engine.

## Production behavior

- `engineMode=AUTO` preserves the existing normal engine behavior.
- `engineMode=RACE` uses the dedicated RACE execution path.
- The dashboard shows RACE as a separate control mode between AUTO and ASSISTED.
- RACE targets the configured `maxPositions` without using confidence/entry-score gates to reduce that target.
- Market analysis is still used for direction, wrong-direction handling, recovery decisions, and profit protection.
- Broker permission, SaaS access/lease, spread safety, order-rate limits, and broker rejections remain operational safeguards.
- RACE positions are tagged separately from AUTO positions.

## Release

Brain: V17

EA: 1.056

Product: 2.0.18

This file also serves as a normal source commit after the generated V17 release so production auto-deploy can verify CI on the current `main` head before deploying the release bundle.
