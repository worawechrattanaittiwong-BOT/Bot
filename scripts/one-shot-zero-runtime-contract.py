from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8-sig")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8", newline="\n")


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match in {path}, found {count}")
    write(path, text.replace(old, new, 1))


# Every changed EA runtime gets a new runtime version. Main changed MQ5 after
# 1.0.11, so 1.0.12 is required to prevent stale in-memory MT5 code appearing current.
replace_once(
    "mt5/FastBasketBot.mq5",
    '#property version   "1.0.11"\n#define SCENOVA_EA_VERSION "1.0.11"\n#define SCENOVA_PRODUCT_VERSION "1.0.11"',
    '#property version   "1.0.12"\n#define SCENOVA_EA_VERSION "1.0.12"\n#define SCENOVA_PRODUCT_VERSION "1.0.12"\n#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LEVELS_1_30_V1"',
    "EA version/runtime contract",
)
replace_once(
    "apps/api/src/release-version.ts",
    'export const DEFAULT_EA_VERSION = "1.0.11";',
    'export const DEFAULT_EA_VERSION = "1.0.12";\nexport const EA_RUNTIME_CONTRACT = "ZERO_GRID_LEVELS_1_30_V1";\nexport const ZERO_GRID_MAX_LEVELS_PER_SIDE = 30;',
    "API EA version/runtime contract",
)

# Loaded-EA telemetry proves what MT5 is actually running, not merely which EX5
# happens to be present on disk.
old_market = r'''      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s,\"marketBid\":%s,\"marketAsk\":%s,\"marketMid\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false",
         marketBidText,
         marketAskText,
         marketMidText
      );'''
new_market = r'''      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s,\"marketBid\":%s,\"marketAsk\":%s,\"marketMid\":%s,\"runtimeContract\":\"%s\",\"zeroGridConfiguredLevelsPerSide\":%d,\"zeroGridEffectiveLevelsPerSide\":%d,\"zeroGridMaxLevelsPerSide\":%d,\"zeroGridCycleActive\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false",
         marketBidText,
         marketAskText,
         marketMidText,
         SCENOVA_RUNTIME_CONTRACT,
         g_zeroGridLevelsPerSide,
         ZeroGridEffectiveLevelsPerSide(),
         ZERO_GRID_MAX_LEVELS,
         g_zeroGridCycleStartedAt > 0 ? "true" : "false"
      );'''
replace_once("mt5/FastBasketBot.mq5", old_market, new_market, "EA loaded-runtime telemetry")

# Server release/update gate: version + on-disk hash + loaded runtime contract.
replace_once(
    "apps/api/src/bot.controller.ts",
    'import { installerDownloadPath, isEaVersionExact, isVersionExact, latestEaRelease, latestInstallerVersion } from "./release-version";',
    'import { EA_RUNTIME_CONTRACT, ZERO_GRID_MAX_LEVELS_PER_SIDE, installerDownloadPath, isEaVersionExact, isVersionExact, latestEaRelease, latestInstallerVersion } from "./release-version";',
    "BotController release imports",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    '''        eaVersionMatch: true,
        eaHashMatch: true,
        downloadPath: installerDownloadPath(latestVersion),''',
    '''        eaVersionMatch: true,
        eaHashMatch: true,
        currentRuntimeContract: null,
        requiredRuntimeContract: EA_RUNTIME_CONTRACT,
        runtimeContractMatch: true,
        downloadPath: installerDownloadPath(latestVersion),''',
    "Cloud/non-local software update state",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    '''    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase() || null;
    const latestEaHash = String(release.sha256 || "").trim().toLowerCase() || null;''',
    '''    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase() || null;
    const latestEaHash = String(release.sha256 || "").trim().toLowerCase() || null;
    const currentRuntimeContract = String(instance.metrics?.runtimeContract || "").trim() || null;
    const requiredRuntimeContract = EA_RUNTIME_CONTRACT;
    const runtimeContractMatch = currentRuntimeContract === requiredRuntimeContract;''',
    "Local runtime contract state",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    "    const eaUpdateRequired = !eaVersionMatch || !eaHashMatch;",
    "    const eaUpdateRequired = !eaVersionMatch || !eaHashMatch || !runtimeContractMatch;",
    "Runtime contract update requirement",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    '''    } else if (!latestEaHash) {
      reason = "Server ยังตรวจสอบ EX5 ล่าสุดไม่ได้ จึงยังไม่อนุญาตให้เริ่มบอท";''',
    '''    } else if (!runtimeContractMatch) {
      reason = currentRuntimeContract
        ? "EA ที่กำลังรันยังเป็น Runtime เก่า แม้ไฟล์ EX5 บนเครื่องอาจอัปเดตแล้ว กรุณากดอัปเดต EA และให้ MT5 รีโหลด Runtime ล่าสุด"
        : "ยังไม่ได้รับ Runtime Contract จาก EA ที่กำลังรัน กรุณาอัปเดต EA และให้ MT5 รีโหลดก่อนเริ่มบอท";
    } else if (!latestEaHash) {
      reason = "Server ยังตรวจสอบ EX5 ล่าสุดไม่ได้ จึงยังไม่อนุญาตให้เริ่มบอท";''',
    "Runtime contract mismatch reason",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    '''      eaVersionMatch,
      eaHashMatch,
      sourceCommit: release.sourceCommit,''',
    '''      eaVersionMatch,
      eaHashMatch,
      currentRuntimeContract,
      requiredRuntimeContract,
      runtimeContractMatch,
      sourceCommit: release.sourceCommit,''',
    "Runtime contract dashboard fields",
)
replace_once(
    "apps/api/src/bot.controller.ts",
    '          " · ต้องอัปเดตให้ Agent, EA Version และ EX5 Hash ตรงกันก่อน"',
    '          " · ต้องอัปเดตให้ Agent, EA Version, Runtime และ EX5 Hash ตรงกันก่อน"',
    "Start software update message",
)

# ZERO Start guard: saved count must match the count applied by the fresh loaded EA.
old_zero_start = '''      if (metrics.accountTradeExpert === false) {
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้ Expert Advisor เทรด");
      }

      const runningEaVersion = String(instance.metrics?.eaVersion || "");'''
new_zero_start = '''      if (metrics.accountTradeExpert === false) {
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้ Expert Advisor เทรด");
      }

      // ZERO GRID may start only after a fresh heartbeat proves that the loaded
      // EA has actually applied the saved per-side count. The first heartbeat
      // after Save receives the new settings; the next one confirms they are live.
      const settingRow = await this.db.one(
        "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
        [instance.id]
      );
      const savedSettings = settingRow?.settings || {};
      const savedControlMode = String(
        savedSettings.controlMode || savedSettings.engineMode || "AUTO"
      ).toUpperCase();
      if (savedControlMode === "ZERO_GRID") {
        const requestedRaw = Number(savedSettings.zeroGridLevelsPerSide ?? 3);
        const requestedLevels = Math.max(
          1,
          Math.min(
            ZERO_GRID_MAX_LEVELS_PER_SIDE,
            Math.trunc(Number.isFinite(requestedRaw) ? requestedRaw : 3)
          )
        );
        const appliedLevels = Number(metrics.zeroGridConfiguredLevelsPerSide);
        const appliedMax = Number(metrics.zeroGridMaxLevelsPerSide);
        const appliedMode = String(metrics.controlMode || "").toUpperCase();
        if (
          appliedMode !== "ZERO_GRID" ||
          !Number.isInteger(appliedLevels) ||
          appliedLevels !== requestedLevels ||
          appliedMax !== ZERO_GRID_MAX_LEVELS_PER_SIDE
        ) {
          throw new ConflictException(
            "ZERO GRID ยังไม่พร้อมเริ่ม: ตั้งไว้ " + requestedLevels +
            " Pending ต่อฝั่ง แต่ EA ที่กำลังรันยังไม่ยืนยันค่านี้ · กรุณารอ Heartbeat ถัดไป 5–10 วินาที แล้วกดเริ่มอีกครั้ง"
          );
        }
      }

      const runningEaVersion = String(instance.metrics?.eaVersion || "");'''
replace_once("apps/api/src/bot.controller.ts", old_zero_start, new_zero_start, "ZERO saved-vs-applied start guard")

# Dashboard: explain 1-30, show what loaded EA has actually applied, and surface
# stale in-memory runtime even when version/hash alone would look current.
replace_once(
    "apps/web/app/dashboard/page.tsx",
    '    ZERO_GRID:{title:"ZERO GRID",subtitle:"BUY STOP + SELL STOP · 3 ระดับต่อฝั่ง"},',
    '    ZERO_GRID:{title:"ZERO GRID",subtitle:"BUY STOP + SELL STOP · เลือกได้ 1–30 Pending ต่อฝั่ง"},',
    "ZERO mode copy",
)
replace_once(
    "apps/web/app/dashboard/page.tsx",
    '  const slLabel = controlMode === "MANUAL" ? Number(manualSl).toFixed(0)+" points" : "ATR × 2.00";',
    '''  const slLabel = controlMode === "MANUAL" ? Number(manualSl).toFixed(0)+" points" : "ATR × 2.00";
  const selectedZeroLevels = Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||3));
  const appliedZeroLevels = Number(props.metrics?.zeroGridConfiguredLevelsPerSide);
  const zeroGridSettingsSynced =
    controlMode === "ZERO_GRID" &&
    String(props.metrics?.controlMode || "").toUpperCase() === "ZERO_GRID" &&
    Number.isInteger(appliedZeroLevels) &&
    appliedZeroLevels === selectedZeroLevels &&
    Number(props.metrics?.zeroGridMaxLevelsPerSide) === 30;''',
    "ZERO applied status variables",
)
replace_once(
    "apps/web/app/dashboard/page.tsx",
    '<small>เลือกได้ 1–30 BUY STOP และ 1–30 SELL STOP</small>',
    '<small>{zeroGridSettingsSynced ? `EA รับค่าแล้ว: ${appliedZeroLevels} BUY + ${appliedZeroLevels} SELL` : `เลือกได้ 1–30 ต่อฝั่ง · หลังบันทึก รอ EA ยืนยัน ${selectedZeroLevels} ต่อฝั่งก่อน Start`}</small>',
    "ZERO applied status copy",
)
runtime_alert_marker = '''              {!softwareUpdate.eaHashMatch && (
                <div className="cc-update-alert-row">'''
runtime_alert_block = '''              {softwareUpdate.runtimeContractMatch === false && softwareUpdate.eaVersionMatch && softwareUpdate.eaHashMatch && (
                <div className="cc-update-alert-row">
                  <span className="cc-update-row-dot">!</span>
                  <div className="cc-update-row-copy">
                    <b>EA ใน MT5 ยังไม่ได้โหลด Runtime ล่าสุด</b>
                    <small>ไฟล์บนเครื่องอาจอัปเดตแล้ว แต่ MT5 ยังรัน Runtime เก่า · ต้องรีโหลด EA ก่อนเริ่มบอท</small>
                  </div>
                  <div className="cc-update-row-action">
                    <strong>{(state === "RUNNING" || desired === "RUNNING" || currentPositions > 0) ? "หยุดบอท และรอให้ออเดอร์เป็น 0" : "พร้อมรีโหลด EA Runtime ล่าสุด"}</strong>
                    <small>กดอัปเดต EA หนึ่งครั้ง ระบบจะตรวจไฟล์และรีสตาร์ท MT5 อย่างปลอดภัย</small>
                    <div id="scenova-ea-update-action-mount" />
                  </div>
                </div>
              )}

              {!softwareUpdate.eaHashMatch && (
                <div className="cc-update-alert-row">'''
replace_once("apps/web/app/dashboard/page.tsx", runtime_alert_marker, runtime_alert_block, "Loaded runtime dashboard alert")

# Permanent contract tests are added now; CI wiring is updated separately through
# the GitHub connector because Actions tokens cannot modify workflow files.
bump_test = r'''$ErrorActionPreference = 'Stop'

$parent = 'HEAD^'
$changed = git diff --name-only $parent HEAD -- mt5/FastBasketBot.mq5
if ($LASTEXITCODE -ne 0) { throw 'Unable to compare EA source with parent commit' }
if (-not $changed) {
  Write-Host 'EA version bump gate PASS: MQ5 source unchanged.'
  exit 0
}
$currentText = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$currentMatch = [regex]::Match($currentText, '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $currentMatch.Success) { throw 'Current EA version marker missing' }
$current = [version]$currentMatch.Groups[1].Value
$previousText = git show "$parent`:mt5/FastBasketBot.mq5"
if ($LASTEXITCODE -ne 0 -or -not $previousText) { throw 'Previous EA source/version unavailable; fetch-depth must be >= 2' }
$previousMatch = [regex]::Match(($previousText -join "`n"), '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $previousMatch.Success) { throw 'Previous EA version marker missing' }
$previous = [version]$previousMatch.Groups[1].Value
if ($current.CompareTo($previous) -le 0) {
  throw "mt5/FastBasketBot.mq5 changed but EA version did not increase: previous=$previous current=$current"
}
Write-Host "EA version bump gate PASS: $previous -> $current"
'''
write("tests/ea-version-bump-required.ps1", bump_test)

contract_test = r'''$ErrorActionPreference = 'Stop'
function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing contract source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Assert-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "ZERO runtime contract missing: $label" }
}
$mq5 = Read-Text 'mt5/FastBasketBot.mq5'
$apiRelease = Read-Text 'apps/api/src/release-version.ts'
$bot = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
Assert-Contains $mq5 '#define ZERO_GRID_MAX_LEVELS 30' 'EA max 30 per side'
Assert-Contains $mq5 'JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide)' 'EA consumes saved per-side levels'
Assert-Contains $mq5 'for(int level=2;level<=levels;level++)' 'EA stages deeper configured levels'
Assert-Contains $mq5 '#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LEVELS_1_30_V1"' 'EA loaded-runtime contract'
Assert-Contains $mq5 '\"runtimeContract\":\"%s\"' 'heartbeat runtime contract telemetry'
Assert-Contains $mq5 '\"zeroGridConfiguredLevelsPerSide\":%d' 'heartbeat configured ZERO levels telemetry'
Assert-Contains $mq5 '\"zeroGridEffectiveLevelsPerSide\":%d' 'heartbeat effective ZERO levels telemetry'
Assert-Contains $mq5 '\"zeroGridMaxLevelsPerSide\":%d' 'heartbeat max ZERO levels telemetry'
Assert-Contains $apiRelease 'EA_RUNTIME_CONTRACT = "ZERO_GRID_LEVELS_1_30_V1"' 'API required runtime contract'
Assert-Contains $apiRelease 'ZERO_GRID_MAX_LEVELS_PER_SIDE = 30' 'API ZERO max 30'
Assert-Contains $bot 'runtimeContractMatch = currentRuntimeContract === requiredRuntimeContract' 'API loaded-runtime verification'
Assert-Contains $bot 'appliedLevels !== requestedLevels' 'ZERO saved-vs-applied start guard'
Assert-Contains $bot 'appliedMode !== "ZERO_GRID"' 'ZERO mode applied guard'
Assert-Contains $web 'EA รับค่าแล้ว:' 'ZERO UI applied confirmation'
Assert-Contains $web 'เลือกได้ 1–30 Pending ต่อฝั่ง' 'ZERO UI 1-30 explanation'
Assert-Contains $web 'EA ใน MT5 ยังไม่ได้โหลด Runtime ล่าสุด' 'loaded-runtime update alert'
Write-Host 'ZERO GRID loaded-runtime contract PASS.'
'''
write("tests/zero-grid-runtime-contract.ps1", contract_test)

print("Guarded ZERO/runtime source patch prepared successfully")
