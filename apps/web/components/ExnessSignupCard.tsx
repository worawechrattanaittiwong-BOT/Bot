"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ScenovaIcon } from "./ScenovaIcon";
import styles from "./ExnessSignupCard.module.css";

type SignupInfo = {
  active: boolean;
  broker: string;
  partnerCode: string;
  benefitMessage: string;
  computerReady: boolean;
  mobileReady: boolean;
};

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac;
}

export function ExnessSignupCard() {
  const [info, setInfo] = useState<SignupInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/brokers/exness/signup")
      .then(result => {
        if (active) setInfo(result);
      })
      .catch(() => {
        if (active) setInfo(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const mobile = useMemo(() => isMobileDevice(), [open]);
  const deviceLabel = mobile ? "มือถือ / แท็บเล็ต" : "คอมพิวเตอร์";

  if (!info?.active) return null;

  async function openRegistration() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/brokers/exness/registration-link", {
        method: "POST",
        body: JSON.stringify({ platform: mobile ? "MOBILE" : "WEB" })
      });
      const url = String(result?.url || "");
      if (!url.startsWith("https://")) throw new Error("ลิงก์สมัครไม่ถูกต้อง");
      window.location.assign(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เปิดลิงก์สมัคร Exness ไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.icon}><ScenovaIcon name="account" size={21}/></div>
        <div className={styles.copy}>
          <b>ยังไม่มีบัญชี Exness?</b>
          <span>สมัครผ่าน SCENOVA เพื่อรับสิทธิพิเศษ แล้วค่อยเชื่อม MT5 ได้ทันที</span>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          สมัคร Exness
        </button>
      </section>

      {open && (
        <div className={styles.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exness-signup-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.close}
              aria-label="ปิด"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <div className={styles.modalHead}>
              <div className={styles.exnessMark}>E</div>
              <div>
                <span>EXNESS PARTNER</span>
                <h2 id="exness-signup-title">สมัคร Exness ผ่าน SCENOVA</h2>
              </div>
            </div>

            <div className={styles.benefit}>
              <ScenovaIcon name="spark" size={18}/>
              <span>{info.benefitMessage}</span>
            </div>

            <div className={styles.partnerCode}>
              <span>Partner Code</span>
              <b>{info.partnerCode}</b>
            </div>

            <div className={styles.deviceRow}>
              <span>อุปกรณ์ที่กำลังใช้</span>
              <b>{deviceLabel}</b>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => void openRegistration()}
            >
              {busy ? "กำลังเปิด Exness..." : "ไปสมัคร Exness"}
            </button>

            <small className={styles.note}>
              ระบบจะเปิดลิงก์ Partner ที่ตั้งไว้สำหรับ {deviceLabel} เพียงลิงก์เดียว
            </small>
          </section>
        </div>
      )}
    </>
  );
}
