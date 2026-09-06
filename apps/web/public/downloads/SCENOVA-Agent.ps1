param(
  [string]$ConfigPath = "$env:ProgramData\SCENOVA\config.json"
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.0.0"
$BaseDir = Split-Path -Parent $ConfigPath
$LogPath = Join-Path $BaseDir "agent.log"

function Write-AgentLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Compile-Ea($Config) {
  if (-not $Config.MetaEditorPath) { return $false }
  if (-not (Test-Path $Config.MetaEditorPath)) { return $false }
  if (-not (Test-Path $Config.EaSourcePath)) { return $false }

  $compileLog = Join-Path $BaseDir "metaeditor-compile.log"
  $args = "/compile:`"$($Config.EaSourcePath)`" /log:`"$compileLog`""
  $p = Start-Process -FilePath $Config.MetaEditorPath -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
  $ex5 = [System.IO.Path]::ChangeExtension([string]$Config.EaSourcePath, ".ex5")
  return (Test-Path $ex5)
}

try {
  if (-not (Test-Path $ConfigPath)) {
    throw "SCENOVA agent config not found: $ConfigPath"
  }

  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  $eaHash = ""
  if (Test-Path $config.EaSourcePath) {
    $eaHash = (Get-FileHash -Algorithm SHA256 -Path $config.EaSourcePath).Hash.ToLowerInvariant()
  }

  # Check for a newer EA source. If content changed, replace and compile it.
  try {
    $tmp = Join-Path $env:TEMP "SCENOVA-FastBasketBot-latest.mq5"
    Invoke-WebRequest -UseBasicParsing -Uri "$($config.WebBase)/downloads/FastBasketBot.mq5" -OutFile $tmp
    $remoteHash = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLowerInvariant()
    if ($remoteHash -and $remoteHash -ne $eaHash) {
      Copy-Item -Force $tmp $config.EaSourcePath
      $compiled = Compile-Ea $config
      $eaHash = $remoteHash
      Write-AgentLog "EA updated. compile=$compiled hash=$eaHash"
    }
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  } catch {
    Write-AgentLog "EA update check skipped: $($_.Exception.Message)"
  }

  $payload = @{
    instanceId = [string]$config.InstanceId
    installToken = [string]$config.InstallToken
    agentVersion = $AgentVersion
    terminalPath = [string]$config.TerminalDataPath
    eaHash = $eaHash
    hostname = $env:COMPUTERNAME
  } | ConvertTo-Json -Compress

  Invoke-RestMethod -Method Post -Uri "$($config.ApiBase)/api/ea/agent-heartbeat" -ContentType "application/json" -Body $payload | Out-Null
  Write-AgentLog "Heartbeat OK. terminal=$($config.TerminalDataPath)"
} catch {
  try { Write-AgentLog "ERROR: $($_.Exception.Message)" } catch {}
  exit 1
}
