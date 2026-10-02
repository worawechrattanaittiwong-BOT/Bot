$ErrorActionPreference = 'Stop'

$service = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/cloud-update.service.ts'))
$schema = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/cloud-schema.ts'))

function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}

Need $schema 'build_id varchar(64)' 'Fleet release schema must persist Build ID'
Need $schema 'target_build_id varchar(64)' 'Fleet instance update schema must persist target Build ID'
Need $schema 'previous_build_id varchar(64)' 'Fleet instance update schema must persist previous Build ID'
Need $schema 'ADD COLUMN IF NOT EXISTS target_build_id varchar(64)' 'Existing Fleet databases must migrate target Build ID'
Need $schema 'ADD COLUMN IF NOT EXISTS previous_build_id varchar(64)' 'Existing Fleet databases must migrate previous Build ID'

Need $service 'buildId: String(release.buildId || "").trim() || null' 'Production Fleet release must expose Build ID'
Need $service 'const installedBuildId = String(metrics?.buildId || "").trim();' 'Fleet current/outdated detection must read runtime Build ID'
Need $service 'const buildMatch = !targetBuildId || installedBuildId === targetBuildId;' 'Same-version Fleet release detection must compare Build ID'
Need $service "COALESCE(bi.metrics->>'buildId','') previous_build_id" 'Fleet update must snapshot the previous runtime Build ID'
Need $service 'version,sha256,runtime_contract,build_id,artifact_name,source_commit,artifact_bytes' 'Fleet release snapshot must persist target Build ID'
Need $service 'target_version,target_sha256,target_build_id,' 'Fleet jobs must persist target Build ID'
Need $service 'previous_version,previous_build_id,original_desired_state,state' 'Fleet update must persist previous Build ID'
Need $service 'item.previous_build_id' 'Rollback must target the Build ID that was running before the source update'
Need $service 'item.target_build_id' 'Rollback must retain the build it is rolling back from'
Need $service 'const targetBuildId = String(row.target_build_id || "").trim();' 'Fleet verification must read the target Build ID'
Need $service 'runtimeBuildId === targetBuildId' 'Fleet verification must confirm the loaded MT5 Build ID'
Need $service '!freshHeartbeat || !versionMatch || !buildMatch || !contractMatch' 'Fleet completion must require Build ID verification when available'

if ($service.Contains('current_release_completed')) {
  throw 'Historical completed UPDATE rows must not override live runtime identity after Rollback'
}

Write-Host 'Cloud rollback Build-ID verification contract PASS.'
