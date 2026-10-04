"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import styles from "../page.module.css";

type AutomationState = {
  connection: {
    configured: boolean;
    enabled: boolean;
    baseUrl: string;
    authPath: string;
    summaryPath: string;
    clientReportPath: string;
    commissionReportPath: string;
    autoVerifyClients: boolean;
    autoImportCommissions: boolean;
    autoReleaseRebates: boolean;
    commissionAmountScale: number;
    syncIntervalMinutes: number;
    lastTestStatus: string;
    lastTestDetail: string;
    lastTestedAt: string | null;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    officialSchemaUrl: string;
  };
  runs: Array<{
    id: string;
    trigger_type: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    clients_seen: number;
    clients_verified: number;
    commissions_seen: number;
    commissions_imported: number;
    rebates_released: number;
    error_detail: string;
  }>;
};

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export function AdminBrokerAutomationPanel() {
  const [data, setData] = useState<AutomationState | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    enabled: false,
    syncIntervalMinutes: 15,
    clientReportPath: "",
    commissionReportPath: "",
    autoVerifyClients: false,
    autoImportCommissions: false,
    autoReleaseRebates: false,
    commissionAmountScale: 100
  });

  async function load() {
    const result = await adminApi("/admin/brokers/exness/automation");
    setData(result);
    const c = result?.connection || {};
    setForm(current => ({
      ...current,
      email: "",
      password: "",
      enabled: Boolean(c.enabled),
      syncIntervalMinutes: Number(c.syncIntervalMinutes || 15),
      clientReportPath: String(c.clientReportPath || ""),
      commissionReportPath: String(c.commissionReportPath || ""),
      autoVerifyClients: Boolean(c.autoVerifyClients),
      autoImportCommissions: Boolean(c.autoImportCommissions),
      autoReleaseRebates: Boolean(c.autoReleaseRebates),
      commissionAmountScale: Number(c.commissionAmountScale || 100)
    }));
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "โหลด API Automation ไม่สำเร็จ");
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/automation/connection", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      setForm(current => ({ ...current, email: "", password: "" }));
      await load();
      setMessage("บันทึก Exness API Automation Settings แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึก Automation Settings ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    setMessage("");
    try {
      const result = await adminApi("/admin/brokers/exness/automation/test", {
        method: "POST"
      });
      await load();
      if (result?.ok) setMessage("Exness Partnership API: Connection PASS");
      else setError(String(result?.detail || "Connection FAIL"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test Connection ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    setBusy("sync");
    setError("");
    setMessage("");
    try {
      const result = await adminApi("/admin/brokers/exness/automation/sync", {
        method: "POST"
      });
      await load();
      if (result?.ok) {
        setMessage(
          "Sync เสร็จ: Clients " +
          Number(result?.counts?.clientsVerified || 0) +
          " · Commission " +
          Number(result?.counts?.commissionsImported || 0) +
          " · Rebate " +
          Number(result?.counts?.rebatesReleased || 0)
        );
      } else {
        setError(String(result?.error || "Sync ไม่สำเร็จ"));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sync ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <section className={styles.adminPanel}>
        <div className={styles.rebateLoading}>กำลังโหลด Exness API Automation...</div>
      </section>
    );
  }

  const connection = data.connection;
  const pass = connection.lastTestStatus === "PASS";

  return (
    <section className={styles.adminPanel}>
      <div className={styles.adminHead}>
        <div>
          <span className={styles.eyebrow}>PHASE 4 · EXNESS PARTNERSHIP API</span>
          <h2>API & Automation</h2>
          <p>
            Credentials ถูกเข้ารหัสใน Runtime Secrets Vault · Automation ปิดเป็นค่าเริ่มต้น
            และจะเปิดได้หลัง Test Connection ผ่านเท่านั้น
          </p>
        </div>
        <div className={pass ? styles.apiPass : styles.apiIdle}>
          <small>API STATUS</small>
          <b>{connection.lastTestStatus || "NOT TESTED"}</b>
          <span>{dateTime(connection.lastTestedAt)}</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <div className={styles.apiOfficialNote}>
        <b>Official Exness Partnership API</b>
        <span>
          Auth: {connection.authPath} · Verify: {connection.summaryPath}
        </span>
        <a href={connection.officialSchemaUrl} target="_blank" rel="noreferrer">
          เปิด Official API Schema ↗
        </a>
      </div>

      <form className={styles.apiForm} onSubmit={save}>
        <div className={styles.apiCredentials}>
          <label>
            <span>Exness Partner Email</span>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
              placeholder={connection.configured ? "ตั้งค่าแล้ว · ใส่เฉพาะเมื่อต้องการเปลี่ยน" : "Partner email"}
              autoComplete="off"
            />
          </label>
          <label>
            <span>Exness Partner Password</span>
            <input
              type="password"
              value={form.password}
              onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
              placeholder={connection.configured ? "•••••••• · ใส่เฉพาะเมื่อต้องการเปลี่ยน" : "Partner password"}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className={styles.apiPaths}>
          <label>
            <span>Client Report Path</span>
            <input
              value={form.clientReportPath}
              onChange={event => setForm(current => ({ ...current, clientReportPath: event.target.value }))}
              placeholder="/api/...  จาก Official Schema"
            />
          </label>
          <label>
            <span>Commission Report Path</span>
            <input
              value={form.commissionReportPath}
              onChange={event => setForm(current => ({ ...current, commissionReportPath: event.target.value }))}
              placeholder="/api/...  จาก Official Schema"
            />
          </label>
          <label>
            <span>Commission Amount Scale</span>
            <input
              type="number"
              min="1"
              max="1000000"
              value={form.commissionAmountScale}
              onChange={event => setForm(current => ({
                ...current,
                commissionAmountScale: Number(event.target.value || 100)
              }))}
            />
            <small>เช่น API ส่ง 12.34 USD → Scale 100 = 1,234 minor units</small>
          </label>
          <label>
            <span>Sync Interval</span>
            <select
              value={form.syncIntervalMinutes}
              onChange={event => setForm(current => ({
                ...current,
                syncIntervalMinutes: Number(event.target.value)
              }))}
            >
              <option value={5}>ทุก 5 นาที</option>
              <option value={15}>ทุก 15 นาที</option>
              <option value={30}>ทุก 30 นาที</option>
              <option value={60}>ทุก 1 ชั่วโมง</option>
            </select>
          </label>
        </div>

        <div className={styles.apiToggles}>
          <label>
            <input
              type="checkbox"
              checked={form.autoVerifyClients}
              onChange={event => setForm(current => ({ ...current, autoVerifyClients: event.target.checked }))}
            />
            <span>
              <b>Auto Verify Partner Clients</b>
              <small>ต้องตั้ง Client Report Path ก่อน</small>
            </span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.autoImportCommissions}
              onChange={event => setForm(current => ({ ...current, autoImportCommissions: event.target.checked }))}
            />
            <span>
              <b>Auto Import Commission</b>
              <small>ใช้ External Event ID ป้องกันรายการซ้ำ</small>
            </span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.autoReleaseRebates}
              onChange={event => setForm(current => ({ ...current, autoReleaseRebates: event.target.checked }))}
            />
            <span>
              <b>Auto Release Rebate</b>
              <small>Confirmed Commission → Pending → Available อัตโนมัติ</small>
            </span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))}
            />
            <span>
              <b>Enable Scheduled Automation</b>
              <small>เปิดได้เมื่อ API Test = PASS</small>
            </span>
          </label>
        </div>

        <div className={styles.apiActions}>
          <button type="submit" disabled={Boolean(busy)}>
            {busy === "save" ? "กำลังบันทึก..." : "บันทึก Settings"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !connection.configured}
            onClick={() => void test()}
          >
            {busy === "test" ? "กำลัง Test..." : "Test Connection"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !pass}
            onClick={() => void syncNow()}
          >
            {busy === "sync" ? "กำลัง Sync..." : "Sync Now"}
          </button>
        </div>
      </form>

      <div className={styles.apiStatusGrid}>
        <div><span>Configured</span><b>{connection.configured ? "YES" : "NO"}</b></div>
        <div><span>Automation</span><b>{connection.enabled ? "ON" : "OFF"}</b></div>
        <div><span>Last Sync</span><b>{dateTime(connection.lastSyncAt)}</b></div>
        <div><span>Next Sync</span><b>{dateTime(connection.nextSyncAt)}</b></div>
      </div>

      <div className={styles.syncRuns}>
        <div className={styles.financeSectionHead}>
          <div>
            <b>Sync Logs</b>
            <span>ล่าสุด {data.runs.length} รอบ</span>
          </div>
        </div>

        {data.runs.length ? data.runs.map(run => (
          <div key={run.id} className={styles.syncRunRow}>
            <div>
              <b>{run.status}</b>
              <span>{run.trigger_type} · {dateTime(run.started_at)}</span>
            </div>
            <div>
              <small>Clients</small>
              <b>{run.clients_verified}/{run.clients_seen}</b>
            </div>
            <div>
              <small>Commission</small>
              <b>{run.commissions_imported}/{run.commissions_seen}</b>
            </div>
            <div>
              <small>Rebate</small>
              <b>{run.rebates_released}</b>
            </div>
            <span>{run.error_detail || "OK"}</span>
          </div>
        )) : (
          <div className={styles.emptyClients}>ยังไม่มี Sync Run</div>
        )}
      </div>
    </section>
  );
}
