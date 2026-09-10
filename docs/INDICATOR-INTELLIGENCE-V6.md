# SCENOVA Indicator Intelligence V6 — EA 1.045

Indicator Intelligence V6 adds market-location, momentum, structure, volatility, execution and cost/space intelligence on top of Market Cycle V2, Entry Precision V3, Local Extreme V4 and Basket Add Location V5.

The design rule is explicit: **an individual indicator is not a universal entry veto**. V6 groups correlated evidence into capped families and combines family scores. The default production mode is `SOFT_WEIGHT`.

## Activation modes

- `SHADOW` — calculate, log and learn; no influence on trading.
- `SOFT_WEIGHT` — default. Composite V6 can move Entry Precision by at most ±8 points. It cannot independently block an order.
- `TIMING` — adds an optional short multi-family timing wait only if Composite + Location + Execution are simultaneously weak. The wait is bounded by `InpIndicatorMaxWaitSeconds`.
- `ADAPTIVE` — includes TIMING and can also delay a Basket add only when Composite + Location + Structure + Execution are simultaneously very weak. Customer Max Positions are never changed.

Reversal, retest and strong liquidity/microstructure models are protected from optional timing starvation.

## Six independent score families

### 1. Location Score

Answers: **Is this a good price to enter?**

Inputs:
- M5 tick-volume profile: POC, VAH, VAL, HVN, LVN
- Session VWAP
- Swing-anchored VWAP
- Impulse-anchored VWAP
- Demand/Supply quality
- Premium / Discount location
- remembered S/R flip level
- Previous-day context
- Space to structural targets

This family primarily reduces BUY-at-the-top / SELL-at-the-bottom behavior without treating overbought/oversold as automatic reversal signals.

### 2. Momentum Score

Answers: **Is directional force accelerating or fading?**

Inputs:
- MACD histogram and histogram slope
- ADX slope
- +DI/-DI acceleration
- broker tick-volume momentum
- directional volume-flow score
- regular and hidden RSI divergence

MACD is used for acceleration/fade, not a simple crossover gate.

### 3. Structure Score

Answers: **Does price structure support the thesis?**

Inputs:
- existing Market Structure score
- M1 Micro BOS / CHoCH / reclaim
- liquidity sweep
- Order Block quality/lifecycle
- S/R flip memory
- Donchian location

Existing Order Block states continue to distinguish fresh/tested/mitigated structural context.

### 4. Volatility Score

Answers: **What volatility phase is the market in?**

Inputs:
- Bollinger envelope/width
- ATR-normalized width
- Keltner envelope
- BB/Keltner squeeze
- squeeze release
- current volatility regime

States include `SQUEEZE`, `SQUEEZE_RELEASE_UP`, `SQUEEZE_RELEASE_DOWN`, `VOLATILITY_EXPANSION`.

### 5. Execution Score

Answers: **Is M1/M5 timing ready now?**

Inputs:
- Stochastic turn
- Micro Structure
- Liquidity Sweep
- Fair Value Gap / Retest
- Price Action
- Execution Turning Event
- candle efficiency

Stochastic is execution timing only. It never defines macro direction.

### 6. Cost / Space Score

Answers: **Is there enough expected movement left after execution cost?**

Inputs:
- Space-to-target ATR
- spread-to-ATR execution cost

A technically attractive setup with very little room before a reaction level is downgraded rather than blindly chased.

## Correlation guard

EMA, MACD, ADX, DMI, RSI and other price-derived indicators are not counted as independent full confirmations. Evidence is first compressed into one family score, and each family has a bounded weight. This prevents five correlated trend indicators from looking like five independent reasons to trade.

Regime-specific weights adjust by context:
- Trend: more Momentum + Structure.
- Range: more Location + Execution.
- News / high volatility: more Structure + Volatility + Execution.

The weights always sum to one.

## Market-location engines

### Volume Profile / POC / VAH / VAL / HVN / LVN

V6 builds a lightweight 32-bin profile from recent M5 **broker tick volume**. This is not centralized exchange volume. It is therefore advisory context, not a hard authorization signal.

### Anchored VWAP

V6 maintains:
- Session VWAP
- Swing VWAP anchored to a recent directional swing
- Impulse VWAP anchored near a large directional body

Multiple VWAPs agreeing near current price improve value-location confidence. Large extension away from them reduces chase quality.

### Donchian / Local High-Low

Donchian context helps distinguish channel edge, breakout attempt and mid-channel entry. Local Extreme V4/V5 remains the authoritative anti-chase safety layer.

### Level Memory / Flip Zone

A recently broken resistance/support can be remembered as a potential support/resistance flip. States include:
- `RESISTANCE_BROKEN`
- `SUPPORT_BROKEN`
- `FLIPPED_TO_SUPPORT`
- `FLIPPED_TO_RESISTANCE`
- `FLIP_FAILED`

### Session / Previous Day / Week Levels

V6 records current-session high/low, previous-day high/low/close and current-week high/low for liquidity/target/location context.

### Premium / Discount

The active Fib/Donchian swing midpoint is used to classify `PREMIUM`, `DISCOUNT` or `EQUILIBRIUM`. This changes Location Score; it does not automatically command BUY/SELL.

## Entry and Basket behavior

### Anchor entry

In `SOFT_WEIGHT`, V6 can only adjust the existing Entry Precision score by a bounded ±8 points. Existing Setup-First, Reversal, Local Extreme and Safety architecture stays in control.

### Basket adds

V5 Local Top/Bottom and price-separation protections remain intact.

In default `SOFT_WEIGHT`, V6 does not introduce a new Basket-add veto. In `ADAPTIVE`, `INDICATOR_CONTEXT_ADD_WAIT` can occur only when several families are simultaneously very weak.

### Target selection

V6 can choose a nearby reaction target from Volume Profile, Session/Day/Week or structural levels. Weak context may shorten the target; exceptionally strong context may extend it, within the existing bounded risk/reward envelope. A target is never placed behind the entry.

### Profit giveback

Strong composite/momentum/structure continuation can give a profitable Basket slightly more room. Multi-factor momentum/execution fade can tighten giveback modestly. Existing true-reversal logic remains primary.

## Outcome / Expected Value learning

Basket Journal schema 5 stores:
- Location
- Momentum
- Structure
- Volatility
- Execution
- Cost/Space
- Composite
- Volume Profile state
- Squeeze state
- MACD state
- Level Flip state
- Premium/Discount state

The API learns recent Basket outcome for the same Symbol + Direction + Entry Model + Regime and a nearby Composite-score bucket.

It returns:
- indicator Win Probability
- samples
- Avg Win
- Avg Loss
- Expected Value
- EV Score

Small samples are shrunk toward neutral. The EA requires at least 20 matching samples before historical Indicator EV can influence the Composite, and the historical influence is limited to 12%.

This is outcome learning, not a guarantee of future profitability.

## Strategy Tester V6

EA 1.045 emits `SCENOVA_BACKTEST_V6` and retains the existing metrics:
- cycles / orders
- Avg MAE / MFE
- Profit Capture %
- terminal chase %
- Basket fill time
- Fill <= 10 min %
- same-side churn %
- entry MAE at 5/15/30/60 seconds
- Avg Time-to-Green
- Green-within-60s %

V6 additionally logs:
- `avgIndicatorComposite`
- `indicatorWaitEvents`
- `avgIndicatorWaitSeconds`
- `highQualityEntryPct`

Native MT5 Strategy Tester remains authoritative for Net Profit, Profit Factor, Drawdown and Win Rate.

## Regression / order-starvation acceptance

Compare 1.045 against 1.044 on the same symbol, date range, tick model, commission and spread assumptions.

V6 should not be promoted because a score “looks smarter.” Review:
- Net Profit
- Profit Factor
- Drawdown
- Avg Win / Avg Loss
- MAE/MFE
- Time-to-Green
- terminal chase
- Basket count
- fill completion/time
- same-side churn
- Indicator wait frequency/duration

If Basket/trade frequency drops materially without an improvement in MAE/expectancy, the V6 activation is too restrictive and should remain SHADOW/SOFT_WEIGHT rather than being promoted to TIMING/ADAPTIVE.

## Mapping to the 70-item upgrade list

The list is implemented as grouped engines rather than seventy independent gates:

- Items 1–10: Volume Profile, Anchored/Multi VWAP, Level Memory/Flip, Donchian and Breakout/Retest context.
- Items 11–16: Bollinger, Bandwidth, Keltner/Squeeze and MACD histogram/fade.
- Items 17–22: RSI divergence V2, Stochastic execution, ADX/DMI slope/acceleration and tick-volume/flow.
- Items 23–26: candle efficiency, impulse/pullback/location context and ATR-normalized extension.
- Items 27–31: existing Liquidity Sweep V2 plus session/day/week liquidity levels.
- Items 32–39: existing ATR/EMA/FVG/Order Block/Fib intelligence integrated into V6 family scoring and lifecycle context.
- Items 40–50: six Score families, Composite score, correlation guard, no-single-indicator-veto, dynamic regime weights.
- Items 51–57: existing Entry Model Router/Basket roles/targets/profit defense enhanced by V6 context.
- Items 58–62: schema-5 snapshots, outcome/EV learning and MAE/Time-to-Green tester metrics.
- Items 63–66: SHADOW/progressive modes, safe data fallback and bounded order-starvation monitoring.
- Items 67–69: dashboard V6 telemetry and Thai explanations.
- Item 70: regression metrics and CI/MetaEditor validation before release.

Some concepts reuse existing V2–V5 engines instead of duplicating them. This is intentional: duplicating equivalent indicators would increase correlation and complexity without adding independent information.
