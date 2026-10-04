"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { adminApi, api, getToken } from "../../lib/api";
import styles from "./page.module.css";
import { RebatePanel } from "./components/RebatePanel";
import { AdminBrokerFinancePanel } from "./components/AdminBrokerFinancePanel";
import { AdminBrokerAutomationPanel } from "./components/AdminBrokerAutomationPanel";

type Account = {
  user: {
    userCode: string;
    email: string;
    role: string;
  };
  access: {
    partner?: {
      used_seats?: number;
      seat_limit?: number;
      status?: string;
    } | null;
  };
};

type BenefitLevel = {
  id: string;
  code: string;
  name: string;
  discountBps: number;
  discountPercent: number;
  active: boolean;
};

type BrokerSummary = {
  provider: {
    code: string;
    name: string;
    active: boolean;
    mt5Supported: boolean;
    cloudSupported: boolean;
    localSupported: boolean;
    registrationAvailable: boolean;
  };
  connectedAccounts: Array<{
    id: string;
    accountLast4: string;
    server: string;
    mode: string;
    status: string;
  }>;
  partner: {
    status: string;
    verified: boolean;
    verificationSource: string | null;
    externalClientRef: string | null;
    verifiedAt: string | null;
    updatedAt: string | null;
    benefit: null | {
      levelCode: string;
      levelName: string;
      discountBps: number;
      discountPercent: number;
    };
  };
  phase: {
    current: number;
    partnerVerificationEnabled: boolean;
    benefitsEnabled: boolean;
    rebateEnabled: boolean;
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
    updatedBy: string | null;
    updatedAt: string | null;
  };
  analytics: {
    registrationClicks: number;
    lastClickAt: string | null;
  };
};

type BrokerAdminClient = {
  userId: string;
  userCode: string;
  email: string;
  partnerClientId: string | null;
  status: string;
  verificationSource: string | null;
  externalClientRef: string | null;
  note: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  updatedAt: string | null;
  benefitLevel: string | null;
  discountPercent: number;
  exnessAccounts: Array<{
    id: string;
    accountLast4: string;
    server: string;
    status: string;
  }>;
};

type AdminClientsResponse = {
  levels: BenefitLevel[];
  clients: BrokerAdminClient[];
};

type SettingsForm = {
  active: boolean;
  partnerCode: string;
  webPartnerLink: string;
  mobilePartnerLink: string;
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

function partnerStatusLabel(status: string) {
  const value = String(status || "NOT_CHECKED").toUpperCase();
  if (value === "VERIFIED") return "Verified";
  if (value === "PENDING") return "Checking";
  if (value === "NOT_LINKED") return "Not linked";
  if (value === "SUSPENDED") return "Suspended";
  return "Not checked";
}

function PartnerClientEditor({
  client,
  levels,
  busy,
  onSave
}: {
  client: BrokerAdminClient;
  levels: BenefitLevel[];
  busy: boolean;
  onSave: (input: {
    userId: string;
    status: string;
    benefitLevel: string;
    externalClientRef: string;
    note: string;
  }) => Promise<void>;
}) {
  const [status, setStatus] = useState(
    client.status === "NOT_CHECKED" ? "PENDING" : client.status
  );
  const [benefitLevel, setBenefitLevel] = useState(
    client.benefitLevel || levels.find(level => level.active)?.code || "STANDARD"
  );
  const [externalClientRef, setExternalClientRef] = useState(client.externalClientRef || "");
  const [note, setNote] = useState(client.note || "");
  const hasExness = client.exnessAccounts.length > 0;

  return (
    <div className={styles.clientRow}>
      <div className={styles.clientIdentity}>
        <b>{client.userCode}</b>
        <span>{client.email}</span>
        <small>
          {hasExness
            ? client.exnessAccounts.map(account => `MT5 ••••${account.accountLast4} · ${account.server || "Exness"}`).join(" / ")
            : "ยังไม่พบบัญชี Exness MT5"}
        </small>
      </div>

      <div className={styles.clientControls}>
        <label>
          <span>Partner Status</span>
          <select value={status} onChange={event => setStatus(event.target.value)} disabled={busy}>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED" disabled={!hasExness}>VERIFIED</option>
            <option value="NOT_LINKED">NOT LINKED</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>

        <label>
          <span>Benefit</span>
          <select
            value={benefitLevel}
            onChange={event => setBenefitLevel(event.target.value)}
            disabled={busy || status !== "VERIFIED"}
          >
            {levels.filter(level => level.active).map(level => (
              <option key={level.id} value={level.code}>
                {level.code} · {level.discountPercent}%
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Exness Client Ref (ถ้ามี)</span>
          <input
            value={externalClientRef}
            onChange={event => setExternalClientRef(event.target.value)}
            placeholder="ไม่บังคับใน Manual Phase"
            disabled={busy}
          />
        </label>

        <label className={styles.clientNote}>
          <span>หมายเหตุ</span>
          <input
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="เหตุผล / หลักฐานที่ตรวจแล้ว"
            disabled={busy}
          />
        </label>
      </div>

      <div className={styles.clientFooter}>
        <span className={client.status === "VERIFIED" ? styles.verifiedText : styles.mutedText}>
          ปัจจุบัน: {partnerStatusLabel(client.status)}
          {client.benefitLevel ? ` · ${client.benefitLevel} ${client.discountPercent}%` : ""}
        </span>
        <button
          type="button"
          className={styles.saveClientButton}
          disabled={busy || (status === "VERIFIED" && !hasExness)}
          onClick={() => void onSave({
            userId: client.userId,
            status,
            benefitLevel,
            externalClientRef,
            note
          })}
        >
          {busy ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
        </button>
      </div>
    </div>
  );
}

export default function BrokerPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [summary, setSummary] = useState<BrokerSummary | null>(null);
  const [adminSettings, setAdminSettings] = useState<ExnessAdminSettings | null>(null);
  const [adminClients, setAdminClients] = useState<AdminClientsResponse>({
    levels: [],
    clients: []
  });
  const [clientQuery, setClientQuery] = useState("");
  const [form, setForm] = useState<SettingsForm>({
    active: false,
    partnerCode: "",
    webPartnerLink: "",
    mobilePartnerLink: ""
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const role = String(account?.user.role || "").toUpperCase();
  const elevated = ["OWNER", "ADMIN"].includes(role);
  const partnerSummary = account?.access?.partner
    ? {
        usedSeats: Number(account.access.partner.used_seats || 0),
        seat_limit: Number(account.access.partner.seat_limit || 0),
        status: String(account.access.partner.status || "ACTIVE")
      }
    : null;

  const connected = useMemo(
    () => summary?.connectedAccounts || [],
    [summary]
  );

  async function loadAdminClients(query = "") {
    const result = await adminApi(
      "/admin/brokers/exness/clients?q=" + encodeURIComponent(query.trim())
    );
    setAdminClients({
      levels: Array.isArray(result?.levels) ? result.levels : [],
      clients: Array.isArray(result?.clients) ? result.clients : []
    });
  }

  async function load() {
    setLoading(true);
    setError("");

    const [accountData, brokerData] = await Promise.all([
      api("/auth/account"),
      api("/brokers/exness")
    ]);

    setAccount(accountData);
    setSummary(brokerData);

    const nextRole = String(accountData?.user?.role || "").toUpperCase();
    if (["OWNER", "ADMIN"].includes(nextRole)) {
      const [settings, clients] = await Promise.all([
        adminApi("/admin/brokers/exness/settings"),
        adminApi("/admin/brokers/exness/clients?q=")
      ]);
      setAdminSettings(settings);
      setAdminClients({
        levels: Array.isArray(clients?.levels) ? clients.levels : [],
        clients: Array.isArray(clients?.clients) ? clients.clients : []
      });
      setForm({
        active: Boolean(settings?.settings?.active),
        partnerCode: String(settings?.settings?.partnerCode || ""),
        webPartnerLink: String(settings?.settings?.webPartnerLink || ""),
        mobilePartnerLink: String(settings?.settings?.mobilePartnerLink || "")
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }

    void load().catch((err: unknown) => {
      setLoading(false);
      setError(err instanceof Error ? err.message : "โหลด Broker Center ไม่สำเร็จ");
    });
  }, []);

  async function openExness() {
    setBusy("register");
    setError("");
    setMessage("");

    try {
      const platform = window.innerWidth <= 900 ? "MOBILE" : "WEB";
      const result = await api("/brokers/exness/registration-link", {
        method: "POST",
        body: JSON.stringify({ platform })
      });

      const url = String(result?.url || "");
      if (!url.startsWith("https://")) {
        throw new Error("Partner Link ไม่ถูกต้อง");
      }

      window.location.assign(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เปิดลิงก์ Exness ไม่สำเร็จ");
      setBusy("");
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy("settings");
    setError("");
    setMessage("");

    try {
      const result = await adminApi("/admin/brokers/exness/settings", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      setAdminSettings(result);
      setForm({
        active: Boolean(result?.settings?.active),
        partnerCode: String(result?.settings?.partnerCode || ""),
        webPartnerLink: String(result?.settings?.webPartnerLink || ""),
        mobilePartnerLink: String(result?.settings?.mobilePartnerLink || "")
      });
      setMessage("บันทึก Exness Partner Settings แล้ว");
      const brokerData = await api("/brokers/exness");
      setSummary(brokerData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function searchClients(event: FormEvent) {
    event.preventDefault();
    setBusy("client-search");
    setError("");
    try {
      await loadAdminClients(clientQuery);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ค้นหาลูกค้าไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function saveClient(input: {
    userId: string;
    status: string;
    benefitLevel: string;
    externalClientRef: string;
    note: string;
  }) {
    setBusy("client-" + input.userId);
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/clients/" + encodeURIComponent(input.userId), {
        method: "PUT",
        body: JSON.stringify({
          status: input.status,
          benefitLevel: input.benefitLevel,
          externalClientRef: input.externalClientRef,
          note: input.note
        })
      });
      await loadAdminClients(clientQuery);
      setMessage("อัปเดต Partner Verification และ Benefit แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปเดต Partner Client ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingCard}>กำลังเปิด Broker Center...</div>
      </main>
    );
  }

  if (!account || !summary) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingCard}>
          <b>เปิด Broker Center ไม่สำเร็จ</b>
          <span>{error || "ไม่สามารถโหลดข้อมูล Broker ได้"}</span>
          <button type="button" onClick={() => window.location.reload()}>ลองใหม่</button>
        </div>
      </main>
    );
  }

  const partnerStatus = String(summary.partner?.status || "NOT_CHECKED");
  const partnerVerified = Boolean(summary.partner?.verified);
  const benefit = summary.partner?.benefit || null;

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="broker-center" onLogout={logout} role={account.user.role}/>
        : <CustomerSidebar activeKey="broker-center" onLogout={logout} userCode={account.user.userCode} partner={partnerSummary}/>}

      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="broker-center"/>
          : <CustomerMobileNav activeKey="broker-center" partner={partnerSummary}/>}

        <div className={styles.shell}>
          <header className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>SCENOVA BROKER CENTER · PHASE 4</span>
              <h1>Broker</h1>
              <p>
                Exness Partner Link, Partner Verification และ Partner Benefits
                แยกจาก Trading Bot, Cloud, Local และ EA เดิม
              </p>
            </div>
            <span className={styles.phaseBadge}>PHASE 4 ACTIVE</span>
          </header>

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.success}>{message}</div>}

          <section className={styles.brokerCard}>
            <div className={styles.brokerTop}>
              <div className={styles.brandGroup}>
                <div className={styles.exnessMark} aria-hidden="true">E</div>
                <div>
                  <span className={styles.wordmark}>EXNESS</span>
                  <h2>Exness</h2>
                  <p>MetaTrader 5 Broker Connection</p>
                </div>
              </div>

              <span className={summary.provider.active ? styles.activeChip : styles.inactiveChip}>
                <i/>
                {summary.provider.active ? "Partner Link Active" : "Partner Link Disabled"}
              </span>
            </div>

            <div className={styles.featureGrid}>
              <div><ScenovaIcon name="account" size={18}/><span>MT5</span><b>รองรับ</b></div>
              <div><ScenovaIcon name="cloud" size={18}/><span>Cloud MT5</span><b>รองรับ</b></div>
              <div><ScenovaIcon name="control" size={18}/><span>Local MT5</span><b>รองรับ</b></div>
              <div>
                <ScenovaIcon name="status" size={18}/>
                <span>Partner</span>
                <b>{partnerStatusLabel(partnerStatus)}</b>
              </div>
            </div>

            <div className={partnerVerified ? styles.benefitPanel : styles.partnerStatusPanel}>
              <div>
                <span className={styles.sectionLabel}>EXNESS PARTNER</span>
                <h3>{partnerVerified ? "Partner Verified" : partnerStatusLabel(partnerStatus)}</h3>
                <p>
                  {partnerVerified
                    ? "บัญชีนี้ได้รับสิทธิ์ Partner Benefits ของ SCENOVA"
                    : connected.length
                      ? "เชื่อม MT5 แล้ว แต่สิทธิ์ Partner ต้องได้รับการยืนยันจาก Owner/Admin ก่อน"
                      : "เชื่อมบัญชี Exness MT5 ก่อน แล้วจึงตรวจสอบสิทธิ์ Partner"}
                </p>
              </div>
              {benefit ? (
                <div className={styles.benefitValue}>
                  <small>{benefit.levelCode}</small>
                  <b>{benefit.discountPercent}%</b>
                  <span>SCENOVA Discount</span>
                </div>
              ) : (
                <div className={styles.benefitValueMuted}>
                  <b>—</b>
                  <span>ยังไม่มี Benefit</span>
                </div>
              )}
            </div>

            {connected.length > 0 ? (
              <div className={styles.connectedBlock}>
                <div>
                  <span className={styles.sectionLabel}>EXISTING MT5</span>
                  <b>พบ Exness ที่เชื่อมกับ SCENOVA แล้ว {connected.length} บัญชี</b>
                </div>
                <div className={styles.accountList}>
                  {connected.map(item => (
                    <div key={item.id} className={styles.accountItem}>
                      <span>MT5 ••••{item.accountLast4 || "—"}</span>
                      <small>{item.server || "ไม่ระบุ Server"} · {item.mode || "—"}</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.emptyConnection}>
                ยังไม่พบบัญชี Exness ที่เชื่อมกับ SCENOVA
              </div>
            )}

            <div className={styles.actions}>
              <a className={styles.secondaryButton} href="/dashboard?view=account">
                ฉันมี Exness แล้ว
              </a>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!summary.provider.registrationAvailable || busy === "register"}
                onClick={() => void openExness()}
              >
                {busy === "register" ? "กำลังเปิด..." : "เปิดบัญชี Exness"}
              </button>
            </div>

            <div className={styles.safetyNote}>
              <ScenovaIcon name="status" size={18}/>
              <div>
                <b>Partner Benefit ไม่ใช่เงื่อนไขการใช้ Bot</b>
                <span>
                  ลูกค้าที่ไม่ได้อยู่ใต้ Partner ของ SCENOVA ยังใช้ Trading Bot ได้ตามสิทธิ์สมาชิกเดิม
                  ส่วนลดใช้เฉพาะลูกค้าที่ Partner Status = VERIFIED
                </span>
              </div>
            </div>
          </section>

          <section className={styles.phaseStrip}>
            <div className={styles.phaseDone}><b>1</b><span>Broker Center</span><small>พร้อมแล้ว</small></div>
            <div className={styles.phaseDone}><b>2</b><span>Partner Verify + Benefits</span><small>พร้อมแล้ว</small></div>
            <div className={styles.phaseDone}><b>3</b><span>Commission + Rebate</span><small>พร้อมแล้ว</small></div>
            <div className={styles.phaseCurrent}><b>4</b><span>API Automation</span><small>กำลังทำงาน</small></div>
          </section>

          <RebatePanel/>

          {elevated && (
            <>
              <section className={styles.adminPanel}>
                <div className={styles.adminHead}>
                  <div>
                    <span className={styles.eyebrow}>OWNER / ADMIN</span>
                    <h2>Exness Partner Settings</h2>
                    <p>เก็บ Partner Link ไว้จุดเดียว ไม่ฝังลิงก์ไว้ในหน้าเว็บหรือ Trading Engine</p>
                  </div>
                  <div className={styles.analytics}>
                    <small>Registration Clicks</small>
                    <b>{adminSettings?.analytics?.registrationClicks || 0}</b>
                    <span>ล่าสุด {dateTime(adminSettings?.analytics?.lastClickAt)}</span>
                  </div>
                </div>

                <form className={styles.settingsForm} onSubmit={saveSettings}>
                  <label>
                    <span>Partner Code</span>
                    <input
                      type="text"
                      value={form.partnerCode}
                      onChange={event => setForm(current => ({ ...current, partnerCode: event.target.value }))}
                      placeholder="ใส่ Partner Code ของ Exness"
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    <span>Web Partner Link</span>
                    <input
                      type="url"
                      value={form.webPartnerLink}
                      onChange={event => setForm(current => ({ ...current, webPartnerLink: event.target.value }))}
                      placeholder="https://..."
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    <span>Mobile Partner Link</span>
                    <input
                      type="url"
                      value={form.mobilePartnerLink}
                      onChange={event => setForm(current => ({ ...current, mobilePartnerLink: event.target.value }))}
                      placeholder="https://..."
                      autoComplete="off"
                    />
                  </label>

                  <label className={styles.switchRow}>
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={event => setForm(current => ({ ...current, active: event.target.checked }))}
                    />
                    <span>
                      <b>เปิดใช้งาน Exness Partner Link</b>
                      <small>ถ้าปิด ปุ่มเปิดบัญชีของลูกค้าจะถูกปิดทันที แต่ระบบ Trading เดิมไม่กระทบ</small>
                    </span>
                  </label>

                  <div className={styles.formFooter}>
                    <span>
                      อัปเดตล่าสุด: {dateTime(adminSettings?.settings?.updatedAt)}
                    </span>
                    <button
                      type="submit"
                      className={styles.saveButton}
                      disabled={busy === "settings"}
                    >
                      {busy === "settings" ? "กำลังบันทึก..." : "บันทึก Partner Settings"}
                    </button>
                  </div>
                </form>
              </section>

              <section className={styles.adminPanel}>
                <div className={styles.adminHead}>
                  <div>
                    <span className={styles.eyebrow}>PHASE 2 · PARTNER CLIENTS</span>
                    <h2>Partner Verification & Benefits</h2>
                    <p>ยืนยันเฉพาะลูกค้าที่ตรวจแล้วว่าอยู่ใต้ Partner ของเรา และต้องเชื่อม Exness MT5 ก่อน</p>
                  </div>
                </div>

                <form className={styles.clientSearch} onSubmit={searchClients}>
                  <input
                    value={clientQuery}
                    onChange={event => setClientQuery(event.target.value)}
                    placeholder="ค้นหา User ID, Email หรือ MT5"
                  />
                  <button type="submit" disabled={busy === "client-search"}>
                    {busy === "client-search" ? "กำลังค้นหา..." : "ค้นหา"}
                  </button>
                </form>

                <div className={styles.levelLegend}>
                  {adminClients.levels.filter(level => level.active).map(level => (
                    <span key={level.id}>
                      <b>{level.code}</b> ลด {level.discountPercent}%
                    </span>
                  ))}
                </div>

                <div className={styles.clientList}>
                  {adminClients.clients.length ? adminClients.clients.map(client => (
                    <PartnerClientEditor
                      key={client.userId + ":" + client.updatedAt}
                      client={client}
                      levels={adminClients.levels}
                      busy={busy === "client-" + client.userId}
                      onSave={saveClient}
                    />
                  )) : (
                    <div className={styles.emptyClients}>
                      ยังไม่พบลูกค้า Exness · เชื่อม MT5 หรือค้นหา User ID เพื่อเริ่มตรวจสอบ
                    </div>
                  )}
                </div>
              </section>

              <AdminBrokerFinancePanel/>
              <AdminBrokerAutomationPanel/>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
