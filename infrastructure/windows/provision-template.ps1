param(
  [Parameter(Mandatory=$true)][string]$TemplateDir,
  [Parameter(Mandatory=$true)][string]$InstanceId,
  [string]$InstanceRoot = "C:\BotTrading\instances"
)

$ErrorActionPreference = "Stop"
$target = Join-Path $InstanceRoot $InstanceId

if (!(Test-Path $TemplateDir)) {
  throw "MT5 template directory not found"
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
robocopy $TemplateDir $target /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null

if ($LASTEXITCODE -ge 8) {
  throw "Failed to copy MT5 template"
}

$terminal = Join-Path $target "terminal64.exe"
$expert = Join-Path $target "MQL5\Experts\FastBasketBot.ex5"

if (!(Test-Path $terminal)) {
  throw "terminal64.exe is missing from the template"
}
if (!(Test-Path $expert)) {
  throw "FastBasketBot.ex5 is missing from the template"
}

Write-Host "MT5 instance prepared at $target"
Write-Host "Next: create the account startup config and EA preset through the secured Windows worker service."
