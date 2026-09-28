"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { CloudConsole } from "../../components/CloudConsole";
import { useSystemPopup } from "../../components/SystemPopupProvider";

type Menu = "overview"|"customers"|"workers";

export default function AdminPage() {
  const { confirmPopup, promptPopup } = useSystemPopup();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
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
  const [trialDays, setTrialDays] = useState(1);
  const [membershipDays, setMembershipDays] = useState<Record<string,number>>({});
  const [accessGroups, setAccessGroups] = useState<any[]>([]);
  const [selectedAccessGroupId, setSelectedAccessGroupId] = useState("");
  const [trialAccessGroupId, setTrialAccessGroupId] = useState("");
  const [newAccessGroupName, setNewAccessGroupName] = useState("");
  const [groupAction, setGroupAction] = useState("");
  const [customerAction, setCustomerAction] = useState("");

  async function search(e?: FormEvent, preserveMessage = false) {
    e?.preventDefault();
    setLoading(true);
    try {
      const [userRows, systemStatus, groupRows] = await Promise.all([
        adminApi("/admin/users?q=" + encodeURIComponent(query)),
        adminApi("/admin/system"),
        adminApi("/admin/access-groups")
      ]);
      setUsers(userRows);
      setSystem(systemStatus);
      setAccessGroups(Array.isArray(groupRows) ? groupRows : []);
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
    const safeDays = Math.max(1, Math.min(365, Math.trunc(Number(trialDays) || 1)));
    setCustomerAction("trial");
    try {
      const result = await adminApi("/admin/trials/authorize", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          days: safeDays,
          mt5AccountId: user.mt5_account_id || undefined,
          approvedBy: "OWNER",
          accessGroupId: trialAccessGroupId || undefined
        })
      });
      setMessage(
        result?.status === "APPROVED"
          ? "อนุมัติ Trial " + safeDays + " วันให้ " + user.user_code + " แล้ว · ผูกกับ MT5 เรียบร้อย"
          : "อนุมัติ Trial " + safeDays + " วันให้ " + user.user_code + " ล่วงหน้าแล้ว · ระบบจะผูกกับ MT5 แรกที่ลูกค้าเชื่อม"
      );
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function updateTrialDuration(user:any) {
    const safeDays = Math.max(1, Math.min(365, Math.trunc(Number(trialDays) || 1)));
    setCustomerAction("trial");
    try {
      await adminApi("/admin/trials/set-duration", {
        method:"POST",
        body:JSON.stringify({ userId:user.id, days:safeDays })
      });
      setMessage("ปรับ Trial ของ " + user.user_code + " เป็น " + safeDays + " วันแล้ว");
      await search(undefined, true);
    } catch (e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function sendPasswordReset(user:any) {
    const confirmed=await confirmPopup({
      title:"ส่งลิงก์ตั้งรหัสผ่านใหม่",
      tone:"warning",
      message:"ระบบจะส่งลิงก์แบบใช้ครั้งเดียวไปที่ " + user.email + " และลิงก์จะหมดอายุใน 30 นาที",
      confirmLabel:"ส่งอีเมล"
    });
    if(!confirmed) return;
    setCustomerAction("password");
    try {
      const result=await adminApi("/admin/users/send-password-reset", {
        method:"POST",
        body:JSON.stringify({ userId:user.id })
      });
      setMessage("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ " + (result?.email || user.email) + " แล้ว");
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function activate(user: any, planCode = plan) {
    try {
      const result = await adminApi("/admin/subscriptions/activate", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          planCode,
          durationDays: Math.max(1, Math.min(3650, Math.trunc(Number(days) || 30))),
          activatedBy: "OWNER",
          paidAmountSatang: paidAmountBaht.trim() ? Math.round(Number(paidAmountBaht) * 100) : 0,
          paymentReference: paymentReference.trim() || undefined,
          accessGroupId: selectedAccessGroupId || undefined
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

  async function adjustSubscriptionDays(user: any, subscriptionId: string, amount: number) {
    if (!subscriptionId) return setMessage("ไม่พบสมาชิกที่ต้องการปรับวัน");
    const daysValue = Math.max(1, Math.min(3650, Math.trunc(Math.abs(Number(amount) || 1))));
    const signedDays = amount < 0 ? -daysValue : daysValue;
    setCustomerAction("membership:"+subscriptionId);
    try {
      const result = await adminApi("/admin/subscriptions/adjust-days", {
        method: "POST",
        body: JSON.stringify({ subscriptionId, days: signedDays })
      });
      setMessage(
        (signedDays > 0 ? "เพิ่ม " : "ลด ") + daysValue + " วันให้ " + user.user_code +
        " แล้ว · หมดอายุ " + new Date(result.expires_at).toLocaleString("th-TH")
      );
      await search(undefined, true);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function setSubscriptionGroup(subscriptionId:string, groupId:string) {
    setCustomerAction("membership:"+subscriptionId);
    try {
      await adminApi("/admin/subscriptions/set-group", {
        method:"POST",
        body:JSON.stringify({ subscriptionId, groupId:groupId || null })
      });
      setMessage("อัปเดตกลุ่มสมาชิกแล้ว");
      await search(undefined, true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function setTrialGroup(userId:string, groupId:string) {
    setCustomerAction("trial");
    try {
      await adminApi("/admin/trials/set-group", {
        method:"POST",
        body:JSON.stringify({ userId, groupId:groupId || null })
      });
      setTrialAccessGroupId(groupId);
      setMessage("อัปเดตกลุ่ม Trial แล้ว");
      await search(undefined, true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function createAccessGroup() {
    const name = newAccessGroupName.trim();
    if (name.length < 2) return setMessage("กรุณาใส่ชื่อกลุ่มอย่างน้อย 2 ตัวอักษร");
    setGroupAction("create");
    try {
      const group = await adminApi("/admin/access-groups/create", {
        method:"POST",
        body:JSON.stringify({ name })
      });
      setNewAccessGroupName("");
      setMessage("สร้างกลุ่ม "+group.name+" แล้ว");
      await search(undefined, true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setGroupAction("");
    }
  }

  async function toggleAccessGroup(group:any) {
    const nextEnabled = !Boolean(group.enabled);
    if (!nextEnabled) {
      const confirmed = await confirmPopup({
        title:"ปิดสิทธิ์ทั้งกลุ่ม",
        tone:"warning",
        message:
          "ปิดกลุ่ม “"+group.name+"” หรือไม่?\n\n"+
          "ระบบจะบล็อกการใช้งานของ Subscription/Trial ที่อยู่ในกลุ่มนี้ และสั่ง Safe Stop เฉพาะบอทในกลุ่มนี้เท่านั้น สมาชิกกลุ่มอื่นจะไม่ถูกกระทบ",
        confirmLabel:"ปิดกลุ่มนี้"
      });
      if (!confirmed) return;
    }
    setGroupAction(group.id);
    try {
      const result = await adminApi("/admin/access-groups/toggle", {
        method:"POST",
        body:JSON.stringify({ groupId:group.id, enabled:nextEnabled })
      });
      setMessage(
        (nextEnabled ? "เปิด" : "ปิด") + "กลุ่ม " + group.name + " แล้ว" +
        (!nextEnabled && Number(result.safeStopped||0)>0 ? " · Safe Stop "+result.safeStopped+" บอท" : "")
      );
      await search(undefined, true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setGroupAction("");
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
    const confirmed=await confirmPopup({
      title:"ระงับสิทธิ์ Partner",
      tone:"warning",
      message:`ระงับสิทธิ์ Partner ของ ${user.user_code} หรือไม่? ลูกค้าที่เปิดไปแล้วจะยังใช้ได้ถึงวันหมดอายุของตัวเอง`,
      confirmLabel:"ระงับ Partner"
    });
    if (!confirmed) return;
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
    const confirmed=await confirmPopup({
      title:"ระงับบัญชี",
      tone:"warning",
      message:"ระงับ " + user.user_code + " และสั่ง Safe Stop บอทหรือไม่?",
      confirmLabel:"ระงับบัญชี"
    });
    if (!confirmed) return;
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
    const confirmed=await confirmPopup({
      title:"ลบบัญชีผู้ใช้",
      tone:"warning",
      message:
        "ลบบัญชี " + user.user_code + " ออกจากการใช้งานหรือไม่?\n\n" +
        "ระบบจะยกเลิกสิทธิ์และซ่อนบัญชีนี้ออกจากรายการ แต่จะเก็บประวัติ Trial ของเลข MT5 ไว้เพื่อป้องกันการรับ Trial ซ้ำ",
      confirmLabel:"ลบบัญชี"
    });
    if (!confirmed) return;
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
    const confirmed=await confirmPopup({
      title:"Safe Shutdown",
      tone:"warning",
      message:
        "ปิดระบบอย่างปลอดภัยตอนนี้หรือไม่?\n\n" +
        "ระบบจะบล็อก Start ใหม่ สั่งหยุดทุกบอท และส่ง Close All ให้บัญชีที่ยังมี Position ค้างอยู่",
      confirmLabel:"เริ่ม Safe Shutdown"
    });
    if (!confirmed) return;
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
    const confirmed=await confirmPopup({
      title:"บังคับปิด Position",
      tone:"warning",
      message:
        "ยืนยันบังคับปิด Position ทั้งหมดของบัญชีนี้?\n\n" +
        accountLabel + "\n" + positions + " Position\n\nระบบจะส่งคำสั่ง Close All ไปยัง EA ของบัญชีนี้และหยุดการเปิดรอบใหม่",
      confirmLabel:"Close All"
    });
    if (!confirmed) return;
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
    const typed = await promptPopup({
      title:"FORCE FLAT ALL ACCOUNTS",
      tone:"warning",
      message:
        "คำสั่งนี้เป็นสิทธิ์ OWNER สูงสุด\n\n" +
        "ระบบจะบล็อก Start ใหม่ทันที, STOP ทุก Bot และส่ง CLOSE_ALL ไปยังทุกบัญชีที่เกี่ยวข้อง\n" +
        "บัญชี Local ที่ออฟไลน์จะรับคำสั่งเมื่อ EA กลับมาออนไลน์",
      requiredText:"FORCE FLAT ALL",
      placeholder:"พิมพ์ FORCE FLAT ALL",
      copyLabel:"คัดลอกข้อความ",
      confirmLabel:"ตรวจสอบต่อ"
    });
    if (typed !== "FORCE FLAT ALL") return;

    const confirmed=await confirmPopup({
      title:"ยืนยันคำสั่งฉุกเฉิน",
      tone:"warning",
      message:
        "ยืนยัน FORCE FLAT ALL ACCOUNTS จริงหรือไม่?\n\n" +
        "หลังยืนยัน ระบบจะเข้าสู่โหมดปิดฉุกเฉินและจะไม่ถือว่าสำเร็จจนกว่า MT5/EA จะยืนยัน Position = 0",
      confirmLabel:"FORCE FLAT ALL"
    });
    if (!confirmed) return;

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
    const confirmed=await confirmPopup({
      title:"ยกเลิก Maintenance",
      tone:"warning",
      message:"ยกเลิกประกาศ Maintenance ที่ยังไม่เริ่มหรือไม่?",
      confirmLabel:"ยกเลิกประกาศ"
    });
    if (!confirmed) return;
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
    const confirmed=await confirmPopup({
      title:"เปิดระบบหลัง Maintenance",
      tone:"warning",
      message:"ยืนยันว่าอัปเดตเสร็จแล้วและต้องการเปิดให้ลูกค้ากด Start ได้อีกครั้ง?",
      confirmLabel:"เปิดระบบ"
    });
    if (!confirmed) return;
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
    customers: ["Customer Control Center","จัดการสิทธิ์ Local / Cloud VPS, Trial, วันใช้งาน และความปลอดภัยของลูกค้าจากจุดเดียว"],
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

            <section className="owner-kpi-grid">
              <OwnerKpi label="ผู้ใช้ทั้งหมด" value={system?.users?.total ?? "—"} meta="บัญชีที่ยังใช้งานในระบบ" tone="blue"/>
              <OwnerKpi label="ผู้ใช้ Active" value={system?.users?.active ?? "—"} meta="พร้อมใช้งาน" tone="green"/>
              <OwnerKpi label="Bots Running" value={system?.bots?.running ?? "—"} meta="กำลังทำงาน" tone="purple"/>
              <OwnerKpi label="Bots Offline" value={system?.bots?.offline ?? "—"} meta={(system?.slots?.active ?? 0) + " access records active"} tone={(system?.bots?.offline||0)>0?"red":"neutral"}/>
            </section>

            <section className={"owner-card owner-maintenance-card status-" + String(maintenance.status || "OFF").toLowerCase()}>
              <div className="owner-card-head owner-maintenance-head">
                <div>
                  <span className="owner-card-kicker">MAINTENANCE</span>
                  <h3>กำหนดช่วงปิดปรับปรุงระบบ</h3>
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
                  <span className="owner-card-kicker">EMERGENCY</span>
                  <b>ปิดทุก Position ทุกบัญชี</b>
                </div>
                <button className="btn danger owner-force-flat-button" disabled={maintenanceBusy} onClick={forceFlatAllAccounts}>
                  {maintenanceBusy ? "กำลังดำเนินการ..." : "FORCE FLAT ALL"}
                </button>
              </div>

              <div className="owner-maintenance-form">
                <div className="owner-maintenance-copy">
                  <div className="field"><label>หัวข้อประกาศ</label><input className="input" value={maintenanceTitle} onChange={e=>setMaintenanceTitle(e.target.value)} /></div>
                  <div className="field"><label>ข้อความแจ้งลูกค้า</label><input className="input" value={maintenanceMessage} onChange={e=>setMaintenanceMessage(e.target.value)} /></div>
                </div>
                <div className="owner-maintenance-dates">
                  <div className="field"><label>วัน/เวลา Maintenance</label><input className="input owner-date-input" type="datetime-local" value={maintenanceAt} onClick={e=>e.currentTarget.showPicker?.()} onFocus={e=>e.currentTarget.showPicker?.()} onChange={e=>setMaintenanceAt(e.target.value)} /></div>
                  <div className="field"><label>เวลาบังคับ Close All</label><input className="input owner-date-input" type="datetime-local" value={forceCloseAt} onClick={e=>e.currentTarget.showPicker?.()} onFocus={e=>e.currentTarget.showPicker?.()} onChange={e=>setForceCloseAt(e.target.value)} /></div>
                  <div className="field"><label>คาดว่าจะเปิดระบบ</label><input className="input owner-date-input" type="datetime-local" value={expectedResumeAt} onClick={e=>e.currentTarget.showPicker?.()} onFocus={e=>e.currentTarget.showPicker?.()} onChange={e=>setExpectedResumeAt(e.target.value)} /></div>
                </div>
                <label className="owner-maintenance-check"><input type="checkbox" checked={maintenanceForceClose} onChange={e=>setMaintenanceForceClose(e.target.checked)} /><span><b>บังคับปิด Position ที่ยังค้าง</b></span></label>
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

          </>
        )}

        {activeMenu === "customers" && (
          <>
            <section className="owner-customer-toolbar">
              <div>
                <span className="owner-card-kicker">CUSTOMER CONTROL CENTER</span>
                <h2>จัดการลูกค้าจากจุดเดียว</h2>
                <p>ค้นหาบัญชี → เลือกลูกค้า → จัดการ Local / Cloud VPS, Trial, วันใช้งาน และรหัสผ่านได้ทันที</p>
              </div>
              <form className="owner-search" onSubmit={search}>
                <input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="User ID, email, LINE หรือเลข MT5"/>
                <button className="btn primary" disabled={loading}>{loading?"กำลังค้นหา...":"ค้นหา"}</button>
              </form>
            </section>

            <section className="owner-access-group-panel">
              <div className="owner-access-group-head">
                <div>
                  <span className="owner-card-kicker">ACCESS GROUPS</span>
                  <h3>กลุ่มสิทธิ์สมาชิก</h3>
                  <p>แยกกลุ่มทดลองออกจากสมาชิกจริง และเปิด/ปิดสิทธิ์ได้เฉพาะกลุ่ม</p>
                </div>
                <div className="owner-access-group-create">
                  <input
                    className="input"
                    value={newAccessGroupName}
                    onChange={e=>setNewAccessGroupName(e.target.value.slice(0,80))}
                    placeholder="เช่น ทดลอง / Beta / สมาชิกจริง"
                  />
                  <button className="btn primary" disabled={groupAction==="create"} onClick={createAccessGroup}>
                    เพิ่มกลุ่ม
                  </button>
                </div>
              </div>
              <div className="owner-access-group-list">
                {accessGroups.length ? accessGroups.map((group:any)=>(
                  <div className={"owner-access-group-item "+(group.enabled?"enabled":"disabled")} key={group.id}>
                    <div>
                      <b>{group.name}</b>
                      <small>{Number(group.subscription_count||0)} สมาชิก · {Number(group.trial_count||0)} Trial</small>
                    </div>
                    <span className={"owner-state-chip "+(group.enabled?"good":"bad")}>{group.enabled?"เปิดใช้งาน":"ปิดอยู่"}</span>
                    <button
                      className={"btn "+(group.enabled?"danger":"primary")}
                      disabled={groupAction===group.id}
                      onClick={()=>toggleAccessGroup(group)}
                    >
                      {group.enabled?"ปิดทั้งกลุ่ม":"เปิดกลุ่ม"}
                    </button>
                  </div>
                )) : <div className="owner-control-empty">ยังไม่มีกลุ่ม · สร้างกลุ่ม “ทดลอง” เพื่อแยกจากสมาชิกจริงได้</div>}
              </div>
              <div className="owner-control-note">การปิดกลุ่มไม่ลบสมาชิกและไม่แก้วันหมดอายุ เมื่อเปิดกลับจะใช้วันหมดอายุเดิมต่อ</div>
            </section>

            <div className="owner-customer-layout">
              <aside className="owner-customer-directory">
                <div className="owner-customer-directory-head">
                  <div><b>Customer Accounts</b><small>{users.length} บัญชี</small></div>
                  <span className="owner-state-chip good">LIVE</span>
                </div>
                <div className="owner-customer-list">
                  {users.map(user=>{
                    const activeMemberships=memberships(user).filter((m:any)=>m.active);
                    return (
                      <button
                        type="button"
                        key={user.id}
                        className={"owner-customer-item "+(selectedCustomerId===user.id?"active":"")}
                        onClick={()=>{
                          setSelectedCustomerId(user.id);
                          setTrialDays(
                            user.trial_duration_minutes
                              ? Math.max(1,Math.ceil(Number(user.trial_duration_minutes)/1440))
                              : user.trial_authorization_minutes
                                ? Math.max(1,Math.ceil(Number(user.trial_authorization_minutes)/1440))
                                : 1
                          );
                          const mode=memberships(user).find((m:any)=>m.active)?.mode;
                          if(mode==="CLOUD") setPlan("CLOUD_30D");
                          else if(mode==="LOCAL") setPlan("LOCAL_30D");
                          setSelectedAccessGroupId("");
                          setTrialAccessGroupId(
                            String(user.trial_group_id || user.trial_authorization_group_id || "")
                          );
                          const nextMembershipDays:Record<string,number> = {};
                          memberships(user).forEach((m:any)=>{ nextMembershipDays[String(m.subscription_id)] = 1; });
                          setMembershipDays(nextMembershipDays);
                        }}
                      >
                        <span className="owner-customer-avatar">{String(user.user_code||"U").slice(-1)}</span>
                        <span className="owner-customer-item-copy">
                          <b>{user.user_code}</b>
                          <small>{user.email}</small>
                          <em>
                            {user.role === "OWNER" || user.role === "ADMIN"
                              ? "SYSTEM ACCOUNT"
                              : activeMemberships.length
                                ? activeMemberships.map((m:any)=>m.mode==="CLOUD"?"CLOUD VPS":"LOCAL").join(" + ")
                                : user.trial_status
                                  ? "TRIAL "+user.trial_status
                                  : user.trial_authorization_status==="PENDING_BIND"
                                    ? "TRIAL PREAPPROVED"
                                    : "NO ACCESS"}
                          </em>
                        </span>
                        <span className={"owner-customer-status-dot "+(user.status==="ACTIVE"?"good":"bad")}/>
                      </button>
                    );
                  })}
                  {!users.length && <div className="owner-customer-empty">ไม่พบบัญชีลูกค้า</div>}
                </div>
              </aside>

              <section className="owner-customer-control">
                {selectedCustomer ? (
                  <>
                    <div className="owner-customer-control-head">
                      <div className="owner-customer-identity">
                        <span className="owner-customer-avatar large">{String(selectedCustomer.user_code||"U").slice(-1)}</span>
                        <div>
                          <span className="owner-card-kicker">SELECTED CUSTOMER</span>
                          <h2>{selectedCustomer.user_code}</h2>
                          <p>{selectedCustomer.email}</p>
                        </div>
                      </div>
                      <div className="owner-customer-head-chips">
                        <span className={"owner-state-chip "+(selectedCustomer.status==="ACTIVE"?"good":"bad")}>{selectedCustomer.status}</span>
                        {selectedCustomer.email_verified_at && <span className="owner-state-chip good">EMAIL VERIFIED</span>}
                      </div>
                    </div>

                    {selectedCustomer.role === "OWNER" || selectedCustomer.role === "ADMIN" ? (
                      <div className="owner-system-readonly">
                        <b>System Account</b>
                        <span>บัญชี OWNER / ADMIN มีสิทธิ์ถาวรและไม่ใช้ Customer Membership Control</span>
                      </div>
                    ) : (
                      <>
                        <div className="owner-customer-snapshot">
                          <div><small>MT5</small><b>{selectedCustomer.account_number || "ยังไม่เชื่อม"}</b><span>{selectedCustomer.mt5_online ? "Online" : "Offline / Waiting"}</span></div>
                          <div><small>Trial</small><b>{selectedCustomer.trial_status || (selectedCustomer.trial_authorization_status==="PENDING_BIND"?"PREAPPROVED":selectedCustomer.trial_authorization_status==="BLOCKED"?"BLOCKED":selectedCustomer.trial_request_status==="PENDING"?"PENDING":"NONE")}</b><span>{selectedCustomer.trial_expires_at ? "ถึง "+new Date(selectedCustomer.trial_expires_at).toLocaleDateString("th-TH") : selectedCustomer.trial_duration_minutes ? Math.ceil(Number(selectedCustomer.trial_duration_minutes)/1440)+" วัน" : selectedCustomer.trial_authorization_minutes ? Math.ceil(Number(selectedCustomer.trial_authorization_minutes)/1440)+" วัน · รอ MT5" : "ยังไม่กำหนด"}</span></div>
                          <div><small>Local</small><b>{hasActiveMode(selectedCustomer,"LOCAL")?"ACTIVE":"OFF"}</b><span>{memberships(selectedCustomer).find((m:any)=>m.mode==="LOCAL"&&m.active)?.expires_at ? "ถึง "+new Date(memberships(selectedCustomer).find((m:any)=>m.mode==="LOCAL"&&m.active).expires_at).toLocaleDateString("th-TH") : "ไม่มีสิทธิ์"}</span></div>
                          <div><small>Cloud VPS</small><b>{hasActiveMode(selectedCustomer,"CLOUD")?"ACTIVE":"OFF"}</b><span>{memberships(selectedCustomer).find((m:any)=>m.mode==="CLOUD"&&m.active)?.expires_at ? "ถึง "+new Date(memberships(selectedCustomer).find((m:any)=>m.mode==="CLOUD"&&m.active).expires_at).toLocaleDateString("th-TH") : "ไม่มีสิทธิ์"}</span></div>
                        </div>

                        <div className="owner-control-grid">
                          <section className="owner-control-card access-card">
                            <div className="owner-control-card-head">
                              <div><span className="owner-card-kicker">ACCESS CONTROL</span><h3>Local / Cloud VPS</h3><p>เลือกสิทธิ์ที่ต้องการเปิดให้ลูกค้า แล้วกำหนดจำนวนวันได้อิสระ</p></div>
                              <span className="owner-count">{selectedPlan.mode}</span>
                            </div>

                            <div className="owner-access-mode-grid">
                              <button type="button" className={"owner-access-option "+(plan==="LOCAL_30D"?"active":"")} onClick={()=>setPlan("LOCAL_30D")}>
                                <span className="owner-access-check">{plan==="LOCAL_30D"?"✓":""}</span>
                                <span><b>Local MT5</b><small>ใช้ MT5 บนคอมลูกค้า</small></span>
                                {hasActiveMode(selectedCustomer,"LOCAL") && <em>ACTIVE</em>}
                              </button>
                              <button type="button" className={"owner-access-option "+(plan==="CLOUD_30D"?"active":"")} onClick={()=>setPlan("CLOUD_30D")}>
                                <span className="owner-access-check">{plan==="CLOUD_30D"?"✓":""}</span>
                                <span><b>Cloud VPS</b><small>ใช้ MT5 บน Trading VPS</small></span>
                                {hasActiveMode(selectedCustomer,"CLOUD") && <em>ACTIVE</em>}
                              </button>
                            </div>

                            <div className="owner-control-fields">
                              <label><span>จำนวนวัน</span><input className="input" type="number" min={1} max={3650} value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
                              <label><span>ยอดชำระจริง (บาท)</span><input className="input" type="number" min={0} step="0.01" value={paidAmountBaht} onChange={e=>setPaidAmountBaht(e.target.value)} placeholder="0.00"/></label>
                              <label>
                                <span>กลุ่มสิทธิ์</span>
                                <select className="input" value={selectedAccessGroupId} onChange={e=>setSelectedAccessGroupId(e.target.value)}>
                                  <option value="">ไม่จัดกลุ่ม</option>
                                  {accessGroups.map((group:any)=><option key={group.id} value={group.id}>{group.name}{group.enabled?"":" · ปิดอยู่"}</option>)}
                                </select>
                              </label>
                              <label className="wide"><span>Payment Reference</span><input className="input" value={paymentReference} onChange={e=>setPaymentReference(e.target.value.slice(0,160))} placeholder="PromptPay / slip / note"/></label>
                            </div>
                            <button
                              className="btn primary owner-wide-action"
                              disabled={hasActivePlan(selectedCustomer,selectedPlan.code) || Boolean(customerAction)}
                              onClick={()=>activate(selectedCustomer,selectedPlan.code)}
                            >
                              {hasActivePlan(selectedCustomer,selectedPlan.code)
                                ? selectedPlan.label+" ใช้งานอยู่ — เพิ่มวันด้านล่าง"
                                : "เปิด "+(selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" "+days+" วัน"}
                            </button>

                            <div className="owner-membership-list">
                              {memberships(selectedCustomer).length ? memberships(selectedCustomer).map((m:any)=>(
                                <div className="owner-membership-row" key={m.subscription_id}>
                                  <div>
                                    <span className={"owner-mode-badge "+String(m.mode).toLowerCase()}>{m.mode==="CLOUD"?"CLOUD VPS":"LOCAL"}</span>
                                    <b>{m.plan_code}</b>
                                    <small>
                                      {m.active?"ใช้งานอยู่":"สถานะ "+m.status} · หมดอายุ {new Date(m.expires_at).toLocaleString("th-TH")}
                                      {m.group_name ? " · กลุ่ม "+m.group_name+(m.group_enabled===false?" (ปิด)":"") : ""}
                                    </small>
                                  </div>
                                  <div className="owner-membership-actions">
                                    <select
                                      value={String(m.group_id || "")}
                                      disabled={Boolean(customerAction)}
                                      onChange={e=>setSubscriptionGroup(m.subscription_id,e.target.value)}
                                    >
                                      <option value="">ไม่จัดกลุ่ม</option>
                                      {accessGroups.map((group:any)=><option key={group.id} value={group.id}>{group.name}{group.enabled?"":" · ปิดอยู่"}</option>)}
                                    </select>
                                    <div className="owner-add-days">
                                      <input
                                        type="number"
                                        min={1}
                                        max={3650}
                                        value={membershipDays[String(m.subscription_id)] ?? 1}
                                        onChange={e=>setMembershipDays(prev=>({...prev,[String(m.subscription_id)]:Math.max(1,Number(e.target.value)||1)}))}
                                      />
                                      <button
                                        className="btn danger"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>adjustSubscriptionDays(selectedCustomer,m.subscription_id,-(membershipDays[String(m.subscription_id)] ?? 1))}
                                      >
                                        − ลดวัน
                                      </button>
                                      <button
                                        className="btn"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>adjustSubscriptionDays(selectedCustomer,m.subscription_id,membershipDays[String(m.subscription_id)] ?? 1)}
                                      >
                                        + เพิ่มวัน
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )) : <div className="owner-control-empty">ยังไม่มีสมาชิกแบบชำระเงิน</div>}
                            </div>
                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><span className="owner-card-kicker">TRIAL CONTROL</span><h3>กำหนดวันทดลอง</h3><p>เปลี่ยนจาก 1 วันเป็น 7 วัน หรือจำนวนอื่นได้ทันที</p></div>
                            </div>
                            <div className="owner-trial-control">
                              <label><span>Trial Days</span><input className="input" type="number" min={1} max={365} value={trialDays} onChange={e=>setTrialDays(Number(e.target.value))}/></label>
                              <label>
                                <span>กลุ่ม Trial</span>
                                <select
                                  className="input"
                                  value={trialAccessGroupId}
                                  disabled={customerAction==="trial"}
                                  onChange={e=>{
                                    const next=e.target.value;
                                    setTrialAccessGroupId(next);
                                    if (selectedCustomer.trial_status || selectedCustomer.trial_authorization_status==="PENDING_BIND") {
                                      setTrialGroup(selectedCustomer.id,next);
                                    }
                                  }}
                                >
                                  <option value="">ไม่จัดกลุ่ม</option>
                                  {accessGroups.map((group:any)=><option key={group.id} value={group.id}>{group.name}{group.enabled?"":" · ปิดอยู่"}</option>)}
                                </select>
                              </label>
                              {selectedCustomer.trial_status || selectedCustomer.trial_authorization_status==="PENDING_BIND" ? (
                                <button className="btn primary" disabled={customerAction==="trial"} onClick={()=>updateTrialDuration(selectedCustomer)}>
                                  บันทึก Trial {trialDays} วัน
                                </button>
                              ) : (
                                <button
                                  className="btn primary"
                                  disabled={customerAction==="trial" || selectedCustomer.trial_authorization_status==="BLOCKED"}
                                  onClick={()=>grantTrial(selectedCustomer)}
                                >
                                  {selectedCustomer.mt5_account_id ? "อนุมัติ Trial "+trialDays+" วัน" : "อนุมัติ Trial "+trialDays+" วันล่วงหน้า"}
                                </button>
                              )}
                            </div>
                            <div className="owner-control-note">
                              {selectedCustomer.trial_status
                                ? "Trial ปัจจุบัน: "+selectedCustomer.trial_status+(selectedCustomer.trial_started_at?" · เริ่ม "+new Date(selectedCustomer.trial_started_at).toLocaleString("th-TH"):" · พร้อมเริ่มเมื่อผู้ใช้กด Start")
                                : selectedCustomer.trial_authorization_status==="PENDING_BIND"
                                  ? "อนุมัติล่วงหน้าแล้ว · รอ MT5 แรกของลูกค้าเชื่อม ระบบจะผูก Trial ให้อัตโนมัติ"
                                  : selectedCustomer.trial_authorization_status==="BLOCKED"
                                    ? "Trial ถูกบล็อก: "+(selectedCustomer.trial_authorization_blocked_reason||"บัญชีหรือ MT5 มีประวัติ Trial แล้ว")
                                    : selectedCustomer.mt5_account_id
                                      ? "Owner สามารถอนุมัติ Trial ได้ทันที ไม่ต้องรอคำขอจากลูกค้า"
                                      : "ยังไม่เชื่อม MT5 · Owner สามารถอนุมัติล่วงหน้าได้ และระบบจะผูกสิทธิ์กับ MT5 แรกที่ลูกค้าเชื่อม"}
                            </div>
                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><span className="owner-card-kicker">ACCOUNT SECURITY</span><h3>รีเซ็ตรหัสผ่าน</h3><p>ส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลลูกค้าโดยไม่เปิดเผยรหัสผ่านเดิม</p></div>
                            </div>
                            <div className="owner-security-email">
                              <span>Email</span><b>{selectedCustomer.email}</b>
                              <small>{selectedCustomer.email_verified_at?"ยืนยันอีเมลแล้ว":"ยังไม่ยืนยันอีเมล"}</small>
                            </div>
                            <button className="btn owner-wide-action" disabled={customerAction==="password"} onClick={()=>sendPasswordReset(selectedCustomer)}>
                              {customerAction==="password"?"กำลังส่ง...":"ส่งลิงก์ตั้งรหัสผ่านใหม่"}
                            </button>
                            <div className="owner-control-note">ลิงก์ใช้ได้ครั้งเดียว · หมดอายุใน 30 นาที · ลูกค้าเป็นผู้ตั้งรหัสใหม่เอง</div>
                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><span className="owner-card-kicker">MT5 & DEVICE</span><h3>สถานะการเชื่อมต่อ</h3><p>ดู Local / Cloud Slot และ MT5 ที่ระบบตรวจพบ</p></div>
                            </div>
                            <div className="owner-slot-list">
                              {(Array.isArray(selectedCustomer.customer_slots)?selectedCustomer.customer_slots:[]).map((slot:any)=>(
                                <div key={slot.id}>
                                  <span className={"owner-mode-badge "+String(slot.mode).toLowerCase()}>{slot.mode==="CLOUD"?"CLOUD VPS":"LOCAL"}</span>
                                  <div><b>{slot.account_number?"MT5 "+slot.account_number:"รอเชื่อม MT5"}</b><small>{slot.mode==="LOCAL"?(slot.mt5_online?"EA ONLINE":"EA OFFLINE / WAITING"):(slot.actual_state||"CLOUD READY")}</small></div>
                                </div>
                              ))}
                              {!(Array.isArray(selectedCustomer.customer_slots)&&selectedCustomer.customer_slots.length) && <div className="owner-control-empty">ยังไม่มี Slot ที่เชื่อมต่อ</div>}
                            </div>
                          </section>
                        </div>

                        <details className="owner-customer-advanced">
                          <summary><span><b>Partner Program</b><small>จัดการ Seats และอายุ Partner เมื่อต้องการ</small></span><span>Advanced ▾</span></summary>
                          <div className="owner-partner-grid compact">
                            <div className="field"><label>Customer Seats</label><select className="input" value={partnerSeats} onChange={e=>setPartnerSeats(Number(e.target.value))}><option value={10}>10 Seats</option><option value={25}>25 Seats</option><option value={50}>50 Seats</option></select></div>
                            <div className="field"><label>Partner Days</label><input className="input" type="number" min={1} value={partnerDurationDays} onChange={e=>setPartnerDurationDays(Number(e.target.value))}/></div>
                            <div className="field"><label>Customer Days</label><input className="input" type="number" min={1} value={partnerCustomerDays} onChange={e=>setPartnerCustomerDays(Number(e.target.value))}/></div>
                          </div>
                          <div className="owner-maintenance-actions">
                            <button className="btn primary" disabled={partnerBusy} onClick={()=>grantPartner(selectedCustomer)}>{selectedCustomer.partner_status?"อัปเดต Partner":"เปิดสิทธิ์ Partner"}</button>
                            {selectedCustomer.partner_status && <button className="btn" disabled={partnerBusy} onClick={()=>renewPartner(selectedCustomer)}>+{partnerDurationDays} วัน</button>}
                            {(selectedCustomer.partner_status==="ACTIVE"||selectedCustomer.partner_status==="READY") && <button className="btn danger" disabled={partnerBusy} onClick={()=>suspendPartner(selectedCustomer)}>ระงับ Partner</button>}
                          </div>
                        </details>

                        <div className="owner-account-actions">
                          <div><b>Account Status</b><small>ใช้เมื่อต้องระงับหรือเปิดบัญชีกลับมา</small></div>
                          {selectedCustomer.status==="SUSPENDED"
                            ? <button className="btn primary" onClick={()=>reactivate(selectedCustomer)}>เปิดบัญชีกลับ</button>
                            : <button className="btn danger" onClick={()=>suspend(selectedCustomer)}>ระงับบัญชี</button>}
                          <button className="btn danger subtle-danger" onClick={()=>deleteUser(selectedCustomer)}>ลบบัญชี</button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="owner-customer-placeholder">
                    <span>◎</span>
                    <b>เลือกลูกค้าที่ต้องการจัดการ</b>
                    <p>คลิกบัญชีทางซ้าย แล้วเครื่องมือ Local / Cloud VPS, Trial, วันใช้งาน และ Password Reset จะแสดงที่นี่</p>
                  </div>
                )}
              </section>
            </div>
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
