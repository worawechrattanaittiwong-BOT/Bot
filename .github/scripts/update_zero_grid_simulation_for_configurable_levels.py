from pathlib import Path

p = Path("tests/zero-grid-v1-simulation.mjs")
text = p.read_text(encoding="utf-8")
old = 'assert.match(web, /3 BUY STOP \\+ 3 SELL STOP/);'
new = 'assert.match(web, /Array\\.from\\(\\{length:30\\},\\(_,i\\)=>i\\+1\\)/, "ZERO UI must expose 1..30 levels per side");\nassert.match(web, /เลือกได้ 1–30 BUY STOP และ 1–30 SELL STOP/, "ZERO UI must explain the per-side range");'
if text.count(old) != 1:
    raise SystemExit(f"expected one legacy fixed-three assertion, found {text.count(old)}")
p.write_text(text.replace(old, new), encoding="utf-8")
print("updated ZERO GRID simulation contract for configurable levels")
