"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  provider: string;
  test_url: string;
  auth_mode: string;
  header_name: string;
  last_test_status: string;
  last_test_detail: string;
  last_tested_at: string | null;
  updated_at: string;
};

type Connection = {
  key: string;
  name: string;
  category: string;
  active: boolean;
  detail: string;
};

type AiAdminSettings = {
  enabled: boolean;
  provider: string;
  model: string;
  dailyMessageLimit: number;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  systemNote: string;
  configured: boolean;
  apiKeyConfigured: boolean;
};

type AiSupportChannelAdmin = {
  id: string;
  channel_type: "LINE" | "FACEBOOK" | "TELEGRAM" | "OTHER";
  label: string;
  url: string;
  enabled: boolean;
  sort_order: number;
};

type PaymentAccount = {
  id: number;
  bankCode: string;
  bankName: string;
  bankShortCode: string;
  bankNumber: string;
  nameTh: string;
  nameEn: string;
  type: string;
};

type PaymentQrMethod = "AUTO" | "PROMPTPAY_NATIONAL_ID" | "PROMPTPAY_PHONE";

type PaymentQrSettings = {
  method: PaymentQrMethod;
  qrType: string;
  promptPayIdMasked: string;
  promptPayIdConfigured: boolean;
  promptPayIdLength: number;
  easySlipConfigured: boolean;
  accounts: PaymentAccount[];
};

type PaymentQrTest = {
  ok: boolean;
  amountSatang: number;
  qrType: string;
  dataUrl: string;
  accounts: PaymentAccount[];
};

type TestResult = {
  ok: boolean;
  status: "PASS" | "LIMITED" | "FAIL";
  provider: string;
  detectedFrom: string;
  detail: string;
  httpStatus?: number;
  testProof?: string | null;
};

type LinkForm = {
  name: string;
  purpose: string;
  url: string;
  note: string;
};

type CredentialForm = {
  preset: string;
  category: string;
  label: string;
  configKey: string;
  value: string;
  companionValue: string;
  note: string;
  active: boolean;
  provider: string;
  testUrl: string;
  authMode: string;
  headerName: string;
};

const EMPTY_LINK: LinkForm = { name: "", purpose: "", url: "", note: "" };
const EMPTY_CREDENTIAL: CredentialForm = {
  preset: "EASYSLIP_API_KEY",
  category: "PAYMENT",
  label: "EasySlip API Key",
  configKey: "EASYSLIP_API_KEY",
  value: "",
  companionValue: "",
  note: "เชื่อม EasySlip สำหรับตรวจสลิปและเปิดสิทธิ์แพ็กเกจอัตโนมัติ",
  active: true,
  provider: "EasySlip",
  testUrl: "",
  authMode: "BEARER",
  headerName: ""
};

const KEY_EXAMPLES: Record<string, string> = {
  EMAIL: "RESEND_API_KEY",
  SMS: "THAIBULKSMS_API_KEY",
  PAYMENT: "EASYSLIP_API_KEY",
  AI: "SCENOVA_AI_API_KEY",
  NEWS: "NEWS_API_KEY",
  MARKET_DATA: "MARKET_DATA_API_KEY",
  OTHER: "SERVICE_API_KEY"
};

const CREDENTIAL_PRESETS = [
  { key: "RESEND_API_KEY", category: "EMAIL", label: "Resend API Key" },
  { key: "EMAIL_FROM", category: "EMAIL", label: "Email Sender / From" },
  { key: "THAIBULKSMS_OTP_KEY", category: "SMS", label: "ThaiBulkSMS OTP Key" },
  { key: "THAIBULKSMS_OTP_SECRET", category: "SMS", label: "ThaiBulkSMS OTP Secret" },
  { key: "THAIBULKSMS_API_KEY", category: "SMS", label: "ThaiBulkSMS API Key" },
  { key: "THAIBULKSMS_API_SECRET", category: "SMS", label: "ThaiBulkSMS API Secret" },
  { key: "THAIBULKSMS_SENDER", category: "SMS", label: "ThaiBulkSMS Sender" },
  { key: "EASYSLIP_API_KEY", category: "PAYMENT", label: "EasySlip API Key" },
  { key: "OMISE_SECRET_KEY", category: "PAYMENT", label: "Opn / Omise Secret Key" },
  { key: "OMISE_WEBHOOK_SECRET", category: "PAYMENT", label: "Opn / Omise Webhook Secret" },
  { key: "SCENOVA_AI_API_KEY", category: "AI", label: "SCENOVA AI · Inception API Key" },
  { key: "OPENAI_API_KEY", category: "AI", label: "OpenAI API Key" },
  { key: "ANTHROPIC_API_KEY", category: "AI", label: "Anthropic API Key" },
  { key: "GEMINI_API_KEY", category: "AI", label: "Gemini API Key" },
  { key: "NEWS_API_KEY", category: "NEWS", label: "NewsAPI Key" },
  { key: "MARKET_DATA_API_KEY", category: "MARKET_DATA", label: "Market Data API Key" }
];

function domainOf(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function companionFor(configKey: string) {
  if (configKey === "THAIBULKSMS_API_KEY") {
    return { key: "THAIBULKSMS_API_SECRET", label: "ThaiBulkSMS API Secret" };
  }
  if (configKey === "THAIBULKSMS_API_SECRET") {
    return { key: "THAIBULKSMS_API_KEY", label: "ThaiBulkSMS API Key" };
  }
  if (configKey === "THAIBULKSMS_OTP_KEY") {
    return { key: "THAIBULKSMS_OTP_SECRET", label: "ThaiBulkSMS OTP Secret" };
  }
  if (configKey === "THAIBULKSMS_OTP_SECRET") {
    return { key: "THAIBULKSMS_OTP_KEY", label: "ThaiBulkSMS OTP Key" };
  }
  return null;
}

function maskBankNumber(value: string) {
  const digits=String(value || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return digits;
  return "•••• " + digits.slice(-4);
}

function formatDate(value: string | null) {
  if (!value) return "ยังไม่เคยทดสอบ";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

export default function AdminServiceLinksPage() {
  const { confirmPopup } = useSystemPopup();

  const [items, setItems] = useState<ServiceLink[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [paymentQr, setPaymentQr] = useState<PaymentQrSettings | null>(null);
  const [paymentQrMethod, setPaymentQrMethod] = useState<PaymentQrMethod>("AUTO");
  const [promptPayId, setPromptPayId] = useState("");
  const [savingPaymentQr, setSavingPaymentQr] = useState(false);
  const [testingPaymentQr, setTestingPaymentQr] = useState(false);
  const [paymentQrTest, setPaymentQrTest] = useState<PaymentQrTest | null>(null);
  const [aiSettings, setAiSettings] = useState<AiAdminSettings | null>(null);
  const [aiContacts, setAiContacts] = useState<AiSupportChannelAdmin[]>([]);
  const [savingAiSettings, setSavingAiSettings] = useState(false);
  const [savingAiContact, setSavingAiContact] = useState("");

  const [linkForm, setLinkForm] = useState<LinkForm>(EMPTY_LINK);
  const [credentialForm, setCredentialForm] = useState<CredentialForm>(EMPTY_CREDENTIAL);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [editingCredentialId, setEditingCredentialId] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingLink, setSavingLink] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [testingCredential, setTestingCredential] = useState(false);
  const [retestingId, setRetestingId] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testedSignature, setTestedSignature] = useState("");
  const [message, setMessage] = useState("กำลังโหลด...");
  const [error, setError] = useState("");

  const companion = useMemo(
    () => companionFor(credentialForm.configKey),
    [credentialForm.configKey]
  );

  const needsCustomTest = credentialForm.preset === "CUSTOM" ||
    credentialForm.configKey === "MARKET_DATA_API_KEY";

  const credentialSignature = useMemo(() => JSON.stringify({
    id: editingCredentialId,
    configKey: credentialForm.configKey.trim().toUpperCase(),
    value: credentialForm.value,
    companionValue: credentialForm.companionValue,
    testUrl: credentialForm.testUrl.trim(),
    authMode: credentialForm.authMode,
    headerName: credentialForm.headerName.trim()
  }), [
    editingCredentialId,
    credentialForm.configKey,
    credentialForm.value,
    credentialForm.companionValue,
    credentialForm.testUrl,
    credentialForm.authMode,
    credentialForm.headerName
  ]);

  const testIsCurrent = Boolean(testResult?.ok && testedSignature === credentialSignature);

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
      const [links, vault, qrSettings, assistantSettings, assistantContacts] = await Promise.all([
        adminApi("/admin/service-links"),
        adminApi("/admin/api-credentials"),
        adminApi("/admin/payment-qr-settings"),
        adminApi("/admin/ai-assistant/settings"),
        adminApi("/admin/ai-assistant/contacts")
      ]);
      setItems(Array.isArray(links?.items) ? links.items : []);
      setCredentials(Array.isArray(vault?.items) ? vault.items : []);
      setConnections(Array.isArray(vault?.connections) ? vault.connections : []);
      setPaymentQr(qrSettings as PaymentQrSettings);
      setPaymentQrMethod((qrSettings?.method || "AUTO") as PaymentQrMethod);
      setAiSettings(assistantSettings as AiAdminSettings);
      setAiContacts(Array.isArray(assistantContacts) ? assistantContacts : []);
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
    setTestResult(null);
    setTestedSignature("");
  }

  function selectPreset(presetKey: string) {
    const preset = CREDENTIAL_PRESETS.find(item => item.key === presetKey);
    setTestResult(null);
    setTestedSignature("");

    if (!preset) {
      setCredentialForm(current => ({
        ...EMPTY_CREDENTIAL,
        active: current.active
      }));
      return;
    }

    setCredentialForm(current => ({
      ...current,
      preset: preset.key,
      category: preset.category,
      label: preset.label,
      configKey: preset.key,
      value: "",
      companionValue: "",
      provider: "",
      testUrl: "",
      authMode: "BEARER",
      headerName: ""
    }));
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
      preset: CREDENTIAL_PRESETS.some(preset => preset.key === item.config_key) ? item.config_key : "CUSTOM",
      category: item.category,
      label: item.label,
      configKey: item.config_key,
      value: "",
      companionValue: "",
      note: item.note,
      active: item.active,
      provider: item.provider || "",
      testUrl: item.test_url || "",
      authMode: item.auth_mode || "BEARER",
      headerName: item.header_name || ""
    });
    setTestResult(null);
    setTestedSignature("");
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

  async function testCredential() {
    if (testingCredential) return;
    setTestingCredential(true);
    setError("");
    try {
      let result: TestResult;
      if (editingCredentialId && !credentialForm.value.trim()) {
        result = await adminApi("/admin/api-credentials/" + editingCredentialId + "/test-saved", {
          method: "POST",
          body: JSON.stringify({
            testUrl: credentialForm.testUrl,
            authMode: credentialForm.authMode,
            headerName: credentialForm.headerName
          })
        });
      } else {
        result = await adminApi("/admin/api-credentials/test", {
          method: "POST",
          body: JSON.stringify({
            configKey: credentialForm.configKey.trim().toUpperCase(),
            category: credentialForm.category,
            value: credentialForm.value,
            companionConfigKey: companion?.key || "",
            companionValue: credentialForm.companionValue,
            testUrl: credentialForm.testUrl,
            authMode: credentialForm.authMode,
            headerName: credentialForm.headerName
          })
        });
      }

      setTestResult(result);
      setTestedSignature(credentialSignature);

      if (result?.provider) {
        setCredentialForm(current => ({
          ...current,
          provider: result.provider,
          label: current.label.trim() || (result.provider + " API Key")
        }));
      }
      setMessage(result.ok ? "Test Connection ผ่านแล้ว" : "Test Connection ไม่ผ่าน");
    } catch (err: any) {
      setTestResult({
        ok: false,
        status: "FAIL",
        provider: credentialForm.provider || "Unknown",
        detectedFrom: "",
        detail: String(err?.message || "ทดสอบ API ไม่สำเร็จ")
      });
      setTestedSignature(credentialSignature);
      setError(String(err?.message || "ทดสอบ API ไม่สำเร็จ"));
    } finally {
      setTestingCredential(false);
    }
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault();
    if (savingCredential || !testIsCurrent || !testResult) return;

    setSavingCredential(true);
    setError("");
    try {
      const payload = {
        ...credentialForm,
        configKey: credentialForm.configKey.trim().toUpperCase(),
        provider: testResult.provider || credentialForm.provider,
        lastTestStatus: testResult.status,
        lastTestDetail: testResult.detail,
        testProof: testResult.testProof || ""
      };

      if (editingCredentialId) {
        await adminApi("/admin/api-credentials/" + editingCredentialId, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await adminApi("/admin/api-credentials", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      if (companion && credentialForm.companionValue.trim()) {
        await adminApi("/admin/api-credentials", {
          method: "POST",
          body: JSON.stringify({
            configKey: companion.key,
            category: "SMS",
            label: companion.label,
            value: credentialForm.companionValue,
            note: "Paired credential saved from connection test",
            active: credentialForm.active,
            provider: testResult.provider || "ThaiBulkSMS",
            lastTestStatus: testResult.status,
            lastTestDetail: testResult.detail,
            testProof: testResult.testProof || ""
          })
        });
      }

      setMessage(editingCredentialId ? "อัปเดต API Key แล้ว" : "Test ผ่านและบันทึก API Key แล้ว");
      resetCredentialForm();
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึก API Key ไม่สำเร็จ"));
    } finally {
      setSavingCredential(false);
    }
  }

  async function retestStored(item: Credential) {
    if (retestingId) return;
    setRetestingId(item.id);
    setError("");
    try {
      const result: TestResult = await adminApi("/admin/api-credentials/" + item.id + "/test-saved", {
        method: "POST",
        body: JSON.stringify({
          testUrl: item.test_url,
          authMode: item.auth_mode,
          headerName: item.header_name
        })
      });
      setMessage(`${item.label}: ${result.status} · ${result.detail}`);
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Re-test ไม่สำเร็จ"));
    } finally {
      setRetestingId("");
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

  async function savePaymentQrSettings() {
    if (savingPaymentQr) return;
    setSavingPaymentQr(true);
    setError("");
    try {
      const result = await adminApi("/admin/payment-qr-settings", {
        method: "POST",
        body: JSON.stringify({
          method: paymentQrMethod,
          promptPayId
        })
      });
      setPaymentQr(result as PaymentQrSettings);
      setPaymentQrMethod((result?.method || paymentQrMethod) as PaymentQrMethod);
      setPromptPayId("");
      setPaymentQrTest(null);
      setMessage(
        paymentQrMethod === "PROMPTPAY_NATIONAL_ID"
          ? "บันทึก PromptPay เลขบัตรประชาชนเป็น QR หลักแล้ว"
          : paymentQrMethod === "PROMPTPAY_PHONE"
            ? "บันทึก PromptPay เบอร์โทรเป็น QR หลักแล้ว"
            : "ตั้ง Merchant QR อัตโนมัติเป็น QR หลักแล้ว"
      );
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึก Payment QR ไม่สำเร็จ"));
    } finally {
      setSavingPaymentQr(false);
    }
  }

  async function testPaymentQrSettings() {
    if (testingPaymentQr) return;
    setTestingPaymentQr(true);
    setError("");
    try {
      const result = await adminApi("/admin/payment-qr-settings/test-qr", {
        method: "POST",
        body: JSON.stringify({})
      });
      setPaymentQrTest(result as PaymentQrTest);
      setMessage("สร้าง QR ทดสอบ ฿1 จากค่าที่บันทึกแล้ว");
    } catch (err: any) {
      setPaymentQrTest(null);
      setError(String(err?.message || "สร้าง QR ทดสอบไม่สำเร็จ"));
    } finally {
      setTestingPaymentQr(false);
    }
  }

  function downloadPaymentQrTest() {
    const dataUrl = String(paymentQrTest?.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "SCENOVA-PromptPay-Test-QR.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function saveAiAssistantSettings() {
    if (!aiSettings || savingAiSettings) return;
    setSavingAiSettings(true);
    setError("");
    try {
      const result = await adminApi("/admin/ai-assistant/settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: aiSettings.enabled,
          provider: aiSettings.provider,
          model: aiSettings.model,
          dailyMessageLimit: aiSettings.dailyMessageLimit,
          maxHistoryMessages: aiSettings.maxHistoryMessages,
          maxOutputTokens: aiSettings.maxOutputTokens,
          systemNote: aiSettings.systemNote
        })
      });
      setAiSettings(current => current ? { ...current, ...result } : result as AiAdminSettings);
      setMessage("บันทึกการตั้งค่า SCENOVA AI แล้ว");
      await load();
    } catch (err: any) {
      setError(String(err?.message || "บันทึกการตั้งค่า SCENOVA AI ไม่สำเร็จ"));
    } finally {
      setSavingAiSettings(false);
    }
  }

  async function saveAiContact(item: AiSupportChannelAdmin) {
    if (savingAiContact) return;
    setSavingAiContact(item.channel_type);
    setError("");
    try {
      const result = await adminApi("/admin/ai-assistant/contacts", {
        method: "PUT",
        body: JSON.stringify({
          type: item.channel_type,
          label: item.label,
          url: item.url,
          enabled: item.enabled,
          sortOrder: item.sort_order
        })
      });
      setAiContacts(Array.isArray(result) ? result as AiSupportChannelAdmin[] : aiContacts);
      setMessage("บันทึกช่องทาง " + item.label + " แล้ว");
    } catch (err: any) {
      setError(String(err?.message || "บันทึกช่องทางติดต่อไม่สำเร็จ"));
    } finally {
      setSavingAiContact("");
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
              <p>Test API ภายนอกก่อนบันทึก เก็บ Key แบบเข้ารหัส และดูสถานะบริการทั้งหมดในหน้าเดียว</p>
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
              <span className={s.kicker}>SCENOVA AI / SUPPORT</span>
              <h2>AI Assistant Settings</h2>
            </div>
            <span>
              {aiSettings?.configured
                ? "INCEPTION CONNECTED"
                : aiSettings?.apiKeyConfigured
                  ? "KEY SET · CHECK PROVIDER"
                  : "API KEY NOT SET"}
            </span>
          </div>

          {aiSettings ? (
            <>
              <section className={s.editor}>
                <div className={s.field}>
                  <label>Provider</label>
                  <input value={aiSettings.provider} readOnly/>
                </div>
                <div className={s.field}>
                  <label>Model</label>
                  <input
                    value={aiSettings.model}
                    onChange={event => setAiSettings(current => current ? { ...current, model: event.target.value } : current)}
                    placeholder="mercury-2.5"
                    maxLength={120}
                  />
                </div>
                <label className={s.activeToggle}>
                  <input
                    type="checkbox"
                    checked={aiSettings.enabled}
                    onChange={event => setAiSettings(current => current ? { ...current, enabled: event.target.checked } : current)}
                  />
                  เปิดใช้งาน SCENOVA AI
                </label>

                <div className={s.field}>
                  <label>ข้อความ / User / วัน</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={aiSettings.dailyMessageLimit}
                    onChange={event => setAiSettings(current => current ? {
                      ...current,
                      dailyMessageLimit: Math.max(1, Math.min(1000, Number(event.target.value || 1)))
                    } : current)}
                  />
                </div>
                <div className={s.field}>
                  <label>Conversation History</label>
                  <input
                    type="number"
                    min={2}
                    max={40}
                    value={aiSettings.maxHistoryMessages}
                    onChange={event => setAiSettings(current => current ? {
                      ...current,
                      maxHistoryMessages: Math.max(2, Math.min(40, Number(event.target.value || 2)))
                    } : current)}
                  />
                </div>
                <div className={s.field}>
                  <label>Max Output Tokens</label>
                  <input
                    type="number"
                    min={128}
                    max={4000}
                    value={aiSettings.maxOutputTokens}
                    onChange={event => setAiSettings(current => current ? {
                      ...current,
                      maxOutputTokens: Math.max(128, Math.min(4000, Number(event.target.value || 128)))
                    } : current)}
                  />
                </div>

                <div className={`${s.field} ${s.fieldWide}`}>
                  <label>System Note เพิ่มเติม</label>
                  <textarea
                    value={aiSettings.systemNote}
                    onChange={event => setAiSettings(current => current ? { ...current, systemNote: event.target.value } : current)}
                    placeholder="เว้นว่างได้ · ใช้เพิ่มกฎหรือข้อมูลภายในที่ต้องการให้ AI รู้"
                    maxLength={6000}
                  />
                </div>

                <div className={s.actions}>
                  <div className={s.actionLeft}>
                    Provider หลัก: Inception Labs · API Key จัดการใน API Key Vault ด้านล่าง
                  </div>
                  <div className={s.actionRight}>
                    <button
                      type="button"
                      className={s.primary}
                      disabled={savingAiSettings || !aiSettings.model.trim()}
                      onClick={() => void saveAiAssistantSettings()}
                    >
                      {savingAiSettings ? "กำลังบันทึก..." : "บันทึก AI Settings"}
                    </button>
                  </div>
                </div>
              </section>

              <div className={s.listHead}>
                <div>
                  <h2>ช่องทางติดต่อผู้พัฒนา</h2>
                  <span>จะแสดงในหน้าต่าง SCENOVA AI เฉพาะช่องที่เปิดใช้งานและมี URL</span>
                </div>
              </div>

              <section className={s.grid}>
                {aiContacts.map((contact, index) => (
                  <article className={s.card} key={contact.id || contact.channel_type}>
                    <div className={s.cardTop}>
                      <div>
                        <h3>{contact.channel_type === "FACEBOOK" ? "Facebook" : contact.channel_type === "TELEGRAM" ? "Telegram" : contact.channel_type}</h3>
                        <p className={s.purpose}>Developer Contact</p>
                      </div>
                      <span className={contact.enabled && contact.url.trim() ? s.activeBadge : s.inactiveBadge}>
                        <i/> {contact.enabled && contact.url.trim() ? "ACTIVE" : "OFF"}
                      </span>
                    </div>

                    <div className={s.field} style={{ marginTop: 12 }}>
                      <label>ลิงก์</label>
                      <input
                        value={contact.url}
                        placeholder={
                          contact.channel_type === "LINE"
                            ? "https://line.me/..."
                            : contact.channel_type === "FACEBOOK"
                              ? "https://m.me/..."
                              : "https://t.me/..."
                        }
                        inputMode="url"
                        onChange={event => setAiContacts(current => current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, url: event.target.value } : item
                        ))}
                      />
                    </div>

                    <label className={s.activeToggle}>
                      <input
                        type="checkbox"
                        checked={contact.enabled}
                        onChange={event => setAiContacts(current => current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, enabled: event.target.checked } : item
                        ))}
                      />
                      แสดงใน AI Widget
                    </label>

                    <div className={s.cardActions}>
                      <button
                        type="button"
                        className={s.smallButton}
                        disabled={savingAiContact === contact.channel_type || (contact.enabled && !contact.url.trim())}
                        onClick={() => void saveAiContact(contact)}
                      >
                        {savingAiContact === contact.channel_type ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            </>
          ) : null}

          <div className={s.sectionHead}>
            <div>
              <span className={s.kicker}>PAYMENT / PROMPTPAY</span>
              <h2>Payment QR Settings</h2>
            </div>
            <span>{paymentQr?.easySlipConfigured ? "EASYSLIP CONNECTED" : "EASYSLIP NOT SET"}</span>
          </div>

          <section className={s.paymentQrPanel}>
            <div className={s.paymentAccountCard}>
              <span className={s.paymentLabel}>บัญชีรับเงินที่ EasySlip ตรวจสอบ</span>
              {paymentQr?.accounts?.[0] ? (
                <>
                  <b>{paymentQr.accounts[0].nameTh || paymentQr.accounts[0].nameEn || "SCENOVA"}</b>
                  <strong>{paymentQr.accounts[0].bankName || paymentQr.accounts[0].bankShortCode || "Bank"}</strong>
                  <code>{maskBankNumber(paymentQr.accounts[0].bankNumber)}</code>
                  <small>สลิปจะต้อง Match กับบัญชีนี้ก่อนระบบเปิดสิทธิ์</small>
                </>
              ) : (
                <>
                  <b>ยังไม่พบบัญชีรับเงิน</b>
                  <small>เชื่อม EasySlip API และเพิ่มบัญชีธนาคารใน EasySlip ก่อน</small>
                </>
              )}
            </div>

            <div className={s.paymentQrForm}>
              <div className={s.paymentQrFields}>
                <div className={s.field}>
                  <label>QR หลัก</label>
                  <select
                    value={paymentQrMethod}
                    onChange={event => {
                      setPaymentQrMethod(event.target.value as PaymentQrMethod);
                      setPromptPayId("");
                      setPaymentQrTest(null);
                    }}
                  >
                    <option value="AUTO">Merchant QR อัตโนมัติ</option>
                    <option value="PROMPTPAY_NATIONAL_ID">PromptPay · เลขบัตรประชาชน 13 หลัก</option>
                    <option value="PROMPTPAY_PHONE">PromptPay · เบอร์โทร 10 หลัก</option>
                  </select>
                </div>

                {paymentQrMethod !== "AUTO" && (
                  <div className={s.field}>
                    <label>{paymentQrMethod === "PROMPTPAY_NATIONAL_ID" ? "เลขบัตรประชาชน" : "เบอร์โทร PromptPay"}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={promptPayId}
                      maxLength={paymentQrMethod === "PROMPTPAY_NATIONAL_ID" ? 13 : 10}
                      onChange={event => {
                        const max = paymentQrMethod === "PROMPTPAY_NATIONAL_ID" ? 13 : 10;
                        setPromptPayId(event.target.value.replace(/\D/g, "").slice(0, max));
                        setPaymentQrTest(null);
                      }}
                      placeholder={
                        paymentQr?.promptPayIdConfigured
                          ? "ใช้ค่าเดิม " + paymentQr.promptPayIdMasked + " หรือกรอกใหม่"
                          : paymentQrMethod === "PROMPTPAY_NATIONAL_ID"
                            ? "กรอกเลขบัตร 13 หลัก"
                            : "กรอกเบอร์มือถือ 10 หลัก"
                      }
                    />
                  </div>
                )}
              </div>

              <div className={s.paymentQrHint}>
                {paymentQrMethod === "PROMPTPAY_NATIONAL_ID" ? (
                  <>
                    <b>PromptPay เลขบัตรประชาชน</b>
                    <span>ระบบจะสร้าง QR ด้วย National ID และเก็บเลขเต็มแบบเข้ารหัส ไม่แสดงเลขเต็มกลับมาหลังบันทึก</span>
                  </>
                ) : paymentQrMethod === "PROMPTPAY_PHONE" ? (
                  <>
                    <b>PromptPay เบอร์โทร</b>
                    <span>เงินจะเข้าบัญชีที่ผูก PromptPay กับเบอร์นี้ และสลิปยังต้องตรงกับบัญชี EasySlip ด้านซ้าย</span>
                  </>
                ) : (
                  <>
                    <b>Merchant QR อัตโนมัติ</b>
                    <span>ระบบเลือก QR ตามธนาคารที่ EasySlip ส่งกลับมา เช่น KTB จะใช้ถุงเงิน</span>
                  </>
                )}
              </div>

              <div className={s.paymentQrActions}>
                <button
                  type="button"
                  className={s.primary}
                  disabled={savingPaymentQr || !paymentQr?.easySlipConfigured}
                  onClick={() => void savePaymentQrSettings()}
                >
                  {savingPaymentQr ? "กำลังบันทึก..." : "บันทึกเป็น QR หลัก"}
                </button>
                <button
                  type="button"
                  className={s.ghost}
                  disabled={testingPaymentQr || !paymentQr?.easySlipConfigured}
                  onClick={() => void testPaymentQrSettings()}
                >
                  {testingPaymentQr ? "กำลังสร้าง..." : "สร้าง QR ทดสอบ ฿1"}
                </button>
                <span>
                  ปัจจุบัน: {paymentQr?.method === "PROMPTPAY_NATIONAL_ID"
                    ? "PromptPay เลขบัตร"
                    : paymentQr?.method === "PROMPTPAY_PHONE"
                      ? "PromptPay เบอร์โทร"
                      : "Merchant / Auto"}
                  {paymentQr?.promptPayIdConfigured && paymentQr?.method !== "AUTO"
                    ? " · " + paymentQr.promptPayIdMasked
                    : ""}
                </span>
              </div>
            </div>

            {paymentQrTest?.dataUrl ? (
              <div className={s.paymentQrTest}>
                <div className={s.paymentQrImage}>
                  <img src={paymentQrTest.dataUrl} alt="QR ทดสอบ PromptPay ฿1"/>
                </div>
                <div>
                  <span>QR TEST · ฿1.00</span>
                  <b>{paymentQrTest.accounts?.[0]?.nameTh || paymentQrTest.accounts?.[0]?.nameEn || "ตรวจชื่อผู้รับในแอปธนาคาร"}</b>
                  <small>
                    {paymentQrTest.accounts?.[0]?.bankName || paymentQrTest.accounts?.[0]?.bankShortCode || "EasySlip account"}
                    {paymentQrTest.accounts?.[0]?.bankNumber ? " · " + maskBankNumber(paymentQrTest.accounts[0].bankNumber) : ""}
                  </small>
                  <p>ดาวน์โหลด QR แล้วเปิด Mobile Banking → สแกนจากรูป เพื่อเช็กชื่อผู้รับก่อนใช้งานจริง</p>
                  <button type="button" className={s.testButton} onClick={downloadPaymentQrTest}>ดาวน์โหลด QR ทดสอบ</button>
                </div>
              </div>
            ) : null}
          </section>

          <div className={s.sectionHead}>
            <div>
              <span className={s.kicker}>TEST BEFORE SAVE</span>
              <h2>API Key Vault</h2>
            </div>
            <span>{loading ? "LOADING" : `${credentials.length} KEYS`}</span>
          </div>

          <form id="api-vault-editor" className={s.vaultEditor} onSubmit={saveCredential}>
            <div className={s.field}>
              <label>เลือกบริการ / คีย์</label>
              <select
                value={credentialForm.preset}
                disabled={Boolean(editingCredentialId)}
                onChange={event => selectPreset(event.target.value)}
              >
                <option value="CUSTOM">Custom / API อื่น</option>
                <optgroup label="Email">
                  {CREDENTIAL_PRESETS.filter(item => item.category === "EMAIL").map(item => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
                <optgroup label="SMS / OTP">
                  {CREDENTIAL_PRESETS.filter(item => item.category === "SMS").map(item => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Payment">
                  {CREDENTIAL_PRESETS.filter(item => item.category === "PAYMENT").map(item => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
                <optgroup label="AI / News / Market">
                  {CREDENTIAL_PRESETS.filter(item => ["AI","NEWS","MARKET_DATA"].includes(item.category)).map(item => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className={s.field}>
              <label>ประเภท</label>
              <select
                value={credentialForm.category}
                onChange={event => {
                  const category = event.target.value;
                  setCredentialForm(current => ({
                    ...current,
                    preset: "CUSTOM",
                    category,
                    configKey: current.configKey || KEY_EXAMPLES[category] || ""
                  }));
                }}
                disabled={credentialForm.preset !== "CUSTOM" || Boolean(editingCredentialId)}
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
                placeholder="Custom จะเติมชื่อให้หลัง Test ได้"
                readOnly={credentialForm.preset !== "CUSTOM"}
                maxLength={140}
              />
            </div>

            <div className={s.field}>
              <label>Config Key</label>
              <input
                value={credentialForm.configKey}
                onChange={event => updateCredentialField("configKey", event.target.value.toUpperCase())}
                placeholder={KEY_EXAMPLES[credentialForm.category]}
                readOnly={credentialForm.preset !== "CUSTOM" || Boolean(editingCredentialId)}
                spellCheck={false}
                maxLength={96}
                required
              />
            </div>

            <div className={s.field}>
              <label>{editingCredentialId ? "API Key ใหม่ (ไม่ใส่ = ใช้เดิม)" : "API Key / Secret"}</label>
              <input
                type="password"
                value={credentialForm.value}
                onChange={event => updateCredentialField("value", event.target.value)}
                placeholder={editingCredentialId ? "ปล่อยว่างเพื่อ Test คีย์เดิม" : "วาง API Key ที่นี่"}
                autoComplete="new-password"
                required={!editingCredentialId}
              />
            </div>

            {companion && (
              <div className={s.field}>
                <label>{companion.label} {editingCredentialId ? "(ถ้าต้องการเปลี่ยน)" : "(กรอกพร้อมกันได้)"}</label>
                <input
                  type="password"
                  value={credentialForm.companionValue}
                  onChange={event => updateCredentialField("companionValue", event.target.value)}
                  placeholder="ถ้ามีอยู่ในระบบแล้วปล่อยว่างได้"
                  autoComplete="new-password"
                />
              </div>
            )}

            {needsCustomTest && (
              <>
                <div className={`${s.field} ${s.fieldWide}`}>
                  <label>Custom Test URL</label>
                  <input
                    value={credentialForm.testUrl}
                    onChange={event => updateCredentialField("testUrl", event.target.value)}
                    placeholder="https://api.provider.com/v1/..."
                    inputMode="url"
                  />
                </div>
                <div className={s.field}>
                  <label>ส่ง Key แบบไหน</label>
                  <select
                    value={credentialForm.authMode}
                    onChange={event => updateCredentialField("authMode", event.target.value)}
                  >
                    <option value="BEARER">Authorization: Bearer</option>
                    <option value="X_API_KEY">X-Api-Key</option>
                    <option value="CUSTOM_HEADER">Custom Header</option>
                  </select>
                </div>
                {credentialForm.authMode === "CUSTOM_HEADER" && (
                  <div className={s.field}>
                    <label>ชื่อ Header</label>
                    <input
                      value={credentialForm.headerName}
                      onChange={event => updateCredentialField("headerName", event.target.value)}
                      placeholder="X-My-Api-Key"
                      maxLength={80}
                    />
                  </div>
                )}
              </>
            )}

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
              เปิดใช้งานหลังบันทึก
            </label>

            <div className={s.testStrip}>
              <div>
                {testResult ? (
                  <>
                    <span className={
                      testResult.status === "PASS"
                        ? s.testPass
                        : testResult.status === "LIMITED"
                          ? s.testLimited
                          : s.testFail
                    }>
                      <i/> {testResult.status}
                    </span>
                    <b>{testResult.provider}</b>
                    <small>{testResult.detail}{testResult.detectedFrom ? " · จาก " + testResult.detectedFrom : ""}</small>
                    {testedSignature !== credentialSignature && (
                      <small className={s.changedHint}>ข้อมูลเปลี่ยนแล้ว · กรุณา Test ใหม่</small>
                    )}
                  </>
                ) : (
                  <>
                    <b>ยังไม่ได้ Test</b>
                    <small>ต้อง Test Connection ผ่านก่อนจึงจะบันทึกได้</small>
                  </>
                )}
              </div>
              <button
                type="button"
                className={s.testButton}
                disabled={testingCredential || (!editingCredentialId && !credentialForm.value.trim())}
                onClick={() => void testCredential()}
              >
                {testingCredential ? "Testing..." : editingCredentialId && !credentialForm.value.trim() ? "Test Stored Key" : "Test Connection"}
              </button>
            </div>

            <div className={s.vaultActions}>
              <span>Key ถูกส่งจาก Browser ไป Server เพื่อทดสอบและเข้ารหัสเท่านั้น ระบบไม่ส่ง Key เต็มกลับมาหลังบันทึก</span>
              <div>
                {editingCredentialId && (
                  <button type="button" className={s.ghost} onClick={resetCredentialForm} disabled={savingCredential}>
                    ยกเลิก
                  </button>
                )}
                <button
                  type="submit"
                  className={s.primary}
                  disabled={savingCredential || !testIsCurrent || !credentialForm.label.trim()}
                >
                  {savingCredential ? "กำลังบันทึก..." : testIsCurrent ? "✓ บันทึก API Key" : "Test ก่อนบันทึก"}
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
                    <div className={s.miniMeta}>{item.category}{item.provider ? " · " + item.provider : ""}</div>
                    <h3>{item.label}</h3>
                  </div>
                  <span className={item.active ? s.activeBadge : s.inactiveBadge}>
                    <i/> {item.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                <code className={s.configKey}>{item.config_key}</code>
                <div className={s.masked}>{item.masked_value}</div>

                <div className={s.savedTest}>
                  <span className={
                    item.last_test_status === "PASS"
                      ? s.testPass
                      : item.last_test_status === "LIMITED"
                        ? s.testLimited
                        : item.last_test_status === "FAIL"
                          ? s.testFail
                          : s.testUnknown
                  }>
                    <i/> {item.last_test_status || "NOT TESTED"}
                  </span>
                  <small>{formatDate(item.last_tested_at)}</small>
                </div>

                {item.test_url && <span className={s.testHost}>Test: {domainOf(item.test_url)}</span>}
                <p className={s.note}>{item.last_test_detail || item.note || "—"}</p>

                <div className={s.cardActions}>
                  <button
                    className={s.smallButton}
                    type="button"
                    disabled={retestingId === item.id}
                    onClick={() => void retestStored(item)}
                  >
                    {retestingId === item.id ? "Testing..." : "Re-test"}
                  </button>
                  <button className={s.smallButton} type="button" onClick={() => void toggleCredential(item)}>
                    {item.active ? "Disable" : "Activate"}
                  </button>
                  <button className={s.smallButton} type="button" onClick={() => editCredential(item)}>แก้ไข</button>
                  <button className={`${s.smallButton} ${s.smallDanger}`} type="button" onClick={() => void removeCredential(item)}>ลบ</button>
                </div>
              </article>
            ))}
          </section>

          <div className={`${s.message} ${error ? s.messageError : ""}`}>{error || message}</div>

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
