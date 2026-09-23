# SCENOVA Invite & Earn — Referral Program

## Purpose

The referral program rewards **eligible paid SCENOVA purchases**, not account creation by itself. It is separate from the Partner Seat program.

A sponsor relationship is attached once, when a new SCENOVA account is created with an invite code. There is no endpoint to move an existing account between sponsors.

## Four-level commission

| Network level | Relationship | Commission |
| --- | --- | ---: |
| Level 1 | Direct invite | 7% |
| Level 2 | Invite of Level 1 | 5% |
| Level 3 | Invite of Level 2 | 3% |
| Level 4 | Invite of Level 3 | 1% |

The maximum network allocation is **16% of an eligible recorded sale** when all four uplines exist and are active.

Example for a 1,000 THB eligible purchase: Level 1 = 70 THB, Level 2 = 50 THB, Level 3 = 30 THB, Level 4 = 10 THB; total network commission = 160 THB.

No commission is created merely because somebody registers, requests a trial, or receives an internal Partner Seat.

## Eligible sales

**Automatic — CLOUD_ORDER:** a successful PromptPay Cloud checkout uses the verified order amount in satang. Referral bookkeeping is isolated with a database savepoint so a referral error can never prevent a successfully paid customer from receiving Cloud access.

**Owner-recorded manual membership — MANUAL_SUBSCRIPTION:** when Owner activates a membership after receiving an offline/manual payment, Owner can enter the actual amount received in THB and an optional payment/slip/reference. If the amount is blank or zero, access is activated normally and no referral commission is created.

## Hold and payout

New commission entries start as `PENDING`. `REFERRAL_HOLD_DAYS` controls the review period and defaults to **7 days**. Matured entries become `AVAILABLE` when the beneficiary dashboard refreshes.

Statuses are `PENDING`, `AVAILABLE`, `PAID`, and `VOID`. Bank/PromptPay payout automation is intentionally not included in this release; the ledger already stores payout status/reference fields for a later verified payout workflow.

## Sponsor and anti-abuse rules

- A user cannot sponsor themselves.
- Sponsor is set only at registration.
- Referral code must belong to an ACTIVE SCENOVA user.
- Referral relationships are independent from MT5, broker, device, subscription slot, and Partner Seat.
- Only an actual recorded paid amount creates money commission.
- Commission creation is idempotent per source, beneficiary and level.
- Cycles are guarded in database constraints and commission traversal.
- Inactive sponsors do not receive new commission.
- Trials and free/internal grants never create commission.

Before enabling public cash payouts, SCENOVA should review applicable affiliate/direct-selling, tax, KYC and payout-reporting requirements for each market where the program is offered.

## Customer UI

Sidebar: **My Account** and **Invite & Earn**. Invite & Earn shows the invite code/share link, Level 1–4 percentages, network counts, Pending/Available/Paid/Lifetime earnings, recent members, recent commission activity, sponsor User ID, and program rules.

Registration accepts an optional Invite Code. Shared links use `/login?mode=register&ref=<REFERRAL_CODE>`.

## Database

`database/024_referral_program.sql` adds `referral_code`, `referred_by_user_id`, `referred_at`, and the `referral_commissions` ledger. Existing users are backfilled with a stable referral code derived from their unique SCENOVA User ID.

## Future extensions

- verified PromptPay/bank payout profiles
- payout batches and statements
- minimum payout thresholds
- tax/KYC status
- refund/chargeback webhook voiding
- Owner referral analytics and fraud flags
- campaign-specific bonus rates without changing the core four-level tree
