from pathlib import Path

# Compatibility patcher for regression tests after the order-preserving MQ5 split.
needle = "$source = Get-Content $sourcePath -Raw"
insert = """$source = Get-Content $sourcePath -Raw
$sourceDir = Split-Path $sourcePath -Parent
Get-ChildItem $sourceDir -Filter 'FastBasketBot.Part*.mqh' -File -ErrorAction SilentlyContinue |
  Sort-Object Name |
  ForEach-Object { $source += "`n" + (Get-Content $_.FullName -Raw) }"""

changed = []
for path in sorted(Path('tests').glob('*.ps1')):
    text = path.read_text(encoding='utf-8')
    if 'FastBasketBot.mq5' not in text or needle not in text:
        continue
    if "FastBasketBot.Part*.mqh" in text:
        continue
    text = text.replace(needle, insert, 1)
    path.write_text(text, encoding='utf-8')
    changed.append(str(path))

if not changed:
    raise SystemExit('No modular MQ5 test readers needed patching')
print('Patched modular MQ5 readers:')
for path in changed:
    print(' -', path)