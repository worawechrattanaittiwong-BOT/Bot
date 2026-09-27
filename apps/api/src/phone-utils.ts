import { BadRequestException } from "@nestjs/common";

const KNOWN_CALLING_CODES = [
  "971","972","973","974","965","966","968",
  "886","852","856","855","420","358","351","353",
  "66","44","61","64","65","60","62","63","84","95",
  "81","82","86","91","49","33","39","34","31","32",
  "41","46","47","45","48","43","36","30","90","27",
  "55","52","1"
];

function inferCallingCode(digits: string, preferred?: string) {
  const preferredDigits = String(preferred || "").replace(/\D/g, "");
  if (preferredDigits && digits.startsWith(preferredDigits)) return preferredDigits;
  return KNOWN_CALLING_CODES.find(code => digits.startsWith(code)) || "";
}

function validateE164Digits(digits: string) {
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new BadRequestException("รูปแบบเบอร์โทรไม่ถูกต้อง");
  }
}

export function normalizePhone(countryCodeInput: unknown, phoneInput: unknown) {
  const raw = String(phoneInput || "").trim();
  if (!raw) throw new BadRequestException("กรุณากรอกเบอร์โทร");

  const rawDigits = raw.replace(/\D/g, "");
  const internationalDigits =
    raw.startsWith("+")
      ? rawDigits
      : raw.startsWith("00")
        ? rawDigits.replace(/^00/, "")
        : "";

  if (internationalDigits) {
    validateE164Digits(internationalDigits);
    const ccDigits = inferCallingCode(internationalDigits, String(countryCodeInput || ""));
    if (!ccDigits) throw new BadRequestException("รหัสประเทศยังไม่รองรับ");
    return {
      countryCode: "+" + ccDigits,
      nationalNumber: internationalDigits.slice(ccDigits.length),
      e164: "+" + internationalDigits
    };
  }

  const ccDigits = String(countryCodeInput || "").replace(/\D/g, "");
  if (!/^[1-9]\d{0,3}$/.test(ccDigits)) {
    throw new BadRequestException("กรุณาเลือกรหัสประเทศ");
  }

  let national = rawDigits;
  if (national.startsWith(ccDigits) && national.length >= ccDigits.length + 7) {
    national = national.slice(ccDigits.length);
  }
  if (ccDigits !== "39") national = national.replace(/^0+/, "");

  const digits = ccDigits + national;
  validateE164Digits(digits);

  return {
    countryCode: "+" + ccDigits,
    nationalNumber: national,
    e164: "+" + digits
  };
}

export function maskPhone(e164: string, countryCode?: string) {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (digits.length < 7) return "••••";
  const ccDigits = inferCallingCode(digits, countryCode) || digits.slice(0, 2);
  return "+" + ccDigits + " •••• " + digits.slice(-4);
}
