# ZERO GRID V1 — Isolated Strategy Specification

## Purpose

ZERO GRID is a fully isolated execution mode. It must not reuse AUTO entry decisions, RACE direction logic, confidence gates, indicator scoring, Adaptive Rescue, tactical countertrend logic, or adaptive lot sizing.

The mode is intended to be implemented and validated in Demo/Backtest before any live use.

## Mode identity

- UI name: `ZERO GRID`
- Internal engine mode: `ZERO_GRID`
- Control mode: `ZERO_GRID`
- Position/order tag prefix: `SaaSZeroGrid`
- Existing `AUTO`, `RACE`, `ASSISTED`, and `MANUAL` behavior must remain unchanged.

## Entry model

At the beginning of each cycle, record the current market center price and construct a symmetric ladder around it.

Default parameters:

- Grid price distance: `3.00`
- Levels per side: `30`
- Base lot: use the account's configured Lot value
- Lot progression: linear by level
  - Level 1 = BaseLot × 1
  - Level 2 = BaseLot × 2
  - Level 3 = BaseLot × 3
  - Example with BaseLot 0.03: `0.03, 0.06, 0.09, 0.12, ...`
- Upper ladder: BUY STOP orders
- Lower ladder: SELL STOP orders
- Each level is one-shot for the current cycle. A previously triggered level must not be recreated during the same cycle.

This strategy requires an MT5 Hedging account. A Netting account must be rejected for this mode because BUY and SELL exposure cannot coexist as required.

## Cycle behavior

1. Start only when the EA-owned basket is flat.
2. Record the center price.
3. Create BUY STOP levels above the center and SELL STOP levels below the center.
4. If price continues down, allow successive SELL levels to trigger.
5. If price continues up, allow successive BUY levels to trigger.
6. Do not use the EA market-analysis brain to decide direction.
7. Track the latest price extreme in the direction of the active move.
8. A reversal is considered detected as soon as price moves at least one valid symbol tick away from the latest extreme.
9. Once a reversal has been detected, close the ZERO GRID basket as soon as the estimated post-close net result is positive by the configured minimum amount.
10. Cancel all remaining ZERO GRID pending orders, close all ZERO GRID positions, reset state, re-center, and start a new cycle.

If price makes a new extreme before the basket is closed, clear the previous reversal latch and wait for the next reversal from the new extreme.

## Profit-close rule

User-facing minimum realized profit defaults to:

`ZeroGridMinNetProfitMoney = +0.01` account-currency units.

Do **not** interpret this as simply `floating P/L >= +0.01`.

The close trigger should be based on an estimate of the final result after currently known costs:

`RequiredPreCloseNet = MinimumRealizedProfit + EstimatedRemainingCloseCommissionAndFees`

The cycle's current net should include:

- floating position profit/loss
- open-position swap
- realized deal profit/loss in the current ZERO GRID cycle
- commissions already charged
- fees already charged

Example:

- Desired final net: `+0.01`
- Estimated remaining close commission/fee: `0.40`
- Close eligibility threshold before closing: approximately `+0.41`

This does not create an absolute guarantee because market slippage can occur between the close decision and broker execution. The engine should therefore expose the estimated close-cost reserve and realized cycle result in telemetry.

## Isolation requirements

ZERO GRID must have strict ownership rules:

- A ZERO GRID basket must never be handed to AUTO/RACE/Rescue management while it is open.
- If the user changes mode while ZERO GRID positions are open, finish or safely stop the existing ZERO GRID cycle before another engine starts a new cycle.
- If the user changes mode while ZERO GRID has only pending orders and no positions, cancel those pending orders before another engine starts.
- AUTO and RACE source paths must not be changed except for recognizing `ZERO_GRID` as a separate engine/control value.
- ZERO GRID must not change AUTO/RACE defaults.

## Safeguards that remain active

Even though ZERO GRID does not use the trading brain, infrastructure and account safeguards remain authoritative:

- SaaS entitlement/access
- Start/Stop/Safe Stop
- Daily Loss control
- broker trade permission
- symbol trade permission
- broker volume min/max/step
- broker stop-distance rules
- order rejection handling
- rate-limit / retry handling
- market/session connectivity

Adaptive Rescue and signal-based exits are not part of ZERO GRID.

## Demo/Backtest acceptance tests

1. **Straight down:** successive SELL levels trigger; no AUTO/RACE decision function is required.
2. **Straight up:** successive BUY levels trigger symmetrically.
3. **Down then one-tick rebound:** reversal latch becomes true; basket closes only when estimated final net is at least +0.01.
4. **Up then one-tick pullback:** same behavior in reverse.
5. **Rebound while basket still negative:** do not close at a loss; wait until net-close condition is satisfied.
6. **Rebound then new low/high:** clear stale reversal latch and wait for a new reversal from the new extreme.
7. **Equal BUY/SELL exposure:** no duplicate order is created at a previously triggered level.
8. **Restart recovery:** reconstruct active ZERO GRID cycle from tagged positions/pending orders without duplicating used levels.
9. **Mode switch with positions:** ZERO GRID retains ownership until the cycle is flat/safely stopped.
10. **Mode switch with pending only:** pending ZERO GRID orders are canceled.
11. **Netting account:** ZERO GRID refuses to start and reports that Hedging mode is required.
12. **AUTO/RACE regression:** existing AUTO and RACE tests remain byte/behavior compatible except for the new mode enumeration/selection path.
13. **Costs:** commissions/swaps/fees are included in cycle net and estimated closing cost is reserved before sending close requests.
14. **Slippage:** record requested net, estimated cost reserve, and realized result for every ZERO GRID close.

## Suggested telemetry

- `zeroGridState`
- `zeroGridCenter`
- `zeroGridStepPrice`
- `zeroGridMaxLevels`
- `zeroGridBaseLot`
- `zeroGridTriggeredBuyLevels`
- `zeroGridTriggeredSellLevels`
- `zeroGridPendingOrders`
- `zeroGridRunDirection`
- `zeroGridExtreme`
- `zeroGridReversalSeen`
- `zeroGridCycleNet`
- `zeroGridEstimatedCloseCost`
- `zeroGridRequiredCloseProfit`
- `zeroGridRealizedNet`

## Risk note

ZERO GRID can have a high percentage of profitable cycles while still carrying material tail risk. Gross exposure and margin usage can grow as additional levels trigger. The Demo/Backtest report should therefore always include maximum gross lots, maximum floating drawdown, minimum margin level, maximum simultaneous positions, and worst realized cycle result in addition to win rate.
