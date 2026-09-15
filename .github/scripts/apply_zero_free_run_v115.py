from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once_or_assert(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 old occurrence, found {count}")
    return text.replace(old, new, 1)


def function_span(text: str, signature: str) -> tuple[int, int]:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"function not found: {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"opening brace not found: {signature}")
    depth = 0
    for index in range(brace, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise SystemExit(f"closing brace not found: {signature}")


def patch_function(text: str, signature: str, old: str, new: str, label: str) -> str:
    start, end = function_span(text, signature)
    block = text[start:end]
    if new in block:
        return text
    count = block.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 old occurrence inside {signature}, found {count}")
    block = block.replace(old, new, 1)
    return text[:start] + block + text[end:]


# ---------------------------------------------------------------------------
# EA 1.0.15: ZERO GRID free-run control isolation.
#
# Scope is intentionally narrow:
# - ZERO keeps explicit RUNNING/access, mode, broker, Hedging and settings gates.
# - ZERO no longer uses EntryLeaseValid() to decide whether it may stage/rearm.
# - AUTO/RACE retain EntryLeaseValid() unchanged.
# - Grid geometry, lot sizing, pending placement and profit-close logic are not
#   changed by this patch.
# ---------------------------------------------------------------------------
ea_path = "mt5/FastBasketBot.mq5"
ea = read(ea_path)

ea = replace_once_or_assert(
    ea,
    '#property version   "1.0.14"',
    '#property version   "1.0.15"',
    "EA property version",
)
ea = replace_once_or_assert(
    ea,
    '#define SCENOVA_EA_VERSION "1.0.14"',
    '#define SCENOVA_EA_VERSION "1.0.15"',
    "EA runtime version",
)
ea = replace_once_or_assert(
    ea,
    '#define SCENOVA_PRODUCT_VERSION "1.0.14"',
    '#define SCENOVA_PRODUCT_VERSION "1.0.15"',
    "EA product version",
)

ea = patch_function(
    ea,
    "bool StartZeroGridCycle()",
    '   if(g_state!=STATE_RUNNING || !g_access || (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))',
    '   // ZERO_GRID_FREE_RUN: heartbeat freshness must never delay a ZERO pending\n'
    '   // ladder. Explicit STOP/access revocation and broker permissions still apply.\n'
    '   if(g_state!=STATE_RUNNING || !g_access)',
    "ZERO Start cycle lease isolation",
)

ea = patch_function(
    ea,
    "bool ManageZeroGrid()",
    '''         bool canRearm=\n            ZeroGridModeEnabled() && ZeroGridHedgingAllowed() &&\n            g_state==STATE_RUNNING && g_access &&\n            (MQLInfoInteger(MQL_TESTER) || EntryLeaseValid());''',
    '''         bool canRearm=\n            ZeroGridModeEnabled() && ZeroGridHedgingAllowed() &&\n            g_state==STATE_RUNNING && g_access;''',
    "ZERO same-pass rearm lease isolation",
)

ea = patch_function(
    ea,
    "bool ManageZeroGrid()",
    '''   bool zeroControlReady =\n      g_state==STATE_RUNNING && g_access &&\n      (MQLInfoInteger(MQL_TESTER) || EntryLeaseValid());''',
    '''   bool zeroControlReady =\n      g_state==STATE_RUNNING && g_access;''',
    "ZERO active control lease isolation",
)

ea = patch_function(
    ea,
    "void OnTick()",
    '''   // New orders are allowed only while the website has very recently\n   // confirmed desiredState=RUNNING. Existing positions can still be managed.\n   if(!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid())''',
    '''   // AUTO/RACE keep the fresh-control entry lease. ZERO GRID is intentionally\n   // free-running once Server settings selected ZERO and explicit RUNNING/access hold.\n   if(!MQLInfoInteger(MQL_TESTER) && !ZeroGridModeEnabled() && !EntryLeaseValid())''',
    "OnTick ZERO lease bypass",
)

# Safety assertions: the lease must remain available globally and must still
# protect non-ZERO execution paths. Only ZERO's two functions may be lease-free.
start_begin, start_end = function_span(ea, "bool StartZeroGridCycle()")
manage_begin, manage_end = function_span(ea, "bool ManageZeroGrid()")
on_tick_begin, on_tick_end = function_span(ea, "void OnTick()")
start_block = ea[start_begin:start_end]
manage_block = ea[manage_begin:manage_end]
on_tick_block = ea[on_tick_begin:on_tick_end]

if "EntryLeaseValid()" in start_block:
    raise SystemExit("ZERO StartZeroGridCycle still contains EntryLeaseValid()")
if "EntryLeaseValid()" in manage_block:
    raise SystemExit("ZERO ManageZeroGrid still contains EntryLeaseValid()")
if 'if(!MQLInfoInteger(MQL_TESTER) && !ZeroGridModeEnabled() && !EntryLeaseValid())' not in on_tick_block:
    raise SystemExit("OnTick ZERO-specific lease bypass missing")
if "bool EntryLeaseValid()" not in ea or 'RACE_CONTROL_NOT_FRESH' not in ea:
    raise SystemExit("non-ZERO entry lease/control contract was unexpectedly removed")

write(ea_path, ea)


# ---------------------------------------------------------------------------
# Release metadata. EA releases are exact-version gated, so promote 1.0.15.
# The official MT5 build workflow reads the version dynamically from the MQ5;
# do not rewrite workflow metadata from this runtime patch.
# ---------------------------------------------------------------------------
release_path = "apps/api/src/release-version.ts"
release = read(release_path)
release = replace_once_or_assert(
    release,
    'export const DEFAULT_EA_VERSION = "1.0.14";',
    'export const DEFAULT_EA_VERSION = "1.0.15";',
    "API EA default version",
)
write(release_path, release)


# Existing ZERO regression tracks the promoted EA version.
close_test_path = "tests/zero-grid-close-geometry-contract.ps1"
close_test = read(close_test_path)
close_test = replace_once_or_assert(
    close_test,
    'Require-Contains $ea \'#property version   "1.0.14"\' \'EA version bump\'',
    'Require-Contains $ea \'#property version   "1.0.15"\' \'EA version bump\'',
    "ZERO close/geometry test version",
)
write(close_test_path, close_test)


# Dedicated textual regression: proves ZERO is lease-free while AUTO/RACE keep
# the shared lease mechanism. This intentionally does not alter trading logic.
free_run_test_path = Path("tests/zero-grid-free-run-contract.ps1")
free_run_test_path.write_text(r'''param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

function Get-FunctionBlock([string]$text,[string]$signature) {
  $start = $text.IndexOf($signature)
  if ($start -lt 0) { throw "Function not found: $signature" }
  $brace = $text.IndexOf("{", $start)
  if ($brace -lt 0) { throw "Opening brace not found: $signature" }
  $depth = 0
  for ($i = $brace; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($c -eq "{") { $depth++ }
    elseif ($c -eq "}") {
      $depth--
      if ($depth -eq 0) { return $text.Substring($start, $i - $start + 1) }
    }
  }
  throw "Closing brace not found: $signature"
}

$startZero = Get-FunctionBlock $ea "bool StartZeroGridCycle()"
$manageZero = Get-FunctionBlock $ea "bool ManageZeroGrid()"
$onTick = Get-FunctionBlock $ea "void OnTick()"

if ($startZero.Contains("EntryLeaseValid()")) {
  throw "ZERO Start cycle must not be gated by EntryLeaseValid()"
}
if ($manageZero.Contains("EntryLeaseValid()")) {
  throw "ZERO manage/rearm must not be gated by EntryLeaseValid()"
}
if (-not $startZero.Contains("ZERO_GRID_FREE_RUN")) {
  throw "ZERO free-run marker missing"
}
if (-not $onTick.Contains('!ZeroGridModeEnabled() && !EntryLeaseValid()')) {
  throw "OnTick must bypass the entry lease only for ZERO"
}
if (-not $ea.Contains("bool EntryLeaseValid()")) {
  throw "Shared EntryLeaseValid() must remain for non-ZERO modes"
}
if (-not $ea.Contains('g_executionStatus = "RACE_CONTROL_NOT_FRESH";')) {
  throw "RACE fresh-control guard must remain untouched"
}
if (-not $startZero.Contains("g_state!=STATE_RUNNING || !g_access")) {
  throw "ZERO must still obey explicit RUNNING/access control"
}
if (-not $manageZero.Contains("g_state==STATE_RUNNING && g_access")) {
  throw "ZERO manage/rearm must still obey explicit RUNNING/access control"
}

Write-Host "ZERO GRID free-run isolation contract: PASS"
''', encoding="utf-8")
