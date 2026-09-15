from pathlib import Path

p=Path('.github/workflows/build-mt5-ea.yml')
text=p.read_text(encoding='utf-8')
replacements=[
    ('# Release metadata trigger: EA v1.0.12 loaded-runtime + ZERO settings contract.',
     '# Release metadata trigger: EA v1.0.13 loaded-runtime + ZERO settings contract.'),
    ("            'ZERO_GRID_RETRY_FIRST_PAIR',",
     "            'ZERO_GRID_RETRY_MISSING_L1',"),
    ("            'ulong ZeroGridNearestCloseTicket()',\n            'int profitRank=floating>=0.0 ? 0 : 1;',",
     "            'ulong ZeroGridNearestCloseTicket()',\n            'double bestVolume=1.0e100;',\n            'volume<bestVolume-lotTolerance',\n            'int profitRank=floating>=0.0 ? 0 : 1;',"),
    ("          if ($text.Contains('volume<bestVolume-0.0000001')) {\n            throw \"Obsolete ZERO GRID smallest-lot-first close ordering is still present\"\n          }",
     "          if ($text.Contains('ZERO_GRID_RETRY_FIRST_PAIR')) {\n            throw \"Obsolete ZERO GRID destructive first-pair cancel/rebuild retry is still present\"\n          }")
]
for old,new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'missing build-guard anchor: {old[:80]}')
    text=text.replace(old,new,1)

for required in [
    "'ZERO_GRID_RETRY_MISSING_L1'",
    "'double bestVolume=1.0e100;'",
    "'volume<bestVolume-lotTolerance'",
    "Obsolete ZERO GRID destructive first-pair cancel/rebuild retry is still present",
]:
    if required not in text:
        raise SystemExit(f'missing aligned guard: {required}')

p.write_text(text,encoding='utf-8',newline='\n')
print('ZERO build guards aligned')
