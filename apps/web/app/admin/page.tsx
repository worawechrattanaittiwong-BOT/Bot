"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { CloudConsole } from "../../components/CloudConsole";
import { AdminCloudMt5Connect } from "../../components/AdminCloudMt5Connect";
import { useSystemPopup } from "../../components/SystemPopupProvider";
import { SymbolSwitchChecklist, getSymbolSwitchProgress } from "../../components/SymbolSwitchProgress";

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
  const [groupTrialDays, setGroupTrialDays] = useState<Record<string,number>>({});
  const [expandedGroupId, setExpandedGroupId] = useState("");
  const [groupMembers, setGroupMembers] = useState<Record<string,any[]>>({});
  const [accessGrantType, setAccessGrantType] = useState<"MEMBERSHIP"|"GROUP">("MEMBERSHIP");
  const [selectedTrialGroupId, setSelectedTrialGroupId] = useState("");
  const [newAccessGroupName, setNewAccessGroupName] = useState("");
  const [groupAction, setGroupAction] = useState("");
  const [customerAction, setCustomerAction] = useState("");
  // Admin post-connection Symbol change; never reuses the first-connect wizard.
  const [symbolSwitchOperation, setSymbolSwitchOperation] = useState<any>(null);
  const [symbolSwitchMinimized, setSymbolSwitchMinimized] = useState(false);
  const [announcementTitle,setAnnouncementTitle] = useState("ประกาศจาก SCENOVA");
  const [announcementMessage,setAnnouncementMessage] = useState("");
  const [announcementBusy,setAnnouncementBusy] = useState(false);

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
      const nextGroups = Array.isArray(groupRows) ? groupRows : [];
      setAccessGroups(nextGroups);
      setGroupTrialDays(prev=>{
        const next={...prev};
        nextGroups.forEach((group:any)=>{
          if (next[String(group.id)] === undefined) next[String(group.id)] = Math.max(1, Number(group.trial_days || 1));
        });
        return next;
      });
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

  useEffect(() => {
    if (!symbolSwitchOperation || symbolSwitchOperation.status !== "RUNNING" ||
        !symbolSwitchOperation.acknowledged || !symbolSwitchOperation.requestedAt) return;
    let cancelled = false;
    const operation = symbolSwitchOperation;
    const check = async () => {
      try {
        // Admin users already exposes a per-Slot live MT5 snapshot. Poll only
        // that read endpoint; never call account connection or reload actions.
        const rows = await adminApi("/admin/users?q=" + encodeURIComponent(operation.userCode));
        if (cancelled) return;
        const user = Array.isArray(rows)
          ? rows.find((item:any)=>String(item.id) === String(operation.userId))
          : null;
        const slot = (Array.isArray(user?.customer_slots) ? user.customer_slots : [])
          .find((item:any)=>String(item.id) === String(operation.slotId));
        if (!slot) return;
        const snapshot = {
          target:String(operation.target),
          requestedAt:String(operation.requestedAt),
          serverRequestedAt:String(slot.symbol_change_requested_at || ""),
          acknowledged:true,
          isCloud:String(slot.mode || "").toUpperCase() === "CLOUD",
          runnerOnline:Boolean(slot.runner_online),
          commandStatus:String(slot.symbol_change_status || ""),
          mt5Online:Boolean(slot.mt5_online),
          brokerConnected:typeof slot.terminal_connected === "boolean"
            ? slot.terminal_connected : null,
          activeSymbol:String(slot.active_symbol || ""),
          heartbeatAt:String(slot.last_seen_at || ""),
          error:String(slot.symbol_change_error || slot.provisioning_error || "")
        };
        const progress = getSymbolSwitchProgress(snapshot);
        setSymbolSwitchOperation((current:any)=>current?.id === operation.id
          ? {
              ...current,
              snapshot,
              message:progress.message,
              status:progress.failed ? "FAILED" : progress.complete ? "SUCCESS" : "RUNNING"
            }
          : current);
        if (progress.complete) {
          setMessage("เปลี่ยนเป็น " + operation.target + " สำเร็จ · EA ยืนยัน Symbol และ MT5 เชื่อมต่อแล้ว");
          void search(undefined,true);
        }
      } catch {
        // Temporary dashboard/network failure is not proof of MT5 failure.
      }
    };
    void check();
    const timer = window.setInterval(check,2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbolSwitchOperation?.id, symbolSwitchOperation?.status,
      symbolSwitchOperation?.acknowledged, symbolSwitchOperation?.requestedAt]);

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
          approvedBy: "OWNER"
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

  async function grantGroupAccess(user:any, mode:string) {
    if (!selectedTrialGroupId) {
      setMessage("กรุณาเลือกกลุ่มทดลองก่อน");
      return;
    }
    const group=accessGroups.find((item:any)=>String(item.id)===String(selectedTrialGroupId));
    if (!group) {
      setMessage("ไม่พบกลุ่มทดลอง");
      return;
    }
    if (!group.enabled) {
      setMessage("กลุ่มทดลองนี้ปิดอยู่ กรุณาเปิดกลุ่มก่อน");
      return;
    }
    const safeDays=Math.max(1,Math.min(365,Math.trunc(Number(days)||Number(group.trial_days)||1)));
    setCustomerAction("group-grant:"+mode);
    try {
      const result=await adminApi("/admin/access-groups/grant", {
        method:"POST",
        body:JSON.stringify({
          groupId:selectedTrialGroupId,
          userId:user.id,
          mode,
          days:safeDays
        })
      });
      setMessage(
        "ให้ "+user.user_code+" ทดลอง "+(mode==="CLOUD"?"Cloud VPS":"Local MT5")+
        " "+safeDays+" วันในกลุ่ม "+group.name+" แล้ว · สมาชิกจริงไม่เปลี่ยน"
      );
      await search(undefined,true);
      if (expandedGroupId===selectedTrialGroupId) await loadAccessGroupMembers(selectedTrialGroupId);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function adjustSubscriptionDays(user: any, subscriptionId: string, mode: string, amount: number) {
    if (!subscriptionId) return setMessage("ไม่พบสมาชิกที่ต้องการปรับวัน");
    const daysValue = Math.max(1, Math.min(3650, Math.trunc(Math.abs(Number(amount) || 1))));
    const signedDays = amount < 0 ? -daysValue : daysValue;
    setCustomerAction("membership:"+subscriptionId);
    try {
      const result = await adminApi("/admin/subscriptions/adjust-days", {
        method: "POST",
        body: JSON.stringify({ subscriptionId, days: signedDays, userId:user.id, mode })
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

  async function deleteCustomerSlot(user:any, slot:any) {
    if (!canDeleteCustomerSlot(user,slot)) return;
    const slotLabel = (slot.mode==="CLOUD" ? "Cloud VPS" : "Local MT5") + " Slot #" + Number(slot.slot_number || 0);
    const confirmed=await confirmPopup({
      title:"ลบ "+slotLabel,
      tone:"warning",
      message:"ยืนยันลบ "+slotLabel+" ของ "+user.user_code+" หรือไม่?",
      confirmLabel:"ลบ Slot"
    });
    if(!confirmed) return;
    setCustomerAction("slot-delete:"+slot.id);
    try {
      let result:any=null;
      for(let attempt=0; attempt<8; attempt++) {
        result=await adminApi("/admin/slots/delete", {
          method:"POST",
          body:JSON.stringify({ userId:user.id, slotId:slot.id })
        });
        if(!result?.pendingCloudStop) break;
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      if(result?.pendingCloudStop) {
        setMessage("กำลังปิด VPS กรุณาลองลบอีกครั้งในอีกสักครู่");
      } else {
        setMessage("ลบ "+slotLabel+" แล้ว");
      }
      await search(undefined,true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function selectCustomerSlotSymbol(user:any, slot:any) {
    if (!slot?.id || !slot?.account_number) return;
    if (symbolSwitchOperation?.status === "RUNNING") {
      setSymbolSwitchMinimized(false);
      return;
    }
    const label=(slot.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" Slot #"+Number(slot.slot_number||0);
    const marketWatch=Array.isArray(slot.market_watch_symbols)
      ? slot.market_watch_symbols
          .map((item:any)=>String(item||"").trim())
          .filter(Boolean)
          .slice(0,24)
      : [];
    const current=String(slot.requested_symbol || slot.active_symbol || "").trim();
    const typed=await promptPopup({
      title:"เลือก Symbol · "+label,
      tone:"warning",
      message:
        (String(slot.symbol_resolution_mode || "").toUpperCase() === "EXACT"
          ? "เปลี่ยน Symbol ของบัญชีที่เชื่อมแล้ว · เลือกชื่อจาก Market Watch ให้ตรงทุกตัว เช่น XAUUSDm, BTCUSDm\n"
          : "ยืนยัน Symbol ครั้งแรก · เลือก XAU ที่ระบบตรวจพบจาก MT5 เท่านั้น เช่น XAUUSDm\n")+
        (current ? "\nค่าที่เลือกอยู่: "+current : "")+
        (marketWatch.length ? "\nMarket Watch ล่าสุด: "+marketWatch.join(", ") : "\nยังไม่มี Market Watch ล่าสุด · สามารถพิมพ์ Symbol ที่เห็นใน MT5 ของลูกค้าได้")+
        "\n\nต้องหยุดบอทและไม่มี Position / Pending Order ก่อนดำเนินการ",
      placeholder:current || "เช่น XAUUSDm",
      confirmLabel:"ใช้ Symbol นี้"
    });
    if(typed===null) return;
    const symbol=String(typed||"").trim();
    if(!symbol || symbol.length>64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) {
      setMessage("Symbol ไม่ถูกต้อง");
      return;
    }

    const confirmedAccount = String(slot.symbol_resolution_mode || "").toUpperCase() === "EXACT";
    const changing = confirmedAccount && symbol.toUpperCase() !== current.toUpperCase();
    const operationId = "admin-symbol-" + Date.now();
    if (changing) {
      setSymbolSwitchMinimized(false);
      setSymbolSwitchOperation({
        id:operationId,
        userId:user.id,
        userCode:String(user.user_code || ""),
        slotId:slot.id,
        target:symbol,
        isCloud:String(slot.mode || "").toUpperCase() === "CLOUD",
        acknowledged:false,
        status:"RUNNING",
        message:"กำลังส่งคำสั่งเปลี่ยน Symbol ให้ Server...",
        startedAt:Date.now()
      });
    }
    setCustomerAction("slot-select-symbol:"+slot.id);
    try {
      const result=await adminApi("/admin/slots/select-symbol", {
        method:"POST",
        body:JSON.stringify({ userId:user.id, slotId:slot.id, symbol })
      });
      if (changing) {
        const acceptedSymbol = String(result?.symbol || symbol);
        setSymbolSwitchOperation((current:any)=>current?.id === operationId
          ? {
              ...current,
              target:acceptedSymbol,
              acknowledged:true,
              requestedAt:String(result?.symbolChangeRequestedAt || ""),
              message:"Server รับคำสั่งแล้ว · กำลังรอ VPS เปิดกราฟ " + acceptedSymbol
            }
          : current);
      } else {
        setMessage(result?.message || "กำหนด Symbol ให้ Slot แล้ว");
      }
      await search(undefined,true);
    } catch(e:any) {
      setMessage(e.message);
      if (changing) {
        setSymbolSwitchOperation((current:any)=>current?.id === operationId
          ? {...current,status:"FAILED",message:String(e?.message || "เปลี่ยน Symbol ไม่สำเร็จ")}
          : current);
      }
    } finally {
      setCustomerAction("");
    }
  }

  async function refreshCustomerSlotSymbol(user:any, slot:any) {
    if (!slot?.id || !slot?.account_number) return;
    const label=(slot.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" Slot #"+Number(slot.slot_number||0);
    const confirmed=await confirmPopup({
      title:"โหลด Symbol ใหม่ · "+label,
      tone:"warning",
      message:
        "ระบบจะรีโหลดเฉพาะ "+label+" แล้วดึง Market Watch / Symbol ใหม่จากบัญชี MT5 จริง\n\n"+
        "ต้องหยุดบอทและไม่มี Position / Pending Order ก่อนดำเนินการ",
      confirmLabel:"โหลด Symbol ใหม่"
    });
    if(!confirmed) return;

    setCustomerAction("slot-symbol:"+slot.id);
    try {
      const result=await adminApi("/admin/slots/refresh-symbol", {
        method:"POST",
        body:JSON.stringify({ userId:user.id, slotId:slot.id })
      });
      setMessage(result?.message || "ส่งคำสั่งโหลด Symbol ใหม่แล้ว");
      await search(undefined,true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function repairCustomerSlotRuntime(user:any, slot:any) {
    if (!slot?.id || !slot?.account_number || slot?.mode !== "CLOUD") return;
    const label="Cloud VPS Slot #"+Number(slot.slot_number||0);
    const confirmed=await confirmPopup({
      title:"ซ่อม MT5 / EA · "+label,
      tone:"warning",
      message:
        "ระบบจะสร้าง Cloud Runtime ใหม่เฉพาะ "+label+" โดยใช้ Trading Credential เดิมที่เข้ารหัสไว้\n\n"+
        "บัญชี MT5, สมาชิก และประวัติ Trial จะไม่ถูกลบ ต้องหยุดบอทและไม่มี Position / Pending Order ก่อนดำเนินการ",
      confirmLabel:"ซ่อม MT5 / EA"
    });
    if(!confirmed) return;

    setCustomerAction("slot-repair:"+slot.id);
    try {
      const result=await adminApi("/admin/slots/repair-runtime", {
        method:"POST",
        body:JSON.stringify({ userId:user.id, slotId:slot.id })
      });
      setMessage(result?.message || "ส่งคำสั่งซ่อม MT5 / EA แล้ว");
      await search(undefined,true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setCustomerAction("");
    }
  }

  async function disconnectCustomerSlotMt5(user:any, slot:any) {
    if (!slot?.id || !slot?.account_number) return;
    const label=(slot.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" Slot #"+Number(slot.slot_number||0);
    const confirmed=await confirmPopup({
      title:"ตัดการเชื่อมต่อ MT5 · "+label,
      tone:"warning",
      message:
        "ยืนยันตัด MT5 "+slot.account_number+" ออกจาก "+label+" หรือไม่?\n\n"+
        "หลังตัดแล้ว Slot จะขึ้นว่า “รอเชื่อม MT5” และลูกค้าต้องเชื่อมบัญชีใหม่ ระบบจึงจะดึง Symbol ใหม่จากบัญชีจริง",
      confirmLabel:"ตัดการเชื่อมต่อ"
    });
    if(!confirmed) return;

    setCustomerAction("slot-disconnect:"+slot.id);
    try {
      let result:any=null;
      for(let attempt=0; attempt<10; attempt++) {
        result=await adminApi("/admin/slots/disconnect-mt5", {
          method:"POST",
          body:JSON.stringify({ userId:user.id, slotId:slot.id })
        });
        if(!result?.pendingCloudStop) break;
        await new Promise(resolve=>setTimeout(resolve,1200));
      }
      setMessage(
        result?.pendingCloudStop
          ? "กำลังปิด MT5 ของ Slot นี้บน VPS กรุณารอสักครู่แล้วกดตัดการเชื่อมต่ออีกครั้ง"
          : (result?.message || "ตัดการเชื่อมต่อ MT5 แล้ว")
      );
      await search(undefined,true);
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

  async function loadAccessGroupMembers(groupId:string) {
    const result = await adminApi("/admin/access-groups/members?groupId=" + encodeURIComponent(groupId));
    const members = Array.isArray(result?.members) ? result.members : [];
    setGroupMembers(prev=>({...prev,[groupId]:members}));
    return members;
  }

  async function toggleGroupDetails(group:any) {
    if (expandedGroupId===group.id) {
      setExpandedGroupId("");
      return;
    }
    setGroupAction("details:"+group.id);
    try {
      await loadAccessGroupMembers(group.id);
      setExpandedGroupId(group.id);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setGroupAction("");
    }
  }

  async function saveGroupTrialDays(group:any) {
    const value=Math.max(1,Math.min(365,Math.trunc(Number(groupTrialDays[String(group.id)] || group.trial_days || 1))));
    setGroupAction("days:"+group.id);
    try {
      await adminApi("/admin/access-groups/set-trial-days", {
        method:"POST",
        body:JSON.stringify({ groupId:group.id, days:value })
      });
      setMessage("กำหนด Trial เริ่มต้นของกลุ่ม "+group.name+" เป็น "+value+" วันแล้ว");
      await search(undefined,true);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setGroupAction("");
    }
  }

  async function removeMemberFromGroup(group:any, member:any) {
    const paidText = member.paid_local || member.paid_cloud
      ? "\n\nสมาชิกจริงยังคงใช้งานต่อ: " +
        [member.paid_local ? "Local" : "", member.paid_cloud ? "VPS" : ""].filter(Boolean).join(" + ")
      : "";
    const confirmed=await confirmPopup({
      title:"ยกเลิกสิทธิ์ทดลอง · "+member.user_code,
      tone:"warning",
      message:
        "ยกเลิกสิทธิ์ทดลองของ "+member.user_code+" ในกลุ่ม “"+group.name+"” หรือไม่?"+
        paidText+
        "\n\nการดำเนินการนี้ไม่ลบวันสมาชิกจริง",
      confirmLabel:"ยกเลิก Trial"
    });
    if(!confirmed) return;
    setGroupAction("remove:"+member.user_id);
    try {
      const result=await adminApi("/admin/access-groups/revoke-member", {
        method:"POST",
        body:JSON.stringify({ groupId:group.id, userId:member.user_id })
      });
      setMessage(
        "ยกเลิก Trial ของ "+member.user_code+" แล้ว"+
        (result.paidMembershipsKept ? " · สมาชิกจริงยังอยู่เหมือนเดิม" : "")
      );
      await search(undefined,true);
      await loadAccessGroupMembers(group.id);
    } catch(e:any) {
      setMessage(e.message);
    } finally {
      setGroupAction("");
    }
  }

  async function deleteAccessGroup(group:any) {
    setGroupAction("delete-preview:"+group.id);
    try {
      const members=await loadAccessGroupMembers(group.id);
      const names=[...new Set(members.map((item:any)=>String(item.user_code||"")).filter(Boolean))];
      const preview=names.slice(0,12).join(", ");
      const more=names.length>12 ? " และอีก "+(names.length-12)+" บัญชี" : "";
      const paidCount=[...new Set(
        members
          .filter((item:any)=>item.paid_local || item.paid_cloud)
          .map((item:any)=>String(item.user_id||""))
      )].length;
      const confirmed=await confirmPopup({
        title:"ลบกลุ่มทดลอง "+group.name,
        tone:"warning",
        message:
          "ลบกลุ่มนี้หรือไม่? สิทธิ์ Trial ที่เปิดผ่านกลุ่มนี้จะสิ้นสุดทันที\n"+
          "แต่วันสมาชิกจริง Local/VPS จะไม่ถูกลดหรือลบ\n\n"+
          (names.length ? "ผู้ทดลอง: "+preview+more+"\n" : "กลุ่มนี้ยังไม่มีผู้ทดลอง\n")+
          (paidCount ? "ในนี้มี "+paidCount+" บัญชีที่มีสมาชิกจริง และจะยังใช้งานต่อได้\n\n" : "\n")+
          "บัญชีที่ไม่มีสมาชิกจริงจะหมดสิทธิ์ใช้งานทันที",
        confirmLabel:"ลบกลุ่มและจบ Trial"
      });
      if(!confirmed) return;
      setGroupAction("delete:"+group.id);
      const result=await adminApi("/admin/access-groups/delete", {
        method:"POST",
        body:JSON.stringify({ groupId:group.id })
      });
      if(expandedGroupId===group.id) setExpandedGroupId("");
      setMessage(
        "ลบกลุ่ม "+group.name+" แล้ว · จบ Trial "+Number(result.trialCount||0)+" บัญชี · สมาชิกจริงไม่เปลี่ยน"
      );
      await search(undefined,true);
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

  async function publishAnnouncement() {
    const title=announcementTitle.trim();
    const message=announcementMessage.trim();
    if (!title || !message) return setMessage("กรุณาระบุหัวข้อและข้อความประกาศ");
    setAnnouncementBusy(true);
    try {
      await adminApi("/admin/announcements/publish",{
        method:"POST",body:JSON.stringify({title,message})
      });
      setMessage("เผยแพร่ประกาศทั่วไปให้ลูกค้าแล้ว โดยไม่ตั้งเวลาและไม่หยุดบอท");
      await search(undefined,true);
    } catch(e:any) { setMessage(e.message); }
    finally { setAnnouncementBusy(false); }
  }

  async function clearAnnouncement() {
    const ok=await confirmPopup({
      title:"ยกเลิกประกาศทั่วไป",tone:"warning",
      message:"นำข้อความประกาศนี้ออกจาก Dashboard ลูกค้าหรือไม่? ไม่มีผลต่อบอทและ Maintenance",
      confirmLabel:"ยกเลิกประกาศ"
    });
    if (!ok) return;
    setAnnouncementBusy(true);
    try {
      await adminApi("/admin/announcements/clear",{method:"POST"});
      setMessage("ยกเลิกประกาศทั่วไปแล้ว");
      await search(undefined,true);
    } catch(e:any) { setMessage(e.message); }
    finally { setAnnouncementBusy(false); }
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
      message:"ยืนยันเปิดระบบ? บัญชีที่ยังมี Position/Pending หรือ Close All ค้าง จะถูกคงไว้ใน Safe Stop และยังเปิดรอบใหม่ไม่ได้",
      confirmLabel:"เปิดระบบ"
    });
    if (!confirmed) return;
    setMaintenanceBusy(true);
    try {
      await adminApi("/admin/maintenance/resume", { method: "POST" });
      setMessage("เปิดระบบหลัง Maintenance แล้ว บัญชีที่ยังมี Position/Pending จะคงอยู่ใน Safe Stop จนกว่าจะเคลียร์สำเร็จ");
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
  const isCurrentMembership = (m:any) =>
    m?.status==="ACTIVE" && Boolean(m?.expires_at) && new Date(m.expires_at).getTime()>Date.now();
  const currentModeMembership = (user:any, mode:string) => {
    const current = memberships(user).filter((m:any)=>m.mode===mode && isCurrentMembership(m));
    if (mode === "CLOUD") {
      return current.find((m:any)=>String(m.slot_type || "").toUpperCase()==="PERSONAL")
        || current.find((m:any)=>String(m.slot_type || "").toUpperCase()!=="ADDON")
        || current[0]
        || null;
    }
    return current[0] || null;
  };
  const customerSlots = (user:any) => Array.isArray(user?.customer_slots) ? user.customer_slots : [];
  const canonicalCustomerSlot = (user:any, mode:string) => {
    const normalizedMode=String(mode || "").toUpperCase();
    const rows=customerSlots(user).filter((slot:any)=>String(slot?.mode || "").toUpperCase()===normalizedMode);
    if (!rows.length) return null;
    return [...rows].sort((a:any,b:any)=>{
      if (normalizedMode==="CLOUD") {
        const aPrimary=String(a?.slot_type || "").toUpperCase()==="PERSONAL" ? 0 : 1;
        const bPrimary=String(b?.slot_type || "").toUpperCase()==="PERSONAL" ? 0 : 1;
        if (aPrimary!==bPrimary) return aPrimary-bPrimary;
      }
      const aMt5=a?.account_number ? 0 : 1;
      const bMt5=b?.account_number ? 0 : 1;
      if (aMt5!==bMt5) return aMt5-bMt5;
      const aSubscription=a?.subscription_id ? 0 : 1;
      const bSubscription=b?.subscription_id ? 0 : 1;
      if (aSubscription!==bSubscription) return aSubscription-bSubscription;
      const aNumber=Number(a?.slot_number || 999999);
      const bNumber=Number(b?.slot_number || 999999);
      if (aNumber!==bNumber) return aNumber-bNumber;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    })[0];
  };
  const canDeleteCustomerSlot = (user:any, slot:any) => {
    const mode=String(slot?.mode || "").toUpperCase();
    const rows=customerSlots(user).filter((item:any)=>String(item?.mode || "").toUpperCase()===mode);
    if (rows.length<=1) return false;
    const keep=canonicalCustomerSlot(user,mode);
    return Boolean(keep?.id) && String(keep.id)!==String(slot?.id);
  };
  const hasCurrentPlan = (user:any, planCode:string) =>
    memberships(user).some((m:any)=>m.plan_code===planCode && isCurrentMembership(m));
  const hasActiveMode = (user:any, mode:string) =>
    memberships(user).some((m:any)=>m.mode===mode && m.active);
  const modeAccessLabel = (user:any, mode:string) => {
    const current=currentModeMembership(user,mode);
    if (!current) return "OFF";
    return current.group_enabled===false ? "PAUSED" : "ACTIVE";
  };

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
    customers: ["จัดการลูกค้า",""],
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
            {title[1] && <p>{title[1]}</p>}
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

            <section className="owner-card" aria-label="ประกาศทั่วไปให้ลูกค้า">
              <div className="owner-card-head">
                <div>
                  <span className="owner-card-kicker">ANNOUNCEMENT</span>
                  <h3>ประกาศทั่วไป · ไม่กำหนดวันเวลา</h3>
                  <p>แสดงประกาศบน Dashboard ลูกค้าจนกว่าแอดมินจะยกเลิก โดยไม่หยุดบอทหรือเปลี่ยนสถานะ Maintenance</p>
                </div>
              </div>
              {system?.announcement && (
                <div className="owner-maintenance-current" role="status">
                  <b>ประกาศที่แสดงอยู่: {system.announcement.title}</b>
                  <span style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{system.announcement.message}</span>
                </div>
              )}
              <div className="owner-maintenance-form">
                <div className="owner-maintenance-copy">
                  <div className="field">
                    <label htmlFor="general-announcement-title">หัวข้อประกาศ</label>
                    <input id="general-announcement-title" className="input" maxLength={160}
                      value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)}/>
                  </div>
                  <div className="field">
                    <label htmlFor="general-announcement-message">ข้อความประกาศ</label>
                    <textarea id="general-announcement-message" className="input" rows={4} maxLength={3000}
                      placeholder="พิมพ์ประกาศที่จะให้ลูกค้าทุกคนเห็น"
                      value={announcementMessage} onChange={e=>setAnnouncementMessage(e.target.value)}
                      style={{width:"100%",resize:"vertical",minHeight:100,boxSizing:"border-box"}}/>
                  </div>
                </div>
              </div>
              <div className="owner-maintenance-actions">
                <button className="btn primary" type="button"
                  disabled={announcementBusy || !announcementTitle.trim() || !announcementMessage.trim()}
                  onClick={()=>void publishAnnouncement()}>
                  {announcementBusy?"กำลังดำเนินการ...":system?.announcement?"อัปเดตประกาศ":"เผยแพร่ประกาศ"}
                </button>
                {system?.announcement && <button className="btn" type="button"
                  disabled={announcementBusy} onClick={()=>void clearAnnouncement()}>ยกเลิกประกาศ</button>}
              </div>
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
                {(maintenance.status === "DRAINING" || maintenance.status === "MAINTENANCE") && <button className="btn primary" disabled={maintenanceBusy} onClick={resumeMaintenance}>เปิดระบบหลังอัปเดต</button>}
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
                <h2>ค้นหาลูกค้า</h2>
              </div>
              <form className="owner-search" onSubmit={search}>
                <input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="User ID, email, LINE หรือเลข MT5"/>
                <button className="btn primary" disabled={loading}>{loading?"กำลังค้นหา...":"ค้นหา"}</button>
              </form>
            </section>

            <section className="owner-access-group-panel">
              <div className="owner-access-group-head">
                <div>
                  <h3>กลุ่มทดลอง</h3>
                </div>
                <div className="owner-access-group-create">
                  <input
                    className="input"
                    value={newAccessGroupName}
                    onChange={e=>setNewAccessGroupName(e.target.value.slice(0,80))}
                    placeholder="เช่น ทดลอง / Beta / Test รอบแรก"
                  />
                  <button className="btn primary" disabled={groupAction==="create"} onClick={createAccessGroup}>
                    เพิ่มกลุ่ม
                  </button>
                </div>
              </div>
              <div className="owner-access-group-list">
                {accessGroups.length ? accessGroups.map((group:any)=>(
                  <div className={"owner-access-group-item "+(group.enabled?"enabled":"disabled")} key={group.id}>
                    <div className="owner-access-group-summary">
                      <div>
                        <b>{group.name}</b>
                        <small>
                          {Number(group.trial_count||0)} ผู้ทดลอง
                          {Number(group.paid_member_count||0)>0 ? " · "+Number(group.paid_member_count||0)+" มีสมาชิกจริง" : ""}
                        </small>
                      </div>
                      <span className={"owner-state-chip "+(group.enabled?"good":"bad")}>{group.enabled?"เปิดใช้งาน":"ปิดอยู่"}</span>
                    </div>

                    <div className="owner-access-group-days">
                      <label>
                        <span>Trial เริ่มต้น</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={groupTrialDays[String(group.id)] ?? Number(group.trial_days || 1)}
                          onChange={e=>setGroupTrialDays(prev=>({...prev,[String(group.id)]:Math.max(1,Math.min(365,Number(e.target.value)||1))}))}
                        />
                      </label>
                      <span>วัน</span>
                      <button className="btn" disabled={groupAction==="days:"+group.id} onClick={()=>saveGroupTrialDays(group)}>บันทึก</button>
                    </div>

                    <div className="owner-access-group-actions">
                      <button className="btn" disabled={Boolean(groupAction)} onClick={()=>toggleGroupDetails(group)}>
                        {expandedGroupId===group.id?"ซ่อนรายชื่อ":"ดูรายชื่อ"}
                      </button>
                      <button
                        className={"btn "+(group.enabled?"danger":"primary")}
                        disabled={Boolean(groupAction)}
                        onClick={()=>toggleAccessGroup(group)}
                      >
                        {group.enabled?"ปิดทั้งกลุ่ม":"เปิดกลุ่ม"}
                      </button>
                      <button className="btn danger" disabled={Boolean(groupAction)} onClick={()=>deleteAccessGroup(group)}>
                        ลบกลุ่ม
                      </button>
                    </div>

                    {expandedGroupId===group.id && (
                      <div className="owner-access-group-members">
                        {(groupMembers[String(group.id)] || []).length ? (groupMembers[String(group.id)] || []).map((member:any)=>(
                          <div className="owner-access-group-member" key={member.user_id+":"+member.mode}>
                            <div>
                              <b>{member.user_code}</b>
                              <small>
                                ทดลอง {member.mode==="CLOUD"?"Cloud VPS":"Local MT5"}
                                {member.expires_at ? " · ถึง "+new Date(member.expires_at).toLocaleString("th-TH") : ""}
                                {member.paid_local || member.paid_cloud
                                  ? " · สมาชิกจริง: "+[member.paid_local?"Local":"",member.paid_cloud?"VPS":""].filter(Boolean).join(" + ")
                                  : " · ไม่มีสมาชิกจริง"}
                              </small>
                            </div>
                            <button
                              className="btn danger"
                              disabled={Boolean(groupAction)}
                              onClick={()=>removeMemberFromGroup(group,member)}
                            >
                              ยกเลิก Trial
                            </button>
                          </div>
                        )) : <div className="owner-control-empty">กลุ่มนี้ยังไม่มีสมาชิก</div>}
                      </div>
                    )}
                  </div>
                )) : <div className="owner-control-empty">ยังไม่มีกลุ่มทดลอง</div>}
              </div>
            </section>

            <div className="owner-customer-layout">
              <aside className="owner-customer-directory">
                <div className="owner-customer-directory-head">
                  <div><b>บัญชีลูกค้า</b><small>{users.length} บัญชี</small></div>
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
                          const mode=memberships(user).find((m:any)=>isCurrentMembership(m))?.mode;
                          if(mode==="CLOUD") setPlan("CLOUD_30D");
                          else if(mode==="LOCAL") setPlan("LOCAL_30D");
                          setAccessGrantType("MEMBERSHIP");
                          setSelectedTrialGroupId("");
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
                        <b>บัญชีผู้ดูแลระบบ</b>
                        <small>สิทธิ์ระบบเป็นแบบถาวร · เครื่องมือด้านล่างจัดการเฉพาะ MT5 / Slot ของบัญชีนี้</small>
                        <section className="owner-control-card owner-system-mt5-tools">
                          <div className="owner-control-card-head">
                            <div><h3>MT5 และ Slot</h3></div>
                            <span className="owner-count">{customerSlots(selectedCustomer).length} SLOT</span>
                          </div>
                          <div className="owner-slot-list">
                            {customerSlots(selectedCustomer).map((slot:any)=>(
                              <div className="owner-slot-row" key={slot.id}>
                                <span className={"owner-mode-badge "+String(slot.mode).toLowerCase()}>{slot.mode==="CLOUD"?"CLOUD VPS":"LOCAL"}</span>
                                <div>
                                  <b>Slot #{Number(slot.slot_number || 0)} · {slot.account_number?"MT5 "+slot.account_number:"รอเชื่อม MT5"}</b>
                                  <small>
                                    {slot.mt5_online?"ONLINE":"OFFLINE"}
                                    {slot.requested_symbol ? " · เลือก "+slot.requested_symbol : ""}
                                    {slot.active_symbol && String(slot.active_symbol).toUpperCase()!==String(slot.requested_symbol||"").toUpperCase() ? " · ใช้งานจริง "+slot.active_symbol : ""}
                                    {slot.provisioning_error ? " · "+slot.provisioning_error : ""}
                                  </small>
                                </div>
                                <div className="owner-slot-actions">
                                  {slot.account_number && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn owner-slot-select-symbol"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>void selectCustomerSlotSymbol(selectedCustomer,slot)}
                                      >
                                        {customerAction==="slot-select-symbol:"+slot.id?"กำลังตั้ง...":"เลือก Symbol"}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn owner-slot-refresh"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>void refreshCustomerSlotSymbol(selectedCustomer,slot)}
                                      >
                                        {customerAction==="slot-symbol:"+slot.id?"กำลังโหลด...":"โหลด Symbol ใหม่"}
                                      </button>
                                      {slot.mode==="CLOUD" && (
                                        <button
                                          type="button"
                                          className="btn primary owner-slot-repair"
                                          disabled={Boolean(customerAction)}
                                          onClick={()=>void repairCustomerSlotRuntime(selectedCustomer,slot)}
                                        >
                                          {customerAction==="slot-repair:"+slot.id?"กำลังซ่อม...":"ซ่อม MT5 / EA"}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                            {!customerSlots(selectedCustomer).length && <div className="owner-control-empty">ยังไม่มี Slot ที่ผูกกับบัญชีผู้ดูแลระบบ</div>}
                          </div>
                        </section>
                      </div>
                    ) : (
                      <>
                        <div className="owner-customer-snapshot">
                          <div><small>MT5</small><b>{selectedCustomer.account_number || "ยังไม่เชื่อม"}</b><span>{selectedCustomer.mt5_online ? "Online" : "Offline / Waiting"}</span></div>
                          <div><small>Trial</small><b>{selectedCustomer.trial_status || (selectedCustomer.trial_authorization_status==="PENDING_BIND"?"PREAPPROVED":selectedCustomer.trial_authorization_status==="BLOCKED"?"BLOCKED":selectedCustomer.trial_request_status==="PENDING"?"PENDING":"NONE")}</b><span>{selectedCustomer.trial_expires_at ? "ถึง "+new Date(selectedCustomer.trial_expires_at).toLocaleDateString("th-TH") : selectedCustomer.trial_duration_minutes ? Math.ceil(Number(selectedCustomer.trial_duration_minutes)/1440)+" วัน" : selectedCustomer.trial_authorization_minutes ? Math.ceil(Number(selectedCustomer.trial_authorization_minutes)/1440)+" วัน · รอ MT5" : "ยังไม่กำหนด"}</span></div>
                          <div>
                            <small>Local</small>
                            <b>{modeAccessLabel(selectedCustomer,"LOCAL")}</b>
                            <span>{currentModeMembership(selectedCustomer,"LOCAL")?.expires_at ? "ถึง "+new Date(currentModeMembership(selectedCustomer,"LOCAL").expires_at).toLocaleDateString("th-TH") : "ไม่มีสิทธิ์"}</span>
                          </div>
                          <div>
                            <small>Cloud VPS</small>
                            <b>{modeAccessLabel(selectedCustomer,"CLOUD")}</b>
                            <span>{currentModeMembership(selectedCustomer,"CLOUD")?.expires_at ? "ถึง "+new Date(currentModeMembership(selectedCustomer,"CLOUD").expires_at).toLocaleDateString("th-TH") : "ไม่มีสิทธิ์"}</span>
                          </div>
                        </div>

                        <div className="owner-control-grid">
                          <section className="owner-control-card access-card">
                            <div className="owner-control-card-head">
                              <div><h3>สิทธิ์ใช้งาน</h3></div>
                              <span className="owner-count">{selectedPlan.mode}</span>
                            </div>

                            <div className="owner-access-mode-grid">
                              <button type="button" className={"owner-access-option "+(plan==="LOCAL_30D"?"active":"")} onClick={()=>setPlan("LOCAL_30D")}>
                                <span className="owner-access-check">{plan==="LOCAL_30D"?"✓":""}</span>
                                <span><b>Local MT5</b></span>
                                {currentModeMembership(selectedCustomer,"LOCAL") && <em>{modeAccessLabel(selectedCustomer,"LOCAL")}</em>}
                              </button>
                              <button type="button" className={"owner-access-option "+(plan==="CLOUD_30D"?"active":"")} onClick={()=>setPlan("CLOUD_30D")}>
                                <span className="owner-access-check">{plan==="CLOUD_30D"?"✓":""}</span>
                                <span><b>Cloud VPS</b></span>
                                {currentModeMembership(selectedCustomer,"CLOUD") && <em>{modeAccessLabel(selectedCustomer,"CLOUD")}</em>}
                              </button>
                            </div>

                            <div className="owner-access-type-switch">
                              <button
                                type="button"
                                className={accessGrantType==="MEMBERSHIP"?"active":""}
                                onClick={()=>setAccessGrantType("MEMBERSHIP")}
                              >
                                สมาชิกจริง
                              </button>
                              <button
                                type="button"
                                className={accessGrantType==="GROUP"?"active":""}
                                onClick={()=>{
                                  setAccessGrantType("GROUP");
                                  if (!selectedTrialGroupId && accessGroups.length) {
                                    const group=accessGroups.find((item:any)=>item.enabled) || accessGroups[0];
                                    if(group) {
                                      setSelectedTrialGroupId(String(group.id));
                                      setDays(Math.max(1,Math.min(365,Number(group.trial_days||1))));
                                    }
                                  }
                                }}
                              >
                                ทดลองเป็นกลุ่ม
                              </button>
                            </div>

                            {accessGrantType==="MEMBERSHIP" ? (
                              <>
                                <div className="owner-control-fields">
                                  <label><span>จำนวนวัน</span><input className="input" type="number" min={1} max={3650} value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
                                  <label><span>ยอดชำระ (บาท)</span><input className="input" type="number" min={0} step="0.01" value={paidAmountBaht} onChange={e=>setPaidAmountBaht(e.target.value)} placeholder="0.00"/></label>
                                  <label className="wide"><span>อ้างอิงการชำระ</span><input className="input" value={paymentReference} onChange={e=>setPaymentReference(e.target.value.slice(0,160))} placeholder="PromptPay / Slip / Note"/></label>
                                </div>
                                <button
                                  className="btn primary owner-wide-action"
                                  disabled={hasCurrentPlan(selectedCustomer,selectedPlan.code) || Boolean(customerAction)}
                                  onClick={()=>activate(selectedCustomer,selectedPlan.code)}
                                >
                                  {hasCurrentPlan(selectedCustomer,selectedPlan.code)
                                    ? (selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" ใช้งานอยู่"
                                    : "เปิด "+(selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5")+" "+days+" วัน"}
                                </button>

                                {currentModeMembership(selectedCustomer,selectedPlan.mode) ? (
                                  <div className="owner-selected-membership-adjust">
                                    <div>
                                      <b>ปรับวัน {selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5"}</b>
                                    </div>
                                    <div className="owner-add-days">
                                      <input
                                        type="number"
                                        min={1}
                                        max={3650}
                                        value={membershipDays[String(currentModeMembership(selectedCustomer,selectedPlan.mode)?.subscription_id)] ?? 1}
                                        onChange={e=>{
                                          const id=String(currentModeMembership(selectedCustomer,selectedPlan.mode)?.subscription_id||"");
                                          if(id) setMembershipDays(prev=>({...prev,[id]:Math.max(1,Number(e.target.value)||1)}));
                                        }}
                                      />
                                      <button
                                        className="btn danger"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>{
                                          const m=currentModeMembership(selectedCustomer,selectedPlan.mode);
                                          if(m) adjustSubscriptionDays(selectedCustomer,m.subscription_id,selectedPlan.mode,-(membershipDays[String(m.subscription_id)] ?? 1));
                                        }}
                                      >
                                        − ลดวัน
                                      </button>
                                      <button
                                        className="btn"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>{
                                          const m=currentModeMembership(selectedCustomer,selectedPlan.mode);
                                          if(m) adjustSubscriptionDays(selectedCustomer,m.subscription_id,selectedPlan.mode,membershipDays[String(m.subscription_id)] ?? 1);
                                        }}
                                      >
                                        + เพิ่มวัน
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="owner-control-note owner-membership-adjust-note">
                                    ยังไม่มีสมาชิก {selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5"}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="owner-control-fields owner-group-grant-fields">
                                  <label className="owner-field-select">
                                    <span>กลุ่มทดลอง</span>
                                    <select
                                      className="input"
                                      value={selectedTrialGroupId}
                                      onChange={e=>{
                                        const next=e.target.value;
                                        setSelectedTrialGroupId(next);
                                        const group=accessGroups.find((item:any)=>String(item.id)===String(next));
                                        if(group?.trial_days) setDays(Math.max(1,Math.min(365,Number(group.trial_days))));
                                      }}
                                    >
                                      <option value="">เลือกกลุ่มทดลอง</option>
                                      {accessGroups.map((group:any)=><option key={group.id} value={group.id}>{group.name}{group.enabled?"":" · ปิดอยู่"}</option>)}
                                    </select>
                                  </label>
                                  <label>
                                    <span>จำนวนวันทดลอง</span>
                                    <input className="input" type="number" min={1} max={365} value={days} onChange={e=>setDays(Math.max(1,Math.min(365,Number(e.target.value)||1)))}/>
                                  </label>
                                </div>
                                <button
                                  className="btn primary owner-wide-action"
                                  disabled={!selectedTrialGroupId || Boolean(customerAction)}
                                  onClick={()=>grantGroupAccess(selectedCustomer,selectedPlan.mode)}
                                >
                                  ให้ทดลอง {selectedPlan.mode==="CLOUD"?"Cloud VPS":"Local MT5"} {days} วัน
                                </button>
                              </>
                            )}

                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><h3>Trial</h3></div>
                            </div>
                            <div className="owner-trial-control">
                              <label><span>จำนวนวัน Trial</span><input className="input" type="number" min={1} max={365} value={trialDays} onChange={e=>setTrialDays(Number(e.target.value))}/></label>
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
                                ? "สถานะ: "+selectedCustomer.trial_status
                                : selectedCustomer.trial_authorization_status==="PENDING_BIND"
                                  ? "สถานะ: รอเชื่อม MT5"
                                  : selectedCustomer.trial_authorization_status==="BLOCKED"
                                    ? "สถานะ: ไม่พร้อมใช้งาน"
                                    : selectedCustomer.mt5_account_id
                                      ? "สถานะ: พร้อมอนุมัติ"
                                      : "สถานะ: รอเชื่อม MT5"}
                            </div>
                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><h3>รีเซ็ตรหัสผ่าน</h3></div>
                            </div>
                            <div className="owner-security-email">
                              <span>Email</span><b>{selectedCustomer.email}</b>
                              <small>{selectedCustomer.email_verified_at?"ยืนยันอีเมลแล้ว":"ยังไม่ยืนยันอีเมล"}</small>
                            </div>
                            <button className="btn owner-wide-action" disabled={customerAction==="password"} onClick={()=>sendPasswordReset(selectedCustomer)}>
                              {customerAction==="password"?"กำลังส่ง...":"ส่งลิงก์ตั้งรหัสผ่านใหม่"}
                            </button>
                          </section>

                          <section className="owner-control-card">
                            <div className="owner-control-card-head">
                              <div><h3>MT5 และ Slot</h3></div>
                            </div>
                            <div className="owner-slot-list">
                              {customerSlots(selectedCustomer).map((slot:any)=>(
                                <Fragment key={slot.id}>
                                <div className="owner-slot-row">
                                  <span className={"owner-mode-badge "+String(slot.mode).toLowerCase()}>{slot.mode==="CLOUD"?"CLOUD VPS":"LOCAL"}</span>
                                  <div>
                                    <b>Slot #{Number(slot.slot_number || 0)} · {slot.account_number?"MT5 "+slot.account_number:"รอเชื่อม MT5"}</b>
                                    <small>
                                      {slot.mt5_online?"ONLINE":"OFFLINE"}
                                      {slot.requested_symbol ? " · เลือก "+slot.requested_symbol : ""}
                                      {slot.active_symbol && String(slot.active_symbol).toUpperCase()!==String(slot.requested_symbol||"").toUpperCase() ? " · ใช้งานจริง "+slot.active_symbol : ""}
                                      {slot.provisioning_error ? " · "+slot.provisioning_error : ""}
                                    </small>
                                  </div>
                                  <div className="owner-slot-actions">
                                    {slot.account_number && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn owner-slot-select-symbol"
                                          disabled={Boolean(customerAction)}
                                          onClick={()=>void selectCustomerSlotSymbol(selectedCustomer,slot)}
                                        >
                                          {customerAction==="slot-select-symbol:"+slot.id?"กำลังตั้ง...":"เลือก Symbol"}
                                        </button>
                                        {slot.mode==="CLOUD" && (
                                          <button
                                            type="button"
                                            className="btn primary owner-slot-repair"
                                            disabled={Boolean(customerAction)}
                                            onClick={()=>void repairCustomerSlotRuntime(selectedCustomer,slot)}
                                          >
                                            {customerAction==="slot-repair:"+slot.id?"กำลังซ่อม...":"ซ่อม MT5 / EA"}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="btn owner-slot-refresh"
                                          disabled={Boolean(customerAction)}
                                          onClick={()=>void refreshCustomerSlotSymbol(selectedCustomer,slot)}
                                        >
                                          {customerAction==="slot-symbol:"+slot.id?"กำลังโหลด...":"โหลด Symbol ใหม่"}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn danger owner-slot-disconnect"
                                          disabled={Boolean(customerAction)}
                                          onClick={()=>void disconnectCustomerSlotMt5(selectedCustomer,slot)}
                                        >
                                          {customerAction==="slot-disconnect:"+slot.id?"กำลังตัด...":"ตัดการเชื่อมต่อ"}
                                        </button>
                                      </>
                                    )}
                                    {canDeleteCustomerSlot(selectedCustomer,slot) && (
                                      <button
                                        type="button"
                                        className="btn danger owner-slot-delete"
                                        disabled={Boolean(customerAction)}
                                        onClick={()=>void deleteCustomerSlot(selectedCustomer,slot)}
                                      >
                                        {customerAction==="slot-delete:"+slot.id?"กำลังลบ...":"ลบ"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {slot.mode==="CLOUD" && (
                                  <AdminCloudMt5Connect key={selectedCustomer.id+":"+slot.id}
                                    userId={selectedCustomer.id} userCode={selectedCustomer.user_code}
                                    slotId={slot.id} slotNumber={Number(slot.slot_number||0)}
                                    linkedAccount={String(slot.account_number||"")}
                                    onMessage={setMessage} onLinked={()=>search(undefined,true)}/>
                                )}
                                </Fragment>
                              ))}
                              {!customerSlots(selectedCustomer).length && <div className="owner-control-empty">ยังไม่มี Slot</div>}
                            </div>
                          </section>
                        </div>

                        <details className="owner-customer-advanced">
                          <summary><span><b>Partner Program</b></span><span>Advanced ▾</span></summary>
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
                          <div><b>สถานะบัญชี</b></div>
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

      {symbolSwitchOperation && symbolSwitchMinimized && (
        <button type="button" className="btn" onClick={()=>setSymbolSwitchMinimized(false)}
          style={{position:"fixed",right:16,bottom:18,zIndex:1199,borderColor:"#7e6be1",background:"#181532",color:"#e3ddff"}}>
          {symbolSwitchOperation.status === "RUNNING" ? "กำลังเปลี่ยน " : "สถานะ "}
          {symbolSwitchOperation.target} · ดูความคืบหน้า
        </button>
      )}
      {symbolSwitchOperation && !symbolSwitchMinimized && (
        <div className="cc-server-operation-backdrop">
          <section className={"cc-server-operation-terminal mt5-connect-view status-"+
            String(symbolSwitchOperation.status).toLowerCase()}
            role="dialog" aria-modal="true" aria-labelledby="admin-symbol-switch-heading">
            <header>
              <div>
                <span className="cc-server-operation-icon">&gt;_</span>
                <div>
                  <small>สถานะการเปลี่ยน Symbol · Cloud/Local MT5</small>
                  <h3 id="admin-symbol-switch-heading">กำลังเปลี่ยนเป็น {symbolSwitchOperation.target}</h3>
                </div>
              </div>
              <button type="button" aria-label="ย่อสถานะหรือปิด"
                onClick={()=>{
                  if(symbolSwitchOperation.status==="RUNNING") setSymbolSwitchMinimized(true);
                  else setSymbolSwitchOperation(null);
                }}>×</button>
            </header>
            <div className="cc-server-operation-body">
              <div className="cc-server-operation-line">
                <span className="prompt">STATUS</span>
                <b>{symbolSwitchOperation.status==="SUCCESS" ? "ยืนยัน Symbol สำเร็จ" :
                  symbolSwitchOperation.status==="FAILED" ? "เปลี่ยนไม่สำเร็จ" : "กำลังเปลี่ยน Symbol"}</b>
              </div>
              <SymbolSwitchChecklist input={symbolSwitchOperation.snapshot
                ? {...symbolSwitchOperation.snapshot,status:String(symbolSwitchOperation.status)}
                : {
                target:String(symbolSwitchOperation.target || ""),
                requestedAt:String(symbolSwitchOperation.requestedAt || ""),
                acknowledged:Boolean(symbolSwitchOperation.acknowledged),
                isCloud:Boolean(symbolSwitchOperation.isCloud),
                runnerOnline:false,
                mt5Online:false,
                status:String(symbolSwitchOperation.status)
              }}/>
              <p aria-live="polite">{symbolSwitchOperation.message}</p>
              <div className="cc-server-operation-meta">
                <span>SYMBOL</span><b>{symbolSwitchOperation.target}</b>
              </div>
              <div className="cc-server-operation-progress" aria-hidden="true"><i/></div>
            </div>
            <footer>
              <span>{symbolSwitchOperation.status==="RUNNING"
                ? "ระบบติดตามสถานะจาก VPS/MT5 จริง · ย่อหน้าต่างแล้วทำงานต่อได้"
                : symbolSwitchOperation.status==="SUCCESS"
                  ? "EA ยืนยัน Symbol ใหม่แล้ว · พร้อมเริ่มบอทด้วยตนเอง"
                  : "ระบบยังไม่ยืนยัน Symbol ใหม่ · กรุณาตรวจสอบรายละเอียด"}</span>
              <button type="button" className="btn" onClick={()=>{
                if(symbolSwitchOperation.status==="RUNNING") setSymbolSwitchMinimized(true);
                else setSymbolSwitchOperation(null);
              }}>{symbolSwitchOperation.status==="RUNNING" ? "ย่อไว้ · ทำงานต่อ" : "ปิด"}</button>
            </footer>
          </section>
        </div>
      )}
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
