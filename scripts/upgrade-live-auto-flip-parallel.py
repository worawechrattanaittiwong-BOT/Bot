from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")


def replace_all(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


ea = "mt5/FastBasketBot.mq5"
web = "apps/web/app/dashboard/page.tsx"
bot = "apps/api/src/bot.controller.ts"
ea_api = "apps/api/src/ea.controller.ts"
build = ".github/workflows/build-mt5-ea.yml"
check = ".github/workflows/check-mt5-ea.yml"

# ---- MT5 live runtime ----------------------------------------------------
replace_all(ea, '#property version   "1.0.23"', '#property version   "1.0.24"')
replace_all(ea, '#define SCENOVA_EA_VERSION "1.0.23"', '#define SCENOVA_EA_VERSION "1.0.24"')
replace_all(ea, '#define SCENOVA_PRODUCT_VERSION "1.0.23"', '#define SCENOVA_PRODUCT_VERSION "1.0.24"')

old_auto = '''bool AutoV20Enabled()\n{\n   return g_engineMode == "AUTO" && g_controlMode == "AUTO";\n}\n'''
new_auto = '''bool AutoV20Enabled()\n{\n   if(g_engineMode != "AUTO") return false;\n   return g_controlMode == "AUTO" ||\n          g_controlMode == "FLIP_LOCK" ||\n          g_controlMode == "PARALLEL_UNIVERSE";\n}\n\n#include "include\\\\AutoVectorEdgeLiveV1.mqh"\n#include "include\\\\ParallelUniverseV1.mqh"\n#include "include\\\\FlipLockV1.mqh"\n'''
replace_once(ea, old_auto, new_auto)

replace_once(
    ea,
    '   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")\n      return "AUTO";',
    '   if(control == "AUTO" || control == "FLIP_LOCK" || control == "PARALLEL_UNIVERSE" ||\n      control == "ASSISTED" || control == "MANUAL")\n      return "AUTO";'
)

replace_once(
    ea,
    '      requestedControlMode == "ZERO_GRID" || requestedControlMode == "ASSISTED" ||\n      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";',
    '      requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "ASSISTED" ||\n      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";'
)

replace_once(
    ea,
    '   if(hasControlMode || hasEngineMode)\n      g_settingsSynchronized = true;\n\n   // A legacy AUTO burst must never survive a transition into an isolated mode.',
    '   if(hasControlMode || hasEngineMode)\n      g_settingsSynchronized = true;\n\n   // FLIP LOCK is intentionally single-position to prevent accidental basket\n   // averaging while a baton-switch cycle is active.\n   if(g_controlMode == "FLIP_LOCK")\n      g_maxPositions = 1;\n\n   // A legacy AUTO burst must never survive a transition into an isolated mode.'
)

replace_once(
    ea,
    '   g_autoV20DecisionReason=selected.reason;\n   g_autoV20RejectReason="NONE";',
    '''   string vectorLiveReason="NONE";\n   if(!AutoVectorEdgeLiveAllow(direction,vectorLiveReason))\n   {\n      g_autoV20RejectReason=vectorLiveReason;\n      g_adaptiveBlockReason="AUTO_VECTOR_EDGE_WAIT";\n      g_cachedAdaptiveDirection=0;\n      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;\n      return 0;\n   }\n\n   string parallelReason="NONE";\n   if(!ParallelUniverseLiveAllow(direction,parallelReason))\n   {\n      g_autoV20RejectReason=parallelReason;\n      g_adaptiveBlockReason="PARALLEL_UNIVERSE_WAIT";\n      g_cachedAdaptiveDirection=0;\n      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;\n      return 0;\n   }\n\n   g_autoV20DecisionReason=selected.reason;\n   g_autoV20RejectReason="NONE";'''
)

replace_once(
    ea,
    '   FlushPendingBasketJournal();\n\n   // ZERO_GRID_TIMER_MAINTENANCE_V116:',
    '   FlushPendingBasketJournal();\n\n   // FLIP LOCK supplements AUTO V20 only and is a no-op in every other mode.\n   if(FlipLockModeEnabled())\n      FlipLockManage();\n\n   // ZERO_GRID_TIMER_MAINTENANCE_V116:'
)

# ---- API mode validation / runtime transport -----------------------------
replace_once(
    bot,
    'if (requestedControlMode !== null && !["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(requestedControlMode))',
    'if (requestedControlMode !== null && !["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "PARALLEL_UNIVERSE", "ASSISTED", "MANUAL"].includes(requestedControlMode))'
)

replace_once(
    ea_api,
    'if (!["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(savedControlMode))',
    'if (!["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "PARALLEL_UNIVERSE", "ASSISTED", "MANUAL"].includes(savedControlMode))'
)

# ---- Web bot settings ----------------------------------------------------
replace_once(
    web,
    '        payload.controlMode = requestedControlMode === "MANUAL" ? "MANUAL" : "AUTO";\n        payload.engineMode = "AUTO";',
    '        payload.controlMode = ["AUTO","FLIP_LOCK","PARALLEL_UNIVERSE","MANUAL"].includes(requestedControlMode) ? requestedControlMode : "AUTO";\n        payload.engineMode = "AUTO";'
)

replace_once(
    web,
    '  const controlMode = ["AUTO","RACE","ZERO_GRID","MANUAL"].includes(requestedControlMode)',
    '  const controlMode = ["AUTO","FLIP_LOCK","PARALLEL_UNIVERSE","RACE","ZERO_GRID","MANUAL"].includes(requestedControlMode)'
)

replace_once(
    web,
    '    AUTO:{title:"AUTO",subtitle:"ระบบวิเคราะห์ทิศทาง จุดเข้า และการบริหารสถานะตามเงื่อนไขของกลยุทธ์"},\n    RACE:{title:"RACE",subtitle:',
    '    AUTO:{title:"AUTO · VECTOR EDGE",subtitle:"สมอง AUTO รวม Probability, Expected Value, Entropy และตัวกรองต้นทุน เพื่อคัดจังหวะที่มี Edge ก่อนเข้า"},\n    FLIP_LOCK:{title:"FLIP LOCK",subtitle:"เข้าแบบ AUTO แล้วล็อกกำไรด้วยเส้น Flip เสมือน เมื่อราคาย้อนถึงจุดล็อกจะปิดฝั่งเดิมก่อนสลับฝั่งใหม่"},\n    PARALLEL_UNIVERSE:{title:"PARALLEL UNIVERSE",subtitle:"ใช้สถิติ Setup / Model / Regime ในอดีตเทียบกับสภาพปัจจุบันก่อนยืนยันออเดอร์"},\n    RACE:{title:"RACE",subtitle:'
)

replace_once(
    web,
    '    if (mode === "AUTO") {\n      props.onEdit?.("profitTargetMode","AUTO");\n      props.onEdit?.("manualStopLossPoints",0);\n      return;\n    }',
    '    if (mode === "AUTO" || mode === "FLIP_LOCK" || mode === "PARALLEL_UNIVERSE") {\n      props.onEdit?.("profitTargetMode","AUTO");\n      props.onEdit?.("manualStopLossPoints",0);\n      if (mode === "FLIP_LOCK") props.onEdit?.("maxPositions",1);\n      return;\n    }'
)

replace_once(
    web,
    '                {id:"AUTO",icon:"brain",tag:"แนะนำ"},\n                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},',
    '                {id:"AUTO",icon:"brain",tag:"AUTO + VECTOR"},\n                {id:"FLIP_LOCK",icon:"trend",tag:"ล็อกกำไร + สลับฝั่ง"},\n                {id:"PARALLEL_UNIVERSE",icon:"spark",tag:"สถิติหลายเหตุการณ์"},\n                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},'
)

replace_once(
    web,
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>',
    '{controlMode==="FLIP_LOCK" ? <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</label><strong>1 ไม้</strong><small>FLIP LOCK ล็อก 1 Position ต่อรอบเพื่อป้องกันการถัวและการ Flip ซ้อน</small></div> : <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>}'
)

replace_once(
    web,
    'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO" : settings.entryMode',
    'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "FLIP_LOCK" ? "FLIP LOCK" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "PARALLEL_UNIVERSE" ? "PARALLEL UNIVERSE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO · VECTOR" : settings.entryMode'
)

# ---- Official MT5 compile workflows must preserve include/ ----------------
replace_once(
    check,
    '          $sourceDir = "$env:RUNNER_TEMP\\SCENOVA-EA-Source"\n          New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null\n          $source = Join-Path $sourceDir "FastBasketBot.mq5"\n          Copy-Item -Force "mt5\\FastBasketBot.mq5" $source',
    '          $source = (Resolve-Path "mt5\\FastBasketBot.mq5").Path'
)

replace_once(
    build,
    '            \'return g_engineMode == "AUTO" && g_controlMode == "AUTO";\',',
    '            \'g_controlMode == "FLIP_LOCK" ||\',\n            \'g_controlMode == "PARALLEL_UNIVERSE";\',\n            \'#include "include\\\\AutoVectorEdgeLiveV1.mqh"\',\n            \'#include "include\\\\ParallelUniverseV1.mqh"\',\n            \'#include "include\\\\FlipLockV1.mqh"\','
)

replace_once(
    build,
    '          $sourceDir = "C:\\SCENOVA-EA-Source"\n          New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null\n          $source = Join-Path $sourceDir "FastBasketBot.mq5"\n          Copy-Item -Force $mq5Path $source\n          "EA_SOURCE=$source" | Out-File -FilePath $env:GITHUB_ENV -Append',
    '          $source = $mq5Path\n          "EA_SOURCE=$source" | Out-File -FilePath $env:GITHUB_ENV -Append'
)

replace_all(build, 'policy = "AUTO_V20_RACE_VOLUME_10S_ZERO_LOW_VOLATILITY_V3"', 'policy = "AUTO_VECTOR_EDGE_FLIP_LOCK_PARALLEL_UNIVERSE_V1"')

print("live AUTO/VECTOR + FLIP LOCK + PARALLEL UNIVERSE patch applied")
