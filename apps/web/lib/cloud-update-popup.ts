// Presentation-only rule: do not repeatedly interrupt a customer with a
// historical FAILED fleet update once the running EA has reported the target
// version in a newer heartbeat. Do not change the update/audit/safety state.
type UpdateJob = {
  state?: string | null;
  action?: string | null;
  target_version?: string | null;
  completed_at?: string | Date | null;
} | null;

type LiveEa = {
  connected?: boolean | null;
  version?: string | null;
  heartbeatAt?: string | Date | null;
} | null;

export function shouldSuppressOldCloudUpdateFailure(job: UpdateJob, ea: LiveEa): boolean {
  if (job?.state !== "FAILED" || job?.action !== "UPDATE" || ea?.connected !== true) return false;
  if (!job.completed_at || !ea.heartbeatAt) return false;

  const failedAt = new Date(job.completed_at).getTime();
  const heartbeatAt = new Date(ea.heartbeatAt).getTime();
  if (!Number.isFinite(failedAt) || !Number.isFinite(heartbeatAt) || heartbeatAt <= failedAt) return false;

  const version = (value: unknown) => String(value || "").trim().replace(/^v/i, "");
  const target = version(job.target_version);
  return Boolean(target && target === version(ea.version));
}
