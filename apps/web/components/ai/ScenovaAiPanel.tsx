"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import styles from "./ScenovaAiPanel.module.css";

type Contact = {
  id: string;
  type: string;
  label: string;
  url: string;
};

type Bootstrap = {
  enabled: boolean;
  configured: boolean;
  provider: string;
  model: string;
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  slot: {
    slotId: string | null;
    accountLabel: string | null;
    accountMasked: string | null;
    runtimeState: string;
    controlMode: string | null;
  } | null;
  suggestions: string[];
  contacts: Contact[];
};

type Message = {
  role: "USER" | "ASSISTANT";
  content: string;
};

function ContactIcon({ type }: { type: string }) {
  const key = String(type || "").toUpperCase();
  if (key === "FACEBOOK") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 8.2h2.3V4.8c-.4-.1-1.8-.2-3.4-.2-3.4 0-5.7 2-5.7 5.8v3.2H3.6v3.8h3.8V24h4.6v-6.6h3.8l.6-3.8H12v-2.8c0-1.1.3-1.9 2.2-1.9z" fill="currentColor"/></svg>;
  }
  if (key === "TELEGRAM") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 3.4 18.4 20c-.2 1.2-.9 1.5-1.9.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.2-8.3c.4-.4-.1-.6-.6-.2L5.7 13.5.8 12c-1.1-.3-1.1-1.1.2-1.6L20.1 3c.9-.3 1.8.2 1.6.4z" fill="currentColor"/></svg>;
  }
  if (key === "LINE") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.7 3 2.4 6.5 2.4 10.8c0 3.9 3.5 7.1 8.2 7.7.3.1.8.2.9.5.1.3.1.7 0 1l-.1.7c0 .2-.2.9.8.5 1-.4 5.3-3.1 7.2-5.3 1.3-1.5 2.2-3.2 2.2-5.1C21.6 6.5 17.3 3 12 3z" fill="currentColor"/></svg>;
  }
  return <span aria-hidden="true">↗</span>;
}

export function ScenovaAiPanel({
  slotId,
  onBack,
  onClose
}: {
  slotId?: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setConversationId("");
    setMessages([]);
    setError("");
    const query = slotId ? "?slotId=" + encodeURIComponent(slotId) : "";
    void api("/ai-assistant/bootstrap" + query)
      .then((data: any) => {
        if (!cancelled) setBootstrap(data as Bootstrap);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || "โหลด SCENOVA AI ไม่สำเร็จ");
      });
    return () => { cancelled = true; };
  }, [slotId]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  const slotLabel = useMemo(() => {
    if (!bootstrap?.slot) return "ยังไม่มี Slot ที่เชื่อมอยู่";
    const name = bootstrap.slot.accountLabel || bootstrap.slot.accountMasked || "MT5";
    const mode = bootstrap.slot.controlMode ? " · " + bootstrap.slot.controlMode : "";
    return name + mode;
  }, [bootstrap]);

  async function send(forced?: string) {
    const text = String(forced ?? input).trim();
    if (!text || busy || !bootstrap?.configured) return;
    setBusy(true);
    setError("");
    setInput("");
    setMessages(current => [...current, { role: "USER", content: text }]);
    try {
      const data: any = await api("/ai-assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          slotId: slotId || undefined,
          conversationId: conversationId || undefined,
          message: text
        })
      });
      setConversationId(String(data.conversationId || conversationId));
      setMessages(current => [...current, {
        role: "ASSISTANT",
        content: String(data.message || "ไม่พบข้อความตอบกลับ")
      }]);
      setBootstrap(current => current ? {
        ...current,
        remainingToday: data.remainingToday ?? current.remainingToday
      } : current);
    } catch (err: any) {
      setMessages(current => {
        const next = [...current];
        if (next[next.length - 1]?.role === "USER" && next[next.length - 1]?.content === text) next.pop();
        return next;
      });
      setInput(text);
      setError(err?.message || "ส่งคำถามไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={onBack} aria-label="ย้อนกลับ">‹</button>
        <div className={styles.heading}>
          <b>SCENOVA AI</b>
          <small>{slotLabel}</small>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="ปิด">×</button>
      </header>

      <div className={styles.statusRow}>
        <span className={bootstrap?.configured ? styles.ready : styles.waiting}>
          {bootstrap?.configured ? "● AI พร้อมใช้งาน" : "● รอเชื่อม AI Provider"}
        </span>
        {bootstrap?.remainingToday != null && <small>เหลือ {bootstrap.remainingToday} ข้อความวันนี้</small>}
      </div>

      <div ref={listRef} className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <b>ถามได้เฉพาะเรื่องระบบ SCENOVA</b>
            <p>โหมดการเทรด · การตั้งค่า · MT5/EA · Exness/Broker · Error · ความเสี่ยงของค่าปัจจุบัน</p>
            <span>AI เป็น Read-only และไม่มีสิทธิ์ Start/Stop หรือส่งคำสั่งซื้อขาย</span>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === "USER" ? styles.userMessage : styles.aiMessage}>
            <small>{message.role === "USER" ? "คุณ" : "SCENOVA AI"}</small>
            <p>{message.content}</p>
          </div>
        ))}
        {busy && <div className={styles.typing}>SCENOVA AI กำลังตอบ…</div>}
      </div>

      {messages.length === 0 && bootstrap?.suggestions?.length ? (
        <div className={styles.suggestions}>
          {bootstrap.suggestions.slice(0, 4).map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void send(suggestion)}
              disabled={!bootstrap.configured || busy}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {error && <div className={styles.error} role="alert">{error}</div>}

      <form className={styles.composer} onSubmit={submit}>
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={bootstrap?.configured ? "ถามเกี่ยวกับ SCENOVA..." : "ตั้งค่า AI Provider ก่อนใช้งาน"}
          maxLength={1500}
          rows={2}
          disabled={!bootstrap?.configured || busy}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={!bootstrap?.configured || busy || !input.trim()}>ส่ง</button>
      </form>

      {bootstrap?.contacts?.length ? (
        <div className={styles.contacts}>
          <small>ติดต่อผู้พัฒนา</small>
          <div>
            {bootstrap.contacts.map(contact => (
              <a key={contact.id} href={contact.url} target="_blank" rel="noreferrer">
                <ContactIcon type={contact.type} />
                <span>{contact.type === "LINE"
                  ? "LINE"
                  : contact.type === "FACEBOOK"
                    ? "Facebook"
                    : contact.type === "TELEGRAM"
                      ? "Telegram"
                      : contact.label}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
