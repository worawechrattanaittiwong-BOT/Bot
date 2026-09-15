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

sim_path = Path('tests/zero-grid-v1-simulation.mjs')
sim = sim_path.read_text(encoding='utf-8')
old_sim = '''assert.match(ea, /ZERO_GRID_WAIT_FIRST_PAIR/, "deeper ladder must wait for both required L1 orders");
assert.match(ea, /ZERO_GRID_REBUILD_MISSING_L1/, "legacy malformed ladders must rebuild");
assert.match(ea, /for\\(int level=2;level<=levels;level\\+\\+\\)/, "deeper staging must begin at level 2 after L1 pair");'''
new_sim = '''assert.match(ea, /ZERO_PAIR_ATOMIC_V116/, "flat ZERO ladder must be atomic BUY\/SELL pairs");
assert.match(ea, /ZERO_GRID_PAIR_ROLLBACK/, "one-sided accepted pair must roll back");
assert.match(ea, /ZeroGridPendingCount\\(\\)!=levels\\*2/, "flat ZERO must require the full configured ladder");
assert.match(ea, /for\\(int level=1;level<=levels;level\\+\\+\\)/, "flat ZERO must validate every configured level pair");'''
if old_sim in sim:
    sim = sim.replace(old_sim, new_sim, 1)
elif new_sim not in sim:
    raise SystemExit('ZERO simulation v1.0.16 replacement point missing')
sim_path.write_text(sim, encoding='utf-8')
