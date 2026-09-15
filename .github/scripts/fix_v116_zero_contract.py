from pathlib import Path

path = Path('tests/zero-grid-close-geometry-contract.ps1')
text = path.read_text(encoding='utf-8')
old = "Require-Contains $ea 'ZERO_GRID_RETRY_MISSING_L1' 'retry only missing first-side trigger'"
new = "Require-Contains $ea 'ZERO_PAIR_ATOMIC_V116' 'flat ladder requires exact BUY/SELL pairs'"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('ZERO v1.0.16 pair contract replacement point missing')
path.write_text(text, encoding='utf-8')
