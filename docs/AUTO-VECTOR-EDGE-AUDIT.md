# AUTO + VECTOR EDGE — 3-Phase Safety Audit

Branch: `feature/auto-vector-edge-v1`

This audit is intentionally performed before any merge to `main`.

## Isolation result

- `main` production source is unchanged.
- `mt5/FastBasketBot.mq5` is unchanged.
- VECTOR EDGE files are new branch-only modules/harnesses.
- Phase 2/3 harnesses refuse REAL-account initialization.
- Shadow/A-B logic is hard-gated by `AutoV20Enabled()`.
- RACE, ZERO_GRID, ASSISTED, and MANUAL do not run VECTOR EDGE observers.
- VECTOR EDGE modules contain no order-send/modify/close implementation.
- No VECTOR EDGE output is assigned to base execution state, sizing, SL/TP,
  rescue, ladder, ownership, RACE state, or ZERO GRID state.

## Bugs found and fixed during audit

### 1. Independent side probabilities were normalized before EV

Previous behavior normalized BUY + SELL win rates to sum to 1 before EV.
That is valid for relative entropy, but invalid for independent historical
win-rate estimates.

Fix: only entropy uses normalized directional mass. EV and Kelly use the
absolute side probability/proxy.

### 2. AUTO cost was double-counted

AUTO V20 stores `expectedProfitMoney` net of known cost and
`expectedLossMoney` including known cost. Passing these directly into an EV
formula that subtracts `knownCostMoney` again double-counted execution cost.

Fix: Phase 2 derives gross win/loss primarily from AUTO entry/TP/SL/planned-lot
geometry through the existing read-only `AutoV20ProfitForMove()` calculation,
then applies known cost exactly once in VECTOR EDGE EV.

### 3. Normal spread was over-penalized

Previous spread penalty used `spread / reference`, so a normal spread near the
reference produced a penalty near 1.0.

Fix: penalty is now excess spread only: `max(0, spread/reference - 1)`.

### 4. Historical 0% win rate was treated as missing history

A side with >=20 real samples and 0% win rate previously fell back to model
confidence.

Fix: sample count determines whether history exists; 0% is retained as real
negative evidence.

### 5. 0% / 0% probability evidence was marked invalid

Fix: it is now valid negative/non-directional evidence, with high entropy and
negative expectancy rather than `NO_PROBABILITY_CONTEXT`.

### 6. Phase 3 confused an AUTO direction decision with an actual entry

Previous A/B counting treated a non-zero cached AUTO direction as if an order
had actually been entered, even though downstream execution guards could still
prevent the order.

Fix: Phase 3 observes the base EA order marker only after the unchanged base
event completes. B classification occurs only for actual successful AUTO order
registration.

### 7. Phase 3 mixed historical probability with model-score proxy

Comparing a historical probability on one side against an uncalibrated model
score on the other can produce misleading A/B results.

Fix: KEEP/BLOCK performance counters are evaluated only after both BUY and SELL
have at least 20 historical samples. Earlier entries are tracked separately as
`INSUFFICIENT_TWO_SIDE_HISTORY`.

### 8. Validation harness could be attached to a REAL account

Fix: Phase 2 and Phase 3 harness `OnInit()` now fails on REAL accounts. Strategy
Tester and demo validation remain available.

## Remaining non-execution limitations

- `MODEL_SCORE_PROXY` is not claimed to be a calibrated probability. Phase 2
  may display it for diagnostics, but Phase 3 performance counters require
  two-sided historical evidence.
- A/B thresholds (`edgeRatio`, agreement, entropy) are experimental constants,
  not validated production thresholds.
- `exitEdgeLost` remains diagnostic only. It is not safe for Phase 4 live exit
  behavior until position-side hysteresis/time confirmation is designed.
- Log/observer code adds small processing overhead in the validation harness.
  It runs after the base event, and production `FastBasketBot.mq5` is untouched.

## Required compile/runtime validation before any merge

Static source audit cannot prove MetaEditor compilation or runtime equivalence.
Before merge or live behavior integration:

1. Compile `mt5/tests/AutoVectorEdgeV1SelfTest.mq5` with zero errors/warnings.
2. Run it and require `failed=0`.
3. Compile `mt5/tests/AutoVectorEdgeABV1SelfTest.mq5` with zero errors/warnings.
4. Run it and require `failed=0`.
5. Compile `mt5/FastBasketBot_VectorEdgeShadow.mq5` with zero errors/warnings.
6. Compile `mt5/FastBasketBot_VectorEdgeAB.mq5` with zero errors/warnings.
7. Strategy-test base EA and validation harness on identical data/settings.
8. Confirm base and harness order/deal histories are identical.
9. Confirm RACE/ZERO_GRID/ASSISTED/MANUAL histories are identical when tested
   with their respective modes.
10. Do not merge to `main` until these checks are reviewed.
