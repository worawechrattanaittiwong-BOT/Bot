# AUTO + VECTOR EDGE V1 — Shadow Integration Contract

## Goal

VECTOR EDGE V1 is a mathematical decision-support module for `AUTO` only. It is deliberately introduced as a pure/shadow component before any live decision integration.

The first releases **must not change live trading behavior**.

## Non-negotiable isolation rules

1. VECTOR EDGE V1 must not call any MT5 trade function.
2. It must not send, modify, cancel, or close orders.
3. It must not change `AUTO`, `RACE`, `ZERO_GRID`, `ASSISTED`, or `MANUAL` ownership/state.
4. It must not alter existing confidence gates, setup grades, rescue logic, ladder logic, profit defense, SL/TP, or sizing in V1.
5. It may only consume copies of already-available AUTO diagnostics and return diagnostics of its own.
6. Any future behavior-changing integration must be separately feature-gated and default OFF until validated by backtest + forward/shadow telemetry.
7. The production `mt5/FastBasketBot.mq5` remains unchanged during Phase 1 and Phase 2.

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

Entropy is not a hard gate in V1.

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

This ordering is intentional: VECTOR EDGE cannot run before the existing timer and therefore cannot influence what the original timer already decided.

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

### Shadow telemetry

Phase 2 intentionally writes JSON telemetry only to the MT5 Experts / Strategy Tester log:

`VECTOR_EDGE_SHADOW { ... }`

Fields include:

- `preferredDirection`
- `entropy`
- `directionalAgreement`
- `buyEV`
- `sellEV`
- `edgeRatio`
- `fractionalKelly`
- `riskMultiplier`
- `positiveExpectancy`
- `exitEdgeLost`
- `reason`
- `probabilitySource`
- sample count and version

The production SaaS heartbeat payload is deliberately untouched in Phase 2. Dashboard/server telemetry can be considered later only after the shadow build is compile-tested and reviewed.

## Phase 3 — Decision A/B test — NOT STARTED

Only after shadow evidence:

- feature flag default OFF
- compare current AUTO vs AUTO + VECTOR EDGE filter
- validate expectancy, drawdown, missed winners, order count, and cost sensitivity
- no merge to `main` without explicit review

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
4. Shadow observer is hard-gated by `AutoV20Enabled()`.
5. Original `OnTimer` executes before VECTOR EDGE shadow observation.
6. Negative EV never produces a positive edge classification.
7. 50/50 probabilities produce high entropy.
8. Strongly one-sided probability produces lower entropy.
9. Higher execution costs reduce EV.
10. Higher uncertainty/noise reduces edge ratio.
11. Kelly output never exceeds `0.25`.
12. VECTOR EDGE module and adapter contain no trade request/action calls.
13. No VECTOR EDGE output is assigned to an existing execution variable.

## Manual validation sequence

Before any Phase 3 work:

1. Compile `mt5/tests/AutoVectorEdgeV1SelfTest.mq5` and require zero compiler errors.
2. Run the script and require `failed=0`.
3. Compile `mt5/FastBasketBot_VectorEdgeShadow.mq5` and require zero compiler errors.
4. Run Strategy Tester on the same settings/data used for the normal EA.
5. Compare order/deal history between base EA and shadow harness; it must be identical.
6. Review `VECTOR_EDGE_SHADOW` log records against AUTO decisions.
7. Do not use shadow results to alter live trading until the comparison is reviewed.

## Branch

Development branch: `feature/auto-vector-edge-v1`

Do not merge to `main` until shadow results are reviewed and an explicit merge is requested.
