#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:4000/api}"
PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-bot}"
PGDATABASE="${PGDATABASE:-bot}"
export PGPASSWORD="${PGPASSWORD:-bot}"
WORKER_KEY="phase3-worker-key"
RUNNER_ID="phase3-ci-cloud"

sql() {
  psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -Atqc "$1"
}

json_post() {
  local url="$1"; shift
  curl -fsS -X POST "$url" -H 'content-type: application/json' "$@"
}

# The Phase 3 fixture intentionally applies only the minimal historical schema.
# Current slot selection/Cloud cutoff logic also reads access-group grants, so
# create the two read-only entitlement tables used by those queries.
sql "create table if not exists access_groups (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null,
  enabled boolean not null default true
);
create table if not exists access_group_grants (
  id uuid primary key default gen_random_uuid(),
  access_group_id uuid not null references access_groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  mode varchar(16) not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status varchar(20) not null default 'ACTIVE'
);
alter table trial_grants
  add column if not exists access_group_id uuid references access_groups(id) on delete set null;"

echo '[phase3] register user and create primary Local slot'
REGISTER=$(json_post "$BASE/auth/register" -d '{"email":"phase3-migration@scenova.test","password":"Migration123!"}')
TOKEN=$(printf '%s' "$REGISTER" | jq -r '.token')
test -n "$TOKEN"
DASH=$(curl -fsS "$BASE/bot/dashboard" -H "authorization: Bearer $TOKEN")
USER_ID=$(printf '%s' "$DASH" | jq -r '.user.id')
LOCAL_SLOT=$(printf '%s' "$DASH" | jq -r '.selectedSlot.id')
test -n "$USER_ID"
test -n "$LOCAL_SLOT"

echo '[phase3] enroll Local Agent 1.0.9 and bind Demo MT5'
PREP=$(json_post "$BASE/bot/installers/windows" -H "authorization: Bearer $TOKEN" -d "{\"slotId\":\"$LOCAL_SLOT\"}")
CODE=$(printf '%s' "$PREP" | jq -r '.code')
test -n "$CODE"
ENROLL=$(json_post "$BASE/installer/enroll" -d "{\"code\":\"$CODE\",\"devicePublicId\":\"phase3-local-device-001\",\"deviceSecret\":\"phase3-local-device-secret-123456789\",\"hostname\":\"PHASE3-PC\",\"terminalPath\":\"C:\\\\MT5\\\\TerminalData\"}")
INSTANCE=$(printf '%s' "$ENROLL" | jq -r '.instanceId')
LOCAL_TOKEN=$(printf '%s' "$ENROLL" | jq -r '.installToken')
test -n "$INSTANCE"
test -n "$LOCAL_TOKEN"

EA_HASH=$(sha256sum /tmp/FastBasketBot.ex5 | awk '{print $1}')
json_post "$BASE/ea/agent-heartbeat" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN\",\"agentVersion\":\"1.0.9\",\"terminalPath\":\"C:\\\\MT5\\\\TerminalData\",\"eaHash\":\"$EA_HASH\",\"hostname\":\"PHASE3-PC\",\"devicePublicId\":\"phase3-local-device-001\",\"deviceSecret\":\"phase3-local-device-secret-123456789\"}" >/dev/null
json_post "$BASE/ea/heartbeat" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN\",\"state\":\"STOPPED\",\"metrics\":{\"accountNumber\":\"300001\",\"broker\":\"SCENOVA\",\"eaVersion\":\"1.0.10\",\"productVersion\":\"1.0.10\",\"server\":\"SCENOVA-Demo\",\"positions\":0}}" >/dev/null

ACCOUNT_ID=$(sql "select mt5_account_id from bot_instances where id='$INSTANCE';")
test -n "$ACCOUNT_ID"
SETTINGS_ID_BEFORE=$(sql "select bot_instance_id from bot_settings where bot_instance_id='$INSTANCE';")
test "$SETTINGS_ID_BEFORE" = "$INSTANCE"

# Create a paid/reserved Cloud target without involving payment-provider network calls.
CLOUD_SUB=$(sql "insert into subscriptions(user_id,plan_id,status,starts_at,expires_at,activated_by) select '$USER_ID',id,'ACTIVE',now(),now()+interval '30 days','PHASE3_CI' from plans where code='CLOUD_30D' returning id;")
CLOUD_SLOT=$(sql "insert into license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label) values('$USER_ID','$USER_ID','$CLOUD_SUB','CLOUD',99,'PERSONAL','ACTIVE','Phase3 Cloud Target') returning id;")
WORKER_HASH=$(printf '%s' "$WORKER_KEY" | sha256sum | awk '{print $1}')
sql "insert into worker_nodes(runner_id,region,hostname,capacity,active_instances,status,last_seen_at,accepting_jobs,worker_key_hash,telemetry) values('$RUNNER_ID','ci','PHASE3-VPS',2,0,'ONLINE',now(),true,'$WORKER_HASH','{\"templateReady\":true,\"version\":\"1.1.0\"}'::jsonb) on conflict(runner_id) do update set last_seen_at=now(),capacity=2,active_instances=0,accepting_jobs=true,worker_key_hash=excluded.worker_key_hash,telemetry=excluded.telemetry;" >/dev/null
sql "insert into cloud_orders(user_id,months,amount,status,runner_id,slot_id,subscription_id,charge_id,paid_at) values('$USER_ID',1,100,'PAID','$RUNNER_ID','$CLOUD_SLOT','$CLOUD_SUB','phase3-ci-charge',now());" >/dev/null

echo '[phase3] Local -> Cloud request enters STOPPING_LOCAL'
REQ1=$(json_post "$BASE/runtime-migration/request" -H "authorization: Bearer $TOKEN" -d "{\"sourceSlotId\":\"$LOCAL_SLOT\",\"targetSlotId\":\"$CLOUD_SLOT\",\"tradingPassword\":\"DemoPass123!\",\"confirmFlat\":true,\"confirmSwitch\":true}")
MIG1=$(printf '%s' "$REQ1" | jq -r '.id')
test "$(printf '%s' "$REQ1" | jq -r '.state')" = "STOPPING_LOCAL"
test -n "$MIG1"

# DB-level invariant: no API/UI bypass may START while migration is active.
if psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "update bot_instances set desired_state='RUNNING' where id='$INSTANCE';" >/tmp/phase3-start.out 2>/tmp/phase3-start.err; then
  echo 'START guard failed: desired_state RUNNING was accepted during migration'
  exit 1
fi
grep -qi 'runtime migration is active' /tmp/phase3-start.err

POLL1=$(json_post "$BASE/runtime-migration/agent/poll" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN\"}")
test "$(printf '%s' "$POLL1" | jq -r '.action')" = "STOP_LOCAL_RUNTIME"
GEN1=$(printf '%s' "$POLL1" | jq -r '.executionGeneration')
test "$GEN1" = "1"

CONFIRM1=$(json_post "$BASE/runtime-migration/agent/confirm" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN\",\"migrationId\":\"$MIG1\",\"executionGeneration\":$GEN1,\"result\":\"STOP_CONFIRMED\"}")
test "$(printf '%s' "$CONFIRM1" | jq -r '.state')" = "TARGET_PROVISIONING"
test "$(printf '%s' "$CONFIRM1" | jq -r '.removeProfile')" = "true"

MODE1=$(sql "select mode from bot_instances where id='$INSTANCE';")
SLOT1=$(sql "select slot_id from bot_instances where id='$INSTANCE';")
GEN_AFTER_LOCAL=$(sql "select execution_generation from bot_instances where id='$INSTANCE';")
RUNNER1=$(sql "select runner_id from bot_instances where id='$INSTANCE';")
COUNT_INSTANCE=$(sql "select count(*) from bot_instances where mt5_account_id='$ACCOUNT_ID';")
test "$MODE1" = "CLOUD"
test "$SLOT1" = "$CLOUD_SLOT"
test "$GEN_AFTER_LOCAL" = "2"
test "$RUNNER1" = "$RUNNER_ID"
test "$COUNT_INSTANCE" = "1"

OLD_LOCAL_HTTP=$(curl -sS -o /tmp/phase3-old-local.json -w '%{http_code}' -X POST "$BASE/runtime-migration/agent/poll" -H 'content-type: application/json' -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN\"}")
test "$OLD_LOCAL_HTTP" != "200"

# Worker receives the new generation/token only after the verified Local stop handoff.
ASSIGNED=$(json_post "$BASE/worker/assigned" -H "x-worker-key: $WORKER_KEY" -d "{\"runnerId\":\"$RUNNER_ID\"}")
CLOUD_TOKEN=$(printf '%s' "$ASSIGNED" | jq -r --arg id "$INSTANCE" '.jobs[] | select(.instanceId==$id) | .installToken')
WORKER_GENERATION=$(printf '%s' "$ASSIGNED" | jq -r --arg id "$INSTANCE" '.jobs[] | select(.instanceId==$id) | .executionGeneration')
test -n "$CLOUD_TOKEN"
test "$CLOUD_TOKEN" != "$LOCAL_TOKEN"
test "$WORKER_GENERATION" = "2"

json_post "$BASE/ea/heartbeat" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$CLOUD_TOKEN\",\"state\":\"STOPPED\",\"metrics\":{\"accountNumber\":\"300001\",\"eaVersion\":\"1.0.10\",\"productVersion\":\"1.0.10\",\"server\":\"SCENOVA-Demo\",\"positions\":0}}" >/dev/null
# A migration can remain TARGET_PROVISIONING until the next dashboard/status read.
# Simulate the customer returning later, after the successful target heartbeat is no
# longer fresh. Historical post-handoff readiness must still close the migration.
sql "update runtime_migrations set lease_rotated_at=now()-interval '10 minutes' where id='$MIG1'; update bot_instances set last_seen_at=now()-interval '5 minutes' where id='$INSTANCE';" >/dev/null
STATUS1=$(curl -fsS "$BASE/runtime-migration/status" -H "authorization: Bearer $TOKEN")
test "$(printf '%s' "$STATUS1" | jq -r --arg id "$MIG1" '.migrations[] | select(.id==$id) | .state')" = "COMPLETED"

echo '[phase3] Cloud -> Local uses Worker STOP_CONFIRMED before runner release'
LOCAL_SUB=$(sql "insert into subscriptions(user_id,plan_id,status,starts_at,expires_at,activated_by) select '$USER_ID',id,'ACTIVE',now(),now()+interval '30 days','PHASE3_CI' from plans where code='LOCAL_30D' returning id;")
sql "update license_slots set subscription_id='$LOCAL_SUB',status='ACTIVE' where id='$LOCAL_SLOT';" >/dev/null
# Keep the Worker and EA heartbeats fresh for the verified release gate.
json_post "$BASE/worker/heartbeat" -H "x-worker-key: $WORKER_KEY" -d "{\"runnerId\":\"$RUNNER_ID\",\"hostname\":\"PHASE3-VPS\",\"capacity\":2,\"activeInstances\":1,\"telemetry\":{\"templateReady\":true,\"version\":\"1.1.0\"}}" >/dev/null
json_post "$BASE/ea/heartbeat" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$CLOUD_TOKEN\",\"state\":\"STOPPED\",\"metrics\":{\"accountNumber\":\"300001\",\"eaVersion\":\"1.0.10\",\"productVersion\":\"1.0.10\",\"server\":\"SCENOVA-Demo\",\"positions\":0}}" >/dev/null

REQ2=$(json_post "$BASE/runtime-migration/request" -H "authorization: Bearer $TOKEN" -d "{\"sourceSlotId\":\"$CLOUD_SLOT\",\"targetSlotId\":\"$LOCAL_SLOT\",\"confirmFlat\":true,\"confirmSwitch\":true}")
MIG2=$(printf '%s' "$REQ2" | jq -r '.id')
test "$(printf '%s' "$REQ2" | jq -r '.state')" = "STOPPING_CLOUD"
test "$(sql "select runner_id from bot_instances where id='$INSTANCE';")" = "$RUNNER_ID"

WCMD=$(json_post "$BASE/worker/commands" -H "x-worker-key: $WORKER_KEY" -d "{\"runnerId\":\"$RUNNER_ID\"}")
CMD_ID=$(printf '%s' "$WCMD" | jq -r '.command.id')
CMD_GEN=$(printf '%s' "$WCMD" | jq -r '.command.executionGeneration')
test "$(printf '%s' "$WCMD" | jq -r '.command.name')" = "STOP_INSTANCE"
test "$CMD_GEN" = "2"

json_post "$BASE/worker/command-result" -H "x-worker-key: $WORKER_KEY" -d "{\"runnerId\":\"$RUNNER_ID\",\"commandId\":$CMD_ID,\"instanceId\":\"$INSTANCE\",\"executionGeneration\":$CMD_GEN,\"result\":\"STOP_CONFIRMED\"}" >/dev/null
# STOP_CONFIRMED alone must not release the runner. Reconcile owns the atomic lease handoff.
test "$(sql "select runner_id from bot_instances where id='$INSTANCE';")" = "$RUNNER_ID"

REC2=$(json_post "$BASE/runtime-migration/$MIG2/reconcile" -H "authorization: Bearer $TOKEN" -d '{}')
test "$(printf '%s' "$REC2" | jq -r '.state')" = "WAITING_LOCAL_INSTALL"
test "$(sql "select mode from bot_instances where id='$INSTANCE';")" = "LOCAL"
test "$(sql "select slot_id from bot_instances where id='$INSTANCE';")" = "$LOCAL_SLOT"
test "$(sql "select execution_generation from bot_instances where id='$INSTANCE';")" = "3"
test "$(sql "select coalesce(runner_id,'') from bot_instances where id='$INSTANCE';")" = ""
test "$(sql "select count(*) from mt5_credentials where mt5_account_id='$ACCOUNT_ID';")" = "0"
test "$(sql "select count(*) from bot_instance_secrets where bot_instance_id='$INSTANCE';")" = "0"
test "$(sql "select count(*) from bot_instances where mt5_account_id='$ACCOUNT_ID';")" = "1"
test "$(sql "select bot_instance_id from bot_settings where bot_instance_id='$INSTANCE';")" = "$INSTANCE"

OLD_CLOUD_HTTP=$(curl -sS -o /tmp/phase3-old-cloud.json -w '%{http_code}' -X POST "$BASE/ea/heartbeat" -H 'content-type: application/json' -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$CLOUD_TOKEN\",\"state\":\"STOPPED\",\"metrics\":{\"accountNumber\":\"300001\",\"server\":\"SCENOVA-Demo\",\"positions\":0}}")
test "$OLD_CLOUD_HTTP" != "200"

echo '[phase3] fresh Local installer enrollment completes the return handoff'
PREP2=$(json_post "$BASE/bot/installers/windows" -H "authorization: Bearer $TOKEN" -d "{\"slotId\":\"$LOCAL_SLOT\"}")
CODE2=$(printf '%s' "$PREP2" | jq -r '.code')
ENROLL2=$(json_post "$BASE/installer/enroll" -d "{\"code\":\"$CODE2\",\"devicePublicId\":\"phase3-local-device-002\",\"deviceSecret\":\"phase3-return-device-secret-123456789\",\"hostname\":\"PHASE3-PC-RETURN\",\"terminalPath\":\"C:\\\\MT5-RETURN\\\\TerminalData\"}")
LOCAL_TOKEN2=$(printf '%s' "$ENROLL2" | jq -r '.installToken')
test "$(printf '%s' "$ENROLL2" | jq -r '.instanceId')" = "$INSTANCE"
test -n "$LOCAL_TOKEN2"
test "$LOCAL_TOKEN2" != "$CLOUD_TOKEN"

json_post "$BASE/ea/agent-heartbeat" -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$LOCAL_TOKEN2\",\"agentVersion\":\"1.0.9\",\"terminalPath\":\"C:\\\\MT5-RETURN\\\\TerminalData\",\"eaHash\":\"$EA_HASH\",\"hostname\":\"PHASE3-PC-RETURN\",\"devicePublicId\":\"phase3-local-device-002\",\"deviceSecret\":\"phase3-return-device-secret-123456789\"}" >/dev/null
STATUS2=$(curl -fsS "$BASE/runtime-migration/status" -H "authorization: Bearer $TOKEN")
test "$(printf '%s' "$STATUS2" | jq -r --arg id "$MIG2" '.migrations[] | select(.id==$id) | .state')" = "COMPLETED"
test "$(sql "select id from bot_instances where mt5_account_id='$ACCOUNT_ID';")" = "$INSTANCE"

echo 'SCENOVA Phase 3 Local <-> Cloud round-trip integration PASS'
