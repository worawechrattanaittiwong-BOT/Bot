from pathlib import Path

web = Path('apps/web/app/dashboard/page.tsx')
text = web.read_text(encoding='utf-8')
replacements = [
    (
        '          nextSettings.zeroGridStepPrice = 2;\n',
        '          nextSettings.zeroGridStepPrice = Number(nextSettings.zeroGridStepPrice) === 3 ? 3 : 2;\n'
    ),
    (
        '      props.onEdit?.("zeroGridStepPrice",2);\n',
        '      const currentZeroStep = Number(props.settings?.zeroGridStepPrice);\n      props.onEdit?.("zeroGridStepPrice",currentZeroStep === 3 ? 3 : 2);\n'
    ),
    (
        '                    <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="layers" size={17}/>ระยะ Grid</label><strong>2.00</strong></div>\n',
        '                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะ Grid</span><select className="input" value={String(Number(props.settings.zeroGridStepPrice)===3?3:2)} onChange={e=>props.onEdit?.("zeroGridStepPrice",e.target.value)}><option value="2">2.00</option><option value="3">3.00</option></select></label>\n'
    ),
    (
        '                <div><dt>Grid</dt><dd>2.00</dd></div>\n',
        '                <div><dt>Grid</dt><dd>{Number(props.settings.zeroGridStepPrice)===3?"3.00":"2.00"}</dd></div>\n'
    ),
]
for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit('frontend marker not found: ' + old[:80])
web.write_text(text, encoding='utf-8')

api = Path('apps/api/src/bot.controller.ts')
text = api.read_text(encoding='utf-8')
old = '''    if (zeroGridSelected) {
      clean.zeroGridStepPrice = 2;
      clean.zeroGridLevelsPerSide = 3;
      if (body.zeroGridBaseLot === undefined) clean.zeroGridBaseLot = 0.01;
      if (body.zeroGridMinNetProfitMoney === undefined) clean.zeroGridMinNetProfitMoney = 0.5;
      if (body.zeroGridCloseReserveMoney === undefined) clean.zeroGridCloseReserveMoney = 0.2;
    }
'''
new = '''    if (zeroGridSelected) {
      const requestedZeroStep = body.zeroGridStepPrice === undefined
        ? 2
        : Number(body.zeroGridStepPrice);
      clean.zeroGridStepPrice = requestedZeroStep === 3 ? 3 : 2;
      clean.zeroGridLevelsPerSide = 3;
      if (body.zeroGridBaseLot === undefined) clean.zeroGridBaseLot = 0.01;
      if (body.zeroGridMinNetProfitMoney === undefined) clean.zeroGridMinNetProfitMoney = 0.5;
      if (body.zeroGridCloseReserveMoney === undefined) clean.zeroGridCloseReserveMoney = 0.2;
    }
'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('backend ZERO canonical marker not found')
api.write_text(text, encoding='utf-8')
print('patched ZERO Grid choices to 2.00 or 3.00; Pending remains locked at 3')
