import { Injectable } from "@nestjs/common";
import { lookup } from "dns/promises";
import { isIP } from "net";

type TestInput = {
  configKey?: string;
  category?: string;
  value?: string;
  companionConfigKey?: string;
  companionValue?: string;
  testUrl?: string;
  authMode?: string;
  headerName?: string;
};

type TestResult = {
  ok: boolean;
  status: "PASS" | "LIMITED" | "FAIL";
  provider: string;
  detectedFrom: string;
  detail: string;
  httpStatus?: number;
};

@Injectable()
export class ApiCredentialTesterService {
  private env(
    key: string,
    candidateKey: string,
    candidateValue: string,
    companionKey: string,
    companionValue: string
  ) {
    if (candidateKey === key) return candidateValue;
    if (companionKey === key && companionValue) return companionValue;
    return String(process.env[key] || "").trim();
  }

  private infer(configKey: string, value: string, testUrl: string) {
    const key = configKey.toUpperCase();
    const url = testUrl.toLowerCase();

    if (key === "SCENOVA_AI_API_KEY" || url.includes("api.inceptionlabs.ai")) {
      return { provider: "Inception Labs", from: key === "SCENOVA_AI_API_KEY" ? "config key" : "URL" };
    }
    if (key.includes("ANTHROPIC") || /^sk-ant-/i.test(value) || url.includes("api.anthropic.com")) {
      return { provider: "Anthropic", from: key.includes("ANTHROPIC") ? "config key" : url ? "URL / key pattern" : "key pattern" };
    }
    if (key.includes("OPENAI") || /^sk-(?:proj-|svcacct-)/i.test(value) || url.includes("api.openai.com")) {
      return { provider: "OpenAI", from: key.includes("OPENAI") ? "config key" : url ? "URL / key pattern" : "key pattern" };
    }
    if (key.includes("GEMINI") || /^AIza[0-9A-Za-z_-]+$/.test(value) || url.includes("generativelanguage.googleapis.com")) {
      return { provider: "Google Gemini", from: key.includes("GEMINI") ? "config key" : url ? "URL / key pattern" : "key pattern" };
    }
    if (key.includes("RESEND") || /^re_[A-Za-z0-9_-]+$/.test(value) || url.includes("api.resend.com")) {
      return { provider: "Resend", from: key.includes("RESEND") ? "config key" : url ? "URL / key pattern" : "key pattern" };
    }
    if (key.includes("EASYSLIP") || url.includes("api.easyslip.com")) {
      return { provider: "EasySlip", from: key.includes("EASYSLIP") ? "config key" : "URL" };
    }
    if (key.includes("OMISE") || /^skey_(?:test|live)_/i.test(value) || url.includes("api.omise.co")) {
      return { provider: "Opn / Omise", from: key.includes("OMISE") ? "config key" : url ? "URL / key pattern" : "key pattern" };
    }
    if (key.includes("THAIBULKSMS") || url.includes("thaibulksms.com")) {
      return { provider: "ThaiBulkSMS", from: key.includes("THAIBULKSMS") ? "config key" : "URL" };
    }
    if (key.includes("NEWS") || url.includes("newsapi.org")) {
      return { provider: url.includes("newsapi.org") ? "NewsAPI" : "News Provider", from: url.includes("newsapi.org") ? "URL" : "config key" };
    }

    if (testUrl) {
      try {
        const host = new URL(testUrl).hostname.replace(/^api\./i, "").replace(/^www\./i, "");
        const brand = host.split(".")[0] || "Custom API";
        return { provider: brand.charAt(0).toUpperCase() + brand.slice(1), from: "URL hostname" };
      } catch {}
    }
    return { provider: "Custom API", from: "manual / unknown" };
  }

  private privateIp(address: string) {
    const v = isIP(address);
    if (v === 4) {
      const p = address.split(".").map(Number);
      return p[0] === 10 ||
        p[0] === 127 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        p[0] === 0;
    }
    if (v === 6) {
      const a = address.toLowerCase();
      return a === "::1" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd");
    }
    return true;
  }

  private async assertPublicHttps(rawUrl: string) {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error("Test URL ไม่ถูกต้อง");
    }
    if (url.protocol !== "https:") throw new Error("Custom Test URL ต้องเป็น https:// เท่านั้น");
    if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) {
      throw new Error("ไม่อนุญาต localhost/private network");
    }
    const records = await lookup(url.hostname, { all: true });
    if (!records.length || records.some(record => this.privateIp(record.address))) {
      throw new Error("ไม่อนุญาต private/internal network");
    }
    return url;
  }

  private async request(url: string, init: RequestInit) {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text().catch(() => "");
    return { response, text: text.slice(0, 800) };
  }

  private result(
    ok: boolean,
    status: TestResult["status"],
    provider: string,
    detectedFrom: string,
    detail: string,
    httpStatus?: number
  ): TestResult {
    return { ok, status, provider, detectedFrom, detail, httpStatus };
  }

  async test(input: TestInput): Promise<TestResult> {
    const configKey = String(input.configKey || "").trim().toUpperCase();
    const value = String(input.value || "").trim();
    const companionKey = String(input.companionConfigKey || "").trim().toUpperCase();
    const companionValue = String(input.companionValue || "").trim();
    const testUrl = String(input.testUrl || "").trim();
    if (!value) throw new Error("กรุณาวาง API Key / Secret ก่อนทดสอบ");

    const inferred = this.infer(configKey, value, testUrl);

    if (configKey === "SCENOVA_AI_API_KEY" || inferred.provider === "Inception Labs") {
      const { response, text } = await this.request("https://api.inceptionlabs.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + value,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mercury-2.5",
          messages: [{ role: "user", content: "Reply with OK only." }],
          max_tokens: 256,
          temperature: 0,
          reasoning_effort: "low",
          stream: false
        })
      });
      let hasContent = false;
      if (response.ok && text) {
        try {
          const data: any = JSON.parse(text);
          const content = data?.choices?.[0]?.message?.content;
          hasContent = (typeof content === "string" && content.trim().length > 0) ||
            (Array.isArray(content) && content.length > 0) ||
            (typeof data?.choices?.[0]?.text === "string" && data.choices[0].text.trim().length > 0);
        } catch {}
      }
      const ok = response.ok && hasContent;
      return this.result(
        ok,
        ok ? "PASS" : "FAIL",
        "Inception Labs",
        "preset/config key",
        ok
          ? "Inception Mercury API ตอบข้อความสำเร็จ"
          : response.ok
            ? "Inception ตอบ HTTP 200 แต่ไม่มีข้อความใน completion"
            : `Inception ปฏิเสธคีย์ (HTTP ${response.status})`,
        response.status
      );
    }

    if (configKey === "OPENAI_API_KEY" || inferred.provider === "OpenAI") {
      const { response } = await this.request("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: "Bearer " + value, Accept: "application/json" }
      });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "OpenAI", "preset/config key",
        response.ok ? "OpenAI API ตอบสำเร็จ" : `OpenAI ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "ANTHROPIC_API_KEY" || inferred.provider === "Anthropic") {
      const { response } = await this.request("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": value,
          "anthropic-version": "2023-06-01",
          Accept: "application/json"
        }
      });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "Anthropic", "preset/config key",
        response.ok ? "Anthropic API ตอบสำเร็จ" : `Anthropic ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "GEMINI_API_KEY" || inferred.provider === "Google Gemini") {
      const url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=" + encodeURIComponent(value);
      const { response } = await this.request(url, { method: "GET", headers: { Accept: "application/json" } });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "Google Gemini", "preset/config key",
        response.ok ? "Gemini API ตอบสำเร็จ" : `Gemini ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "NEWS_API_KEY") {
      const { response } = await this.request("https://newsapi.org/v2/top-headlines/sources", {
        method: "GET",
        headers: { "X-Api-Key": value, Accept: "application/json" }
      });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "NewsAPI", "preset/config key",
        response.ok ? "NewsAPI ตอบสำเร็จ" : `NewsAPI ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "EMAIL_FROM") {
      const apiKey = String(process.env.RESEND_API_KEY || "").trim();
      if (!apiKey) {
        return this.result(false, "FAIL", "Resend", "preset/config key", "ต้องมี Resend API Key ก่อนจึงจะตรวจ Email Sender ได้");
      }
      const email = value.toLowerCase();
      const at = email.lastIndexOf("@");
      if (at <= 0 || at === email.length - 1) {
        return this.result(false, "FAIL", "Resend", "preset/config key", "รูปแบบ Email Sender ไม่ถูกต้อง");
      }
      const senderDomain = email.slice(at + 1);
      const { response, text } = await this.request("https://api.resend.com/domains", {
        method: "GET",
        headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
      });
      if (response.status === 403) {
        return this.result(true, "LIMITED", "Resend", "preset/config key",
          "Resend ตอบกลับ แต่ API Key ไม่มีสิทธิ์อ่าน Domains จึงตรวจได้เพียงการเชื่อมต่อ", response.status);
      }
      if (!response.ok) {
        return this.result(false, "FAIL", "Resend", "preset/config key",
          `Resend ปฏิเสธการตรวจ Sender (HTTP ${response.status})`, response.status);
      }
      try {
        const payload = JSON.parse(text);
        const domains = Array.isArray(payload?.data) ? payload.data : [];
        const matched = domains.some((domain: any) =>
          String(domain?.name || "").toLowerCase() === senderDomain &&
          String(domain?.status || "").toLowerCase() === "verified"
        );
        return this.result(matched, matched ? "PASS" : "FAIL", "Resend", "preset/config key",
          matched ? `Domain ${senderDomain} verified บน Resend` : `ไม่พบ verified domain ${senderDomain} บน Resend`, response.status);
      } catch {
        return this.result(true, "LIMITED", "Resend", "preset/config key",
          "Resend ตอบสำเร็จ แต่ไม่สามารถอ่านสถานะ Domain จาก response ได้", response.status);
      }
    }

    if (configKey === "RESEND_API_KEY" || inferred.provider === "Resend") {
      const { response } = await this.request("https://api.resend.com/domains", {
        method: "GET",
        headers: { Authorization: "Bearer " + value, Accept: "application/json" }
      });
      if (response.ok) {
        return this.result(true, "PASS", "Resend", "preset/config key", "Resend API ตอบสำเร็จ", response.status);
      }
      if (response.status === 403) {
        return this.result(true, "LIMITED", "Resend", "preset/config key",
          "คีย์ตอบกลับจาก Resend แต่สิทธิ์ไม่อนุญาต endpoint ทดสอบนี้", response.status);
      }
      return this.result(false, "FAIL", "Resend", "preset/config key",
        `Resend ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "EASYSLIP_API_KEY" || inferred.provider === "EasySlip") {
      const { response, text } = await this.request("https://api.easyslip.com/v2/bank-accounts?limit=1", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + value,
          Accept: "application/json"
        }
      });
      let success = response.ok;
      try {
        const payload = JSON.parse(text);
        success = response.ok && payload?.success !== false;
      } catch {}
      return this.result(
        success,
        success ? "PASS" : "FAIL",
        "EasySlip",
        "preset/config key",
        success
          ? "EasySlip API ตอบสำเร็จ พร้อมใช้ตรวจสลิป"
          : `EasySlip ปฏิเสธ API Key (HTTP ${response.status})`,
        response.status
      );
    }

    if (configKey === "OMISE_WEBHOOK_SECRET") {
      let decoded: Buffer;
      try {
        decoded = Buffer.from(value, "base64");
      } catch {
        decoded = Buffer.alloc(0);
      }
      const canonical = decoded.length > 0 &&
        decoded.toString("base64").replace(/=+$/,"") === value.replace(/=+$/,"");
      const valid = canonical && decoded.length >= 16;
      return this.result(
        valid,
        valid ? "LIMITED" : "FAIL",
        "Opn / Omise Webhook",
        "preset/config key",
        valid
          ? "รูปแบบ Webhook secret ถูกต้อง ระบบจะยืนยัน HMAC กับ webhook จริงเมื่อมี event เข้ามา"
          : "Webhook secret ต้องเป็น Base64 ที่ Omise สร้างให้"
      );
    }

    if (configKey === "OMISE_SECRET_KEY" || inferred.provider === "Opn / Omise") {
      const { response } = await this.request("https://api.omise.co/account", {
        method: "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(value + ":").toString("base64"),
          Accept: "application/json"
        }
      });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "Opn / Omise", "preset/config key",
        response.ok ? "Omise Account API ตอบสำเร็จ" : `Omise ปฏิเสธคีย์ (HTTP ${response.status})`, response.status);
    }

    if (configKey === "THAIBULKSMS_OTP_KEY" || configKey === "THAIBULKSMS_OTP_SECRET") {
      const key = this.env("THAIBULKSMS_OTP_KEY", configKey, value, companionKey, companionValue);
      const secret = this.env("THAIBULKSMS_OTP_SECRET", configKey, value, companionKey, companionValue);
      if (!key || !secret) {
        return this.result(false, "FAIL", "ThaiBulkSMS OTP", "preset/config key",
          "ต้องมีทั้ง ThaiBulkSMS OTP Key และ OTP Secret จึงจะทดสอบได้");
      }
      const form = new URLSearchParams();
      form.set("key", key);
      form.set("secret", secret);
      form.set("token", "__scenova_connection_test__");
      form.set("pin", "000000");
      const { response, text } = await this.request("https://otp.thaibulksms.com/v2/otp/verify", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });
      if (response.ok) {
        return this.result(true, "PASS", "ThaiBulkSMS OTP", "preset/config key",
          "ThaiBulkSMS OTP endpoint ตอบสำเร็จ", response.status);
      }
      const lowered = text.toLowerCase();
      const authFailed = /unauthorized|authentication|invalid\s*(key|secret)|api\s*(key|secret)/i.test(lowered);
      if (response.status === 400 && !authFailed) {
        return this.result(true, "LIMITED", "ThaiBulkSMS OTP", "preset/config key",
          "OTP endpoint รับคำขอแล้วและปฏิเสธ token ทดสอบตามคาด โดยไม่มีการส่ง OTP", response.status);
      }
      return this.result(false, "FAIL", "ThaiBulkSMS OTP", "preset/config key",
        `ThaiBulkSMS OTP ปฏิเสธ credentials (HTTP ${response.status})`, response.status);
    }

    if (configKey === "THAIBULKSMS_API_KEY" || configKey === "THAIBULKSMS_API_SECRET") {
      const key = this.env("THAIBULKSMS_API_KEY", configKey, value, companionKey, companionValue);
      const secret = this.env("THAIBULKSMS_API_SECRET", configKey, value, companionKey, companionValue);
      if (!key || !secret) {
        return this.result(false, "FAIL", "ThaiBulkSMS", "preset/config key",
          "ต้องมีทั้ง ThaiBulkSMS API Key และ API Secret จึงจะทดสอบภายนอกได้");
      }
      const { response } = await this.request("https://api-v2.thaibulksms.com/credit", {
        method: "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(key + ":" + secret).toString("base64"),
          Accept: "application/json"
        }
      });
      return this.result(response.ok, response.ok ? "PASS" : "FAIL", "ThaiBulkSMS", "preset/config key",
        response.ok ? "ThaiBulkSMS Credit API ตอบสำเร็จ" : `ThaiBulkSMS ปฏิเสธ credentials (HTTP ${response.status})`, response.status);
    }

    if (configKey === "THAIBULKSMS_SENDER") {
      const key = String(process.env.THAIBULKSMS_API_KEY || "").trim();
      const secret = String(process.env.THAIBULKSMS_API_SECRET || "").trim();
      if (!key || !secret) {
        return this.result(false, "FAIL", "ThaiBulkSMS", "preset/config key",
          "ต้องมี ThaiBulkSMS API Key และ API Secret ก่อนจึงจะตรวจ Sender ได้");
      }
      const { response } = await this.request("https://api-v2.thaibulksms.com/credit", {
        method: "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(key + ":" + secret).toString("base64"),
          Accept: "application/json"
        }
      });
      return this.result(
        response.ok,
        response.ok ? "LIMITED" : "FAIL",
        "ThaiBulkSMS",
        "preset/config key",
        response.ok
          ? "ThaiBulkSMS credentials ใช้งานได้ แต่ Sender จะยืนยันเต็มรูปแบบเมื่อมีการส่ง SMS จริง"
          : `ThaiBulkSMS ปฏิเสธ credentials (HTTP ${response.status})`,
        response.status
      );
    }

    if (testUrl) {
      const url = await this.assertPublicHttps(testUrl);
      const authMode = String(input.authMode || "BEARER").trim().toUpperCase();
      const headers: Record<string, string> = { Accept: "application/json" };

      if (authMode === "BEARER") headers.Authorization = "Bearer " + value;
      else if (authMode === "X_API_KEY") headers["X-Api-Key"] = value;
      else if (authMode === "CUSTOM_HEADER") {
        const headerName = String(input.headerName || "").trim();
        if (!/^[A-Za-z0-9-]{1,80}$/.test(headerName)) throw new Error("ชื่อ Custom Header ไม่ถูกต้อง");
        headers[headerName] = value;
      } else {
        throw new Error("Auth Mode ไม่รองรับ");
      }

      const { response } = await this.request(url.toString(), { method: "GET", headers });
      const success = response.status >= 200 && response.status < 300;
      return this.result(
        success,
        success ? "PASS" : "FAIL",
        inferred.provider,
        inferred.from,
        success ? `${inferred.provider} ตอบสำเร็จจาก Custom Test URL` : `ปลายทางตอบ HTTP ${response.status}`,
        response.status
      );
    }

    return this.result(
      false,
      "FAIL",
      inferred.provider,
      inferred.from,
      "ยังไม่มีวิธี Test แบบไม่สร้างรายการภายนอกสำหรับคีย์นี้ กรุณาใช้ Custom Test URL"
    );
  }
}
