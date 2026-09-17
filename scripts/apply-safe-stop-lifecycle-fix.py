from pathlib import Path

# EA heartbeat: SAFE_STOP is a drain transition. Finish it once the EA is flat.
ea_path = Path('apps/api/src/ea.controller.ts')
ea = ea_path.read_text()
ea_old = '''    // Re-read the control state immediately before responding so a Start/Stop
    // click that happened during this heartbeat cannot be overwritten by stale data.
    const latestControl = await this.db.one(
      "SELECT desired_state FROM bot_instances WHERE id=$1",
      [instance.id]
    );
    const effectiveDesired = access
      ? String(latestControl?.desired_state || "STOPPED")
      : "SAFE_STOP";
'''
ea_new = '''    // Re-read the control state immediately before responding so a Start/Stop
    // click that happened during this heartbeat cannot be overwritten by stale data.
    let latestControl = await this.db.one(
      "SELECT desired_state FROM bot_instances WHERE id=$1",
      [instance.id]
    );

    // SAFE_STOP is a drain transition, not a terminal state. When the EA has
    // positively reported that it is flat and already in SAFE_STOP/STOPPED,
    // finish the lifecycle by moving the Server control state to STOPPED.
    // Internal risk/access locks keep their own executionStatus and are not
    // collapsed into STOPPED here.
    const heartbeatPositions = Number(metrics.positions);
    const heartbeatExecutionStatus = String(metrics.executionStatus || "").toUpperCase();
    const safeStopDrainComplete =
      access &&
      String(latestControl?.desired_state || "") === "SAFE_STOP" &&
      Number.isFinite(heartbeatPositions) &&
      heartbeatPositions <= 0 &&
      (heartbeatExecutionStatus === "SAFE_STOP" || heartbeatExecutionStatus === "STOPPED") &&
      !dailyProfitLocked;

    if (safeStopDrainComplete) {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1 AND desired_state='SAFE_STOP'",
        [instance.id]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND command='SAFE_STOP' AND status IN ('PENDING','DELIVERED')",
        [instance.id]
      );
      latestControl = { desired_state: "STOPPED" };
    }

    const effectiveDesired = access
      ? String(latestControl?.desired_state || "STOPPED")
      : "SAFE_STOP";
'''
if ea_old not in ea:
    raise SystemExit('ea.controller.ts target block not found; refusing unsafe patch')
ea_path.write_text(ea.replace(ea_old, ea_new, 1))

# Start endpoint: do not allow Start to race an active Safe Stop drain.
bot_path = Path('apps/api/src/bot.controller.ts')
bot = bot_path.read_text()
bot_old = '''    if (unresolvedCloseAll) {
      throw new ConflictException("ยังมีคำสั่ง Close All รอ EA ยืนยัน กรุณารอให้ Position เป็น 0 ก่อนเริ่มบอท");
    }
    const access: any = await this.entitlement(
'''
bot_new = '''    if (unresolvedCloseAll) {
      throw new ConflictException("ยังมีคำสั่ง Close All รอ EA ยืนยัน กรุณารอให้ Position เป็น 0 ก่อนเริ่มบอท");
    }
    const livePositions = Math.max(0, Number(instance.metrics?.positions || 0));
    if (
      String(instance.desired_state || "") === "SAFE_STOP" ||
      (String(instance.actual_state || "") === "SAFE_STOP" && livePositions > 0)
    ) {
      throw new ConflictException(
        "Safe Stop กำลังทำงานอยู่ กรุณารอให้ Position เป็น 0 และสถานะเป็น STOPPED ก่อนเริ่มบอทอีกครั้ง"
      );
    }
    const access: any = await this.entitlement(
'''
if bot_old not in bot:
    raise SystemExit('bot.controller.ts Start guard target not found; refusing unsafe patch')
bot_path.write_text(bot.replace(bot_old, bot_new, 1))

# Dashboard: show drain progress and block Start until STOPPED.
web_path = Path('apps/web/app/dashboard/page.tsx')
web = web_path.read_text()
web_old = '''  const startConnectionReady = isMt5Online || isAgentOnline;
  // Let the customer press Start whenever SCENOVA has a live connection.
  // Runtime/update/access/trading blockers are validated by /bot/start and
  // shown as an explicit warning instead of silently disabling the button.
  const startBlocked =
    busy ||
    botStarting ||
    botRunning ||
    maintenanceBlocksStart ||
    !startConnectionReady;
  const stopBlocked = busy || (desired !== "RUNNING" && state !== "RUNNING");
'''
web_new = '''  const startConnectionReady = isMt5Online || isAgentOnline;
  const safeStopInProgress =
    desired === "SAFE_STOP" ||
    (state === "SAFE_STOP" && Number(metrics.positions || 0) > 0);
  // Let the customer press Start whenever SCENOVA has a live connection, but
  // never race an in-flight Safe Stop drain. The Server also enforces this.
  const startBlocked =
    busy ||
    botStarting ||
    botRunning ||
    safeStopInProgress ||
    maintenanceBlocksStart ||
    !startConnectionReady;
  const stopBlocked = busy || (desired !== "RUNNING" && state !== "RUNNING");
'''
if web_old not in web:
    raise SystemExit('dashboard startBlocked target not found; refusing unsafe patch')
web = web.replace(web_old, web_new, 1)

label_old = '''        : desired === "SAFE_STOP"
          ? "Safe Stop — ไม่เปิดออเดอร์ใหม่"
          : "บอทหยุดอยู่";
'''
label_new = '''        : desired === "SAFE_STOP"
          ? Number(metrics.positions || 0) > 0
            ? `กำลังหยุดอย่างปลอดภัย — รอจัดการ ${Math.max(0, Number(metrics.positions || 0))} Position`
            : "กำลังยืนยันการหยุดกับ EA — ไม่มี Position ค้าง"
          : "บอทหยุดอยู่";
'''
if label_old not in web:
    raise SystemExit('dashboard controlStateLabel target not found; refusing unsafe patch')
web = web.replace(label_old, label_new, 1)

title_old = '<b>{startTimedOut?"เริ่มบอทไม่สำเร็จ":botStarting?"กำลังเริ่มบอท":state==="RUNNING"?"กำลังทำงาน":state==="SAFE_STOP"?"หยุดอย่างปลอดภัย":"บอทหยุดอยู่"}</b>'
title_new = '<b>{startTimedOut?"เริ่มบอทไม่สำเร็จ":botStarting?"กำลังเริ่มบอท":state==="RUNNING"?"กำลังทำงาน":desired==="SAFE_STOP"?"กำลังหยุดอย่างปลอดภัย":state==="SAFE_STOP"?"หยุดอย่างปลอดภัย":"บอทหยุดอยู่"}</b>'
if title_old not in web:
    raise SystemExit('dashboard Safe Stop hero title target not found; refusing unsafe patch')
web = web.replace(title_old, title_new, 1)

start_title_old = 'title={maintenanceBlocksStart?"ระบบปิด Start ใหม่ระหว่าง Safe Maintenance":!startConnectionReady?"รอการเชื่อมต่อจาก Windows Agent หรือ EA/MT5":undefined}'
start_title_new = 'title={maintenanceBlocksStart?"ระบบปิด Start ใหม่ระหว่าง Safe Maintenance":safeStopInProgress?"กำลัง Safe Stop · รอให้ Position เป็น 0 และ EA ยืนยัน STOPPED":!startConnectionReady?"รอการเชื่อมต่อจาก Windows Agent หรือ EA/MT5":undefined}'
if start_title_old not in web:
    raise SystemExit('dashboard Start tooltip target not found; refusing unsafe patch')
web_path.write_text(web.replace(start_title_old, start_title_new, 1))

# Regression contract under the existing production-hardening gate.
test_path = Path('tests/production-hardening-phase4-contract.ps1')
test = test_path.read_text()
test_old = "$page=Read-Text 'apps/web/app/admin/cloud-hardening/page.tsx'\n"
test_new = test_old + "$botApi=Read-Text 'apps/api/src/bot.controller.ts'\n$eaApi=Read-Text 'apps/api/src/ea.controller.ts'\n$dashboard=Read-Text 'apps/web/app/dashboard/page.tsx'\n"
if test_old not in test:
    raise SystemExit('production hardening read target not found')
test = test.replace(test_old, test_new, 1)

test_anchor = "Require $page 'Reset circuit' 'owner recovery circuit reset UI'\n\n"
test_extra = '''Require $botApi 'Safe Stop กำลังทำงานอยู่.*Position เป็น 0.*STOPPED' 'Start is blocked while Safe Stop drain is active'
Require $eaApi 'safeStopDrainComplete' 'Safe Stop drain has an explicit completion transition'
Require $eaApi "desired_state='STOPPED'.*desired_state='SAFE_STOP'" 'flat Safe Stop canonicalizes Server desired state to STOPPED'
Require $dashboard 'safeStopInProgress' 'dashboard blocks Start while Safe Stop is draining'
Require $dashboard 'กำลังยืนยันการหยุดกับ EA' 'dashboard explains flat Safe Stop acknowledgement phase'

'''
if test_anchor not in test:
    raise SystemExit('production hardening assertion anchor not found')
test_path.write_text(test.replace(test_anchor, test_anchor + test_extra, 1))
