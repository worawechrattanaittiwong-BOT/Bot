from pathlib import Path

# 1) Heartbeat: normal Safe Stop heartbeats often omit executionStatus. If the
# EA itself reports SAFE_STOP/STOPPED while flat, that is enough to finish an
# explicit drain, unless a named runtime lock is still present.
ea_path = Path('apps/api/src/ea.controller.ts')
ea = ea_path.read_text()
ea_old = '''    const heartbeatPositions = Number(metrics.positions);
    const heartbeatExecutionStatus = String(metrics.executionStatus || "").toUpperCase();
    const safeStopDrainComplete =
      access &&
      String(latestControl?.desired_state || "") === "SAFE_STOP" &&
      Number.isFinite(heartbeatPositions) &&
      heartbeatPositions <= 0 &&
      (heartbeatExecutionStatus === "SAFE_STOP" || heartbeatExecutionStatus === "STOPPED") &&
      !dailyProfitLocked;
'''
ea_new = '''    const heartbeatPositions = Number(metrics.positions);
    const heartbeatExecutionStatus = String(metrics.executionStatus || "").toUpperCase();
    const heartbeatState = String(body.state || "").toUpperCase();
    const heartbeatConfirmsSafeStop =
      heartbeatExecutionStatus === "SAFE_STOP" ||
      heartbeatExecutionStatus === "STOPPED" ||
      (
        heartbeatExecutionStatus === "" &&
        (heartbeatState === "SAFE_STOP" || heartbeatState === "STOPPED")
      );
    const safeStopDrainComplete =
      access &&
      String(latestControl?.desired_state || "") === "SAFE_STOP" &&
      Number.isFinite(heartbeatPositions) &&
      heartbeatPositions <= 0 &&
      heartbeatConfirmsSafeStop &&
      !dailyProfitLocked;
'''
if ea_old not in ea:
    raise SystemExit('ea Safe Stop completion block not found')
ea_path.write_text(ea.replace(ea_old, ea_new, 1))

# 2) Start: the safety gate exists to prevent racing open positions. A flat
# stale SAFE_STOP must remain recoverable; entitlement/update gates still run.
bot_path = Path('apps/api/src/bot.controller.ts')
bot = bot_path.read_text()
bot_old = '''    const livePositions = Math.max(0, Number(instance.metrics?.positions || 0));
    if (
      String(instance.desired_state || "") === "SAFE_STOP" ||
      (String(instance.actual_state || "") === "SAFE_STOP" && livePositions > 0)
    ) {
'''
bot_new = '''    const livePositions = Math.max(0, Number(instance.metrics?.positions || 0));
    if (
      livePositions > 0 &&
      (
        String(instance.desired_state || "") === "SAFE_STOP" ||
        String(instance.actual_state || "") === "SAFE_STOP"
      )
    ) {
'''
if bot_old not in bot:
    raise SystemExit('bot Start Safe Stop guard not found')
bot_path.write_text(bot.replace(bot_old, bot_new, 1))

# 3) Dashboard: only an actual position drain disables Start. A flat SAFE_STOP
# can still show the acknowledgement message, but it cannot strand the user.
web_path = Path('apps/web/app/dashboard/page.tsx')
web = web_path.read_text()
web_old = '''  const safeStopInProgress =
    desired === "SAFE_STOP" ||
    (state === "SAFE_STOP" && Number(metrics.positions || 0) > 0);
'''
web_new = '''  const safeStopPositionCount = Math.max(0, Number(metrics.positions || 0));
  const safeStopInProgress =
    safeStopPositionCount > 0 &&
    (desired === "SAFE_STOP" || state === "SAFE_STOP");
  const safeStopAwaitingAck =
    desired === "SAFE_STOP" && safeStopPositionCount === 0;
'''
if web_old not in web:
    raise SystemExit('dashboard Safe Stop progress block not found')
web = web.replace(web_old, web_new, 1)

# Keep the zero-position acknowledgement visible, while explaining that Start
# is allowed if the user needs to recover before the next heartbeat arrives.
label_old = '''            : "กำลังยืนยันการหยุดกับ EA — ไม่มี Position ค้าง"
'''
label_new = '''            : safeStopAwaitingAck
              ? "กำลังยืนยันการหยุดกับ EA — ไม่มี Position ค้าง · เริ่มใหม่ได้หากต้องการ"
              : "หยุดอย่างปลอดภัยแล้ว — ไม่มี Position ค้าง"
'''
if label_old not in web:
    raise SystemExit('dashboard flat Safe Stop label not found')
web_path.write_text(web.replace(label_old, label_new, 1))

# 4) Strengthen the production contract around the exact regression.
test_path = Path('tests/production-hardening-phase4-contract.ps1')
test = test_path.read_text()
anchor = '''Require $eaApi 'safeStopDrainComplete' 'Safe Stop drain has an explicit completion transition'\n'''
extra = '''Require $eaApi 'heartbeatExecutionStatus === "".*heartbeatState === "SAFE_STOP".*heartbeatState === "STOPPED"' 'flat heartbeat state can finish Safe Stop when executionStatus is absent'\nRequire $botApi 'livePositions > 0.*desired_state.*SAFE_STOP.*actual_state.*SAFE_STOP' 'Start only blocks an active position drain, not a flat stale Safe Stop'\nRequire $dashboard 'safeStopPositionCount > 0.*safeStopInProgress' 'dashboard only blocks Start while positions are draining'\n'''
if anchor not in test:
    raise SystemExit('phase4 Safe Stop contract anchor not found')
test_path.write_text(test.replace(anchor, anchor + extra, 1))
