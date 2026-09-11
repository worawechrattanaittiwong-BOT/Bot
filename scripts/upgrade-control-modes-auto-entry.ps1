param(
  [Parameter(Mandatory = $false)]
  [string]$ApiPath = "apps/api/src/bot.controller.ts",
  [Parameter(Mandatory = $false)]
  [string]$WebPath = "apps/web/app/dashboard/page.tsx"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([ref]$textRef, [string]$old, [string]$new, [string]$label) {
  if ($textRef.Value.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $textRef.Value.Contains($old)) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Replace($old, $new)
  Write-Host "Applied $label"
}

function Insert-BeforeRequired([ref]$textRef, [string]$anchor, [string]$block, [string]$sentinel, [string]$label) {
  if ($textRef.Value.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $index = $textRef.Value.IndexOf($anchor, [System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Insert($index, $block + "`r`n")
  Write-Host "Applied $label"
}

# ---------------------------------------------------------------------------
# API: persist the visual/behavioral control mode independently from entryMode.
# entryMode remains the EA execution direction setting and is AUTO_MOMENTUM for
# every customer-facing control mode unless a future explicit override exists.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api

$controlModeBlock = @'
    if (body.controlMode !== undefined) {
      const controlMode = String(body.controlMode || "").toUpperCase();
      if (!["AUTO", "RACE", "ASSISTED", "MANUAL"].includes(controlMode)) {
        throw new BadRequestException("Control Mode ไม่ถูกต้อง");
      }
      clean.controlMode = controlMode;
    }

'@
Insert-BeforeRequired $apiRef '    if (body.engineMode !== undefined) {' $controlModeBlock 'body.controlMode !== undefined' 'persist independent controlMode'
Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# Web: every mode uses automatic BUY/SELL analysis. No mode forces BUY_ONLY or
# SELL_ONLY. controlMode is stored independently so Assisted/Manual remain
# visually distinct even though entryMode is AUTO_MOMENTUM in all modes.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web

Replace-Required $webRef @'
  indicatorV6Mode: "SOFT_WEIGHT",
  engineMode: "AUTO",
  entryMode: "AUTO_MOMENTUM"
};
'@ @'
  indicatorV6Mode: "SOFT_WEIGHT",
  controlMode: "AUTO",
  engineMode: "AUTO",
  entryMode: "AUTO_MOMENTUM"
};
'@ 'add controlMode default'

Replace-Required $webRef @'
  const hasManualExit = profitTargetMode === "MANUAL" || manualSl > 0;
  const controlMode = engineMode === "RACE" ? "RACE" : entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
  const profitKind = Number(props.settings?.perPositionProfitMoney || 0) > 0 ? "POSITION" : "BASKET";
'@ @'
  const hasManualExit = profitTargetMode === "MANUAL" || manualSl > 0;
  const inferredControlMode = engineMode === "RACE" ? "RACE" : entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
  const requestedControlMode = String(props.settings?.controlMode || inferredControlMode).toUpperCase();
  const controlMode = ["AUTO","RACE","ASSISTED","MANUAL"].includes(requestedControlMode)
    ? requestedControlMode
    : inferredControlMode;
  const profitKind = Number(props.settings?.perPositionProfitMoney || 0) > 0 ? "POSITION" : "BASKET";
'@ 'separate controlMode from entry direction'

Replace-Required $webRef @'
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"คุณกำหนดฝั่ง EA เลือกจุดเข้าและทางออก"},
    MANUAL:{title:"กำหนดเอง",subtitle:"คุณกำหนดฝั่ง จำนวน Lot เป้ากำไร และ SL"}
'@ @'
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"EA วิเคราะห์ BUY / SELL และเข้าไม้อัตโนมัติ คุณเลือกแนวทางบริหารรอบ"},
    MANUAL:{title:"กำหนดเอง",subtitle:"EA วิเคราะห์ BUY / SELL และเข้าไม้อัตโนมัติ คุณกำหนด Lot เป้ากำไร และ SL"}
'@ 'explain automatic direction in assisted/manual'

Replace-Required $webRef @'
  const applyControlMode = (mode:string) => {
    const fixedDirection = entryMode === "SELL_ONLY" ? "SELL_ONLY" : "BUY_ONLY";
    props.onEdit?.("confidenceGateEnabled",false);
    if (mode === "RACE") {
      props.onEdit?.("engineMode","RACE");
      props.onEdit?.("entryMode","AUTO_MOMENTUM");
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    props.onEdit?.("engineMode","AUTO");
    if (mode === "AUTO") {
      props.onEdit?.("entryMode","AUTO_MOMENTUM");
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    props.onEdit?.("entryMode",fixedDirection);
    if (mode === "ASSISTED") {
'@ @'
  const applyControlMode = (mode:string) => {
    props.onEdit?.("controlMode",mode);
    props.onEdit?.("confidenceGateEnabled",false);
    // Every customer-facing mode uses automatic BUY/SELL analysis. Direction
    // locking is not part of mode selection anymore.
    props.onEdit?.("entryMode","AUTO_MOMENTUM");
    if (mode === "RACE") {
      props.onEdit?.("engineMode","RACE");
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    props.onEdit?.("engineMode","AUTO");
    if (mode === "AUTO") {
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    if (mode === "ASSISTED") {
'@ 'make every mode auto-direction'

Replace-Required $webRef @'
                  {controlMode==="AUTO" ?
                    <div className="cc-bot-v2-field auto-value"><label><ScenovaIcon name="trend" size={17}/>ทิศทาง</label><strong>วิเคราะห์อัตโนมัติ</strong><small>M1 / M5 / M15 / M30 / H1</small></div> :
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ทิศทาง</span><select className="input" value={entryMode} onChange={e=>props.onEdit?.("entryMode",e.target.value)}><option value="BUY_ONLY">BUY เท่านั้น</option><option value="SELL_ONLY">SELL เท่านั้น</option></select></label>}
'@ @'
                  <div className="cc-bot-v2-field auto-value"><label><ScenovaIcon name="trend" size={17}/>ทิศทาง</label><strong>วิเคราะห์ BUY / SELL อัตโนมัติ</strong><small>M1 / M5 / M15 / M30 / H1 · ไม่ล็อกฝั่ง</small></div>
'@ 'remove BUY/SELL lock selector from every mode'

Write-Utf8 $WebPath $webRef.Value

# Contract checks.
$finalApi = Read-Utf8 $ApiPath
$finalWeb = Read-Utf8 $WebPath
foreach ($sentinel in @(
  'body.controlMode !== undefined',
  '["AUTO", "RACE", "ASSISTED", "MANUAL"]',
  'clean.controlMode = controlMode'
)) {
  if (-not $finalApi.Contains($sentinel)) { throw "API sentinel missing: $sentinel" }
}
foreach ($sentinel in @(
  'controlMode: "AUTO"',
  'props.onEdit?.("controlMode",mode)',
  'props.onEdit?.("entryMode","AUTO_MOMENTUM")',
  'วิเคราะห์ BUY / SELL อัตโนมัติ',
  'ไม่ล็อกฝั่ง'
)) {
  if (-not $finalWeb.Contains($sentinel)) { throw "Web sentinel missing: $sentinel" }
}
if ($finalWeb.Contains('props.onEdit?.("entryMode",fixedDirection)')) {
  throw "Legacy direction lock is still active"
}

Write-Host "Control modes now use automatic direction without BUY/SELL mode locking."
