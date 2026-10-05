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

type ApiForm = {
  email: string;
  password: string;
  clientReportPath: string;
  autoVerifyClients: boolean;
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
    email: "",
    password: "",
    clientReportPath: String(connection?.clientReportPath || ""),
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
  const [clientQuery, setClientQuery] = useState("");
  const [clientLevels, setClientLevels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
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
  const reportReady = Boolean(apiForm.clientReportPath.trim());
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

  async function saveApi() {
    if (!connection) return;
    setActionBusy("save-api");
    setPartnerError("");
    setMessage("");

    try {
      const result = await adminApi("/admin/brokers/exness/automation/connection", {
        method: "PUT",
        body: JSON.stringify({
          email: apiForm.email.trim(),
          password: apiForm.password,
          enabled: apiForm.autoVerifyClients ? true : connection.enabled,
          syncIntervalMinutes: apiForm.syncIntervalMinutes,
          clientReportPath: apiForm.clientReportPath.trim(),
          commissionReportPath: connection.commissionReportPath,
          autoVerifyClients: apiForm.autoVerifyClients,
          autoImportCommissions: connection.autoImportCommissions,
          autoReleaseRebates: connection.autoReleaseRebates,
          commissionAmountScale: connection.commissionAmountScale,
          authIdentityField: connection.authIdentityField
        })
      });
      setAutomation(current => ({
        connection: result,
        runs: current?.runs || []
      }));
      setApiForm(connectionForm(result));
      setMessage("บันทึกการเชื่อมต่อ Exness API เรียบร้อย");
    } catch (err: unknown) {
      setPartnerError(errorText(err, "บันทึกการเชื่อมต่อไม่สำเร็จ"));
    } finally {
      setActionBusy("");
    }
  }

  async function testApi() {
    setActionBusy("test-api");
    setPartnerError("");
    setMessage("");

    try {
      const result = await adminApi("/admin/brokers/exness/automation/test", {
        method: "POST"
      });
      await refreshAutomation();
      if (!result?.ok) {
        setPartnerError(String(result?.detail || "ทดสอบ Exness API ไม่ผ่าน"));
      } else {
        setMessage("เชื่อมต่อ Exness Partnership API สำเร็จ");
      }
    } catch (err: unknown) {
      setPartnerError(errorText(err, "ทดสอบ Exness API ไม่สำเร็จ"));
    } finally {
      setActionBusy("");
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

          <form className={styles.card} onSubmit={save}>
            <div className={styles.topRow}>
              <div className={styles.exness}>
                <div className={styles.logo}>E</div>
                <div>
                  <b>Exness Partner Setup</b>
                  <span>ลิงก์ที่ลูกค้าใช้เริ่มสมัครผ่าน SCENOVA</span>
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

          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <div>
                <small>PARTNER VERIFICATION</small>
                <b>ตรวจลูกค้าใต้ Partner</b>
                <span>ยืนยันจาก Exness แล้วจับคู่ด้วยบัญชี MT5 ของลูกค้า</span>
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
                <div className={styles.apiGrid}>
                  <label>
                    <span>Partner Email</span>
                    <input
                      type="email"
                      value={apiForm.email}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        email: event.target.value
                      }))}
                      placeholder={connection.configured ? "ตั้งค่าแล้ว · ใส่เมื่อเปลี่ยน" : "Partner Email"}
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    <span>Partner Password</span>
                    <input
                      type="password"
                      value={apiForm.password}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        password: event.target.value
                      }))}
                      placeholder={connection.configured ? "ตั้งค่าแล้ว · ใส่เมื่อเปลี่ยน" : "Password"}
                      autoComplete="off"
                    />
                  </label>

                  <label className={styles.pathField}>
                    <span>Client Report API Path</span>
                    <input
                      type="text"
                      value={apiForm.clientReportPath}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        clientReportPath: event.target.value
                      }))}
                      placeholder="/api/..."
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    <span>ตรวจทุกกี่นาที</span>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={apiForm.syncIntervalMinutes}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        syncIntervalMinutes: Number(event.target.value || 15)
                      }))}
                    />
                  </label>
                </div>

                <div className={styles.apiActions}>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={apiForm.autoVerifyClients}
                      onChange={event => setApiForm(current => ({
                        ...current,
                        autoVerifyClients: event.target.checked
                      }))}
                    />
                    <span>ตรวจและยืนยันลูกค้าอัตโนมัติ</span>
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
                      className={styles.secondaryButton}
                      onClick={testApi}
                      disabled={Boolean(actionBusy) || !connection.configured}
                    >
                      {actionBusy === "test-api" ? "กำลังทดสอบ..." : "Test Connection"}
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

          <section className={styles.card}>
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
