# ZERO GRID — Stability and Isolation Contract

## Purpose

SCENOVA ZERO GRID is a fully isolated execution mode. It must not reuse AUTO entry decisions, RACE direction logic, confidence gates, indicator scoring, Adaptive Rescue, tactical countertrend logic, or adaptive lot sizing.

Existing `AUTO`, `RACE`, `ASSISTED`, and `MANUAL` behavior must remain unchanged.

## Mode identity and ownership

- UI name: `ZERO GRID`
- Internal engine mode: `ZERO_GRID`
- Control mode: `ZERO_GRID`
- Position/order tag prefix: `SaaSZeroGrid`
- A ZERO GRID cycle owns its orders and positions from cycle start until the cycle is flat and reset.
- A settings refresh or stale `controlMode`/`engineMode` payload must never hand an active ZERO GRID cycle to AUTO, RACE, ASSISTED, MANUAL, Rescue, or a legacy basket queue.
- The requested next mode and the active cycle owner are separate concepts.
- A different mode may become the execution owner only after ZERO GRID has no owned positions and no owned pending orders.
- If the user explicitly changes mode while ZERO GRID has pending orders but no triggered positions, cancel ZERO GRID pending orders first, reset the cycle, then permit the requested mode.
- If positions are already active, retain ZERO GRID ownership through its close/drain path before another engine can start a new cycle.

## Grid geometry

At the beginning of each cycle, record the market center and construct a symmetric pending ladder.

Defaults:

- Inter-level Grid Step: `3.00`
- Selectable Grid Step values: `0.50`, `1.00`, `2.00`, `3.00`
- Levels per side: `30`
- Base lot: locked at `0.03`
- Lot progression: `BaseLot × Level`
  - L1 = `0.03`
  - L2 = `0.06`
  - L3 = `0.09`
  - ...
  - L30 = `0.90`
- Upper ladder: BUY STOP
- Lower ladder: SELL STOP
- Each level is one-shot for the current cycle.

### First-level distance

The first pending level must not be forced one full Grid Step away from live price.

Use a separate first-entry distance. In the MT5 runtime the preferred default is the nearest broker-safe price:

`FirstOffset = max(Symbol Stops Level, Symbol Freeze Level) + one valid tick`

The configured `3.00` Grid Step applies **between successive levels**, not between current price and Level 1.

Therefore:

- `BuyLevel1 ≈ Ask + FirstOffset`
- `BuyLevelN = BuyLevel1 + GridStep × (N - 1)`
- `SellLevel1 ≈ Bid - FirstOffset`
- `SellLevelN = SellLevel1 - GridStep × (N - 1)`

All prices must be normalized to the symbol tick size and broker stop-distance rules.

## Pending placement order

The order in which pending tickets are created is deterministic and must be:

**far/high-lot → near/low-lot**

For 30 levels the placement sequence is:

`L30, L29, L28, ... L3, L2, L1`

For each level, stage the BUY STOP and SELL STOP belonging to that level before moving to the next smaller level, subject to account-mode rules and broker/rate limits.

This is only the **ticket creation sequence**. Actual fills remain price-driven by MT5/broker. On a normal directional move the near/small levels will therefore be reached before the far/large levels.

## Trigger behavior

- ZERO GRID has no directional entry brain.
- Falling price naturally triggers successive SELL STOP levels.
- Rising price naturally triggers successive BUY STOP levels.
- A level that has triggered once in the current cycle must never be recreated in that same cycle.
- Restart recovery must reconstruct used levels from ZERO GRID tags/history before restoring missing pending orders.

### Account mode

- Hedging accounts may keep both pending sides available.
- On Netting/Exchange accounts, after the first side fills, the opposite pending ladder must be removed so opposite exposure cannot merge/offset the active symbol position.
- Account-mode handling must remain isolated inside ZERO GRID and must not change AUTO/RACE behavior.

## Profit-close rule

There is no per-order TP requirement and no mandatory reversal condition.

The basket becomes eligible to close **as soon as the estimated final ZERO GRID cycle net is at least the configured minimum positive amount**.

Default:

`ZeroGridMinNetProfitMoney = +0.01` account-currency units.

Known remaining close costs may be reserved:

`RequiredPreCloseNet = MinimumRealizedProfit + EstimatedRemainingCloseCommissionAndFees + ConfiguredCloseReserve`

Cycle net should include, where available:

- floating position profit/loss
- swap
- realized deal profit/loss belonging to the current ZERO GRID cycle
- commissions already charged
- fees already charged

Do not double-count spread because it is already reflected in floating P/L.

Slippage means an exact final `+0.01` cannot be guaranteed, so requested threshold, estimated remaining close costs, and final realized result should be observable in telemetry.

## Close sequence

When close eligibility is reached:

1. Latch the cycle into `CLOSING` so no new ZERO GRID pending ticket can be recreated.
2. Cancel all remaining ZERO GRID pending orders.
3. Close ZERO GRID positions **low-lot → high-lot**.
4. For equal lot sizes, use a deterministic tie-breaker such as lower level first, then stable ticket/open sequence.
5. Continue the close drain until no ZERO GRID position or pending order remains.
6. Reset cycle state.
7. Re-center from fresh live market prices.
8. Build the next pending ladder again from far/high-lot → near/low-lot.

Example close order:

`0.03 → 0.06 → 0.09 → 0.12 → ...`

Do not select close tickets based on proximity to live price when that conflicts with the required low-lot → high-lot ordering.

## State machine

Required logical states:

`IDLE → BUILDING → ARMED → RUNNING → CLOSING → RESET → BUILDING`

Rules:

- `BUILDING`: create missing pending tickets in descending level order.
- `ARMED`: pending ladder exists, no active fill yet.
- `RUNNING`: one or more ZERO GRID levels have triggered.
- `CLOSING`: cancel pending and drain positions in low-lot → high-lot order; never re-arm during this state.
- `RESET`: clear cycle-specific ownership/used-level state only after flat.
- The active cycle owner is immutable from `BUILDING/ARMED/RUNNING/CLOSING` until `RESET` completes.

## Isolation requirements

ZERO GRID must never alter the decision logic of other modes.

- AUTO functions and defaults remain unchanged.
- RACE core remains unchanged.
- ASSISTED and MANUAL legacy paths remain unchanged.
- Adaptive Rescue is not a ZERO GRID entry/exit manager.
- Legacy burst queues must not add orders to a ZERO GRID cycle.
- ZERO GRID orders/positions must be identified by its own ownership tags/state.
- Generic infrastructure safety such as entitlement, Stop/Safe Stop, broker permissions, symbol permissions, volume normalization, stop-distance rules, rate limits, and error handling may remain shared.

## Stability acceptance tests

1. **First level close to price:** Level 1 uses the independent first offset rather than a full Grid Step.
2. **Placement order:** with 30 levels, pending-ticket creation begins at L30 / 0.90 and works down to L1 / 0.03.
3. **Price-driven triggering:** despite descending placement order, a normal trend triggers near levels before far levels.
4. **Straight down:** successive SELL levels trigger without AUTO/RACE decisions.
5. **Straight up:** successive BUY levels trigger symmetrically.
6. **One-shot revisit:** a used level is never recreated during the same cycle.
7. **Immediate positive basket:** no reversal latch is required; close eligibility is based on estimated post-close net.
8. **Costs:** close eligibility reserves known remaining close commission/fees once, without double-counting spread.
9. **Close order:** positions close `0.03 → 0.06 → 0.09 → ...`.
10. **Mode refresh during active cycle:** requested mode may change, but `cycleOwner` remains `ZERO_GRID` until flat/reset.
11. **Explicit mode change with pending only:** ZERO GRID pending orders are canceled before ownership changes.
12. **Restart recovery:** active/used levels are reconstructed without duplicate pending orders.
13. **Closing latch:** while CLOSING, no missing pending level may be rebuilt.
14. **Recenter:** only after every owned position and pending order is gone does the next cycle choose a new center.
15. **AUTO/RACE regression:** existing AUTO and RACE core behavior remains unchanged.

## Suggested telemetry

- `zeroGridState`
- `zeroGridCycleOwner`
- `zeroGridRequestedNextMode`
- `zeroGridCenter`
- `zeroGridFirstOffsetPrice`
- `zeroGridStepPrice`
- `zeroGridMaxLevels`
- `zeroGridBaseLot`
- `zeroGridTriggeredBuyLevels`
- `zeroGridTriggeredSellLevels`
- `zeroGridPendingOrders`
- `zeroGridPlacementLevel`
- `zeroGridCycleNet`
- `zeroGridEstimatedCloseCost`
- `zeroGridRequiredCloseProfit`
- `zeroGridCloseNextLot`
- `zeroGridRealizedNet`

## Exposure note

With BaseLot `0.03` and 30 levels, one full side sums to `13.95` lots. The placement and close ordering rules above improve determinism and recovery behavior; they do not remove exposure or margin risk from a progressively larger grid.
