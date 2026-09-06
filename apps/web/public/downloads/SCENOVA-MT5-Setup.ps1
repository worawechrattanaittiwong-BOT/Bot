param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$WebBase,
  [Parameter(Mandatory=$true)][string]$InstanceId,
  [Parameter(Mandatory=$true)][string]$InstallToken
)

$ErrorActionPreference = "Stop"
$SetupVersion = "1.0.0"

function Is-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Is-Administrator)) {
  Write-Host "SCENOVA requires Windows administrator permission for first-time installation." -ForegroundColor Yellow
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-ApiBase", "`"$ApiBase`"",
    "-WebBase", "`"$WebBase`"",
    "-InstanceId", "`"$InstanceId`"",
    "-InstallToken", "`"$InstallToken`""
  ) -join " "
  Start-Process powershell.exe -Verb RunAs -ArgumentList $args
  exit
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " SCENOVA MT5 BOT EA - Windows Installer $SetupVersion" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host ""

$terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"
if (-not (Test-Path $terminalRoot)) {
  throw "MetaTrader 5 data folder was not found. Please install and open MT5 at least once."
}

$terminals = @()
Get-ChildItem -Path $terminalRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $mql5 = Join-Path $_.FullName "MQL5"
  if (Test-Path $mql5) {
    $originFile = Join-Path $_.FullName "origin.txt"
    $origin = ""
    if (Test-Path $originFile) {
      try { $origin = (Get-Content -Raw -Path $originFile).Trim([char]0).Trim() } catch {}
    }
    $terminals += [pscustomobject]@{
      DataPath = $_.FullName
      Origin = $origin
      Name = $_.Name
    }
  }
}

if ($terminals.Count -eq 0) {
  throw "No MetaTrader 5 terminal data folder was detected. Open MT5 once and run this installer again."
}

$selected = $null
if ($terminals.Count -eq 1) {
  $selected = $terminals[0]
} else {
  Write-Host "Detected MetaTrader 5 installations:" -ForegroundColor Cyan
  for ($i=0; $i -lt $terminals.Count; $i++) {
    $display = if ($terminals[$i].Origin) { $terminals[$i].Origin } else { $terminals[$i].DataPath }
    Write-Host " [$($i+1)] $display"
  }

  do {
    $choice = Read-Host "Select the MT5 installation number"
    $number = 0
    $valid = [int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $terminals.Count
  } until ($valid)
  $selected = $terminals[$number-1]
}

$dataPath = $selected.DataPath
Write-Host "MT5 data folder: $dataPath" -ForegroundColor Green

$expertsDir = Join-Path $dataPath "MQL5\Experts\SCENOVA"
$profilesDir = Join-Path $dataPath "MQL5\Profiles\Tester"
New-Item -ItemType Directory -Force -Path $expertsDir | Out-Null
New-Item -ItemType Directory -Force -Path $profilesDir | Out-Null

$eaSource = Join-Path $expertsDir "FastBasketBot.mq5"
Write-Host "Downloading SCENOVA FastBasketBot EA..."
Invoke-WebRequest -UseBasicParsing -Uri "$WebBase/downloads/FastBasketBot.mq5" -OutFile $eaSource

$metaEditor = $null
if ($selected.Origin) {
  $originPath = $selected.Origin
  if (Test-Path $originPath -PathType Leaf) {
    $originPath = Split-Path -Parent $originPath
  }
  $candidate = Join-Path $originPath "metaeditor64.exe"
  if (Test-Path $candidate) { $metaEditor = $candidate }

  if (-not $metaEditor) {
    $candidate = Join-Path $originPath "MetaEditor64.exe"
    if (Test-Path $candidate) { $metaEditor = $candidate }
  }
}

$compiled = $false
if ($metaEditor) {
  Write-Host "Compiling EA with MetaEditor..."
  $compileLog = Join-Path $env:TEMP "SCENOVA-MetaEditor-compile.log"
  $compileArgs = "/compile:`"$eaSource`" /log:`"$compileLog`""
  Start-Process -FilePath $metaEditor -ArgumentList $compileArgs -Wait -WindowStyle Hidden | Out-Null
  $ex5Path = [System.IO.Path]::ChangeExtension($eaSource, ".ex5")
  $compiled = Test-Path $ex5Path
}

$setPath = Join-Path $profilesDir "SCENOVA-FastBasketBot.set"
$setLines = @(
  "InpApiBase=$ApiBase",
  "InpInstanceId=$InstanceId",
  "InpInstallToken=$InstallToken",
  "InpMagic=26090501",
  "InpLot=0.01",
  "InpMaxPositions=10",
  "InpBasketTriggerMoney=2",
  "InpBasketTrailMoney=0.5",
  "InpMaxBasketLossMoney=10",
  "InpDailyLossMoney=25",
  "InpMaxSpreadPoints=50",
  "InpMinOrderIntervalMs=300",
  "InpMaxOrdersPerMinute=120",
  "InpEntryMode=0",
  "InpMomentumTicks=20",
  "InpMomentumEntryPoints=8.0",
  "InpStrongFlowPoints=25.0",
  "InpFlowTrailBoost=0.60",
  "InpPauseOnManualTrade=true",
  "InpHeartbeatSeconds=3",
  "InpMaxOfflineLeaseSeconds=600"
)
Set-Content -Path $setPath -Value $setLines -Encoding UTF8

$programDir = Join-Path $env:ProgramData "SCENOVA"
New-Item -ItemType Directory -Force -Path $programDir | Out-Null
$agentPath = Join-Path $programDir "SCENOVA-Agent.ps1"
Invoke-WebRequest -UseBasicParsing -Uri "$WebBase/downloads/SCENOVA-Agent.ps1" -OutFile $agentPath

$configPath = Join-Path $programDir "config.json"
$config = @{
  ApiBase = $ApiBase
  WebBase = $WebBase
  InstanceId = $InstanceId
  InstallToken = $InstallToken
  TerminalDataPath = $dataPath
  EaSourcePath = $eaSource
  MetaEditorPath = $metaEditor
  InstalledAt = (Get-Date).ToString("o")
} | ConvertTo-Json
Set-Content -Path $configPath -Value $config -Encoding UTF8

# Restrict the configuration because it contains the local install token.
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $configPath /inheritance:r /grant:r "$identity:(F)" "SYSTEM:(F)" "Administrators:(F)" | Out-Null
} catch {}

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$agentPath`""
& schtasks.exe /Create /SC MINUTE /MO 15 /TN "SCENOVA MT5 Agent" /TR $taskCommand /RU SYSTEM /RL HIGHEST /F | Out-Null

Write-Host "Starting SCENOVA Agent..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " EA Source : $eaSource"
Write-Host " EA Compile: $(if($compiled){'SUCCESS'}else{'MANUAL COMPILE MAY BE REQUIRED'})"
Write-Host " Preset    : $setPath"
Write-Host " Agent     : Installed (checks every 15 minutes)"
Write-Host ""
Write-Host "Final MT5 steps:" -ForegroundColor Yellow
Write-Host " 1. MT5 > Tools > Options > Expert Advisors"
Write-Host " 2. Enable WebRequest and add: $WebBase"
Write-Host " 3. Navigator > Expert Advisors > SCENOVA > FastBasketBot"
Write-Host " 4. Attach EA to the chart, Inputs > Load > SCENOVA-FastBasketBot.set"
Write-Host " 5. Enable Algo Trading"
Write-Host ""
Read-Host "Press Enter to finish"
