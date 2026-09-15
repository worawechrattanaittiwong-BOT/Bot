from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# API: accept only ZERO GRID level counts 1..30 and never force them back to 3.
replace_exact(
    "apps/api/src/bot.controller.ts",
    '    numberSetting("zeroGridLevelsPerSide", 3, 3, true);',
    '    numberSetting("zeroGridLevelsPerSide", 1, 30, true);',
)
replace_exact(
    "apps/api/src/bot.controller.ts",
    '      clean.zeroGridLevelsPerSide = 3;\n',
    '',
)

# Web: preserve a safe default of 3, but allow the customer to select 1..30 per side.
replace_exact(
    "apps/web/app/dashboard/page.tsx",
    '          nextSettings.zeroGridLevelsPerSide = 3;',
    '          nextSettings.zeroGridLevelsPerSide = Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 3));',
)
replace_exact(
    "apps/web/app/dashboard/page.tsx",
    '      props.onEdit?.("zeroGridLevelsPerSide",3);',
    '      props.onEdit?.("zeroGridLevelsPerSide",Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||3)));',
)
replace_exact(
    "apps/web/app/dashboard/page.tsx",
    'Number(settings.zeroGridLevelsPerSide||30)',
    'Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||3))',
    expected=2,
)
replace_exact(
    "apps/web/app/dashboard/page.tsx",
    '<div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="layers" size={17}/>Pending ต่อฝั่ง</label><strong>3 BUY STOP + 3 SELL STOP</strong></div>',
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>Pending ต่อฝั่ง</span><select className="input" value={String(Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||3)))} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",Number(e.target.value))}>{Array.from({length:30},(_,i)=>i+1).map(value=><option key={value} value={value}>{value} ต่อฝั่ง</option>)}</select><small>เลือกได้ 1–30 BUY STOP และ 1–30 SELL STOP</small></label>',
)
replace_exact(
    "apps/web/app/dashboard/page.tsx",
    '<div><dt>Pending</dt><dd>3 BUY + 3 SELL</dd></div>',
    '<div><dt>Pending</dt><dd>{Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||3))} BUY + {Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||3))} SELL</dd></div>',
)

# EA: keep ZERO isolated; only restore configurable ladder depth. Default remains 3
# so existing customers are not surprised, while the hard ceiling returns to 30.
replace_exact(
    "mt5/FastBasketBot.mq5",
    '#define ZERO_GRID_MAX_LEVELS 3\ninput double          InpZeroGridStepPrice     = 3.0;\ninput int             InpZeroGridLevelsPerSide = ZERO_GRID_MAX_LEVELS;',
    '#define ZERO_GRID_MAX_LEVELS 30\n#define ZERO_GRID_DEFAULT_LEVELS 3\ninput double          InpZeroGridStepPrice     = 3.0;\ninput int             InpZeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    'int    g_zeroGridLevelsPerSide = ZERO_GRID_MAX_LEVELS;',
    'int    g_zeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    '   g_zeroGridStepPrice = MathAbs(InpZeroGridStepPrice-2.0)<0.000001 ? 2.0 : 3.0;\n   g_zeroGridLevelsPerSide = ZERO_GRID_MAX_LEVELS;\n   g_zeroGridBaseLot = MathMax(0.01, InpZeroGridBaseLot);',
    '   g_zeroGridStepPrice = MathAbs(InpZeroGridStepPrice-2.0)<0.000001 ? 2.0 : 3.0;\n   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)InpZeroGridLevelsPerSide));\n   g_zeroGridBaseLot = MathMax(0.01, InpZeroGridBaseLot);',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    'int ZeroGridEffectiveLevelsPerSide()\n{\n   return ZERO_GRID_MAX_LEVELS;\n}',
    'int ZeroGridEffectiveLevelsPerSide()\n{\n   int source=g_zeroGridCycleLevelsPerSide>0 ? g_zeroGridCycleLevelsPerSide : g_zeroGridLevelsPerSide;\n   return (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)source));\n}',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    '   int requestedLevels=ZERO_GRID_MAX_LEVELS;',
    '   int requestedLevels=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    '      g_zeroGridCycleLevelsPerSide=ZERO_GRID_MAX_LEVELS;',
    '      g_zeroGridCycleLevelsPerSide=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));',
)
replace_exact(
    "mt5/FastBasketBot.mq5",
    '   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));\n   g_zeroGridLevelsPerSide = ZERO_GRID_MAX_LEVELS;\n   g_zeroGridBaseLot = MathMax(0.01, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));',
    '   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));\n   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,MathRound(JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide))));\n   g_zeroGridBaseLot = MathMax(0.01, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));',
)

# Focused contract: guards the 1..30 feature and checks mode-isolation sentinels remain.
Path("tests/zero-grid-configurable-levels-contract.mjs").write_text(r'''import fs from "node:fs";

const api = fs.readFileSync("apps/api/src/bot.controller.ts", "utf8");
const web = fs.readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
const ea = fs.readFileSync("mt5/FastBasketBot.mq5", "utf8");

function need(text, value, label) {
  if (!text.includes(value)) throw new Error(`missing ${label}: ${value}`);
}
function forbid(text, value, label) {
  if (text.includes(value)) throw new Error(`obsolete ${label}: ${value}`);
}

need(api, 'numberSetting("zeroGridLevelsPerSide", 1, 30, true);', "API ZERO level range");
forbid(api, 'numberSetting("zeroGridLevelsPerSide", 3, 3, true);', "API fixed-three range");
forbid(api, 'clean.zeroGridLevelsPerSide = 3;', "API forced-three override");

need(web, 'Array.from({length:30},(_,i)=>i+1)', "web 1..30 selector");
need(web, 'เลือกได้ 1–30 BUY STOP และ 1–30 SELL STOP', "web range explanation");
forbid(web, '3 BUY STOP + 3 SELL STOP', "web fixed-three label");
forbid(web, '<dd>3 BUY + 3 SELL</dd>', "web fixed-three summary");

need(ea, '#define ZERO_GRID_MAX_LEVELS 30', "EA upper bound");
need(ea, '#define ZERO_GRID_DEFAULT_LEVELS 3', "EA compatibility default");
need(ea, 'JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide)', "EA server-setting input");
need(ea, 'g_zeroGridCycleLevelsPerSide>0 ? g_zeroGridCycleLevelsPerSide : g_zeroGridLevelsPerSide', "EA cycle geometry lock");
forbid(ea, 'return ZERO_GRID_MAX_LEVELS;', "EA hardcoded effective levels");

// Explicit isolation sentinels: this feature must not replace AUTO/RACE engines.
need(ea, 'bool AutoV20Enabled()', "AUTO V20 engine");
need(ea, 'int RaceM5CandleDirection()', "RACE engine");
need(ea, 'bool ZeroGridModeEnabled()', "ZERO isolated engine");

console.log("ZERO GRID configurable levels 1..30 contract: PASS");
''', encoding="utf-8")

print("ZERO GRID configurable levels patch prepared")
