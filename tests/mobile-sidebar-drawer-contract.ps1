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
Need $css 'Mobile role sidebar drawer' 'Mobile sidebar drawer CSS missing'
Need $css 'position:fixed' 'Mobile sidebar trigger/drawer fixed positioning missing'
Need $css 'max-height:min(84dvh,760px)' 'Mobile sidebar must remain scrollable inside phone viewport'
Need $css '.mobile-only.mobile-nav.owner-mobile-nav' 'Legacy horizontal mobile role menu hide rule missing'
Need $css 'display:none!important' 'Legacy horizontal mobile role menu must be hidden'
Write-Host 'SCENOVA mobile sidebar toggle drawer contract: PASS'
