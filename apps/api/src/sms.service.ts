import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

type OtpDelivery = {
  provider: "TBS_OTP" | "SMS_FALLBACK";
  token: string | null;
  refno: string | null;
};

const SMS_REQUEST_TIMEOUT_MS = 10_000;
const SMS_UNAVAILABLE_MESSAGE =
  "ไม่สามารถส่งรหัสยืนยันทาง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private otpCredentials() {
    return {
      key: String(process.env.THAIBULKSMS_OTP_KEY || "").trim(),
      secret: String(process.env.THAIBULKSMS_OTP_SECRET || "").trim()
    };
  }

  private smsCredentials() {
    return {
      key: String(process.env.THAIBULKSMS_API_KEY || "").trim(),
      secret: String(process.env.THAIBULKSMS_API_SECRET || "").trim(),
      sender: String(process.env.THAIBULKSMS_SENDER || "").trim()
    };
  }

  private otpConfigured() {
    const otp = this.otpCredentials();
    return Boolean(/^\d+$/.test(otp.key) && otp.secret);
  }

  configured() {
    const sms = this.smsCredentials();
    return Boolean(
      this.otpConfigured() ||
      (sms.key && sms.secret && sms.sender)
    );
  }

  async requestOtp(
    msisdn: string,
    fallbackCode: string,
    purpose: "ACCOUNT" | "LOCAL_TRIAL" = "ACCOUNT"
  ): Promise<OtpDelivery> {
    if (this.otpConfigured()) {
      const otp = this.otpCredentials();
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
          body: form.toString(),
          signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS)
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

        const detail = this.providerError(result) || `HTTP ${response.status}`;
        this.logger.warn(`ThaiBulkSMS OTP request failed: ${detail}`);
        throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
      } catch (error: any) {
        if (error instanceof ServiceUnavailableException) throw error;
        this.logger.warn(
          `ThaiBulkSMS OTP request network error: ${String(error?.message || error || "network error").slice(0, 180)}`
        );
        throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
      }
    }

    const sms = this.smsCredentials();
    if (sms.key && sms.secret && sms.sender) {
      await this.sendOtpCode(msisdn, fallbackCode, purpose);
      return { provider: "SMS_FALLBACK", token: null, refno: null };
    }

    const otp = this.otpCredentials();
    if (otp.key || otp.secret) {
      this.logger.error("ThaiBulkSMS OTP credentials are incomplete or invalid");
      throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
    }

    this.logger.error("ThaiBulkSMS OTP/SMS credentials are not configured");
    throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
  }

  async verifyOtp(token: string, pin: string) {
    if (!this.otpConfigured()) {
      this.logger.error("ThaiBulkSMS OTP verify requested without OTP credentials");
      throw new ServiceUnavailableException("บริการยืนยันรหัส SMS ไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่ภายหลัง");
    }

    const otp = this.otpCredentials();
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
        body: form.toString(),
        signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS)
      });
    } catch (error: any) {
      this.logger.warn(
        `ThaiBulkSMS OTP verify network error: ${String(error?.message || error || "network error").slice(0, 160)}`
      );
      throw new ServiceUnavailableException(
        "ไม่สามารถตรวจสอบรหัสยืนยันได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
      );
    }

    let result: any = null;
    try { result = await response.json(); } catch {}

    if (response.ok) {
      return String(result?.status || "").toLowerCase() === "success";
    }
    if (response.status === 400) return false;

    const detail = this.providerError(result) || `HTTP ${response.status}`;
    this.logger.warn(`ThaiBulkSMS OTP verify failed: ${detail}`);
    throw new ServiceUnavailableException(
      "ไม่สามารถตรวจสอบรหัสยืนยันได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
    );
  }

  async sendOtpCode(
    msisdn: string,
    code: string,
    purpose: "ACCOUNT" | "LOCAL_TRIAL" = "ACCOUNT"
  ) {
    const { key, secret, sender } = this.smsCredentials();

    if (!key || !secret || !sender) {
      this.logger.error("ThaiBulkSMS SMS credentials are not configured");
      throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
    }

    const form = new URLSearchParams();
    form.set("sender", sender);
    form.set("msisdn", msisdn);
    const message = purpose === "LOCAL_TRIAL"
      ? `SCENOVA: รหัสยืนยัน Local MT5 Trial ${code} ใช้ได้ 10 นาที กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น`
      : `SCENOVA: รหัสยืนยันเบอร์มือถือ ${code} ใช้ได้ 10 นาที กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น`;
    form.set("message", message);

    let response: Response;
    try {
      response = await fetch("https://api-v2.thaibulksms.com/sms", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64")
        },
        body: form.toString(),
        signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS)
      });
    } catch (error: any) {
      this.logger.warn(
        `ThaiBulkSMS SMS network error: ${String(error?.message || error || "network error").slice(0, 160)}`
      );
      throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
    }

    let result: any = null;
    try { result = await response.json(); } catch {}

    if (!response.ok) {
      const detail = this.providerError(result) || `HTTP ${response.status}`;
      this.logger.warn(`ThaiBulkSMS SMS send failed: ${detail}`);
      throw new ServiceUnavailableException(SMS_UNAVAILABLE_MESSAGE);
    }

    return result || { ok: true };
  }

  private providerError(result: any) {
    return String(
      result?.error?.description ||
      result?.error?.name ||
      result?.message ||
      result?.errors?.[0]?.message ||
      ""
    ).slice(0, 180);
  }
}
