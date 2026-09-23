"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { CloudConsole } from "../../components/CloudConsole";

type Menu = "overview"|"customers"|"workers";

export default function AdminPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [plan, setPlan] = useState("LOCAL_30D");
  const [paidAmountBaht, setPaidAmountBaht] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [system, setSystem] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState<Menu>("overview");
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [maintenanceTitle, setMaintenanceTitle] = useState("แจ้งปิดปรับปรุงระบบ");
  const [maintenanceMessage, setMaintenanceMessage] = useState("กรุณาปิด Position ทั้งหมดก่อนเวลาที่กำหนด เพื่อให้อัปเดตระบบได้อย่างปลอดภัย");
  const [maintenanceAt, setMaintenanceAt] = useState("");
  const [forceCloseAt, setForceCloseAt] = useState("");
  const [expectedResumeAt, setExpectedResumeAt] = useState("");
  const [maintenanceForceClose, setMaintenanceForceClose] = useState(true);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceQuery, setMaintenanceQuery] = useState("");
  const [maintenanceActionId, setMaintenanceActionId] = useState("");
  const [partnerSeats, setPartnerSeats] = useState(10);
  const [partnerDurationDays, setPartnerDurationDays] = useState(30);
  const [partnerCustomerDays, setPartnerCustomerDays] = useState(30);
  const [partnerBusy, setPartnerBusy] = useState(false);

  async function search(e?: FormEvent, preserveMessage = false) {
    e?.preventDefault();
    setLoading(true);
    try {
      const [userRows, systemStatus] = await Promise.all([
        adminApi("/admin/users?q=" + encodeURIComponent(query)),
        adminApi("/admin/system")
      ]);
      setUsers(userRows);
      setSystem(systemStatus);
      if (!preserveMessage) setMessage("");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "customers" || requested === "users" || requested === "subscriptions") setActiveMenu("customers");
    else if (requested === "workers") setActiveMenu("workers");
    else setActiveMenu("overview");
    search();
  }, []);

  function switchMenu(menu: Menu) {
    setActiveMenu(menu);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/admin?view=" + menu);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleOwnerNavigate(href:string) {
    if (!href.startsWith("/admin?view=")) return false;
    const requested = new URL(href, window.location.origin).searchParams.get("view");
    if (requested === "overview") switchMenu("overview");
    else if (requested === "customers" || requested === "users" || requested === "subscriptions") switchMenu("customers");
    else if (requested === "workers") switchMenu("workers");
    else return false;
    setMessage("");
    return true;
  }

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function grantTrial(user: any) {
    if (!user.mt5_account_id) return setMessage("บัญชีนี้ยังไม่ได้เชื่อม MT5");
    if (!user.trial_request_id || user.trial_request_status !== "PENDING") {
      return setMessage("ลูกค้าต้องส่งคำขอ Trial พร้อม LINE จากหน้า SCENOVA ก่อน");
    }
    try {
      await adminApi("/admin/trials/grant", {
        method: "POST",
        body: JSON.stringify({
          mt5AccountId: user.mt5_account_id,
          minutes: 180,
          approvedBy: "OWNER"
        })
      });
      setMessage("อนุมัติ Trial 3 ชั่วโมงให้ " + user.user_code + " แล้ว");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function activate(user: any, planCode = plan) {
    try {
      const result = await adminApi("/admin/subscriptions/activate", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          planCode,
          durationDays: expiresAt ? undefined : days,
          startsAt: startsAt || undefined,
          expiresAt: expiresAt || undefined,
          activatedBy: "OWNER",
          paidAmountSatang: paidAmountBaht.trim() ? Math.round(Number(paidAmountBaht) * 100) : 0,
          paymentReference: paymentReference.trim() || undefined
        })
      });
      const seatCount = Array.isArray(result?.slots) ? result.slots.length : (result?.plan?.slots || 1);
      const partnerSeatText = result?.plan?.reseller ? " · " + seatCount + " Customer Seats" : "";
      const referralText = result?.referral?.commissionCount
        ? " · Referral " + result.referral.commissionCount + " รายการ"
        : "";
      setMessage(
        "เปิดสิทธิ์ " + (result?.plan?.code || planCode) +
        " ให้ " + user.user_code + " แล้ว" + partnerSeatText + referralText
      );
      setPaidAmountBaht("");
      setPaymentReference("");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function extendSubscription(user: any, subscriptionId: string, addDays: number) {
    if (!subscriptionId) return setMessage("ไม่พบสมาชิกที่ต้องการต่ออายุ");
    try {
      await adminApi("/admin/subscriptions/extend", {
        method: "POST",
        body: JSON.stringify({ subscriptionId, days: addDays })
      });
      setMessage("เพิ่ม " + addDays + " วันให้ " + user.user_code + " แล้ว");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function grantPartner(user:any) {
    setPartnerBusy(true);
    try {
      await adminApi("/admin/partners/grant", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          seatLimit: partnerSeats,
          partnerDurationDays,
          customerDurationDays: partnerCustomerDays
        })
      });
      setMessage(`เปิด/อัปเดต Partner ${partnerSeats} Seats ให้ ${user.user_code} แล้ว`);
      await search(undefined, true);
    } catch (e:any) { setMessage(e.message); }
    finally { setPartnerBusy(false); }
  }

  async function renewPartner(user:any) {
    setPartnerBusy(true);
    try {
      await adminApi("/admin/partners/renew", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, durationDays: partnerDurationDays })
      });
      setMessage(`ต่อสิทธิ์ Partner ให้ ${user.user_code} +${partnerDurationDays} วันแล้ว`);
      await search(undefined, true);
    } catch (e:any) { setMessage(e.message); }
    finally { setPartnerBusy(false); }
  }

  async function suspendPartner(user:any) {
    if (!confirm(`ระงับสิทธิ์ Partner ของ ${user.user_code} หรือไม่? ลูกค้าที่เปิดไปแล้วจะยังใช้ได้ถึงวันหมดอายุของตัวเอง`)) return;
    setPartnerBusy(true);
    try {
      await adminApi("/admin/partners/suspend", { method:"POST", body:JSON.stringify({ userId:user.id }) });
      setMessage(`ระงับ Partner ${user.user_code} แล้ว ลูกค้าเดิมยังคงวันหมดอายุเดิม`);
      await search(undefined, true);
    } catch (e:any) { setMessage(e.message); }
    finally { setPartnerBusy(false); }
  }

  async function reactivate(user: any) {
    try {
      await adminApi("/admin/users/reactivate", {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      setMessage("เปิดบัญชี " + user.user_code + " กลับมาแล้ว");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function suspend(user: any) {
    if (!confirm("ระงับ " + user.user_code + " และสั่ง Safe Stop บอทหรือไม่?")) return;
    try {
      await adminApi("/admin/users/suspend", {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      setMessage("ระงับ " + user.user_code + " แล้ว");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function deleteUser(user: any) {
    if (!confirm(
      "ลบบัญชี " + user.user_code + " ออกจากการใช้งานหรือไม่?\n\n" +
      "ระบบจะยกเลิกสิทธิ์และซ่อนบัญชีนี้ออกจากรายการ แต่จะเก็บประวัติ Trial ของเลข MT5 ไว้เพื่อป้องกันการรับ Trial ซ้ำ"
    )) return;
    try {
      await adminApi("/admin/users/delete", {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      setMessage("ลบบัญชี " + user.user_code + " ออกจากการใช้งานแล้ว");
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  function maintenanceDateLabel(value:any) {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  async function announceMaintenance() {
    if (!maintenanceAt) return setMessage("กรุณากำหนดวันและเวลา Maintenance");
    setMaintenanceBusy(true);
    try {
      await adminApi("/admin/maintenance/announce", {
        method: "POST",
        body: JSON.stringify({
          title: maintenanceTitle,
          message: maintenanceMessage,
          maintenanceAt: new Date(maintenanceAt).toISOString(),
          forceCloseAt: forceCloseAt ? new Date(forceCloseAt).toISOString() : undefined,
          expectedResumeAt: expectedResumeAt ? new Date(expectedResumeAt).toISOString() : undefined,
          forceClose: maintenanceForceClose
        })
      });
      setMessage("ประกาศ Maintenance ให้ทุกบัญชีแล้ว");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function shutdownForMaintenance() {
    if (!confirm(
      "ปิดระบบอย่างปลอดภัยตอนนี้หรือไม่?\n\n" +
      "ระบบจะบล็อก Start ใหม่ สั่งหยุดทุกบอท และส่ง Close All ให้บัญชีที่ยังมี Position ค้างอยู่"
    )) return;
    setMaintenanceBusy(true);
    try {
      await adminApi("/admin/maintenance/shutdown", {
        method: "POST",
        body: JSON.stringify({ message: maintenanceMessage })
      });
      setMessage("เริ่ม Safe Shutdown แล้ว ระบบกำลังรอ Position ทุกบัญชีเป็น 0");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function forceCloseMaintenanceAccount(item:any) {
    const positions = Number(item?.positions || 0);
    if (positions <= 0) return setMessage("บัญชีนี้ไม่มี Position ค้างให้ปิด");
    const accountLabel = [item?.user_code, item?.account_number, item?.broker_server].filter(Boolean).join(" · ");
    if (!confirm(
      "ยืนยันบังคับปิด Position ทั้งหมดของบัญชีนี้?\n\n" +
      accountLabel + "\n" + positions + " Position\n\nระบบจะส่งคำสั่ง Close All ไปยัง EA ของบัญชีนี้และหยุดการเปิดรอบใหม่"
    )) return;
    setMaintenanceActionId(String(item.instance_id || ""));
    try {
      const result = await adminApi("/admin/maintenance/close-instance", {
        method: "POST",
        body: JSON.stringify({ instanceId: item.instance_id })
      });
      setMessage(result?.message || "ส่งคำสั่ง Close All ให้บัญชีนี้แล้ว");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceActionId("");
    }
  }

  async function forceFlatAllAccounts() {
    const typed = window.prompt(
      "คำสั่งนี้เป็นสิทธิ์ OWNER สูงสุด\n\n" +
      "ระบบจะบล็อก Start ใหม่ทันที, STOP ทุก Bot และส่ง CLOSE_ALL ไปยังทุกบัญชีที่เกี่ยวข้อง\n" +
      "บัญชี Local ที่ออฟไลน์จะรับคำสั่งเมื่อ EA กลับมาออนไลน์\n\n" +
      "พิมพ์ FORCE FLAT ALL เพื่อยืนยัน"
    );
    if (typed === null) return;
    if (typed.trim() !== "FORCE FLAT ALL") {
      setMessage("ยกเลิกคำสั่ง: ข้อความยืนยันไม่ตรงกับ FORCE FLAT ALL");
      return;
    }
    if (!window.confirm(
      "ยืนยัน FORCE FLAT ALL ACCOUNTS จริงหรือไม่?\n\n" +
      "หลังยืนยัน ระบบจะเข้าสู่โหมดปิดฉุกเฉินและจะไม่ถือว่าสำเร็จจนกว่า MT5/EA จะยืนยัน Position = 0"
    )) return;

    setMaintenanceBusy(true);
    try {
      const result = await adminApi("/admin/maintenance/force-flat-all", {
        method: "POST",
        body: JSON.stringify({ confirmation: typed.trim() })
      });
      const emergency = result?.emergency || {};
      setMessage(
        result?.message ||
        `FORCE FLAT ALL เริ่มแล้ว · เป้าหมาย ${emergency.targetInstances || 0} บัญชี · คิว Close All ${emergency.queuedCloseAll || 0}`
      );
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function cancelMaintenance() {
    if (!confirm("ยกเลิกประกาศ Maintenance ที่ยังไม่เริ่มหรือไม่?")) return;
    setMaintenanceBusy(true);
    try {
      await adminApi("/admin/maintenance/cancel", { method: "POST" });
      setMessage("ยกเลิกประกาศ Maintenance แล้ว");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function resumeMaintenance() {
    if (!confirm("ยืนยันว่าอัปเดตเสร็จแล้วและต้องการเปิดให้ลูกค้ากด Start ได้อีกครั้ง?")) return;
    setMaintenanceBusy(true);
    try {
      await adminApi("/admin/maintenance/resume", { method: "POST" });
      setMessage("เปิดระบบหลัง Maintenance แล้ว บอทจะยังคง STOPPED จนกว่าผู้ใช้จะกด Start เอง");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  const planOptions = [
    { code:"LOCAL_30D", label:"LOCAL 30D", mode:"LOCAL" },
    { code:"CLOUD_30D", label:"CLOUD 30D", mode:"CLOUD" }
  ];
  const selectedPlan = planOptions.find(p=>p.code===plan) || planOptions[0];
  const selectedCustomer = users.find((u:any)=>u.id===selectedCustomerId) || null;
  const memberships = (user:any) => Array.isArray(user?.memberships) ? user.memberships : [];
  const hasActivePlan = (user:any, planCode:string) =>
    memberships(user).some((m:any)=>m.plan_code===planCode && m.active);
  const hasActiveMode = (user:any, mode:string) =>
    memberships(user).some((m:any)=>m.mode===mode && m.active);

  const maintenance = system?.maintenance || { status:"OFF", summary:{ openPositions:0, runningInstances:0 }, blockers:[] };
  const maintenanceBlockers = Array.isArray(maintenance.blockers) ? maintenance.blockers : [];
  const maintenanceQueryNormalized = maintenanceQuery.trim().toLowerCase();
  const filteredMaintenanceBlockers = maintenanceQueryNormalized
    ? maintenanceBlockers.filter((item:any)=>[
        item?.user_code, item?.account_number, item?.broker_server,
        item?.actual_state, item?.desired_state
      ].some(value=>String(value || "").toLowerCase().includes(maintenanceQueryNormalized)))
    : maintenanceBlockers;
  const workersOnline = system?.workers?.filter((w:any)=>w.health === "ONLINE").length || 0;
  const workersTotal = system?.workers?.length || 0;
  const maintenanceAttention = maintenance.status === "DRAINING" || maintenance.status === "MAINTENANCE" ? 1 : 0;
  const attentionCount = (system?.bots?.offline || 0) + Math.max(0, workersTotal - workersOnline) + maintenanceAttention;

  const title = useMemo(() => ({
    overview: ["ภาพรวมระบบ","เห็นสุขภาพระบบและสิ่งที่ต้องจัดการในหน้าจอเดียว"],
    customers: ["ลูกค้า & สมาชิก","ค้นหา อนุมัติ Trial เปิดสมาชิก ต่ออายุ ระงับ และลบบัญชีจากหน้าเดียว"],
    workers: ["Cloud Trading System","ตรวจ Trading Nodes, Load และสถานะ Cloud MT5"]
  }[activeMenu]), [activeMenu]);

  const ownerActiveKey =
    activeMenu === "customers" ? "admin-customers" :
    activeMenu === "workers" ? "admin-workers" :
    "admin-overview";

  return (
    <div className="app-wrap owner-app">
      <OwnerSidebar activeKey={ownerActiveKey} onLogout={logout} onNavigate={handleOwnerNavigate}/>

      <main className="main app-main owner-main">
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>
        <OwnerMobileNav activeKey={ownerActiveKey} onNavigate={handleOwnerNavigate}/>

        <header className="owner-head">
          <div>
            <div className="owner-breadcrumb">SCENOVA <span>/</span> OWNER CONSOLE</div>
            <h1>{title[0]}</h1>
            <p>{title[1]}</p>
          </div>
          <div className="owner-head-actions">
            <span className="owner-live"><span className="dot green"/> OWNER ONLINE</span>
            <button className="btn" onClick={()=>search()} disabled={loading}>{loading ? "กำลังโหลด..." : "↻ รีเฟรช"}</button>
          </div>
        </header>

        {message && <div className="notice owner-message">{message}</div>}

        {activeMenu === "overview" && (
          <>
            <section className="owner-pulse">
              <div>
                <span className="owner-pulse-kicker">SYSTEM PULSE</span>
                <h2>{attentionCount > 0 ? "มีรายการที่ควรตรวจสอบ" : "ระบบทำงานเป็นปกติ"}</h2>
                <p>{attentionCount > 0 ? attentionCount + " รายการต้องการความสนใจจากเจ้าของระบบ" : "ยังไม่พบเหตุผิดปกติจากข้อมูลล่าสุด"}</p>
              </div>
              <div className="owner-pulse-status">
                <span className={"owner-health-ring "+(attentionCount>0?"warn":"ok")}>{attentionCount}</span>
                <small>ATTENTION</small>
              </div>
            </section>

            <section className={"owner-card owner-maintenance-card status-" + String(maintenance.status || "OFF").toLowerCase()}>
              <div className="owner-card-head owner-maintenance-head">
                <div>
                  <span className="owner-card-kicker">SAFE UPDATE CONTROL</span>
                  <h3>ประกาศและปิดระบบเพื่ออัปเดตอย่างปลอดภัย</h3>
                  <p className="muted">แจ้งลูกค้าล่วงหน้า → ถึงเวลาระบบบล็อก Start → ปิด Position ที่ยังค้าง → รอทุกบัญชีหยุด → จึงเข้าสู่ Maintenance</p>
                </div>
                <span className={"owner-maintenance-state " + String(maintenance.status || "OFF").toLowerCase()}>{maintenance.status || "OFF"}</span>
              </div>

              <div className="owner-maintenance-summary">
                <div><small>เวลา Maintenance</small><b>{maintenanceDateLabel(maintenance.maintenance_at)}</b></div>
                <div><small>บังคับปิด Position</small><b>{maintenanceDateLabel(maintenance.force_close_at)}</b></div>
                <div><small>Position คงเหลือ</small><b>{maintenance.summary?.openPositions || 0}</b></div>
                <div><small>Bot ยัง Running</small><b>{maintenance.summary?.runningInstances || 0}</b></div>
              </div>

              {maintenance.status !== "OFF" && (
                <div className="owner-maintenance-current">
                  <b>{maintenance.title || "ประกาศ Maintenance"}</b>
                  <span>{maintenance.message || "—"}</span>
                  {maintenance.expected_resume_at && <small>คาดว่าจะเปิดระบบ: {maintenanceDateLabel(maintenance.expected_resume_at)}</small>}
                </div>
              )}

              <div className="owner-force-flat-panel">
                <div>
                  <span className="owner-card-kicker">OWNER EMERGENCY CONTROL</span>
                  <b>🚨 FORCE FLAT ALL ACCOUNTS</b>
                  <small>บล็อก Start ทันที → STOP ทุก Bot → ส่ง CLOSE_ALL → Retry ระหว่าง DRAINING → รอ MT5/EA ยืนยัน Position = 0</small>
                  <small>คำสั่ง CLOSE_ALL จะไม่ถูกทำเครื่องหมายว่าสำเร็จจากฝั่ง Server เอง และบัญชี Local ที่ออฟไลน์จะยังคงรอคำสั่งเมื่อกลับมาออนไลน์</small>
                </div>
                <button className="btn danger owner-force-flat-button" disabled={maintenanceBusy} onClick={forceFlatAllAccounts}>
                  {maintenanceBusy ? "กำลังดำเนินการ..." : "🚨 FORCE FLAT ALL ACCOUNTS"}
                </button>
              </div>

              <div className="owner-maintenance-form">
                <div className="field"><label>หัวข้อประกาศ</label><input className="input" value={maintenanceTitle} onChange={e=>setMaintenanceTitle(e.target.value)} /></div>
                <div className="field maintenance-message"><label>ข้อความแจ้งลูกค้า</label><input className="input" value={maintenanceMessage} onChange={e=>setMaintenanceMessage(e.target.value)} /></div>
                <div className="field"><label>วัน/เวลา Maintenance</label><input className="input" type="datetime-local" value={maintenanceAt} onChange={e=>setMaintenanceAt(e.target.value)} /></div>
                <div className="field"><label>เวลาบังคับ Close All</label><input className="input" type="datetime-local" value={forceCloseAt} onChange={e=>setForceCloseAt(e.target.value)} /><div className="help">เว้นว่าง = เวลาเดียวกับ Maintenance</div></div>
                <div className="field"><label>คาดว่าจะเปิดระบบ</label><input className="input" type="datetime-local" value={expectedResumeAt} onChange={e=>setExpectedResumeAt(e.target.value)} /></div>
                <label className="owner-maintenance-check"><input type="checkbox" checked={maintenanceForceClose} onChange={e=>setMaintenanceForceClose(e.target.checked)} /><span><b>บังคับปิด Position ที่ยังค้าง</b><small>เมื่อถึงกำหนด ระบบส่ง Close All และไม่เปิดรอบใหม่</small></span></label>
              </div>

              <div className="owner-maintenance-actions">
                <button className="btn primary" disabled={maintenanceBusy || maintenance.status === "DRAINING" || maintenance.status === "MAINTENANCE"} onClick={announceMaintenance}>ประกาศกำหนดอัปเดต</button>
                <button className="btn danger" disabled={maintenanceBusy || maintenance.status === "DRAINING" || maintenance.status === "MAINTENANCE"} onClick={shutdownForMaintenance}>ปิดระบบอย่างปลอดภัยตอนนี้</button>
                {maintenance.status === "SCHEDULED" && <button className="btn" disabled={maintenanceBusy} onClick={cancelMaintenance}>ยกเลิกประกาศ</button>}
                {maintenance.status === "MAINTENANCE" && <button className="btn primary" disabled={maintenanceBusy} onClick={resumeMaintenance}>เปิดระบบหลังอัปเดต</button>}
              </div>

              {maintenanceBlockers.length > 0 && (
                <div className="owner-maintenance-blockers">
                  <div className="owner-maintenance-blockers-head">
                    <div>
                      <b>บัญชีที่ยังต้องเคลียร์ก่อนอัปเดต</b>
                      <small>ค้นหาด้วย User ID, เลข MT5, Broker Server หรือสถานะ</small>
                    </div>
                    <div className="owner-maintenance-search">
                      <input
                        className="input"
                        value={maintenanceQuery}
                        onChange={e=>setMaintenanceQuery(e.target.value)}
                        placeholder="ค้นหาบัญชี เช่น 279754215"
                      />
                      <span>{filteredMaintenanceBlockers.length}/{maintenanceBlockers.length}</span>
                    </div>
                  </div>
                  <div className="owner-maintenance-account-list">
                    {filteredMaintenanceBlockers.length > 0 ? filteredMaintenanceBlockers.map((item:any)=>(
                      <div className="owner-maintenance-account-row" key={item.instance_id}>
                        <div className="owner-maintenance-account-name">
                          <b>{item.user_code || "—"} · {item.account_number || "ยังไม่ผูก MT5"}</b>
                          <small>{item.broker_server || "—"} · {item.actual_state}/{item.desired_state}</small>
                        </div>
                        <strong className={Number(item.positions || 0)>0 ? "has-position" : ""}>{item.positions || 0} Position</strong>
                        <button
                          className="btn danger owner-account-close"
                          disabled={Boolean(maintenanceActionId) || Number(item.positions || 0) <= 0}
                          onClick={()=>forceCloseMaintenanceAccount(item)}
                        >
                          {maintenanceActionId === item.instance_id ? "กำลังส่งคำสั่ง..." : "ปิดทุก Position"}
                        </button>
                      </div>
                    )) : (
                      <div className="owner-maintenance-empty">ไม่พบบัญชีที่ตรงกับคำค้นหา</div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="owner-kpi-grid">
              <OwnerKpi label="ผู้ใช้ทั้งหมด" value={system?.users?.total ?? "—"} meta="บัญชีที่ยังใช้งานในระบบ" tone="blue"/>
              <OwnerKpi label="ผู้ใช้ Active" value={system?.users?.active ?? "—"} meta="พร้อมใช้งาน" tone="green"/>
              <OwnerKpi label="Bots Running" value={system?.bots?.running ?? "—"} meta="กำลังทำงาน" tone="purple"/>
              <OwnerKpi label="Bots Offline" value={system?.bots?.offline ?? "—"} meta={(system?.slots?.active ?? 0) + " access records active"} tone={(system?.bots?.offline||0)>0?"red":"neutral"}/>
            </section>

            <div className="owner-overview-grid">
              <section className="owner-card">
                <div className="owner-card-head">
                  <div><span className="owner-card-kicker">QUICK ACTIONS</span><h3>งานที่ใช้บ่อย</h3></div>
                </div>
                <div className="owner-action-list">
                  <button onClick={()=>switchMenu("customers")}><span className="action-icon">◎</span><div><b>จัดการลูกค้า & สมาชิก</b><small>Trial / เปิดสมาชิก / ต่ออายุ / Suspend / Delete</small></div><span>→</span></button>
                  <Link href="/dashboard?view=overview"><span className="action-icon purple">▣</span><div><b>เปิด Control Center ของฉัน</b><small>ดู Balance, Status, Start / Stop และ Log</small></div><span>→</span></Link>
                  <button onClick={()=>switchMenu("workers")}><span className="action-icon">⌁</span><div><b>ตรวจ Cloud Trading Nodes</b><small>ดู Online, Capacity และ Last Seen</small></div><span>→</span></button>
                </div>
              </section>

              <section className="owner-card">
                <div className="owner-card-head">
                  <div><span className="owner-card-kicker">INFRASTRUCTURE</span><h3>สถานะการให้บริการ</h3></div>
                </div>
                <div className="owner-service-list">
                  <div><span className="service-icon">W</span><div><b>Cloud Workers</b><small>{workersOnline} online จาก {workersTotal} node</small></div><span className={"service-state "+(workersOnline>0?"ok":"idle")}>{workersOnline>0?"ONLINE":"WAITING"}</span></div>
                  <div><span className="service-icon purple">B</span><div><b>Bot Instances</b><small>{system?.bots?.total || 0} instances ทั้งหมด</small></div><span className="service-state ok">{system?.bots?.running || 0} RUNNING</span></div>
                  <div><span className="service-icon">U</span><div><b>User Access</b><small>{system?.users?.active || 0} active accounts</small></div><span className="service-state ok">READY</span></div>
                </div>
              </section>
            </div>
          </>
        )}

        {activeMenu === "customers" && (
          <>
            <section className="owner-toolbar-card">
              <div><span className="owner-card-kicker">CUSTOMER & MEMBER</span><h2>จัดการบัญชีลูกค้าโดยไม่ต้องกรอก MT5</h2><p>เปิดสมาชิกจาก User ID ได้ก่อน ลูกค้า LOCAL จะให้ระบบอ่านเลขบัญชี MT5 จาก EA/Terminal อัตโนมัติหลังติดตั้ง ส่วนเลข MT5 ใช้สำหรับค้นหาและตรวจสอบเท่านั้น</p></div>
              <form className="owner-search" onSubmit={search}>
                <input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="User ID, email, LINE หรือค้นหา MT5 ที่เชื่อมแล้ว"/>
                <button className="btn primary" disabled={loading}>{loading?"กำลังค้นหา...":"ค้นหา"}</button>
              </form>
            </section>

            <section className="owner-card owner-plan-inline-card">
              <div className="owner-card-head">
                <div><span className="owner-card-kicker">MEMBERSHIP SETUP</span><h3>เปิดสิทธิ์จากบัญชี SCENOVA</h3><p className="muted">ไม่ต้องรอเลขบัญชี MT5 เลือกแพ็กเกจแล้วกด “เปิดสมาชิก” ที่ลูกค้าได้เลย ระบบจะจัดสิทธิ์ตามโหมดของแพ็กเกจให้อัตโนมัติ</p></div>
                <span className="owner-count">ใช้กับลูกค้าที่เลือกด้านล่าง</span>
              </div>
              <div className="owner-plan-inline">
                <div className="field"><label>แพ็กเกจ</label><select className="input" value={plan} onChange={e=>setPlan(e.target.value)}>
                  <option value="LOCAL_30D">LOCAL 30D</option>
                  <option value="CLOUD_30D">CLOUD 30D</option>
                </select></div>
                <div className="field"><label>วันเริ่ม <span className="muted">(ว่าง = เริ่มทันที)</span></label><input className="input" type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/><div className="help">Owner Console รุ่นนี้เปิดสิทธิ์ทันทีเท่านั้น ถ้ากำหนดเวลาอนาคตระบบจะแจ้งเตือน</div></div>
                <div className="field"><label>จำนวนวัน</label><input className="input" type="number" min={1} value={days} onChange={e=>setDays(Number(e.target.value))}/></div>
                <div className="field"><label>กำหนดวันหมดอายุเอง</label><input className="input" type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/><div className="help">ถ้ากรอก ระบบจะใช้วันนี้แทนจำนวนวัน</div></div>
                <div className="field"><label>ยอดที่ลูกค้าชำระจริง <span className="muted">(บาท)</span></label><input className="input" type="number" min={0} step="0.01" value={paidAmountBaht} onChange={e=>setPaidAmountBaht(e.target.value)} placeholder="0.00"/><div className="help">กรอกเฉพาะยอดที่รับเงินจริง ระบบ Referral จะคำนวณ 7% / 5% / 3% / 1% จากยอดนี้</div></div>
                <div className="field"><label>Payment Reference <span className="muted">(optional)</span></label><input className="input" value={paymentReference} onChange={e=>setPaymentReference(e.target.value.slice(0,160))} placeholder="PromptPay / slip / note"/><div className="help">ใช้สำหรับตรวจสอบย้อนหลัง ไม่แสดงให้ลูกค้าคนอื่นเห็น</div></div>
              </div>
            </section>

            {selectedCustomer && (
              <section className="owner-card">
                <div className="owner-card-head">
                  <div>
                    <span className="owner-card-kicker">CUSTOMER ACCOUNT</span>
                    <h3>{selectedCustomer.user_code}</h3>
                    <p className="muted">{selectedCustomer.email}</p>
                  </div>
                  <button className="btn" onClick={()=>setSelectedCustomerId("")}>ปิดรายละเอียด</button>
                </div>

                <div className="owner-partner-program">
                  <div className="owner-partner-program-head">
                    <div>
                      <span className="owner-card-kicker">PARTNER PROGRAM</span>
                      <h3>สิทธิ์ Partner / Customer Seats</h3>
                      <p className="muted">Partner เริ่มอายุทันทีเมื่อ Owner เปิดสิทธิ์ ใช้ EA ของตัวเองได้ 1 บัญชีโดยไม่กิน Customer Seat; ลูกค้าแต่ละรายมีอายุของตัวเองและเปลี่ยน MT5 ได้โดยไม่กิน Seat เพิ่ม</p>
                    </div>
                    <span className={"owner-state-chip "+(selectedCustomer.partner_status === "ACTIVE" || selectedCustomer.partner_status === "READY" ? "good" : selectedCustomer.partner_status ? "bad" : "")}>{selectedCustomer.partner_status || "NOT PARTNER"}</span>
                  </div>
                  <div className="owner-partner-grid">
                    <div className="field"><label>จำนวน Customer Seats</label><select className="input" value={partnerSeats} onChange={e=>setPartnerSeats(Number(e.target.value))}><option value={10}>10 Seats</option><option value={25}>25 Seats</option><option value={50}>50 Seats</option></select></div>
                    <div className="field"><label>อายุ Partner</label><input className="input" type="number" min={1} value={partnerDurationDays} onChange={e=>setPartnerDurationDays(Number(e.target.value))}/><div className="help">วัน · เริ่มนับทันทีเมื่อเปิดสิทธิ์ Partner</div></div>
                    <div className="field"><label>อายุลูกค้าแต่ละราย</label><input className="input" type="number" min={1} value={partnerCustomerDays} onChange={e=>setPartnerCustomerDays(Number(e.target.value))}/><div className="help">วันเต็มต่อคน นับจากวันที่ Partner เปิดสิทธิ์ให้ลูกค้ารายนั้น</div></div>
                  </div>
                  {selectedCustomer.partner_status && (
                    <div className="owner-partner-summary">
                      <span>ใช้อยู่ <b>{selectedCustomer.partner_active_customers || 0}/{selectedCustomer.partner_seat_limit || 0}</b> Seats</span>
                      <span>เริ่ม: <b>{selectedCustomer.partner_activated_at ? new Date(selectedCustomer.partner_activated_at).toLocaleDateString("th-TH") : "ยังไม่เริ่ม"}</b></span>
                      <span>หมดอายุ: <b>{selectedCustomer.partner_expires_at ? new Date(selectedCustomer.partner_expires_at).toLocaleDateString("th-TH") : "—"}</b></span>
                    </div>
                  )}
                  <div className="owner-maintenance-actions">
                    <button className="btn primary" disabled={partnerBusy} onClick={()=>grantPartner(selectedCustomer)}>{selectedCustomer.partner_status === "ACTIVE" || selectedCustomer.partner_status === "READY" ? "อัปเดต Partner / Seats" : "เปิดสิทธิ์ Partner"}</button>
                    {selectedCustomer.partner_status && <button className="btn" disabled={partnerBusy} onClick={()=>renewPartner(selectedCustomer)}>ต่อ Partner +{partnerDurationDays} วัน</button>}
                    {(selectedCustomer.partner_status === "ACTIVE" || selectedCustomer.partner_status === "READY") && <button className="btn danger" disabled={partnerBusy} onClick={()=>suspendPartner(selectedCustomer)}>ระงับ Partner</button>}
                  </div>
                  <div className="help">การระงับ/หมดอายุ Partner จะหยุด EA ของ Partner และหยุดการเพิ่ม/ต่ออายุลูกค้าใหม่ แต่ลูกค้าที่เปิดไปแล้วใช้ต่อถึงวันหมดอายุของตัวเองได้ การลด Seats ต่ำกว่าจำนวนลูกค้า Active จะไม่ตัดลูกค้าเดิม เพียงแต่เพิ่มลูกค้าใหม่ไม่ได้จนกว่าจำนวน Active จะต่ำกว่าขีดจำกัดใหม่</div>
                </div>

                <div className="owner-plan-inline">
                  <div className="field">
                    <label>บัญชี MT5</label>
                    <div className="input" style={{display:"flex",alignItems:"center"}}>
                      {selectedCustomer.account_number || "ยังไม่เชื่อม — LOCAL จะตรวจจาก MT5 อัตโนมัติ"}
                    </div>
                    <div className="help">
                      {selectedCustomer.account_number
                        ? (selectedCustomer.broker_server || "ตรวจจาก MT5 แล้ว")
                        : "ไม่ต้องกรอกเลขบัญชี MT5 ให้ลูกค้าเปิด MT5 แล้วติดตั้ง SCENOVA ระบบจะผูกจาก Terminal จริง"}
                    </div>
                  </div>

                  <div className="field">
                    <label>สถานะบัญชี</label>
                    <div className="input" style={{display:"flex",alignItems:"center"}}>{selectedCustomer.status}</div>
                  </div>

                  <div className="field">
                    <label>แพ็กเกจที่จะเปิด/เปลี่ยน</label>
                    <select className="input" value={plan} onChange={e=>setPlan(e.target.value)}>
                      {planOptions.map(p=><option key={p.code} value={p.code}>{p.label}</option>)}
                    </select>
                  </div>

                  <div className="field submit-field">
                    <button
                      className="btn primary btn-lg"
                      disabled={hasActivePlan(selectedCustomer, selectedPlan.code)}
                      onClick={()=>activate(selectedCustomer, selectedPlan.code)}
                    >
                      {hasActivePlan(selectedCustomer, selectedPlan.code)
                        ? selectedPlan.label + " ใช้งานอยู่"
                        : hasActiveMode(selectedCustomer, selectedPlan.mode)
                          ? "เปลี่ยนเป็น " + selectedPlan.label
                          : "เปิด " + selectedPlan.label}
                    </button>
                    <small className="help">เปิดสมาชิกจาก User ID ได้ ไม่ต้องมีเลข MT5 ก่อน</small>
                  </div>
                </div>

                <div className="detail-list" style={{marginBottom:14}}>
                  {(Array.isArray(selectedCustomer.customer_slots) ? selectedCustomer.customer_slots : []).map((slot:any)=>(
                    <div key={slot.id}>
                      <span>
                        {slot.mode}{slot.account_number ? " · MT5 " + slot.account_number : ""}
                      </span>
                      <b>
                        {slot.mode === "LOCAL"
                          ? (slot.mt5_online
                              ? "EA ONLINE" + (slot.actual_state ? " · " + slot.actual_state : "")
                              : slot.account_number
                                ? "EA OFFLINE"
                                : "รอลูกค้าติดตั้ง / เปิด MT5")
                          : (slot.actual_state || "CLOUD")}
                      </b>
                    </div>
                  ))}
                  {!(Array.isArray(selectedCustomer.customer_slots) && selectedCustomer.customer_slots.length) && (
                    <div><span>บัญชี MT5</span><b>ยังไม่มีบัญชีที่เชื่อมต่อ</b></div>
                  )}
                </div>

                <div className="detail-list">
                  {memberships(selectedCustomer).length ? memberships(selectedCustomer).map((m:any)=>(
                    <div key={m.subscription_id}>
                      <span>{m.plan_code} · {m.mode}</span>
                      <b>
                        {m.active ? "ACTIVE" : m.status}
                        {" · ถึง " + new Date(m.expires_at).toLocaleDateString("th-TH")}
                        <button className="btn" style={{marginLeft:8}} onClick={()=>extendSubscription(selectedCustomer,m.subscription_id,7)}>+7 วัน</button>
                        <button className="btn" style={{marginLeft:6}} onClick={()=>extendSubscription(selectedCustomer,m.subscription_id,30)}>+30 วัน</button>
                      </b>
                    </div>
                  )) : (
                    <div><span>สมาชิก</span><b>ยังไม่มีสมาชิก</b></div>
                  )}
                </div>
              </section>
            )}

            <section className="owner-card owner-table-card">
              <div className="owner-card-head">
                <div><span className="owner-card-kicker">CUSTOMERS</span><h3>ลูกค้าและสิทธิ์</h3></div>
                <span className="owner-count">{users.length} รายการ</span>
              </div>
              <div className="table-wrap owner-table-wrap">
                <table>
                  <thead><tr><th>ลูกค้า</th><th>MT5 / Bot</th><th>สิทธิ์</th><th>สมาชิก</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                  <tbody>
                    {users.map(user=>{
                      const activeSelectedPlan = hasActivePlan(user, selectedPlan.code);
                      const activeSelectedMode = hasActiveMode(user, selectedPlan.mode);
                      return (
                      <tr key={user.id}>
                        <td><b>{user.user_code}</b><br/><span className="muted">{user.email}</span></td>
                        <td>
                          <b>{user.account_number || "ยังไม่เชื่อม MT5"}</b><br/>
                          <span className="muted">{user.broker_server || ""}</span>
                          {user.account_number && <div className="owner-mini-status"><span className={"dot "+(user.mt5_online?"green":"red")}/>{user.mt5_online ? "MT5 ONLINE" : (user.actual_state || "OFFLINE")} · {user.mode || "—"}</div>}
                        </td>
                        <td>
                          {user.role === "OWNER" || user.role === "ADMIN"
                            ? <><b className="text-good">FULL ACCESS</b><br/><span className="muted">ไม่ใช้ระบบ Trial</span></>
                            : user.trial_status
                              ? <><b>{"Trial " + user.trial_status}</b>{user.trial_expires_at && <><br/><span className="muted">ถึง {new Date(user.trial_expires_at).toLocaleString("th-TH")}</span></>}</>
                              : user.trial_request_status === "PENDING"
                                ? <div className="owner-trial-request"><b className="text-warn">รออนุมัติ Trial</b><small>LINE: {user.line_contact || "—"}</small><small>IP: {user.request_ip || "—"} · พบ {user.ip_user_count || 0} User / {user.ip_trial_count || 0} Trial</small></div>
                                : <><b>ยังไม่มี Trial</b><br/><span className="muted">รอลูกค้าส่งคำขอพร้อม LINE</span></>}
                        </td>
                        <td>
                          {user.partner_status && <div style={{marginBottom:6}}><span className={"owner-state-chip "+(user.partner_status === "ACTIVE" || user.partner_status === "READY" ? "good" : "bad")}>PARTNER {user.partner_active_customers || 0}/{user.partner_seat_limit || 0}</span></div>}
                          {user.role === "OWNER" || user.role === "ADMIN"
                            ? <><b className="text-good">OWNER UNLIMITED</b><br/><span className="muted">ไม่ต้องเปิด Trial / สมาชิก</span></>
                            : memberships(user).length
                              ? memberships(user).map((m:any)=>(
                                  <div key={m.subscription_id} style={{marginBottom:4}}>
                                    <b className={m.active ? "text-good" : ""}>{m.plan_code}</b><br/>
                                    <span className="muted">{m.mode}{m.allow_resale ? " · " + (m.slots || 1) + " Customer Seats" : ""} · {m.active ? "ACTIVE" : m.status} · ถึง {new Date(m.expires_at).toLocaleDateString("th-TH")}</span>
                                  </div>
                                ))
                              : <><b>ยังไม่มีสมาชิก</b><br/><span className="muted">เลือกแพ็กเกจด้านบนแล้วกดเปิดสมาชิก</span></>}
                        </td>
                        <td><span className={"owner-state-chip "+(user.status==="SUSPENDED"?"bad":"good")}>{user.status}</span></td>
                        <td>
                          {user.role === "OWNER" || user.role === "ADMIN" ? (
                            <div className="owner-system-account">
                              <span className="owner-state-chip good">SYSTEM OWNER</span>
                              <small>สิทธิ์ถาวร · ไม่ต้องจัดการแพ็กเกจ</small>
                            </div>
                          ) : (
                            <div className="owner-row-actions owner-row-actions-wrap">
                              <button className="btn" onClick={()=>setSelectedCustomerId(user.id)}>ดูบัญชี</button>
                              <button className="btn" disabled={!user.mt5_account_id || user.trial_request_status !== "PENDING" || Boolean(user.trial_status)} onClick={()=>grantTrial(user)}>อนุมัติ Trial 3h</button>
                              <button
                                className="btn primary"
                                disabled={activeSelectedPlan}
                                onClick={()=>activate(user, selectedPlan.code)}
                              >
                                {activeSelectedPlan
                                  ? selectedPlan.label + " ใช้งานอยู่"
                                  : activeSelectedMode
                                    ? "เปลี่ยนเป็น " + selectedPlan.label
                                    : "เปิด " + selectedPlan.label}
                              </button>
                              {user.status==="SUSPENDED"
                                ? <button className="btn primary" onClick={()=>reactivate(user)}>เปิดกลับ</button>
                                : <button className="btn danger" onClick={()=>suspend(user)}>ระงับ</button>}
                              <button className="btn danger subtle-danger" onClick={()=>deleteUser(user)}>ลบบัญชี</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                    {!users.length && <tr><td colSpan={6}><div className="owner-empty">ยังไม่มีผลการค้นหา</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeMenu === "workers" && <CloudConsole/>}
      </main>
    </div>
  );
}

function OwnerKpi({label,value,meta,tone}:{label:string;value:any;meta:string;tone:string}) {
  return (
    <div className={"owner-kpi "+tone}>
      <div className="owner-kpi-top"><span>{label}</span><span className="owner-kpi-dot"/></div>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}
