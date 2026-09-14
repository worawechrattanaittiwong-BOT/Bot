from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"target block not found in {path}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")


ea = "mt5/FastBasketBot.mq5"

# Keep the first ZERO pending pair around 1.00 price away from the cycle center.
# On a 2-digit XAUUSD quote this is about 100 MT5 points, e.g. center 4001.00
# => BUY STOP ~4002.00 / SELL STOP ~4000.00. If the broker requires a larger
# StopsLevel, the broker-safe distance wins. One extra tick protects against a
# moving quote rejecting the opposite-side pending while the ladder is staged.
replace_once(
    ea,
    '''double ZeroGridEntryGapPrice()\n{\n   // First BUY/SELL triggers hug the live quote at the nearest broker-legal\n   // pending distance. Rounding outward to tick size provides the only buffer.\n   double tick=ZeroGridTickSize();\n   double gap=ZeroGridMinPendingDistancePrice();\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(MathMax(1.0,units)*tick,_Digits);\n}\n''',
    '''double ZeroGridEntryGapPrice()\n{\n   // Preferred first offset is 1.00 price unit. For 2-digit XAUUSD this is\n   // about 100 points: center 4001.00 -> BUY ~4002.00 / SELL ~4000.00.\n   // A broker requiring a wider StopsLevel always takes priority.\n   double tick=ZeroGridTickSize();\n   double preferredGap=1.0;\n   double brokerSafeGap=ZeroGridMinPendingDistancePrice()+tick;\n   double gap=MathMax(preferredGap,brokerSafeGap);\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(MathMax(1.0,units)*tick,_Digits);\n}\n'''
)

# Build the first pair symmetrically around the recorded cycle mid-price rather
# than directly from bid/ask. Only clamp outward when live price has moved far
# enough that the broker would reject the pending request.
replace_once(
    ea,
    '''double ZeroGridPendingAnchorPrice(bool buySide)\n{\n   LoadZeroGridCycleState();\n   if(g_zeroGridCenter<=0.0) return 0.0;\n\n   // Preserve exact ladder geometry after the first level exists.\n   double existing=ZeroGridExistingPendingAnchorPrice(buySide);\n   if(existing>0.0) return existing;\n\n   MqlTick live;\n   if(!SymbolInfoTick(_Symbol,live)) return 0.0;\n   double gap=ZeroGridEntryGapPrice();\n   double raw=buySide ? live.ask+gap : live.bid-gap;\n   return ZeroGridNormalizePendingPrice(buySide,raw);\n}\n''',
    '''double ZeroGridPendingAnchorPrice(bool buySide)\n{\n   LoadZeroGridCycleState();\n   if(g_zeroGridCenter<=0.0) return 0.0;\n\n   // Preserve exact ladder geometry after the first level exists.\n   double existing=ZeroGridExistingPendingAnchorPrice(buySide);\n   if(existing>0.0) return existing;\n\n   MqlTick live;\n   if(!SymbolInfoTick(_Symbol,live)) return 0.0;\n\n   double gap=ZeroGridEntryGapPrice();\n   double raw=buySide ? g_zeroGridCenter+gap : g_zeroGridCenter-gap;\n\n   // Guard the request against a fast quote move while keeping the intended\n   // center +/- first-gap geometry whenever the broker allows it.\n   double brokerSafe=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();\n   double legal=buySide ? live.ask+brokerSafe : live.bid-brokerSafe;\n   if(buySide && raw<legal) raw=legal;\n   if(!buySide && raw>legal) raw=legal;\n\n   return ZeroGridNormalizePendingPrice(buySide,raw);\n}\n'''
)

replace_once(
    ea,
    '''   double safeDistance=ZeroGridMinPendingDistancePrice();\n   double safeBoundary=buySide\n''',
    '''   // Keep one tick of placement headroom so BUY/SELL L1 can both be\n   // accepted even while the quote moves during the same fast staging pass.\n   double safeDistance=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();\n   double safeBoundary=buySide\n'''
)

# Regression model mirrors the EA: first pair around center +/- 1.00, then exact
# configured spacing between levels, with broker-safe clamping only if required.
test = Path("tests/zero-grid-v1-simulation.mjs")
text = test.read_text(encoding="utf-8")
start = text.index("export function buildPendingPlan")
end = text.index("\n\n{\n  const bid = 4304.40;", start)
new_function = '''export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01, firstOffsetPrice = 1.0 }) {\n  const center = (bid + ask) / 2;\n  const brokerSafe = Math.max(tick, brokerMinDistance) + tick;\n  const buyAnchor = up(Math.max(center + firstOffsetPrice, ask + brokerSafe), tick);\n  const sellAnchor = down(Math.min(center - firstOffsetPrice, bid - brokerSafe), tick);\n  const orders = [];\n  for (let level = 1; level <= levelsPerSide; level += 1) {\n    const offset = step * (level - 1);\n    const lot = baseLot * level;\n    orders.push({ type: "BUY_STOP", level, lot, price: buyAnchor + offset });\n    orders.push({ type: "SELL_STOP", level, lot, price: sellAnchor - offset });\n  }\n  return orders;\n}'''
text = text[:start] + new_function + text[end:]

old_case = '''{\n  const bid = 4304.40;\n  const ask = 4304.60;\n  const orders = buildPendingPlan({ bid, ask, step: 3, brokerMinDistance: 0.05, tick: 0.01, levelsPerSide: 3 });\n  const buys = orders.filter((o) => o.type === "BUY_STOP");\n  const sells = orders.filter((o) => o.type === "SELL_STOP");\n  assert.ok(buys[0].price - ask < 0.10, "first BUY STOP should hug live ask");\n  assert.ok(bid - sells[0].price < 0.10, "first SELL STOP should hug live bid");\n  assert.equal(Number((buys[1].price - buys[0].price).toFixed(2)), 3);\n  assert.equal(Number((sells[0].price - sells[1].price).toFixed(2)), 3);\n}\n'''
new_case = '''{\n  const bid = 4000.95;\n  const ask = 4001.05;\n  const orders = buildPendingPlan({ bid, ask, step: 3, brokerMinDistance: 0.05, tick: 0.01, levelsPerSide: 3 });\n  const buys = orders.filter((o) => o.type === "BUY_STOP");\n  const sells = orders.filter((o) => o.type === "SELL_STOP");\n  assert.equal(Number(buys[0].price.toFixed(2)), 4002.00, "first BUY STOP should be about +1.00 from center");\n  assert.equal(Number(sells[0].price.toFixed(2)), 4000.00, "first SELL STOP should be about -1.00 from center");\n  assert.equal(Number((buys[1].price - buys[0].price).toFixed(2)), 3);\n  assert.equal(Number((sells[0].price - sells[1].price).toFixed(2)), 3);\n}\n'''
if old_case not in text:
    raise SystemExit("ZERO test first-offset case not found")
text = text.replace(old_case, new_case, 1)
text = text.replace(
    'assert.match(ea, /double ZeroGridEntryGapPrice\\(\\)[\\s\\S]*double gap=ZeroGridMinPendingDistancePrice\\(\\)/);\nassert.doesNotMatch(ea, /ZeroGridMinPendingDistancePrice\\(\\)\\+ZeroGridTickSize\\(\\)/);\nassert.doesNotMatch(ea, /MathMax\\(stops,freeze\\)/);\nassert.match(ea, /double ZeroGridPendingAnchorPrice\\(bool buySide\\)[\\s\\S]*live\\.ask\\+gap[\\s\\S]*live\\.bid-gap/);\n',
    'assert.match(ea, /double ZeroGridEntryGapPrice\\(\\)[\\s\\S]*double preferredGap=1\\.0;[\\s\\S]*ZeroGridMinPendingDistancePrice\\(\\)\\+tick/);\nassert.doesNotMatch(ea, /MathMax\\(stops,freeze\\)/);\nassert.match(ea, /double ZeroGridPendingAnchorPrice\\(bool buySide\\)[\\s\\S]*g_zeroGridCenter\\+gap[\\s\\S]*g_zeroGridCenter-gap[\\s\\S]*live\\.ask\\+brokerSafe[\\s\\S]*live\\.bid-brokerSafe/);\n',
    1,
)
text = text.replace(
    'console.log("ZERO GRID nearest-legal first-entry and real-net regression passed");',
    'console.log("ZERO GRID ~100-point first-offset, fast paired staging and real-net regression passed");',
    1,
)
test.write_text(text, encoding="utf-8", newline="\n")

print("ZERO first pair set around center +/- 1.00 with broker-safe one-tick headroom")
