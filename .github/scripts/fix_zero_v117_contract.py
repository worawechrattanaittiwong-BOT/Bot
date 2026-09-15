from pathlib import Path

path = Path("tests/zero-grid-close-geometry-contract.ps1")
text = path.read_text(encoding="utf-8")
text = text.replace("#property version   \"1.0.16\"", "#property version   \"1.0.17\"")
text = text.replace("'ZERO_PAIR_ATOMIC_V116' 'flat ladder requires exact BUY/SELL pairs'", "'ZERO_SIMPLE_STABLE_V117' 'simple stable ZERO pending engine'")
path.write_text(text, encoding="utf-8")
