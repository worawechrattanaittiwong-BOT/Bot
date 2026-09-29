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
Need $sidebar 'owner-mobile-nav-trigger' 'Mobile sidebar toggle button missing'
Need $sidebar 'aria-expanded={open}' 'Mobile sidebar accessibility state missing'
Need $sidebar 'owner-mobile-drawer-backdrop' 'Mobile sidebar backdrop missing'
Need $sidebar 'owner-mobile-drawer' 'Mobile sidebar drawer missing'
Need $sidebar 'onClick={()=>setOpen(false)}' 'Mobile sidebar close interaction missing'
Need $sidebar 'setOpen(false);' 'Mobile sidebar must close after destination selection'
Need $sidebar 'items.filter(item=>item.section===section)' 'Mobile drawer must preserve role-based sidebar destinations'
Need $sidebar 'function goBack()' 'iPhone-friendly back control missing'
Need $sidebar 'window.history.back()' 'Back control must use browser history'
Need $sidebar 'function reloadSystem()' 'Mobile reload control missing'
Need $sidebar 'window.location.reload()' 'Reload control must refresh current system view'

Need $css 'Mobile role sidebar drawer' 'Mobile sidebar drawer CSS missing'
Need $css 'position:fixed' 'Mobile sidebar trigger/drawer fixed positioning missing'
Need $css 'left:12px' 'Mobile menu trigger must be on the left side'
Need $css 'height:100dvh' 'Left drawer must fill the phone viewport'
Need $css 'width:min(88vw,380px)' 'Left drawer width contract missing'
Need $css 'ownerMobileDrawerSlideIn' 'Left slide animation missing'
Need $css 'ownerMobileMenuPulse' 'Green pulsing menu affordance missing'
Need $css 'border:1px solid #36d98a' 'Green raised menu button styling missing'
Need $css '.owner-mobile-utility-button' 'Back/reload utility button styling missing'
Need $css '.mobile-only.mobile-nav.owner-mobile-nav' 'Legacy horizontal mobile role menu hide rule missing'
Need $css 'display:none!important' 'Legacy horizontal mobile role menu must be hidden'
Need $css 'Mobile left drawer final precedence guard' 'Final mobile drawer precedence guard missing'
Need $css 'position:fixed!important;' 'Mobile drawer trigger must remain fixed after later mobile CSS overrides'
Need $css 'z-index:3200!important;' 'Mobile drawer backdrop must stay above the mobile command dock'
Need $css 'top:calc(72px + env(safe-area-inset-top))!important;' 'Mobile navigation stack must stay visible below the iPhone header'
Write-Host 'SCENOVA mobile left-sidebar + iPhone controls contract: PASS'
