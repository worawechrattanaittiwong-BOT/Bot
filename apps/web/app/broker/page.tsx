"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { adminApi, api, getToken } from "../../lib/api";
import styles from "./page.module.css";

type Account = {
  user: {
    userCode: string;
    email: string;
    role: string;
  };
};

type ExnessAdminSettings = {
  broker: {
    code: string;
    name: string;
    active: boolean;
  };
  settings: {
    active: boolean;
    partnerCode: string;
    webPartnerLink: string;
    mobilePartnerLink: string;
    benefitMessage: string;
    updatedBy: string | null;
    updatedAt: string | null;
  };
};

type SettingsForm = {
  active: boolean;
  partnerCode: string;
  webPartnerLink: string;
  mobilePartnerLink: string;
  benefitMessage: string;
};

type AutomationConnection = {
  configured: boolean;
  enabled: boolean;
  clientReportPath: string;
  commissionReportPath: string;
  autoVerifyClients: boolean;
  autoImportCommissions: boolean;
  autoReleaseRebates: boolean;
  commissionAmountScale: number;
  syncIntervalMinutes: number;
  authIdentityField: string;
  lastTestStatus: string;
  lastTestDetail: string;
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  officialSchemaUrl: string;
};

type SyncRun = {
  id: string;
  status: string;
  clients_seen: number;
  clients_verified: number;
  started_at: string;
};

type AutomationState = {
  connection: AutomationConnection;
  runs: SyncRun[];
};

type IbPerformancePreview = {
  fromDate: string;
  toDate: string;
  groupCount: number;
  totals: {
    clickCount: number;
    registrationCount: number;
    kycPassed: number;
    firstDepositCount: number;
    tradeStartingRealCount: number;
    volumeLots: number;
    rewardUsd: number;
  };
  note: string;
};

type ClientMatchPreview = {
  reportCount: number;
  usableAccountRows: number;
  matched: Array<{ userId: string; accountLast4: string[] }>;
  note: string;
};

type FinanceDashboard = {
  policies: Array<{levelCode:string; rebatePercent:number; active:boolean}>;
  events: Array<{id:string;userCode:string;currency:string;grossCommissionMinor:number;rebateAmountMinor:number;rebateEntryId:string|null;rebateStatus:string|null;status:string;externalEventId:string}>;
  totals: Array<{currency:string;confirmedCommissionMinor:number;activeRebateMinor:number;paidRebateMinor:number;commissionCount:number}>;
};

type ApiForm = {
  enabled: boolean;
  email: string;
  password: string;
  clientReportPath: string;
  commissionReportPath: string;
  autoVerifyClients: boolean;
  autoImportCommissions: boolean;
  syncIntervalMinutes: number;
};

type BenefitLevel = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type PartnerClient = {
  userId: string;
  userCode: string;
  email: string;
  status: string;
  verificationSource: string | null;
  externalClientRef: string | null;
  note: string;
  verifiedAt: string | null;
  benefitLevel: string | null;
  exnessAccounts: Array<{ id: string; accountLast4: string; server: string; status: string }>;
};

type ClientState = {
  levels: BenefitLevel[];
  clients: PartnerClient[];
};

function logout() {
  localStorage.removeItem("bot_token");
  sessionStorage.removeItem("scenova_2fa_challenge");
  sessionStorage.removeItem("scenova_2fa_email");
  window.location.replace("/login");
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

function statusLabel(status: string) {
  if (status === "VERIFIED") return "ยืนยันแล้ว";
  if (status === "PENDING") return "รอตรวจ";
  if (status === "NOT_LINKED") return "ไม่อยู่ใต้ Partner";
  if (status === "SUSPENDED") return "ระงับ";
  return "ยังไม่ตรวจ";
}

function runLabel(status?: string) {
  if (status === "SUCCESS") return "สำเร็จ";
  if (status === "PARTIAL") return "สำเร็จบางส่วน";
  if (status === "FAILED") return "ไม่สำเร็จ";
  if (status === "SKIPPED") return "ข้าม";
  return "ยังไม่เคย Sync";
}

function connectionForm(connection?: AutomationConnection | null): ApiForm {
  return {
    enabled: Boolean(connection?.enabled),
    email: "",
    password: "",
    clientReportPath: String(connection?.clientReportPath || "/api/reports/clients/accounts/"),
    commissionReportPath: String(connection?.commissionReportPath || ""),
    autoImportCommissions: Boolean(connection?.autoImportCommissions),
    autoVerifyClients: Boolean(connection?.autoVerifyClients),
    syncIntervalMinutes: Number(connection?.syncIntervalMinutes || 15)
  };
}

function errorText(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

export default function BrokerPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState<ExnessAdminSettings | null>(null);
  const [form, setForm] = useState<SettingsForm>({
    active: false,
    partnerCode: "",
    webPartnerLink: "",
    mobilePartnerLink: "",
    benefitMessage: ""
  });
  const [automation, setAutomation] = useState<AutomationState | null>(null);
  const [clients, setClients] = useState<ClientState>({ levels: [], clients: [] });
  const [apiForm, setApiForm] = useState<ApiForm>(connectionForm());
  const [ibPreview, setIbPreview] = useState<IbPerformancePreview | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [financeError, setFinanceError] = useState("");
  const [ibError, setIbError] = useState("");
  const [ibCheckedAt, setIbCheckedAt] = useState<string | null>(null);
  const [ibLoading, setIbLoading] = useState(false);
  const [matchPreview, setMatchPreview] = useState<ClientMatchPreview | null>(null);
  const [matchError, setMatchError] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientLevels, setClientLevels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [partnerError, setPartnerError] = useState("");

  const signupReady = useMemo(
    () => Boolean(
      form.active &&
      form.partnerCode.trim() &&
      form.webPartnerLink.trim() &&
      form.mobilePartnerLink.trim()
    ),
    [form]
  );

  const connection = automation?.connection || null;
  const apiConnected = connection?.lastTestStatus === "PASS";
  const reportReady = Boolean(connection?.clientReportPath?.trim());
  const autoReady = Boolean(apiConnected && reportReady && apiForm.autoVerifyClients);
  const lastRun = automation?.runs?.[0] || null;

  function applySettings(result: ExnessAdminSettings) {
    setSettings(result);
    setForm({
      active: Boolean(result?.settings?.active),
      partnerCode: String(result?.settings?.partnerCode || ""),
      webPartnerLink: String(result?.settings?.webPartnerLink || ""),
      mobilePartnerLink: String(result?.settings?.mobilePartnerLink || ""),
      benefitMessage: String(result?.settings?.benefitMessage || "")
    });
  }

  function applyClients(result: ClientState) {
    const next = {
      levels: Array.isArray(result?.levels) ? result.levels : [],
      clients: Array.isArray(result?.clients) ? result.clients : []
    };
    setClients(next);
    const defaultLevel = next.levels.find(level => level.active)?.code || "";
    setClientLevels(current => {
      const copy = { ...current };
      for (const client of next.clients) {
        if (!copy[client.userId]) copy[client.userId] = client.benefitLevel || defaultLevel;
      }
      return copy;
    });
  }

  async function load() {
    setLoading(true);
    setError("");
    setPartnerError("");

    const accountData = await api("/auth/account");
    const role = String(accountData?.user?.role || "").toUpperCase();

    if (!["OWNER", "ADMIN"].includes(role)) {
      window.location.replace("/dashboard?view=account");
      return;
    }

    setAccount(accountData);
    const result = await adminApi("/admin/brokers/exness/settings");
    applySettings(result);

    const [automationResult, clientsResult] = await Promise.allSettled([
      adminApi("/admin/brokers/exness/automation"),
      adminApi("/admin/brokers/exness/clients")
    ]);

    const optionalErrors: string[] = [];
    if (automationResult.status === "fulfilled") {
      setAutomation(automationResult.value);
      setApiForm(connectionForm(automationResult.value?.connection));
    } else {
      optionalErrors.push(errorText(automationResult.reason, "โหลดการเชื่อมต่อ API ไม่สำเร็จ"));
    }

    if (clientsResult.status === "fulfilled") {
      applyClients(clientsResult.value);
    } else {
      optionalErrors.push(errorText(clientsResult.reason, "โหลดรายการลูกค้าไม่สำเร็จ"));
    }

    if (optionalErrors.length) setPartnerError(optionalErrors.join(" · "));
    setLoading(false);
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }

    void load().catch((err: unknown) => {
      setLoading(false);
      setError(errorText(err, "โหลด Exness Partner Settings ไม่สำเร็จ"));
    });
  }, []);

  // Always display the IB dashboard at the top; refresh read-only data on entry
  // and every 5 minutes while this page is open. Never trigger client verification.
  useEffect(() => {
    if (!account || !apiConnected) return;
    let active = true;
    const refresh = async () => {
      setIbLoading(true);
      const [performance, matching] = await Promise.allSettled([
        adminApi("/admin/brokers/exness/automation/performance-preview"),
        adminApi("/admin/brokers/exness/automation/client-match-preview")
      ]);
      if (!active) return;
      if (performance.status === "fulfilled") {
        setIbPreview(performance.value);
        setIbCheckedAt(new Date().toISOString());
        setIbError("");
      } else {
        setIbError("อัปเดต IB Dashboard ไม่สำเร็จ · กดรีเฟรชเพื่อลองใหม่");
      }
      if (matching.status === "fulfilled") {
        setMatchPreview(matching.value);
        setMatchError("");
      } else {
        setMatchError("ตรวจข้อมูลบัญชีจาก Exness ไม่สำเร็จ · โปรดลองใหม่");
      }
      setIbLoading(false);
    };
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [account?.user?.userCode, apiConnected]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await adminApi("/admin/brokers/exness/settings", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      applySettings(result);
      setMessage("บันทึกจุดสมัคร Exness เรียบร้อย");
    } catch (err: unknown) {
      setError(errorText(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshFinance() {
    try {
      const result = await adminApi("/admin/brokers/exness/finance");
      setFinance(result);
      setFinanceError("");
    } catch (err: unknown) { setFinanceError(errorText(err, "โหลดข้อมูล Rebate ไม่สำเร็จ")); }
  }

  async function approveRebate(entryId: string) {
    if (!window.confirm("ยืนยันอนุมัติ Rebate รายการนี้เป็น AVAILABLE? การอนุมัตินี้ไม่ใช่การโอนเงินจริงเข้าบัญชี Exness")) return;
    setActionBusy("rebate-" + entryId);
    try {
      await adminApi("/admin/brokers/exness/finance/rebates/" + encodeURIComponent(entryId) + "/release", {method:"POST"});
      await refreshFinance();
      setMessage("อนุมัติ Rebate แล้ว · ยังไม่โอนเงินจริงเข้าบัญชี Exness");
    } catch (err:unknown) { setPartnerError(errorText(err, "อนุมัติ Rebate ไม่สำเร็จ")); }
    finally { setActionBusy(""); }
  }

  async function refreshAutomation() {
    const result = await adminApi("/admin/brokers/exness/automation");
    setAutomation(result);
    setApiForm(connectionForm(result?.connection));
    return result;
  }

  async function refreshClients(query = clientQuery) {
    const result = await adminApi(
      "/admin/brokers/exness/clients?q=" + encodeURIComponent(query.trim())
    );
    applyClients(result);
    return result;
  }

  // Share the exact save payload between Save API and Test Connection.
  // The latter saves fresh credentials first, so it cannot accidentally test stale values.
  async function persistApiForm() {
    if (!connection) throw new Error("ยังโหลดการตั้งค่า Exness ไม่สำเร็จ");
    const result = await adminApi("/admin/brokers/exness/automation/connection", {
      method: "PUT",
      body: JSON.stringify({
        email: "",
        password: "",
        enabled: apiForm.enabled,
        syncIntervalMinutes: apiForm.syncIntervalMinutes,
        clientReportPath: apiForm.clientReportPath.trim(),
        commissionReportPath: apiForm.commissionReportPath.trim(),
        autoVerifyClients: apiForm.autoVerifyClients,
        autoImportCommissions: apiForm.autoImportCommissions,
        autoReleaseRebates: connection.autoReleaseRebates,
        commissionAmountScale: connection.commissionAmountScale,
        authIdentityField: connection.authIdentityField
      })
    });
    setAutomation(current => ({ connection: result, runs: current?.runs || [] }));
    // Clear the password and email after saving; never hold secrets in display state.
    setApiForm(connectionForm(result));
    return result;
  }

  async function saveApi() {
    if (!connection) return;
    setActionBusy("save-api");
    setPartnerError("");
    setMessage("");

    try {
      await persistApiForm();
      setMessage("บันทึกการเชื่อมต่อ Exness API เรียบร้อย");
    } catch (err: unknown) {
      setPartnerError(errorText(err, "บันทึกการเชื่อมต่อไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  async function testApi() {
    if (!connection) return;
    const typedEmail = Boolean(apiForm.email.trim());
    const typedPassword = Boolean(apiForm.password);
    if (typedEmail !== typedPassword) {
      setPartnerError("หากทดสอบข้อมูลล็อกอินใหม่ กรุณากรอก Partner Email และ Password ให้ครบทั้งสองช่อง หรือกดบันทึก API เพื่อเปลี่ยนเฉพาะช่องเดียว");
      return;
    }
    setActionBusy("test-api");
    setPartnerError("");
    setMessage("");

    try {
      // Only replace saved credentials after Exness has verified the new pair.
      const result = typedEmail && typedPassword
        ? await adminApi("/admin/brokers/exness/automation/connect", {
            method: "POST",
            body: JSON.stringify({ email: apiForm.email.trim(), password: apiForm.password })
          })
        : await adminApi("/admin/brokers/exness/automation/test", { method: "POST" });
      await refreshAutomation();
      if (!result?.ok) {
        setPartnerError(String(result?.detail || "ทดสอบ Exness API ไม่ผ่าน"));
      } else {
        setMessage("เชื่อมต่อ Exness สำเร็จ ✓ ข้อมูลเข้าสู่ระบบถูกเก็บอย่างปลอดภัย · ระบบซิงก์ยังไม่เปิดอัตโนมัติ");
      }
    } catch (err: unknown) {
      setPartnerError(errorText(err, "ทดสอบ Exness API ไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  async function previewIbPerformance() {
    setIbLoading(true);
    try {
      const [performance, matching] = await Promise.allSettled([
        adminApi("/admin/brokers/exness/automation/performance-preview"),
        adminApi("/admin/brokers/exness/automation/client-match-preview")
      ]);
      if (performance.status === "fulfilled") {
        setIbPreview(performance.value);
        setIbCheckedAt(new Date().toISOString());
        setIbError("");
      } else {
        setIbError("ดึง IB Performance จาก Exness ไม่สำเร็จ");
      }
      if (matching.status === "fulfilled") {
        setMatchPreview(matching.value);
        setMatchError("");
      } else {
        setMatchError("ตรวจข้อมูลบัญชีจาก Exness ไม่สำเร็จ");
      }
    } finally {
      setIbLoading(false);
    }
  }

  async function syncNow() {
    setActionBusy("sync");
    setPartnerError("");
    setMessage("");

    try {
      const result = await adminApi("/admin/brokers/exness/automation/sync", {
        method: "POST"
      });
      await Promise.all([refreshAutomation(), refreshClients()]);
      if (!result?.ok) {
        setPartnerError(String(result?.error || "Sync กับ Exness ไม่สำเร็จ"));
      } else {
        const seen = Number(result?.counts?.clientsSeen || 0);
        const verified = Number(result?.counts?.clientsVerified || 0);
        setMessage("Sync สำเร็จ · พบ " + seen + " รายการ · ยืนยันใหม่ " + verified + " รายการ");
      }
    } catch (err: unknown) {
      setPartnerError(errorText(err, "Sync กับ Exness ไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  async function searchClients(event: FormEvent) {
    event.preventDefault();
    setActionBusy("clients");
    setPartnerError("");

    try {
      await refreshClients(clientQuery);
    } catch (err: unknown) {
      setPartnerError(errorText(err, "ค้นหาลูกค้าไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  async function verifyClient(client: PartnerClient) {
    const benefitLevel = clientLevels[client.userId] || "";
    if (!benefitLevel) {
      setPartnerError("กรุณาเลือกระดับสิทธิประโยชน์ก่อนยืนยัน");
      return;
    }

    setActionBusy("client:" + client.userId);
    setPartnerError("");
    setMessage("");

    try {
      await adminApi("/admin/brokers/exness/clients/" + encodeURIComponent(client.userId), {
        method: "PUT",
        body: JSON.stringify({
          status: "VERIFIED",
          benefitLevel,
          externalClientRef: client.externalClientRef || "",
          note: client.note || ""
        })
      });
      await refreshClients(clientQuery);
      setMessage("ยืนยันลูกค้า Exness เรียบร้อย");
    } catch (err: unknown) {
      setPartnerError(errorText(err, "ยืนยันลูกค้าไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  if (loading || !account) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingCard}>
          {error || "กำลังโหลด Exness Partner..."}
        </div>
      </main>
    );
  }

  return (
    <div className="app-wrap">
      <OwnerSidebar
        activeKey="broker-center"
        onLogout={logout}
        role={account.user.role}
      />

      <main className={"main app-main " + styles.main}>
        <OwnerMobileNav activeKey="broker-center" onLogout={logout}/>

        <div className={styles.shell}>
          <header className={styles.header}>
            <div>
              <span>EXNESS PARTNER CENTER</span>
              <h1>Broker</h1>
              <p>จุดสมัคร การตรวจ Partner และสถานะลูกค้าในที่เดียว</p>
            </div>
            <div className={signupReady ? styles.ready : styles.notReady}>
              <i/>
              {signupReady ? "จุดสมัครพร้อม" : "ยังตั้งค่าไม่ครบ"}
            </div>
          </header>

          {error && <div className={styles.error}>{error}</div>}
          {partnerError && <div className={styles.error}>{partnerError}</div>}
          {message && <div className={styles.success}>{message}</div>}

          <nav className={styles.quickNav} aria-label="เมนู Exness Partner Center">
            <a href="#exness-api">เชื่อมต่อ Exness</a>
            <a href="#ib-performance">ภาพรวมรายได้ IB</a>
            <a href="#exness-partner">ตั้งค่าพาร์ตเนอร์</a>
            <a href="#exness-clients">ตรวจสอบลูกค้า</a>
            <a href="#exness-rebate">อนุมัติ Rebate</a>
          </nav>
          <div className={styles.healthGrid} aria-label="สถานะ Exness API">
            <div className={styles.healthCard}><small>EXNESS API</small><strong className={apiConnected ? styles.healthGood : styles.healthWarn}>{apiConnected ? "✓ ผ่านการทดสอบล่าสุด" : "! ต้องตรวจสอบ"}</strong><span>{connection?.lastTestStatus || "ยังไม่ทดสอบ"} · ทดสอบ {dateTime(connection?.lastTestedAt || null)}</span></div>
            <div className={styles.healthCard}><small>SYNC AUTOMATION</small><strong className={connection?.enabled ? styles.healthGood : styles.healthWarn}>{connection?.enabled ? "● เปิดทำงาน" : "○ ปิดอยู่"}</strong><span>ทุก {connection?.syncIntervalMinutes || 15} นาที · รอบล่าสุด {dateTime(connection?.lastSyncAt || null)}</span></div>
            <div className={styles.healthCard}><small>CLIENT REPORT</small><strong className={reportReady ? styles.healthGood : styles.healthWarn}>{reportReady ? "✓ ตั้งค่าแล้ว" : "! ยังไม่ตั้งค่า"}</strong><span>Auto Verify: {connection?.autoVerifyClients ? "เปิด" : "ปิด"} · ล่าสุด {runLabel(lastRun?.status)}</span></div>
          </div>
          <section id="exness-api" className={styles.card}>
            <div className={styles.sectionHead}>
              <div>
                <small>EXNESS CONNECTION</small>
                <b>เชื่อมต่อ Exness แบบง่าย</b>
                <span>มีบัญชี Exness Partners อยู่แล้ว? กรอกแล้วกดตรวจสอบได้ทันที</span>
              </div>
              <div className={autoReady ? styles.ready : styles.notReady}>
                <i/>
                {autoReady ? "Auto Verify พร้อม" : "รอเชื่อม API"}
              </div>
            </div>

            <div className={styles.statusStrip}>
              <div>
                <small>API</small>
                <b>{apiConnected ? "Connected" : connection?.configured ? "รอ Test" : "ยังไม่เชื่อม"}</b>
              </div>
              <div>
                <small>Client Report</small>
                <b>{reportReady ? "พร้อม" : "ยังไม่ตั้ง Path"}</b>
              </div>
              <div>
                <small>Auto Verify</small>
                <b>{apiForm.autoVerifyClients ? "เปิด" : "ปิด"}</b>
              </div>
            </div>

            {connection ? (
              <>
                <div className={styles.connectPanel}>
                  <div className={styles.connectIntro}>
                    <div className={styles.connectNumber}>1</div>
                    <div><h3>เชื่อมต่อบัญชี Exness Partners</h3><p>ใช้อีเมลและรหัสผ่านที่คุณเข้าสู่เว็บไซต์ Exness Partners ได้ ไม่ใช่รหัสบัญชีเทรด MT5</p></div>
                  </div>
                  <div className={styles.simpleFields}>
                    <label><span>อีเมล Exness Partners</span><input type="email" value={apiForm.email} onChange={event=>setApiForm(v=>({...v,email:event.target.value}))} placeholder={connection.configured ? "บันทึกไว้แล้ว · กรอกเมื่อต้องการเปลี่ยน" : "your-email@example.com"} autoComplete="off" /></label>
                    <label><span>รหัสผ่าน Exness Partners</span><input type={showApiPassword ? "text" : "password"} value={apiForm.password} onChange={event=>setApiForm(v=>({...v,password:event.target.value}))} placeholder={connection.configured ? "บันทึกไว้แล้ว · กรอกเมื่อต้องการเปลี่ยน" : "รหัสผ่าน Exness Partners"} autoComplete="new-password" />
                      <button type="button" className={styles.revealButton} onClick={()=>setShowApiPassword(v=>!v)} aria-label={showApiPassword?"ซ่อนรหัสผ่าน":"แสดงรหัสผ่าน"} aria-pressed={showApiPassword}>{showApiPassword?"◉ ซ่อนรหัสผ่าน":"◎ แสดงรหัสผ่าน"}</button>
                    </label>
                  </div>
                  <div className={styles.simpleActions}>
                    <button type="button" className={styles.primaryButton} disabled={Boolean(actionBusy)||(!connection.configured && !(apiForm.email.trim() && apiForm.password))} onClick={testApi}>{actionBusy==="test-api" ? "กำลังตรวจสอบกับ Exness..." : apiForm.email.trim() || apiForm.password ? "ตรวจสอบและเชื่อมต่อ" : "ตรวจสอบการเชื่อมต่อเดิม"}</button>
                    <span>{connection.configured ? "หากไม่เปลี่ยนรหัสผ่าน ปล่อยทั้งสองช่องว่างแล้วกดตรวจสอบได้เลย" : "กรอกอีเมลและรหัสผ่านให้ครบ แล้วกดตรวจสอบ"}</span>
                    <a className={styles.signinHelp} href="https://my.exnessaffiliates.com/" rel="noopener noreferrer" target="_blank">เปิด Exness Partners ↗</a>
                  </div>
                  {connection.lastTestStatus === "FAIL" && <div className={styles.connectionTrouble}><b>เชื่อมต่อครั้งล่าสุดไม่สำเร็จ</b><span>{connection.lastTestDetail.includes("401") ? "Exness ปฏิเสธข้อมูลเข้าสู่ระบบ (401) โปรดกรอกข้อมูล Exness Partners อีกครั้ง ถ้ายังไม่ผ่านให้ติดต่อ Exness เพื่อตรวจสิทธิ์ API จากเซิร์ฟเวอร์" : "ตรวจข้อมูลเข้าสู่ระบบหรือการเชื่อมต่อ แล้วทดลองใหม่อีกครั้ง"}</span></div>}
                  <p className={styles.connectPrivacy}>🔒 ระบบจะบันทึกข้อมูลใหม่เมื่อ Exness ยืนยันการเชื่อมต่อผ่านแล้วเท่านั้น และจะไม่แสดงรหัสผ่านเดิมกลับมา</p>
                </div>
                <div className={styles.setupMiniSteps}><div><b>2</b><span>เชื่อมต่อผ่านแล้ว ดูรายงานลูกค้าและรายได้ IB ได้ทันที</span></div><div><b>3</b><span>หากต้องการซิงก์อัตโนมัติ ให้ตั้งค่าขั้นสูงหลังตรวจสอบรายงานแล้ว</span></div></div>
                <details className={styles.advancedSettings}>
                  <summary>⚙ ตั้งค่าขั้นสูง <span>รายงาน API · ซิงก์อัตโนมัติ · เครื่องมือผู้ดูแล</span></summary>
                  <div className={styles.apiGrid}>
                    <label className={styles.pathField}><span>Commission Report API Path</span><input type="text" value={apiForm.commissionReportPath} onChange={event=>setApiForm(v=>({...v,commissionReportPath:event.target.value}))} placeholder="/api/reports/..." autoComplete="off" /></label>
                    <label className={styles.pathField}><span>Client Report API Path</span><input type="text" value={apiForm.clientReportPath} onChange={event=>setApiForm(v=>({...v,clientReportPath:event.target.value}))} placeholder="/api/reports/clients/accounts/" autoComplete="off" /></label>
                    <label><span>ความถี่ในการซิงก์ (นาที)</span><input type="number" min={5} max={1440} value={apiForm.syncIntervalMinutes} onChange={event=>setApiForm(v=>({...v,syncIntervalMinutes:Number(event.target.value||15)}))} /></label>
                  </div>
                <p className={styles.apiHelp}>
                  สำหรับผู้ดูแลขั้นสูงเท่านั้น: ต้องตรวจเส้นทาง API ตามสิทธิ์บัญชี Exness และเปรียบเทียบยอดกับรายงานจริงก่อนเปิด Auto Import หรือ Scheduled Sync การทดสอบการเชื่อมต่อไม่จ่าย Rebate และไม่เปิดคำสั่งเทรด
                </p>
                <div className={styles.apiActions}>
                  <label className={styles.toggle}><input type="checkbox" checked={apiForm.autoImportCommissions} disabled={!apiForm.commissionReportPath.trim() || Boolean(actionBusy)} onChange={event=>setApiForm(v=>({...v,autoImportCommissions:event.target.checked}))}/><span>นำเข้าคอมมิชชันอัตโนมัติ (ต้องยืนยันความถูกต้องของรายงานก่อนเปิด)</span></label>
                  <div className={styles.automationBar}>
                    <div><b>Scheduled API Sync</b><small>เปิดการซิงก์อัตโนมัติเฉพาะเมื่อทดสอบ API ผ่านแล้ว · การเปลี่ยนสถานะมีผลเมื่อกดบันทึก API</small></div>
                    <label className={styles.toggle}><input type="checkbox" checked={apiForm.enabled} disabled={!apiConnected || Boolean(actionBusy)} onChange={event => setApiForm(current => ({ ...current, enabled: event.target.checked }))}/><span>{apiForm.enabled ? "เปิดอัตโนมัติ" : "ปิดอัตโนมัติ"}</span></label>
                  </div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={apiForm.autoVerifyClients}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        autoVerifyClients: event.target.checked
                      }))}
                    />
                    <span>ตรวจและยืนยันลูกค้าอัตโนมัติ (เปิดหลังตรวจการจับคู่ MT5 แล้วเท่านั้น)</span>
                  </label>

                  <div className={styles.buttonRow}>
                    {connection.officialSchemaUrl && (
                      <a
                        className={styles.textButton}
                        href={connection.officialSchemaUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        API Schema ↗
                      </a>
                    )}
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={saveApi}
                      disabled={Boolean(actionBusy)}
                    >
                      {actionBusy === "save-api" ? "กำลังบันทึก..." : "บันทึก API"}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={syncNow}
                      disabled={Boolean(actionBusy) || !apiConnected || !reportReady}
                    >
                      {actionBusy === "sync" ? "กำลัง Sync..." : "Sync ตอนนี้"}
                    </button>
                  </div>
                </div>


                </details>

                <div className={styles.runHistory}>
                  <b>ประวัติซิงก์ล่าสุด</b>
                  {automation?.runs?.length ? <div className={styles.runList}>{automation.runs.slice(0,5).map(run => <div key={run.id}><span>{dateTime(run.started_at)}</span><strong>{runLabel(run.status)}</strong><span>พบ {Number(run.clients_seen || 0)} · ยืนยัน {Number(run.clients_verified || 0)}</span></div>)}</div> : <p>ยังไม่มีประวัติการซิงก์</p>}
                </div>
                <div className={styles.syncLine}>
                  <span>ทดสอบล่าสุด <b>{dateTime(connection.lastTestedAt)}</b></span>
                  <span>Sync ล่าสุด <b>{dateTime(connection.lastSyncAt)}</b></span>
                  <span>
                    ผลล่าสุด <b>{runLabel(lastRun?.status)}</b>
                    {lastRun
                      ? " · พบ " + Number(lastRun.clients_seen || 0) +
                        " / ยืนยัน " + Number(lastRun.clients_verified || 0)
                      : ""}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.empty}>ยังโหลดสถานะ Exness API ไม่สำเร็จ</div>
            )}
          </section>

          <div className={styles.dashboardCaption}>รายงานพาร์ทเนอร์ · แสดงตลอดเมื่อเปิดหน้า Broker</div>
          <section id="ib-performance" className={styles.ibPanel}>
                  <div className={styles.ibTitle}>
                    <div>
                      <b>EXNESS IB DASHBOARD · 30 วันล่าสุด</b>
                      <span>ดึงข้อมูลเมื่อเปิดหน้า · อัปเดตอัตโนมัติทุก 5 นาที · อ่านข้อมูลอย่างเดียว</span>
                    </div>
                    <button
                      type="button" className={styles.secondaryButton}
                      onClick={previewIbPerformance}
                      disabled={ibLoading || !apiConnected}
                    >{ibLoading ? "กำลังอัปเดต..." : "รีเฟรชแดชบอร์ด"}</button>
                  </div>
                  {ibPreview ? <>
                    <div className={styles.ibMetrics}>
                      <div><small>คลิกลิงก์</small><b>{ibPreview.totals.clickCount.toLocaleString()}</b></div>
                      <div><small>สมัคร</small><b>{ibPreview.totals.registrationCount.toLocaleString()}</b></div>
                      <div><small>ผ่าน KYC</small><b>{ibPreview.totals.kycPassed.toLocaleString()}</b></div>
                      <div><small>ฝากครั้งแรก</small><b>{ibPreview.totals.firstDepositCount.toLocaleString()}</b></div>
                      <div><small>ปริมาณ Lots</small><b>{ibPreview.totals.volumeLots.toLocaleString("en-US", {maximumFractionDigits:4})}</b></div>
                      <div><small>Rewards (USD)</small><b>${ibPreview.totals.rewardUsd.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>
                    </div>
                    <p>{ibPreview.fromDate} ถึง {ibPreview.toDate} · {ibPreview.note} · {ibPreview.groupCount} กลุ่มข้อมูล</p>
                  </> : <p>{apiConnected ? (ibLoading ? "กำลังโหลดข้อมูลจาก Exness..." : "ยังไม่มีข้อมูล · กดรีเฟรชเพื่อลองใหม่") : "รอ Test Connection เพื่อโหลดข้อมูล Exness"}</p>}
            {ibError && <p className={styles.dashboardError}>{ibError}</p>}
            {ibCheckedAt && <p>อัปเดตล่าสุด {dateTime(ibCheckedAt)}</p>}
          </section>

          <div className={styles.settingsCaption}>การตั้งค่าและการตรวจสอบลูกค้า</div>

          <form id="exness-partner" className={styles.card} onSubmit={save}>
            <div className={styles.topRow}>
              <div className={styles.exness}>
                <div className={styles.logo}>E</div>
                <div>
                  <b>ลิงก์ชวนลูกค้าสมัคร Exness</b>
                  <span>ส่วนนี้ใช้ตั้งลิงก์แนะนำลูกค้า ไม่ใช่รหัสผ่านสำหรับเชื่อม API</span>
                </div>
              </div>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={event => setForm(current => ({
                    ...current,
                    active: event.target.checked
                  }))}
                />
                <span>{form.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
              </label>
            </div>

            <div className={styles.grid}>
              <label className={styles.partnerField}>
                <span>Partner Code</span>
                <input
                  type="text"
                  value={form.partnerCode}
                  onChange={event => setForm(current => ({
                    ...current,
                    partnerCode: event.target.value
                  }))}
                  placeholder="Partner Code"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>ลิงก์สำหรับคอมพิวเตอร์</span>
                <input
                  type="url"
                  value={form.webPartnerLink}
                  onChange={event => setForm(current => ({
                    ...current,
                    webPartnerLink: event.target.value
                  }))}
                  placeholder="https://..."
                  autoComplete="off"
                />
              </label>

              <label>
                <span>ลิงก์สำหรับมือถือ</span>
                <input
                  type="url"
                  value={form.mobilePartnerLink}
                  onChange={event => setForm(current => ({
                    ...current,
                    mobilePartnerLink: event.target.value
                  }))}
                  placeholder="https://..."
                  autoComplete="off"
                />
              </label>

              <label className={styles.full}>
                <span>ข้อความสิทธิพิเศษที่ลูกค้าเห็น</span>
                <input
                  type="text"
                  maxLength={300}
                  value={form.benefitMessage}
                  onChange={event => setForm(current => ({
                    ...current,
                    benefitMessage: event.target.value
                  }))}
                  placeholder="สมัครผ่าน SCENOVA เพื่อรับราคาพิเศษ..."
                />
              </label>
            </div>

            <div className={styles.preview}>
              <div>
                <small>Partner Code</small>
                <b>{form.partnerCode.trim() || "—"}</b>
              </div>
              <div>
                <small>Computer</small>
                <b>{form.webPartnerLink.trim() ? "พร้อม" : "ยังไม่มีลิงก์"}</b>
              </div>
              <div>
                <small>Mobile</small>
                <b>{form.mobilePartnerLink.trim() ? "พร้อม" : "ยังไม่มีลิงก์"}</b>
              </div>
            </div>

            <footer className={styles.footer}>
              <span>อัปเดตล่าสุด {dateTime(settings?.settings?.updatedAt)}</span>
              <button type="submit" disabled={busy}>
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </footer>
          </form>

          <section id="exness-rebate" className={styles.card}>
            <div className={styles.sectionHead}><div><small>EXNESS REBATE CENTER</small><b>อนุมัติ Rebate 30% จากคอมมิชชันที่ยืนยันแล้ว</b><span>การอนุมัติเปลี่ยนยอดเป็น AVAILABLE เท่านั้น · ไม่มีการโอนเงินจริงผ่านระบบนี้</span></div><button type="button" className={styles.secondaryButton} onClick={refreshFinance} disabled={Boolean(actionBusy)}>โหลดข้อมูล Rebate</button></div>
            <div className={styles.rebateNotice}>ช่องทางจ่าย: Exness Account · รอ Exness ยืนยันสิทธิ์ API และผลรายการโอนเงินจริง ก่อนบันทึกเป็น PAID</div>
            {financeError && <p className={styles.dashboardError}>{financeError}</p>}
            {finance ? <>
              <div className={styles.rebateStats}>{finance.policies.map(p=><div key={p.levelCode}><small>{p.levelCode}</small><b>{p.rebatePercent}%</b><span>{p.active ? "ใช้งาน" : "ปิด"}</span></div>)}{finance.totals.map(t=><div key={t.currency}><small>คอมมิชชัน {t.currency}</small><b>{(t.confirmedCommissionMinor/100).toLocaleString()}</b><span>ยอด Rebate {(t.activeRebateMinor/100).toLocaleString()} · จ่ายแล้ว {(t.paidRebateMinor/100).toLocaleString()}</span></div>)}</div>
              <div className={styles.rebateRows}>{finance.events.filter(e=>e.rebateEntryId).slice(0,30).map(e=><div key={e.id}><span>{e.userCode} · {e.externalEventId}</span><span>{(e.rebateAmountMinor/100).toFixed(2)} {e.currency} · {e.rebateStatus}</span>{e.rebateStatus==="PENDING" && e.status==="CONFIRMED" ? <button type="button" disabled={Boolean(actionBusy)} onClick={()=>approveRebate(e.rebateEntryId!)}>อนุมัติ</button> : <span>{e.rebateStatus==="AVAILABLE" ? "รอ Exness ยืนยันการจ่าย" : "—"}</span>}</div>)}{!finance.events.length && <p>ยังไม่มีรายการคอมมิชชันที่นำเข้า กรุณาตรวจ Commission Report ก่อน</p>}</div>
            </> : <p>กดโหลดข้อมูล Rebate เพื่อแสดงนโยบายและรายการรออนุมัติ</p>}
          </section>

          <section id="exness-clients" className={styles.card}>
            <div className={styles.clientsHead}>
              <div>
                <small>CLIENT MATCHING</small>
                <b>ลูกค้า Exness</b>
                <span>ดูสถานะจาก SCENOVA ↔ Exness โดยใช้ MT5 เป็นตัวจับคู่</span>
              </div>
              <form className={styles.search} onSubmit={searchClients}>
                <input
                  type="search"
                  value={clientQuery}
                  onChange={event => setClientQuery(event.target.value)}
                  placeholder="User ID / Email / MT5"
                />
                <button type="submit" disabled={actionBusy === "clients"}>
                  {actionBusy === "clients" ? "..." : "ค้นหา"}
                </button>
              </form>
            </div>

            <div className={styles.matchSummary}>
              {matchPreview
                ? "ข้อมูล Exness ล่าสุด: " + matchPreview.reportCount + " บัญชี · จับคู่ SCENOVA ได้ " +
                  matchPreview.matched.length + " ผู้ใช้ · การพบข้อมูลยังไม่ใช่การยืนยันสิทธิ์"
                : "กำลังตรวจข้อมูลบัญชีจากรายงาน Exness แบบอ่านอย่างเดียว"}
              {matchError && <span className={styles.dashboardError}> · {matchError}</span>}
            </div>
            <div className={styles.clientList}>
              {clients.clients.length === 0 ? (
                <div className={styles.empty}>
                  ยังไม่มีลูกค้า Exness ที่เชื่อม MT5 หรือผ่านการตรวจ Partner
                </div>
              ) : clients.clients.map(client => {
                const canManualVerify =
                  client.status !== "VERIFIED" &&
                  Array.isArray(client.exnessAccounts) &&
                  client.exnessAccounts.length > 0;
                const clientBusy = actionBusy === "client:" + client.userId;

                return (
                  <div className={styles.clientRow} key={client.userId}>
                    <div className={styles.clientIdentity}>
                      <b>{client.userCode || "—"}</b>
                      <span>{client.email || "—"}</span>
                    </div>

                    <div className={styles.mt5Cell}>
                      <small>MT5</small>
                      <b>
                        {client.exnessAccounts?.length
                          ? client.exnessAccounts
                              .map(item => "••••" + item.accountLast4)
                              .join(", ")
                          : "ยังไม่เชื่อม"}
                      </b>
                    </div>

                    <div className={styles.clientStatus}>
                      <span className={
                        client.status === "VERIFIED"
                          ? styles.verifiedBadge
                          : client.status === "NOT_LINKED"
                            ? styles.badBadge
                            : styles.pendingBadge
                      }>
                        {statusLabel(client.status)}
                      </span>
                      <small>
                        {client.verificationSource
                          ? "ตรวจโดย " + client.verificationSource
                          : "ยังไม่มีแหล่งยืนยัน"}
                      </small>
                      {matchPreview && client.status !== "VERIFIED" && (
                        <small className={
                          matchPreview.matched.some(match => match.userId === client.userId)
                            ? styles.matchedAccount
                            : styles.unmatchedAccount
                        }>
                          {(() => {
                            const matched = matchPreview.matched.find(match => match.userId === client.userId);
                            return matched
                              ? "พบใน Exness · MT5 " + matched.accountLast4.map(last4 => "••••" + last4).join(", ") +
                                " · รอยืนยันสิทธิ์"
                              : "ยังไม่พบในรายงานที่ดึงมา";
                          })()}
                        </small>
                      )}
                    </div>

                    <div className={styles.clientAction}>
                      {canManualVerify ? (
                        <>
                          <select
                            value={clientLevels[client.userId] || ""}
                            onChange={event => setClientLevels(current => ({
                              ...current,
                              [client.userId]: event.target.value
                            }))}
                            aria-label={"ระดับสิทธิประโยชน์ของ " + client.userCode}
                          >
                            {clients.levels
                              .filter(level => level.active)
                              .map(level => (
                                <option key={level.id} value={level.code}>
                                  {level.name}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => verifyClient(client)}
                            disabled={Boolean(actionBusy)}
                          >
                            {clientBusy ? "กำลังยืนยัน..." : "ยืนยันเอง"}
                          </button>
                        </>
                      ) : (
                        <span className={styles.clientDate}>
                          {client.verifiedAt ? dateTime(client.verifiedAt) : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.clientFoot}>
              <span>การกด Partner Link อย่างเดียวไม่นับเป็น Verified</span>
              <span>Manual Verify ใช้เมื่อผู้ดูแลตรวจจาก Exness แล้วเท่านั้น</span>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
