#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:4000/api}"
ADMIN_KEY="${ADMIN_KEY:-integration-admin}"

register_user() {
  local email="$1"
  curl -fsS -X POST "$BASE/auth/register" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Integration123!\"}"
}

dashboard() {
  local token="$1"
  curl -fsS "$BASE/bot/dashboard" -H "authorization: Bearer $token"
}

PARTNER_REG=$(register_user 'partner-v3@scenova.test')
PARTNER_TOKEN=$(printf '%s' "$PARTNER_REG" | jq -r '.token')
PARTNER_DASH=$(dashboard "$PARTNER_TOKEN")
PARTNER_ID=$(printf '%s' "$PARTNER_DASH" | jq -r '.user.id')
PARTNER_CODE=$(printf '%s' "$PARTNER_DASH" | jq -r '.user.user_code')
test -n "$PARTNER_ID"
test -n "$PARTNER_CODE"
CUSTOMER1_REG=$(register_user 'partner-customer1@scenova.test')
CUSTOMER1_TOKEN=$(printf '%s' "$CUSTOMER1_REG" | jq -r '.token')
CUSTOMER1_DASH=$(dashboard "$CUSTOMER1_TOKEN")
CUSTOMER1_ID=$(printf '%s' "$CUSTOMER1_DASH" | jq -r '.user.id')
CUSTOMER1_CODE=$(printf '%s' "$CUSTOMER1_DASH" | jq -r '.user.user_code')

CUSTOMER2_REG=$(register_user 'partner-customer2@scenova.test')
CUSTOMER2_TOKEN=$(printf '%s' "$CUSTOMER2_REG" | jq -r '.token')
CUSTOMER2_DASH=$(dashboard "$CUSTOMER2_TOKEN")
CUSTOMER2_ID=$(printf '%s' "$CUSTOMER2_DASH" | jq -r '.user.id')
CUSTOMER2_CODE=$(printf '%s' "$CUSTOMER2_DASH" | jq -r '.user.user_code')

echo '[partner-v3] grant starts immediately and includes own LOCAL EA'
GRANT=$(curl -fsS -X POST "$BASE/admin/partners/grant" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$PARTNER_ID\",\"seatLimit\":10,\"partnerDurationDays\":30,\"customerDurationDays\":30}")
test "$(printf '%s' "$GRANT" | jq -r '.account.status')" = 'ACTIVE'
test "$(printf '%s' "$GRANT" | jq -r '.account.ownTradingIncluded')" = 'true'
test "$(printf '%s' "$GRANT" | jq -r '.account.usedSeats')" = '0'
test "$(printf '%s' "$GRANT" | jq -r '.account.expires_at == null')" = 'false'

echo '[partner-v3] only approved 10/25/50 seat tiers are accepted'
INVALID_SEATS_HTTP=$(curl -sS -o /tmp/partner-invalid-seats.json -w '%{http_code}' \
  -X POST "$BASE/admin/partners/grant" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$PARTNER_ID\",\"seatLimit\":11,\"partnerDurationDays\":30,\"customerDurationDays\":30}")
test "$INVALID_SEATS_HTTP" = '409'

PARTNER_DASH_AFTER=$(dashboard "$PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_DASH_AFTER" | jq -r '.entitlement.allowed')" = 'true'
test "$(printf '%s' "$PARTNER_DASH_AFTER" | jq -r '.entitlement.source')" = 'PARTNER'
echo '[partner-v3] customer memberships have independent full duration'
ACT1=$(curl -fsS -X POST "$BASE/partner/customers/activate" \
  -H "authorization: Bearer $PARTNER_TOKEN" -H 'content-type: application/json' \
  -d "{\"target\":\"$CUSTOMER1_CODE\"}")
ACT2=$(curl -fsS -X POST "$BASE/partner/customers/activate" \
  -H "authorization: Bearer $PARTNER_TOKEN" -H 'content-type: application/json' \
  -d "{\"target\":\"$CUSTOMER2_CODE\"}")
test "$(printf '%s' "$ACT2" | jq -r '.account.usedSeats')" = '2'

CUSTOMER1_ACCESS=$(dashboard "$CUSTOMER1_TOKEN")
CUSTOMER2_ACCESS=$(dashboard "$CUSTOMER2_TOKEN")
test "$(printf '%s' "$CUSTOMER1_ACCESS" | jq -r '.entitlement.allowed')" = 'true'
test "$(printf '%s' "$CUSTOMER2_ACCESS" | jq -r '.entitlement.allowed')" = 'true'

CUSTOMER3_REG=$(register_user 'partner-customer3@scenova.test')
CUSTOMER3_TOKEN=$(printf '%s' "$CUSTOMER3_REG" | jq -r '.token')
CUSTOMER3_DASH=$(dashboard "$CUSTOMER3_TOKEN")
CUSTOMER3_CODE=$(printf '%s' "$CUSTOMER3_DASH" | jq -r '.user.user_code')

echo '[partner-v3] downgrade never cuts active customers'
REDUCE=$(curl -fsS -X POST "$BASE/admin/partners/grant" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$PARTNER_ID\",\"seatLimit\":1,\"partnerDurationDays\":30,\"customerDurationDays\":30}")
test "$(printf '%s' "$REDUCE" | jq -r '.account.seat_limit')" = '1'
test "$(printf '%s' "$REDUCE" | jq -r '.account.usedSeats')" = '2'
test "$(printf '%s' "$REDUCE" | jq -r '.account.availableSeats')" = '0'
THIRD_HTTP=$(curl -sS -o /tmp/partner-third.json -w '%{http_code}' \
  -X POST "$BASE/partner/customers/activate" \
  -H "authorization: Bearer $PARTNER_TOKEN" -H 'content-type: application/json' \
  -d "{\"target\":\"$CUSTOMER3_CODE\"}")
test "$THIRD_HTTP" = '409'

echo '[partner-v3] direct renewal preserves remaining time and frees Partner Seat'
OLD_EXP=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select expires_at from partner_customers where customer_user_id='$CUSTOMER1_ID' and status='ACTIVE' order by created_at desc limit 1;")
DIRECT=$(curl -fsS -X POST "$BASE/admin/subscriptions/activate" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$CUSTOMER1_ID\",\"planCode\":\"LOCAL_30D\",\"durationDays\":30,\"activatedBy\":\"CI-DIRECT\"}")
NEW_EXP=$(printf '%s' "$DIRECT" | jq -r '.subscription.expires_at')
test "$(date -d "$NEW_EXP" +%s)" -gt "$(date -d "$OLD_EXP" +%s)"
REL_STATUS=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select status from partner_customers where customer_user_id='$CUSTOMER1_ID' order by created_at desc limit 1;")
test "$REL_STATUS" = 'DIRECT'
PARTNER_AFTER_DIRECT=$(curl -fsS "$BASE/partner" -H "authorization: Bearer $PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_AFTER_DIRECT" | jq -r '.account.usedSeats')" = '1'

echo '[partner-v3] Partner expiry stops own entitlement but never cuts active customer'
PGPASSWORD=bot psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 \
  -c "update partner_accounts set expires_at=now()-interval '1 second' where user_id='$PARTNER_ID';" >/dev/null
EXPIRED_STATE=$(curl -fsS "$BASE/partner" -H "authorization: Bearer $PARTNER_TOKEN")
test "$(printf '%s' "$EXPIRED_STATE" | jq -r '.account.status')" = 'EXPIRED'
test "$(printf '%s' "$EXPIRED_STATE" | jq -r '.account.canManage')" = 'false'

PARTNER_ACCESS_EXPIRED=$(dashboard "$PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_ACCESS_EXPIRED" | jq -r '.entitlement.allowed')" = 'false'

CUSTOMER2_STILL_ACTIVE=$(dashboard "$CUSTOMER2_TOKEN")
test "$(printf '%s' "$CUSTOMER2_STILL_ACTIVE" | jq -r '.entitlement.allowed')" = 'true'
test "$(printf '%s' "$CUSTOMER2_STILL_ACTIVE" | jq -r '.entitlement.source')" = 'SUBSCRIPTION'

echo '[partner-v3] PASS'
