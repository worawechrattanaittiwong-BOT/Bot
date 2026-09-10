import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_INSTALLER_VERSION = "3.0.0";
export const DEFAULT_EA_VERSION = "1.043";

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

function normalizedExactVersion(version: unknown) {
  return String(version || "").trim().replace(/^v/i, "");
}

export function isVersionExact(current: unknown, required: unknown) {
  const a = normalizedExactVersion(current);
  const b = normalizedExactVersion(required);
  return Boolean(a && b && a === b);
}

export function isEaVersionExact(current: unknown, required: unknown) {
  return isVersionExact(current, required);
}

function artifactPath() {
  return String(process.env.EA_ARTIFACT_PATH || "").trim() ||
    "/app/apps/api/artifacts/FastBasketBot.ex5";
}

function readReleaseManifest() {
  const path = artifactPath();
  const candidates = [
    String(process.env.EA_RELEASE_MANIFEST_PATH || "").trim(),
    resolve(dirname(path), "manifest.json"),
    "/app/apps/api/artifacts/manifest.json",
    resolve(process.cwd(), "apps/api/artifacts/manifest.json"),
    resolve(process.cwd(), "mt5/release/manifest.json")
  ].filter(Boolean);

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, "utf8").replace(/^\uFEFF/, ""));
      if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
    } catch {
      // Keep verification strict and fall back to generated/default metadata.
    }
  }
  return {};
}

function actualArtifactHash() {
  try {
    const path = artifactPath();
    if (!existsSync(path)) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

export function latestEaRelease() {
  const manifest = readReleaseManifest();
  const eaVersion =
    String(process.env.SCENOVA_EA_VERSION || manifest.eaVersion || DEFAULT_EA_VERSION).trim() ||
    DEFAULT_EA_VERSION;
  const sha256 =
    String(
      process.env.SCENOVA_EA_SHA256 ||
      actualArtifactHash() ||
      manifest.sha256 ||
      ""
    ).trim().toLowerCase() || null;

  return {
    eaVersion,
    sha256,
    sourceCommit: String(manifest.sourceCommit || "").trim() || null,
    builtAt: String(manifest.builtAt || "").trim() || null
  };
}

export function installerDownloadPath(version = latestInstallerVersion()) {
  return `/downloads/SCENOVA-Setup-v${version}.exe`;
}
