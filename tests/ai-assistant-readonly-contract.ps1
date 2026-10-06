$ErrorActionPreference = "Stop"

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

function Assert-Contains([string]$text, [string]$needle, [string]$message) {
  if (-not $text.Contains($needle)) { Fail $message }
}

$controller = Get-Content "apps/api/src/ai-assistant/ai-assistant.controller.ts" -Raw
$service = Get-Content "apps/api/src/ai-assistant/ai-assistant.service.ts" -Raw
$context = Get-Content "apps/api/src/ai-assistant/ai-context.service.ts" -Raw
$safety = Get-Content "apps/api/src/ai-assistant/ai-safety.service.ts" -Raw
$provider = Get-Content "apps/api/src/ai-assistant/ai-provider.service.ts" -Raw
$store = Get-Content "apps/api/src/ai-assistant/ai-store.service.ts" -Raw
$migration = Get-Content "database/068_ai_assistant.sql" -Raw
$mascot = Get-Content "apps/web/components/mascot/ScenovaMascotLauncher.tsx" -Raw
$panel = Get-Content "apps/web/components/ai/ScenovaAiPanel.tsx" -Raw
$dashboard = Get-Content "apps/web/app/dashboard/page.tsx" -Raw
$deploy = Get-Content "scripts/deploy-hostinger.sh" -Raw
$ownerSidebar = Get-Content "apps/web/components/OwnerSidebar.tsx" -Raw
$serviceLinks = Get-Content "apps/web/app/admin/service-links/page.tsx" -Raw
$credentialTester = Get-Content "apps/api/src/api-credential-tester.service.ts" -Raw

Assert-Contains $controller '@Controller("ai-assistant")' "AI assistant customer controller missing"
Assert-Contains $controller '@UseGuards(JwtGuard)' "AI assistant must require JWT"
Assert-Contains $controller '@Controller("admin/ai-assistant")' "AI assistant admin controller missing"
Assert-Contains $controller '@UseGuards(AdminGuard)' "AI admin endpoints must require AdminGuard"

Assert-Contains $migration "CREATE TABLE IF NOT EXISTS ai_conversations" "AI conversations migration missing"
Assert-Contains $migration "CREATE TABLE IF NOT EXISTS ai_messages" "AI messages migration missing"
Assert-Contains $migration "CREATE TABLE IF NOT EXISTS ai_knowledge_articles" "AI knowledge migration missing"
Assert-Contains $migration "CREATE TABLE IF NOT EXISTS ai_usage_daily" "AI usage migration missing"
Assert-Contains $migration "CREATE TABLE IF NOT EXISTS ai_support_channels" "AI support channels migration missing"
Assert-Contains $migration "SET provider='INCEPTION', model='mercury-2.5'" "AI migration must upgrade generic provider defaults to Inception Mercury"
Assert-Contains $migration "provider='CUSTOM' AND btrim(model)=''" "AI migration must upgrade the legacy CUSTOM/blank default safely"
Assert-Contains $deploy "database/068_ai_assistant.sql" "Production deploy must apply AI assistant migration"

Assert-Contains $safety "READ-ONLY 100%" "AI safety policy must explicitly be read-only"
Assert-Contains $safety "ห้ามให้สัญญาณ BUY/SELL" "AI safety policy must block direct trading signals"
Assert-Contains $context "SAFE_SETTING_KEYS" "AI context must whitelist settings"
Assert-Contains $context "accountMasked" "AI context must mask MT5 account number"

$backendCombined = $controller + $service + $context + $safety + $provider + $store
$forbiddenBackend = @(
  "INSERT INTO bot_commands",
  "UPDATE bot_commands",
  "DELETE FROM bot_commands",
  "UPDATE bot_settings",
  "INSERT INTO bot_settings",
  "DELETE FROM bot_settings",
  "trade.Buy",
  "trade.Sell",
  "OrderSend",
  "CTrade"
)
foreach ($needle in $forbiddenBackend) {
  if ($backendCombined.Contains($needle)) {
    Fail ("AI assistant must not contain execution/trading write path: " + $needle)
  }
}

Assert-Contains $provider "SCENOVA_AI_API_KEY" "AI provider key must be server-side"
Assert-Contains $provider "SCENOVA_AI_BASE_URL" "AI provider base URL must be server-side"
Assert-Contains $provider "OPENAI_COMPATIBLE_CHAT" "Generic provider adapter missing compatible chat mode"
Assert-Contains $provider "GEMINI" "Generic provider adapter missing Gemini-style mode"
Assert-Contains $provider "https://api.inceptionlabs.ai/v1" "SCENOVA AI must default to Inception API base URL"
Assert-Contains $provider "mercury-2.5" "SCENOVA AI must default to Mercury 2.5"
Assert-Contains $provider 'payload.reasoning_effort = "low"' "Inception Mercury must use low reasoning effort so final content is not starved by reasoning tokens"
Assert-Contains $provider "Math.max(1000, maxOutputTokens)" "Inception Mercury must reserve enough output budget for a final answer"
Assert-Contains $store "normalizeSupportUrl" "Support contacts must normalize provider URLs before saving"
Assert-Contains $store 'url = "https://t.me/" + url.slice(1)' "Telegram @username must normalize to an HTTPS t.me URL"
Assert-Contains $serviceLinks "SCENOVA_AI_API_KEY" "Existing API & Service Links page must expose SCENOVA AI credential preset"
Assert-Contains $serviceLinks "AI Assistant Settings" "Existing API & Service Links page must expose AI assistant settings without adding a sidebar menu"
Assert-Contains $serviceLinks "ช่องทางติดต่อผู้พัฒนา" "Existing API & Service Links page must manage AI support contacts"
Assert-Contains $serviceLinks "/admin/ai-assistant/contacts" "Support contact editor must use isolated AI admin endpoint"
Assert-Contains $credentialTester "Inception Labs" "API credential tester must recognize Inception"
Assert-Contains $credentialTester "https://api.inceptionlabs.ai/v1/chat/completions" "Inception credential test must use the supported chat completion endpoint"
Assert-Contains $provider "ANTHROPIC" "Generic provider adapter missing Anthropic-style mode"

$webFiles = @(
  "apps/web/components/ai/ScenovaAiPanel.tsx",
  "apps/web/components/mascot/ScenovaMascotLauncher.tsx",
  "apps/web/app/dashboard/page.tsx"
)
foreach ($file in $webFiles) {
  $text = Get-Content $file -Raw
  if ($text.Contains("SCENOVA_AI_API_KEY") -or $text.Contains("OPENAI_API_KEY")) {
    Fail ("AI API key leaked into web source: " + $file)
  }
}

Assert-Contains $mascot "ถาม SCENOVA AI" "Mascot must expose SCENOVA AI entry"
Assert-Contains $mascot "เชื่อมต่อหน้าจอมือถือ" "Mobile Mirror entry must remain intact"
Assert-Contains $panel "AI เป็น Read-only" "AI panel must disclose read-only scope"
Assert-Contains $dashboard "scenova_ai_active_slot_id" "Dashboard must bridge active slot to read-only assistant"

if ($ownerSidebar.Contains("ai-assistant") -or $ownerSidebar.Contains("SCENOVA AI")) {
  Fail "AI assistant must not add a new sidebar menu in this phase"
}

Write-Host "SCENOVA AI assistant read-only contract passed"
