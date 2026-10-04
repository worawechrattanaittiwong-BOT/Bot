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

export default function BrokerPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [summary, setSummary] = useState<BrokerSummary | null>(null);
  const [adminSettings, setAdminSettings] = useState<ExnessAdminSettings | null>(null);
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
      const settings = await adminApi("/admin/brokers/exness/settings");
      setAdminSettings(settings);
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
              <span className={styles.eyebrow}>SCENOVA BROKER CENTER · PHASE 1</span>
              <h1>Broker</h1>
              <p>
                เชื่อมเส้นทาง Broker เข้ากับ SCENOVA โดยแยกจาก Trading Bot เดิม
                Cloud, Local, EA และ Subscription ยังคงทำงานตามเดิม
              </p>
            </div>
            <span className={styles.phaseBadge}>PHASE 1 ACTIVE</span>
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
                {summary.provider.active ? "Partner Link Active" : "Not Configured"}
              </span>
            </div>

            <div className={styles.featureGrid}>
              <div><ScenovaIcon name="account" size={18}/><span>MT5</span><b>รองรับ</b></div>
              <div><ScenovaIcon name="cloud" size={18}/><span>Cloud MT5</span><b>รองรับ</b></div>
              <div><ScenovaIcon name="control" size={18}/><span>Local MT5</span><b>รองรับ</b></div>
              <div><ScenovaIcon name="status" size={18}/><span>Partner Benefits</span><b>Phase 2</b></div>
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
                <b>การสมัครดำเนินการบน Exness</b>
                <span>
                  SCENOVA ไม่รับรหัสผ่าน Exness, เอกสาร KYC, เงินฝาก หรือเงินถอน
                  ปุ่มเปิดบัญชีใช้ Partner Link ที่ Owner ตั้งไว้เท่านั้น
                </span>
              </div>
            </div>
          </section>

          <section className={styles.phaseStrip}>
            <div className={styles.phaseCurrent}><b>1</b><span>Broker Center</span><small>กำลังทำงาน</small></div>
            <div><b>2</b><span>Partner Verify + Benefits</span><small>ยังไม่เปิด</small></div>
            <div><b>3</b><span>Commission + Rebate</span><small>ยังไม่เปิด</small></div>
            <div><b>4</b><span>API Automation</span><small>ยังไม่เปิด</small></div>
          </section>

          {elevated && (
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
          )}
        </div>
      </main>
    </div>
  );
}
