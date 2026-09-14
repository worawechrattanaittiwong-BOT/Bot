from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


service_path = Path("apps/api/src/maintenance.service.ts")
service = service_path.read_text(encoding="utf-8")

service = replace_once(
    service,
    '''    return result.rowCount || 0;\n  }\n\n  private async ensureDrainCommands(forceClose: boolean) {''',
    '''    return result.rowCount || 0;\n  }\n\n  // OWNER/ADMIN may reconcile only stale cached Position snapshots during an\n  // explicit maintenance action. Fresh MT5 heartbeats remain authoritative and\n  // are never cleared by this override. Every override is written to audit_logs.\n  private async reconcileAdminStalePositions(actor: string) {\n    const reconciledAt = new Date().toISOString();\n    const reconciledBy = actor.slice(0, 120);\n    const result = await this.db.query(\n      `${this.runtimeCte()}\n       UPDATE bot_instances bi\n       SET desired_state='STOPPED',\n           metrics=COALESCE(bi.metrics,'{}'::jsonb) || jsonb_build_object(\n             'lastKnownPositionsBeforeAdminOverride',r.reported_positions,\n             'positions',0,\n             'positionsReconciledAt',$1::text,\n             'positionsReconcileReason','ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT',\n             'positionsReconciledBy',$2::text\n           )\n       FROM runtime r\n       WHERE bi.id=r.id\n         AND NOT r.mt5_fresh\n         AND r.reported_positions>0\n         AND bi.desired_state<>'RUNNING'\n       RETURNING bi.id,r.reported_positions`,\n      [reconciledAt, reconciledBy]\n    );\n\n    for (const row of result.rows) {\n      await this.db.query(\n        \"INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'ADMIN_RECONCILE_STALE_MT5_POSITIONS','bot_instance',$2,$3::jsonb)\",\n        [\n          reconciledBy,\n          row.id,\n          JSON.stringify({\n            previousReportedPositions: Number(row.reported_positions || 0),\n            reconciledAt,\n            reason: \"ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT\"\n          })\n        ]\n      );\n    }\n    return result.rowCount || 0;\n  }\n\n  private async ensureDrainCommands(forceClose: boolean) {''',
    "insert admin stale reconcile helper",
)

service = replace_once(
    service,
    '''      `SELECT bi.id,bi.actual_state,bi.desired_state,bi.last_seen_at,\n              COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS positions,\n              u.user_code,a.account_number,a.broker_server''',
    '''      `SELECT bi.id,bi.actual_state,bi.desired_state,bi.last_seen_at,\n              COALESCE(NULLIF(bi.metrics->>'lastServerContactAt','')::double precision,0) AS mt5_report_epoch,\n              COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS positions,\n              u.user_code,a.account_number,a.broker_server''',
    "include MT5 freshness in per-account admin action",
)

service = replace_once(
    service,
    '''    await this.db.query("UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1", [id]);\n    await this.db.query(\n      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",\n      [id]\n    );''',
    '''    await this.db.query("UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1", [id]);\n\n    const mt5ReportEpoch = Number(instance.mt5_report_epoch || 0);\n    const lastSeenEpoch = instance.last_seen_at\n      ? new Date(instance.last_seen_at).getTime() / 1000\n      : 0;\n    const reportEpoch = mt5ReportEpoch > 0 ? mt5ReportEpoch : lastSeenEpoch;\n    const positionsFresh = reportEpoch > Date.now() / 1000 - 20;\n\n    // The Admin button is authoritative for a stale server snapshot. There is\n    // no live EA to receive CLOSE_ALL in this case, so keeping the cached count\n    // would deadlock Maintenance forever. Clear only the stale cache and audit it.\n    if (!positionsFresh) {\n      const reconciledAt = new Date().toISOString();\n      const reconciledBy = actor.slice(0, 120);\n      await this.db.query(\n        `UPDATE bot_instances\n         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(\n           'lastKnownPositionsBeforeAdminOverride',$1::int,\n           'positions',0,\n           'positionsReconciledAt',$2::text,\n           'positionsReconcileReason','ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT',\n           'positionsReconciledBy',$3::text\n         )\n         WHERE id=$4`,\n        [Number(instance.positions || 0), reconciledAt, reconciledBy, id]\n      );\n      await this.db.query(\n        \"INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'ADMIN_RECONCILE_STALE_MT5_POSITIONS','bot_instance',$2,$3::jsonb)\",\n        [\n          reconciledBy,\n          id,\n          JSON.stringify({\n            previousReportedPositions: Number(instance.positions || 0),\n            reconciledAt,\n            reason: \"ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT\"\n          })\n        ]\n      );\n      await this.tryFinishDrain();\n      return {\n        ok: true,\n        queued: false,\n        reconciled: true,\n        instanceId: id,\n        userCode: instance.user_code || null,\n        accountNumber: instance.account_number || null,\n        brokerServer: instance.broker_server || null,\n        positions: Number(instance.positions || 0),\n        message: \"ข้อมูล Position เป็น snapshot เก่าและไม่มี heartbeat สด จึงล้างสถานะค้างด้วยสิทธิ์ Admin แล้ว\"\n      };\n    }\n\n    await this.db.query(\n      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",\n      [id]\n    );''',
    "reconcile stale per-account close action",
)

service = replace_once(
    service,
    '''    if (existing.status === "MAINTENANCE") return this.snapshot();''',
    '''    if (existing.status === "MAINTENANCE") {\n      const adminReconciledStalePositions = await this.reconcileAdminStalePositions(actor);\n      const snapshot = await this.snapshot();\n      return { ...snapshot, adminReconciledStalePositions };\n    }''',
    "allow repeated admin shutdown to clear stale snapshots",
)

service = replace_once(
    service,
    '''    await this.reconcileAckedCloseAll();\n    await this.ensureDrainCommands(true);\n    await this.tryFinishDrain();\n    return this.snapshot();\n  }\n\n  async cancel(actor: string) {''',
    '''    await this.reconcileAckedCloseAll();\n    await this.ensureDrainCommands(true);\n    const adminReconciledStalePositions = await this.reconcileAdminStalePositions(actor);\n    await this.tryFinishDrain();\n    const snapshot = await this.snapshot();\n    return { ...snapshot, adminReconciledStalePositions };\n  }\n\n  async cancel(actor: string) {''',
    "make admin shutdown reconcile stale blockers",
)

old_resume = '''  async resume(actor: string) {\n    const current = await this.current();\n    if (current.status === "DRAINING") {\n      const blockers = await this.liveBlockers();\n      if (Number(blockers?.running || 0) > 0 || Number(blockers?.positions || 0) > 0) {\n        throw new ConflictException("ยังมี Bot Running หรือ Position ที่ MT5 ยังไม่ยืนยันว่าเป็น 0 ระบบยังเปิดกลับไม่ได้");\n      }\n      await this.tryFinishDrain();\n    }\n\n    const refreshed = await this.row();\n    if (refreshed?.status !== "MAINTENANCE") {\n      throw new ConflictException("ระบบไม่ได้อยู่ในโหมด Maintenance");\n    }\n\n    await this.db.query(\n      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'RUNNING'"\n    );\n    await this.db.query(\n      `UPDATE system_maintenance\n       SET status='OFF',title=NULL,message=NULL,maintenance_at=NULL,force_close_at=NULL,\n           expected_resume_at=NULL,force_close=true,resumed_at=now(),updated_by=$1,updated_at=now()\n       WHERE id=1`,\n      [actor.slice(0, 120)]\n    );\n    return this.snapshot();\n  }'''
new_resume = '''  async resume(actor: string) {\n    const current = await this.current();\n    if (current.status !== "DRAINING" && current.status !== "MAINTENANCE") {\n      throw new ConflictException("ระบบไม่ได้อยู่ในขั้นตอนปิดปรับปรุง");\n    }\n\n    // OWNER/ADMIN can clear stale cached snapshots before reopening, but a fresh\n    // MT5 heartbeat that still reports RUNNING/Position remains a hard safety stop.\n    await this.reconcileAdminStalePositions(actor);\n    const blockers = await this.liveBlockers();\n    if (Number(blockers?.running || 0) > 0 || Number(blockers?.positions || 0) > 0) {\n      throw new ConflictException("ยังมี MT5 ที่ออนไลน์และยืนยัน Bot Running หรือ Position จริง ระบบยังเปิดกลับไม่ได้");\n    }\n\n    if (current.status === "DRAINING") {\n      await this.tryFinishDrain();\n    }\n\n    const refreshed = await this.row();\n    if (refreshed?.status !== "MAINTENANCE") {\n      throw new ConflictException("ระบบไม่ได้อยู่ในโหมด Maintenance");\n    }\n\n    await this.db.query(\n      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'RUNNING'"\n    );\n    await this.db.query(\n      `UPDATE system_maintenance\n       SET status='OFF',title=NULL,message=NULL,maintenance_at=NULL,force_close_at=NULL,\n           expected_resume_at=NULL,force_close=true,resumed_at=now(),updated_by=$1,updated_at=now()\n       WHERE id=1`,\n      [actor.slice(0, 120)]\n    );\n    return this.snapshot();\n  }'''
service = replace_once(service, old_resume, new_resume, "admin resume stale override")
service_path.write_text(service, encoding="utf-8")


ui_path = Path("apps/web/app/admin/page.tsx")
ui = ui_path.read_text(encoding="utf-8")

old_shutdown = '''  async function shutdownForMaintenance() {\n    if (!confirm(\n      "ปิดระบบอย่างปลอดภัยตอนนี้หรือไม่?\\n\\n" +\n      "ระบบจะบล็อก Start ใหม่ สั่งหยุดทุกบอท และส่ง Close All ให้บัญชีที่ยังมี Position ค้างอยู่"\n    )) return;\n    setMaintenanceBusy(true);\n    try {\n      await adminApi("/admin/maintenance/shutdown", {\n        method: "POST",\n        body: JSON.stringify({ message: maintenanceMessage })\n      });\n      setMessage("เริ่ม Safe Shutdown แล้ว ระบบกำลังรอ Position ทุกบัญชีเป็น 0");\n      await search(undefined, true);\n    } catch (e:any) {\n      setMessage(e.message);\n    } finally {\n      setMaintenanceBusy(false);\n    }\n  }'''
new_shutdown = '''  async function shutdownForMaintenance() {\n    if (!confirm(\n      "ปิดระบบด้วยสิทธิ์ Admin ตอนนี้หรือไม่?\\n\\n" +\n      "ระบบจะบล็อก Start ใหม่ สั่งหยุดทุกบอท ส่ง Close All ให้ MT5 ที่ออนไลน์ และล้างเฉพาะ Position snapshot ที่เก่า/ขาด heartbeat เพื่อไม่ให้ Maintenance ค้าง"\n    )) return;\n    setMaintenanceBusy(true);\n    try {\n      const result = await adminApi("/admin/maintenance/shutdown", {\n        method: "POST",\n        body: JSON.stringify({ message: maintenanceMessage })\n      });\n      const cleared = Number(result?.adminReconciledStalePositions || 0);\n      setMessage(\n        cleared > 0\n          ? `ปิดระบบแล้ว · ล้างสถานะ Position ค้างแบบ stale ${cleared} บัญชี · MT5 ที่ยังออนไลน์จะต้องยืนยัน Position เป็น 0`\n          : "เริ่มปิดระบบแล้ว ระบบกำลังรอเฉพาะ MT5 ที่ออนไลน์ให้ยืนยัน Position เป็น 0"\n      );\n      await search(undefined, true);\n    } catch (e:any) {\n      setMessage(e.message);\n    } finally {\n      setMaintenanceBusy(false);\n    }\n  }'''
ui = replace_once(ui, old_shutdown, new_shutdown, "admin shutdown UI")

old_force_close = '''  async function forceCloseMaintenanceAccount(item:any) {\n    const positions = Number(item?.positions || 0);\n    if (positions <= 0) return setMessage("บัญชีนี้ไม่มี Position ค้างให้ปิด");\n    const accountLabel = [item?.user_code, item?.account_number, item?.broker_server].filter(Boolean).join(" · ");\n    if (!confirm(\n      "ยืนยันบังคับปิด Position ทั้งหมดของบัญชีนี้?\\n\\n" +\n      accountLabel + "\\n" + positions + " Position\\n\\nระบบจะส่งคำสั่ง Close All ไปยัง EA ของบัญชีนี้และหยุดการเปิดรอบใหม่"\n    )) return;\n    setMaintenanceActionId(String(item.instance_id || ""));\n    try {\n      const result = await adminApi("/admin/maintenance/close-instance", {\n        method: "POST",\n        body: JSON.stringify({ instanceId: item.instance_id })\n      });\n      setMessage(result?.message || "ส่งคำสั่ง Close All ให้บัญชีนี้แล้ว");\n      await search(undefined, true);\n    } catch (e:any) {\n      setMessage(e.message);\n    } finally {\n      setMaintenanceActionId("");\n    }\n  }'''
new_force_close = '''  async function forceCloseMaintenanceAccount(item:any) {\n    const positions = Number(item?.positions || 0);\n    if (positions <= 0) return setMessage("บัญชีนี้ไม่มี Position ค้างให้ปิด");\n    const accountLabel = [item?.user_code, item?.account_number, item?.broker_server].filter(Boolean).join(" · ");\n    const stale = item?.positions_fresh === false;\n    const detail = stale\n      ? "ข้อมูลนี้เป็น Position snapshot เก่าและไม่มี heartbeat สด\\nสิทธิ์ Admin จะล้างสถานะค้างบน Server โดยเก็บ Audit ไว้"\n      : "ระบบจะส่งคำสั่ง Close All ไปยัง EA ของบัญชีนี้และหยุดการเปิดรอบใหม่";\n    if (!confirm(\n      "ยืนยันจัดการ Position ของบัญชีนี้?\\n\\n" +\n      accountLabel + "\\n" + positions + " Position\\n\\n" + detail\n    )) return;\n    setMaintenanceActionId(String(item.instance_id || ""));\n    try {\n      const result = await adminApi("/admin/maintenance/close-instance", {\n        method: "POST",\n        body: JSON.stringify({ instanceId: item.instance_id })\n      });\n      setMessage(result?.message || "จัดการ Position ของบัญชีนี้แล้ว");\n      await search(undefined, true);\n    } catch (e:any) {\n      setMessage(e.message);\n    } finally {\n      setMaintenanceActionId("");\n    }\n  }'''
ui = replace_once(ui, old_force_close, new_force_close, "per-account stale UI")

ui = replace_once(
    ui,
    '''                {maintenance.status === "MAINTENANCE" && <button className="btn primary" disabled={maintenanceBusy} onClick={resumeMaintenance}>เปิดระบบหลังอัปเดต</button>}''',
    '''                {(maintenance.status === "DRAINING" || maintenance.status === "MAINTENANCE") && (\n                  <button className="btn primary" disabled={maintenanceBusy} onClick={resumeMaintenance}>\n                    {maintenance.status === "DRAINING" ? "เปิดระบบ (เคลียร์สถานะค้าง)" : "เปิดระบบหลังอัปเดต"}\n                  </button>\n                )}''',
    "show resume button while draining",
)

ui = replace_once(
    ui,
    '''                          <small>{item.broker_server || "—"} · {item.actual_state}/{item.desired_state}</small>''',
    '''                          <small>\n                            {item.broker_server || "—"} · {item.actual_state}/{item.desired_state} · {item.positions_fresh === false ? "ข้อมูลเก่า/ขาด heartbeat" : "MT5 สด"}\n                          </small>''',
    "show blocker freshness",
)

ui = replace_once(
    ui,
    '''                          {maintenanceActionId === item.instance_id ? "กำลังส่งคำสั่ง..." : "ปิดทุก Position"}''',
    '''                          {maintenanceActionId === item.instance_id\n                            ? "กำลังดำเนินการ..."\n                            : item.positions_fresh === false\n                              ? "ล้างสถานะค้าง (Admin)"\n                              : "ปิดทุก Position"}''',
    "label stale admin action",
)

ui_path.write_text(ui, encoding="utf-8")


test_path = Path("tests/admin-maintenance-stale-override-contract.ps1")
test_path.write_text(r'''$ErrorActionPreference = 'Stop'\n\n$service = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/maintenance.service.ts'))\n$ui = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/admin/page.tsx'))\n\n$checks = @(\n  @{ Name = 'admin stale reconcile reason'; Text = $service; Pattern = 'ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT' },\n  @{ Name = 'admin stale reconcile audit'; Text = $service; Pattern = 'ADMIN_RECONCILE_STALE_MT5_POSITIONS' },\n  @{ Name = 'shutdown invokes admin stale reconcile'; Text = $service; Pattern = 'const adminReconciledStalePositions = await this.reconcileAdminStalePositions(actor);' },\n  @{ Name = 'resume reconciles stale cache'; Text = $service; Pattern = 'await this.reconcileAdminStalePositions(actor);' },\n  @{ Name = 'fresh MT5 remains safety blocker'; Text = $service; Pattern = 'ยังมี MT5 ที่ออนไลน์และยืนยัน Bot Running หรือ Position จริง' },\n  @{ Name = 'draining exposes reopen button'; Text = $ui; Pattern = 'เปิดระบบ (เคลียร์สถานะค้าง)' },\n  @{ Name = 'stale account action is explicit'; Text = $ui; Pattern = 'ล้างสถานะค้าง (Admin)' },\n  @{ Name = 'freshness is visible to Admin'; Text = $ui; Pattern = 'ข้อมูลเก่า/ขาด heartbeat' }\n)\n\nforeach ($check in $checks) {\n  if ($check.Text -notlike ('*' + $check.Pattern + '*')) {\n    throw ('Missing contract: ' + $check.Name)\n  }\n}\n\nWrite-Host 'Admin maintenance stale-position override contract PASS'\n'''.replace('\\n', '\n'), encoding="utf-8")

ci_path = Path(".github/workflows/ci.yml")
ci = ci_path.read_text(encoding="utf-8")
ci = replace_once(
    ci,
    '''      - name: Market-closed heartbeat and status contract\n        shell: pwsh\n        run: ./tests/market-closed-heartbeat-contract.ps1\n      - name: Live price chart 15-minute contract''',
    '''      - name: Market-closed heartbeat and status contract\n        shell: pwsh\n        run: ./tests/market-closed-heartbeat-contract.ps1\n      - name: Admin maintenance stale-position override contract\n        shell: pwsh\n        run: ./tests/admin-maintenance-stale-override-contract.ps1\n      - name: Live price chart 15-minute contract''',
    "add admin maintenance contract to CI",
)
ci_path.write_text(ci, encoding="utf-8")

# Bootstrap files are intentionally removed from the resulting branch commit.
for bootstrap in [
    Path("scripts/patch_admin_maintenance_stale_override.py"),
    Path(".github/workflows/apply-admin-maintenance-stale-override.yml"),
]:
    if bootstrap.exists():
        bootstrap.unlink()

print("Applied Admin maintenance stale-position override patch")
