"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./trading-symbol.module.css";

const SYMBOL_PATTERN = /^[A-Za-z0-9._#-]+$/;

function tradeModeLabel(mode: any) {
  const n = Number(mode);
  if (!Number.isFinite(n)) return "รอข้อมูลจาก MT5";
  if (n === 0) return "Disabled";
  if (n === 1) return "Long Only";
  if (n === 2) return "Short Only";
  if (n === 3) return "Close Only";
  if (n === 4) return "Full Trading";
  return "Mode " + n;
}

export default function TradingSymbolPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [slotId, setSlotId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(preferredSlotId = slotId) {
    try {
      const suffix = preferredSlotId ? "?slotId=" + encodeURIComponent(preferredSlotId) + "&light=1" : "?light=1";
      let dashboard = await api("/bot/dashboard" + suffix);
      const localSlots = (dashboard.slots || []).filter((item:any) => String(item.mode || "").toUpperCase() === "LOCAL" && item.can_control !== false);
      if (String(dashboard.selectedSlot?.mode || "").toUpperCase() !== "LOCAL" && localSlots.length > 0) {
        const nextSlot = String(localSlots[0].id);
        dashboard = await api("/bot/dashboard?slotId=" + encodeURIComponent(nextSlot) + "&light=1");
        preferredSlotId = nextSlot;
      }
      const selected = String(dashboard.selectedSlot?.id || preferredSlotId || "");
      setSlotId(selected);
      setData(dashboard);

      if (selected && String(dashboard.selectedSlot?.mode || "").toUpperCase() === "LOCAL") {
        const symbolStatus = await api("/bot/trading-symbol?slotId=" + encodeURIComponent(selected));
        setStatus(symbolStatus);
        if (!dirty) {
          const reported = Array.isArray(symbolStatus.marketWatchSymbols)
            ? symbolStatus.marketWatchSymbols.map((item:any)=>String(item || "")).filter(Boolean)
            : [];
          const desired = String(symbolStatus.desiredSymbol || "");
          const active = String(symbolStatus.activeSymbol || "");
          const match = (value:string) => reported.find((item:string)=>item.toUpperCase() === value.toUpperCase());
          setSymbol(match(desired) || match(active) || reported[0] || desired || active || "");
        }
      } else {
        setStatus(null);
      }
    } catch (e:any) {
      setError(String(e?.message || "โหลดข้อมูล Symbol ไม่สำเร็จ"));
    }
  }

  useEffect(() => {
    void load("");
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
    // Poll live MT5/Agent verification. Local edits are protected by `dirty`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId, dirty]);

  const localSlots = useMemo(
    () => (data?.slots || []).filter((item:any) => String(item.mode || "").toUpperCase() === "LOCAL" && item.can_control !== false),
    [data]
  );
  const metrics = data?.instance?.metrics || {};
  const activeSymbol = String(status?.activeSymbol || metrics.symbol || "");
  const desiredSymbol = String(status?.desiredSymbol || symbol || "");
  const positions = Number(status?.positions ?? metrics.positions ?? 0);
  const actualState = String(status?.actualState || data?.instance?.actual_state || "STOPPED").toUpperCase();
  const desiredState = String(status?.desiredState || data?.instance?.desired_state || "STOPPED").toUpperCase();
  const stopped = actualState !== "RUNNING" && desiredState !== "RUNNING";
  const brokerAllowed = status?.brokerTradingAllowed;
  const exactMatch = Boolean(activeSymbol && desiredSymbol && activeSymbol.toUpperCase() === desiredSymbol.toUpperCase());
  const ready = exactMatch && brokerAllowed !== false;
  const marketWatchSymbols = Array.isArray(status?.marketWatchSymbols)
    ? status.marketWatchSymbols.map((item:any)=>String(item || "")).filter(Boolean)
    : [];
  const symbolOptions = marketWatchSymbols.length > 0
    ? marketWatchSymbols
    : [desiredSymbol || activeSymbol].filter(Boolean);

  async function refreshSymbols() {
    if (!slotId || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const symbolStatus = await api("/bot/trading-symbol?slotId=" + encodeURIComponent(slotId));
      setStatus(symbolStatus);
      const reported = Array.isArray(symbolStatus.marketWatchSymbols)
        ? symbolStatus.marketWatchSymbols.map((item:any)=>String(item || "")).filter(Boolean)
        : [];
      const desired = String(symbolStatus.desiredSymbol || "");
      const active = String(symbolStatus.activeSymbol || "");
      const current = symbol.trim();
      const match = (value:string) => reported.find((item:string)=>item.toUpperCase() === value.toUpperCase());
      const selected = match(current) || match(desired) || match(active) || reported[0] || current || desired || active || "";
      setSymbol(selected);
      if (!current || selected.toUpperCase() !== current.toUpperCase()) setDirty(false);
      setNotice(reported.length > 0
        ? "รีเฟรชรายการ Symbol จาก MT5 Market Watch แล้ว"
        : "ยังไม่ได้รับรายการ Market Watch จาก EA เวอร์ชันล่าสุด");
    } catch (e:any) {
      setError(String(e?.message || "รีเฟรชรายการ Symbol ไม่สำเร็จ"));
    } finally {
      setRefreshing(false);
    }
  }

  async function saveAndApply() {
    const next = symbol.trim();
    setError("");
    setNotice("");
    if (!next || next.length > 64 || !SYMBOL_PATTERN.test(next)) {
      setError("กรุณากรอกชื่อ Symbol ให้ตรงกับ MT5 Market Watch เช่น XAUUSDm, EURUSDm หรือ BTCUSDm");
      return;
    }
    if (!slotId) {
      setError("ไม่พบ Local MT5 Slot");
      return;
    }
    if (!stopped || positions > 0) {
      setError("ต้องหยุดบอทและปิด Position ให้หมดก่อนเปลี่ยน Symbol");
      return;
    }

    setBusy(true);
    try {
      const result = await api("/bot/trading-symbol?slotId=" + encodeURIComponent(slotId), {
        method: "PUT",
        body: JSON.stringify({ symbol: next })
      });
      setDirty(false);

      if (result.symbolChangeRequiresReconnect) {
        await api("/bot/mt5/manual-action?slotId=" + encodeURIComponent(slotId), {
          method: "POST",
          body: JSON.stringify({ action: "CONNECT_MT5" })
        });
        setNotice("บันทึก " + next + " แล้ว · SCENOVA กำลังรีสตาร์ท MT5 1 ครั้งเพื่อโหลด Chart/EA บน Symbol นี้");
      } else {
        setNotice("บันทึก " + next + " แล้ว · EA กำลังใช้ Symbol นี้อยู่");
      }
      window.setTimeout(() => void load(slotId), 1200);
    } catch (e:any) {
      setError(String(e?.message || "เปลี่ยน Symbol ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("bot_token");
    router.push("/login");
  }

  return (
    <main className={styles.shell}>
      <OwnerSidebar activeKey="trading-symbol" onLogout={logout}/>
      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>SCENOVA · BROKER-BOUND SYMBOL</span>
            <h1>เลือกคู่เทรด / Trading Symbol</h1>
            <p>เลือกได้อิสระตาม Symbol ที่บัญชี MT5 และ Broker ของลูกค้ามีให้เทรดจริง</p>
          </div>
          <div className={ready ? styles.readyBadge : styles.waitBadge}>
            <span/>{ready ? "SYMBOL READY" : "WAITING VERIFY"}
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}><ScenovaIcon name="trend" size={20}/><div><b>Symbol ที่ต้องการเทรด</b><small>ใช้ชื่อให้ตรงกับ Market Watch ของ Broker ทุกตัวอักษร รวม suffix เช่น m</small></div></div>

            <label className={styles.field}>
              <span>Local MT5 Slot</span>
              <select
                value={slotId}
                onChange={(e)=>{ setSlotId(e.target.value); setDirty(false); setError(""); }}
                disabled={busy || localSlots.length <= 1}
              >
                {localSlots.map((item:any)=><option key={item.id} value={item.id}>{item.label || "Local MT5"} · {item.account_number || "รอ MT5"}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span>Trading Symbol · จาก MT5 Market Watch</span>
              <div className={styles.symbolInputRow}>
                <select
                  value={symbol}
                  onChange={(e)=>{ setSymbol(e.target.value); setDirty(true); setNotice(""); }}
                  disabled={busy || refreshing || symbolOptions.length === 0}
                >
                  {symbolOptions.length === 0
                    ? <option value="">กำลังรอรายการ Symbol จาก MT5...</option>
                    : symbolOptions.map((item:string)=><option key={item} value={item}>{item}</option>)}
                </select>
                <button type="button" className={styles.refreshButton} onClick={refreshSymbols} disabled={busy || refreshing || !slotId}>
                  {refreshing ? "กำลังรีเฟรช..." : "↻ Refresh"}
                </button>
                <button onClick={saveAndApply} disabled={busy || refreshing || !stopped || positions > 0 || !status?.agentOnline || !symbol}>
                  {busy ? "กำลังตรวจ..." : "บันทึกและใช้ Symbol นี้"}
                </button>
              </div>
            </label>

            <div className={styles.examples}>
              <b>รองรับตาม Broker:</b> Forex, Gold/Silver, Crypto, Index และคู่ USDC / THB / สกุลเงินอื่น ๆ ถ้า Server MT5 ของ Broker มี Symbol นั้นจริง
            </div>
            <div className={styles.warning}>
              SCENOVA จะไม่สร้าง Symbol ที่ Broker ไม่มี และจะไม่ Start บอทถ้า Chart/EA ยังไม่ตรงกับ Symbol ที่เลือก หรือ Broker ตั้ง Symbol เป็น Disabled / Close Only
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}><ScenovaIcon name="shield" size={20}/><div><b>ตรวจสอบก่อนเทรด</b><small>ข้อมูลจริงจาก EA / MT5 / Broker</small></div></div>
            <div className={styles.statusRows}>
              <div><span>เลือกไว้</span><strong>{desiredSymbol || "—"}</strong></div>
              <div><span>EA กำลังรันบน</span><strong className={exactMatch ? styles.good : styles.warn}>{activeSymbol || "—"}</strong></div>
              <div><span>Broker Trade Mode</span><strong className={brokerAllowed === false ? styles.bad : styles.good}>{tradeModeLabel(status?.brokerSymbolTradeMode)}</strong></div>
              <div><span>Position</span><strong>{positions}</strong></div>
              <div><span>Bot State</span><strong>{actualState}</strong></div>
              <div><span>Windows Agent</span><strong className={status?.agentOnline ? styles.good : styles.bad}>{status?.agentOnline ? "Online · v" + (status.agentVersion || "—") : "Offline"}</strong></div>
            </div>
            {!stopped || positions > 0 ? <div className={styles.blocker}>เปลี่ยน Symbol ไม่ได้ระหว่างบอท RUNNING หรือมี Position ค้าง</div> : null}
            {status?.agentOnline === false ? <div className={styles.blocker}>Windows Agent ต้อง Online ก่อน จึงจะสั่ง MT5 โหลด Symbol ใหม่ได้</div> : null}
            {metrics.manualMt5ActionStatus === "PENDING" ? <div className={styles.progress}>กำลังรอ MT5/EA เชื่อมกลับมาและตรวจ Broker…</div> : null}
            {metrics.manualMt5ActionStatus === "FAILED" ? <div className={styles.blocker}>{String(metrics.manualMt5ActionMessage || "การเชื่อม MT5 ไม่สำเร็จ กรุณาตรวจชื่อ Symbol")}</div> : null}
          </div>
        </section>

        <section className={styles.help}>
          <h2>วิธีใช้</h2>
          <p>เปิด MT5 → Market Watch → เพิ่ม Symbol ที่ต้องการให้แสดง → กลับมาหน้านี้แล้วกด Refresh → เลือก Symbol จากรายการ → หยุดบอท/ไม่มี Position → กด “บันทึกและใช้ Symbol นี้” ระบบจะรีสตาร์ท MT5 เพียง 1 รอบและยืนยัน Symbol จาก Heartbeat ก่อนอนุญาต Start</p>
        </section>
      </section>
    </main>
  );
}
