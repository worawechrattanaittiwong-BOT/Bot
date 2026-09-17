from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match in {path}: found {count}\n--- pattern ---\n{old[:500]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


api = Path("apps/api/src/bot.controller.ts")
web = Path("apps/web/app/dashboard/page.tsx")

# 1) Backend: expose an explicit START transition and cancel a stuck START after 20s.
replace_once(
    api,
    '''    let account = null;\n    let settings = null;\n''',
    '''    let startTransition: any = {\n      phase: "IDLE",\n      message: "พร้อมรับคำสั่ง",\n      ageSeconds: 0,\n      commandStatus: null,\n      commandId: null\n    };\n\n    if (instance) {\n      const latestStartCommand = await this.db.one(\n        `SELECT id,status,created_at,delivered_at,acked_at\n         FROM bot_commands\n         WHERE bot_instance_id=$1 AND command='START'\n         ORDER BY id DESC\n         LIMIT 1`,\n        [instance.id]\n      );\n      const startAgeSeconds = latestStartCommand?.created_at\n        ? Math.max(0, (Date.now() - new Date(latestStartCommand.created_at).getTime()) / 1000)\n        : 0;\n\n      if (String(instance.actual_state || "") === "RUNNING") {\n        startTransition = {\n          phase: "RUNNING",\n          message: "EA ยืนยันแล้ว · บอทกำลังทำงาน",\n          ageSeconds: startAgeSeconds,\n          commandStatus: latestStartCommand?.status || null,\n          commandId: latestStartCommand?.id || null\n        };\n      } else if (String(instance.desired_state || "") === "RUNNING" && latestStartCommand) {\n        if (startAgeSeconds >= 20) {\n          await this.db.query(\n            "UPDATE bot_instances SET desired_state='STOPPED',lock_owner=NULL WHERE id=$1 AND desired_state='RUNNING' AND actual_state<>'RUNNING'",\n            [instance.id]\n          );\n          await this.db.query(\n            "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE id=$1 AND status IN ('PENDING','DELIVERED')",\n            [latestStartCommand.id]\n          );\n          instance.desired_state = "STOPPED";\n          startTransition = {\n            phase: "TIMEOUT",\n            message: "เริ่มบอทไม่สำเร็จภายใน 20 วินาที · คำสั่งถูกยกเลิกเพื่อไม่ให้ค้าง กรุณาตรวจ Agent / EA แล้วกดเริ่มอีกครั้ง",\n            ageSeconds: startAgeSeconds,\n            commandStatus: latestStartCommand.status,\n            commandId: latestStartCommand.id\n          };\n        } else {\n          const status = String(latestStartCommand.status || "PENDING").toUpperCase();\n          startTransition = {\n            phase: status === "DELIVERED" ? "DELIVERED_TO_EA" : status === "ACKED" ? "WAITING_HEARTBEAT" : "COMMAND_QUEUED",\n            message: status === "DELIVERED"\n              ? "ส่งคำสั่งถึง EA แล้ว · รอ EA เปลี่ยนเป็น RUNNING"\n              : status === "ACKED"\n                ? "EA รับคำสั่งแล้ว · รอ Heartbeat ยืนยัน RUNNING"\n                : "บันทึกคำสั่ง Start แล้ว · รอ EA มารับคำสั่ง",\n            ageSeconds: startAgeSeconds,\n            commandStatus: status,\n            commandId: latestStartCommand.id\n          };\n        }\n      }\n    }\n\n    let account = null;\n    let settings = null;\n'''
)

replace_once(
    api,
    '''      softwareUpdate,\n      maintenance,\n      partner,\n      tradeJournal\n''',
    '''      softwareUpdate,\n      startTransition,\n      maintenance,\n      partner,\n      tradeJournal\n'''
)

# 2) Backend: Settings cannot be changed while a START is pending or EA is RUNNING.
replace_once(
    api,
    '''    const instance = await this.getInstance(req.user.sub, slotId || null);\n    const clean: Record<string, any> = {};\n''',
    '''    const instance = await this.getInstance(req.user.sub, slotId || null);\n    if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") {\n      throw new ConflictException(\n        "การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · กดหยุดบอทและรอให้สถานะหยุดก่อนแก้ไข"\n      );\n    }\n    const clean: Record<string, any> = {};\n'''
)

# 3) Frontend dashboard contract.
replace_once(
    web,
    '''  softwareUpdate: any;\n  maintenance: any;\n''',
    '''  softwareUpdate: any;\n  startTransition: any;\n  maintenance: any;\n'''
)

# 4) Update warning must stay visible until versions match. No 3-second disappearing alert.
replace_once(
    web,
    '''  useEffect(() => {\n    if (!softwareUpdateRequired) {\n      setSoftwareUpdateAlertVisible(false);\n      return;\n    }\n    setSoftwareUpdateAlertVisible(true);\n    const timer = window.setTimeout(() => setSoftwareUpdateAlertVisible(false), 3000);\n    return () => window.clearTimeout(timer);\n  }, [softwareUpdateAlertKey]);\n''',
    '''  useEffect(() => {\n    // Version mismatch is an actionable state, not a toast. Keep it visible\n    // until Agent / EA / EX5 actually match the server again. Updates remain\n    // manual: detection only shows the persistent action; it never clicks it.\n    setSoftwareUpdateAlertVisible(softwareUpdateRequired);\n  }, [softwareUpdateAlertKey, softwareUpdateRequired]);\n'''
)

# 5) Explicit START phases + Settings lock.
replace_once(
    web,
    '''  const botStarting = desired === "RUNNING" && state !== "RUNNING";\n  const botRunning = state === "RUNNING";\n  const startConnectionReady = isMt5Online || isAgentOnline;\n''',
    '''  const botStarting = desired === "RUNNING" && state !== "RUNNING";\n  const botRunning = state === "RUNNING";\n  const startTransition = data?.startTransition || {};\n  const startPhase = String(startTransition.phase || (botRunning ? "RUNNING" : botStarting ? "COMMAND_QUEUED" : "IDLE"));\n  const startTimedOut = startPhase === "TIMEOUT";\n  const settingsLocked = botStarting || botRunning || desired === "RUNNING";\n  const startPhaseLabel: Record<string,string> = {\n    COMMAND_QUEUED: "ส่งคำสั่ง Start แล้ว · รอ EA รับคำสั่ง",\n    DELIVERED_TO_EA: "EA ได้รับคำสั่งแล้ว · รอยืนยัน RUNNING",\n    WAITING_HEARTBEAT: "EA รับคำสั่งแล้ว · รอ Heartbeat ยืนยัน",\n    RUNNING: "EA ยืนยัน RUNNING · ระบบกำลังทำงาน",\n    TIMEOUT: "Start Timeout · ยกเลิกคำสั่งค้างแล้ว",\n    IDLE: "พร้อมรับคำสั่ง"\n  };\n  const startConnectionReady = isMt5Online || isAgentOnline;\n'''
)

replace_once(
    web,
    '''  const controlStateLabel =\n    desired === "RUNNING"\n      ? (state === "RUNNING" ? "บอทกำลังทำงาน" : "กำลังเริ่มบอท")\n      : desired === "SAFE_STOP"\n        ? "Safe Stop — ไม่เปิดออเดอร์ใหม่"\n        : "บอทหยุดอยู่";\n''',
    '''  const controlStateLabel =\n    startTimedOut\n      ? "เริ่มบอทไม่สำเร็จ — พร้อมให้ลองใหม่"\n      : desired === "RUNNING"\n        ? (state === "RUNNING" ? "บอทกำลังทำงาน" : (startPhaseLabel[startPhase] || "กำลังเริ่มบอท"))\n        : desired === "SAFE_STOP"\n          ? "Safe Stop — ไม่เปิดออเดอร์ใหม่"\n          : "บอทหยุดอยู่";\n'''
)

# 6) Keep start feedback on screen; do not let the generic 3-second toast hide the actionable state.
replace_once(
    web,
    '''      await api(path + suffix, { method: "POST" });\n      setNotice(success);\n      await load();\n''',
    '''      await api(path + suffix, { method: "POST" });\n      setNotice(success);\n      await load();\n      if (path.startsWith("/bot/start")) {\n        // Pull the START transition sooner than the normal 10s dashboard poll.\n        window.setTimeout(() => void load(selectedSlotIdRef.current, true), 2500);\n        window.setTimeout(() => void load(selectedSlotIdRef.current, true), 6500);\n      }\n'''
)

# 7) Guard edits locally as well as on the API.
replace_once(
    web,
    '''  function editSetting(key: string, value: any) {\n    settingsDirtyRef.current = true;\n''',
    '''  function editSetting(key: string, value: any) {\n    if (settingsLocked) {\n      setError("การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · หยุดบอทก่อนแก้ไข");\n      return;\n    }\n    settingsDirtyRef.current = true;\n'''
)

replace_once(
    web,
    '''  async function saveSettings(e: FormEvent) {\n    e.preventDefault();\n    setBusy(true);\n''',
    '''  async function saveSettings(e: FormEvent) {\n    e.preventDefault();\n    if (settingsLocked) {\n      setError("การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · หยุดบอทก่อนบันทึก");\n      return;\n    }\n    setBusy(true);\n'''
)

# 8) Main Control Center card: clear START state and lock Settings button.
replace_once(
    web,
    '''                  <div className={"cc-v6-run-state "+(state==="RUNNING"?"running":state==="SAFE_STOP"?"safe":"stopped")}>\n                    <span className="cc-state-dot"/>\n                    <div><b>{state==="RUNNING"?"กำลังทำงาน":state==="SAFE_STOP"?"หยุดอย่างปลอดภัย":"บอทหยุดอยู่"}</b><small>{controlStateLabel} · อัปเดต {heartbeatAgeSeconds.toFixed(0)} วินาที</small></div>\n                  </div>\n''',
    '''                  <div className={"cc-v6-run-state "+(state==="RUNNING"?"running":state==="SAFE_STOP"?"safe":"stopped")}>\n                    <span className="cc-state-dot"/>\n                    <div>\n                      <b>{startTimedOut?"เริ่มบอทไม่สำเร็จ":botStarting?"กำลังเริ่มบอท":state==="RUNNING"?"กำลังทำงาน":state==="SAFE_STOP"?"หยุดอย่างปลอดภัย":"บอทหยุดอยู่"}</b>\n                      <small>{startTimedOut ? String(startTransition.message || startPhaseLabel.TIMEOUT) : botStarting ? (startPhaseLabel[startPhase] || controlStateLabel) : controlStateLabel} · Heartbeat {heartbeatAgeSeconds.toFixed(0)} วินาที</small>\n                    </div>\n                  </div>\n'''
)

replace_once(
    web,
    '''                    <button className="cc-v6-command settings" onClick={()=>setBotSettingsOpen(true)}><span><ScenovaIcon name="settings" size={21}/></span><b>ตั้งค่า</b><small>Settings</small></button>\n''',
    '''                    <button className="cc-v6-command settings" disabled={settingsLocked} title={settingsLocked?"หยุดบอทก่อนแก้ไขการตั้งค่า":"เปิดการตั้งค่า"} onClick={()=>!settingsLocked&&setBotSettingsOpen(true)}><span><ScenovaIcon name="settings" size={21}/></span><b>{settingsLocked?"ล็อกการตั้งค่า":"ตั้งค่า"}</b><small>{settingsLocked?"Stop bot to edit":"Settings"}</small></button>\n'''
)

# 9) Update wording makes the manual-only policy explicit.
replace_once(
    web,
    '''                <small>กล่องนี้จะแสดงเฉพาะเมื่อ Agent / EA / EX5 ไม่ตรงกับ Server เท่านั้น</small>\n''',
    '''                <small>ตรวจพบเวอร์ชันไม่ตรง · แจ้งเตือนนี้จะค้างจนกว่าจะอัปเดตสำเร็จ และระบบจะไม่อัปเดตอัตโนมัติ</small>\n'''
)

# Remove the one-shot patch machinery in the same hotfix commit.
for temporary in [Path("scripts/apply-start-control-hotfix.py"), Path(".github/workflows/apply-start-control-hotfix.yml")]:
    if temporary.exists():
        temporary.unlink()

print("SCENOVA start/settings/manual-update hotfix applied")
