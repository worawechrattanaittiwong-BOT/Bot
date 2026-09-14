from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"target block not found in {path}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")


ea = "mt5/FastBasketBot.mq5"
replace_once(
    ea,
    '''double ZeroGridMinPendingDistancePrice()\n{\n   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);\n   long freeze=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL);\n   double brokerDistance=(double)MathMax(stops,freeze)*_Point;\n   return MathMax(ZeroGridTickSize(),brokerDistance);\n}\n''',
    '''double ZeroGridMinPendingDistancePrice()\n{\n   // New pending orders are constrained by StopsLevel. FreezeLevel mainly\n   // limits later modify/delete operations near market and must not push the\n   // first ZERO trigger farther away than the broker requires for placement.\n   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);\n   double brokerDistance=(double)MathMax((long)0,stops)*_Point;\n   return MathMax(ZeroGridTickSize(),brokerDistance);\n}\n'''
)
replace_once(
    ea,
    '''double ZeroGridEntryGapPrice()\n{\n   // First trigger is independent from Grid Step. One tick beyond the\n   // broker Stops/Freeze boundary is the nearest robust pending distance.\n   double tick=ZeroGridTickSize();\n   double gap=ZeroGridMinPendingDistancePrice()+tick;\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(units*tick,_Digits);\n}\n''',
    '''double ZeroGridEntryGapPrice()\n{\n   // First BUY/SELL triggers hug the live quote at the nearest broker-legal\n   // pending distance. Rounding outward to tick size provides the only buffer.\n   double tick=ZeroGridTickSize();\n   double gap=ZeroGridMinPendingDistancePrice();\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(MathMax(1.0,units)*tick,_Digits);\n}\n'''
)
replace_once(
    ea,
    '''   double safeDistance=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();\n   double safeBoundary=buySide\n''',
    '''   double safeDistance=ZeroGridMinPendingDistancePrice();\n   double safeBoundary=buySide\n'''
)

test = "tests/zero-grid-v1-simulation.mjs"
replace_once(
    test,
    '  const safeGap = Math.max(tick, brokerMinDistance) + tick;\n',
    '  const safeGap = Math.max(tick, brokerMinDistance);\n'
)
replace_once(
    test,
    'assert.match(ea, /double ZeroGridEntryGapPrice\\(\\)[\\s\\S]*ZeroGridMinPendingDistancePrice\\(\\)\\+tick/);\n',
    'assert.match(ea, /double ZeroGridEntryGapPrice\\(\\)[\\s\\S]*double gap=ZeroGridMinPendingDistancePrice\\(\\)/);\nassert.doesNotMatch(ea, /ZeroGridMinPendingDistancePrice\\(\\)\\+ZeroGridTickSize\\(\\)/);\nassert.doesNotMatch(ea, /MathMax\\(stops,freeze\\)/);\n'
)
replace_once(
    test,
    'console.log("ZERO GRID near-entry and real-net regression passed");\n',
    'console.log("ZERO GRID nearest-legal first-entry and real-net regression passed");\n'
)

print("ZERO first-entry tightened to nearest broker-legal distance")
