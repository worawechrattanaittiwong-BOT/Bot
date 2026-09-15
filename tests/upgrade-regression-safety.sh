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

echo '[regression] retired customer multi-slot plans cannot be sold'
RETIRED_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code in ('LOCAL_3SLOT','LOCAL_5SLOT','PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50') and active=true;")
assert_eq "$RETIRED_ACTIVE" "0"
LOCAL_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code='LOCAL_30D' and active=true;")
assert_eq "$LOCAL_ACTIVE" "1"

# Use an existing disposable CI instance created by the main integration flow.
INSTANCE=$(psql -h localhost -U bot -d bot -Atc "select id from bot_instances order by created_at limit 1;")
test -n "$INSTANCE"
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 <<SQL >/dev/null
update bot_instances set desired_state='STOPPED',actual_state='STOPPED',metrics=coalesce(metrics,'{}'::jsonb)||'{"positions":0}'::jsonb where id='$INSTANCE';
update system_maintenance set status='DRAINING',title='CI FORCE FLAT GUARD',message='regression guard',maintenance_at=now(),force_close_at=now(),force_close=true,updated_at=now() where id=1;
SQL

echo '[regression] database blocks every RUNNING transition during maintenance'
set +e
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_instances set desired_state='RUNNING' where id='$INSTANCE';" >/tmp/guard-state.out 2>&1
STATE_RC=$?
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "insert into bot_commands(bot_instance_id,command) values('$INSTANCE','START');" >/tmp/guard-command.out 2>&1
COMMAND_RC=$?
set -e
test "$STATE_RC" -ne 0
test "$COMMAND_RC" -ne 0
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select desired_state from bot_instances where id='$INSTANCE';")" "STOPPED"

psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 <<SQL >/dev/null
update system_maintenance set status='OFF',title=null,message=null,maintenance_at=null,force_close_at=null,expected_resume_at=null,updated_at=now() where id=1;
SQL

echo '[regression] only EA-originated CLOSE_ALL ACKs are trusted for stale-position reconciliation'
grep -q "bc.payload->>'ackSource'='EA'" apps/api/src/maintenance.service.ts
grep -q "jsonb_build_object('ackSource','EA')" apps/api/src/ea.controller.ts

echo '[regression] Partner own entitlement is honored by both recovery paths'
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/manual-mt5.controller.ts
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/agent-action.controller.ts
grep -q 'this.maintenance.assertStartAllowed' apps/api/src/manual-mt5.controller.ts

echo '[regression] PASS'
