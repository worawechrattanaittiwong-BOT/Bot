$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$service = Get-Content (Join-Path $root 'apps/api/src/mode-guide-video.service.ts') -Raw
$controller = Get-Content (Join-Path $root 'apps/api/src/mode-guide-video.controller.ts') -Raw
$module = Get-Content (Join-Path $root 'apps/api/src/app.module.ts') -Raw
$dashboard = Get-Content (Join-Path $root 'apps/web/app/dashboard/page.tsx') -Raw
$component = Get-Content (Join-Path $root 'apps/web/components/TradingModeGuideVideos.tsx') -Raw
$css = Get-Content (Join-Path $root 'apps/web/app/premium-dashboard.css') -Raw
$api = Get-Content (Join-Path $root 'apps/web/lib/api.ts') -Raw
$nextConfig = Get-Content (Join-Path $root 'apps/web/next.config.mjs') -Raw
$compose = Get-Content (Join-Path $root 'infrastructure/linux/docker-compose.hostinger.yml') -Raw
$nginx = Get-Content (Join-Path $root 'scripts/configure-domain.sh') -Raw
$deploy = Get-Content (Join-Path $root 'scripts/deploy-hostinger.sh') -Raw

function Assert-Contains([string]$Text,[string]$Needle,[string]$Message) {
  if (-not $Text.Contains($Needle)) { throw $Message }
}

foreach ($mode in @('AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL')) {
  Assert-Contains $service ("'" + $mode + "'") ("Mode guide video schema/service missing mode " + $mode)
}
Assert-Contains $service 'height <= width || width / height > 0.85' 'Server portrait-video guard missing'
Assert-Contains $service 'MAX_VIDEO_BYTES = 300 * 1024 * 1024' 'Server video size guard missing'
Assert-Contains $service 'mode_guide_videos' 'Mode guide video persistence table missing'

Assert-Contains $controller '@Post("upload")' 'Admin video upload endpoint missing'
Assert-Contains $controller 'FileInterceptor("video"' 'Multipart video upload interceptor missing'
Assert-Contains $controller '@Get(":id/content")' 'Video streaming endpoint missing'
Assert-Contains $controller 'Content-Range' 'HTTP range streaming support missing'
Assert-Contains $controller '@UseGuards(AdminGuard)' 'Admin video mutation guard missing'
Assert-Contains $controller '@UseGuards(JwtGuard)' 'Authenticated video catalog guard missing'

Assert-Contains $module 'ModeGuideVideoAdminController' 'Mode guide admin controller not registered'
Assert-Contains $module 'ModeGuideVideoController' 'Mode guide controller not registered'
Assert-Contains $module 'ModeGuideVideoService' 'Mode guide service not registered'

Assert-Contains $dashboard 'canManageGuideVideos={isOwner}' 'Dashboard must expose video manager only to Owner/Admin'
Assert-Contains $dashboard '<TradingModeGuideVideos' 'Trading Mode Guide video UI missing'

Assert-Contains $component 'type="file"' 'Inline admin file picker missing'
Assert-Contains $component 'accept="video/mp4,video/quicktime,video/webm,video/*"' 'Mobile video picker formats missing'
Assert-Contains $component 'inspectPortraitVideo' 'Client portrait validation missing'
Assert-Contains $component 'หน้านี้รองรับวิดีโอแนวตั้งเท่านั้น' 'Portrait-only admin feedback missing'
Assert-Contains $component 'ดูวิดีโอ' 'Customer watch-video action missing'
Assert-Contains $component 'playsInline' 'Mobile inline playback contract missing'
Assert-Contains $component 'cc-mode-guide-video-poster-video' 'Uploaded guide must render a real video cover'
Assert-Contains $component 'เล่นวิดีโอ ' 'Uploaded guide cover must be directly playable'
Assert-Contains $component '#t=0.1' 'Video cover must request an initial preview frame'
Assert-Contains $component 'cc-mode-guide-video-admin-close' 'Mobile video manager close control missing'
Assert-Contains $component 'ปิดการตั้งค่าวิดีโอ' 'Mobile video manager close accessibility label missing'

Assert-Contains $css 'aspect-ratio:9/16' 'Vertical 9:16 video player CSS missing'
Assert-Contains $css '.cc-bot-v2-embedded.is-locked .cc-bot-v2-body .cc-mode-guide-dialog input' 'Locked embedded settings must allow guide video inputs'
Assert-Contains $css 'z-index:12280;' 'Mobile video manager must layer above Trading Mode Guide'
Assert-Contains $css 'height:100dvh;' 'Mobile video manager must use the dynamic viewport'
Assert-Contains $css '@media(max-width:760px)' 'Trading Mode Guide mobile breakpoint missing'
Assert-Contains $css 'height:100dvh;' 'Trading Mode Guide must use the mobile dynamic viewport'
Assert-Contains $css 'scroll-snap-type:x proximity;' 'Trading Mode Guide tabs must remain swipeable on mobile'
Assert-Contains $css 'grid-template-areas:' 'Mobile video card must explicitly reserve an action row'
Assert-Contains $css '"actions actions"' 'Mobile video controls must span the full card width'
Assert-Contains $css 'grid-area:actions;' 'Mobile video action controls must participate in card layout'
Assert-Contains $css 'display:flex;' 'Mobile mode guide content must use non-collapsing flow'
Assert-Contains $css 'flex-direction:column;' 'Mobile mode guide content must stack cards vertically'
Assert-Contains $css 'min-height:154px;' 'Mobile video guide card must retain usable height'
Assert-Contains $css '.cc-mode-guide-video-poster-video' 'Uploaded video cover styling missing'
Assert-Contains $css 'object-fit:cover;' 'Uploaded video cover must fill its 9:16 frame'
Assert-Contains $css '.cc-mode-guide-video-admin' 'Inline admin video manager styling missing'
Assert-Contains $css 'body.cc-mode-guide-active .bps-launcher' 'Bot summary launcher must hide while the mode guide is open'
Assert-Contains $css 'body.cc-mode-guide-active .cc-mobile-mirror-launch' 'SCENOVA mascot must hide while the mode guide is open'
Assert-Contains $dashboard 'document.body.classList.add("cc-mode-guide-active")' 'Mode guide must mark the document while open'
Assert-Contains $api 'init.body instanceof FormData' 'Authenticated FormData support missing'
Assert-Contains $api 'API_UPLOAD_TIMEOUT_MS' 'Long video upload timeout missing'
Assert-Contains $nextConfig 'middlewareClientMaxBodySize: "320mb"' 'Next.js proxy must accept guide videos larger than the default 10 MB'

Assert-Contains $compose 'MODE_GUIDE_MEDIA_DIR: /data/scenova-mode-guide' 'Production media directory env missing'
Assert-Contains $compose 'mode_guide_media:/data/scenova-mode-guide' 'Persistent production video volume mount missing'
Assert-Contains $compose 'mode_guide_media:' 'Persistent production video volume declaration missing'
Assert-Contains $nginx 'client_max_body_size 320m;' 'Nginx upload allowance must support 300 MB guide videos'
Assert-Contains $deploy 'client_max_body_size 320m;' 'Production deploy must repair historical Nginx upload limits'

Write-Host 'Trading Mode Guide vertical video contract PASS'
