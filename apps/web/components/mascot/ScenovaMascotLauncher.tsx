"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ScenovaRobotCanvas } from "./ScenovaRobotCanvas";
import styles from "./ScenovaMascot.module.css";

type Props = {
  className?: string;
  onConnectMobile: () => Promise<boolean>;
  error?: string;
};

export function ScenovaMascotLauncher({ className = "", onConnectMobile, error }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    actionRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function connect() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const connected = await onConnectMobile();
      if (mountedRef.current && connected) setOpen(false);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className={`${styles.launcher} ${className}`} data-open={open}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}>
      {open && (
        <section id={id} className={styles.card} role="dialog" aria-labelledby={`${id}-title`}>
          <div className={styles.cardGlow} />
          <header className={styles.header}>
            <div className={styles.sparkle} aria-hidden="true">✦</div>
            <div>
              <p className={styles.eyebrow}>YOUR LITTLE COMPANION</p>
              <h2 id={`${id}-title`}>SCENOVA</h2>
            </div>
            <button type="button" className={styles.close} aria-label="ปิดเมนูมาสคอต"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button>
          </header>
          <p className={styles.greeting}>สวัสดีครับ วันนี้ให้ผมช่วยอะไรดี?</p>
          <button ref={actionRef} type="button" className={styles.action} onClick={() => void connect()}
            disabled={busy} aria-busy={busy}>
            <span className={styles.actionIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 5h4M11 18.5h2" />
              </svg>
            </span>
            <span className={styles.actionText}>
              <strong>{busy ? "กำลังเตรียมการเชื่อมต่อ…" : "เชื่อมต่อหน้าจอมือถือ"}</strong>
              <small>สแกน QR เพื่อเปิด Mobile Mirror</small>
            </span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </button>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <footer className={styles.footer}><span aria-hidden="true" /> พร้อมอยู่ข้างคุณ</footer>
        </section>
      )}
      <button ref={triggerRef} type="button" className={styles.trigger}
        aria-label={open ? "ปิดเมนู SCENOVA" : "เปิดเมนู SCENOVA"}
        aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
        onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
        onClick={() => setOpen(current => !current)}>
        <span className={styles.halo} aria-hidden="true" />
        <ScenovaRobotCanvas engaged={hovered || open} />
        <span className={styles.label}><span aria-hidden="true">✦</span> SCENOVA</span>
        <span className={styles.hint} aria-hidden="true">แตะเพื่อเปิดเมนู</span>
      </button>
    </div>
  );
}
