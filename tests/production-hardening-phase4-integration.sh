#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:4000/api}"
ADMIN_KEY="${ADMIN_KEY:-phase4-admin}"
WORKER_KEY="${WORKER_KEY:-phase4-worker-key}"
RUNNER="phase4-runner"

psqlq(){ psql -v ON_ERROR_STOP=1 -Atqc "$1"; }
json(){ jq -r "$1"; }
worker_post(){ local route="$1" body="$2"; curl -fsS -X POST "$BASE/worker/$route" -H "x-worker-key: $WORKER_KEY" -H 'content-type: application/json' -d "$body"; }
admin_post(){ local route="$1" body="$2"; curl -fsS -X POST "$BASE/admin/production-hardening/$route" -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' -d "$body"; }

printf '[phase4] seed Cloud runtime and Worker\n'
USER_ID=$(psqlq "insert into users(user_code,email,password_hash,role,status) values('PH4USER','phase4@scenova.test','x','OWNER','ACTIVE') returning id;")
CLOUD_SLOT=$(psqlq "insert into license_slots(owner_user_id,assigned_user_id,mode,slot_number,slot_type,status,label) values('$USER_ID','$USER_ID','CLOUD',1,'OWNER','ACTIVE','Phase4 Cloud') returning id;")
LOCAL_SLOT=$(psqlq "insert into license_slots(owner_user_id,assigned_user_id,mode,slot_number,slot_type,status,label) values('$USER_ID','$USER_ID','LOCAL',1,'OWNER','ACTIVE','Phase4 Local') returning id;")
ACCOUNT_ID=$(psqlq "insert into mt5_accounts(user_id,account_number,broker,broker_server,mode,status) values('$USER_ID','940001','SCENOVA','SCENOVA-Demo','CLOUD','ACTIVE') returning id;")
INSTANCE_ID=$(psqlq "insert into bot_instances(mt5_account_id,mode,install_token_hash,desired_state,actual_state,runner_id,lock_owner,slot_id,execution_generation,runtime_stop_state,metrics) values('$ACCOUNT_ID','CLOUD','phase4-token-anchor','STOPPED','OFFLINE','$RUNNER','$RUNNER','$CLOUD_SLOT',5,'NONE','{\"positions\":0}'::jsonb) returning id;")
psqlq "insert into worker_nodes(runner_id,region,hostname,capacity,active_instances,status,last_seen_at,accepting_jobs,worker_key_hash,telemetry) values('$RUNNER','Thailand','PH4-VPS',4,1,'ONLINE',now(),true,encode(digest('$WORKER_KEY','sha256'),'hex'),'{}'::jsonb);" >/dev/null

HEALTHY='{"runnerId":"phase4-runner","hostname":"PH4-VPS","activeInstances":1,"telemetry":{"templateReady":true,"version":"1.2.0","cpuPercent":20,"ramUsedGb":4,"ramTotalGb":16,"diskFreeGb":40,"diskTotalGb":80}}'
worker_post heartbeat "$HEALTHY" >/dev/null
test "$(psqlq "select health_state from worker_nodes where runner_id='$RUNNER';")" = "HEALTHY"
test "$(psqlq "select capacity_blocked from worker_nodes where runner_id='$RUNNER';")" = "f"

printf '[phase4] bounded recovery keeps lease/generation unchanged\n'
for attempt in 1 2 3; do
  if [ "$attempt" -gt 1 ]; then psqlq "update bot_instances set cloud_recovery_next_at=now()-interval '1 second' where id='$INSTANCE_ID';" >/dev/null; fi
  R=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
  test "$(printf '%s' "$R" | json '.allow')" = "true"
  test "$(printf '%s' "$R" | json '.attempt')" = "$attempt"
done

test "$(psqlq "select execution_generation from bot_instances where id='$INSTANCE_ID';")" = "5"
test "$(psqlq "select install_token_hash from bot_instances where id='$INSTANCE_ID';")" = "phase4-token-anchor"
psqlq "update bot_instances set cloud_recovery_next_at=now()-interval '1 second' where id='$INSTANCE_ID';" >/dev/null
CIRCUIT=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$CIRCUIT" | json '.allow')" = "false"
test "$(printf '%s' "$CIRCUIT" | json '.reason')" = "RECOVERY_CIRCUIT_OPEN"
test "$(psqlq "select cloud_recovery_state from bot_instances where id='$INSTANCE_ID';")" = "CIRCUIT_OPEN"

SNAP=$(curl -fsS "$BASE/admin/production-hardening" -H "x-admin-key: $ADMIN_KEY")
test "$(printf '%s' "$SNAP" | jq -r --arg id "$INSTANCE_ID" '[.incidents[]|select(.bot_instance_id==$id and .category=="RECOVERY_CIRCUIT_OPEN" and .state=="OPEN")]|length')" = "1"
admin_post "instances/$INSTANCE_ID/recovery-reset" '{}' >/dev/null
test "$(psqlq "select cloud_recovery_state||':'||cloud_recovery_attempts from bot_instances where id='$INSTANCE_ID';")" = "IDLE:0"

printf '[phase4] quarantine and global pause block recovery without changing ownership\n'
admin_post "nodes/$RUNNER/quarantine" '{"quarantined":true,"reason":"phase4 integration"}' >/dev/null
Q=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$Q" | json '.reason')" = "NODE_QUARANTINED"
test "$(psqlq "select runner_id from bot_instances where id='$INSTANCE_ID';")" = "$RUNNER"
admin_post "nodes/$RUNNER/quarantine" '{"quarantined":false,"reason":"clear"}' >/dev/null
worker_post heartbeat "$HEALTHY" >/dev/null
admin_post controls '{"cloudProvisioningPaused":false,"cloudRecoveryPaused":true,"reason":"phase4 pause test"}' >/dev/null
P=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$P" | json '.reason')" = "GLOBAL_RECOVERY_PAUSED"
admin_post controls '{"cloudProvisioningPaused":false,"cloudRecoveryPaused":false,"reason":"resume"}' >/dev/null

printf '[phase4] capacity guard opens/resolves incident and blocks recovery\n'
HOT='{"runnerId":"phase4-runner","hostname":"PH4-VPS","activeInstances":1,"telemetry":{"templateReady":true,"version":"1.2.0","cpuPercent":95,"ramUsedGb":4,"ramTotalGb":16,"diskFreeGb":40,"diskTotalGb":80}}'
worker_post heartbeat "$HOT" >/dev/null
test "$(psqlq "select capacity_blocked from worker_nodes where runner_id='$RUNNER';")" = "t"
test "$(psqlq "select capacity_block_reason from worker_nodes where runner_id='$RUNNER';")" = "CPU_HIGH"
H=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$H" | json '.reason')" = "CPU_HIGH"
OPEN_CAP=$(psqlq "select count(*) from runtime_incidents where incident_key='worker:$RUNNER:capacity' and state='OPEN';")
test "$OPEN_CAP" = "1"
worker_post heartbeat "$HEALTHY" >/dev/null
RESOLVED_CAP=$(psqlq "select count(*) from runtime_incidents where incident_key='worker:$RUNNER:capacity' and state='RESOLVED';")
test "$RESOLVED_CAP" = "1"

printf '[phase4] migration, runtime-stop and stale generation are fail-closed\n'
MIG=$(psqlq "insert into runtime_migrations(user_id,bot_instance_id,source_slot_id,target_slot_id,source_mode,target_mode,state,execution_generation,source_runner_id) values('$USER_ID','$INSTANCE_ID','$CLOUD_SLOT','$LOCAL_SLOT','CLOUD','LOCAL','STOPPING_CLOUD',5,'$RUNNER') returning id;")
M=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$M" | json '.reason')" = "MIGRATION_ACTIVE"
psqlq "delete from runtime_migrations where id='$MIG';" >/dev/null
psqlq "update bot_instances set runtime_stop_state='STOP_REQUESTED' where id='$INSTANCE_ID';" >/dev/null
S=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":5}")
test "$(printf '%s' "$S" | json '.reason')" = "RUNTIME_STOP_ACTIVE"
psqlq "update bot_instances set runtime_stop_state='NONE' where id='$INSTANCE_ID';" >/dev/null
G=$(worker_post recovery-check "{\"runnerId\":\"$RUNNER\",\"instanceId\":\"$INSTANCE_ID\",\"executionGeneration\":4}")
test "$(printf '%s' "$G" | json '.reason')" = "STALE_GENERATION"

printf '[phase4] global provisioning pause removes advertised capacity\n'
admin_post controls '{"cloudProvisioningPaused":true,"cloudRecoveryPaused":false,"reason":"capacity freeze"}' >/dev/null
CLOUD=$(curl -fsS "$BASE/admin/cloud" -H "x-admin-key: $ADMIN_KEY")
test "$(printf '%s' "$CLOUD" | json '.available')" = "0"
test "$(printf '%s' "$CLOUD" | json '.provisioningPaused')" = "true"
admin_post controls '{"cloudProvisioningPaused":false,"cloudRecoveryPaused":false,"reason":"resume"}' >/dev/null

echo 'SCENOVA Phase 4 production hardening integration PASS'
