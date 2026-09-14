from pathlib import Path

path = Path('.github/workflows/integration-smoke.yml')
text = path.read_text(encoding='utf-8')
start_marker = '          echo "[integration] rebind succeeds after old MT5 reports flat"\n'
end_marker = '          TRIAL_COUNT='
start = text.find(start_marker)
if start < 0:
    if '[integration] LOCAL account follows the new MT5 automatically after old account is flat' in text:
        print('integration smoke already patched')
        raise SystemExit(0)
    raise SystemExit('stale account-follow block not found')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('TRIAL_COUNT marker not found')
replacement = '''          echo "[integration] LOCAL account follows the new MT5 automatically after old account is flat"
          OLD_FLAT=$(curl -fsS -X POST "$BASE/ea/heartbeat" -H 'content-type: application/json' -d "{\\"instanceId\\":\\"$INSTANCE\\",\\"installToken\\":\\"$INSTALL_TOKEN\\",\\"state\\":\\"SAFE_STOP\\",\\"metrics\\":{\\"accountNumber\\":\\"100001\\",\\"eaVersion\\":\\"$EA_VERSION\\",\\"server\\":\\"SCENOVA-Demo\\",\\"positions\\":0}}")
          DETECT_REAL=$(curl -fsS -X POST "$BASE/ea/heartbeat" -H 'content-type: application/json' -d "{\\"instanceId\\":\\"$INSTANCE\\",\\"installToken\\":\\"$INSTALL_TOKEN\\",\\"state\\":\\"SAFE_STOP\\",\\"metrics\\":{\\"accountNumber\\":\\"200002\\",\\"eaVersion\\":\\"$EA_VERSION\\",\\"server\\":\\"SCENOVA-Real\\",\\"positions\\":0}}")
          test "$(printf '%s' "$DETECT_REAL" | jq -r '.accountMismatch // false')" = "false"
          test "$(printf '%s' "$DETECT_REAL" | jq -r '.accountChangeBlocked // false')" = "false"

          FOLLOW_DASH=$(curl -fsS "$BASE/bot/dashboard?slotId=$SLOT" -H "authorization: Bearer $TOKEN")
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.account.account_number')" = "200002"
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.account.broker_server')" = "SCENOVA-Real"
          test "$(printf '%s' "$FOLLOW_DASH" | jq -r '.instance.pending_account_number // empty')" = ""

'''
path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')
print('patched integration smoke account-follow block')
