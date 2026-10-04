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
  const [settings, setSettings] = useState<ExnessAdminSettings | null>(null);
  const [form, setForm] = useState<SettingsForm>({
    active: false,
    partnerCode: "",
    webPartnerLink: "",
    mobilePartnerLink: "",
    benefitMessage: ""
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ready = useMemo(
    () => Boolean(
      form.active &&
      form.partnerCode.trim() &&
      form.webPartnerLink.trim() &&
      form.mobilePartnerLink.trim()
    ),
    [form]
  );

  async function load() {
    setLoading(true);
    setError("");

    const accountData = await api("/auth/account");
    const role = String(accountData?.user?.role || "").toUpperCase();

    if (!["OWNER", "ADMIN"].includes(role)) {
      window.location.replace("/dashboard?view=account");
      return;
    }

    setAccount(accountData);
    const result = await adminApi("/admin/brokers/exness/settings");
    setSettings(result);
    setForm({
      active: Boolean(result?.settings?.active),
      partnerCode: String(result?.settings?.partnerCode || ""),
      webPartnerLink: String(result?.settings?.webPartnerLink || ""),
      mobilePartnerLink: String(result?.settings?.mobilePartnerLink || ""),
      benefitMessage: String(result?.settings?.benefitMessage || "")
    });
    setLoading(false);
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }

    void load().catch((err: unknown) => {
      setLoading(false);
      setError(err instanceof Error ? err.message : "โหลด Exness Partner Settings ไม่สำเร็จ");
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
      setSettings(result);
      setForm({
        active: Boolean(result?.settings?.active),
        partnerCode: String(result?.settings?.partnerCode || ""),
        webPartnerLink: String(result?.settings?.webPartnerLink || ""),
        mobilePartnerLink: String(result?.settings?.mobilePartnerLink || ""),
        benefitMessage: String(result?.settings?.benefitMessage || "")
      });
      setMessage("บันทึก Exness Partner เรียบร้อย");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
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
              <span>EXNESS PARTNER</span>
              <h1>Broker</h1>
              <p>ตั้งค่าจุดสมัคร Exness สำหรับลูกค้า SCENOVA</p>
            </div>
            <div className={ready ? styles.ready : styles.notReady}>
              <i/>
              {ready ? "พร้อมใช้งาน" : "ยังตั้งค่าไม่ครบ"}
            </div>
          </header>

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.success}>{message}</div>}

          <form className={styles.card} onSubmit={save}>
            <div className={styles.topRow}>
              <div className={styles.exness}>
                <div className={styles.logo}>E</div>
                <div>
                  <b>Exness Partner Setup</b>
                  <span>ลูกค้าจะไม่เห็นเมนู Broker</span>
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
                  placeholder="เช่น jlkhtspm2n"
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
        </div>
      </main>
    </div>
  );
}
