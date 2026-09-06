export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/backend";

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("bot_token") || "";
}

export async function api(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(API_URL + "/api" + path, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

export async function adminApi(path: string, init: RequestInit = {}, emergencyAdminKey = "") {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (emergencyAdminKey) headers.set("x-admin-key", emergencyAdminKey);
  const response = await fetch(API_URL + "/api" + path, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
