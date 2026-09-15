from pathlib import Path

page_path = Path("apps/web/app/dashboard/page.tsx")
text = page_path.read_text(encoding="utf-8")

replacements = {
    'zeroGridLevelsPerSide: 3,': 'zeroGridLevelsPerSide: 10,',
    'Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 3))': 'Math.max(10, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 10))',
    'Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||3))': 'Math.max(10,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))',
    'Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||3))': 'Math.max(10,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10))',
    'Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||3))': 'Math.max(10,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))',
    'เลือกได้ 1–30 Pending ต่อฝั่ง': 'เลือกได้ 10–30 Pending ต่อฝั่ง',
    'เลือกได้ 1–30 ต่อฝั่ง': 'เลือกได้ 10–30 ต่อฝั่ง',
    '{Array.from({length:30},(_,i)=>i+1).map(value=>': '{Array.from({length:21},(_,i)=>i+10).map(value=>',
}

for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"missing expected dashboard marker: {old}")
    text = text.replace(old, new)

# Guard against any remaining UI clamp/default that can expose ZERO levels below 10.
for old in (
    'Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 3))',
    'Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||3))',
    'Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||3))',
    'Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||3))',
    'Array.from({length:30},(_,i)=>i+1)',
    'เลือกได้ 1–30 Pending ต่อฝั่ง',
    'เลือกได้ 1–30 ต่อฝั่ง',
):
    if old in text:
        raise SystemExit(f"obsolete ZERO 1-level UI marker remains: {old}")

page_path.write_text(text, encoding="utf-8")

test_path = Path("tests/zero-grid-runtime-contract.ps1")
test = test_path.read_text(encoding="utf-8")
old_test = "Assert-Contains $web 'เลือกได้ 1–30 Pending ต่อฝั่ง' 'ZERO UI 1-30 explanation'"
new_test = "Assert-Contains $web 'เลือกได้ 10–30 Pending ต่อฝั่ง' 'ZERO UI 10-30 explanation'\nAssert-Contains $web 'Array.from({length:21},(_,i)=>i+10)' 'ZERO UI options begin at 10'\nAssert-Contains $web 'zeroGridLevelsPerSide: 10' 'ZERO UI default begins at 10'"
if old_test not in test:
    raise SystemExit("missing ZERO runtime UI contract marker")
test = test.replace(old_test, new_test)
test_path.write_text(test, encoding="utf-8")

print("Applied ZERO UI Pending range 10-30 without EA version change")
