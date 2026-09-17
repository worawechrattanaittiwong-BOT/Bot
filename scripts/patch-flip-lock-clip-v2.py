from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one anchor in {path}, found {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"anchor missing in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


ea = "mt5/FastBasketBot.mq5"
flip = "mt5/include/FlipLockV1.mqh"
web = "apps/web/app/dashboard/page.tsx"

# EA release version: this is a behavior-changing execution release.
replace_all(ea, '#property version   "1.0.24"', '#property version   "1.0.25"')
replace_all(ea, '#define SCENOVA_EA_VERSION "1.0.24"', '#define SCENOVA_EA_VERSION "1.0.25"')
replace_all(ea, '#define SCENOVA_PRODUCT_VERSION "1.0.24"', '#define SCENOVA_PRODUCT_VERSION "1.0.25"')

# FLIP LOCK must own its runtime.  It starts independently instead of falling
# through to AUTO/VECTOR entry selection.  RACE/ZERO/AUTO remain untouched.
replace_once(
    ea,
    '''   // RACE starts only from a flat account. AUTO below is intentionally left\n   // untouched and never evaluates this branch unless engineMode=RACE.\n   if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)''',
    '''   // FLIP LOCK V2 owns its entry + opposite-pending baton lifecycle.\n   // It deliberately bypasses AUTO/VECTOR/PARALLEL entry gates while keeping\n   // the common authorization, daily-risk and broker safety checks above.\n   if(FlipLockModeEnabled())\n   {\n      FlipLockManage();\n      return;\n   }\n\n   // RACE starts only from a flat account. AUTO below is intentionally left\n   // untouched and never evaluates this branch unless engineMode=RACE.\n   if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)'''
)

# Call the FLIP manager on every timer, even immediately after a mode switch,
# so any broker-side FLIP pending order is removed outside FLIP_LOCK.
replace_once(
    ea,
    '''   // FLIP LOCK supplements AUTO V20 only and is a no-op in every other mode.\n   if(FlipLockModeEnabled())\n      FlipLockManage();''',
    '''   // FLIP LOCK V2 also owns cleanup.  Always call it so a mode switch\n   // cannot leave an orphan BUY STOP / SELL STOP at the broker.\n   FlipLockManage();'''
)

# Exact clip behaviour is one live position + one opposite STOP.  Rescue and
# money-profit exits would add/close positions behind the baton, so FLIP LOCK
# disables those features only while this control mode is active.  Switching
# away restores the normal rescue input and server profit mode on next settings.
replace_once(
    ea,
    '''   // FLIP LOCK is intentionally single-position to prevent accidental basket\n   // averaging while a baton-switch cycle is active.\n   if(g_controlMode == "FLIP_LOCK")\n      g_maxPositions = 1;''',
    '''   // FLIP LOCK V2 is intentionally single-position.  Its paired STOP\n   // order is the only reversal mechanism; AUTO rescue/profit exits stay out.\n   if(g_controlMode == "FLIP_LOCK")\n   {\n      g_maxPositions = 1;\n      g_rescueEnabled = false;\n      g_profitTargetMode = "OFF";\n   }\n   else\n      g_rescueEnabled = InpAdaptiveRescueEngine;'''
)

# EA removal/restart must never strand a real broker-side pending order.
replace_once(
    ea,
    '''void OnDeinit(const int reason)\n{\n   EventKillTimer();''',
    '''void OnDeinit(const int reason)\n{\n   FlipLockRemoveAllPending();\n   EventKillTimer();'''
)

# Continuous baton is intentionally not capped by an arbitrary flip count.
# Existing daily/basket risk protections remain the circuit breaker.
replace_once(
    flip,
    '#define FLIP_LOCK_MAX_FLIPS_PER_RUN 100\n',
    ''
)
replace_once(
    flip,
    '''   if(g_flipLockFlipCount>=FLIP_LOCK_MAX_FLIPS_PER_RUN)\n   {\n      FlipLockRemoveAllPending();\n      g_flipLockReason="MAX_FLIPS_REACHED";\n      g_executionStatus="FLIP_LOCK_MAX_FLIPS";\n      return;\n   }\n\n''',
    ''
)

# UI describes the actual live behaviour and stores OFF for money-profit exits
# in FLIP_LOCK only.  AUTO and PARALLEL_UNIVERSE keep their existing settings.
replace_once(
    web,
    'FLIP_LOCK:{title:"FLIP LOCK",subtitle:"เข้าแบบ AUTO แล้วล็อกกำไรด้วยเส้น Flip เสมือน เมื่อราคาย้อนถึงจุดล็อกจะปิดฝั่งเดิมก่อนสลับฝั่งใหม่"},',
    'FLIP_LOCK:{title:"FLIP LOCK",subtitle:"เปิดไม้แรกได้ทันที แล้ววาง Pending ฝั่งตรงข้ามที่ระดับเดียวกับ Stop ของไม้ปัจจุบัน จากนั้นเลื่อนตามราคาและสลับ BUY / SELL ต่อเนื่อง"},'
)
replace_once(
    web,
    '''    if (mode === "AUTO" || mode === "FLIP_LOCK" || mode === "PARALLEL_UNIVERSE") {\n      props.onEdit?.("profitTargetMode","AUTO");\n      props.onEdit?.("manualStopLossPoints",0);\n      if (mode === "FLIP_LOCK") props.onEdit?.("maxPositions",1);\n      return;\n    }''',
    '''    if (mode === "FLIP_LOCK") {\n      props.onEdit?.("profitTargetMode","OFF");\n      props.onEdit?.("manualStopLossPoints",0);\n      props.onEdit?.("maxPositions",1);\n      return;\n    }\n    if (mode === "AUTO" || mode === "PARALLEL_UNIVERSE") {\n      props.onEdit?.("profitTargetMode","AUTO");\n      props.onEdit?.("manualStopLossPoints",0);\n      return;\n    }'''
)

print("FLIP LOCK V2 clip-style isolated patch applied")
