param(
  [string]$ConfigPath = "$env:LOCALAPPDATA\SCENOVA\config.json",
  [switch]$Loop
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.2.1"
$BaseDir = Split-Path -Parent $ConfigPath
$LogPath = Join-Path $BaseDir "agent.log"

function Write-AgentLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Unprotect-CurrentUserSecret([string]$ProtectedValue) {
  Add-Type -AssemblyName System.Security -ErrorAction Stop
  $raw = [System.Convert]::FromBase64String($ProtectedValue)
  $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $raw,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [System.Text.Encoding]::UTF8.GetString($plain)
}

function Invoke-AgentCycle {
  try {
    if (-not (Test-Path $ConfigPath)) {
      throw "SCENOVA agent config not found: $ConfigPath"
    }

    $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
    $installToken = Unprotect-CurrentUserSecret ([string]$config.InstallTokenProtected)
    $eaPath = [string]$config.EaBinaryPath

    $localHash = ""
    if (Test-Path $eaPath) {
      $localHash = (Get-FileHash -Algorithm SHA256 -Path $eaPath).Hash.ToLowerInvariant()
    }

    $heartbeatPayload = @{
      instanceId = [string]$config.InstanceId
      installToken = $installToken
      agentVersion = $AgentVersion
      terminalPath = [string]$config.TerminalDataPath
      eaHash = $localHash
      hostname = $env:COMPUTERNAME
    } | ConvertTo-Json -Compress

    $heartbeat = Invoke-RestMethod -Method Post -Uri "$($config.ApiBase)/api/ea/agent-heartbeat" -ContentType "application/json" -Body $heartbeatPayload

    if ($heartbeat.artifactAvailable -and $heartbeat.artifactHash -and ([string]$heartbeat.artifactHash).ToLowerInvariant() -ne $localHash) {
      $tmp = Join-Path $env:TEMP "SCENOVA-FastBasketBot-update.ex5"
      $downloadPayload = @{
        instanceId = [string]$config.InstanceId
        installToken = $installToken
      } | ConvertTo-Json -Compress

      Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($config.ApiBase)/api/ea/artifact" -ContentType "application/json" -Body $downloadPayload -OutFile $tmp

      $downloadedHash = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLowerInvariant()
      $expectedHash = ([string]$heartbeat.artifactHash).ToLowerInvariant()
      if ($downloadedHash -ne $expectedHash) {
        Remove-Item -Force $tmp -ErrorAction SilentlyContinue
        throw "EA integrity check failed"
      }

      $backup = "$eaPath.bak"
      if (Test-Path $eaPath) {
        Copy-Item -Force $eaPath $backup
      }
      Move-Item -Force $tmp $eaPath
      $localHash = $downloadedHash
      Write-AgentLog "EA updated securely. hash=$localHash"
    }

    Write-AgentLog "Heartbeat OK. terminal=$($config.TerminalDataPath) hash=$localHash"
    return $true
  } catch {
    try { Write-AgentLog "ERROR: $($_.Exception.Message)" } catch {}
    return $false
  }
}

if ($Loop) {
  $createdNew = $false
  $mutexName = "Local\SCENOVA-MT5-Agent-" + $env:USERNAME
  $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
  if (-not $createdNew) {
    exit 0
  }

  try {
    while ($true) {
      [void](Invoke-AgentCycle)
      Start-Sleep -Seconds 900
    }
  } finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
  }
} else {
  if (-not (Invoke-AgentCycle)) {
    exit 1
  }
}
