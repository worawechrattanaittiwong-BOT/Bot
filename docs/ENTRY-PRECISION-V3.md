# Entry Precision V3

## Goal

Entry Precision V3 extends Market Cycle V2 without replacing it. Its job is to improve the price/timing of the first Basket entry, reduce immediate adverse excursion, and learn which setup families have positive expectancy. It must not create order starvation.

## Non-negotiable architecture rules

1. New intelligence is advisory by default. Liquidity Sweep, Micro BOS/CHoCH, FVG, setup EV, RSI, ADX, VWAP and individual confluence scores cannot veto a trade by themselves.
2. Safety remains authoritative: broker/symbol permission, entitlement/lease, direction lock, margin/precheck and EXTREME spread can still block a new order.
3. Terminal Demand/Supply safety requires actual price proximity. A strong but distant zone is not allowed to block the entry engine.
4. The first-entry price optimizer may wait only when price is clearly extended from value. The wait is bounded: 8 seconds in news/high-volatility, 12 seconds in range, 18 seconds otherwise.
5. When the wait expires the entry becomes ACCEPTABLE_FALLBACK and Market Cycle V2 continues. The optimizer has no indefinite waiting state.
6. Basket positions after the anchor entry do not pass through Entry Precision wait logic. Existing STRICT / BALANCED / COMPLETION Basket Ladder behavior remains responsible for the remaining positions.
7. Setup history is a soft weight only and only after at least 12 matching Basket samples. It never reduces customer Max Positions.

## New execution intelligence

### Liquidity Sweep

The EA detects a closed M1 candle sweeping a prior liquidity low/high and closing back through that reference. Equal-low/equal-high pools and M5 rejection can increase the score.

States include:
- SELL_SIDE_LIQUIDITY_SWEEP
- BUY_SIDE_LIQUIDITY_SWEEP
- NEAR_SELL_SIDE_LIQUIDITY
- NEAR_BUY_SIDE_LIQUIDITY

### Micro Structure

The EA evaluates M1 break/reclaim behavior and distinguishes:
- MICRO_BOS_UP / MICRO_BOS_DOWN
- CHOCH_UP / CHOCH_DOWN
- MICRO_RECLAIM_UP / MICRO_RECLAIM_DOWN
- directional micro body support

CHoCH receives higher weight when the break occurs against the previous M1/M5 direction.

### Fair Value Gap

Recent M1 three-candle imbalance zones are detected. A live retest receives more weight than a gap that is merely nearby.

States include:
- FVG_RETEST_BUY / FVG_RETEST_SELL
- FVG_NEAR_BUY / FVG_NEAR_SELL

FVG is never mandatory.

### Entry Price Optimizer

The first entry is classified as:
- IDEAL_ENTRY
- ACCEPTABLE_ENTRY
- CHASE_ENTRY
- ACCEPTABLE_FALLBACK

The score blends liquidity, micro structure, FVG, Demand/Supply quality, execution turning event, macro alignment, space-to-target, distance from value, spread/ATR cost, exhaustion, and setup-history expectancy.

Only a clearly extended CHASE_ENTRY can briefly enter WAITING_BETTER_PRICE. The timeout always restores an acceptable entry path.

## Setup-specific learning

The heartbeat API now calculates recent Basket performance for the current:
- Symbol
- Direction
- Entry Model
- Market Regime

It uses up to 120 recent matching Baskets and returns:
- setupWinProbability
- setupWinSamples
- setupAvgWin
- setupAvgLoss
- setupExpectedValue
- setupEvScore

The EA uses setupEvScore only when at least 12 samples match the current direction and entry model. Its maximum influence is intentionally small so a lucky/unlucky short history cannot take control.

Basket journal schema 4 stores the new entry snapshot:
- marketCycleState
- entryPrecisionState
- liquidityState
- microStructureState
- fvgState
- entryPrecisionScore
- entryDistanceAtr
- setupEvScore

No database migration is required because these fields are stored inside JSONB metadata.

## Strategy Tester V3 metrics

The tester summary is emitted as SCENOVA_BACKTEST_V3 and keeps V2 metrics while adding first-anchor entry quality:
- entryMAE5
- entryMAE15
- entryMAE30
- entryMAE60
- avgTimeToGreenSec
- greenWithin60Pct

The purpose is to measure whether V3 actually reduces the size/duration of immediate red trades instead of relying on visual impressions.

## Acceptance / regression checks

Compare EA 1.042 Entry Precision V3 against 1.041 Market Cycle V2 on the same symbol, tick model, spread/commission assumptions and date range.

A release should not be promoted only because Win Rate improves. Review:
- Net Profit
- Profit Factor
- Drawdown
- Avg Win / Avg Loss
- Basket MAE / MFE
- first-entry MAE at 5/15/30/60 seconds
- Time to Green
- Green within 60 seconds
- terminal chase rate
- Basket fill time and Fill <= 10 minutes
- same-side churn
- total Basket count / trade-frequency regression

Order-starvation guard:
- New V3 logic must not materially reduce valid Basket opportunities without a compensating improvement in MAE/expectancy.
- Max Positions remains the user's exact target.
- A 10-position configuration must still be tested for completion behavior around the existing 10-minute target window.
- WAITING_BETTER_PRICE must never remain beyond its configured timeout.

## Profit expectations

The system cannot guarantee that a market order starts positive because spread, commission and slippage can make a newly opened position negative immediately. V3 targets lower adverse excursion and faster transition to positive P/L while maintaining positive long-run expectancy. Profitability must be demonstrated with Strategy Tester plus forward testing; it is not inferred from the presence of more indicators.
