import { API_URL, getToken } from "./api";

export type SystemTestStatus = "idle" | "running" | "pass" | "fail";

export type SystemTestDefinition = {
  id: string;
  group: "CORE" | "ADMIN" | "TRADING" | "COMMERCE";
  label: string;
  description: string;
  path: string;
  quick?: boolean;
  validate?: (data: any) => boolean;
};

export type SystemTestResult = {
  id: string;
  status: SystemTestStatus;
  durationMs: number;
  detail: string;
  checkedAt: string;
};

export const SYSTEM_TESTS: SystemTestDefinition[] = [
  {
    id: "CORE-001",
    group: "CORE",
    label: "API + Database Health",
    description: "ตรวจว่า API ตอบสนองและฐานข้อมูลเชื่อมต่อได้",
    path: "/health",
    quick: true,
    validate: data => data?.ok === true && data?.service === "bot-api"
  },
  {
    id: "CORE-002",
    group: "CORE",
    label: "Authenticated Account",
    description: "ตรวจ session และสิทธิ์ของบัญชีที่กำลังใช้งาน",
    path: "/auth/account",
    quick: true
  },
  {
    id: "ADMIN-001",
    group: "ADMIN",
    label: "Admin System Snapshot",
    description: "ตรวจ endpoint สถานะระบบสำหรับ Owner/Admin",
    path: "/admin/system",
    quick: true
  },
  {
    id: "ADMIN-002",
    group: "ADMIN",
    label: "Production Hardening",
    description: "อ่านสถานะ incident, node guard และ recovery circuit โดยไม่แก้ค่า",
    path: "/admin/production-hardening",
    quick: true
  },
  {
    id: "ADMIN-003",
    group: "ADMIN",
    label: "Customer Query",
    description: "ตรวจเส้นทางค้นหาลูกค้าและการอ่านข้อมูลฝั่ง Admin",
    path: "/admin/users?q=__system_test_probe__"
  },
  {
    id: "TRADING-001",
    group: "TRADING",
    label: "Live Dashboard",
    description: "ตรวจข้อมูลสถานะ live ของ slot/instance ปัจจุบันแบบ read-only",
    path: "/dashboard-live/summary"
  },
  {
    id: "TRADING-002",
    group: "TRADING",
    label: "Backtest Reports",
    description: "ตรวจการอ่านรายการ Backtest ของบัญชีปัจจุบัน",
    path: "/backtest/runs"
  },
  {
    id: "COMMERCE-001",
    group: "COMMERCE",
    label: "Cloud Catalog",
    description: "ตรวจการอ่านแพ็กเกจ Cloud โดยไม่สร้าง order",
    path: "/cloud/catalog"
  },
  {
    id: "COMMERCE-002",
    group: "COMMERCE",
    label: "Local Catalog",
    description: "ตรวจการอ่านแพ็กเกจ Local โดยไม่สร้าง order",
    path: "/packages/local/catalog"
  },
  {
    id: "COMMERCE-003",
    group: "COMMERCE",
    label: "Local Package Admin",
    description: "ตรวจการอ่าน config ราคา Local ฝั่ง Admin",
    path: "/admin/local-packages"
  }
];

function describePayload(data: any) {
  if (Array.isArray(data)) return `OK · ${data.length} item${data.length === 1 ? "" : "s"}`;
  if (data && typeof data === "object") {
    if (data.ok === true) return "OK · service responded";
    return "OK · response object received";
  }
  return "OK · response received";
}

export async function runSystemTest(test: SystemTestDefinition): Promise<SystemTestResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const token = getToken();
    const headers = new Headers({ Accept: "application/json" });
    if (token) headers.set("Authorization", "Bearer " + token);

    const response = await fetch(API_URL + "/api" + test.path, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);
    const durationMs = Math.round(performance.now() - started);

    if (!response.ok) {
      const message = data?.message;
      return {
        id: test.id,
        status: "fail",
        durationMs,
        detail: `HTTP ${response.status}${message ? " · " + String(message) : ""}`,
        checkedAt: new Date().toISOString()
      };
    }

    if (test.validate && !test.validate(data)) {
      return {
        id: test.id,
        status: "fail",
        durationMs,
        detail: "Response received but validation failed",
        checkedAt: new Date().toISOString()
      };
    }

    return {
      id: test.id,
      status: "pass",
      durationMs,
      detail: describePayload(data),
      checkedAt: new Date().toISOString()
    };
  } catch (error: any) {
    return {
      id: test.id,
      status: "fail",
      durationMs: Math.round(performance.now() - started),
      detail: controller.signal.aborted
        ? "Timeout after 10 seconds"
        : String(error?.message || "Request failed"),
      checkedAt: new Date().toISOString()
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
