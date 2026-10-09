"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "../../../lib/api";
import { OwnerSidebar, OwnerMobileNav } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import css from "./page.module.css";

type ModeRow = {
  mode: string; enabled: boolean; configured: number; running: number;
  draining: number; exposed: number; offline: number; reason: string | null;
};
const names: Record<string,string> = {
  AUTO: "AUTO", RACE: "RACE", COUNTER: "COUNTER",
  FLIP_LOCK: "FLIP LOCK", ZERO_GRID: "ZERO GRID", MANUAL: "MANUAL"
};
const descriptions: Record<string,string> = {
  AUTO: "VECTOR EDGE", RACE: "โหมด RACE", COUNTER: "โหมด COUNTER",
  FLIP_LOCK: "โหมด FLIP LOCK", ZERO_GRID: "โหมด ZERO GRID", MANUAL: "โหมด MANUAL"
};

export default function TradingModeControlsPage() {
  const [rows, setRows] = useState<ModeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [onlyDisabled, setOnlyDisabled] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi("/admin/trading-modes");
      setRows(Array.isArray(data?.modes) ? data.modes : []);
      setError("");
    } catch (e: any) {
      setError(String(e?.message || "โหลดสถานะโหมดไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  function logout() {
    localStorage.removeItem("bot_token");
    window.location.assign("/login");
  }
  async function updateMode(mode: ModeRow, enabled: boolean, why: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await adminApi("/admin/trading-modes", {
        method: "POST",
        body: JSON.stringify({ mode: mode.mode, enabled, reason: why })
      });
      setNotice(
        names[mode.mode] + (enabled ? " เปิดใช้งานแล้ว" : " ปิดโหมดและส่ง Safe Stop แล้ว") +
        (enabled ? " · จะไม่ Start บอทอัตโนมัติ" : " · ส่งคำสั่งให้ " + Number(result?.affected || 0) + " บอท")
      );
      setPendingDisable(null); setReason("");
      await load();
    } catch (e: any) {
      setError(String(e?.message || "เปลี่ยนสถานะโหมดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  const visible = onlyDisabled ? rows.filter(row => !row.enabled) : rows;
  const disabledCount = rows.filter(row => !row.enabled).length;

  return <div className="app-wrap owner-app">
    <OwnerSidebar activeKey="trading-modes" onLogout={logout}/>
    <main className={"main app-main owner-main " + css.main}>
      <div className="mobile-only mobile-app-head">
        <div className="brand-lockup scenova-brand-lockup">
          <ScenovaBrand className="scenova-brand-logo-mobile"/>
        </div>
        <button className="btn ghost" onClick={logout}>ออก</button>
      </div>
      <OwnerMobileNav activeKey="trading-modes"/>
      <div className={css.page}>
        <header className={css.header}>
          <div>
            <small>SCENOVA / OWNER / TRADING SAFETY</small>
            <h1>จัดการโหมดการเทรด</h1>
            <p>สวิตช์ควบคุมการใช้งานแต่ละโหมด · Cloud และ Local</p>
          </div>
          <div className={css.actions}>
            <Link href="/admin?view=overview" className={css.secondary}>← แอดมิน</Link>
            <button type="button" className={css.secondary} onClick={() => void load()} disabled={loading || busy}>↻ รีเฟรช</button>
          </div>
        </header>

        <section className={css.panel} aria-label="ควบคุมสถานะโหมดการเทรด">
          <div className={css.panelTop}>
            <div className={css.overview}>
              <span>โหมดทั้งหมด <b>{rows.length || 6}</b></span>
              <span className={disabledCount ? css.alertCount : ""}>ปิดชั่วคราว <b>{disabledCount}</b></span>
            </div>
            <label className={css.filter}>
              <input type="checkbox" checked={onlyDisabled} onChange={e => setOnlyDisabled(e.target.checked)}/>
              แสดงเฉพาะโหมดที่ปิด
            </label>
          </div>

          {error && <div role="alert" className={css.error}>{error}</div>}
          {notice && <div role="status" className={css.notice}>{notice}</div>}

          {loading ? <p className={css.loading}>กำลังโหลดสถานะ…</p> :
            <div className={css.modeList}>
              {visible.map(mode => {
                const confirming = pendingDisable === mode.mode;
                return <div className={css.modeGroup} key={mode.mode}>
                  <div className={css.modeRow}>
                    <div className={css.identity}>
                      <span className={css.modeName}>{names[mode.mode] || mode.mode}</span>
                      <span className={css.modeMeta}>{descriptions[mode.mode] || ""}</span>
                    </div>
                    <div className={css.metrics} aria-label="ข้อมูลบอทในโหมดนี้">
                      <span>ใช้งาน <b>{mode.configured}</b></span>
                      {mode.running > 0 && <span className={css.running}>กำลังทำงาน <b>{mode.running}</b></span>}
                      {mode.draining > 0 && <span className={css.draining}>Safe Stop <b>{mode.draining}</b></span>}
                    </div>
                    <div className={css.controls}>
                      <span className={mode.enabled ? css.onLabel : css.offLabel}>
                        {mode.enabled ? "เปิด" : "ปิด"}
                      </span>
                      <button type="button" role="switch" aria-checked={mode.enabled}
                        aria-label={(mode.enabled ? "ปิด" : "เปิด") + "โหมด " + (names[mode.mode] || mode.mode)}
                        className={css.switch} data-on={mode.enabled}
                        disabled={busy || Boolean(pendingDisable)}
                        onClick={() => {
                          setError(""); setNotice("");
                          if (mode.enabled) {
                            setPendingDisable(mode.mode); setReason("");
                          } else {
                            void updateMode(mode, true, "OWNER_REOPEN");
                          }
                        }}>
                        <span className={css.knob}/>
                      </button>
                      <details className={css.details}>
                        <summary aria-label={"รายละเอียดโหมด " + mode.mode} title="ดูรายละเอียด">ⓘ</summary>
                        <div className={css.detailBody}>
                          <span>ตั้งค่าโหมดนี้: <b>{mode.configured}</b></span>
                          <span>กำลังทำงาน/รอ Start: <b>{mode.running}</b></span>
                          <span>กำลัง Safe Stop: <b>{mode.draining}</b></span>
                          <span>มีออเดอร์จากรายงานล่าสุด: <b>{mode.exposed}</b></span>
                          <span>Heartbeat ไม่สด: <b>{mode.offline}</b></span>
                          {!mode.enabled && mode.reason && <span className={css.reason}>เหตุผล: {mode.reason}</span>}
                        </div>
                      </details>
                    </div>
                  </div>
                  {confirming && <div className={css.confirm}>
                    <strong>ปิด {names[mode.mode]} แบบ Safe Stop?</strong>
                    <p>บล็อกการ Start รอบใหม่ และให้ EA ดูแลออเดอร์เดิมต่อ · ไม่บังคับ Close All</p>
                    <div className={css.confirmControls}>
                      <input type="text" aria-label="เหตุผลการปิดโหมด" placeholder="เหตุผลการปิดโหมด (จำเป็น)"
                        value={reason} maxLength={240} onChange={e => setReason(e.target.value)}/>
                      <button className={css.cancel} disabled={busy}
                        onClick={() => { setPendingDisable(null); setReason(""); }}>ยกเลิก</button>
                      <button className={css.confirmButton} disabled={busy || !reason.trim()}
                        onClick={() => void updateMode(mode, false, reason.trim())}>
                        {busy ? "กำลังปิด…" : "ยืนยัน Safe Stop"}
                      </button>
                    </div>
                    {mode.mode === "ZERO_GRID" && <p className={css.caution}>
                      ZERO GRID ที่ใช้ EA รุ่นเก่าหรือมี Pending ขณะ EA ออฟไลน์ ระบบจะปฏิเสธการปิดเพื่อความปลอดภัย
                    </p>}
                  </div>}
                </div>;
              })}
              {visible.length === 0 && <p className={css.empty}>ไม่มีโหมดที่ปิดอยู่</p>}
            </div>}
        </section>

        <details className={css.help}>
          <summary>ⓘ Safe Stop ทำงานอย่างไร?</summary>
          <p>เมื่อปิดโหมด Backend จะป้องกันการ Start และส่ง Safe Stop ให้บอทที่กำลังทำงาน EA จะดูแล Position เดิมจนหยุดได้อย่างปลอดภัย โดยไม่ปิด MT5 และไม่บังคับ Close All</p>
          <p>ZERO GRID ต้องใช้ EA ที่รองรับการยกเลิก Pending Orders อย่างปลอดภัย เมื่อเปิดโหมดกลับ ระบบจะไม่ Start ให้ลูกค้าเอง</p>
        </details>
      </div>
    </main>
  </div>;
}
