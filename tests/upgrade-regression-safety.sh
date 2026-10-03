#!/usr/bin/env bash
set -euo pipefail

: "${BASE:=http://127.0.0.1:4000/api}"
: "${ADMIN_KEY:=integration-admin}"
export PGPASSWORD=bot

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "expected '$2' but got '$1'" >&2
    exit 1
  fi
}

register() {
  local email="$1"
  curl -fsS -X POST "$BASE/auth/register" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Integration123!\"}"
}

login() {
  local email="$1"
  curl -fsS -X POST "$BASE/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Integration123!\"}"
}

echo '[regression] retired customer multi-slot plans cannot be sold'
RETIRED_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code in ('LOCAL_3SLOT','LOCAL_5SLOT','PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50') and active=true;")
assert_eq "$RETIRED_ACTIVE" "0"
LOCAL_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code='LOCAL_30D' and active=true;")
assert_eq "$LOCAL_ACTIVE" "1"

echo '[regression] create isolated fake MT5 instance for FORCE FLAT tests'
REG=$(register 'upgrade-regression-user@scenova.test')
USER_TOKEN=$(printf '%s' "$REG" | jq -r '.token')
USER_ID=$(printf '%s' "$REG" | jq -r '.user.id')
DASH=$(curl -fsS "$BASE/bot/dashboard" -H "authorization: Bearer $USER_TOKEN")
SLOT_ID=$(printf '%s' "$DASH" | jq -r '.selectedSlot.id')
test -n "$USER_ID"
test -n "$SLOT_ID"

MT5_ID=$(psql -h localhost -U bot -d bot -Atq -c "insert into mt5_accounts(user_id,account_number,broker,broker_server,mode,status) values('$USER_ID','990001','CI','CI-Reg-Safety','LOCAL','ACTIVE') returning id;" | head -n1)
INSTALL_TOKEN='regression-install-token-1234567890'
INSTANCE=$(psql -h localhost -U bot -d bot -Atq -c "insert into bot_instances(mt5_account_id,mode,install_token_hash,desired_state,actual_state,slot_id,metrics) values('$MT5_ID','LOCAL',encode(digest('$INSTALL_TOKEN','sha256'),'hex'),'STOPPED','OFFLINE','$SLOT_ID','{\"positions\":0}'::jsonb) returning id;" | head -n1)
test -n "$INSTANCE"

echo '[regression] ADMIN JWT cannot invoke FORCE FLAT ALL'
register 'upgrade-regression-admin@scenova.test' >/dev/null
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update users set role='ADMIN' where email='upgrade-regression-admin@scenova.test';" >/dev/null
ADMIN_LOGIN=$(login 'upgrade-regression-admin@scenova.test')
ADMIN_TOKEN=$(printf '%s' "$ADMIN_LOGIN" | jq -r '.token')
ADMIN_HTTP=$(curl -sS -o /tmp/force-flat-admin.json -w '%{http_code}' \
  -X POST "$BASE/admin/maintenance/force-flat-all" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"confirmation":"FORCE FLAT ALL"}')
assert_eq "$ADMIN_HTTP" "403"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from system_maintenance where id=1;")" "OFF"

echo '[regression] Owner/key requests still require exact confirmation phrase'
register 'upgrade-regression-owner@scenova.test' >/dev/null
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update users set role='OWNER' where email='upgrade-regression-owner@scenova.test';" >/dev/null
OWNER_LOGIN=$(login 'upgrade-regression-owner@scenova.test')
OWNER_TOKEN=$(printf '%s' "$OWNER_LOGIN" | jq -r '.token')
OWNER_BAD_HTTP=$(curl -sS -o /tmp/force-flat-owner-bad.json -w '%{http_code}' \
  -X POST "$BASE/admin/maintenance/force-flat-all" \
  -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  -d '{"confirmation":"NO"}')
assert_eq "$OWNER_BAD_HTTP" "409"
KEY_BAD_HTTP=$(curl -sS -o /tmp/force-flat-key-bad.json -w '%{http_code}' \
  -X POST "$BASE/admin/maintenance/force-flat-all" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"confirmation":"NO"}')
assert_eq "$KEY_BAD_HTTP" "409"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from system_maintenance where id=1;")" "OFF"

echo '[regression] customer self Force Flat queues even when cached Position count is already zero'
SELF_FORCE=$(curl -fsS -X POST "$BASE/bot/close-all?slotId=$SLOT_ID" \
  -H "authorization: Bearer $USER_TOKEN")
assert_eq "$(printf '%s' "$SELF_FORCE" | jq -r '.state')" "STOPPED"
SELF_CLOSE_ID=$(psql -h localhost -U bot -d bot -Atc "select id from bot_commands where bot_instance_id='$INSTANCE' and command='CLOSE_ALL' and status in ('PENDING','DELIVERED') order by id desc limit 1;")
test -n "$SELF_CLOSE_ID"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select payload->>'source' from bot_commands where id=$SELF_CLOSE_ID;")" "CUSTOMER_FORCE_FLAT_RESET"
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_commands set status='ACKED',acked_at=now() where id=$SELF_CLOSE_ID;" >/dev/null

echo '[regression] Admin per-account Force Flat queues even when cached Position count is zero'
ACCOUNT_FORCE=$(curl -fsS -X POST "$BASE/admin/maintenance/close-instance" \
  -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  -d "{\"instanceId\":\"$INSTANCE\"}")
test "$(printf '%s' "$ACCOUNT_FORCE" | jq -r '.ok')" = 'true'
ACCOUNT_CLOSE_ID=$(psql -h localhost -U bot -d bot -Atc "select id from bot_commands where bot_instance_id='$INSTANCE' and command='CLOSE_ALL' and status in ('PENDING','DELIVERED') order by id desc limit 1;")
test -n "$ACCOUNT_CLOSE_ID"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select payload->>'forceReset' from bot_commands where id=$ACCOUNT_CLOSE_ID;")" "true"
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_commands set status='ACKED',acked_at=now() where id=$ACCOUNT_CLOSE_ID;" >/dev/null

STALE_COMMAND_ID=$(psql -h localhost -U bot -d bot -Atq -c "insert into bot_commands(bot_instance_id,command,status,payload) values('$INSTANCE','UPDATE_SETTINGS','PENDING','{}'::jsonb) returning id;" | head -n1)
test -n "$STALE_COMMAND_ID"

echo '[regression] simulate a market-closed Position that cannot be flattened yet'
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_instances set metrics=coalesce(metrics,'{}'::jsonb) || '{\"positions\":1,\"accountScenovaPositions\":1,\"accountScenovaPendingOrders\":0,\"accountFlatConfirmed\":false}'::jsonb where id='$INSTANCE';" >/dev/null

echo '[regression] Owner FORCE FLAT freezes starts, supersedes stale commands and leaves durable CLOSE_ALL'
FORCE=$(curl -fsS -X POST "$BASE/admin/maintenance/force-flat-all" \
  -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  -d '{"confirmation":"FORCE FLAT ALL"}')
test "$(printf '%s' "$FORCE" | jq -r '.blockStarts')" = 'true'
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from system_maintenance where id=1;")" "DRAINING"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select desired_state from bot_instances where id='$INSTANCE';")" "STOPPED"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from bot_commands where id=$STALE_COMMAND_ID;")" "ACKED"
CLOSE_ID=$(psql -h localhost -U bot -d bot -Atc "select id from bot_commands where bot_instance_id='$INSTANCE' and command='CLOSE_ALL' and status in ('PENDING','DELIVERED') order by id desc limit 1;")
test -n "$CLOSE_ID"
test "$(printf '%s' "$FORCE" | jq -r '.summary.unresolvedCloseAll')" -ge 1

echo '[regression] maintenance remains in DRAINING until the owner explicitly resumes'
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from system_maintenance where id=1;")" "DRAINING"

echo '[regression] application and DB layers both block every Start path during maintenance'
START_HTTP=$(curl -sS -o /tmp/start-during-maint.json -w '%{http_code}' \
  -X POST "$BASE/bot/start?slotId=$SLOT_ID" -H "authorization: Bearer $USER_TOKEN")
assert_eq "$START_HTTP" "503"
RECOVER_HTTP=$(curl -sS -o /tmp/recover-during-maint.json -w '%{http_code}' \
  -X POST "$BASE/bot/mt5/recover-start?slotId=$SLOT_ID" -H "authorization: Bearer $USER_TOKEN")
assert_eq "$RECOVER_HTTP" "503"
MANUAL_HTTP=$(curl -sS -o /tmp/manual-during-maint.json -w '%{http_code}' \
  -X POST "$BASE/bot/mt5/manual-action?slotId=$SLOT_ID" \
  -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' \
  -d '{"action":"CONNECT_MT5"}')
assert_eq "$MANUAL_HTTP" "503"

set +e
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_instances set desired_state='RUNNING' where id='$INSTANCE';" >/tmp/guard-state.out 2>&1
STATE_RC=$?
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "insert into bot_commands(bot_instance_id,command) values('$INSTANCE','START');" >/tmp/guard-command.out 2>&1
COMMAND_RC=$?
set -e
test "$STATE_RC" -ne 0
test "$COMMAND_RC" -ne 0
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select desired_state from bot_instances where id='$INSTANCE';")" "STOPPED"

echo '[regression] owner can reopen while CLOSE_ALL is unresolved; affected account stays SAFE_STOP'
RESUME_WITH_OPEN=$(curl -fsS -X POST "$BASE/admin/maintenance/resume" -H "authorization: Bearer $OWNER_TOKEN")
assert_eq "$(printf '%s' "$RESUME_WITH_OPEN" | jq -r '.status')" "OFF"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select desired_state from bot_instances where id='$INSTANCE';")" "SAFE_STOP"
START_AFTER_RESUME_HTTP=$(curl -sS -o /tmp/start-after-maint-resume.json -w '%{http_code}' \
  -X POST "$BASE/bot/start?slotId=$SLOT_ID" -H "authorization: Bearer $USER_TOKEN")
assert_eq "$START_AFTER_RESUME_HTTP" "409"

echo '[regression] legacy/symbol-only ACK cannot clear account-wide CLOSE_ALL'
OLD_ACK=$(curl -fsS -X POST "$BASE/ea/ack" -H 'content-type: application/json' \
  -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$INSTALL_TOKEN\",\"commandId\":$CLOSE_ID,\"state\":\"STOPPED\",\"executionStatus\":\"CI_OLD_CLOSE_ALL_ACK\"}")
test "$(printf '%s' "$OLD_ACK" | jq -r '.ok')" = 'false'
OLD_ACK_STATUS=$(psql -h localhost -U bot -d bot -Atc "select status from bot_commands where id=$CLOSE_ID;")
if [ "$OLD_ACK_STATUS" = "ACKED" ]; then
  echo 'legacy ACK incorrectly cleared CLOSE_ALL' >&2
  exit 1
fi

echo '[regression] account-wide EA proof is required to ACK CLOSE_ALL'
ACK=$(curl -fsS -X POST "$BASE/ea/ack" -H 'content-type: application/json' \
  -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$INSTALL_TOKEN\",\"commandId\":$CLOSE_ID,\"state\":\"STOPPED\",\"executionStatus\":\"FORCE_FLAT_CONFIRMED\",\"accountScenovaPositions\":0,\"accountScenovaPendingOrders\":0,\"accountFlatConfirmed\":true}")
test "$(printf '%s' "$ACK" | jq -r '.ok')" = 'true'
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select payload->>'ackSource' from bot_commands where id=$CLOSE_ID;")" "EA"

echo '[regression] resume remains idempotent after the fake CI instance is flat'
RESUME=$(curl -fsS -X POST "$BASE/admin/maintenance/resume" -H "authorization: Bearer $OWNER_TOKEN")
assert_eq "$(printf '%s' "$RESUME" | jq -r '.status')" "OFF"

echo '[regression] Partner own entitlement is honored by both recovery paths'
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/manual-mt5.controller.ts
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/agent-action.controller.ts
grep -q 'this.maintenance.assertStartAllowed' apps/api/src/manual-mt5.controller.ts
grep -q "bc.payload->>'ackSource'='EA'" apps/api/src/maintenance.service.ts

echo '[regression] PASS'
