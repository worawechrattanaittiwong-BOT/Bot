import { ConflictException } from "@nestjs/common";

export function bangkokHour(date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", hourCycle: "h23"
  }).format(date));
}
export function validTradingHours(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 24 &&
    new Set(value).size === value.length &&
    value.every(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23);
}
// Scope deliberately limited to the persisted RACE trading strategy.
// Never apply a RACE hourly cutoff to AUTO, COUNTER, FLIP_LOCK, ZERO_GRID or MANUAL.
export function isRaceSchedule(settings: any): boolean {
  return String(settings?.controlMode || settings?.engineMode || "AUTO").toUpperCase() === "RACE";
}

export function tradingHourAllowed(settings: any, date = new Date()): boolean {
  if (!isRaceSchedule(settings)) return true;
  if (settings?.tradingScheduleEnabled !== true) return true;
  return validTradingHours(settings?.tradingScheduleHours) &&
    settings.tradingScheduleHours.includes(bangkokHour(date));
}
export function checkTradingScheduleStart(settings: any, automated: boolean, date = new Date()) {
  if (!isRaceSchedule(settings)) {
    if (automated) throw new ConflictException("Auto Resume ตามเวลาใช้เฉพาะโหมด RACE");
    return;
  }
  if (settings?.tradingScheduleEnabled !== true) {
    if (automated) throw new ConflictException("ตารางเวลาถูกปิด ไม่อนุญาตให้ Auto Start");
    return;
  }
  if (!tradingHourAllowed(settings, date)) {
    throw new ConflictException("ขณะนี้อยู่นอกชั่วโมงเทรดที่เลือก (เวลาไทย) · ไม่อนุญาตให้ Start");
  }
  if (automated && (settings.tradingScheduleArmed !== true || settings.tradingScheduleResumePending !== true)) {
    throw new ConflictException("ต้องกด Start เองก่อนเปิดสิทธิ์ Auto Resume");
  }
}
