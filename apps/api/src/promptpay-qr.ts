import QRCode from "qrcode";

function tlv(id: string, value: string) {
  const length = Buffer.byteLength(value, "utf8");
  if (length > 99) throw new Error("PromptPay field too long");
  return id + String(length).padStart(2, "0") + value;
}

function crc16CcittFalse(input: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPromptPayPayload(promptPayIdValue: unknown, amountSatangValue: unknown) {
  const promptPayId = String(promptPayIdValue || "").replace(/\D/g, "");
  const amountSatang = Math.trunc(Number(amountSatangValue || 0));
  if (!Number.isInteger(amountSatang) || amountSatang <= 0) return "";

  let proxyTag = "";
  let proxyValue = "";
  if (/^0\d{9}$/.test(promptPayId)) {
    proxyTag = "01";
    proxyValue = "0066" + promptPayId.slice(1);
  } else if (/^\d{13}$/.test(promptPayId)) {
    proxyTag = "02";
    proxyValue = promptPayId;
  } else if (/^\d{15}$/.test(promptPayId)) {
    proxyTag = "03";
    proxyValue = promptPayId;
  } else {
    return "";
  }

  const merchantAccount =
    tlv("00", "A000000677010111") +
    tlv(proxyTag, proxyValue);

  const amount = (amountSatang / 100).toFixed(2);
  const withoutCrc =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("29", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "764") +
    tlv("54", amount) +
    tlv("58", "TH") +
    "6304";

  return withoutCrc + crc16CcittFalse(withoutCrc);
}

export async function createServerPromptPayQr(input: {
  promptPayId: unknown;
  amountSatang: unknown;
}) {
  const payload = buildPromptPayPayload(input.promptPayId, input.amountSatang);
  if (!payload) return null;

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 384,
    type: "image/png"
  });

  return {
    provider: "MANUAL_PROMPTPAY" as const,
    type: "PROMPTPAY" as const,
    payload,
    dataUrl
  };
}
