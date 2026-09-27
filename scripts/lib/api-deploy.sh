#!/usr/bin/env bash
# Sourced by both manual deploys and the timer; no dependencies on host Node.js.

api_source_digest() (
  set -euo pipefail
  cd "$1"
  {
    printf '%s\n' package.json apps/web/package.json Dockerfile.api Dockerfile.api.dockerignore scripts/api-build-integrity.cjs
    if [ -f package-lock.json ]; then printf '%s\n' package-lock.json; fi
    find apps/api -maxdepth 1 -type f -name '*.json' ! -name build-manifest.json
    find apps/api/src -type f
  } | LC_ALL=C sort -u | while IFS= read -r file; do
    # GNU sha256sum defaults to '*' on Windows and ' ' on Linux. Hash raw
    # bytes and emit one canonical inventory format on either platform.
    file_hash="$(sha256sum --binary "$file")"
    printf '%s  %s\n' "${file_hash:0:64}" "$file"
  done | sha256sum | cut -d' ' -f1
)

api_expected_source_digest() (
  set -euo pipefail
  local snapshot
  snapshot="$(mktemp -d /tmp/scenova-api-inputs.XXXXXXXX)"
  trap 'rm -rf -- "$snapshot"' EXIT
  # git archive reads committed bytes, including LF endings, not mutable host files.
  git archive "$1" package.json apps/api apps/web/package.json Dockerfile.api Dockerfile.api.dockerignore scripts/api-build-integrity.cjs | tar -x -C "$snapshot"
  if git cat-file -e "$1:package-lock.json" 2>/dev/null; then
    git show "$1:package-lock.json" > "$snapshot/package-lock.json"
  fi
  api_source_digest "$snapshot"
)

verify_api_runtime() (
  set -euo pipefail
  local sha="$1" source_hash="$2" expected_image="${3:-}" expected_build="${4:-}"
  local cid image revision build source_label state count
  if [ -f .env.hostinger ]; then
    # Keep project selection identical to the deploy, including custom projects.
    . ./.env.hostinger
  fi
  cid="$(docker ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-linux}" --filter 'label=com.docker.compose.service=api')" || exit 1
  count="$(printf '%s\n' "$cid" | sed '/^$/d' | wc -l)"
  [ "$count" -eq 1 ] || { echo '[SCENOVA] expected exactly one running API container'; exit 1; }
  image="$(docker inspect --format '{{.Image}}' "$cid")" || exit 1
  [ -z "$expected_image" ] || [ "$image" = "$expected_image" ] || { echo '[SCENOVA] API container still uses the previous image'; exit 1; }
  revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$cid")" || exit 1
  source_label="$(docker inspect --format '{{index .Config.Labels "io.scenova.api.source-sha256"}}' "$cid")" || exit 1
  build="$(docker inspect --format '{{index .Config.Labels "io.scenova.api.build-id"}}' "$cid")" || exit 1
  [ "$revision" = "$sha" ] && [ "$source_label" = "$source_hash" ] || { echo '[SCENOVA] running API revision/source does not match origin/main'; exit 1; }
  [ -z "$expected_build" ] || [ "$build" = "$expected_build" ] || { echo '[SCENOVA] API build ID is stale'; exit 1; }
  # Stream the verifier from the trusted checkout, never from the old image.
  # Explicit failures are essential: errexit is disabled when this function is
  # used in the timer's `if verify_api_runtime ...` condition.
  docker exec -i -w /app "$cid" node - verify "$sha" "$source_hash" "$build" < scripts/api-build-integrity.cjs || exit 1
  docker exec "$cid" node -e '
    const fs=require("fs");
    const cmd=fs.readFileSync("/proc/1/cmdline","utf8").split("\0").filter(Boolean);
    if(cmd.length!==2 || !cmd[0].endsWith("node") || cmd[1]!=="apps/api/dist/main.js") process.exit(1);
    fetch("http://127.0.0.1:4000/api/health",{signal:AbortSignal.timeout(4000)})
      .then(async r=>{const b=await r.json();if(!r.ok||b.ok!==true||b.service!=="bot-api")process.exit(1)})
      .catch(()=>process.exit(1));' || exit 1
  state="$(docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")" || exit 1
  [ "$state" = 'true false healthy' ] || { echo "[SCENOVA] API is not healthy: $state"; exit 1; }
  echo "[SCENOVA] running API verified: $cid image=$image commit=$sha"
)
