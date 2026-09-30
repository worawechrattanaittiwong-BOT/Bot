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
$performance=Read-Text 'apps/web/app/performance/page.tsx'
$performanceCss=Read-Text 'apps/web/app/performance/performance.module.css'

Need $sidebar 'const [open, setOpen] = useState(false)' 'Mobile sidebar open/close state missing'
Need $sidebar 'owner-mobile-nav-trigger' 'Mobile menu button missing'
Need $sidebar 'aria-expanded={open}' 'Mobile sidebar accessibility state missing'
Need $sidebar 'owner-mobile-back-button' 'Back icon button missing'
Need $sidebar 'owner-mobile-reload-button' 'Reload icon button missing'
Need $sidebar 'owner-mobile-nav-right-actions' 'Right-side mobile actions missing'
Need $sidebar 'owner-mobile-topbar-brand' 'Shared mobile Top Bar brand missing'
Need $sidebar 'owner-mobile-topbar-logo' 'Shared mobile SCENOVA logo missing'
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

Need $css 'Mobile app Top Bar · final precedence' 'Shared mobile Top Bar final CSS missing'
Need $css 'position:sticky!important;' 'Mobile controls must be a real sticky Top Bar instead of floating controls'
Need $css 'top:0!important;' 'Shared mobile Top Bar must sit at the top'
Need $css 'grid-template-columns:auto minmax(0,1fr) auto!important;' 'Shared mobile Top Bar three-part layout missing'
Need $css '.owner-mobile-topbar-brand' 'Shared Top Bar brand styling missing'
Need $css 'justify-content:flex-end!important;' 'Mobile menu drawer must open from the right'
Need $css 'border-left:1px solid rgba(134,96,222,.52)!important;' 'Right drawer purple edge missing'
Need $css 'border-radius:24px 0 0 24px!important;' 'Right drawer shape missing'
Need $css 'ownerMobileDrawerSlideInRight' 'Right-slide animation missing'
Need $css 'border:1px solid #7657d8!important;' 'Purple menu button styling missing'
Need $css '.owner-mobile-drawer-logout' 'Bottom sign-out styling missing'

Need $performance 'className={styles.mobileTopBar}' 'Performance mobile Top Bar missing'
Need $performance '<span>ตั้งค่า</span>' 'Performance mobile Settings button missing'
Need $performance 'className={styles.mobileTopbarBrand}' 'Performance mobile SCENOVA brand missing'
Need $performance 'className={styles.mobileTopbarClose}' 'Performance mobile close X missing'
Need $performance 'aria-label="ปิด Backtest และ Performance"' 'Performance close action accessibility label missing'
Need $performance 'function closePerformance()' 'Performance close action missing'
Need $performance 'id="performance-mobile-settings"' 'Performance left settings drawer id missing'

Need $performanceCss 'Performance mobile Top Bar · final' 'Performance mobile Top Bar CSS missing'
Need $performanceCss '.mobileTopBar{' 'Performance mobile Top Bar styling missing'
Need $performanceCss '.summaryShell>.optionsButton{' 'Legacy floating performance options button must be mobile-hidden'
Need $performanceCss 'transform:translateX(-100%)!important;' 'Performance settings must start off-screen on the left'
Need $performanceCss 'transform:translateX(0)!important;' 'Performance settings must slide in from the left'
Need $performanceCss 'border-right:1px solid rgba(125,92,222,.48)!important;' 'Performance left drawer edge styling missing'

Write-Host 'SCENOVA mobile Top Bar + drawers contract: PASS'
