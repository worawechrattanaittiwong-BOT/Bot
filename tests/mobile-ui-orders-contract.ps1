$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$page=Read-Text 'apps/web/app/dashboard/page.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
Need $page 'id="live-orders"' 'M4 Open Orders anchor missing'
Need $page 'id="mobile-order-history"' 'M4 order history surface missing'
Need $page 'id="mobile-basket-history"' 'M4 basket history surface missing'
Need $page 'data.tradeJournal?.recent' 'M4 must reuse the existing trade journal data'
Need $page '.filter((row:any)=>String(row.event_type||"").toUpperCase()==="BASKET")' 'M4 basket filter missing'
Need $css 'SCENOVA Mobile UX Upgrade · M4' 'M4 styles missing'
Need $css '.scn-mobile-order-feed-row' 'M4 order card styles missing'
Need $css '.scn-mobile-basket-row' 'M4 basket card styles missing'
Write-Host 'SCENOVA mobile UI M4 orders/history/baskets contract: PASS'
