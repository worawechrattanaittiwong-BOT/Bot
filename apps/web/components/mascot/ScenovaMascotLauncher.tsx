"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ScenovaAiPanel, ContactIcon } from "../ai/ScenovaAiPanel";
import { api } from "../../lib/api";
import { ScenovaRobotCanvas } from "./ScenovaRobotCanvas";
import styles from "./ScenovaMascot.module.css";

type Props = {
  className?: string;
  onConnectMobile: () => Promise<boolean>;
  error?: string;
};

type PanelView = "MENU" | "AI";

type Contact = { id: string; type: string; label: string; url: string };

const ACTIVE_SLOT_STORAGE_KEY = "scenova_ai_active_slot_id";
const ACTIVE_SLOT_EVENT = "scenova:active-slot";

export function ScenovaMascotLauncher({ className = "", onConnectMobile, error }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>("MENU");
  const [hovered, setHovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
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
    const read = () => {
      try {
        setActiveSlotId(String(localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY) || ""));
      } catch {
        setActiveSlotId("");
      }
    };
    const onActiveSlot = (event: Event) => {
      const custom = event as CustomEvent<{ slotId?: string }>;
      const slotId = String(custom.detail?.slotId || "");
      setActiveSlotId(slotId);
    };
    read();
    window.addEventListener(ACTIVE_SLOT_EVENT, onActiveSlot as EventListener);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(ACTIVE_SLOT_EVENT, onActiveSlot as EventListener);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setView("MENU");
      return;
    }
    if (view === "MENU") actionRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view === "AI") {
        setView("MENU");
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, view]);

  // Load the existing admin-configured support links when the first menu opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContacts([]);
    const query = activeSlotId ? "?slotId=" + encodeURIComponent(activeSlotId) : "";
    void api("/ai-assistant/bootstrap" + query)
      .then((data: { contacts?: Contact[] }) => {
        if (!cancelled) setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      });
    return () => { cancelled = true; };
  }, [open, activeSlotId]);

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

  const close = () => {
    setOpen(false);
    setView("MENU");
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.launcher} ${className}`}
      data-open={open}
      data-view={view.toLowerCase()}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      {open && (
        <section
          id={id}
          className={`${styles.card} ${view === "AI" ? styles.cardAi : ""}`}
          role="dialog"
          aria-labelledby={view === "MENU" ? `${id}-title` : undefined}
        >
          <div className={styles.cardGlow} />
          {view === "AI" ? (
            <ScenovaAiPanel
              slotId={activeSlotId || undefined}
              onBack={() => setView("MENU")}
              onClose={close}
            />
          ) : (
            <>
              <header className={styles.header}>
                <div className={styles.sparkle} aria-hidden="true">✦</div>
                <div>
                  <h2 id={`${id}-title`}>SCENOVA</h2>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  aria-label="ปิดเมนูมาสคอต"
                  onClick={close}
                >
                  ×
                </button>
              </header>

              <p className={styles.greeting}>สวัสดีครับ 👋 วันนี้ให้ผมช่วยอะไรดี?</p>

              <button
                ref={actionRef}
                type="button"
                className={`${styles.action} ${styles.aiAction}`}
                onClick={() => setView("AI")}
              >
                <span className={styles.actionIcon} aria-hidden="true">✦</span>
                <span className={styles.actionText}>
                  <strong>ถาม SCENOVA AI</strong>
                  <small>ถามวิธีใช้ แก้ปัญหา หรือให้ผมพาไปหน้าที่ต้องการ</small>
                </span>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </button>

              <button
                type="button"
                className={styles.action}
                onClick={() => void connect()}
                disabled={busy}
                aria-busy={busy}
              >
                <span className={styles.actionIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 5h4M11 18.5h2" />
                  </svg>
                </span>
                <span className={styles.actionText}>
                  <strong>{busy ? "กำลังเตรียมการเชื่อมต่อ…" : "เชื่อมต่อหน้าจอมือถือ"}</strong>
                  <small>สแกน QR แล้วเปิดใช้งานจากมือถือ</small>
                </span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </button>

              {error && <p className={styles.error} role="alert">{error}</p>}
              {contacts.length > 0 && (
                <section className={styles.contacts} aria-label="ติดต่อผู้พัฒนา">
                  <small>ติดต่อผู้พัฒนา</small>
                  <div className={styles.contactLinks}>
                    {contacts.map(contact => (
                      <a
                        key={contact.id}
                        href={contact.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-channel={String(contact.type || "").toUpperCase()}
                      >
                        <ContactIcon type={contact.type} />
                        <span>{contact.type === "LINE" ? "LINE"
                          : contact.type === "FACEBOOK" ? "Facebook"
                          : contact.type === "TELEGRAM" ? "Telegram"
                          : contact.label}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
              <footer className={styles.footer}><span aria-hidden="true" /> พร้อมช่วยคุณ</footer>
            </>
          )}
        </section>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={open ? "ปิดเมนู SCENOVA" : "เปิดเมนู SCENOVA"}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setOpen(current => !current)}
      >
        <span className={styles.halo} aria-hidden="true" />
        <ScenovaRobotCanvas engaged={hovered || open} />
        <span className={styles.hint} aria-hidden="true">แตะเพื่อเปิดเมนู</span>
      </button>
    </div>
  );
}
