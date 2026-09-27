"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./onboarding.module.css";

type SetupDashboard = {
  user: any;
  selectedSlot: any;
  account: any;
  instance: any;
  entitlement: any;
  trialRequest: any;
};

function accessLabel(data: SetupDashboard | null) {
  if (!data) return "กำลังตรวจสอบ";
  if (data.entitlement?.allowed) {
    const source = String(data.entitlement?.source || "").toUpperCase();
    if (source === "TRIAL" || source === "TRIAL_READY") return "Trial พร้อมใช้งาน";
    if (source === "SUBSCRIPTION") return "Subscription Active";
    if (source === "OWNER") return "Owner Access";
    return "Access Active";
  }
  if (String(data.trialRequest?.status || "").toUpperCase() === "PENDING") {
    return "รออนุมัติ Trial";
  }
  return "ยังไม่มีสิทธิ์ใช้งาน";
}

export default function OnboardingPage() {
  const [data, setData] = useState<SetupDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newAccount, setNewAccount] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<"cloud" | "local">("cloud");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (!getToken()) {
        window.location.replace("/login");
        return;
      }
      const dashboard = await api("/bot/dashboard?light=1");
      setData(dashboard);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถตรวจสอบสถานะบัญชีได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNewAccount(params.get("new") === "1" || params.get("verified") === "1");
    void load();
  }, []);

  const accountLinked = Boolean(
    data?.account?.id ||
    data?.selectedSlot?.mt5_account_id ||
    data?.instance?.mt5_account_id
  );
  const accessAllowed = Boolean(data?.entitlement?.allowed);
  const currentStep = accessAllowed ? 3 : accountLinked ? 2 : 1;

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.replace("/login");
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <header className={styles.header}>
        <a href="/website" aria-label="SCENOVA website">
          <ScenovaBrand className={styles.brand} />
        </a>
        <div className={styles.headerActions}>
          <span className={styles.secureBadge}><ScenovaIcon name="shield" size={15}/> Secure Setup</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.eyebrow}>ACCOUNT ONBOARDING</div>
          <h1>ตั้งค่าบัญชีให้พร้อม<br/><span>ก่อนเริ่มใช้งาน MT5</span></h1>
          <p>เลือกวิธีใช้งาน แล้วไปยังขั้นตอนถัดไปได้ทันที</p>

          <div className={styles.identity}>
            <div>
              <small>SCENOVA USER</small>
              <b>{data?.user?.user_code || data?.user?.userCode || "—"}</b>
            </div>
            <div>
              <small>EMAIL</small>
              <b>{data?.user?.email || "—"}</b>
            </div>
            <div>
              <small>ACCESS</small>
              <b>{accessLabel(data)}</b>
            </div>
          </div>
        </div>

        <div className={styles.progress} aria-label="Setup progress">
          {[
            { n:1, title:"Account", sub:"บัญชี SCENOVA" },
            { n:2, title:"Choose System", sub:"VPS หรือ Local" },
            { n:3, title:"Setup & Access", sub:"ติดตั้งและเริ่มใช้งาน" }
          ].map(step => {
            const complete =
              step.n === 1 ||
              (step.n === 2 && accountLinked) ||
              (step.n === 3 && accessAllowed);
            const active = step.n === currentStep && !complete;
            return (
              <div key={step.n} className={styles.progressItem + (complete ? " " + styles.complete : "") + (active ? " " + styles.active : "")}>
                <span>{complete ? "✓" : step.n}</span>
                <div><b>{step.title}</b><small>{step.sub}</small></div>
              </div>
            );
          })}
        </div>

        {newAccount && !accountLinked && (
          <section className={styles.systemChoice}>
            <div className={styles.runtimePanel}>
              <div className={styles.runtimeTabs} role="tablist" aria-label="เลือกรูปแบบการใช้งาน MT5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={runtimeMode === "cloud"}
                  className={runtimeMode === "cloud" ? styles.runtimeTabActive : ""}
                  onClick={() => setRuntimeMode("cloud")}
                >
                  <ScenovaIcon name="cloud" size={20}/>
                  <span>Cloud</span>
                  <small>MODE</small>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={runtimeMode === "local"}
                  className={runtimeMode === "local" ? styles.runtimeTabActive : ""}
                  onClick={() => setRuntimeMode("local")}
                >
                  <ScenovaIcon name="strategy" size={20}/>
                  <span>Local</span>
                  <small>MODE</small>
                </button>
              </div>

              <div key={runtimeMode} className={styles.runtimeContent} role="tabpanel">
                <div className={styles.runtimeDiagram} aria-label={runtimeMode === "cloud" ? "SCENOVA Cloud เชื่อมต่อ MT5 และ EA" : "คอมพิวเตอร์ของคุณเชื่อมต่อ MT5 และ EA"}>
                  <div className={styles.runtimeNode}>
                    <ScenovaIcon name="control" size={29}/>
                    <span>YOUR CONTROL</span>
                  </div>
                  <div className={styles.runtimeLine} aria-hidden="true"><i/></div>
                  <div className={styles.runtimeNode + " " + styles.runtimeCore}>
                    <ScenovaIcon name={runtimeMode === "cloud" ? "cloud" : "strategy"} size={36}/>
                    <span>{runtimeMode === "cloud" ? "SCENOVA CLOUD" : "YOUR PC / VPS"}</span>
                  </div>
                  <div className={styles.runtimeLine} aria-hidden="true"><i/></div>
                  <div className={styles.runtimeNode}>
                    <ScenovaIcon name="strategy" size={29}/>
                    <span>MT5 + EA</span>
                  </div>
                </div>

                <div className={styles.runtimeCopy}>
                  <h2>{runtimeMode === "cloud" ? "เปิดโลกการเทรดจากมือถือ" : "ใช้ MT5 บนเครื่องของคุณ"}</h2>
                  <p>
                    {runtimeMode === "cloud"
                      ? "MT5 และ EA ทำงานบน Trading Server ของ SCENOVA คุณติดตามสถานะและสั่งงานผ่านเว็บได้จากทุกอุปกรณ์"
                      : "ติดตั้ง SCENOVA Agent เพื่อเชื่อม MT5 บน PC หรือ VPS ของคุณ แล้วสั่งเริ่ม หยุด และตั้งค่าบอทผ่านเว็บ"}
                  </p>

                  <div className={styles.runtimeFeatures}>
                    {(runtimeMode === "cloud"
                      ? ["ใช้ผ่านมือถือได้", "ทำงานบนเซิร์ฟเวอร์", "ควบคุมผ่านเว็บ"]
                      : ["PC หรือ VPS ของคุณ", "เชื่อมด้วย Agent", "ควบคุมผ่านเว็บ"]
                    ).map(item => (
                      <span key={item}><ScenovaIcon name="status" size={14}/>{item}</span>
                    ))}
                  </div>

                  <small className={styles.runtimeCaption}>
                    {runtimeMode === "cloud"
                      ? "บอททำงานบน Trading Server ตามการตั้งค่าของคุณ"
                      : "เปิด MT5 และ SCENOVA Agent ไว้ระหว่างการทำงาน"}
                  </small>

                  <div className={styles.runtimeActions}>
                    {runtimeMode === "cloud" ? (
                      <a className={styles.runtimePrimary} href="/packages?system=cloud&from=onboarding">
                        ดูแพ็กเกจ VPS <span>→</span>
                      </a>
                    ) : (
                      <>
                        <a className={styles.runtimePrimary} href="/dashboard?view=account&welcome=1&setup=local">
                          ติดตั้ง Local MT5 <span>→</span>
                        </a>
                        <a className={styles.runtimeTrial} href="/packages?system=local&from=onboarding">
                          เริ่มทดลองใช้งาน
                        </a>
                        <a className={styles.runtimeSecondary} href="/dashboard?view=overview">
                          เข้าสู่ Dashboard
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className={styles.errorBox}>
            <span>{error}</span>
            <button type="button" onClick={()=>void load()}>ลองใหม่</button>
          </div>
        )}

      </section>
    </main>
  );
}
