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
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid semantic release version for $label: $version" }
}

# EA runtime is strict and may advance independently from the Windows installer.
$ea = Read-Text 'mt5/FastBasketBot.mq5'
$eaRelease = Match-Version $ea '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"' 'EA property'
Assert-SemVer $eaRelease 'EA'
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_EA_VERSION\s+"([^"]+)"' 'EA runtime') $eaRelease 'EA runtime'
Assert-Equal (Match-Version $ea '#define\s+SCENOVA_PRODUCT_VERSION\s+"([^"]+)"' 'EA product') $eaRelease 'EA product'

$api = Read-Text 'apps/api/src/release-version.ts'
Assert-Equal (Match-Version $api 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"' 'API EA') $eaRelease 'API EA'

# Installer/Agent versioning is a separate compatible patch line. Keep all installer
# surfaces internally consistent without forcing every EA hotfix to rebuild Setup.
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

$web = Read-Text 'apps/web/components/Mt5ManualActionControls.tsx'
Assert-Equal (Match-Version $web 'installerVersionRequired\s*\|\|\s*"([^"]+)"' 'Web installer fallback') $installerRelease 'Web installer fallback'

Write-Host "SCENOVA release consistency PASS: EA=$eaRelease Installer=$installerRelease"
