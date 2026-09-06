param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$WebBase,
  [Parameter(Mandatory=$true)][string]$InstanceId,
  [Parameter(Mandatory=$true)][string]$InstallToken
)

$ErrorActionPreference = "Stop"
$SetupVersion = "1.2.6"

function Protect-CurrentUserSecret([string]$Value) {
  Add-Type -AssemblyName System.Security -ErrorAction Stop
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [System.Convert]::ToBase64String($protected)
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " SCENOVA MT5 BOT EA - Secure Installer $SetupVersion" -ForegroundColor Green
Write-Host " No administrator permission required" -ForegroundColor DarkGreen
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
$presetsDir = Join-Path $dataPath "MQL5\Presets"
$legacyProfilesPresetsDir = Join-Path $dataPath "MQL5\Profiles\Presets"
$legacyTesterDir = Join-Path $dataPath "MQL5\Profiles\Tester"
New-Item -ItemType Directory -Force -Path $expertsDir | Out-Null
New-Item -ItemType Directory -Force -Path $presetsDir | Out-Null

$eaBinary = Join-Path $expertsDir "FastBasketBot.ex5"
$artifactPayload = @{
  instanceId = $InstanceId
  installToken = $InstallToken
} | ConvertTo-Json -Compress

$metadataPayload = @{
  instanceId = $InstanceId
  installToken = $InstallToken
  agentVersion = "setup-$SetupVersion"
  terminalPath = $dataPath
  eaHash = ""
  hostname = $env:COMPUTERNAME
} | ConvertTo-Json -Compress

Write-Host "Checking protected SCENOVA EA release..."
$metadata = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/ea/agent-heartbeat" -ContentType "application/json" -Body $metadataPayload
if (-not $metadata.artifactAvailable -or -not $metadata.artifactHash) {
  throw "SCENOVA production EA artifact is not ready yet"
}

Write-Host "Downloading protected SCENOVA FastBasketBot.ex5..."
$tmpEa = Join-Path $env:TEMP "SCENOVA-FastBasketBot.ex5"
Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$ApiBase/api/ea/artifact" -ContentType "application/json" -Body $artifactPayload -OutFile $tmpEa
if (-not (Test-Path $tmpEa)) {
  throw "Compiled SCENOVA EA could not be downloaded"
}

$downloadedHash = (Get-FileHash -Algorithm SHA256 -Path $tmpEa).Hash.ToLowerInvariant()
$expectedHash = ([string]$metadata.artifactHash).ToLowerInvariant()
if ($downloadedHash -ne $expectedHash) {
  Remove-Item -Force $tmpEa -ErrorAction SilentlyContinue
  throw "SCENOVA EA integrity verification failed"
}

Move-Item -Force $tmpEa $eaBinary

$setPath = Join-Path $presetsDir "SCENOVA-FastBasketBot.set"

$legacyProfilesPresetPath = Join-Path $legacyProfilesPresetsDir "SCENOVA-FastBasketBot.set"
$legacyTesterPath = Join-Path $legacyTesterDir "SCENOVA-FastBasketBot.set"

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

# Remove presets created by older installer versions in incorrect locations.
foreach ($oldPreset in @($legacyProfilesPresetPath, $legacyTesterPath)) {
  if (Test-Path $oldPreset) {
    try { Remove-Item -Force $oldPreset } catch {}
  }
}

$programDir = Join-Path $env:LOCALAPPDATA "SCENOVA"
New-Item -ItemType Directory -Force -Path $programDir | Out-Null

$agentPath = Join-Path $programDir "SCENOVA-Agent.ps1"
Invoke-WebRequest -UseBasicParsing -Uri "$WebBase/downloads/SCENOVA-Agent.ps1" -OutFile $agentPath

$configPath = Join-Path $programDir "config.json"
$config = @{
  ApiBase = $ApiBase
  WebBase = $WebBase
  InstanceId = $InstanceId
  InstallTokenProtected = (Protect-CurrentUserSecret $InstallToken)
  TerminalDataPath = $dataPath
  EaBinaryPath = $eaBinary
  InstalledAt = (Get-Date).ToString("o")
} | ConvertTo-Json
Set-Content -Path $configPath -Value $config -Encoding UTF8

# Start the agent automatically for this Windows user without UAC/admin rights.
$startupDir = [Environment]::GetFolderPath("Startup")
$startupCmd = Join-Path $startupDir "SCENOVA-MT5-Agent.cmd"
$startupLine = 'start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $agentPath + '" -Loop'
Set-Content -Path $startupCmd -Value @("@echo off", $startupLine) -Encoding ASCII

Write-Host "Starting SCENOVA Agent..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath

$agentLoopArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $agentPath + '" -Loop'
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $agentLoopArgs

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " SCENOVA INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host " EA installed : FastBasketBot.ex5"
Write-Host " Source .mq5  : NOT installed on this PC"
Write-Host " Preset file  : $setPath"
Write-Host " Agent        : Installed for this Windows user"
Write-Host " Admin/UAC    : Not required"
Write-Host ""
Write-Host "Next steps in MT5:" -ForegroundColor Yellow
Write-Host " 1. Restart MT5, or refresh the Navigator."
Write-Host " 2. Open Tools > Options > Expert Advisors."
Write-Host "    Enable Allow WebRequest and add exactly: $ApiBase"
Write-Host " 3. Navigator > Expert Advisors > SCENOVA."
Write-Host "    Drag FastBasketBot onto the chart you want to trade."
Write-Host " 4. In the EA window, open Inputs > Load."
Write-Host "    Choose SCENOVA-FastBasketBot.set."
Write-Host "    The installer already placed it in MQL5\Presets."
Write-Host " 5. Click OK and enable Algo Trading in MT5."
Write-Host ""
Write-Host "When the EA connects, the SCENOVA website will update automatically." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close this window"
