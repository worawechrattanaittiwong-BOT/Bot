import { BadRequestException } from "@nestjs/common";

const KNOWN_CALLING_CODES = [
  "971","966","886","852","66","44","61","65","60","62","63","84",
  "81","82","86","91","49","33","39","1"
];

function inferCallingCode(digits: string, preferred?: string) {
  const preferredDigits = String(preferred || "").replace(/\D/g, "");
  if (preferredDigits && digits.startsWith(preferredDigits)) return preferredDigits;
  return KNOWN_CALLING_CODES.find(code => digits.startsWith(code)) || "";
}

export function normalizePhone(countryCodeInput: unknown, phoneInput: unknown) {
  const raw = String(phoneInput || "").trim();
  if (!raw) throw new BadRequestException("กรุณากรอกเบอร์โทร");

  if (raw.startsWith("+")) {
    const digits = raw.replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      throw new BadRequestException("รูปแบบเบอร์โทรไม่ถูกต้อง");
    }
    const ccDigits = inferCallingCode(digits, String(countryCodeInput || ""));
    if (!ccDigits) throw new BadRequestException("รหัสประเทศยังไม่รองรับ");
    return {
      countryCode: "+" + ccDigits,
      nationalNumber: digits.slice(ccDigits.length),
      e164: "+" + digits
    };
  }

  const ccDigits = String(countryCodeInput || "").replace(/\D/g, "");
  if (!/^[1-9]\d{0,3}$/.test(ccDigits)) {
    throw new BadRequestException("กรุณาเลือกรหัสประเทศ");
  }

  let national = raw.replace(/\D/g, "");
  if (ccDigits !== "39") national = national.replace(/^0+/, "");
  const digits = ccDigits + national;
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new BadRequestException("รูปแบบเบอร์โทรไม่ถูกต้อง");
  }

  return { countryCode: "+" + ccDigits, nationalNumber: national, e164: "+" + digits };
}

export function maskPhone(e164: string, countryCode?: string) {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (digits.length < 7) return "••••";
  const ccDigits = inferCallingCode(digits, countryCode) || digits.slice(0, 2);
  return "+" + ccDigits + " •••• " + digits.slice(-4);
}
