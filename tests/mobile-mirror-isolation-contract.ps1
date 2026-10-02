$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
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
$sender = Read-Text 'apps/web/app/mobile-mirror/[token]/page.tsx'
$layout = Read-Text 'apps/web/app/layout.tsx'
$package = Read-Text 'apps/web/package.json'

Need $module 'MobileMirrorController' 'Mobile Mirror controller must be registered independently'
Need $layout '<MobileMirrorOverlay />' 'Mobile Mirror overlay must be mounted without editing the Dashboard page'
Need $package '"qrcode"' 'QR rendering must stay local to the web app'

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
Forbid $api 'settings' 'Mobile Mirror must not mutate bot settings'
Forbid $api 'trade_journal' 'Mobile Mirror must not touch trading journals'

# The dashboard surface stays intentionally tiny: connect button -> QR -> floating card.
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

# Phone side sends only screen video. No audio, remote control, camera or notification subsystem.
Need $sender 'getDisplayMedia' 'Phone screen capture entry point missing'
Need $sender 'audio: false' 'Mobile Mirror must not capture phone audio'
Need $sender 'peer.addTrack(track, stream)' 'Phone WebRTC video publishing missing'
Need $sender 'เริ่มแชร์หน้าจอ' 'Phone share action missing'
Forbid $sender 'getUserMedia' 'Mobile Mirror must not request camera/microphone media'
Forbid $sender 'Notification' 'Mobile Mirror must not add notification-management scope'
Forbid $sender 'clipboard' 'Mobile Mirror must not add remote-control clipboard scope'

Write-Host 'Mobile Mirror isolated QR + WebRTC floating-card contract PASS'
