from pathlib import Path
import re
import subprocess

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8-sig')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str, flags=0) -> str:
    new_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {count}')
    return new_text


# ---------------------------------------------------------------------------
# Web dashboard/settings
# ---------------------------------------------------------------------------
web_path = 'apps/web/app/dashboard/page.tsx'
web = read(web_path)

web = replace_once(
    web,
    '  zeroGridStepPrice: 3,\n  zeroGridLevelsPerSide: 10,',
    '  zeroGridStepPrice: 3,\n  zeroGridLowVolatilityEnabled: false,\n  zeroGridLevelsPerSide: 10,',
    'web default low-volatility flag'
)
web = replace_once(
    web,
    '          nextSettings.zeroGridStepPrice = Number(nextSettings.zeroGridStepPrice) === 2 ? 2 : 3;\n          nextSettings.zeroGridLevelsPerSide = Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 10));',
    '          nextSettings.zeroGridStepPrice = Number(nextSettings.zeroGridStepPrice) === 2 ? 2 : 3;\n          if (typeof nextSettings.zeroGridLowVolatilityEnabled !== "boolean") nextSettings.zeroGridLowVolatilityEnabled = false;\n          nextSettings.zeroGridLevelsPerSide = Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 10));',
    'web low-volatility load normalization'
)

web = regex_once(
    web,
    r'  const modeCopy:Record<string,\{title:string;subtitle:string\}> = \{\n.*?\n  \};',
    '''  const modeCopy:Record<string,{title:string;subtitle:string}> = {\n    AUTO:{title:"โหมดอัตโนมัติ",subtitle:"ระบบวิเคราะห์ทิศทาง จุดเข้า และการบริหารสถานะตามเงื่อนไขของกลยุทธ์"},\n    RACE:{title:"โหมดเร่งจังหวะ",subtitle:"เพิ่มความถี่ในการเปิดสถานะเพื่อให้ครบจำนวนที่กำหนดเร็วขึ้น โดยแยกการบริหารรอบจากโหมดอัตโนมัติ"},\n    ZERO_GRID:{title:"โหมดกริดสองทิศทาง",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},\n    MANUAL:{title:"โหมดกำหนดค่าเอง",subtitle:"ระบบวิเคราะห์ทิศทางและจุดเข้าอัตโนมัติ โดยผู้ใช้กำหนด Lot เป้าหมายกำไร และจุดหยุดขาดทุน"}\n  };''',
    'professional Thai mode copy',
    flags=re.S
)

web = replace_once(
    web,
    '      props.onEdit?.("zeroGridStepPrice",Number(props.settings?.zeroGridStepPrice) === 2 ? 2 : 3);\n      props.onEdit?.("zeroGridLevelsPerSide",Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10)));',
    '      props.onEdit?.("zeroGridStepPrice",Number(props.settings?.zeroGridStepPrice) === 2 ? 2 : 3);\n      if (typeof props.settings?.zeroGridLowVolatilityEnabled !== "boolean") props.onEdit?.("zeroGridLowVolatilityEnabled",false);\n      props.onEdit?.("zeroGridLevelsPerSide",Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10)));',
    'web ZERO mode low-volatility default'
)

web = replace_once(
    web,
    '  const selectedZeroLevels = Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10));',
    '  const selectedZeroLevels = Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10));\n  const zeroGridLowVolatilityEnabled = props.settings?.zeroGridLowVolatilityEnabled === true;',
    'web low-volatility local state'
)

web = replace_once(
    web,
    '''              {[\n                {id:"AUTO",icon:"brain",tag:"แนะนำ"},\n                {id:"RACE",icon:"status",tag:"เร็วสุด"},\n                {id:"ZERO_GRID",icon:"layers",tag:"Hedging Grid"},\n                {id:"MANUAL",icon:"settings",tag:"ควบคุมละเอียด"}\n              ].map(mode=>''',
    '''              {[\n                {id:"AUTO",icon:"brain",tag:"แนะนำ"},\n                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},\n                {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},\n                {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}\n              ].map(mode=>''',
    'professional Thai mode tags'
)

# Add a dedicated information card before ZERO GRID fields.
web = replace_once(
    web,
    '                <div className="cc-bot-v2-section-title compact"><span>02</span><div><b>แผนการเปิดออเดอร์</b><small>ค่าชุดนี้ส่งตรงไปยัง EA</small></div></div>\n                <div className="cc-bot-v2-fields">',
    '''                <div className="cc-bot-v2-section-title compact"><span>02</span><div><b>แผนการเปิดออเดอร์</b><small>ค่าชุดนี้ส่งตรงไปยัง EA</small></div></div>\n                {controlMode==="ZERO_GRID"&&<div className={"cc-bot-v2-lowvol-card "+(zeroGridLowVolatilityEnabled?"active":"standard")}>\n                  <div className="cc-bot-v2-lowvol-copy">\n                    <span className="cc-bot-v2-lowvol-icon"><ScenovaIcon name="layers" size={22}/></span>\n                    <div><small>รูปแบบเสริมสำหรับ ZERO GRID</small><b>กริดตลาดความผันผวนต่ำ</b><p>{zeroGridLowVolatilityEnabled?"ลดระยะห่างระหว่างระดับเป็น 0.30 หน่วยราคา ใช้ระยะแรกประมาณ 0.10 และใช้ Lot คงที่ทุกระดับ":"ใช้โครงสร้างกริดมาตรฐาน ระยะ 2.00/3.00 และเพิ่ม Lot ตามลำดับระดับ"}</p></div>\n                  </div>\n                  <div className="cc-bot-v2-lowvol-action">\n                    <SwitchSetting checked={zeroGridLowVolatilityEnabled} onChange={(value:boolean)=>props.onEdit?.("zeroGridLowVolatilityEnabled",value)} onLabel="เปิดใช้งานกริดตลาดนิ่ง" offLabel="ใช้กริดมาตรฐาน"/>\n                    {zeroGridLowVolatilityEnabled&&<div className="cc-bot-v2-lowvol-specs"><span>ระยะแรก <b>0.10</b></span><span>ระยะต่อระดับ <b>0.30</b></span><span>Lot <b>คงที่</b></span></div>}\n                  </div>\n                  <div className="cc-bot-v2-lowvol-note">การเปลี่ยนรูปแบบระหว่างมีรอบที่กำลังทำงาน จะมีผลกับรอบใหม่หลังรอบเดิมสิ้นสุด เพื่อไม่ย้ายคำสั่ง Pending กลางรอบ</div>\n                </div>}\n                <div className="cc-bot-v2-fields">''',
    'ZERO low-volatility information card'
)

web = replace_once(
    web,
    '<div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="trend" size={17}/>ทิศทาง</label><strong>BUY STOP + SELL STOP</strong><small>บัญชี HEDGING เท่านั้น</small></div>',
    '<div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="trend" size={17}/>รูปแบบคำสั่ง</label><strong>BUY STOP + SELL STOP</strong><small>รองรับบัญชีแบบ Hedging เท่านั้น</small></div>',
    'ZERO direction terminology'
)

web = replace_once(
    web,
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะ Grid</span><select className="input" value={String(Number(props.settings.zeroGridStepPrice) === 2 ? 2 : 3)} onChange={e=>props.onEdit?.("zeroGridStepPrice",e.target.value)}><option value="2">2.00</option><option value="3">3.00</option></select></label>',
    '{!zeroGridLowVolatilityEnabled ? <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะห่างกริด</span><select className="input" value={String(Number(props.settings.zeroGridStepPrice) === 2 ? 2 : 3)} onChange={e=>props.onEdit?.("zeroGridStepPrice",e.target.value)}><option value="2">2.00</option><option value="3">3.00</option></select><small>ระยะห่างระหว่างระดับของกริดมาตรฐาน</small></label> : <div className="cc-bot-v2-field readonly lowvol"><label><ScenovaIcon name="layers" size={17}/>ระยะห่างกริด</label><strong>0.30</strong><small>ระดับแรกประมาณ 0.10 จากจุดอ้างอิง โดยขยับออกตามข้อกำหนดขั้นต่ำของ Broker หากจำเป็น</small></div>}',
    'ZERO conditional grid distance field'
)

web = replace_once(
    web,
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>Pending ต่อฝั่ง</span><select className="input" value={String(Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10)))} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",Number(e.target.value))}>{Array.from({length:30},(_,i)=>i+1).map(value=><option key={value} value={value}>{value} ต่อฝั่ง</option>)}</select><small>{zeroGridSettingsSynced ? `EA รับค่าแล้ว: ${appliedZeroLevels} BUY + ${appliedZeroLevels} SELL` : `เลือกได้ 1–30 Pending ต่อฝั่ง · หลังบันทึก รอ EA ยืนยัน ${selectedZeroLevels} ต่อฝั่งก่อน Start`}</small></label>',
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนคำสั่งรอต่อฝั่ง</span><select className="input" value={String(Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10)))} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",Number(e.target.value))}>{Array.from({length:30},(_,i)=>i+1).map(value=><option key={value} value={value}>{value} ระดับต่อฝั่ง</option>)}</select><small>{zeroGridSettingsSynced ? `EA รับค่าแล้ว: ${appliedZeroLevels} BUY + ${appliedZeroLevels} SELL` : `เลือกได้ 1–30 ระดับต่อฝั่ง · หลังบันทึก รอ EA ยืนยัน ${selectedZeroLevels} ระดับก่อนเริ่มบอท`}</small></label>',
    'ZERO pending terminology'
)

web = replace_once(
    web,
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>Base Lot</span><NumberInput value={props.settings.zeroGridBaseLot || 0.01} suffix="Lot" onCommit={(v:string)=>props.onEdit?.("zeroGridBaseLot",v)}/></label>',
    '<label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>{zeroGridLowVolatilityEnabled?"Lot คงที่ต่อระดับ":"Lot เริ่มต้น"}</span><NumberInput value={props.settings.zeroGridBaseLot || 0.01} suffix="Lot" onCommit={(v:string)=>props.onEdit?.("zeroGridBaseLot",v)}/><small>{zeroGridLowVolatilityEnabled?"ทุกระดับใช้ Lot เท่ากัน เช่น 0.01 / 0.01 / 0.01":"กริดมาตรฐานเพิ่ม Lot ตามลำดับ เช่น 0.01 / 0.02 / 0.03"}</small></label>',
    'ZERO lot terminology and behavior note'
)

web = replace_once(web, 'กำไรสุทธิขั้นต่ำ</span><MoneyInput', 'เป้ากำไรสุทธิขั้นต่ำ</span><MoneyInput', 'ZERO profit terminology')
web = replace_once(web, 'สำรองค่าปิด</span><MoneyInput', 'เงินสำรองสำหรับค่าปิด</span><MoneyInput', 'ZERO close reserve terminology')

# Professional Thai wording across the other control modes.
replacements = {
    'Automatic Basket Ladder': 'การเพิ่มสถานะอัตโนมัติ',
    'EA กระจายจังหวะเพิ่มไม้ตาม ATR และแรงตลาด': 'EA กระจายจังหวะเพิ่มสถานะตาม ATR และแรงเคลื่อนไหวของตลาด',
    'เป้ากำไรและ Stop Loss': 'เป้าหมายกำไรและจุดหยุดขาดทุน',
    'Dynamic Profit Protection': 'ระบบรักษากำไรแบบไดนามิก',
    'Stop Loss ต่อไม้': 'จุดหยุดขาดทุนต่อสถานะ',
    'ปิด · ใช้ระบบกำไรโหมดซิ่งเดิม': 'ปิด · ใช้การบริหารกำไรของโหมดเร่งจังหวะ',
    'เมื่อกำไรรวมของรอบซิ่งถึงเป้า EA จะสั่งปิดทุก Position ในรอบทันที': 'เมื่อกำไรรวมของรอบเร่งจังหวะถึงเป้าหมาย EA จะสั่งปิดทุกสถานะในรอบทันที',
    'ขาดทุนสูงสุดต่อ Basket': 'ขาดทุนสูงสุดต่อรอบ',
    'USD / Basket': 'USD / รอบ',
    '5-Timeframe Setup': 'การวิเคราะห์ 5 กรอบเวลา',
}
for old, new in replacements.items():
    web = web.replace(old, new)

# Update the compact hero mode chip to the same professional terminology.
old_chip = 'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "ZERO GRID" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO SMART" : settings.entryMode'
new_chip = 'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "กริดสองทิศทาง" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "เร่งจังหวะ" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "กำหนดค่าเอง" : settings.entryMode === "AUTO_MOMENTUM" ? "อัตโนมัติ" : settings.entryMode'
web = replace_once(web, old_chip, new_chip, 'professional hero mode chip')

# Summary panel: show the active ZERO GRID sub-profile explicitly.
old_summary = '''              {controlMode==="ZERO_GRID" ? <dl>\n                <div><dt>Symbol</dt><dd>{props.symbol || "—"}</dd></div>\n                <div><dt>Pending</dt><dd>{Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} BUY + {Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} SELL</dd></div>\n                <div><dt>Grid</dt><dd>{Number(props.settings.zeroGridStepPrice) === 2 ? "2.00" : "3.00"}</dd></div>\n                <div><dt>Base Lot</dt><dd>{Number(props.settings.zeroGridBaseLot||0.01).toFixed(2)} Lot</dd></div>\n                <div><dt>กำไรสุทธิขั้นต่ำ</dt><dd>${Number(props.settings.zeroGridMinNetProfitMoney||0.5).toFixed(2)}</dd></div>\n                <div><dt>สำรองค่าปิด</dt><dd>${Number(props.settings.zeroGridCloseReserveMoney||0.2).toFixed(2)}</dd></div>\n              </dl> : ('''
new_summary = '''              {controlMode==="ZERO_GRID" ? <dl>\n                <div><dt>คู่เทรด</dt><dd>{props.symbol || "—"}</dd></div>\n                <div><dt>รูปแบบกริด</dt><dd>{zeroGridLowVolatilityEnabled?"ตลาดความผันผวนต่ำ":"กริดมาตรฐาน"}</dd></div>\n                <div><dt>คำสั่งรอ</dt><dd>{Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} BUY + {Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} SELL</dd></div>\n                <div><dt>ระยะห่างกริด</dt><dd>{zeroGridLowVolatilityEnabled?"0.30":(Number(props.settings.zeroGridStepPrice) === 2 ? "2.00" : "3.00")}</dd></div>\n                <div><dt>{zeroGridLowVolatilityEnabled?"Lot คงที่":"Lot เริ่มต้น"}</dt><dd>{Number(props.settings.zeroGridBaseLot||0.01).toFixed(2)} Lot</dd></div>\n                <div><dt>เป้ากำไรสุทธิขั้นต่ำ</dt><dd>${Number(props.settings.zeroGridMinNetProfitMoney||0.5).toFixed(2)}</dd></div>\n                <div><dt>เงินสำรองสำหรับค่าปิด</dt><dd>${Number(props.settings.zeroGridCloseReserveMoney||0.2).toFixed(2)}</dd></div>\n              </dl> : ('''
web = replace_once(web, old_summary, new_summary, 'ZERO professional summary')
write(web_path, web)

# ---------------------------------------------------------------------------
# Web styling for the new ZERO GRID information card
# ---------------------------------------------------------------------------
css_path = 'apps/web/app/globals.css'
css = read(css_path)
marker = '/* ===== ZERO GRID LOW-VOLATILITY CARD ===== */'
if marker not in css:
    css += '''\n\n/* ===== ZERO GRID LOW-VOLATILITY CARD ===== */\n.cc-bot-v2-lowvol-card{margin:0 0 14px;padding:15px 16px;border:1px solid #30395c;border-radius:16px;background:radial-gradient(circle at 88% 0%,rgba(123,92,246,.16),transparent 40%),linear-gradient(145deg,#0e1422,#090d17);display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:12px 18px;align-items:center;box-shadow:0 12px 34px rgba(0,0,0,.18)}\n.cc-bot-v2-lowvol-card.active{border-color:#4a8b70;background:radial-gradient(circle at 88% 0%,rgba(74,219,151,.15),transparent 42%),linear-gradient(145deg,#0c1718,#091013);box-shadow:0 0 0 1px rgba(83,227,164,.05),0 14px 36px rgba(0,0,0,.2)}\n.cc-bot-v2-lowvol-copy{display:flex;align-items:flex-start;gap:12px;min-width:0}.cc-bot-v2-lowvol-icon{width:42px;height:42px;flex:0 0 42px;border:1px solid #4b3d81;border-radius:12px;background:#17152b;display:grid;place-items:center;color:#b69bff}.cc-bot-v2-lowvol-card.active .cc-bot-v2-lowvol-icon{border-color:#326a55;background:#10261f;color:#77e7b1}.cc-bot-v2-lowvol-copy div{min-width:0}.cc-bot-v2-lowvol-copy small{display:block;color:#76809d;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.cc-bot-v2-lowvol-copy b{display:block;margin-top:3px;color:#eef3ff;font-size:15px}.cc-bot-v2-lowvol-copy p{margin:5px 0 0;color:#8e9ab7;font-size:10px;line-height:1.55}.cc-bot-v2-lowvol-action{display:flex;flex-direction:column;align-items:flex-end;gap:8px}.cc-bot-v2-lowvol-action .cc-switch{width:100%;justify-content:flex-end}.cc-bot-v2-lowvol-specs{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.cc-bot-v2-lowvol-specs span{padding:5px 8px;border:1px solid rgba(102,224,163,.22);border-radius:999px;background:rgba(55,139,102,.10);color:#8ba69a;font-size:9px}.cc-bot-v2-lowvol-specs b{color:#78e7b2}.cc-bot-v2-lowvol-note{grid-column:1/-1;padding-top:10px;border-top:1px solid rgba(255,255,255,.055);color:#6f7a94;font-size:9px;line-height:1.5}.cc-bot-v2-field.readonly.lowvol{border-color:rgba(83,227,164,.24)!important;background:linear-gradient(145deg,rgba(32,82,62,.14),rgba(8,14,18,.86))!important}.cc-bot-v2-field.readonly.lowvol strong{color:#75e5af!important}\n@media(max-width:820px){.cc-bot-v2-lowvol-card{grid-template-columns:1fr}.cc-bot-v2-lowvol-action{align-items:stretch}.cc-bot-v2-lowvol-action .cc-switch{justify-content:flex-start}.cc-bot-v2-lowvol-specs{justify-content:flex-start}}\n'''
write(css_path, css)

# ---------------------------------------------------------------------------
# API validation/defaults
# ---------------------------------------------------------------------------
api_path = 'apps/api/src/bot.controller.ts'
api = read(api_path)
api = replace_once(
    api,
    '    numberSetting("zeroGridLevelsPerSide", 1, 30, true);\n    numberSetting("zeroGridBaseLot", 0.01, 100);',
    '    booleanSetting("zeroGridLowVolatilityEnabled");\n    numberSetting("zeroGridLevelsPerSide", 1, 30, true);\n    numberSetting("zeroGridBaseLot", 0.01, 100);',
    'API low-volatility validation'
)
api = replace_once(
    api,
    '    if (zeroGridSelected) {\n      clean.zeroGridStepPrice = clean.zeroGridStepPrice === 2 ? 2 : 3;\n      if (body.zeroGridBaseLot === undefined) clean.zeroGridBaseLot = 0.01;',
    '    if (zeroGridSelected) {\n      clean.zeroGridStepPrice = clean.zeroGridStepPrice === 2 ? 2 : 3;\n      if (body.zeroGridLowVolatilityEnabled === undefined) clean.zeroGridLowVolatilityEnabled = false;\n      if (body.zeroGridBaseLot === undefined) clean.zeroGridBaseLot = 0.01;',
    'API low-volatility default'
)
write(api_path, api)

# ---------------------------------------------------------------------------
# Database defaults
# ---------------------------------------------------------------------------
db_path = 'database/001_init.sql'
db = read(db_path)
db = replace_once(
    db,
    '    "raceCloseAllProfitMoney":0.5,\n    "basketTriggerMoney":2.0,',
    '    "raceCloseAllProfitMoney":0.5,\n    "zeroGridStepPrice":3,\n    "zeroGridLowVolatilityEnabled":false,\n    "zeroGridLevelsPerSide":10,\n    "zeroGridBaseLot":0.01,\n    "zeroGridMinNetProfitMoney":0.5,\n    "zeroGridCloseReserveMoney":0.2,\n    "basketTriggerMoney":2.0,',
    'database ZERO low-volatility defaults'
)
write(db_path, db)

# ---------------------------------------------------------------------------
# EA runtime
# ---------------------------------------------------------------------------
ea_path = 'mt5/FastBasketBot.mq5'
ea = read(ea_path)
ea = replace_once(ea, '#property version   "1.0.21"', '#property version   "1.0.22"', 'EA property version')
ea = replace_once(ea, '#define SCENOVA_EA_VERSION "1.0.21"', '#define SCENOVA_EA_VERSION "1.0.22"', 'EA semantic version')
ea = replace_once(ea, '#define SCENOVA_PRODUCT_VERSION "1.0.21"', '#define SCENOVA_PRODUCT_VERSION "1.0.22"', 'EA product version')
ea = replace_once(ea, '#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LEVELS_1_30_V1"', '#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LOW_VOLATILITY_V2"', 'EA runtime contract')

ea = replace_once(
    ea,
    'input double          InpZeroGridStepPrice     = 3.0;\ninput int             InpZeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
    'input double          InpZeroGridStepPrice     = 3.0;\ninput bool            InpZeroGridLowVolatilityEnabled = false;\ninput int             InpZeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
    'EA low-volatility input'
)
ea = replace_once(
    ea,
    'double g_zeroGridStepPrice = 3.0;\nint    g_zeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
    'double g_zeroGridStepPrice = 3.0;\nbool   g_zeroGridLowVolatilityEnabled = false;\nint    g_zeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;',
    'EA low-volatility requested state'
)
ea = replace_once(
    ea,
    'double g_zeroGridCycleBaseLot = 0.0;\nAUTO_V20_LEVELS g_autoV20Levels;',
    'double g_zeroGridCycleBaseLot = 0.0;\nint    g_zeroGridCycleLowVolatility = -1;\nAUTO_V20_LEVELS g_autoV20Levels;',
    'EA low-volatility cycle lock'
)
ea = replace_once(
    ea,
    '   g_zeroGridStepPrice = MathAbs(InpZeroGridStepPrice-2.0)<0.000001 ? 2.0 : 3.0;\n   g_zeroGridLevelsPerSide =',
    '   g_zeroGridStepPrice = MathAbs(InpZeroGridStepPrice-2.0)<0.000001 ? 2.0 : 3.0;\n   g_zeroGridLowVolatilityEnabled = InpZeroGridLowVolatilityEnabled;\n   g_zeroGridLevelsPerSide =',
    'EA OnInit low-volatility state'
)
ea = replace_once(
    ea,
    '   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));\n   g_zeroGridLevelsPerSide =',
    '   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));\n   g_zeroGridLowVolatilityEnabled = JsonBool(json, "zeroGridLowVolatilityEnabled", g_zeroGridLowVolatilityEnabled);\n   g_zeroGridLevelsPerSide =',
    'EA ApplySettings low-volatility state'
)

# Persist the selected sub-profile for the entire ZERO cycle. Old V1 state is
# inferred from the saved step so an upgrade cannot silently change an active ladder.
ea = replace_once(
    ea,
    '   if(g_zeroGridCycleBaseLot > 0.0)\n      GlobalVariableSet(ZeroGridStateKey("BASELOT"),g_zeroGridCycleBaseLot);',
    '   if(g_zeroGridCycleBaseLot > 0.0)\n      GlobalVariableSet(ZeroGridStateKey("BASELOT"),g_zeroGridCycleBaseLot);\n   if(g_zeroGridCycleLowVolatility >= 0)\n      GlobalVariableSet(ZeroGridStateKey("LOWVOL"),(double)g_zeroGridCycleLowVolatility);',
    'EA save low-volatility cycle state'
)
ea = replace_once(
    ea,
    '   if(g_zeroGridCycleBaseLot <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("BASELOT")))\n      g_zeroGridCycleBaseLot=GlobalVariableGet(ZeroGridStateKey("BASELOT"));',
    '   if(g_zeroGridCycleBaseLot <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("BASELOT")))\n      g_zeroGridCycleBaseLot=GlobalVariableGet(ZeroGridStateKey("BASELOT"));\n   if(g_zeroGridCycleLowVolatility < 0)\n   {\n      if(GlobalVariableCheck(ZeroGridStateKey("LOWVOL")))\n         g_zeroGridCycleLowVolatility=(int)MathRound(GlobalVariableGet(ZeroGridStateKey("LOWVOL")));\n      else if(g_zeroGridCycleStepPrice > 0.0)\n         g_zeroGridCycleLowVolatility=g_zeroGridCycleStepPrice < 1.0 ? 1 : 0;\n   }',
    'EA load low-volatility cycle state'
)
ea = replace_once(
    ea,
    '   g_zeroGridCycleBaseLot=0.0;\n   string keys[6]={"CENTER","EQUITY","START","STEP","LEVELS","BASELOT"};',
    '   g_zeroGridCycleBaseLot=0.0;\n   g_zeroGridCycleLowVolatility=-1;\n   string keys[7]={"CENTER","EQUITY","START","STEP","LEVELS","BASELOT","LOWVOL"};',
    'EA reset low-volatility cycle state'
)

old_base_lot_fn = '''double ZeroGridEffectiveBaseLot()\n{\n   double source=g_zeroGridCycleBaseLot>0.0 ? g_zeroGridCycleBaseLot : g_zeroGridBaseLot;\n   return MathMax(0.0001,source);\n}\n'''
new_base_lot_fn = '''double ZeroGridEffectiveBaseLot()\n{\n   double source=g_zeroGridCycleBaseLot>0.0 ? g_zeroGridCycleBaseLot : g_zeroGridBaseLot;\n   return MathMax(0.0001,source);\n}\n\nbool ZeroGridEffectiveLowVolatilityEnabled()\n{\n   if(g_zeroGridCycleLowVolatility >= 0)\n      return g_zeroGridCycleLowVolatility == 1;\n   return g_zeroGridLowVolatilityEnabled;\n}\n\ndouble ZeroGridEffectiveLevelLot(int level)\n{\n   double baseLot=ZeroGridEffectiveBaseLot();\n   double requested=ZeroGridEffectiveLowVolatilityEnabled()\n      ? baseLot\n      : baseLot*MathMax(1,level);\n   return NormalizeTradeVolume(requested);\n}\n'''
ea = replace_once(ea, old_base_lot_fn, new_base_lot_fn, 'EA effective low-volatility helpers')

ea = replace_once(
    ea,
    '   double source=g_zeroGridCycleStepPrice>0.0 ? g_zeroGridCycleStepPrice : g_zeroGridStepPrice;',
    '   double source=g_zeroGridCycleStepPrice>0.0\n      ? g_zeroGridCycleStepPrice\n      : (g_zeroGridLowVolatilityEnabled ? 0.30 : g_zeroGridStepPrice);',
    'EA effective low-volatility step'
)
ea = replace_once(
    ea,
    '   double preferredGap=1.0;',
    '   double preferredGap=ZeroGridEffectiveLowVolatilityEnabled() ? 0.10 : 1.0;',
    'EA low-volatility first gap'
)

old_requested = '''bool ZeroGridRequestedConfigChanged()\n{\n   if(g_zeroGridCycleStartedAt<=0) return false;\n   double tick=ZeroGridTickSize();\n   double requestedStep=MathMax(g_zeroGridStepPrice,tick);\n   requestedStep=NormalizeDouble(MathCeil((requestedStep/tick)-1e-10)*tick,_Digits);\n   int requestedLevels=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));\n   double requestedLot=MathMax(0.0001,g_zeroGridBaseLot);\n   return MathAbs(requestedStep-ZeroGridEffectiveStepPrice())>tick*0.5 ||\n          requestedLevels!=ZeroGridEffectiveLevelsPerSide() ||\n          MathAbs(requestedLot-ZeroGridEffectiveBaseLot())>0.0000001;\n}\n'''
new_requested = '''bool ZeroGridRequestedConfigChanged()\n{\n   if(g_zeroGridCycleStartedAt<=0) return false;\n   double tick=ZeroGridTickSize();\n   double requestedSource=g_zeroGridLowVolatilityEnabled ? 0.30 : g_zeroGridStepPrice;\n   double requestedStep=MathMax(requestedSource,tick);\n   requestedStep=NormalizeDouble(MathCeil((requestedStep/tick)-1e-10)*tick,_Digits);\n   int requestedLevels=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));\n   double requestedLot=MathMax(0.0001,g_zeroGridBaseLot);\n   bool requestedLowVolatility=g_zeroGridLowVolatilityEnabled;\n   return requestedLowVolatility!=ZeroGridEffectiveLowVolatilityEnabled() ||\n          MathAbs(requestedStep-ZeroGridEffectiveStepPrice())>tick*0.5 ||\n          requestedLevels!=ZeroGridEffectiveLevelsPerSide() ||\n          MathAbs(requestedLot-ZeroGridEffectiveBaseLot())>0.0000001;\n}\n'''
ea = replace_once(ea, old_requested, new_requested, 'EA requested-config comparison')

lot_anchor = 'NormalizeTradeVolume(ZeroGridEffectiveBaseLot()*level)'
lot_count = ea.count(lot_anchor)
if lot_count != 3:
    raise RuntimeError(f'EA level-lot anchors: expected 3, found {lot_count}')
ea = ea.replace(lot_anchor, 'ZeroGridEffectiveLevelLot(level)')

ea = replace_once(
    ea,
    '      g_zeroGridCycleStepPrice=MathMax(ZeroGridTickSize(),ZeroGridAllowedStep(g_zeroGridStepPrice));\n      g_zeroGridCycleLevelsPerSide=',
    '      g_zeroGridCycleLowVolatility=g_zeroGridLowVolatilityEnabled ? 1 : 0;\n      g_zeroGridCycleStepPrice=MathMax(ZeroGridTickSize(),g_zeroGridLowVolatilityEnabled ? 0.30 : ZeroGridAllowedStep(g_zeroGridStepPrice));\n      g_zeroGridCycleLevelsPerSide=',
    'EA cycle-lock low-volatility geometry'
)
write(ea_path, ea)

# ---------------------------------------------------------------------------
# Release version / runtime contract
# ---------------------------------------------------------------------------
release_path = 'apps/api/src/release-version.ts'
release = read(release_path)
release = replace_once(release, 'export const DEFAULT_EA_VERSION = "1.0.21";', 'export const DEFAULT_EA_VERSION = "1.0.22";', 'API EA version')
release = replace_once(release, 'export const EA_RUNTIME_CONTRACT = "ZERO_GRID_LEVELS_1_30_V1";', 'export const EA_RUNTIME_CONTRACT = "ZERO_GRID_LOW_VOLATILITY_V2";', 'API runtime contract')
write(release_path, release)

# ---------------------------------------------------------------------------
# Regression contracts
# ---------------------------------------------------------------------------
contract_path = 'tests/zero-grid-runtime-contract.ps1'
contract = read(contract_path)
contract = contract.replace('ZERO_GRID_LEVELS_1_30_V1', 'ZERO_GRID_LOW_VOLATILITY_V2')
insert_after = "Assert-Contains $mq5 'for(int level=1;level<=levels;level++)' 'EA stages every configured ZERO level'\n"
addition = """Assert-Contains $mq5 'InpZeroGridLowVolatilityEnabled = false;' 'low-volatility mode defaults OFF in EA'\nAssert-Contains $mq5 'JsonBool(json, \"zeroGridLowVolatilityEnabled\"' 'EA consumes the low-volatility switch'\nAssert-Contains $mq5 'ZeroGridEffectiveLowVolatilityEnabled() ? 0.10 : 1.0' 'low-volatility first pending gap'\nAssert-Contains $mq5 'g_zeroGridLowVolatilityEnabled ? 0.30' 'low-volatility fixed grid spacing'\nAssert-Contains $mq5 'ZeroGridEffectiveLevelLot(int level)' 'ZERO level-lot helper exists'\nAssert-Contains $web 'zeroGridLowVolatilityEnabled: false' 'web low-volatility mode defaults OFF'\nAssert-Contains $web 'กริดตลาดความผันผวนต่ำ' 'professional low-volatility UI card'\nAssert-Contains $bot 'booleanSetting(\"zeroGridLowVolatilityEnabled\")' 'API validates low-volatility switch'\n"""
contract = replace_once(contract, insert_after, insert_after + addition, 'runtime contract low-volatility assertions')
write(contract_path, contract)

sim_path = 'tests/zero-grid-v1-simulation.mjs'
sim = read(sim_path)
old_builder = '''export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01, firstOffsetPrice = 1.0 }) {\n  const center = (bid + ask) / 2;\n  const brokerSafe = Math.max(tick, brokerMinDistance) + tick;\n  const buyAnchor = up(Math.max(center + firstOffsetPrice, ask + brokerSafe), tick);\n  const sellAnchor = down(Math.min(center - firstOffsetPrice, bid - brokerSafe), tick);\n  const orders = [];\n  for (let level = 1; level <= levelsPerSide; level += 1) {\n    const offset = step * (level - 1);\n    const lot = baseLot * level;\n    orders.push({ type: "BUY_STOP", level, lot, price: buyAnchor + offset });\n    orders.push({ type: "SELL_STOP", level, lot, price: sellAnchor - offset });\n  }\n  return orders;\n}\n'''
new_builder = '''export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01, firstOffsetPrice = 1.0, lowVolatility = false }) {\n  const center = (bid + ask) / 2;\n  const effectiveStep = lowVolatility ? 0.30 : step;\n  const effectiveFirstOffset = lowVolatility ? 0.10 : firstOffsetPrice;\n  const brokerSafe = Math.max(tick, brokerMinDistance) + tick;\n  const buyAnchor = up(Math.max(center + effectiveFirstOffset, ask + brokerSafe), tick);\n  const sellAnchor = down(Math.min(center - effectiveFirstOffset, bid - brokerSafe), tick);\n  const orders = [];\n  for (let level = 1; level <= levelsPerSide; level += 1) {\n    const offset = effectiveStep * (level - 1);\n    const lot = lowVolatility ? baseLot : baseLot * level;\n    orders.push({ type: "BUY_STOP", level, lot, price: buyAnchor + offset });\n    orders.push({ type: "SELL_STOP", level, lot, price: sellAnchor - offset });\n  }\n  return orders;\n}\n'''
sim = replace_once(sim, old_builder, new_builder, 'ZERO simulation low-volatility builder')

standard_lot_test = '''{\n  const orders = buildPendingPlan({ bid: 4304.40, ask: 4304.60, step: 3, baseLot: 0.03, levelsPerSide: 5 });\n  assert.equal(orders.length, 10);\n  assert.deepEqual(orders.filter((o) => o.type === "BUY_STOP").map((o) => Number(o.lot.toFixed(2))), [0.03, 0.06, 0.09, 0.12, 0.15]);\n}\n'''
lowvol_test = '''\n{\n  const orders = buildPendingPlan({ bid: 3999.99, ask: 4000.01, baseLot: 0.01, levelsPerSide: 3, tick: 0.01, lowVolatility: true });\n  const buys = orders.filter((o) => o.type === "BUY_STOP");\n  const sells = orders.filter((o) => o.type === "SELL_STOP");\n  assert.deepEqual(buys.map((o) => Number(o.price.toFixed(2))), [4000.10, 4000.40, 4000.70]);\n  assert.deepEqual(sells.map((o) => Number(o.price.toFixed(2))), [3999.90, 3999.60, 3999.30]);\n  assert.deepEqual(buys.map((o) => Number(o.lot.toFixed(2))), [0.01, 0.01, 0.01]);\n  assert.deepEqual(sells.map((o) => Number(o.lot.toFixed(2))), [0.01, 0.01, 0.01]);\n}\n'''
sim = replace_once(sim, standard_lot_test, standard_lot_test + lowvol_test, 'ZERO low-volatility simulation case')
sim = replace_once(
    sim,
    'assert.match(ea, /ZERO_SIMPLE_STABLE_V117/, "ZERO must use the simple stable pending engine");',
    'assert.match(ea, /ZERO_SIMPLE_STABLE_V117/, "ZERO must use the simple stable pending engine");\nassert.match(ea, /InpZeroGridLowVolatilityEnabled\\s*=\\s*false/, "low-volatility switch must default OFF");\nassert.match(ea, /ZeroGridEffectiveLowVolatilityEnabled\\(\\) \\? 0\\.10 : 1\\.0/, "low-volatility first gap must be 0.10");\nassert.match(ea, /g_zeroGridLowVolatilityEnabled \\? 0\\.30/, "low-volatility level spacing must be 0.30");\nassert.match(ea, /ZeroGridEffectiveLevelLot\\(int level\\)/, "ZERO must isolate fixed-vs-ladder lot calculation");\nassert.match(web, /กริดตลาดความผันผวนต่ำ/, "ZERO UI must expose the professional low-volatility switch");',
    'ZERO source-level low-volatility assertions'
)
sim = sim.replace('ZERO GRID ~100-point first-offset, fast paired staging and real-net regression passed', 'ZERO GRID standard + low-volatility geometry, paired staging and real-net regression passed')
write(sim_path, sim)

# ---------------------------------------------------------------------------
# Validate the patch before committing anything.
# ---------------------------------------------------------------------------
subprocess.run(['node', 'tests/zero-grid-v1-simulation.mjs'], check=True)
subprocess.run(['pwsh', './tests/zero-grid-runtime-contract.ps1'], check=True)

# TypeScript/build and MetaTrader compile remain authoritative in normal CI.
print('ZERO GRID low-volatility + professional Thai terminology patch applied successfully.')
