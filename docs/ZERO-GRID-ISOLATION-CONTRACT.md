# ZERO GRID isolation contract

ZERO GRID is an isolated execution engine. Existing SCENOVA behavior must not be re-tuned as part of this feature.

## Immutable existing behavior

- AUTO decision logic remains unchanged.
- RACE core logic remains unchanged.
- ASSISTED and MANUAL behavior remains unchanged.
- Adaptive Rescue behavior remains unchanged.
- Existing entry scoring, confidence, indicator and market-regime logic remains unchanged.
- Existing SaaS access, Safe Stop, Daily Loss and broker permission infrastructure remains active.

## Allowed integration changes

Only routing needed to select ZERO_GRID may be added to shared dispatch points. ZERO GRID may add its own inputs, state, comments, pending-order ownership, UI fields and API validation.

ZERO GRID orders must be identifiable independently from other engines. A ZERO GRID cycle must never be adopted by AUTO/RACE, and an AUTO/RACE basket must never be adopted by ZERO GRID.

## Regression gate

`scripts/check-zero-grid-isolation.ps1` applies the ZERO GRID patch to temporary copies and verifies that the RACE core section is byte-identical before and after the patch. It also requires key AUTO and Rescue sentinels to remain present. CI must fail if this contract is violated.
