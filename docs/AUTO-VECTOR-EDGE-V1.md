# AUTO + VECTOR EDGE V1 — Shadow Integration Contract

## Goal

VECTOR EDGE V1 is a mathematical decision-support module for `AUTO` only. It is deliberately introduced as a pure/shadow component before any live decision integration.

The first release **must not change live trading behavior**.

## Non-negotiable isolation rules

1. VECTOR EDGE V1 must not call any MT5 trade function.
2. It must not send, modify, cancel, or close orders.
3. It must not change `AUTO`, `RACE`, `ZERO_GRID`, `ASSISTED`, or `MANUAL` ownership/state.
4. It must not alter existing confidence gates, setup grades, rescue logic, ladder logic, profit defense, SL/TP, or sizing in V1.
5. It may only consume copies of already-available AUTO diagnostics and return diagnostics of its own.
6. Any future behavior-changing integration must be separately feature-gated and default OFF until validated by backtest + forward/shadow telemetry.

## V1 outputs

`AutoVectorEdgeV1.mqh` returns:

- `preferredDirection` — BUY / SELL / NONE diagnostic only
- `entropy` — 0 = directional probability structure, 1 = near 50/50 uncertainty
- `directionalAgreement` — velocity/acceleration agreement with selected side
- `buyEV` / `sellEV` — expected value after known cost reserve
- `edgeRatio` — normalized diagnostic edge score 0..100
- `fractionalKelly` — capped quarter-Kelly diagnostic, never direct order sizing
- `riskMultiplier` — diagnostic only
- `positiveExpectancy`
- `exitEdgeLost` — future dynamic-exit shadow signal only
- `reason`

## Mathematical intent

### Expected value

`EV = P(win) × AvgWin - P(loss) × AvgLoss - KnownCosts`

No positive expectancy means VECTOR EDGE must not describe the setup as strong even if raw probability is high.

### Entropy

Binary Shannon entropy is used as an uncertainty diagnostic over normalized BUY/SELL probability mass.

- near `0` = one direction strongly dominates
- near `1` = BUY/SELL probability is close to 50/50

Entropy is not a hard gate in V1.

### Motion agreement

Velocity and acceleration are combined only as diagnostics. They do not replace the existing AUTO market model.

### Fractional Kelly

Quarter-Kelly is calculated only as a diagnostic and hard-capped at `0.25`. V1 never uses it to size live orders.

## Recommended staged rollout

### Phase 1 — DONE in this branch

- isolated pure math module
- no include in the production EA
- no live behavior change

### Phase 2 — Shadow telemetry

- include the module in AUTO only
- feed copies of existing AUTO V20 values
- publish VECTOR EDGE diagnostics to telemetry
- do **not** block/allow entries
- do **not** alter lots or exits

### Phase 3 — Decision A/B test

Only after shadow evidence:

- feature flag default OFF
- compare current AUTO vs AUTO + VECTOR EDGE filter
- validate expectancy, drawdown, missed winners, order count, and cost sensitivity

### Phase 4 — Optional dynamic exit

Only if Phase 3 improves out-of-sample results:

- shadow `exitEdgeLost` first
- never allow a single weak tick to close a winner
- require hysteresis/time confirmation
- preserve existing Smart Profit Defense behavior unless explicitly superseded in a dedicated release

## Acceptance tests before any live hook

1. Existing production EA source remains unchanged in Phase 1.
2. Existing `main` branch remains unchanged.
3. RACE / ZERO GRID / ASSISTED / MANUAL code is untouched.
4. Negative EV never produces a positive edge classification.
5. 50/50 probabilities produce high entropy.
6. Strongly one-sided probability produces lower entropy.
7. Higher execution costs reduce EV.
8. Higher uncertainty/noise reduces edge ratio.
9. Kelly output never exceeds `0.25`.
10. Module contains no trade request/action calls.

## Branch

Development branch: `feature/auto-vector-edge-v1`

Do not merge to `main` until shadow results are reviewed.
