from pathlib import Path

api_path = Path('apps/api/src/bot.controller.ts')
api = api_path.read_text(encoding='utf-8')
old = 'numberSetting("dailyProfitDrawdownPercent", 1, 95);'
new = 'numberSetting("dailyProfitDrawdownPercent", 0, 95);'
count = api.count(old)
if count < 1:
    raise SystemExit('Expected dailyProfitDrawdownPercent validator was not found')
api = api.replace(old, new)
api_path.write_text(api, encoding='utf-8')

web_path = Path('apps/web/app/dashboard/page.tsx')
web = web_path.read_text(encoding='utf-8')
web = web.replace('      props.onEdit?.("dailyProfitDrawdownPercent",0);\n', '')
web_path.write_text(web, encoding='utf-8')

api = api_path.read_text(encoding='utf-8')
web = web_path.read_text(encoding='utf-8')
assert old not in api
assert new in api
assert 'if (clean.dailyProfitContinueAfterTarget === true)' in api
assert 'drawdown <= 0 || drawdown > 95' in api
assert 'props.onEdit?.("dailyProfitDrawdownPercent",0);' not in web
print(f'Fixed {count} dailyProfitDrawdownPercent generic validator(s).')
print('0 now means disabled; enabled giveback still requires >0 and <=95.')
