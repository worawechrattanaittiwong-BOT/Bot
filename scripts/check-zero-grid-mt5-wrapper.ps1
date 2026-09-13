param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$temp = Join-Path $env:RUNNER_TEMP "zero-grid-patch-inputs"
New-Item -ItemType Directory -Force -Path $temp | Out-Null

function Copy-Normalized([string]$source,[string]$name) {
  $target = Join-Path $temp $name
  $text = [System.IO.File]::ReadAllText((Resolve-Path $source)).Replace("`r`n","`n")
  [System.IO.File]::WriteAllText($target,$text,[System.Text.UTF8Encoding]::new($false))
  return $target
}

$api = Copy-Normalized "apps/api/src/bot.controller.ts" "bot.controller.ts"
$web = Copy-Normalized "apps/web/app/dashboard/page.tsx" "page.tsx"
$build = Copy-Normalized ".github/workflows/build-mt5-ea.yml" "build-mt5-ea.yml"
$eaText = [System.IO.File]::ReadAllText((Resolve-Path $EaPath)).Replace("`r`n","`n")
[System.IO.File]::WriteAllText((Resolve-Path $EaPath),$eaText,[System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "upgrade-zero-grid-demo-v1.ps1") `
  -EaPath $EaPath `
  -ApiPath $api `
  -WebPath $web `
  -BuildWorkflowPath $build

if ($LASTEXITCODE -ne 0) { throw "ZERO GRID patcher failed" }
Write-Host "ZERO GRID MT5 source patched for compile validation."
