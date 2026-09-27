# Hostinger API build identity

Use `bash scripts/deploy-hostinger.sh` for a manual release, or the existing
`scenova-auto-deploy.service` for the CI-gated timer release. Both share the same
deployment lock. The default Compose project is `linux`, so the API service is
the existing `linux-api-1`, not a second stack named after a temporary directory.

## What changed

Previously `deployed.sha` alone skipped releases and a successful health response
could certify an old API. `up --build` allowed cached layers, the API build copied
the entire host API directory, and there was no image-to-commit or dist integrity
check. Docker cache alone does not prove the reported cause: a correct COPY cache
normally invalidates when source changes. The former pipeline lacked evidence to
distinguish stale inputs, a skipped deployment and an old running container.

The new pipeline pins the fetched `origin/main` SHA (the auto-deployer passes the
exact SHA that passed its existing CI gates), archives its tracked files into a
temporary build context, and fingerprints API source/configuration/build inputs.
API builds always use `--no-cache --pull`, clean incremental output, and create a
unique image tag for every build, including repairs of the same commit. Web build
and API image verification finish before replacing either running app service.

The build writes `/app/apps/api/build-manifest.json`, binding the Git SHA, source
SHA-256, build ID and every compiled file hash. Before success, the host checks:

- The actual running container's image ID, revision, source hash and build ID.
- Its complete `/app/apps/api/dist` inventory against the build manifest.
- `chartHasFastBasketBot`, `presetCloudRelayEnabled` and `relayRequestFiles` in
  compiled `worker.controller.js` (not just source, declarations or sourcemaps).
- PID 1 runs `node apps/api/dist/main.js`, the internal API/database health
  endpoint succeeds, and Docker reports the API healthy and not restarting.

The timer checks live integrity even when `deployed.sha` matches. A stale runtime
causes a rebuild; a failed build or verification never advances that marker.
The marker is replaced atomically after the public health check and final runtime
verification. The next timer invocation picks up any newer main commit that
arrived while the pinned release was building.

## Deployment and recovery

Commit/push the pipeline changes first, then on the Linux API VPS:

```bash
cd /opt/Bot
git pull --ff-only origin main
bash scripts/auto-deploy-vps.sh
```

For an intentional manual deployment (without the timer's CI gate), run
`bash scripts/deploy-hostinger.sh`. It fetches and fast-forwards to main and rejects
local tracked edits or divergent local commits. It does not reset them away.
Running Compose `up --build api` directly without the build identity variables
fails the build deliberately. Use the deploy script; `configure-domain.sh` now
uses the same verified path. Read-only Compose commands still work normally.

Both paths require Docker Compose v2 with `--wait`, Bash, Git, tar, sha256sum,
OpenSSL and flock. The host does not need Node.js. The verifier runs inside the
new image/container using its own Node.js. Postgres volumes and customer
Worker/EA processes are not restarted by the API recreation step.

An integrity failure after recreation is reported as a failed deployment; no
automatic database rollback or success marker is performed. Inspect the log
before retrying. A verified API does not on its own prove that an MT5 login,
broker server or Windows Worker problem has been resolved.

## Focused checks

```bash
bash -n scripts/deploy-hostinger.sh scripts/auto-deploy-vps.sh scripts/lib/api-deploy.sh
node --test tests/api-build-integrity.test.cjs
```

The tests exercise real fingerprints/manifests and rejection of stale, altered,
missing or unexpected compiled files. The shell runtime gate is tested with a
mock Docker boundary, including verification failures inside Bash `if` calls.
Production proof still requires a successful run on the VPS with Docker.
