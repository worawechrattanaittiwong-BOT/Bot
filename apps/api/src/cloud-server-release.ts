export const CLOUD_SERVER_RELEASE = {
  workerVersion: "2.2.9",
  setupVersion: "0.6.7",
  setupUrl: "https://snvea-bot.online/downloads/SCENOVA-Cloud-Setup.exe",
  manifestUrl: "https://snvea-bot.online/downloads/SCENOVA-Cloud-Server.json"
} as const;

function parseVersion(value: unknown) {
  const raw = String(value || "").trim().replace(/^v/i, "");
  if (!/^\d+(?:\.\d+){0,3}$/.test(raw)) return null;
  const parts = raw.split(".").map(Number);
  while (parts.length < 4) parts.push(0);
  return parts;
}

export function versionAtLeast(current: unknown, required: unknown) {
  const a = parseVersion(current);
  const b = parseVersion(required);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

export function versionExact(current: unknown, required: unknown) {
  const a = parseVersion(current);
  const b = parseVersion(required);
  return Boolean(a && b && a.every((part, index) => part === b[index]));
}
