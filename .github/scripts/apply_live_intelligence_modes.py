from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_exact(rel, old, new, expected=1):
    text = read(rel)
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{rel}: expected {expected} occurrence(s), found {count}: {old[:100]!r}")
    write(rel, text.replace(old, new))


def replace_all(rel, old, new, minimum=1):
    text = read(rel)
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"{rel}: expected at least {minimum}, found {count}: {old[:100]!r}")
    write(rel, text.replace(old, new))


def assert_contains(rel, *needles):
    text = read(rel)
    for needle in needles:
        if needle not in text:
            raise RuntimeError(f"{rel}: missing contract sentinel {needle!r}")


EA = "mt5/FastBasketBot.mq5"
BOT = "apps/api/src/bot.controller.ts"
EA_API = "apps/api/src/ea.controller.ts"
RELEASE = "apps/api/src/release-version.ts"
WEB = "apps/web/app/dashboard/page.tsx"
BUILD = ".github/workflows/build-mt5-ea.yml"

# ---------------------------------------------------------------------------
# EA release metadata
replace_exact(EA, '#property version   "1.0.23"', '#property version   "1.0.24"')
replace_exact(EA, '#define SCENOVA_EA_VERSION "1.0.23"', '#define SCENOVA_EA_VERSION "1.0.24"')
replace_exact(EA, '#define SCENOVA_PRODUCT_VERSION "1.0.23"', '#define SCENOVA_PRODUCT_VERSION "1.0.24"')
replace_exact(EA, '#define SCENOVA_RUNTIME_CONTRACT "RACE_VOLUME_10S_ROLLOVER_V1"',
                  '#define SCENOVA_RUNTIME_CONTRACT "LIVE_INTELLIGENCE_MODES_V1"')

# Accept the two new control owners without broadening engineMode.
replace_exact(
    EA,
    '      requestedControlMode == "ZERO_GRID" || requestedControlMode == "ASSISTED" ||\n'
    '      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";',
    '      requestedControlMode == "ZERO_GRID" || requestedControlMode == "ASSISTED" ||\n'
    '      requestedControlMode == "MANUAL" || requestedControlMode == "FLIP_LOCK" ||\n'
    '      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "LEGACY";'
)

replace_exact(
    EA,
    '   if(control == "ZERO_GRID") return "ZERO_GRID";\n'
    '   if(control == "RACE") return "RACE";\n'
    '   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")\n'
    '      return "AUTO";',
    '   if(control == "ZERO_GRID") return "ZERO_GRID";\n'
    '   if(control == "RACE") return "RACE";\n'
    '   if(control == "FLIP_LOCK") return "FLIP_LOCK";\n'
    '   if(control == "PARALLEL_UNIVERSE") return "PARALLEL_UNIVERSE";\n'
    '   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")\n'
    '      return "AUTO";'
)

# Bring VECTOR EDGE into production AUTO immediately before the AUTO decision function.
replace_exact(
    EA,
    'int AutoV20PrecisionDirection(double momentum)\n{',
    '#include "include\\\\AutoVectorEdgeV1.mqh"\n'
    '#include "include\\\\AutoVectorEdgeLiveV1.mqh"\n\n'
    'int AutoV20PrecisionDirection(double momentum)\n{'
)

# Final mathematical confirmation after the existing AUTO analysis has built both sides.
replace_exact(
    EA,
    '   g_autoV20DecisionReason=selected.reason;\n'
    '   g_autoV20RejectReason="NONE";\n'
    '   g_adaptiveBlockReason="";',
    '   string vectorLiveReason="NONE";\n'
    '   if(!AutoVectorEdgeLiveAllow(direction,vectorLiveReason))\n'
    '   {\n'
    '      g_autoV20RejectReason=vectorLiveReason;\n'
    '      g_adaptiveBlockReason=vectorLiveReason;\n'
    '      g_cachedAdaptiveDirection=0;\n'
    '      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;\n'
    '      Print("AUTO VECTOR EDGE veto id=",g_autoV20DecisionId,\n'
    '            " side=",direction>0 ? "BUY" : "SELL",\n'
    '            " edge=",DoubleToString(g_vectorLiveEdgeRatio,1),\n'
    '            " buyEV=",DoubleToString(g_vectorLiveBuyEV,2),\n'
    '            " sellEV=",DoubleToString(g_vectorLiveSellEV,2),\n'
    '            " reason=",vectorLiveReason);\n'
    '      return 0;\n'
    '   }\n\n'
    '   g_autoV20DecisionReason=selected.reason+"|"+vectorLiveReason;\n'
    '   g_autoV20RejectReason="NONE";\n'
    '   g_adaptiveBlockReason="";'
)

# Dedicated mode module is loaded only after the existing decision/risk helpers exist.
replace_exact(
    EA,
    'void OnTick()\n{',
    '#include "include\\\\LiveExecutionModesV1.mqh"\n\n'
    'void OnTick()\n{'
)

# New execution owners return before RACE/AUTO. ZERO GRID remains earlier and untouched.
replace_exact(
    EA,
    '   // RACE starts only from a flat account. AUTO below is intentionally left\n'
    '   // untouched and never evaluates this branch unless engineMode=RACE.',
    '   // Dedicated live intelligence owners. Each handler fully owns the tick\n'
    '   // and returns before RACE/AUTO, preventing cross-mode entry leakage.\n'
    '   if(FlipLockModeEnabled())\n'
    '   {\n'
    '      HandleFlipLockMode(momentum);\n'
    '      return;\n'
    '   }\n'
    '   if(ParallelUniverseModeEnabled())\n'
    '   {\n'
    '      HandleParallelUniverseMode(momentum);\n'
    '      return;\n'
    '   }\n\n'
    '   // RACE starts only from a flat account. AUTO below is intentionally left\n'
    '   // untouched and never evaluates this branch unless engineMode=RACE.'
)

# ---------------------------------------------------------------------------
# API contracts: persist and heartbeat the new control modes. engineMode remains
# AUTO for both so old engine families are not widened.
old_modes = '["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"]'
new_modes = '["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL", "FLIP_LOCK", "PARALLEL_UNIVERSE"]'
replace_all(BOT, old_modes, new_modes)
replace_all(EA_API, old_modes, new_modes)

# ---------------------------------------------------------------------------
# Web settings UI
replace_exact(
    WEB,
    '  const modeCopy:Record<string,{title:string;subtitle:string}> = {\n'
    '    AUTO:{title:"AUTO",subtitle:"ระบบวิเคราะห์ทิศทาง จุดเข้า และการบริหารสถานะตามเงื่อนไขของกลยุทธ์"},\n'
    '    RACE:{title:"RACE",subtitle:"เพิ่มความถี่ในการเปิดสถานะเพื่อให้ครบจำนวนที่กำหนดเร็วขึ้น โดยแยกการบริหารรอบจากโหมดอัตโนมัติ"},\n'
    '    ZERO_GRID:{title:"ZERO GRID",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},\n'
    '    MANUAL:{title:"MANUAL",subtitle:"ระบบวิเคราะห์ทิศทางและจุดเข้าอัตโนมัติ โดยผู้ใช้กำหนด Lot เป้าหมายกำไร และจุดหยุดขาดทุน"}\n'
    '  };',
    '  const modeCopy:Record<string,{title:string;subtitle:string}> = {\n'
    '    AUTO:{title:"AUTO + VECTOR EDGE",subtitle:"สมอง AUTO รวม Probability, Expected Value, Entropy, ต้นทุน และแรงเคลื่อนไหวเพื่อคัดจังหวะที่มี Edge"},\n'
    '    FLIP_LOCK:{title:"FLIP LOCK",subtitle:"ถือครั้งละ 1 Position ล็อกกำไรด้วยเส้นกลับตัวแบบไดนามิก แล้วปิดขาเดิมก่อนสลับ BUY ↔ SELL"},\n'
    '    PARALLEL_UNIVERSE:{title:"PARALLEL UNIVERSE",subtitle:"เทียบสถิติ BUY/SELL จากเหตุการณ์ย้อนหลังที่คล้ายกันและไม่เข้าเมื่อข้อมูลหรือ Expected Value ไม่พอ"},\n'
    '    RACE:{title:"RACE",subtitle:"เพิ่มความถี่ในการเปิดสถานะเพื่อให้ครบจำนวนที่กำหนดเร็วขึ้น โดยแยกการบริหารรอบจากโหมดอัตโนมัติ"},\n'
    '    ZERO_GRID:{title:"ZERO GRID",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},\n'
    '    MANUAL:{title:"MANUAL",subtitle:"ระบบวิเคราะห์ทิศทางและจุดเข้าอัตโนมัติ โดยผู้ใช้กำหนด Lot เป้าหมายกำไร และจุดหยุดขาดทุน"}\n'
    '  };'
)

replace_exact(
    WEB,
    '                {id:"AUTO",icon:"brain",tag:"แนะนำ"},\n'
    '                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},\n'
    '                {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},\n'
    '                {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}',
    '                {id:"AUTO",icon:"brain",tag:"VECTOR EDGE รวมแล้ว"},\n'
    '                {id:"FLIP_LOCK",icon:"status",tag:"ล็อกกำไร · สลับทิศ"},\n'
    '                {id:"PARALLEL_UNIVERSE",icon:"brain",tag:"Historical Worlds"},\n'
    '                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},\n'
    '                {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},\n'
    '                {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}'
)

# Explicitly keep the engine pair atomic for the new control owners.
replace_exact(
    WEB,
    '    props.onEdit?.("confidenceGateEnabled",false);\n'
    '    // ZERO GRID is price-only and does not use AUTO direction/brain settings.',
    '    props.onEdit?.("confidenceGateEnabled",false);\n'
    '    if (mode === "FLIP_LOCK" || mode === "PARALLEL_UNIVERSE" || mode === "AUTO") {\n'
    '      props.onEdit?.("engineMode","AUTO");\n'
    '    }\n'
    '    // ZERO GRID is price-only and does not use AUTO direction/brain settings.'
)

# Dedicated one-position modes must not present a misleading Max Positions selector.
replace_exact(
    WEB,
    '                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>',
    '                    {(controlMode==="FLIP_LOCK"||controlMode==="PARALLEL_UNIVERSE") ? <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</label><strong>1 ไม้</strong><small>โหมดนี้บังคับ 1 Position / 1 Direction / 1 Risk Budget</small></div> : <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>}'
)

replace_exact(
    WEB,
    '                {controlMode!=="ZERO_GRID"&&<div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>การเพิ่มสถานะอัตโนมัติ</b><span>EA กระจายจังหวะเพิ่มสถานะตาม ATR และแรงเคลื่อนไหวของตลาด</span></div>}',
    '                {controlMode!=="ZERO_GRID"&&<div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>{controlMode==="FLIP_LOCK"?"1 Position · Flip เมื่อกำไรย้อน":controlMode==="PARALLEL_UNIVERSE"?"1 Position · เข้าเมื่อสถิติยืนยัน":"การเพิ่มสถานะอัตโนมัติ"}</b><span>{controlMode==="FLIP_LOCK"?"ปิดขาเดิมให้ Flat ก่อนเปิดฝั่งตรงข้าม · ไม่ Martingale / ไม่ Grid":controlMode==="PARALLEL_UNIVERSE"?"ต้องมี Historical Samples สองฝั่งและ Expected Value เป็นบวกก่อนส่งออเดอร์":"EA กระจายจังหวะเพิ่มสถานะตาม ATR และแรงเคลื่อนไหวของตลาด"}</span></div>}'
)

replace_exact(
    WEB,
    '<div className="cc-bot-v2-summary-head"><span><ScenovaIcon name="status" size={19}/></span><div><small>แผนที่จะบันทึก</small><b>{modeCopy[controlMode].title}</b></div><i/></div>',
    '<div className="cc-bot-v2-summary-head"><span><ScenovaIcon name="status" size={19}/></span><div><small>แผนที่จะบันทึก</small><b>{(modeCopy[controlMode]||modeCopy.AUTO).title}</b></div><i/></div>'
)

# Hero mode label and position-count chip.
replace_exact(
    WEB,
    '<span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "ZERO GRID" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO" : settings.entryMode}</span>',
    '<span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "ZERO GRID" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "FLIP_LOCK" ? "FLIP LOCK" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "PARALLEL_UNIVERSE" ? "PARALLEL UNIVERSE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO + VECTOR EDGE" : settings.entryMode}</span>'
)
replace_exact(
    WEB,
    '<span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" BUY STOP + "+Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" SELL STOP" : configuredMaxPositions+" ไม้"}</span>',
    '<span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" BUY STOP + "+Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" SELL STOP" : ["FLIP_LOCK","PARALLEL_UNIVERSE"].includes(String(settings.controlMode || "").toUpperCase()) ? "1 ไม้" : configuredMaxPositions+" ไม้"}</span>'
)

# ---------------------------------------------------------------------------
# Release/version gates and official MT5 workflow sentinels.
replace_exact(RELEASE, 'export const DEFAULT_EA_VERSION = "1.0.23";',
                       'export const DEFAULT_EA_VERSION = "1.0.24";')
replace_exact(RELEASE, 'export const EA_RUNTIME_CONTRACT = "RACE_VOLUME_10S_ROLLOVER_V1";',
                       'export const EA_RUNTIME_CONTRACT = "LIVE_INTELLIGENCE_MODES_V1";')
replace_all(BUILD, 'EA v1.0.23', 'EA v1.0.24')
replace_all(BUILD, '#define SCENOVA_RUNTIME_CONTRACT "RACE_VOLUME_10S_ROLLOVER_V1"',
                   '#define SCENOVA_RUNTIME_CONTRACT "LIVE_INTELLIGENCE_MODES_V1"')

# Add new compile-time source sentinels without weakening any existing RACE/ZERO checks.
replace_exact(
    BUILD,
    "            'bool AutoV20Enabled()',\n",
    "            'bool AutoV20Enabled()',\n"
    "            'AutoVectorEdgeLiveAllow(direction,vectorLiveReason)',\n"
    "            'bool FlipLockModeEnabled()',\n"
    "            'bool ParallelUniverseModeEnabled()',\n"
    "            'HandleFlipLockMode(momentum);',\n"
    "            'HandleParallelUniverseMode(momentum);',\n"
)

# ---------------------------------------------------------------------------
# Contract verification after patching.
assert_contains(EA,
    '#property version   "1.0.24"',
    '#define SCENOVA_RUNTIME_CONTRACT "LIVE_INTELLIGENCE_MODES_V1"',
    'requestedControlMode == "FLIP_LOCK"',
    'requestedControlMode == "PARALLEL_UNIVERSE"',
    'if(control == "FLIP_LOCK") return "FLIP_LOCK";',
    'if(control == "PARALLEL_UNIVERSE") return "PARALLEL_UNIVERSE";',
    'AutoVectorEdgeLiveAllow(direction,vectorLiveReason)',
    'HandleFlipLockMode(momentum);',
    'HandleParallelUniverseMode(momentum);')
assert_contains(BOT, '"FLIP_LOCK"', '"PARALLEL_UNIVERSE"')
assert_contains(EA_API, '"FLIP_LOCK"', '"PARALLEL_UNIVERSE"')
assert_contains(WEB, 'FLIP_LOCK:{title:"FLIP LOCK"', 'PARALLEL_UNIVERSE:{title:"PARALLEL UNIVERSE"', 'AUTO + VECTOR EDGE')
assert_contains(RELEASE, 'DEFAULT_EA_VERSION = "1.0.24"', 'EA_RUNTIME_CONTRACT = "LIVE_INTELLIGENCE_MODES_V1"')

print("LIVE_INTELLIGENCE_MODES_PATCH_OK")
