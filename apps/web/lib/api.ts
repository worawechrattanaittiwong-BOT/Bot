export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/backend";
const API_TIMEOUT_MS = 15_000;
const API_UPLOAD_TIMEOUT_MS = 5 * 60_000;

function getDeviceId() {
  if (typeof window === "undefined") return "";
  const key = "scenova_device_id";
  let value = localStorage.getItem(key) || "";
  if (!value) {
    try {
      value = globalThis.crypto?.randomUUID?.() || "";
    } catch {}
    if (!value) value = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 18);
    localStorage.setItem(key, value);
  }
  return value.slice(0, 180);
}

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("bot_token") || "";
}

async function requestJson(path: string, init: RequestInit, emergencyAdminKey = "") {
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" &&
    init.body instanceof FormData;
  if (!isFormData) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  const deviceId = getDeviceId();
  if (deviceId) headers.set("x-scenova-device-id", deviceId);
  if (emergencyAdminKey) headers.set("x-admin-key", emergencyAdminKey);

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) controller.abort();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });

  const timeoutId = window.setTimeout(
    () => controller.abort(),
    isFormData ? API_UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS
  );
  try {
    const response = await fetch(API_URL + "/api" + path, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("bot_token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?reason=session-expired");
      }
      throw new Error(data.message || "Session expired");
    }
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  } catch (error: any) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      throw new Error("Server response timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

export async function api(path: string, init: RequestInit = {}) {
  return requestJson(path, init);
}

export async function adminApi(path: string, init: RequestInit = {}, emergencyAdminKey = "") {
  return requestJson(path, init, emergencyAdminKey);
}
