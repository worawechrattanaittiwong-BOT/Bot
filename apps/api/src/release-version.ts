export const DEFAULT_INSTALLER_VERSION = "2.0.7";

export function latestInstallerVersion() {
  return String(process.env.SCENOVA_INSTALLER_VERSION || DEFAULT_INSTALLER_VERSION).trim() || DEFAULT_INSTALLER_VERSION;
}

function numericParts(version: unknown) {
  const raw = String(version || "").trim().replace(/^v/i, "").split("-", 1)[0];
  if (!/^\d+(?:\.\d+){0,3}$/.test(raw)) return null;
  const parts = raw.split(".").map((part) => Number(part));
  while (parts.length < 4) parts.push(0);
  return parts;
}

export function isVersionAtLeast(current: unknown, required: unknown) {
  const a = numericParts(current);
  const b = numericParts(required);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

export function installerDownloadPath(version = latestInstallerVersion()) {
  return `/downloads/SCENOVA-Setup-v${version}.exe`;
}
