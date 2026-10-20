// Read-only display reconciliation. Never rewrite update history or trading state.
type CloudUpdateJob = {
  state?: string | null;
  action?: string | null;
  target_version?: string | null;
  target_build_id?: string | null;
  target_runtime_contract?: string | null;
  completed_at?: Date | string | null;
} | null;

type CloudRuntime = {
  mt5_online?: boolean | null;
  last_seen_at?: Date | string | null;
  metrics?: {
    eaVersion?: string | null;
    buildId?: string | null;
    runtimeContract?: string | null;
  } | null;
} | null;

export function isRecoveredCloudUpdate(job: CloudUpdateJob, runtime: CloudRuntime): boolean {
  if (job?.state !== "FAILED" || job?.action !== "UPDATE" || !runtime?.mt5_online) return false;
  if (!job.completed_at || !runtime.last_seen_at) return false;
  const completedAt = new Date(job.completed_at).getTime();
  const heartbeatAt = new Date(runtime.last_seen_at).getTime();
  if (!Number.isFinite(completedAt) || !Number.isFinite(heartbeatAt) || heartbeatAt <= completedAt) return false;

  const targetVersion = String(job.target_version || "").trim().replace(/^v/i, "");
  const runtimeVersion = String(runtime.metrics?.eaVersion || "").trim().replace(/^v/i, "");
  const targetBuildId = String(job.target_build_id || "").trim();
  const targetContract = String(job.target_runtime_contract || "").trim();

  // Version alone is not proof: only the exact loaded build/contract may
  // supersede a stale FAILED popup, and only after a fresh live heartbeat.
  return Boolean(targetVersion && runtimeVersion === targetVersion &&
    targetBuildId && String(runtime.metrics?.buildId || "").trim() === targetBuildId &&
    targetContract && String(runtime.metrics?.runtimeContract || "").trim() === targetContract);
}
