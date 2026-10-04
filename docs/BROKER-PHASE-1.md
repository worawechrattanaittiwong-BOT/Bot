# Broker Center — Phase 1

Phase 1 adds an isolated Broker Center for Exness partner onboarding without changing
SCENOVA trading execution, Cloud/Local MT5, EA runtime, Trial, Subscription,
SCENOVA Partner Seats, or Invite & Earn.

## Included

- One new **Broker** menu item for customers and Owner/Admin.
- New `/broker` page.
- Exness broker card with:
  - existing MT5 shortcut
  - partner-registration button
  - existing Exness MT5 summary
- Owner/Admin settings on the same Broker page:
  - Partner Code
  - Web Partner Link
  - Mobile Partner Link
  - Active/Disabled switch
- Registration click logging.
- Partner links are stored server-side and are not hard-coded in the frontend.

## Explicitly not included in Phase 1

- Partner attribution / verification
- 10% / 20% / 30% SCENOVA partner benefits
- IB commission import
- Rebate calculation or wallet
- Exness Partnership API automation

Those remain disabled until Phases 2–4.

## Isolation rule

Broker Center is not in the trading hot path. If Broker Center is unavailable,
existing Bot, EA, Cloud, Local, Safe Stop, Trial, Subscription, and open-position
management must continue to operate normally.

## Database

Canonical migration: `database/061_broker_partner_center.sql`.

The Broker service also performs the same schema creation idempotently on first use
so a branch deployment can be tested safely before the migration is promoted.
