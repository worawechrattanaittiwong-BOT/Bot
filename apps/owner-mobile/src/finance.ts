export type Summary = {
  paymentMode: string;
  omise: { configured: boolean; reachable: boolean; totalSatang: number; transferableSatang: number; minTransferSatang: number; maxTransferSatang: number };
  commission: { pendingSatang: number; availableSatang: number; lockedSatang: number; paidSatang: number };
  approvals: { requestedCount: number; holdCount: number; approvedCount: number; waitingSatang: number };
  owner: { reserveSatang: number; commissionLiabilitySatang: number; safeWithdrawableSatang: number };
  recentOwnerTransfers: Array<{ id: string; amount_satang: number | string; status: string; created_at: string }>;
};

export type Approval = {
  id: string; user_code: string; email: string; amount_satang: number; currency: string;
  status: string; created_at: string; risk_score: number; risk_level: string; risk_reasons?: unknown[];
  approval_required: number; approval_count: number; bank_code: string; bank_name: string;
  account_name: string; masked_account: string; destination_status: string; shared_account_users: number;
};
export type OwnerUpdateManifest = { version: string; versionCode: number; url: string; sha256?: string; releasedAt?: string };
export type MainTab = "dashboard" | "packages" | "promotions" | "accounts";
export type ApprovalAction = "approve" | "hold" | "reject";

// Display unknown balances as unavailable, never as a successful zero balance.
export function amountLabel(satang: number | string | undefined | null) {
  if (satang == null || !Number.isFinite(Number(satang))) return "—";
  return (Number(satang) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const money = (satang: number | string | undefined | null) => `${amountLabel(satang)} บาท`;
export function shortDate(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Date(value).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function parseBaht(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(satang) && satang > 0 ? satang : null;
}
export function withdrawLimit(summary: Summary | null) {
  if (!summary) return 0;
  return Math.max(0, Math.min(summary.owner.safeWithdrawableSatang, summary.omise.maxTransferSatang));
}
export function canWithdraw(summary: Summary | null, satang: number | null, pin: string) {
  return !!summary?.omise.configured && summary.omise.reachable && satang !== null &&
    Number.isSafeInteger(satang) && satang >= summary.omise.minTransferSatang &&
    satang <= withdrawLimit(summary) && /^\d{6}$/.test(pin);
}
export function systemStatus(summary: Summary | null, stale = false) {
  if (stale) return { text: "ข้อมูลยังไม่อัปเดต", tone: "warning" as const };
  if (!summary) return { text: "กำลังเชื่อมต่อ", tone: "neutral" as const };
  if (!summary.omise.configured) return { text: "รอเชื่อมต่อ", tone: "warning" as const };
  if (!summary.omise.reachable) return { text: "เชื่อมต่อขัดข้อง", tone: "danger" as const };
  if (summary.paymentMode === "TEST") return { text: "โหมดทดสอบ", tone: "warning" as const };
  return { text: "เชื่อมต่อแล้ว", tone: "success" as const };
}
export function statusLabel(value: string) {
  return ({ REQUESTED: "รออนุมัติ", HOLD: "พักรายการ", APPROVED: "อนุมัติแล้ว", REJECTED: "ปฏิเสธแล้ว", CREATING: "กำลังดำเนินการ", SUBMITTED: "ส่งคำสั่งแล้ว", REVIEW: "รอตรวจสอบ", PAID: "จ่ายแล้ว", COMPLETED: "สำเร็จ", FAILED: "ไม่สำเร็จ", CANCELLED: "ยกเลิกแล้ว", VERIFIED: "ยืนยันแล้ว", ACTIVE: "พร้อมใช้งาน" } as Record<string, string>)[value] || value;
}
export function riskLabel(value: string) {
  return ({ LOW: "ความเสี่ยงต่ำ", MEDIUM: "ความเสี่ยงปานกลาง", HIGH: "ความเสี่ยงสูง", CRITICAL: "ความเสี่ยงสูงมาก" } as Record<string, string>)[value] || value;
}
