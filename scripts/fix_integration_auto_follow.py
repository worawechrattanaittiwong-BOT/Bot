from pathlib import Path

path = Path('.github/workflows/integration-smoke.yml')
text = path.read_text(encoding='utf-8')
start_marker = '          echo "[integration] rebind succeeds after old MT5 reports flat"\n'
end_marker = '          TRIAL_COUNT=$(PGPASSWORD=bot psql'

if start_marker not in text:
    # Already repaired is a valid no-op.
    repaired_marker = '          echo "[integration] automatic account-follow succeeds after old MT5 reports flat"\n'
    if repaired_marker in text:
        print('integration smoke already aligned')
        raise SystemExit(0)
    raise SystemExit('stale manual-rebind smoke block not found')

start = text.index(start_marker)
end = text.index(end_marker, start)
replacement = r'''          echo "[integration] automatic account-follow succeeds after old MT5 reports flat"
          OLD_FLAT=$(curl -fsS -X POST "$BASE/ea/heartbeat" -H 'content-type: application/json' -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$INSTALL_TOKEN\",\"state\":\"SAFE_STOP\",\"metrics\":{\"accountNumber\":\"100001\",\"eaVersion\":\"$EA_VERSION\",\"server\":\"SCENOVA-Demo\",\"positions\":0}}")
          DETECT_REAL=$(curl -fsS -X POST "$BASE/ea/heartbeat" -H 'content-type: application/json' -d "{\"instanceId\":\"$INSTANCE\",\"installToken\":\"$INSTALL_TOKEN\",\"state\":\"SAFE_STOP\",\"metrics\":{\"accountNumber\":\"200002\",\"eaVersion\":\"$EA_VERSION\",\"server\":\"SCENOVA-Real\",\"positions\":0}}")
          test "$(printf '%s' "$DETECT_REAL" | jq -r '.accountMismatch // false')" = "false"
          test "$(printf '%s' "$DETECT_REAL" | jq -r '.access')" = "false"
          test "$(printf '%s' "$DETECT_REAL" | jq -r '.desiredState')" = "SAFE_STOP"

          FOLLOW_DASH=$(curl -fsS "$BASE/bot/dashboard?slotId=$SLOT" -H "authorization: Bearer $TOKEN")
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.account.account_number')" = "200002"
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.account.broker_server')" = "SCENOVA-Real"
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.instance.pending_account_number // empty')" = ""

'''
path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')
print('integration smoke aligned with automatic LOCAL MT5 account follow')
