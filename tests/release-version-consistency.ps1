$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing release source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Match-Version([string]$text,[string]$pattern,[string]$label) {
  $match = [regex]::Match($text,$pattern)
  if (-not $match.Success) { throw "Version marker missing: $label" }
  return $match.Groups[1].Value
}
function Assert-Equal([string]$actual,[string]$expected,[string]$label) {
  if ($actual -ne $expected) { throw "$label mismatch: expected=$expected actual=$actual" }
}
function Assert-SemVer([string]$version,[string]$label) {
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw ("Invalid semantic release version for {0}: {1}" -f $label,$version) }
}

# EA runtime is strict and may advance independently from the Windows installer.
$ea = Read-Text 'mt5/FastBasketBot.mq5'
$eaRelease = Match-Version $ea '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"' 'EA property'
Assert-SemVer $eaRelease 'EA'
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_EA_VERSION\s+"([^"]+)"' 'EA runtime') $eaRelease 'EA runtime'
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_PRODUCT_VERSION\s+"([^"]+)"' 'EA product') $eaRelease 'EA product'
$eaRuntimeContract = Match-Version $ea '#define\s+SCENOVA_RUNTIME_CONTRACT\s+"([^"]+)"' 'EA runtime contract'

$api = Read-Text 'apps/api/src/release-version.ts'
Assert-Equal (Match-Version $api 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"' 'API EA') $eaRelease 'API EA'
Assert-Equal (Match-Version $api 'EA_RUNTIME_CONTRACT\s*=\s*"([^"]+)"' 'API runtime contract') $eaRuntimeContract 'EA runtime contract'
foreach ($required in @('manifestBoundToArtifact','configuredVersionIsSafeFallback','manifestIntegrity','isVersionSame')) {
  if (-not $api.Contains($required)) { throw "Release integrity guard missing: $required" }
}

$manifestPath = 'mt5/release/manifest.json'
if (-not (Test-Path $manifestPath)) { throw "Missing release manifest: $manifestPath" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifestEaRelease = [string]$manifest.eaVersion
$manifestRuntimeContract = [string]$manifest.runtimeContract
Assert-SemVer $manifestEaRelease 'Manifest EA'

# The EX5/manifest is produced asynchronously by Build MT5 EA after a source
# commit. On that source commit only, the checked-in artifact may legitimately
# still describe the previous EA. CI must validate that the old artifact is
# internally intact while the dedicated Windows builder compiles/publishes the
# new version. Every commit that does NOT change EA source must have exact
# source/API/artifact version alignment.
$eaSourceChanged = $false
try {
  $changedEaPaths = @(
    git diff --name-only HEAD^ HEAD -- mt5/FastBasketBot.mq5 mt5/include 2>$null
  )
  if ($LASTEXITCODE -eq 0) {
    $eaSourceChanged = @($changedEaPaths | Where-Object { $_ -match '^mt5/(FastBasketBot\.mq5|include/)' }).Count -gt 0
  }
} catch {
  $eaSourceChanged = $false
}

$artifactMatchesSource =
  $manifestEaRelease -eq $eaRelease -and
  $manifestRuntimeContract -eq $eaRuntimeContract

if (-not $artifactMatchesSource) {
  if (-not $eaSourceChanged) {
    throw "EA artifact metadata is stale without an EA source change: source=$eaRelease manifest=$manifestEaRelease"
  }
  Write-Host "EA artifact publication pending for source commit: source=$eaRelease manifest=$manifestEaRelease"
}

$releaseHash = (Get-FileHash -Algorithm SHA256 'mt5/release/FastBasketBot.ex5').Hash.ToLowerInvariant()
$manifestHash = ([string]$manifest.sha256).ToLowerInvariant()
Assert-Equal $manifestHash $releaseHash 'Manifest EX5 hash'

# Installer/Agent versioning is a separate compatible patch line. Keep all installer
# executable/protocol surfaces internally consistent without forcing every EA hotfix
# to rebuild Setup.
$installerRelease = Match-Version $api 'DEFAULT_INSTALLER_VERSION\s*=\s*"([^"]+)"' 'API installer'
Assert-SemVer $installerRelease 'Installer'

$agent = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'
Assert-Equal (Match-Version $agent 'Version\s*=\s*"([^"]+)"' 'Agent') $installerRelease 'Agent'

[xml]$project = Get-Content 'tools/windows-installer/ScenovaInstaller.csproj'
$projectVersion = [string]($project.Project.PropertyGroup.Version | Select-Object -First 1)
$fileVersion = [string]($project.Project.PropertyGroup.FileVersion | Select-Object -First 1)
$assemblyVersion = [string]($project.Project.PropertyGroup.AssemblyVersion | Select-Object -First 1)
Assert-Equal $projectVersion $installerRelease 'Installer project'
Assert-Equal $fileVersion "$installerRelease.0" 'Installer file'
Assert-Equal $assemblyVersion "$installerRelease.0" 'Installer assembly'

# The dashboard string is only a disconnected-network fallback. Runtime release
# metadata from the API is authoritative, so the fallback may intentionally lag by
# one compatible patch while a new Setup artifact is being promoted.
$web = Read-Text 'apps/web/components/Mt5ManualActionControls.tsx'
$webFallback = Match-Version $web 'installerVersionRequired\s*\|\|\s*"([^"]+)"' 'Web installer fallback'
Assert-SemVer $webFallback 'Web installer fallback'

Write-Host "SCENOVA release consistency PASS: EA=$eaRelease Installer=$installerRelease WebFallback=$webFallback"
