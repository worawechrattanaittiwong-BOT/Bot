import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_INSTALLER_VERSION = "1.0.13";
export const DEFAULT_EA_VERSION = "1.1.1";
export const EA_RUNTIME_CONTRACT = "RACE_CONFIGURED_LOSS_ONLY_V1";
export const ZERO_GRID_MAX_LEVELS_PER_SIDE = 30;

// 3.1.2 introduced the Agent protocol used by the current 1.0.x line
// (agent-heartbeat + resumable EA artifact + one-time MT5 action). Patch
// releases in the same 1.0 line must not hard-block trading simply because a
// newer Setup binary exists. This also lets an already-installed 1.0.0 Agent
// repair/update EA automatically without forcing another browser download.
export const MIN_COMPATIBLE_INSTALLER_VERSION = "1.0.0";

export function latestInstallerVersion() {
  const configured = String(process.env.SCENOVA_INSTALLER_VERSION || "").trim();
  if (configured && sameReleaseLine(configured, DEFAULT_INSTALLER_VERSION) && isVersionAtLeast(configured, DEFAULT_INSTALLER_VERSION)) {
    return configured;
  }
  return DEFAULT_INSTALLER_VERSION;
}

function numericParts(version: unknown) {
  const raw = String(version || "").trim().replace(/^v/i, "").split("-", 1)[0];
  if (!/^\d+(?:\.\d+){0,3}$/.test(raw)) return null;
  const parts = raw.split(".").map((part) => Number(part));
  while (parts.length < 4) parts.push(0);
  return parts;
}

function sameReleaseLine(current: unknown, baseline: unknown) {
  const a = numericParts(current);
  const b = numericParts(baseline);
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
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

export function isVersionSame(current: unknown, required: unknown) {
  const a = normalizedExactVersion(current);
  const b = normalizedExactVersion(required);
  return Boolean(a && b && a === b);
}

// Historical callers use isVersionExact() for the Windows Agent compatibility
// gate. Keep exact equality first, then allow compatible PATCH releases inside
// the 3.1 protocol line. A future 1.1.x release remains a hard upgrade unless
// its minimum compatibility policy is explicitly changed.
export function isVersionExact(current: unknown, required: unknown) {
  const aRaw = normalizedExactVersion(current);
  const bRaw = normalizedExactVersion(required);
  if (!aRaw || !bRaw) return false;
  if (aRaw === bRaw) return true;

  const a = numericParts(aRaw);
  const b = numericParts(bRaw);
  const minimum = numericParts(MIN_COMPATIBLE_INSTALLER_VERSION);
  if (!a || !b || !minimum) return false;

  const sameProtocolLine = a[0] === b[0] && a[1] === b[1];
  return sameProtocolLine && isVersionAtLeast(aRaw, MIN_COMPATIBLE_INSTALLER_VERSION);
}

// EA runtime releases are deliberately strict. An older EA must never be
// treated as equivalent to the promoted runtime because the executable loaded
// in MT5 must exactly match the current release.
export function isEaVersionExact(current: unknown, required: unknown) {
  const a = normalizedExactVersion(current);
  const b = normalizedExactVersion(required);
  return Boolean(a && b && a === b);
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
  const actualHash = String(actualArtifactHash() || "").trim().toLowerCase() || null;
  const manifestHash = String(manifest.sha256 || "").trim().toLowerCase() || null;
  const configuredHash = String(process.env.SCENOVA_EA_SHA256 || "").trim().toLowerCase() || null;
  const manifestEaVersion = String(manifest.eaVersion || "").trim();
  const configuredEaVersion = String(process.env.SCENOVA_EA_VERSION || "").trim();

  // Trust a release version only when it is bound to the EX5 actually served.
  // This prevents stale environment values or stale manifests from advertising
  // a version that does not match the downloadable binary.
  const manifestBoundToArtifact = Boolean(
    manifestEaVersion &&
    (!actualHash || (manifestHash && manifestHash === actualHash))
  );
  const configuredVersionIsSafeFallback = Boolean(
    configuredEaVersion &&
    sameReleaseLine(configuredEaVersion, DEFAULT_EA_VERSION) &&
    isVersionAtLeast(configuredEaVersion, DEFAULT_EA_VERSION) &&
    (!actualHash || (configuredHash && configuredHash === actualHash))
  );

  const eaVersion = manifestBoundToArtifact
    ? manifestEaVersion
    : configuredVersionIsSafeFallback
      ? configuredEaVersion
      : DEFAULT_EA_VERSION;
  const sha256 = actualHash || manifestHash || configuredHash || null;

  return {
    eaVersion,
    sha256,
    runtimeContract: String(manifest.runtimeContract || EA_RUNTIME_CONTRACT).trim() || EA_RUNTIME_CONTRACT,
    sourceCommit: String(manifest.sourceCommit || "").trim() || null,
    builtAt: String(manifest.builtAt || "").trim() || null,
    manifestIntegrity: actualHash && manifestHash ? actualHash === manifestHash : null
  };
}

export function installerDownloadPath(version = latestInstallerVersion()) {
  return `/downloads/SCENOVA-Setup-v${version}.exe`;
}
