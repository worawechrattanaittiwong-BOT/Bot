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

type Credential = {
  id: string;
  config_key: string;
  category: string;
  label: string;
  masked_value: string;
  last_four: string;
  note: string;
  active: boolean;
  updated_at: string;
};

type Connection = {
  key: string;
  name: string;
  category: string;
  active: boolean;
  detail: string;
};

type LinkForm = {
  name: string;
  purpose: string;
  url: string;
  note: string;
};

type CredentialForm = {
  category: string;
  label: string;
  configKey: string;
  value: string;
  note: string;
  active: boolean;
};

const EMPTY_LINK: LinkForm = { name: "", purpose: "", url: "", note: "" };
const EMPTY_CREDENTIAL: CredentialForm = {
  category: "OTHER",
  label: "",
  configKey: "",
  value: "",
  note: "",
  active: true
};

const KEY_EXAMPLES: Record<string, string> = {
  EMAIL: "RESEND_API_KEY",
  SMS: "THAIBULKSMS_API_KEY",
  PAYMENT: "OMISE_SECRET_KEY",
  AI: "OPENAI_API_KEY",
  NEWS: "NEWS_API_KEY",
  MARKET_DATA: "MARKET_DATA_API_KEY",
  OTHER: "SERVICE_API_KEY"
};

function domainOf(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

export default function AdminServiceLinksPage() {
  const { confirmPopup } = useSystemPopup();

  const [items, setItems] = useState<ServiceLink[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [linkForm, setLinkForm] = useState<LinkForm>(EMPTY_LINK);
  const [credentialForm, setCredentialForm] = useState<CredentialForm>(EMPTY_CREDENTIAL);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [editingCredentialId, setEditingCredentialId] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingLink, setSavingLink] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
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
      const [links, vault] = await Promise.all([
        adminApi("/admin/service-links"),
        adminApi("/admin/api-credentials")
      ]);
      setItems(Array.isArray(links?.items) ? links.items : []);
      setCredentials(Array.isArray(vault?.items) ? vault.items : []);
      setConnections(Array.isArray(vault?.connections) ? vault.connections : []);
      setMessage("พร้อมใช้งาน");
    } catch (err: any) {
      setError(String(err?.message || "โหลดข้อมูลไม่สำเร็จ"));
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  function updateLinkField(key: keyof LinkForm, value: string) {
    setLinkForm(current => ({ ...current, [key]: value }));
  }

  function updateCredentialField<K extends keyof CredentialForm>(key: K, value: CredentialForm[K]) {
    setCredentialForm(current => ({ ...current, [key]: value }));
  }

  function resetLinkForm() {
    setEditingLinkId("");
    setLinkForm(EMPTY_LINK);
  }

  function resetCredentialForm() {
    setEditingCredentialId("");
    setCredentialForm(EMPTY_CREDENTIAL);
  }

  function editLink(item: ServiceLink) {
    setEditingLinkId(item.id);
    setLinkForm({
      name: item.name,
      purpose: item.purpose,
      url: item.url,
      note: item.note
    });
    setError("");
    document.getElementById("service-link-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editCredential(item: Credential) {
    setEditingCredentialId(item.id);
    setCredentialForm({
      category: item.category,
      label: item.label,
      configKey: item.config_key,
      value: "",
      note: item.note,
      active: item.active
    });
    setError("");
    document.getElementById("api-vault-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveLink(event: FormEvent) {
    event.preventDefault();
    if (savingLink) return;
    setSavingLink(true);
    setError("");
    try {
      if (editingLinkId) {
        await adminApi("/admin/service-links/" + editingLinkId, {
          method: "PATCH",
          body: JSON.stringify(linkForm)
        });
        setMessage("อัปเดตลิงก์แล้ว");
      } else {
        await adminApi("/admin/service-links", {
          method: "POST",
          body: JSON.stringify(linkForm)
        });
        setMessage("เพิ่มลิงก์แล้ว");
      }
      resetLinkForm();
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึกลิงก์ไม่สำเร็จ"));
    } finally {
      setSavingLink(false);
    }
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault();
    if (savingCredential) return;
    setSavingCredential(true);
    setError("");
    try {
      const payload = {
        ...credentialForm,
        configKey: credentialForm.configKey.trim().toUpperCase()
      };
      if (editingCredentialId) {
        await adminApi("/admin/api-credentials/" + editingCredentialId, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setMessage("อัปเดต API Key แล้ว");
      } else {
        await adminApi("/admin/api-credentials", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setMessage("บันทึก API Key แบบเข้ารหัสแล้ว");
      }
      resetCredentialForm();
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึก API Key ไม่สำเร็จ"));
    } finally {
      setSavingCredential(false);
    }
  }

  async function removeLink(item: ServiceLink) {
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
      if (editingLinkId === item.id) resetLinkForm();
      await load();
      setMessage("ลบลิงก์แล้ว");
    } catch (err: any) {
      setError(String(err?.message || "ลบไม่สำเร็จ"));
    }
  }

  async function removeCredential(item: Credential) {
    const confirmed = await confirmPopup({
      title: "ลบ API Key",
      message: `ลบ ${item.label} (${item.config_key})? ระบบจะกลับไปใช้ค่า Server เดิมถ้ามี`,
      confirmLabel: "ลบ Key",
      cancelLabel: "ยกเลิก",
      tone: "warning"
    });
    if (!confirmed) return;

    setError("");
    try {
      await adminApi("/admin/api-credentials/" + item.id, { method: "DELETE" });
      if (editingCredentialId === item.id) resetCredentialForm();
      await load();
      setMessage("ลบ API Key แล้ว");
    } catch (err: any) {
      setError(String(err?.message || "ลบ API Key ไม่สำเร็จ"));
    }
  }

  async function toggleCredential(item: Credential) {
    setError("");
    try {
      await adminApi("/admin/api-credentials/" + item.id + "/active", {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await load();
      setMessage(!item.active ? "เปิดใช้งาน API Key แล้ว" : "ปิดใช้งาน API Key แล้ว");
    } catch (err: any) {
      setError(String(err?.message || "เปลี่ยนสถานะไม่สำเร็จ"));
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
              <h1>API & Service Center</h1>
              <p>
                เก็บ API Key แบบเข้ารหัส พร้อมสถานะการเชื่อมต่อและลิงก์บริการทั้งหมดในหน้าเดียว
              </p>
            </div>
            <span className={s.privateBadge}>PRIVATE · OWNER / ADMIN</span>
          </header>

          <section className={s.connectionGrid}>
            {connections.map(connection => (
              <div className={s.connectionCard} key={connection.key}>
                <div className={s.connectionTop}>
                  <b>{connection.name}</b>
                  <span className={connection.active ? s.activeBadge : s.inactiveBadge}>
                    <i/> {connection.active ? "ACTIVE" : "NOT SET"}
                  </span>
                </div>
                <small>{connection.detail}</small>
              </div>
            ))}
          </section>

          <div className={s.sectionHead}>
            <div>
              <span className={s.kicker}>ENCRYPTED API KEY VAULT</span>
              <h2>API Keys</h2>
            </div>
            <span>{loading ? "LOADING" : `${credentials.length} KEYS`}</span>
          </div>

          <form id="api-vault-editor" className={s.vaultEditor} onSubmit={saveCredential}>
            <div className={s.field}>
              <label>ประเภท</label>
              <select
                value={credentialForm.category}
                onChange={event => {
                  const category = event.target.value;
                  setCredentialForm(current => ({
                    ...current,
                    category,
                    configKey: current.configKey || KEY_EXAMPLES[category] || ""
                  }));
                }}
              >
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS / OTP</option>
                <option value="PAYMENT">Payment</option>
                <option value="AI">AI</option>
                <option value="NEWS">News</option>
                <option value="MARKET_DATA">Market Data / Chart</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className={s.field}>
              <label>ชื่อที่แสดง</label>
              <input
                value={credentialForm.label}
                onChange={event => updateCredentialField("label", event.target.value)}
                placeholder="เช่น Resend API Key"
                maxLength={140}
                required
              />
            </div>

            <div className={s.field}>
              <label>Config Key</label>
              <input
                value={credentialForm.configKey}
                onChange={event => updateCredentialField("configKey", event.target.value.toUpperCase())}
                placeholder={KEY_EXAMPLES[credentialForm.category]}
                spellCheck={false}
                maxLength={96}
                required
              />
            </div>

            <div className={s.field}>
              <label>API Key / Secret</label>
              <input
                type="password"
                value={credentialForm.value}
                onChange={event => updateCredentialField("value", event.target.value)}
                placeholder={editingCredentialId ? "ปล่อยว่างเพื่อใช้คีย์เดิม" : "วาง API Key ที่นี่"}
                autoComplete="new-password"
                required={!editingCredentialId}
              />
            </div>

            <div className={`${s.field} ${s.fieldWide}`}>
              <label>หมายเหตุ</label>
              <input
                value={credentialForm.note}
                onChange={event => updateCredentialField("note", event.target.value)}
                placeholder="เช่น ใช้ส่ง OTP / วิเคราะห์ข่าว / วิเคราะห์กราฟ"
                maxLength={1000}
              />
            </div>

            <label className={s.activeToggle}>
              <input
                type="checkbox"
                checked={credentialForm.active}
                onChange={event => updateCredentialField("active", event.target.checked)}
              />
              เปิดใช้งานทันที
            </label>

            <div className={s.vaultActions}>
              <span>
                คีย์จะถูกเข้ารหัสก่อนเก็บ และระบบจะไม่ส่งคีย์เต็มกลับมาที่หน้าเว็บ
              </span>
              <div>
                {editingCredentialId && (
                  <button type="button" className={s.ghost} onClick={resetCredentialForm} disabled={savingCredential}>
                    ยกเลิก
                  </button>
                )}
                <button type="submit" className={s.primary} disabled={savingCredential}>
                  {savingCredential ? "กำลังบันทึก..." : editingCredentialId ? "บันทึกการแก้ไข" : "+ บันทึก API Key"}
                </button>
              </div>
            </div>
          </form>

          <section className={s.credentialGrid}>
            {credentials.length === 0 && !loading ? (
              <div className={s.empty}>ยังไม่มี API Key ใน Vault · เพิ่มจากช่องด้านบน</div>
            ) : credentials.map(item => (
              <article className={s.credentialCard} key={item.id}>
                <div className={s.cardTop}>
                  <div>
                    <div className={s.miniMeta}>{item.category}</div>
                    <h3>{item.label}</h3>
                  </div>
                  <span className={item.active ? s.activeBadge : s.inactiveBadge}>
                    <i/> {item.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <code className={s.configKey}>{item.config_key}</code>
                <div className={s.masked}>{item.masked_value}</div>
                <p className={s.note}>{item.note || "—"}</p>
                <div className={s.cardActions}>
                  <button className={s.smallButton} type="button" onClick={() => void toggleCredential(item)}>
                    {item.active ? "Disable" : "Activate"}
                  </button>
                  <button className={s.smallButton} type="button" onClick={() => editCredential(item)}>
                    แก้ไข
                  </button>
                  <button className={`${s.smallButton} ${s.smallDanger}`} type="button" onClick={() => void removeCredential(item)}>
                    ลบ
                  </button>
                </div>
              </article>
            ))}
          </section>

          <div className={`${s.message} ${error ? s.messageError : ""}`}>
            {error || message}
          </div>

          <div className={s.sectionHead}>
            <div>
              <span className={s.kicker}>QUICK LINKS</span>
              <h2>Service Links</h2>
            </div>
            <span>{loading ? "LOADING" : `${items.length} LINKS`}</span>
          </div>

          <form id="service-link-editor" className={s.editor} onSubmit={saveLink}>
            <div className={s.field}>
              <label>ชื่อบริการ</label>
              <input value={linkForm.name} onChange={event => updateLinkField("name", event.target.value)} placeholder="เช่น Resend" maxLength={120} required/>
            </div>
            <div className={s.field}>
              <label>เชื่อมต่อทำอะไร</label>
              <input value={linkForm.purpose} onChange={event => updateLinkField("purpose", event.target.value)} placeholder="เช่น Email API" maxLength={220}/>
            </div>
            <div className={s.field}>
              <label>ลิงก์เว็บไซต์</label>
              <input value={linkForm.url} onChange={event => updateLinkField("url", event.target.value)} placeholder="https://..." inputMode="url" required/>
            </div>
            <div className={`${s.field} ${s.fieldWide}`}>
              <label>หมายเหตุ</label>
              <textarea value={linkForm.note} onChange={event => updateLinkField("note", event.target.value)} placeholder="ข้อมูลสั้น ๆ ที่อยากจำ" maxLength={1000}/>
            </div>
            <div className={s.actions}>
              <div className={s.actionLeft}>{editingLinkId ? "กำลังแก้ไขรายการเดิม" : "เพิ่มเว็บใหม่ได้ตลอดเวลา"}</div>
              <div className={s.actionRight}>
                {editingLinkId && <button type="button" className={s.ghost} onClick={resetLinkForm} disabled={savingLink}>ยกเลิก</button>}
                <button type="submit" className={s.primary} disabled={savingLink}>
                  {savingLink ? "กำลังบันทึก..." : editingLinkId ? "บันทึกการแก้ไข" : "+ เพิ่มลิงก์"}
                </button>
              </div>
            </div>
          </form>

          <section className={s.grid}>
            {!loading && items.length === 0 && !error && <div className={s.empty}>ยังไม่มีรายการ · เพิ่มลิงก์ด้านบนได้เลย</div>}
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
                  <a className={s.openButton} href={item.url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                  <button className={s.smallButton} type="button" onClick={() => editLink(item)}>แก้ไข</button>
                  <button className={`${s.smallButton} ${s.smallDanger}`} type="button" onClick={() => void removeLink(item)}>ลบ</button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
