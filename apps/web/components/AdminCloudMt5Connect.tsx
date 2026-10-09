"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../lib/api";
import { Mt5ConnectChecklist, isCloudMt5ConnectionComplete } from "./Mt5ConnectChecklist";
import styles from "./AdminCloudMt5Connect.module.css";

type Broker = { code:string; name:string; servers:Array<{serverName:string;environment:string}> };
type Status = {
  accountNumber:string; broker:string; brokerServer:string; runnerOnline:boolean;
  terminalOnline:boolean; eaHeartbeat:boolean; cloudControlReady:boolean;
  brokerConnected:boolean|null; symbols:string[]; startupSymbol:string;
  activeSymbol:string; symbolConfirmed:boolean; provisioningError:string;
  actualState:string; desiredState:string;
};
type Props = {
  userId:string; userCode:string; slotId:string; slotNumber:number;
  linkedAccount?:string; onLinked:()=>Promise<void>;
  onMessage:(message:string)=>void;
};

export function AdminCloudMt5Connect({
  userId,userCode,slotId,slotNumber,linkedAccount,onLinked,onMessage
}:Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open,setOpen] = useState(false);
  const [phase,setPhase] = useState<"FORM"|"STATUS">("FORM");
  const [catalog,setCatalog] = useState<Broker[]>([]);
  const [brokerCode,setBrokerCode] = useState("EXNESS");
  const [customBroker,setCustomBroker] = useState("");
  const [accountNumber,setAccountNumber] = useState("");
  const [serverChoice,setServerChoice] = useState("");
  const [manualServer,setManualServer] = useState("");
  const [tradingPassword,setTradingPassword] = useState("");
  const [approved,setApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState<Status|null>(null);
  const [error,setError] = useState("");
  const [statusError,setStatusError] = useState("");
  const [selectedSymbol,setSelectedSymbol] = useState("");
  const [acknowledged,setAcknowledged] = useState(false);

  const currentBroker = catalog.find(b=>b.code===brokerCode);
  const servers = useMemo(()=>Array.from(new Map(
    (currentBroker?.servers||[]).filter(s=>Boolean(s?.serverName))
      .map(s=>[s.serverName.trim().toLowerCase(),s])
  ).values()),[currentBroker]);
  const broker = brokerCode==="OTHER" ? customBroker.trim() : (currentBroker?.name||brokerCode);
  const brokerServer = (serverChoice==="CUSTOM" || !servers.length ? manualServer : serverChoice).trim();

  const loadStatus=useCallback(async()=>{
    try {
      const data=await adminApi("/bot/mt5/admin-connect/status?userId="+
        encodeURIComponent(userId)+"&slotId="+encodeURIComponent(slotId));
      setStatus(data as Status);
      setStatusError("");
    } catch(e:any) {
      setStatusError(String(e?.message||"โหลดสถานะไม่ได้"));
    }
  },[userId,slotId]);

  useEffect(()=>{
    if (!open || phase!=="STATUS") return;
    void loadStatus();
    const id=window.setInterval(()=>void loadStatus(),3000);
    return ()=>window.clearInterval(id);
  },[open,phase,loadStatus]);

  function close() {
    if (busy) return;
    dialog.current?.close();
  }
  function openDialog() {
    setError("");
    setStatusError("");
    setStatus(null);
    setSelectedSymbol("");
    setAcknowledged(Boolean(linkedAccount));
    setTradingPassword("");
    setPhase(linkedAccount?"STATUS":"FORM");
    setOpen(true);
    dialog.current?.showModal();
    if (!linkedAccount) {
      void adminApi("/catalog/brokers").then((data:Broker[])=>{
        const rows=Array.isArray(data)?data:[];
        setCatalog(rows);
        setBrokerCode(prev=>rows.some(b=>b.code===prev)?prev:(rows[0]?.code||"OTHER"));
      }).catch(()=>setCatalog([]));
    }
  }

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{3,20}$/.test(accountNumber.trim())) return setError("MT5 Login ต้องเป็นตัวเลข 3–20 หลัก");
    if (!broker || !brokerServer || brokerServer.length>160 || !tradingPassword || !approved) {
      return setError("เลือก Broker, Server, กรอกรหัส Trading และยืนยันการอนุญาตจากลูกค้า");
    }
    setBusy(true);
    setError("");
    try {
      const response=await adminApi("/bot/mt5/admin-connect",{
        method:"POST",
        body:JSON.stringify({userId,slotId,accountNumber:accountNumber.trim(),
          broker,brokerServer,tradingPassword})
      });
      setTradingPassword("");
      setAcknowledged(true);
      setPhase("STATUS");
      onMessage(response?.message||"เซิร์ฟเวอร์รับข้อมูลแล้ว กำลังรอ MT5 เชื่อมต่อ");
      await onLinked();
    } catch(e:any) {
      const message=String(e?.message||"ไม่สามารถส่งคำขอได้");
      setTradingPassword("");
      if (/timed out|timeout|failed to fetch|networkerror/i.test(message)) {
        setError("ไม่ทราบผลการส่งข้อมูล กำลังตรวจสอบกับเซิร์ฟเวอร์ กรุณาอย่ากดซ้ำ");
        setPhase("STATUS");
      } else setError(message);
    } finally { setBusy(false); }
  }

  async function confirmDiscoveredSymbol() {
    const symbol = selectedSymbol.trim();
    // Only permit an explicit admin choice from the current Worker discovery list.
    // The server independently rechecks Worker freshness, slot rights and open trades.
    if (busy || !status?.symbols?.includes(symbol) || status.symbolConfirmed) return;
    if (!window.confirm("ยืนยัน Symbol "+symbol+" สำหรับ Cloud VPS Slot #"+slotNumber+
      "? ระบบจะสั่งเตรียม Chart/EA ใหม่เฉพาะ Slot นี้ โดยไม่ Start การซื้อขาย")) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi("/admin/slots/select-symbol",{
        method:"POST",body:JSON.stringify({userId,slotId,symbol})
      });
      onMessage(result?.message||"ยืนยัน Symbol แล้ว · กำลังรอ Cloud Worker เตรียม Chart และ EA");
      setSelectedSymbol("");
      await loadStatus();
      await onLinked();
    } catch (e:any) {
      setError(String(e?.message||"ยืนยัน Symbol ไม่สำเร็จ"));
    } finally { setBusy(false); }
  }

  const boundNumber = status?.accountNumber || linkedAccount || "";
  const fullReady = Boolean(status && isCloudMt5ConnectionComplete({
    isCloud:true,
    accountMatches:Boolean(boundNumber),
    runnerOnline:status.runnerOnline,
    terminalOnline:status.terminalOnline,
    eaHeartbeat:status.eaHeartbeat,
    cloudControlReady:status.cloudControlReady,
    brokerConnected:status.brokerConnected,
    symbolConfirmed:status.symbolConfirmed,
    activeSymbolMatches:Boolean(status.startupSymbol &&
      status.activeSymbol.toUpperCase()===status.startupSymbol.toUpperCase())
  }));
  const failed=Boolean(status?.provisioningError);
  const checkInput={
    acknowledged:acknowledged || Boolean(status?.accountNumber),
    isCloud:true,
    accountMatches:Boolean(status?.accountNumber),
    runnerOnline:Boolean(status?.runnerOnline),
    terminalOnline:Boolean(status?.terminalOnline),
    eaHeartbeat:Boolean(status?.eaHeartbeat),
    cloudControlReady:Boolean(status?.cloudControlReady),
    brokerConnected:status?.brokerConnected??null,
    symbolsFound:status?.symbols?.length||0,
    discoveryReady:Boolean(status?.symbols?.length),
    symbolConfirmed:Boolean(status?.symbolConfirmed),
    activeSymbolMatches:Boolean(status?.startupSymbol &&
      status?.activeSymbol?.toUpperCase()===status?.startupSymbol?.toUpperCase()),
    localSymbol:false,
    status:failed?"FAILED":fullReady?"SUCCESS":"RUNNING"
  };
  return (
    <section className={styles.launch}>
      <button type="button" className={styles.launchButton} onClick={openDialog}>
        {linkedAccount?"ดูสถานะการเชื่อมต่อ MT5":"เชื่อม MT5 ให้ลูกค้า"}
        <span aria-hidden="true">→</span>
      </button>
      <dialog className={styles.dialog} ref={dialog}
        onCancel={e=>{if(busy)e.preventDefault();}}
        onClose={()=>{setOpen(false);setTradingPassword("");setApproved(false);}}
        aria-label="เชื่อม Cloud MT5 ให้ลูกค้า">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div><small>SCENOVA · ADMIN CLOUD VPS</small>
              <h2>{phase==="FORM"?"เชื่อมบัญชี MT5 ให้ลูกค้า":"สถานะการเชื่อมต่อ MT5"}</h2>
              <p>{userCode} · Cloud VPS Slot #{slotNumber}</p>
            </div>
            <button type="button" className={styles.close} onClick={close} disabled={busy}
              aria-label="ปิดหน้าต่าง">×</button>
          </header>
          {phase==="FORM" ? (
            <form className={styles.form} onSubmit={submit}>
              <p className={styles.hint}>เลือก Broker และ Server เช่นเดียวกับหน้าลูกค้า ระบบจะบันทึกรหัสผ่านอย่างเข้ารหัส ไม่สั่ง Start บอทอัตโนมัติ</p>
              <div className={styles.grid}>
                <label>MT5 Login
                  <input required inputMode="numeric" autoComplete="off" maxLength={20}
                    value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,""))}
                    placeholder="เช่น 12345678"/>
                </label>
                <label>Broker / โบรกเกอร์
                  <select required value={brokerCode} onChange={e=>{
                    setBrokerCode(e.target.value);setServerChoice("");setManualServer("");setError("");
                  }}>
                    {catalog.filter(b=>b.code!=="OTHER").map(b=>
                      <option key={b.code} value={b.code}>{b.name}</option>)}
                    {!catalog.length && <option value="EXNESS">Exness</option>}
                    <option value="OTHER">อื่น ๆ / ระบุ Broker เอง</option>
                  </select>
                </label>
                {brokerCode==="OTHER" && <label>ชื่อ Broker
                  <input required maxLength={160} autoComplete="off" value={customBroker}
                    onChange={e=>setCustomBroker(e.target.value)} placeholder="ชื่อโบรกเกอร์"/>
                </label>}
                {servers.length>0 && <label>MT5 Server
                  <select required value={serverChoice} onChange={e=>{setServerChoice(e.target.value);setError("");}}>
                    <option value="">เลือก MT5 Server</option>
                    {servers.map(s=><option key={s.serverName} value={s.serverName}>
                      {s.environment==="REAL"?"LIVE":s.environment==="DEMO"?"DEMO":"SERVER"} · {s.serverName}
                    </option>)}
                    <option value="CUSTOM">ไม่พบ Server / กรอกเอง</option>
                  </select>
                </label>}
                {(serverChoice==="CUSTOM" || !servers.length) && <label>ระบุ MT5 Server
                  <input required maxLength={160} value={manualServer} autoComplete="off"
                    autoCapitalize="none" spellCheck={false}
                    onChange={e=>setManualServer(e.target.value)} placeholder="ชื่อ Server ตรงตาม Broker"/>
                </label>}
                <label className={styles.full}>Trading Password
                  <input required type="password" maxLength={512} autoComplete="new-password"
                    value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)}
                    placeholder="รหัสผ่านสำหรับซื้อขาย (ไม่ใช่ Investor Password)"/>
                </label>
              </div>
              <label className={styles.consent}>
                <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
                ลูกค้าอนุญาตให้ผู้ดูแลเชื่อมบัญชี MT5 นี้แล้ว
              </label>
              {error && <p role="alert" className={styles.error}>{error}</p>}
              <footer className={styles.actions}>
                <button type="button" onClick={close} disabled={busy}>ยกเลิก</button>
                <button className={styles.primary} type="submit" disabled={busy||!approved}>
                  {busy?"กำลังส่งข้อมูล...":"เชื่อมบัญชี MT5"}
                </button>
              </footer>
            </form>
          ) : (
            <div className={styles.progress}>
              <div className={styles.summary}>
                <strong>{failed?"พบข้อผิดพลาดจาก VPS":fullReady?"เชื่อมต่อและเตรียม EA สำเร็จ":
                  status?.eaHeartbeat?"MT5 ส่งสถานะมาแล้ว · กำลังตรวจความพร้อม":
                  "กำลังตรวจสอบการเชื่อมต่อจริง"}</strong>
                <small>บัญชี {boundNumber||"รอข้อมูล"} · {status?.brokerServer||"รอ Server"}</small>
              </div>
              {status ?
                <Mt5ConnectChecklist input={checkInput}/> :
                <p className={styles.hint}>กำลังรับข้อมูลสถานะจากเซิร์ฟเวอร์...</p>}
              {status && Boolean(status.accountNumber) && status.runnerOnline && status.terminalOnline &&
                !status.symbolConfirmed && status.symbols.length > 0 &&
                <div className={styles.symbolPanel}>
                  <b>พบ Symbol ทองคำจาก Cloud Worker</b>
                  <p>เลือกชื่อ Symbol ตามที่ MT5 บัญชีนี้ตรวจพบ แล้วกดยืนยันเพื่อเตรียม Chart และ EA (ไม่ Start เทรด)</p>
                  <div className={styles.symbolOptions}>
                    {status.symbols.map(symbol=>(
                      <button type="button" key={symbol}
                        className={selectedSymbol===symbol?styles.symbolSelected:styles.symbolOption}
                        aria-pressed={selectedSymbol===symbol}
                        disabled={busy} onClick={()=>setSelectedSymbol(symbol)}>
                        {symbol}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={styles.primary}
                    disabled={busy || !status.symbols.includes(selectedSymbol)}
                    onClick={()=>void confirmDiscoveredSymbol()}>
                    {busy?"กำลังยืนยัน...":"ยืนยัน Symbol และเตรียม Chart/EA"}
                  </button>
                </div>
              }
              {status?.symbolConfirmed===false && Boolean(status?.symbols?.length) &&
                <p className={styles.hint}>การตรวจพบ Symbol ยืนยันเพียงว่ารับข้อมูลตลาดได้ ยังไม่ยืนยันว่า Broker อนุญาตการเทรด หาก Journal แจ้ง Trading disabled ต้องแก้สิทธิ์กับ Broker ก่อนใช้งาน EA</p>}
              {failed && <p role="alert" className={styles.error}>
                {status?.provisioningError==="EA_ATTACH_TIMEOUT" ?
                  "Worker เปิด MT5 ได้ แต่ไม่สามารถสร้าง Chart/แนบ EA ให้เสร็จทันเวลา · ให้ตรวจ MT5 Experts/Journal และ Windows Worker ก่อนสั่ง Reload ซ้ำ" :
                  "VPS รายงานข้อผิดพลาด กรุณาตรวจ MT5 Journal, Trading Password, Broker และ Server"}
                <small>รหัสข้อผิดพลาด: {status?.provisioningError}</small>
              </p>}
              {error && <p role="alert" className={styles.error}>{error}</p>}
              {statusError && <p role="alert" className={styles.error}>โหลดสถานะไม่ได้: {statusError}</p>}
              <p className={styles.hint}>สถานะอัปเดตทุก 3 วินาทีจาก Worker และ EA · การรับข้อมูลไม่ได้แปลว่าเชื่อม Broker สำเร็จ · บอทยังไม่ Start อัตโนมัติ</p>
              <footer className={styles.actions}>
                <button type="button" onClick={()=>void loadStatus()}>รีเฟรชสถานะ</button>
                <button type="button" className={styles.primary} onClick={close}>ปิดหน้าต่าง</button>
              </footer>
            </div>
          )}
        </div>
      </dialog>
    </section>
  );
}
