$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}
function Forbid([string]$text,[string]$needle,[string]$message) {
  if ($text.Contains($needle)) { throw $message }
}

$api = Read-Text 'apps/api/src/mobile-mirror.controller.ts'
$module = Read-Text 'apps/api/src/app.module.ts'
$overlay = Read-Text 'apps/web/components/MobileMirrorOverlay.tsx'
$launcher = Read-Text 'apps/web/app/mobile-mirror/[token]/page.tsx'
$layout = Read-Text 'apps/web/app/layout.tsx'
$webPackage = Read-Text 'apps/web/package.json'
$mirrorApp = Read-Text 'apps/mobile-mirror/App.tsx'
$mirrorConfig = Read-Text 'apps/mobile-mirror/app.config.js'
$mirrorPackage = Read-Text 'apps/mobile-mirror/package.json'

Need $module 'MobileMirrorController' 'Mobile Mirror controller must be registered independently'
Need $layout '<MobileMirrorOverlay />' 'Mobile Mirror overlay must be mounted without editing the Dashboard page'
Need $webPackage '"qrcode"' 'QR rendering must stay local to the web app'

# Pairing/signaling is ephemeral and isolated: no trading DB/settings ownership.
Need $api 'const sessions = new Map<string, MirrorSession>();' 'Mirror sessions must remain isolated and ephemeral'
Need $api 'randomBytes(32).toString("hex")' 'Pairing token must be high entropy'
Need $api 'PAIR_TTL_MS = 2 * 60 * 1000' 'Pairing QR must expire quickly'
Need $api '@UseGuards(JwtGuard)' 'Dashboard session endpoints must require login'
Need $api '@Get("connect/:token")' 'Phone connection endpoint missing'
Need $api '@Post("connect/:token/offer")' 'Phone WebRTC offer endpoint missing'
Need $api '@Post("sessions/:id/answer")' 'Dashboard WebRTC answer endpoint missing'
Forbid $api 'DbService' 'Mobile Mirror must not read or write the trading database'
Forbid $api 'BotController' 'Mobile Mirror must not couple to BotController'
Forbid $api 'trade_journal' 'Mobile Mirror must not touch trading journals'

# Dashboard remains connect -> QR -> draggable/resizable floating card.
Need $overlay 'window.location.pathname === "/dashboard"' 'Mobile Mirror must render only on Dashboard'
Need $overlay 'QRCode.toDataURL' 'Dashboard QR generation missing'
Need $overlay '<video' 'Floating mirror card must render the remote video'
Need $overlay 'position:"fixed"' 'Mirror card must float independently of Dashboard layout'
Need $overlay 'onPointerDown={beginDrag}' 'Mirror card drag support missing'
Need $overlay 'onPointerDown={beginResize}' 'Mirror card resize support missing'
Need $overlay 'ตัดการเชื่อมต่อมือถือ' 'Mirror card close/disconnect control missing'
Need $overlay 'scenova_mobile_mirror_frame' 'Mirror card position/size persistence missing'
Forbid $overlay 'controlMode' 'Mirror overlay must not alter trading mode'
Forbid $overlay 'maxPositions' 'Mirror overlay must not alter trading limits'
Forbid $overlay 'profitTarget' 'Mirror overlay must not alter profit controls'

# QR landing page must launch the native companion, not browser getDisplayMedia.
Need $launcher 'scenova-mirror://connect?token=' 'QR page must deep-link to SCENOVA Mirror'
Need $launcher '/downloads/SCENOVA-Mirror.apk' 'Android fallback APK link missing'
Need $launcher 'ReplayKit' 'iOS native ReplayKit guidance missing'
Forbid $launcher 'getDisplayMedia' 'Mobile browser must not be used for screen capture'
Forbid $launcher 'RTCPeerConnection' 'Mobile browser must not own the WebRTC sender anymore'

# Companion must support Android MediaProjection + iOS ReplayKit, video only.
Need $mirrorPackage '"react-native-webrtc": "124.0.8"' 'Native WebRTC dependency missing'
Need $mirrorPackage '"@apirtc/expo-apirtc-options-plugin": "0.0.12"' 'Native Android/iOS screen-share config plugin missing'
Need $mirrorConfig 'enableMediaProjectionService: true' 'Android MediaProjection foreground service must be enabled'
Need $mirrorConfig 'enableVideoEffects: false' 'Mirror app must not add unrelated video effects'
Need $mirrorConfig 'bundleIdentifier: "com.scenova.mirror"' 'iOS Mirror bundle identifier missing'
Need $mirrorConfig 'package: "com.scenova.mirror"' 'Android Mirror package missing'
Need $mirrorApp 'ScreenCapturePickerView' 'iOS ReplayKit Broadcast picker missing'
Need $mirrorApp 'ScreenCapturePickerViewManager' 'iOS ReplayKit picker bridge missing'
Need $mirrorApp 'mediaDevices as any).getDisplayMedia' 'Native screen capture entry point missing'
Need $mirrorApp 'createConfigForDefaultDisplay: true' 'Android default-display MediaProjection config missing'
Need $mirrorApp 'audio: false' 'Mobile Mirror must not capture audio'
Need $mirrorApp 'peer.addTrack(track, stream)' 'Native WebRTC video publishing missing'
Need $mirrorApp 'scenova-mirror://connect' 'Native deep-link flow missing'
Forbid $mirrorApp 'getUserMedia' 'Mirror companion must not request camera/microphone media'
Forbid $mirrorApp 'BotController' 'Mirror companion must not couple to trading control'
Forbid $mirrorApp 'controlMode' 'Mirror companion must not mutate trading mode'
Forbid $mirrorApp 'maxPositions' 'Mirror companion must not mutate trading limits'

Write-Host 'Mobile Mirror native Android/iOS isolation contract PASS'
