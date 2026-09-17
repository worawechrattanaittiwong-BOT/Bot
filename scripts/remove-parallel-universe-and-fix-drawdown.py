from pathlib import Path
import re

ROOT = Path('.')

web_path = ROOT / 'apps/web/app/dashboard/page.tsx'
web = web_path.read_text(encoding='utf-8')
for old, new in [
    ('["AUTO","FLIP_LOCK","PARALLEL_UNIVERSE","RACE","ZERO_GRID","MANUAL"]', '["AUTO","FLIP_LOCK","RACE","ZERO_GRID","MANUAL"]'),
    ('    PARALLEL_UNIVERSE:{title:"PARALLEL UNIVERSE",subtitle:"ใช้สถิติ Setup / Model / Regime ในอดีตเทียบกับสภาพปัจจุบันก่อนยืนยันออเดอร์"},\n', ''),
    ('                {id:"PARALLEL_UNIVERSE",icon:"brain",tag:"Historical Worlds"},\n', ''),
    (' || mode === "PARALLEL_UNIVERSE"', ''),
    ('if (mode === "AUTO" || mode === "PARALLEL_UNIVERSE")', 'if (mode === "AUTO")'),
    ('      props.onEdit?.("dailyProfitDrawdownPercent",0);\n', ''),
]:
    web = web.replace(old, new)
web_path.write_text(web, encoding='utf-8')

for path in (ROOT / 'apps/api').rglob('*.ts'):
    src = path.read_text(encoding='utf-8')
    out = src.replace(', "PARALLEL_UNIVERSE"', '').replace('"PARALLEL_UNIVERSE", ', '')
    if 'dailyProfitDrawdownPercent' in out:
        out = re.sub(r'(dailyProfitDrawdownPercent\s*:\s*z(?:\.coerce)?\.number\(\))\.min\((?:0\.0*1|0\.1|1)\)', r'\1.min(0)', out)
        out = re.sub(r'(dailyProfitDrawdownPercent[^\n]{0,180}?\.min\()\s*(?:0\.0*1|0\.1|1)\s*(\))', r'\g<1>0\2', out)
        out = re.sub(r'(dailyProfitDrawdownPercent\s*<)\s*0\.01', r'\1 0', out)
        out = re.sub(r'(dailyProfitDrawdownPercent\s*<=)\s*0', r'\1 -1', out)
        out = re.sub(r'(Number\([^\n]*dailyProfitDrawdownPercent[^\n]*\)\s*<)\s*0\.01', r'\1 0', out)
        out = re.sub(r'(Number\([^\n]*dailyProfitDrawdownPercent[^\n]*\)\s*<=)\s*0', r'\1 -1', out)
    if out != src:
        path.write_text(out, encoding='utf-8')

ea_path = ROOT / 'mt5/FastBasketBot.mq5'
ea = ea_path.read_text(encoding='utf-8')
ea = ea.replace('      requestedControlMode == "MANUAL" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "LEGACY";',
                '      requestedControlMode == "MANUAL" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "LEGACY";')
ea = ea.replace('   if(control == "PARALLEL_UNIVERSE") return "PARALLEL_UNIVERSE";\n', '')
ea = ea.replace('   if(ParallelUniverseModeEnabled())\n   {\n      HandleParallelUniverseMode(momentum);\n      return;\n   }\n', '')
ea_path.write_text(ea, encoding='utf-8')

mode_path = ROOT / 'mt5/include/LiveExecutionModesV1.mqh'
if mode_path.exists():
    src = mode_path.read_text(encoding='utf-8')

    def remove_named_functions(text: str, prefix: str) -> str:
        while True:
            m = re.search(r'(?m)^[A-Za-z_][A-Za-z0-9_<>\s*&]*\b' + re.escape(prefix) + r'[A-Za-z0-9_]*\s*\([^;]*\)\s*\{', text)
            if not m:
                break
            start = m.start()
            brace = text.find('{', m.start(), m.end())
            depth = 0
            i = brace
            in_str = False
            esc = False
            while i < len(text):
                ch = text[i]
                if in_str:
                    if esc: esc = False
                    elif ch == '\\': esc = True
                    elif ch == '"': in_str = False
                else:
                    if ch == '"': in_str = True
                    elif ch == '{': depth += 1
                    elif ch == '}':
                        depth -= 1
                        if depth == 0:
                            i += 1
                            while i < len(text) and text[i] in ' \t\r\n': i += 1
                            text = text[:start] + text[i:]
                            break
                i += 1
            else:
                raise RuntimeError(f'Unbalanced function while removing {prefix}')
        return text

    src = remove_named_functions(src, 'ParallelUniverse')
    src = '\n'.join(line for line in src.splitlines() if 'PARALLEL_UNIVERSE' not in line and 'g_parallelUniverse' not in line) + '\n'
    mode_path.write_text(src, encoding='utf-8')

web = web_path.read_text(encoding='utf-8')
ea = ea_path.read_text(encoding='utf-8')
assert 'PARALLEL_UNIVERSE' not in web
assert 'ParallelUniverseModeEnabled()' not in ea
assert 'HandleParallelUniverseMode(' not in ea
assert 'props.onEdit?.("dailyProfitDrawdownPercent",0);' not in web
for required in ('FLIP_LOCK','RACE','ZERO_GRID','MANUAL','AUTO'):
    assert required in web
for path in (ROOT / 'apps/api').rglob('*.ts'):
    if 'PARALLEL_UNIVERSE' in path.read_text(encoding='utf-8'):
        raise RuntimeError(f'PARALLEL_UNIVERSE remains in API runtime: {path}')
print('Removed PARALLEL UNIVERSE runtime mode and repaired drawdown validation.')
