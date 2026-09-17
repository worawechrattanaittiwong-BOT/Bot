from pathlib import Path


def text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    current = p.read_text(encoding="utf-8")
    if new in current:
        return
    if old not in current:
        raise SystemExit(f"anchor missing in {path}: {old[:140]!r}")
    p.write_text(current.replace(old, new, 1), encoding="utf-8")


ea = "mt5/FastBasketBot.mq5"
web = "apps/web/app/dashboard/page.tsx"
release = "apps/api/src/release-version.ts"

# This branch already contains the clip-style FLIP LOCK V2 runtime.  Keep this
# patcher intentionally idempotent: validate the baseline, then apply only the
# missing Drawdown-disable state requested for FLIP LOCK.
ea_text = text(ea)
required_baseline = [
    'FLIP LOCK V2 owns its entry',
    'FlipLockManage();',
    'FlipLockRemoveAllPending();',
    '#property version   "1.0.25"',
]
for marker in required_baseline:
    if marker not in ea_text:
        raise SystemExit(f"FLIP LOCK V2 baseline missing: {marker}")

# Runtime hard-disable of Daily Profit Drawdown/Giveback for FLIP LOCK only.
if 'g_dailyProfitDrawdownPercent = 0.0;' not in ea_text:
    replace_once(
        ea,
        '''      g_maxPositions = 1;\n      g_rescueEnabled = false;\n      g_profitTargetMode = "OFF";\n   }\n   else\n      g_rescueEnabled = InpAdaptiveRescueEngine;''',
        '''      g_maxPositions = 1;\n      g_rescueEnabled = false;\n      g_profitTargetMode = "OFF";\n      g_dailyProfitContinueAfterTarget = false;\n      g_dailyProfitDrawdownPercent = 0.0;\n   }\n   else\n      g_rescueEnabled = InpAdaptiveRescueEngine;'''
    )

# The Run-On/giveback function must also have an explicit mode guard so stale
# persisted state cannot interrupt FLIP LOCK after a restart.
ea_text = text(ea)
if '!FlipLockModeEnabled() &&' not in ea_text:
    replace_once(
        ea,
        '''   bool continueAfterTarget =\n      g_dailyProfitContinueAfterTarget &&\n      g_dailyProfitDrawdownPercent > 0.0;''',
        '''   bool continueAfterTarget =\n      !FlipLockModeEnabled() &&\n      g_dailyProfitContinueAfterTarget &&\n      g_dailyProfitDrawdownPercent > 0.0;'''
    )

# UI: selecting FLIP LOCK stores no Drawdown state.  Other modes are untouched.
web_text = text(web)
if 'props.onEdit?.("dailyProfitDrawdownPercent",0);' not in web_text:
    replace_once(
        web,
        '''    if (mode === "FLIP_LOCK") {\n      props.onEdit?.("profitTargetMode","OFF");\n      props.onEdit?.("manualStopLossPoints",0);\n      props.onEdit?.("maxPositions",1);\n      return;\n    }''',
        '''    if (mode === "FLIP_LOCK") {\n      props.onEdit?.("profitTargetMode","OFF");\n      props.onEdit?.("manualStopLossPoints",0);\n      props.onEdit?.("maxPositions",1);\n      props.onEdit?.("dailyProfitContinueAfterTarget",false);\n      props.onEdit?.("dailyProfitDrawdownPercent",0);\n      return;\n    }'''
    )

# Release authority must stay aligned with the behavior-changing EA release.
release_text = text(release)
if 'DEFAULT_EA_VERSION = "1.0.25"' not in release_text:
    replace_once(
        release,
        'DEFAULT_EA_VERSION = "1.0.24"',
        'DEFAULT_EA_VERSION = "1.0.25"'
    )

print("FLIP LOCK V2 Drawdown-disable patch is current")
