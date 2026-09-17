# AUTO + VECTOR EDGE V1 — Isolation / Shadow / A-B Contract

## Goal

VECTOR EDGE V1 is a mathematical decision-support module for `AUTO` only. It is introduced in isolated stages before any live decision integration.

Phases 1–3 **must not change live trading behavior**.

## Non-negotiable isolation rules

1. VECTOR EDGE V1 must not call any MT5 trade function.
2. It must not send, modify, cancel, or close orders.
3. It must not change `AUTO`, `RACE`, `ZERO_GRID`, `ASSISTED`, or `MANUAL` ownership/state.
4. It must not alter existing confidence gates, setup grades, rescue logic, ladder logic, profit defense, SL/TP, or sizing in Phases 1–3.
5. It may only consume copies of already-available AUTO diagnostics and return/log diagnostics of its own.
6. Any future behavior-changing integration must be separately feature-gated and default OFF until validated by backtest + forward/shadow telemetry.
7. The production `mt5/FastBasketBot.mq5` remains unchanged during Phases 1–3.
8. Variant B in Phase 3 is filter-only: it can never create a trade that Variant A did not already accept.

## V1 outputs

`AutoVectorEdgeV1.mqh` returns:

- `preferredDirection` — BUY / SELL / NONE diagnostic only
- `entropy` — 0 = directional probability structure, 1 = near 50/50 uncertainty
- `directionalAgreement` — velocity/acceleration agreement with selected side
- `buyEV` / `sellEV` — side-specific expected value after known cost reserve
- `edgeRatio` — normalized diagnostic edge score 0..100
- `fractionalKelly` — capped quarter-Kelly diagnostic, never direct order sizing
- `riskMultiplier` — diagnostic only
- `positiveExpectancy`
- `exitEdgeLost` — future dynamic-exit shadow signal only
- `reason`

## Mathematical intent

### Expected value

For each direction independently:

`EV = P(win) × AvgWin - P(loss) × AvgLoss - KnownCosts`

BUY and SELL retain their own expected win, expected loss, and known cost values. No positive expectancy means VECTOR EDGE must not describe the setup as strong even if raw probability is high.

### Entropy

Binary Shannon entropy is used as an uncertainty diagnostic over normalized BUY/SELL probability mass.

- near `0` = one direction strongly dominates
- near `1` = BUY/SELL probability is close to 50/50

Entropy is not a live hard gate in V1.

### Motion agreement

Velocity and acceleration are combined only as diagnostics. They do not replace the existing AUTO market model.

### Fractional Kelly

Quarter-Kelly is calculated only as a diagnostic and hard-capped at `0.25`. V1 never uses it to size live orders.

## Phase 1 — DONE

Files:

- `mt5/include/AutoVectorEdgeV1.mqh`
- this contract document

Properties:

- isolated pure math module
- no include in the production EA
- no live behavior change

## Phase 2 — DONE as isolated shadow harness

Files:

- `mt5/include/AutoVectorEdgeShadowV1.mqh`
- `mt5/FastBasketBot_VectorEdgeShadow.mq5`
- `mt5/tests/AutoVectorEdgeV1SelfTest.mq5`

### Phase 2 safety architecture

`FastBasketBot_VectorEdgeShadow.mq5` is a separate, non-production EA translation unit.

It uses the unchanged production EA source and renames only its `OnTimer` handler at preprocess time. The wrapper then:

1. calls the original `ScenovaBaseOnTimer()` first;
2. runs `AutoVectorEdgeShadowObserve()` afterward;
3. reads AUTO V20 diagnostic state only;
4. emits one JSON-line shadow record roughly every five seconds;
5. never sends VECTOR EDGE output back into entry, exit, sizing, SL/TP, rescue, ladder, ownership, or any execution path.

### Scope gate

Shadow evaluation runs only when `AutoV20Enabled()` is true, which requires:

- `engineMode == AUTO`
- `controlMode == AUTO`

Therefore `RACE`, `ZERO_GRID`, `ASSISTED`, and `MANUAL` are excluded from the observer.

### Probability source

For each side:

- if at least 20 historical samples exist, use the existing historical win probability;
- otherwise use existing AUTO model confidence;
- if neither exists, use a neutral 50% fallback.

The selected source is included in telemetry.

### Shadow inputs

The adapter consumes copies of existing diagnostics only:

- AUTO BUY/SELL probability/confidence
- side-specific expected profit/loss/cost
- AUTO phase persistence
- AUTO short-horizon momentum and momentum change
- ATR ratio as volatility uncertainty
- current spread versus learned spread profile
- model confidence as an uncertainty term

None of these source values are modified.

## Phase 3 — DONE as counterfactual A/B harness

Files:

- `mt5/include/AutoVectorEdgeABV1.mqh`
- `mt5/FastBasketBot_VectorEdgeAB.mq5`
- `mt5/tests/AutoVectorEdgeABV1SelfTest.mq5`

### A/B design

- **Variant A** = existing AUTO V20 and remains the only real execution path.
- **Variant B** = hypothetical VECTOR EDGE filter over decisions already accepted by Variant A.
- Variant B has no order execution path.
- `VECTOR_EDGE_AB_EXECUTION_ENABLED` is hard-coded `false`.
- Variant B can only classify an accepted AUTO decision as `KEEP_AUTO_DECISION` or `WOULD_BLOCK` with a reason.
- Variant B can never promote an AUTO rejection/no-trade into a new trade.
- Existing AUTO orders still execute exactly as Variant A decided.

This design deliberately measures the counterfactual question:

> If VECTOR EDGE had been used only as an additional conservative filter, which existing AUTO trades would it have kept or filtered?

Because Variant A still takes the real trades, actual trade outcomes can later be compared against the logged Variant B KEEP/BLOCK labels without exposing capital to an unvalidated filter.

### Phase 3 filter profile

The first counterfactual profile is intentionally simple and fixed for reproducibility:

- positive expected value required
- VECTOR preferred direction must match AUTO direction
- `edgeRatio >= 40`
- `directionalAgreement >= 0.35`
- `entropy <= 0.98`

These are experiment thresholds only. They are **not production trading rules** and must not be tuned on a single profitable backtest.

### Decision-scoped logging

The observer samples only when `g_autoV20DecisionId` changes. Each record includes:

- AUTO decision ID and FIRST/ADD kind
- whether AUTO accepted the decision
- AUTO direction/reason/reject reason
- hypothetical Variant B KEEP/BLOCK result and reason
- VECTOR preferred direction
- edge ratio
- entropy
- directional agreement
- BUY EV / SELL EV

A rolling summary is printed every 25 observed AUTO decisions.

### Phase 3 output

Logs:

`VECTOR_EDGE_AB { ... }`

and periodically:

`VECTOR_EDGE_AB_SUMMARY { ... }`

The production SaaS heartbeat remains untouched.

## Phase 4 — Optional dynamic exit — NOT STARTED

Only if Phase 3 improves out-of-sample results:

- shadow `exitEdgeLost` first
- never allow a single weak tick to close a winner
- require hysteresis/time confirmation
- preserve existing Smart Profit Defense behavior unless explicitly superseded in a dedicated release

## Acceptance tests before any live hook

1. Production `mt5/FastBasketBot.mq5` remains unchanged.
2. Existing `main` branch remains unchanged.
3. RACE / ZERO GRID / ASSISTED / MANUAL code remains untouched.
4. Shadow and A/B observers are hard-gated by `AutoV20Enabled()`.
5. Original `OnTimer` executes before VECTOR EDGE observation.
6. Negative EV never produces a positive edge classification.
7. 50/50 probabilities produce high entropy.
8. Strongly one-sided probability produces lower entropy.
9. Higher execution costs reduce EV.
10. Higher uncertainty/noise reduces edge ratio.
11. Kelly output never exceeds `0.25`.
12. VECTOR EDGE modules/adapters contain no trade request/action calls.
13. No VECTOR EDGE output is assigned to an existing execution variable.
14. Variant B never promotes an AUTO no-trade/rejection.
15. Variant B execution flag remains hard OFF.
16. A/B harness order/deal history must remain identical to base AUTO history for the same tester run.

## Manual validation sequence before any Phase 4 or live gate

1. Compile `mt5/tests/AutoVectorEdgeV1SelfTest.mq5`; require zero compiler errors.
2. Run it; require `failed=0`.
3. Compile `mt5/tests/AutoVectorEdgeABV1SelfTest.mq5`; require zero compiler errors.
4. Run it; require `failed=0`.
5. Compile `mt5/FastBasketBot_VectorEdgeShadow.mq5`; require zero compiler errors.
6. Compile `mt5/FastBasketBot_VectorEdgeAB.mq5`; require zero compiler errors.
7. Run Strategy Tester on base EA and A/B harness using identical settings/data.
8. Compare order/deal histories; they must be identical.
9. Join actual AUTO outcomes to `VECTOR_EDGE_AB` labels by decision/time and compare KEEP vs WOULD_BLOCK cohorts.
10. Evaluate expectancy, drawdown, winner-block rate, loser-block rate, order count, FIRST vs ADD behavior, and cost sensitivity.
11. Repeat on out-of-sample periods and different volatility regimes.
12. Do not create a live gate or merge to `main` until those results are reviewed explicitly.

## Branch

Development branch: `feature/auto-vector-edge-v1`

Do not merge to `main` until validation results are reviewed and an explicit merge is requested.
