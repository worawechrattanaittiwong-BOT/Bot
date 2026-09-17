from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import json
import re

ROOT = Path('.')


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_required(text: str, old: str, new: str, label: str, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'missing expected pattern for {label}: {old!r}')
    return text.replace(old, new)


# Web: remove the mode from normalization, copy, selector and mode application.
web_path = 'apps/web/app/dashboard/page.tsx'
web = read(web_path)
web = replace_required(
    web,
    '["AUTO","FLIP_LOCK","PARALLEL_UNIVERSE","RACE","ZERO_GRID","MANUAL"]',
    '["AUTO","FLIP_LOCK","RACE","ZERO_GRID","MANUAL"]',
    'web control mode whitelist',
)
web = re.sub(
    r'\n\s*PARALLEL_UNIVERSE:\{title:"PARALLEL UNIVERSE",subtitle:"[^"]*"\},',
    '',
    web,
    count=1,
)
web = re.sub(
    r'\n\s*\{id:"PARALLEL_UNIVERSE",icon:"[^"]+",tag:"[^"]+"\},',
    '',
    web,
    count=1,
)
web = replace_required(
    web,
    'if (mode === "AUTO" || mode === "PARALLEL_UNIVERSE") {',
    'if (mode === "AUTO") {',
    'web AUTO mode branch',
)
# Older save helpers used a compact allowed-mode list. Remove it if still present.
web = web.replace('["AUTO","FLIP_LOCK","PARALLEL_UNIVERSE","MANUAL"]', '["AUTO","FLIP_LOCK","MANUAL"]')
web = web.replace('["AUTO", "FLIP_LOCK", "PARALLEL_UNIVERSE", "MANUAL"]', '["AUTO", "FLIP_LOCK", "MANUAL"]')
if 'PARALLEL_UNIVERSE' in web or 'PARALLEL UNIVERSE' in web:
    leftovers = [line for line in web.splitlines() if 'PARALLEL' in line][:20]
    raise SystemExit('web still contains Parallel Universe references:\n' + '\n'.join(leftovers))
write(web_path, web)

# API: stop accepting the removed control mode. Unknown/stale values will fall back
# through the existing settings normalization path instead of being selected anew.
api_path = 'apps/api/src/bot.controller.ts'
api = read(api_path)
api = replace_required(
    api,
    '["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "PARALLEL_UNIVERSE", "MANUAL"]',
    '["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "MANUAL"]',
    'API control mode enum',
)
api = api.replace('["AUTO","RACE","ZERO_GRID","FLIP_LOCK","PARALLEL_UNIVERSE","MANUAL"]', '["AUTO","RACE","ZERO_GRID","FLIP_LOCK","MANUAL"]')
if 'PARALLEL_UNIVERSE' in api or 'PARALLEL UNIVERSE' in api:
    leftovers = [line for line in api.splitlines() if 'PARALLEL' in line][:20]
    raise SystemExit('API still contains Parallel Universe references:\n' + '\n'.join(leftovers))
write(api_path, api)

# EA ownership/runtime routing.
p1_path = 'mt5/FastBasketBot.Part01.mqh'
p1 = read(p1_path)
p1 = p1.replace(
    'if(control == "AUTO" || control == "FLIP_LOCK" || control == "PARALLEL_UNIVERSE" ||\n      control == "ASSISTED" || control == "MANUAL")',
    'if(control == "AUTO" || control == "FLIP_LOCK" ||\n      control == "ASSISTED" || control == "MANUAL")',
)
if 'PARALLEL_UNIVERSE' in p1:
    raise SystemExit('Part01 still contains PARALLEL_UNIVERSE')
write(p1_path, p1)

p2_path = 'mt5/FastBasketBot.Part02.mqh'
p2 = read(p2_path).replace('AUTO/VECTOR/PARALLEL entry gates', 'AUTO/VECTOR entry gates')
if 'PARALLEL_UNIVERSE' in p2 or 'ParallelUniverse' in p2:
    raise SystemExit('Part02 still contains Parallel Universe code')
write(p2_path, p2)

p3_path = 'mt5/FastBasketBot.Part03.mqh'
p3 = read(p3_path)
p3 = replace_required(
    p3,
    'requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "ASSISTED" ||',
    'requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "ASSISTED" ||',
    'EA server control-mode whitelist',
)
if 'PARALLEL_UNIVERSE' in p3 or 'ParallelUniverse' in p3:
    raise SystemExit('Part03 still contains Parallel Universe code')
write(p3_path, p3)

p6_path = 'mt5/FastBasketBot.Part06.mqh'
p6 = read(p6_path)
p6 = replace_required(
    p6,
    'return g_controlMode == "AUTO" ||\n          g_controlMode == "FLIP_LOCK" ||\n          g_controlMode == "PARALLEL_UNIVERSE";',
    'return g_controlMode == "AUTO" ||\n          g_controlMode == "FLIP_LOCK";',
    'AutoV20 control modes',
)
p6 = replace_required(
    p6,
    '#include "include\\\\ParallelUniverseV1.mqh"\n',
    '',
    'Parallel Universe include',
)
if 'PARALLEL_UNIVERSE' in p6 or 'ParallelUniverse' in p6:
    raise SystemExit('Part06 still contains Parallel Universe code')
write(p6_path, p6)

p7_path = 'mt5/FastBasketBot.Part07.mqh'
p7 = read(p7_path)
block = re.compile(
    r'\n\s*string parallelReason="NONE";\n\s*if\(!ParallelUniverseLiveAllow\(direction,parallelReason\)\)\n\s*\{\n'
    r'\s*g_autoV20RejectReason=parallelReason;\n'
    r'\s*g_adaptiveBlockReason="PARALLEL_UNIVERSE_WAIT";\n'
    r'\s*g_cachedAdaptiveDirection=0;\n'
    r'\s*g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;\n'
    r'\s*return 0;\n\s*\}\n',
    re.MULTILINE,
)
p7, removed = block.subn('\n', p7, count=1)
if removed != 1:
    raise SystemExit(f'expected one Parallel Universe decision gate, removed={removed}')
if 'PARALLEL_UNIVERSE' in p7 or 'ParallelUniverse' in p7:
    raise SystemExit('Part07 still contains Parallel Universe code')
write(p7_path, p7)

# Remove the feature module and historical one-shot rollout files so no current-tree
# workflow can accidentally reintroduce this mode later.
for obsolete in [
    'mt5/include/ParallelUniverseV1.mqh',
    '.github/workflows/apply-live-auto-flip-parallel.yml',
    'scripts/upgrade-live-auto-flip-parallel.py',
]:
    p = Path(obsolete)
    if p.exists():
        p.unlink()

# Bump the EA runtime because compiled trading behavior changed.
root_path = 'mt5/FastBasketBot.mq5'
root = read(root_path)
root = replace_required(root, '#property version   "1.0.25"', '#property version   "1.0.26"', 'EA property version')
root = replace_required(root, '#define SCENOVA_EA_VERSION "1.0.25"', '#define SCENOVA_EA_VERSION "1.0.26"', 'EA runtime version')
root = replace_required(root, '#define SCENOVA_PRODUCT_VERSION "1.0.25"', '#define SCENOVA_PRODUCT_VERSION "1.0.26"', 'EA product version')
write(root_path, root)

release_path = 'apps/api/src/release-version.ts'
release = read(release_path)
release = replace_required(release, 'DEFAULT_EA_VERSION = "1.0.25"', 'DEFAULT_EA_VERSION = "1.0.26"', 'API EA release')
write(release_path, release)

# Current contract tests intentionally pin the promoted EA patch. Keep them aligned.
for test in Path('tests').glob('*'):
    if not test.is_file() or test.suffix.lower() not in {'.ps1', '.sh', '.mjs', '.cjs'}:
        continue
    text = test.read_text(encoding='utf-8')
    if '1.0.25' in text:
        test.write_text(text.replace('1.0.25', '1.0.26'), encoding='utf-8')

# Remove residual mode references from current tests/contracts only. Historical docs
# are not executable, but active tests must describe only selectable modes.
for base in [Path('tests')]:
    for p in base.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in {'.ps1', '.sh', '.mjs', '.cjs', '.md'}:
            continue
        text = p.read_text(encoding='utf-8')
        text = text.replace(', "PARALLEL_UNIVERSE"', '')
        text = text.replace('"PARALLEL_UNIVERSE", ', '')
        text = text.replace(',"PARALLEL_UNIVERSE"', '')
        text = text.replace('"PARALLEL_UNIVERSE",', '')
        text = text.replace("'PARALLEL_UNIVERSE', ", '')
        text = text.replace(", 'PARALLEL_UNIVERSE'", '')
        p.write_text(text, encoding='utf-8')

# Refresh the structural manifest against the NEW canonical expanded source.
root = read(root_path)
part_files = sorted(Path('mt5').glob('FastBasketBot.Part*.mqh'))
part_map = {p.name: p.read_text(encoding='utf-8') for p in part_files}
include_re = re.compile(r'^#include\s+"(FastBasketBot\.Part\d{2}\.mqh)"\s*$')
out: list[str] = []
for line in root.splitlines(keepends=True):
    match = include_re.match(line.rstrip('\r\n'))
    if match:
        out.append(part_map[match.group(1)])
    elif line.startswith('// SCENOVA STRUCTURAL MODULES:'):
        continue
    elif line.startswith('// Runtime behavior is preserved'):
        continue
    elif line.startswith('// Generated by scripts/refactor-mq5-structural.py'):
        continue
    else:
        out.append(line)
expanded = ''.join(out)
expanded_hash = sha256(expanded.encode('utf-8')).hexdigest()
manifest = {
    'format': 'SCENOVA_ORDER_PRESERVING_MQ5_MODULES_V1',
    'source': root_path,
    'originalSha256': expanded_hash,
    'expandedSha256': expanded_hash,
    'originalLines': len(expanded.splitlines()),
    'rootLines': len(root.splitlines()),
    'parts': [
        {
            'file': f'mt5/{p.name}',
            'lines': len(part_map[p.name].splitlines()),
            'sha256': sha256(part_map[p.name].encode('utf-8')).hexdigest(),
        }
        for p in part_files
    ],
}
Path('mt5/FastBasketBot.modules.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

# Final active-source contract: no feature symbol or human-facing mode name remains.
scan_roots = [Path('apps'), Path('mt5'), Path('tests')]
needles = ('PARALLEL_UNIVERSE', 'ParallelUniverse', 'PARALLEL UNIVERSE')
leftovers: list[str] = []
for base in scan_roots:
    for p in base.rglob('*'):
        if not p.is_file() or p.suffix.lower() in {'.ex5', '.exe', '.png', '.webp'}:
            continue
        try:
            text = p.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        for n in needles:
            if n in text:
                leftovers.append(f'{p}: {n}')
if leftovers:
    raise SystemExit('Parallel Universe references remain:\n' + '\n'.join(leftovers[:50]))

print('Parallel Universe removed from Web, API and EA runtime.')
print(f'EA version: 1.0.26; expanded lines: {manifest["originalLines"]}; hash: {expanded_hash}')
