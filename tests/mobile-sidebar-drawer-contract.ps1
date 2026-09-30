$ErrorActionPreference="Stop"
function Read-Text([string]$path){
  if(-not(Test-Path $path)){throw "Missing source: $path"}
  [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message){
  if(-not $text.Contains($needle)){throw $message}
}

$sidebar=Read-Text 'apps/web/components/OwnerSidebar.tsx'
$css=Read-Text 'apps/web/app/globals.css'

Need $sidebar 'const [open, setOpen] = useState(false)' 'Mobile sidebar open/close state missing'
Need $sidebar 'owner-mobile-nav-trigger' 'Mobile menu button missing'
Need $sidebar 'aria-expanded={open}' 'Mobile sidebar accessibility state missing'
Need $sidebar 'owner-mobile-back-button' 'Back icon button missing'
Need $sidebar 'owner-mobile-reload-button' 'Reload icon button missing'
Need $sidebar 'owner-mobile-nav-right-actions' 'Right-side mobile actions missing'
Need $sidebar 'owner-mobile-drawer-backdrop' 'Mobile sidebar backdrop missing'
Need $sidebar 'owner-mobile-drawer' 'Mobile sidebar drawer missing'
Need $sidebar 'items.filter(item=>item.section===section)' 'Mobile drawer must preserve role-based destinations'
Need $sidebar 'function goBack()' 'Mobile back control missing'
Need $sidebar 'window.history.back()' 'Back control must use browser history'
Need $sidebar 'function reloadSystem()' 'Mobile reload control missing'
Need $sidebar 'window.location.reload()' 'Reload control must refresh current system view'
Need $sidebar 'owner-mobile-drawer-logout' 'Sign out must be inside the mobile menu'
Need $sidebar '<span>ออกจากระบบ</span>' 'Mobile sign-out label missing'
Need $sidebar 'onLogout();' 'Mobile menu sign out action missing'

Need $css 'Mobile Control Center navigation refinement' 'Final mobile navigation CSS missing'
Need $css 'justify-content:flex-end!important;' 'Mobile drawer must open from the right'
Need $css 'border-left:1px solid rgba(134,96,222,.52)!important;' 'Right drawer purple edge missing'
Need $css 'border-radius:24px 0 0 24px!important;' 'Right drawer shape missing'
Need $css 'ownerMobileDrawerSlideInRight' 'Right-slide animation missing'
Need $css 'border:1px solid #7657d8!important;' 'Purple menu button styling missing'
Need $css '.owner-mobile-back-button' 'Back icon styling missing'
Need $css '.owner-mobile-reload-button' 'Reload icon styling missing'
Need $css '.owner-mobile-drawer-logout' 'Bottom sign-out styling missing'
Need $css 'z-index:3200!important;' 'Mobile drawer backdrop must stay above the mobile command dock'
Need $css 'top:calc(72px + env(safe-area-inset-top))!important;' 'Mobile controls must remain below the phone header'

Write-Host 'SCENOVA mobile right-drawer + icon controls contract: PASS'
