# Market Cycle V2 — Backtest & Acceptance Plan

## Purpose

This checklist validates the Market Cycle V2 engine against the execution requirements for:
- Macro bias separated from M1/M5 timing.
- Demand/Supply terminal protection and reversal entries.
- Completion-oriented Basket filling toward the customer-selected position count.
- Pullback vs true-reversal exit behavior.
- News/high-volatility execution without blind first-candle chasing.

Backtest results must come from MT5 Strategy Tester or broker-quality tick data. Do not infer or fabricate performance from code inspection.

## Required comparison metrics

Compare the previous production engine and Market Cycle V2 on the same symbol, date range, spread/tick model and customer settings.

1. Total orders and completed Baskets.
2. Average and percentile time to Basket target position count.
3. SELL-bottom / BUY-top frequency.
4. Average MAE per Basket and first position.
5. Average MFE per Basket.
6. Profit capture percentage: realized Basket profit / MFE-equivalent profit.
7. Same-side churn: close BUY then reopen BUY, or close SELL then reopen SELL, without a fresh rearm event.
8. Maximum drawdown.
9. Win rate.
10. Profit factor.

## 10 positions / ~10 minute acceptance scenario

Test separately with:
- maxPositions = 10
- normal liquid market
- valid setup already present
- no broker rejection
- sufficient margin
- spread below EXTREME
- no terminal Demand/Supply veto

Measure:
- positions filled at minute 3
- positions filled at minute 7
- positions filled at minute 10
- time to 10/10
- each fill reason and each wait reason

Expected behavior:
- 0–3 min: STRICT phase, only good execution turns.
- 3–7 min: BALANCED phase, timing becomes easier.
- 7–10 min: COMPLETION phase, timing is relaxed further.
- Direction lock, terminal-zone safety, broker permission, margin and EXTREME spread are never relaxed.
- The target remains exactly the customer-selected count. Intelligence controls when a rung fills, not the target count.

If a valid normal-market sample repeatedly averages only 2–3 positions by minute 10, the timing layer is still too restrictive and must be loosened.

## News scenarios

Run NFP, CPI, FOMC and rate-decision windows when broker-quality tick data is available.

Validate:
- NEWS_WAIT_IMPULSE does not chase the first live spike.
- NEWS_CONTINUATION requires a completed directional impulse / execution evidence.
- NEWS_RETEST can enter after a real retest.
- NEWS_EXHAUSTION stops chasing terminal moves.
- NEWS_WIDE remains tradable.
- EXTREME spread blocks new orders.
- 10-position Basket target remains 10, while spacing expands with volatility.

## Reversal scenarios

For both BUY and SELL:
- Macro trend remains opposite on H1/M30/M15.
- Price reaches a quality Demand/Supply zone.
- RSI divergence / exhaustion may add weight but cannot trigger alone.
- M1/M5/EMA/Price Action must provide a turning event.
- Confirm that REVERSAL_BUY or REVERSAL_SELL can open before H1 flips.
- Confirm that M1-only noise does not close an existing profitable Basket.

## Stop-loss checks

Manual SL:
- Requested customer point distance is preserved.
- Only the broker's mandatory minimum Stops Level may expand the distance.
- Market structure must not silently tighten a manual SL.

Auto SL:
- Uses ATR and useful zone/structure context.
- Avoids placing the stop inside obvious noise/zone structure.
- Bounds structural widening so the first position cannot receive an uncontrolled stop distance.

## Telemetry required in test evidence

Capture these fields with every run:
- marketCycleState
- lowerTimeframeState
- demandZoneScore / supplyZoneScore
- demandZoneQuality / supplyZoneQuality
- RSI and divergence scores
- ADX / DMI and previous ADX
- VWAP distance in ATR
- reversalStatus
- basket target / current fill
- fillPhase / fillBlockReason
- newsMode
- lastEntryReason
- lastCloseReason

## Backtest import metadata contract

When importing tester trades through the Backtest API, put these optional values inside each trade's `metadata` object so the dashboard can calculate the V2 execution KPIs:

- `mae`: maximum adverse excursion for the trade/Basket sample.
- `mfe`: maximum favorable excursion.
- `mfeProfit`: profit-equivalent value at MFE, used for Profit Capture %.
- `terminalChase`: true when the entry is classified as BUY-top / SELL-bottom.
- `churn`: true when the trade is a same-side close/reopen without a fresh thesis event.
- `basketId`: stable Basket/Cycle identifier.
- `basketIndex`: position number inside the Basket.
- `basketTargetPositions`: exact customer-selected Basket target.
- `basketElapsedSeconds`: elapsed seconds from first position to this fill.

The EA also emits a tester-only `SCENOVA_BACKTEST_V2` summary line containing cycles, orders, Avg MAE/MFE, Profit Capture %, terminal-chase %, average fill seconds, ≤10-minute fill rate and same-side churn %. Live trading logic never reads these tester counters.

## Non-guarantee cases

10/10 is a target, not a forced-order guarantee. A Basket may remain incomplete when:
- broker or symbol refuses trading
- margin is insufficient
- market is closed
- spread is EXTREME
- Basket direction conflicts
- price is inside a clearly dangerous terminal Demand/Supply area

The UI must always expose the current fill count and the concrete wait/block reason.
