import { Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class SmsService {
  configured() {
    return Boolean(
      String(process.env.THAIBULKSMS_API_KEY || "").trim() &&
      String(process.env.THAIBULKSMS_API_SECRET || "").trim() &&
      String(process.env.THAIBULKSMS_SENDER || "").trim()
    );
  }

  async sendTrialCode(msisdn: string, code: string) {
    const key = String(process.env.THAIBULKSMS_API_KEY || "").trim();
    const secret = String(process.env.THAIBULKSMS_API_SECRET || "").trim();
    const sender = String(process.env.THAIBULKSMS_SENDER || "").trim();

    if (!key || !secret || !sender) {
      throw new ServiceUnavailableException(
        "SMS ยังไม่ได้ตั้งค่า THAIBULKSMS_API_KEY / API_SECRET / SENDER"
      );
    }

    const form = new URLSearchParams();
    form.set("sender", sender);
    form.set("msisdn", msisdn);
    form.set(
      "message",
      `SCENOVA Trial Code: ${code}. Expires in 10 min. Do not share this code.`
    );

    const response = await fetch("https://api-v2.thaibulksms.com/sms", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64")
      },
      body: form.toString()
    });

    let result: any = null;
    try { result = await response.json(); } catch {}

    if (!response.ok) {
      const detail = String(result?.message || result?.error || "").slice(0, 180);
      throw new ServiceUnavailableException(
        detail ? `ส่ง SMS ไม่สำเร็จ: ${detail}` : "ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่"
      );
    }

    return result || { ok: true };
  }
}
