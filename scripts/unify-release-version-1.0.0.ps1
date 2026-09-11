$ErrorActionPreference = 'Stop'

function Read-Utf8([string]$path) {
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Write-Utf8([string]$path,[string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path),$text,[System.Text.UTF8Encoding]::new($false))
}
function Replace-Required([ref]$text,[string]$old,[string]$new,[string]$label) {
  if (-not $text.Value.Contains($old)) { throw "Missing version-reset anchor: $label" }
  $text.Value = $text.Value.Replace($old,$new)
  Write-Host "Updated: $label"
}

# EA: release metadata only. No AUTO/RACE execution body is touched.
$eaPath = 'mt5/FastBasketBot.mq5'
$eaBefore = Read-Utf8 $eaPath
$ea = [ref]$eaBefore
Replace-Required $ea '#property version   "1.060"' '#property version   "1.0.0"' 'EA property version'
Replace-Required $ea '#define SCENOVA_EA_VERSION "1.060"' '#define SCENOVA_EA_VERSION "1.0.0"' 'EA runtime version'
Replace-Required $ea '#define SCENOVA_PRODUCT_VERSION "2.0.22"' '#define SCENOVA_PRODUCT_VERSION "1.0.0"' 'EA product version'
$eaAfter = $ea.Value
$eaReverse = $eaAfter.Replace('#property version   "1.0.0"','#property version   "1.060"').Replace('#define SCENOVA_EA_VERSION "1.0.0"','#define SCENOVA_EA_VERSION "1.060"').Replace('#define SCENOVA_PRODUCT_VERSION "1.0.0"','#define SCENOVA_PRODUCT_VERSION "2.0.22"')
if ($eaReverse -cne $eaBefore) { throw 'EA changed outside the three release metadata lines' }
Write-Utf8 $eaPath $eaAfter

# API: unify defaults and ignore stale pre-reset 3.x / 1.060 environment values.
$apiPath = 'apps/api/src/release-version.ts'
$apiText = [ref](Read-Utf8 $apiPath)
Replace-Required $apiText 'export const DEFAULT_INSTALLER_VERSION = "3.1.3";' 'export const DEFAULT_INSTALLER_VERSION = "1.0.0";' 'API installer default'
Replace-Required $apiText 'export const DEFAULT_EA_VERSION = "1.060";' 'export const DEFAULT_EA_VERSION = "1.0.0";' 'API EA default'
Replace-Required $apiText 'export const MIN_COMPATIBLE_INSTALLER_VERSION = "3.1.2";' 'export const MIN_COMPATIBLE_INSTALLER_VERSION = "1.0.0";' 'API minimum compatible installer'
Replace-Required $apiText 'if (configured && isVersionAtLeast(configured, DEFAULT_INSTALLER_VERSION)) {' 'if (configured && sameReleaseLine(configured, DEFAULT_INSTALLER_VERSION) && isVersionAtLeast(configured, DEFAULT_INSTALLER_VERSION)) {' 'ignore stale installer env override'

$versionFunctionAnchor = 'export function isVersionAtLeast(current: unknown, required: unknown) {'
$versionFunctionReplacement = @'
function sameReleaseLine(current: unknown, baseline: unknown) {
  const a = numericParts(current);
  const b = numericParts(baseline);
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

export function isVersionAtLeast(current: unknown, required: unknown) {
'@
Replace-Required $apiText $versionFunctionAnchor $versionFunctionReplacement 'same release-line helper'

$oldEaRelease = @'
  const eaVersion =
    String(process.env.SCENOVA_EA_VERSION || manifest.eaVersion || DEFAULT_EA_VERSION).trim() ||
    DEFAULT_EA_VERSION;
'@
$newEaRelease = @'
  const configuredEaVersion = String(process.env.SCENOVA_EA_VERSION || "").trim();
  const eaVersion = configuredEaVersion && sameReleaseLine(configuredEaVersion, DEFAULT_EA_VERSION)
    ? configuredEaVersion
    : String(manifest.eaVersion || DEFAULT_EA_VERSION).trim() || DEFAULT_EA_VERSION;
'@
Replace-Required $apiText $oldEaRelease $newEaRelease 'ignore stale EA env override'

$oldHashOrder = @'
      process.env.SCENOVA_EA_SHA256 ||
      actualArtifactHash() ||
      manifest.sha256 ||
'@
$newHashOrder = @'
      actualArtifactHash() ||
      manifest.sha256 ||
      process.env.SCENOVA_EA_SHA256 ||
'@
Replace-Required $apiText $oldHashOrder $newHashOrder 'prefer promoted artifact hash over stale env hash'
$apiText.Value = $apiText.Value.Replace('3.1.x','1.0.x').Replace('3.1 line','1.0 line').Replace('3.1.2 Agent','1.0.0 Agent').Replace('future 3.2.x','future 1.1.x')
Write-Utf8 $apiPath $apiText.Value

# Windows Installer + Agent.
$csprojPath = 'tools/windows-installer/ScenovaInstaller.csproj'
$csproj = [ref](Read-Utf8 $csprojPath)
Replace-Required $csproj '<Version>3.1.3</Version>' '<Version>1.0.0</Version>' 'installer package version'
Replace-Required $csproj '<FileVersion>3.1.3.0</FileVersion>' '<FileVersion>1.0.0.0</FileVersion>' 'installer file version'
Replace-Required $csproj '<AssemblyVersion>3.1.3.0</AssemblyVersion>' '<AssemblyVersion>1.0.0.0</AssemblyVersion>' 'installer assembly version'
Write-Utf8 $csprojPath $csproj.Value

$agentPath = 'tools/windows-installer/AgentBuildInfo.cs'
$agent = [ref](Read-Utf8 $agentPath)
Replace-Required $agent 'internal const string Version = "3.1.3";' 'internal const string Version = "1.0.0";' 'Agent version'
Write-Utf8 $agentPath $agent.Value

# Web fallback shown before dashboard release metadata arrives.
$webPath = 'apps/web/components/Mt5ManualActionControls.tsx'
$web = [ref](Read-Utf8 $webPath)
Replace-Required $web 'update?.installerVersionRequired || "3.1.3");' 'update?.installerVersionRequired || "1.0.0");' 'Web installer fallback'
Write-Utf8 $webPath $web.Value

# Permanent source-of-truth regression. The expected release is derived from
# the EA, so future 1.0.x releases only need to keep every active surface equal.
$testPath = 'tests/release-version-consistency.ps1'
$testContent = @'
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

$ea = Read-Text 'mt5/FastBasketBot.mq5'
$release = Match-Version $ea '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"' 'EA property'
if ($release -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid semantic release version: $release" }
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_EA_VERSION\s+"([^"]+)"' 'EA runtime') $release 'EA runtime'
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_PRODUCT_VERSION\s+"([^"]+)"' 'EA product') $release 'EA product'

$api = Read-Text 'apps/api/src/release-version.ts'
Assert-Equal (Match-Version $api 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"' 'API EA') $release 'API EA'
Assert-Equal (Match-Version $api 'DEFAULT_INSTALLER_VERSION\s*=\s*"([^"]+)"' 'API installer') $release 'API installer'

$agent = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'
Assert-Equal (Match-Version $agent 'Version\s*=\s*"([^"]+)"' 'Agent') $release 'Agent'

[xml]$project = Get-Content 'tools/windows-installer/ScenovaInstaller.csproj'
$projectVersion = [string]($project.Project.PropertyGroup.Version | Select-Object -First 1)
$fileVersion = [string]($project.Project.PropertyGroup.FileVersion | Select-Object -First 1)
$assemblyVersion = [string]($project.Project.PropertyGroup.AssemblyVersion | Select-Object -First 1)
Assert-Equal $projectVersion $release 'Installer project'
Assert-Equal $fileVersion "$release.0" 'Installer file'
Assert-Equal $assemblyVersion "$release.0" 'Installer assembly'

$web = Read-Text 'apps/web/components/Mt5ManualActionControls.tsx'
Assert-Equal (Match-Version $web 'installerVersionRequired\s*\|\|\s*"([^"]+)"' 'Web installer fallback') $release 'Web installer fallback'

Write-Host "Unified SCENOVA release version consistency PASS: $release"
'@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $testPath),$testContent,[System.Text.UTF8Encoding]::new($false))

$ciPath = '.github/workflows/ci.yml'
$ci = [ref](Read-Utf8 $ciPath)
$ciAnchor = '        run: ./tests/auto-v20-policy-regression.ps1'
$ciReplacement = @'
        run: ./tests/auto-v20-policy-regression.ps1
      - name: Unified release version consistency
        shell: pwsh
        run: ./tests/release-version-consistency.ps1
'@
Replace-Required $ci $ciAnchor $ciReplacement 'CI unified release consistency gate'
Write-Utf8 $ciPath $ci.Value

Write-Host 'Unified SCENOVA 1.0.0 source reset prepared successfully'
