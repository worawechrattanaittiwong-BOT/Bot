param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
$temp = Join-Path $env:RUNNER_TEMP "zero-grid-patch-inputs"
New-Item -ItemType Directory -Force -Path $temp | Out-Null

function To-Crlf([string]$text) {
  return $text.Replace("`r`n","`n").Replace("`n","`r`n")
}

function Copy-Normalized([string]$source,[string]$name) {
  $target = Join-Path $temp $name
  $text = To-Crlf ([System.IO.File]::ReadAllText((Resolve-Path $source)))
  [System.IO.File]::WriteAllText($target,$text,[System.Text.UTF8Encoding]::new($false))
  return $target
}

$api = Copy-Normalized "apps/api/src/bot.controller.ts" "bot.controller.ts"
$web = Copy-Normalized "apps/web/app/dashboard/page.tsx" "page.tsx"
$build = Copy-Normalized ".github/workflows/build-mt5-ea.yml" "build-mt5-ea.yml"
$eaText = To-Crlf ([System.IO.File]::ReadAllText((Resolve-Path $EaPath)))
[System.IO.File]::WriteAllText((Resolve-Path $EaPath),$eaText,[System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "upgrade-zero-grid-demo-v1.ps1") `
  -EaPath $EaPath `
  -ApiPath $api `
  -WebPath $web `
  -BuildWorkflowPath $build

# The patcher uses terminating exceptions with ErrorActionPreference=Stop.
# If execution reaches here, patch application completed successfully.
Write-Host "ZERO GRID MT5 source patched for compile validation."
