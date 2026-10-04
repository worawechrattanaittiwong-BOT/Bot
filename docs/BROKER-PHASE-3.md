# Broker Center — Phase 3

Phase 3 adds manual IB commission accounting and an isolated Exness rebate ledger.

## Included

- Rebate policy per Phase 2 benefit level.
- Safe default rebate = 0% until Owner/Admin configures it.
- Manual confirmed commission entry while Exness Partnership API is not connected.
- Idempotency through unique `external_event_id`.
- Commission stores a fixed rebate-rate snapshot at creation time.
- Rebate lifecycle:
  - PENDING
  - AVAILABLE
  - PAID
  - REVERSED
- Separate append-only `broker_rebate_wallet_ledger`.
- Commission reversal is supported until a rebate is already PAID.
- Customer can see pending / available / paid rebate and recent activity.
- Owner/Admin can set policy, record commission, release rebate and mark a manual payout paid.

## Important separation

This ledger is **not** the existing Invite & Earn commission wallet.

- Invite & Earn: `commission_wallet_ledger`
- Broker rebate: `broker_rebate_wallet_ledger`

Funds, Exness deposits/withdrawals, trading credentials and KYC remain outside this feature.

## Phase 3 payout scope

Phase 3 records and reconciles manual payouts only. It does not create a second
automated withdrawal system. Automatic Exness sync / autorebate belongs to Phase 4.

## Rebate rule

Rebate is calculated only from a **CONFIRMED broker commission amount**.

```
rebate = floor(gross_commission_minor * rebate_bps / 10000)
```

Lot volume and symbol are reference fields only and never determine the payout amount.
