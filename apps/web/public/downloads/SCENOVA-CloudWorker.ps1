# SCENOVA Cloud Worker v1.2.0 - Windows PowerShell 5.1 / Windows Server 2019.
# Install under the dedicated Windows account that will run the MT5 terminals.
param(
  [switch]$Install,
  [string]$ConfigPath = "C:\BotTrading\worker\config.json"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Protect-Directory([string]$Path) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner($identity)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($identity, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}

if ($Install) {
  $runner = Read-Host 'Runner ID from Cloud Console'
  if ($runner -notmatch '^[a-zA-Z0-9_-]{3,80}$') { throw 'Invalid Runner ID' }
  $apiBase = (Read-Host 'API base URL (example: https://snvea-bot.online/backend)').TrimEnd('/')
  $parsed = [uri]$apiBase
  if ($parsed.Scheme -ne 'https' -or $parsed.UserInfo -or $parsed.Query -or $parsed.Fragment) { throw 'HTTPS API base URL required' }
  $secret = Read-Host 'Worker Key (hidden)' -AsSecureString
  $root = 'C:\BotTrading'
  foreach ($folder in @($root,"$root\worker","$root\instances","$root\template")) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
  }
  Protect-Directory $root
  $config = @{ RunnerId=$runner; ApiBase=$apiBase; Root=$root; Key=($secret | ConvertFrom-SecureString) }
  $config | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
  $scriptTarget = "$root\worker\SCENOVA-CloudWorker.ps1"
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($scriptTarget)) { Copy-Item -LiteralPath $PSCommandPath -Destination $scriptTarget -Force }
  $verified = Read-Host 'Fresh MT5 template has EX5, API WebRequest and passed a Demo connection test? Type YES to mark ready'
  if ($verified -ceq 'YES') { Set-Content -LiteralPath "$root\template\cloud-template.ready" -Value 'Verified by operator' }
  $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptTarget`" -ConfigPath `"$ConfigPath`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
  $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  $taskName = 'SCENOVA-CloudWorker-' + $runner
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host 'Worker installed. Keep this Windows account logged in. Check Cloud Console before enabling new customers.'
  exit
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if (([uri]$config.ApiBase).Scheme -ne 'https') { throw 'HTTPS required' }
$secureKey = $config.Key | ConvertTo-SecureString
$plainKey = (New-Object Net.NetworkCredential('', $secureKey)).Password
$headers = @{ 'x-worker-key'=$plainKey }
$rootPath = [IO.Path]::GetFullPath([string]$config.Root).TrimEnd('\')
if ($rootPath -ne 'C:\BotTrading') { throw 'Unexpected worker root' }
$instancesPath = "$rootPath\instances"
$templatePath = "$rootPath\template"
$mutex = New-Object Threading.Mutex($false, 'Local\SCENOVA-CloudWorker')
if (!$mutex.WaitOne(0)) { exit }
$retryAfter = @{}

function Invoke-Worker([string]$Route, [hashtable]$Payload) {
  $Payload.runnerId = $config.RunnerId
  Invoke-RestMethod -Method Post -Uri ($config.ApiBase + '/api/worker/' + $Route) -Headers $headers -ContentType 'application/json' -Body ($Payload | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 15
}
function Safe-IniValue($Value) {
  $result = [string]$Value
  if ($result -match '[\r\n\x00]') { throw 'Invalid configuration value' }
  return $result
}
function Get-InstancePath([string]$InstanceId) {
  if ($InstanceId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Invalid instance ID' }
  $path = [IO.Path]::GetFullPath((Join-Path $instancesPath $InstanceId))
  if (!$path.StartsWith($instancesPath+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid instance path' }
  return $path
}
function Get-ExactTerminalProcesses([string]$TerminalPath) {
  return @(Get-CimInstance Win32_Process -Filter "name='terminal64.exe'" | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.Equals($TerminalPath, [StringComparison]::OrdinalIgnoreCase)
  })
}
function Stop-CloudInstance([string]$InstanceId) {
  $path = Get-InstancePath $InstanceId
  $terminal = "$path\terminal64.exe"
  $processes = Get-ExactTerminalProcesses $terminal
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-ExactTerminalProcesses $terminal).Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return (Get-ExactTerminalProcesses $terminal).Count -eq 0
}
function Process-WorkerCommand($Command) {
  if (!$Command) { return }
  if ([string]$Command.name -ne 'STOP_INSTANCE') { return }

  $result = 'STOP_FAILED'
  $errorCode = 'STOP_FAILED'
  try {
    if (Stop-CloudInstance ([string]$Command.instanceId)) {
      $result = 'STOP_CONFIRMED'
      $errorCode = ''
    } else {
      $errorCode = 'PROCESS_STILL_RUNNING'
    }
  } catch {
    $result = 'STOP_FAILED'
    $errorCode = 'STOP_FAILED'
  }

  Invoke-Worker 'command-result' @{
    commandId=[int64]$Command.id
    instanceId=[string]$Command.instanceId
    executionGeneration=[int64]$Command.executionGeneration
    result=$result
    errorCode=$errorCode
  } | Out-Null
}
function Request-RecoveryAuthorization($Job) {
  return Invoke-Worker 'recovery-check' @{
    instanceId=[string]$Job.instanceId
    executionGeneration=[int64]$Job.executionGeneration
  }
}
function Report-RecoveryResult($Job, [string]$Result, [string]$ErrorCode='') {
  Invoke-Worker 'recovery-result' @{
    instanceId=[string]$Job.instanceId
    executionGeneration=[int64]$Job.executionGeneration
    result=$Result
    errorCode=$ErrorCode
  } | Out-Null
}
function Start-CloudInstance($Job, $Processes) {
  if ([string]$Job.runtimeStopState -ne '' -and [string]$Job.runtimeStopState -ne 'NONE') { return }
  $path = Get-InstancePath $Job.instanceId
  $terminal = "$path\terminal64.exe"
  $running = @($Processes | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Equals($terminal,[StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
  if ($running) {
    if ($Job.eaOnline -and (Test-Path -LiteralPath "$path\cloud-start.ini")) { Remove-Item -LiteralPath "$path\cloud-start.ini" -Force }
    return
  }
  if ($retryAfter.ContainsKey($Job.instanceId) -and $retryAfter[$Job.instanceId] -gt [DateTime]::UtcNow) { return }
  $retryAfter[$Job.instanceId] = [DateTime]::UtcNow.AddSeconds(60)

  $alreadyProvisioned = Test-Path -LiteralPath "$path\cloud-provisioned"
  $recoveryAuthorized = $false
  if ($alreadyProvisioned) {
    try {
      $decision = Request-RecoveryAuthorization $Job
      if (!$decision.allow) { return }
      $recoveryAuthorized = $true
      # Re-check exact process after Server authorization. This is the duplicate-runtime guard.
      if ((Get-ExactTerminalProcesses $terminal).Count -gt 0) { return }
    } catch {
      return
    }
  }

  try {
    # Never mirror/delete existing account data. A failed initial copy is retried.
    if (!$alreadyProvisioned) {
      if (!$script:templateReady) { throw 'Template is not verified' }
      New-Item -ItemType Directory -Force -Path $path | Out-Null
      & robocopy.exe $templatePath $path /E /R:1 /W:1 /NFL /NDL /NJH /NJS /XF cloud-template.ready *> $null
      if ($LASTEXITCODE -ge 8) { throw 'Template copy failed' }
      Set-Content -LiteralPath "$path\cloud-provisioned" -Value '1'
    }
    if (!(Test-Path -LiteralPath $terminal) -or !(Test-Path -LiteralPath "$path\MQL5\Experts\FastBasketBot.ex5")) { throw 'Missing MT5 or EA' }
    $presetDir = "$path\MQL5\Presets"
    New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
    @("InpApiBase=$(Safe-IniValue $config.ApiBase)","InpInstanceId=$(Safe-IniValue $Job.instanceId)","InpInstallToken=$(Safe-IniValue $Job.installToken)") | Set-Content -LiteralPath "$presetDir\SCENOVA-Cloud.set" -Encoding Unicode
    $symbol = if ($Job.settings.symbol) { Safe-IniValue $Job.settings.symbol } else { 'XAUUSD' }
    @('[Common]',"Login=$(Safe-IniValue $Job.accountNumber)","Password=$(Safe-IniValue $Job.tradingPassword)","Server=$(Safe-IniValue $Job.brokerServer)",'KeepPrivate=1','NewsEnable=0',
      '[Charts]','MaxBars=5000','[Experts]','Enabled=1','AllowLiveTrading=1','AllowDllImport=0',
      '[StartUp]','Expert=FastBasketBot','ExpertParameters=SCENOVA-Cloud.set',"Symbol=$symbol",'Period=M5') | Set-Content -LiteralPath "$path\cloud-start.ini" -Encoding Unicode
    # Last exact-path check before spawn prevents a second terminal if another Worker loop recovered it.
    if ((Get-ExactTerminalProcesses $terminal).Count -eq 0) {
      Start-Process -FilePath $terminal -ArgumentList "/portable /config:`"$path\cloud-start.ini`"" -WorkingDirectory $path -WindowStyle Hidden | Out-Null
    }
    if ($recoveryAuthorized) { Report-RecoveryResult $Job 'STARTED' '' }
    Invoke-Worker 'provision-result' @{instanceId=$Job.instanceId;errorCode=''} | Out-Null
  } catch {
    if ($recoveryAuthorized) {
      try { Report-RecoveryResult $Job 'FAILED' 'RECOVERY_START_FAILED' } catch { }
    }
    Invoke-Worker 'provision-result' @{instanceId=$Job.instanceId;errorCode='CHECK_TEMPLATE_OR_TERMINAL'} | Out-Null
  }
}

try {
  while ($true) {
    try {
      $script:templateReady = (Test-Path -LiteralPath "$templatePath\terminal64.exe") -and (Test-Path -LiteralPath "$templatePath\MQL5\Experts\FastBasketBot.ex5") -and (Test-Path -LiteralPath "$templatePath\cloud-template.ready")
      $processes = @(Get-CimInstance Win32_Process -Filter "name='terminal64.exe'")
      $active = @($processes | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($instancesPath+'\',[StringComparison]::OrdinalIgnoreCase) }).Count
      $os = Get-CimInstance Win32_OperatingSystem
      $cpu = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
      $disk = Get-PSDrive -Name C
      Invoke-Worker 'heartbeat' @{hostname=$env:COMPUTERNAME;activeInstances=$active;telemetry=@{
        templateReady=$script:templateReady;version='1.2.0';cpuPercent=[math]::Round($cpu,1);
        ramTotalGb=[math]::Round($os.TotalVisibleMemorySize/1MB,1);ramUsedGb=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,1);
        diskFreeGb=[math]::Round($disk.Free/1GB,1);diskTotalGb=[math]::Round(($disk.Free+$disk.Used)/1GB,1)
      }} | Out-Null

      # Safety commands are processed before any provisioning/start work.
      $commandResponse = Invoke-Worker 'commands' @{}
      if ($commandResponse.command) { Process-WorkerCommand $commandResponse.command }

      # Refresh process data after a possible STOP_INSTANCE before considering starts.
      $processes = @(Get-CimInstance Win32_Process -Filter "name='terminal64.exe'")
      $assigned = Invoke-Worker 'assigned' @{}
      foreach ($job in $assigned.jobs) { Start-CloudInstance $job $processes }
      if ($script:templateReady) {
        $next = Invoke-Worker 'claim-next' @{}
        if ($next.job) { Start-CloudInstance $next.job $processes }
      }
    } catch {
      # MT5 continues to manage its positions during API/network outages.
      # Bounded status file; no secrets or raw HTTP responses.
      Set-Content -LiteralPath "$rootPath\worker\last-status.txt" -Value ('API_OR_WORKER_RETRY ' + [DateTime]::UtcNow.ToString('o'))
    }
    Start-Sleep -Seconds 10
  }
} finally { $mutex.ReleaseMutex();$mutex.Dispose() }
