"use client";

import { FormEvent, useEffect, useState } from "react";
import { OwnerMobileNav, OwnerSidebar } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { useSystemPopup } from "../../../components/SystemPopupProvider";
import { adminApi } from "../../../lib/api";
import s from "./page.module.css";

type ServiceLink = {
  id: string;
  name: string;
  purpose: string;
  url: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  purpose: string;
  url: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  purpose: "",
  url: "",
  note: ""
};

function domainOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function AdminServiceLinksPage() {
  const { confirmPopup } = useSystemPopup();
  const [items, setItems] = useState<ServiceLink[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("กำลังโหลด...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi("/admin/service-links");
      const next = Array.isArray(data?.items) ? data.items : [];
      setItems(next);
      setMessage(next.length ? `${next.length} services` : "ยังไม่มีรายการ");
    } catch (err: any) {
      setError(String(err?.message || "โหลดข้อมูลไม่สำเร็จ"));
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: keyof FormState, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
    setError("");
  }

  function edit(item: ServiceLink) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      purpose: item.purpose,
      url: item.url,
      note: item.note
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await adminApi("/admin/service-links/" + editingId, {
          method: "PATCH",
          body: JSON.stringify(form)
        });
        setMessage("อัปเดตรายการแล้ว");
      } else {
        await adminApi("/admin/service-links", {
          method: "POST",
          body: JSON.stringify(form)
        });
        setMessage("เพิ่มรายการแล้ว");
      }

      setEditingId("");
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ServiceLink) {
    const confirmed = await confirmPopup({
      title: "ลบบริการ",
      message: `ลบ ${item.name} ออกจากรายการ?`,
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      tone: "warning"
    });
    if (!confirmed) return;

    setError("");
    try {
      await adminApi("/admin/service-links/" + item.id, { method: "DELETE" });
      if (editingId === item.id) resetForm();
      setItems(current => current.filter(value => value.id !== item.id));
      setMessage("ลบรายการแล้ว");
    } catch (err: any) {
      setError(String(err?.message || "ลบไม่สำเร็จ"));
    }
  }

  return (
    <div className="app-wrap owner-app">
      <OwnerSidebar activeKey="service-links" onLogout={logout}/>

      <main className={`main app-main owner-main ${s.shellMain}`}>
        <div className={s.root}>
          <div className="mobile-only mobile-app-head">
            <div className="brand-lockup scenova-brand-lockup">
              <ScenovaBrand className="scenova-brand-logo-mobile"/>
            </div>
            <button className="btn ghost" onClick={logout}>ออก</button>
          </div>
          <OwnerMobileNav activeKey="service-links"/>

          <header className={s.header}>
            <div>
              <span className={s.kicker}>SCENOVA / ADMIN ONLY</span>
              <h1>API & Service Links</h1>
              <p>
                รวมเว็บและบริการที่ SCENOVA เชื่อมต่อไว้ เพื่อเปิดตรวจสอบบัญชีหรือค่าใช้จ่ายได้จากที่เดียว
              </p>
            </div>
            <span className={s.privateBadge}>PRIVATE · OWNER / ADMIN</span>
          </header>

          <form className={s.editor} onSubmit={save}>
            <div className={s.field}>
              <label>ชื่อบริการ</label>
              <input
                value={form.name}
                onChange={event => updateField("name", event.target.value)}
                placeholder="เช่น Resend"
                maxLength={120}
                required
              />
            </div>

            <div className={s.field}>
              <label>เชื่อมต่อทำอะไร</label>
              <input
                value={form.purpose}
                onChange={event => updateField("purpose", event.target.value)}
                placeholder="เช่น Email API"
                maxLength={220}
              />
            </div>

            <div className={s.field}>
              <label>ลิงก์เว็บไซต์</label>
              <input
                value={form.url}
                onChange={event => updateField("url", event.target.value)}
                placeholder="https://..."
                inputMode="url"
                required
              />
            </div>

            <div className={`${s.field} ${s.fieldWide}`}>
              <label>หมายเหตุ</label>
              <textarea
                value={form.note}
                onChange={event => updateField("note", event.target.value)}
                placeholder="ข้อมูลสั้น ๆ ที่อยากจำ เช่น ใช้ส่ง OTP / เช็กบิลสิ้นเดือน"
                maxLength={1000}
              />
            </div>

            <div className={s.actions}>
              <div className={s.actionLeft}>
                {editingId ? "กำลังแก้ไขรายการเดิม" : "เพิ่มเว็บใหม่ได้ตลอดเวลา"}
              </div>
              <div className={s.actionRight}>
                {editingId && (
                  <button type="button" className={s.ghost} onClick={resetForm} disabled={saving}>
                    ยกเลิก
                  </button>
                )}
                <button type="submit" className={s.primary} disabled={saving}>
                  {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "+ เพิ่มลิงก์"}
                </button>
              </div>
            </div>
          </form>

          <div className={`${s.message} ${error ? s.messageError : ""}`}>
            {error || message}
          </div>

          <div className={s.listHead}>
            <div>
              <h2>Connected Services</h2>
              <span>กด Open เพื่อเปิดหน้าเว็บในแท็บใหม่</span>
            </div>
            <span>{loading ? "LOADING" : `${items.length} ITEMS`}</span>
          </div>

          <section className={s.grid}>
            {!loading && items.length === 0 && !error && (
              <div className={s.empty}>ยังไม่มีรายการ · เพิ่มลิงก์ด้านบนได้เลย</div>
            )}

            {items.map(item => (
              <article className={s.card} key={item.id}>
                <div className={s.cardTop}>
                  <div>
                    <h3>{item.name}</h3>
                    <p className={s.purpose}>{item.purpose || "Service / API"}</p>
                  </div>
                </div>

                <p className={s.note}>{item.note || "—"}</p>
                <span className={s.domain}>{domainOf(item.url)}</span>

                <div className={s.cardActions}>
                  <a
                    className={s.openButton}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ↗
                  </a>
                  <button className={s.smallButton} type="button" onClick={() => edit(item)}>
                    แก้ไข
                  </button>
                  <button
                    className={`${s.smallButton} ${s.smallDanger}`}
                    type="button"
                    onClick={() => void remove(item)}
                  >
                    ลบ
                  </button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
