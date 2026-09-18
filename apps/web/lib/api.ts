export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/backend";
const API_TIMEOUT_MS = 15_000;

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("bot_token") || "";
}

async function requestJson(path: string, init: RequestInit, emergencyAdminKey = "") {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (emergencyAdminKey) headers.set("x-admin-key", emergencyAdminKey);

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) controller.abort();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });

  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
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
