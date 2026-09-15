#!/usr/bin/env bash
set -euo pipefail

: "${BASE:=http://127.0.0.1:4000/api}"
export PGPASSWORD=bot

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "expected '$2' but got '$1'" >&2
    exit 1
  fi
}

EMAIL="closeall-reconcile-$(date +%s)@scenova.test"
REG=$(curl -fsS -X POST "$BASE/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Integration123!\"}")
TOKEN=$(printf '%s' "$REG" | jq -r '.token')
USER_ID=$(printf '%s' "$REG" | jq -r '.user.id')
DASH=$(curl -fsS "$BASE/bot/dashboard" -H "authorization: Bearer $TOKEN")
SLOT_ID=$(printf '%s' "$DASH" | jq -r '.selectedSlot.id')

test -n "$USER_ID"
test -n "$SLOT_ID"

ACCOUNT='990002'
SERVER='CI-Reconcile'
INSTALL_TOKEN='closeall-reconcile-install-token-1234567890'
MT5_ID=$(psql -h localhost -U bot -d bot -Atq -c "insert into mt5_accounts(user_id,account_number,broker,broker_server,mode,status) values('$USER_ID','$ACCOUNT','CI','$SERVER','LOCAL','ACTIVE') returning id;" | head -n1)
INSTANCE=$(psql -h localhost -U bot -d bot -Atq -c "insert into bot_instances(mt5_account_id,mode,install_token_hash,desired_state,actual_state,slot_id,metrics) values('$MT5_ID','LOCAL',encode(digest('$INSTALL_TOKEN','sha256'),'hex'),'STOPPED','STOPPED','$SLOT_ID','{\"positions\":1}'::jsonb) returning id;" | head -n1)
CLOSE_ID=$(psql -h localhost -U bot -d bot -Atq -c "insert into bot_commands(bot_instance_id,command,status) values('$INSTANCE','CLOSE_ALL','PENDING') returning id;" | head -n1)

test -n "$INSTANCE"
test -n "$CLOSE_ID"

echo '[closeall-reconcile] authenticated flat EA heartbeat clears lost CLOSE_ALL ACK'
HB=$(curl -fsS -X POST "$BASE/ea/heartbeat" \
  -H 'content-type: application/json' \
  -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$INSTALL_TOKEN\",\"state\":\"STOPPED\",\"metrics\":{\"positions\":0,\"accountNumber\":\"$ACCOUNT\",\"server\":\"$SERVER\",\"broker\":\"CI\"}}")
test "$(printf '%s' "$HB" | jq -r '.ok')" = 'true'

assert_eq "$(psql -h localhost -U bot -d bot -Atc "select status from bot_commands where id=$CLOSE_ID;")" "ACKED"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select payload->>'ackSource' from bot_commands where id=$CLOSE_ID;")" "EA"
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select payload->>'ackReason' from bot_commands where id=$CLOSE_ID;")" "FLAT_HEARTBEAT_RECONCILE"
AUDIT_COUNT=$(psql -h localhost -U bot -d bot -Atc "select count(*) from audit_logs where entity_id='$INSTANCE' and action='CLOSE_ALL_FLAT_HEARTBEAT_RECONCILE';")
assert_eq "$AUDIT_COUNT" "1"

echo '[closeall-reconcile] PASS'
