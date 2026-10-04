# Broker Center — Phase 2

Phase 2 adds manual Exness Partner verification and SCENOVA partner benefits.

## Included

- Exness Partner status per SCENOVA user:
  - PENDING
  - VERIFIED
  - NOT_LINKED
  - SUSPENDED
- Owner/Admin-only manual verification.
- Verification requires at least one connected Exness MT5 account.
- Benefit levels:
  - STANDARD = 10%
  - PLUS = 20%
  - VIP = 30%
- Automatic SCENOVA package discount for VERIFIED clients.
- Local and Cloud checkout use the better of:
  - Broker Partner Benefit
  - Promotion Code
- Discounts never stack.
- If both discounts are equal, Broker Partner Benefit wins so a promotion code is not consumed.
- Broker Benefit lookup is fail-open: if the new module is unavailable, normal checkout still works.

## Explicitly not included

- IB commission import
- Rebate accounting
- Rebate wallet
- Exness Partnership API sync

These remain Phase 3 and Phase 4.

## Isolation

Trading execution, EA, Cloud runtime, Local runtime, Start/Stop, Safe Stop,
existing subscriptions, SCENOVA Partner Seats, and Invite & Earn are unchanged.
Only package checkout receives an optional price adjustment before payment.
