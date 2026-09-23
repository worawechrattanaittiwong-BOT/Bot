import { Injectable, ServiceUnavailableException } from "@nestjs/common";

type OtpDelivery = {
  provider: "TBS_OTP" | "SMS_FALLBACK";
  token: string | null;
  refno: string | null;
};

@Injectable()
export class SmsService {
  private otpCredentials() {
    return {
      key: String(process.env.THAIBULKSMS_OTP_KEY || process.env.THAIBULKSMS_API_KEY || "").trim(),
      secret: String(process.env.THAIBULKSMS_OTP_SECRET || process.env.THAIBULKSMS_API_SECRET || "").trim()
    };
  }

  private smsCredentials() {
    return {
      key: String(process.env.THAIBULKSMS_API_KEY || "").trim(),
      secret: String(process.env.THAIBULKSMS_API_SECRET || "").trim(),
      sender: String(process.env.THAIBULKSMS_SENDER || "").trim()
    };
  }

  configured() {
    const otp = this.otpCredentials();
    const sms = this.smsCredentials();
    return Boolean(
      (otp.key && otp.secret) ||
      (sms.key && sms.secret && sms.sender)
    );
  }

  async requestOtp(msisdn: string, fallbackCode: string): Promise<OtpDelivery> {
    const otp = this.otpCredentials();
    const sms = this.smsCredentials();
    let otpFailure = "";

    if (otp.key && otp.secret) {
      const form = new URLSearchParams();
      form.set("key", otp.key);
      form.set("secret", otp.secret);
      form.set("msisdn", msisdn);

      try {
        const response = await fetch("https://otp.thaibulksms.com/v2/otp/request", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: form.toString()
        });

        let result: any = null;
        try { result = await response.json(); } catch {}

        if (response.ok && String(result?.status || "").toLowerCase() === "success" && result?.token) {
          return {
            provider: "TBS_OTP",
            token: String(result.token),
            refno: result?.refno ? String(result.refno) : null
          };
        }

        otpFailure = String(result?.message || result?.error || `HTTP ${response.status}`).slice(0, 180);
      } catch (error: any) {
        otpFailure = String(error?.message || error || "OTP request failed").slice(0, 180);
      }
    }

    if (sms.key && sms.secret && sms.sender) {
      await this.sendTrialCode(msisdn, fallbackCode);
      return { provider: "SMS_FALLBACK", token: null, refno: null };
    }

    if (otpFailure) {
      throw new ServiceUnavailableException(`ส่ง OTP ไม่สำเร็จ: ${otpFailure}`);
    }

    throw new ServiceUnavailableException(
      "ระบบ OTP ยังไม่ได้ตั้งค่า THAIBULKSMS OTP/API credentials"
    );
  }

  async verifyOtp(token: string, pin: string) {
    const otp = this.otpCredentials();
    if (!otp.key || !otp.secret) {
      throw new ServiceUnavailableException("ระบบ OTP ยังไม่ได้ตั้งค่า credentials");
    }

    const form = new URLSearchParams();
    form.set("key", otp.key);
    form.set("secret", otp.secret);
    form.set("token", token);
    form.set("pin", pin);

    let response: Response;
    try {
      response = await fetch("https://otp.thaibulksms.com/v2/otp/verify", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });
    } catch (error: any) {
      throw new ServiceUnavailableException(
        `ตรวจสอบ OTP ไม่สำเร็จ: ${String(error?.message || error || "network error").slice(0, 160)}`
      );
    }

    let result: any = null;
    try { result = await response.json(); } catch {}

    if (response.ok) {
      return String(result?.status || "").toLowerCase() === "success";
    }
    if (response.status === 400) return false;

    const detail = String(result?.message || result?.error || "").slice(0, 180);
    throw new ServiceUnavailableException(
      detail ? `ตรวจสอบ OTP ไม่สำเร็จ: ${detail}` : "ตรวจสอบ OTP ไม่สำเร็จ กรุณาลองใหม่"
    );
  }

  async sendTrialCode(msisdn: string, code: string) {
    const { key, secret, sender } = this.smsCredentials();

    if (!key || !secret || !sender) {
      throw new ServiceUnavailableException(
        "SMS fallback ยังไม่ได้ตั้งค่า THAIBULKSMS_API_KEY / API_SECRET / SENDER"
      );
    }

    const form = new URLSearchParams();
    form.set("sender", sender);
    form.set("msisdn", msisdn);
    form.set(
      "message",
      `SCENOVA OTP: ${code}. Expires in 10 min. Do not share this code.`
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
